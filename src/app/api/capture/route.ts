import { startCapture } from "@/lib/capture";
import { rejectCrossSite } from "@/lib/guard";
import { isIPv4 } from "@/lib/ip";
import { isPrivate } from "@/lib/snapshot";

export async function POST(request: Request) {
  const denied = rejectCrossSite(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { ip?: unknown; peer?: unknown; port?: unknown; seconds?: unknown } | null;

  const ip = typeof body?.ip === "string" ? body.ip : "";
  const peer = typeof body?.peer === "string" ? body.peer : "";
  const port = Number(body?.port ?? 0);
  const seconds = Number(body?.seconds ?? 30);

  if (!isIPv4(ip) || !isPrivate(ip)) return Response.json({ success: false, error: "Device must be a LAN IPv4 address" }, { status: 400 });
  if (peer && !isIPv4(peer)) return Response.json({ success: false, error: "Invalid destination IP" }, { status: 400 });
  if (!Number.isInteger(port) || port < 0 || port > 65535) return Response.json({ success: false, error: "Invalid port" }, { status: 400 });
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120) {
    return Response.json({ success: false, error: "Duration must be 5–120 seconds" }, { status: 400 });
  }

  const result = await startCapture({ ip, peer, port, seconds });
  return Response.json(result, { status: result.success ? 200 : 502 });
}
