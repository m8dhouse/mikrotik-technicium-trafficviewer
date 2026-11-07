import { getConfig } from "@/lib/env";
import { addBlock, listBlocks, type NewBlock } from "@/lib/firewall";
import { rejectCrossSite } from "@/lib/guard";
import { isIPv4 } from "@/lib/ip";

export async function GET() {
  const config = getConfig();
  if (!config.success) return Response.json(config, { status: 500 });
  const result = await listBlocks(config.config);
  return Response.json(result, { status: result.success ? 200 : 502 });
}

export async function POST(request: Request) {
  const denied = rejectCrossSite(request);
  if (denied) return denied;

  const config = getConfig();
  if (!config.success) return Response.json(config, { status: 500 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const device = typeof body?.device === "string" ? body.device : "";
  const destination = typeof body?.destination === "string" ? body.destination : "";
  const protocol = body?.protocol === "tcp" || body?.protocol === "udp" ? body.protocol : "";
  const port = Number(body?.port ?? 0);
  const action = body?.action === "drop" ? "drop" : "reject";
  const comment = typeof body?.comment === "string" ? body.comment.replace(/[\r\n"\\]/g, " ").trim().slice(0, 200) : "";

  if (!isIPv4(destination)) return Response.json({ success: false, error: "Destination must be an IPv4 address" }, { status: 400 });
  if (device && !isIPv4(device)) return Response.json({ success: false, error: "Invalid device IP" }, { status: 400 });
  if (!Number.isInteger(port) || port < 0 || port > 65535) return Response.json({ success: false, error: "Invalid port" }, { status: 400 });
  if (port && !protocol) return Response.json({ success: false, error: "Choose TCP or UDP when blocking a port" }, { status: 400 });

  const block: NewBlock = { device, destination, protocol, port, comment, action };
  const result = await addBlock(config.config, block);
  return Response.json(result, { status: result.success ? 200 : 502 });
}
