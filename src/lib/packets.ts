import type { CapturedPacket } from "./types";

const TCP_FLAGS = ["FIN", "SYN", "RST", "PSH", "ACK", "URG"];

export function unwrapTzsp(message: Buffer): Buffer | null {
  if (message.length < 5 || message[0] !== 1) return null;
  if (message.readUInt16BE(2) !== 1) return null;

  let offset = 4;
  while (offset < message.length) {
    const tag = message[offset];
    if (tag === 1) return message.subarray(offset + 1);
    if (tag === 0) {
      offset += 1;
      continue;
    }
    if (offset + 1 >= message.length) return null;
    offset += 2 + message[offset + 1];
  }
  return null;
}

function ipAt(buffer: Buffer, offset: number): string {
  return `${buffer[offset]}.${buffer[offset + 1]}.${buffer[offset + 2]}.${buffer[offset + 3]}`;
}

function tlsServerName(payload: Buffer): string {
  if (payload.length < 43 || payload[0] !== 0x16 || payload[5] !== 0x01) return "";
  let offset = 43;
  const skip = (lengthBytes: number) => {
    if (offset + lengthBytes > payload.length) return false;
    const length = lengthBytes === 1 ? payload[offset] : payload.readUInt16BE(offset);
    offset += lengthBytes + length;
    return offset <= payload.length;
  };
  if (!skip(1) || !skip(2) || !skip(1)) return "";
  if (offset + 2 > payload.length) return "";

  const end = Math.min(payload.length, offset + 2 + payload.readUInt16BE(offset));
  offset += 2;
  while (offset + 4 <= end) {
    const type = payload.readUInt16BE(offset);
    const length = payload.readUInt16BE(offset + 2);
    if (type === 0 && offset + 9 <= end) {
      const nameLength = payload.readUInt16BE(offset + 7);
      return payload.subarray(offset + 9, Math.min(end, offset + 9 + nameLength)).toString("ascii");
    }
    offset += 4 + length;
  }
  return "";
}

function dnsQuestion(payload: Buffer): string {
  if (payload.length < 13) return "";
  const isResponse = (payload[2] & 0x80) !== 0;
  const labels: string[] = [];
  let offset = 12;
  while (offset < payload.length && payload[offset] !== 0 && labels.length < 20) {
    const length = payload[offset];
    if (length > 63) break;
    labels.push(payload.subarray(offset + 1, offset + 1 + length).toString("ascii"));
    offset += length + 1;
  }
  return labels.length ? `DNS ${isResponse ? "answer" : "query"} ${labels.join(".")}` : "";
}

function textPreview(payload: Buffer): string {
  const head = payload.subarray(0, 120).toString("latin1");
  if (/^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|HTTP\/1\.[01]) /.test(head)) return head.split("\r\n")[0];
  return "";
}

export function describeFrame(frame: Buffer, t: number, deviceIp: string): CapturedPacket | null {
  if (frame.length < 14) return null;
  let offset = 12;
  let etherType = frame.readUInt16BE(offset);
  while (etherType === 0x8100 && frame.length >= offset + 6) {
    offset += 4;
    etherType = frame.readUInt16BE(offset);
  }
  offset += 2;
  if (etherType !== 0x0800 || frame.length < offset + 20) return null;

  const ihl = (frame[offset] & 0x0f) * 4;
  const totalLength = frame.readUInt16BE(offset + 2);
  const protocolNumber = frame[offset + 9];
  const src = ipAt(frame, offset + 12);
  const dst = ipAt(frame, offset + 16);
  const l4 = offset + ihl;
  const ipEnd = Math.min(frame.length, offset + totalLength);
  const direction = src === deviceIp ? "out" : dst === deviceIp ? "in" : "other";

  const packet: CapturedPacket = { t, direction, protocol: "IP", src, dst, srcPort: 0, dstPort: 0, length: totalLength, flags: "", info: "" };

  if (protocolNumber === 6 && ipEnd >= l4 + 20) {
    packet.protocol = "TCP";
    packet.srcPort = frame.readUInt16BE(l4);
    packet.dstPort = frame.readUInt16BE(l4 + 2);
    const flagBits = frame[l4 + 13];
    packet.flags = TCP_FLAGS.filter((_, index) => flagBits & (1 << index)).join(" ");
    const payload = frame.subarray(l4 + (frame[l4 + 12] >> 4) * 4, ipEnd);
    const sni = tlsServerName(payload);
    packet.info = sni ? `TLS hello → ${sni}` : textPreview(payload) || (payload.length ? `${payload.length} B data` : "");
  } else if (protocolNumber === 17 && ipEnd >= l4 + 8) {
    packet.protocol = "UDP";
    packet.srcPort = frame.readUInt16BE(l4);
    packet.dstPort = frame.readUInt16BE(l4 + 2);
    const payload = frame.subarray(l4 + 8, ipEnd);
    if (packet.srcPort === 53 || packet.dstPort === 53) packet.info = dnsQuestion(payload);
    else if (packet.srcPort === 443 || packet.dstPort === 443) packet.info = `QUIC ${payload.length} B`;
    else packet.info = `${payload.length} B data`;
  } else if (protocolNumber === 1) {
    packet.protocol = "ICMP";
    packet.info = ipEnd > l4 ? `type ${frame[l4]}` : "";
  } else {
    packet.protocol = `IP proto ${protocolNumber}`;
  }

  return packet;
}

export function toPcap(frames: { t: number; frame: Buffer }[]): Buffer {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(0xa1b2c3d4, 0);
  header.writeUInt16LE(2, 4);
  header.writeUInt16LE(4, 6);
  header.writeUInt32LE(65535, 16);
  header.writeUInt32LE(1, 20);

  const parts: Buffer[] = [header];
  for (const { t, frame } of frames) {
    const record = Buffer.alloc(16);
    record.writeUInt32LE(Math.floor(t / 1000), 0);
    record.writeUInt32LE(Math.round((t % 1000) * 1000), 4);
    record.writeUInt32LE(frame.length, 8);
    record.writeUInt32LE(frame.length, 12);
    parts.push(record, frame);
  }
  return Buffer.concat(parts);
}
