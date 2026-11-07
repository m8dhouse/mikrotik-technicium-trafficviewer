import "server-only";
import { createSocket, type Socket } from "node:dgram";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { getConfig, type Config } from "./env";
import { routerCommand } from "./mikrotik";
import { describeFrame, toPcap, unwrapTzsp } from "./packets";
import type { CapturedPacket, CaptureStatus } from "./types";
import type { Result } from "./http";

const PORT = 37008;
const MAX_PACKETS = 50_000;
const MAX_BYTES = 100 * 1024 * 1024;
const SHOWN_PACKETS = 2000;

type Capture = Omit<CaptureStatus, "packets"> & {
  frames: { t: number; frame: Buffer }[];
  packets: CapturedPacket[];
  timer?: NodeJS.Timeout;
};

type State = { socket: Socket | null; routerIp: string; current: Capture | null };
const holder = globalThis as unknown as { __capture?: State };
const state: State = (holder.__capture ??= { socket: null, routerIp: "", current: null });

function localAddressFor(routerIp: string): string {
  const prefix = routerIp.split(".").slice(0, 3).join(".") + ".";
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal && address.address.startsWith(prefix)) return address.address;
    }
  }
  return "";
}

function onMessage(message: Buffer, remote: { address: string }) {
  const capture = state.current;
  if (!capture || capture.state !== "running" || remote.address !== state.routerIp) return;
  if (capture.packetCount >= MAX_PACKETS || capture.bytes >= MAX_BYTES) return;

  const frame = unwrapTzsp(message);
  if (!frame) return;

  const t = Date.now();
  const packet = describeFrame(frame, t, capture.ip);
  if (!packet) return;
  if (capture.peer && packet.src !== capture.peer && packet.dst !== capture.peer) return;
  if (capture.port && packet.srcPort !== capture.port && packet.dstPort !== capture.port) return;

  capture.frames.push({ t, frame: Buffer.from(frame) });
  capture.packetCount++;
  capture.bytes += frame.length;
  capture.packets.push(packet);
  if (capture.packets.length > SHOWN_PACKETS) capture.packets.shift();
}

async function ensureSocket(): Promise<Result<null>> {
  if (state.socket) return { success: true, data: null };

  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    socket.once("error", (error) => {
      socket.close();
      resolve({ success: false, error: `Cannot listen on UDP ${PORT}: ${error.message}` });
    });
    socket.on("message", onMessage);
    socket.bind(PORT, "0.0.0.0", () => {
      state.socket = socket;
      resolve({ success: true, data: null });
    });
  });
}

async function stopRouter(config: Config) {
  await routerCommand(config, "/tool/sniffer/stop");
  await routerCommand(config, "/tool/sniffer/set", { "streaming-enabled": "no" });
}

async function finish(error?: string) {
  const capture = state.current;
  if (!capture || capture.state !== "running") return;
  clearTimeout(capture.timer);
  const config = getConfig();
  if (config.success) await stopRouter(config.config);
  capture.state = error ? "failed" : "done";
  if (error) capture.error = error;
}

export async function startCapture(options: { ip: string; peer: string; port: number; seconds: number }): Promise<Result<CaptureStatus>> {
  if (state.current?.state === "running") return { success: false, error: "A capture is already running" };

  const config = getConfig();
  if (!config.success) return config;

  state.routerIp = new URL(config.config.mikrotikUrl).hostname;
  const listenAddress = localAddressFor(state.routerIp);
  if (!listenAddress) return { success: false, error: `This computer has no address in the router's network (${state.routerIp})` };

  const socket = await ensureSocket();
  if (!socket.success) return socket;

  const set = await routerCommand(config.config, "/tool/sniffer/set", {
    "file-name": "",
    "filter-interface": "bridge",
    "filter-ip-address": `${options.ip}/32`,
    "filter-port": options.port ? String(options.port) : "",
    "filter-stream": "yes",
    "only-headers": "no",
    "streaming-enabled": "yes",
    "streaming-server": `${listenAddress}:${PORT}`,
  });
  if (!set.success) {
    const hint = set.error.includes("permission") ? " — the router user needs the write policy for captures" : "";
    return { success: false, error: `Router refused the sniffer settings: ${set.error}${hint}` };
  }

  const now = Date.now();
  const capture: Capture = {
    id: randomUUID(),
    ip: options.ip,
    peer: options.peer,
    port: options.port,
    seconds: options.seconds,
    startedAt: now,
    endsAt: now + options.seconds * 1000,
    state: "running",
    packetCount: 0,
    bytes: 0,
    frames: [],
    packets: [],
  };
  state.current = capture;

  const start = await routerCommand(config.config, "/tool/sniffer/start");
  if (!start.success) {
    capture.state = "failed";
    capture.error = `Router refused to start the sniffer: ${start.error}`;
    await routerCommand(config.config, "/tool/sniffer/set", { "streaming-enabled": "no" });
    return { success: false, error: capture.error };
  }

  capture.timer = setTimeout(() => void finish(), options.seconds * 1000);
  return { success: true, data: view(capture) };
}

export async function stopCapture(id: string): Promise<Result<CaptureStatus>> {
  const capture = state.current;
  if (!capture || capture.id !== id) return { success: false, error: "Capture not found" };
  await finish();
  return { success: true, data: view(capture) };
}

export function getCapture(id: string): Result<CaptureStatus> {
  const capture = state.current;
  if (!capture || capture.id !== id) return { success: false, error: "Capture not found" };
  return { success: true, data: view(capture) };
}

export function capturePcap(id: string): Buffer | null {
  const capture = state.current;
  if (!capture || capture.id !== id) return null;
  return toPcap(capture.frames);
}

function view(capture: Capture): CaptureStatus {
  return {
    id: capture.id,
    ip: capture.ip,
    peer: capture.peer,
    port: capture.port,
    seconds: capture.seconds,
    startedAt: capture.startedAt,
    endsAt: capture.endsAt,
    state: capture.state,
    error: capture.error,
    packetCount: capture.packetCount,
    bytes: capture.bytes,
    packets: capture.packets,
  };
}
