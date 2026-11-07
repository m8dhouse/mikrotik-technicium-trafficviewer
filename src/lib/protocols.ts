const TCP: Record<number, string> = {
  22: "SSH",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  443: "HTTPS",
  465: "SMTPS",
  587: "SMTP",
  853: "DNS over TLS",
  993: "IMAPS",
  995: "POP3S",
  1883: "MQTT",
  3389: "RDP",
  5222: "XMPP",
  5223: "Apple Push",
  5228: "Google Push",
  8883: "MQTT (TLS)",
};

const UDP: Record<number, string> = {
  53: "DNS",
  123: "NTP",
  443: "QUIC",
  500: "IPsec",
  853: "DNS over QUIC",
  1194: "OpenVPN",
  3478: "STUN / WebRTC",
  4500: "IPsec NAT-T",
  5353: "mDNS",
  19302: "Google STUN",
  51820: "WireGuard",
};

export function labelFor(protocol: string, port: number): string {
  const table = protocol === "tcp" ? TCP : protocol === "udp" ? UDP : null;
  if (!table) return protocol.toUpperCase();
  return table[port] ?? `${protocol.toUpperCase()} ${port}`;
}
