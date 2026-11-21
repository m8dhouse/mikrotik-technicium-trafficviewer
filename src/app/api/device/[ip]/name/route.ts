import type { NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { rejectCrossSite } from "@/lib/guard";
import { isIPv4 } from "@/lib/ip";
import { saveDeviceName } from "@/lib/naming";
import { isPrivate, refreshNamesSoon } from "@/lib/snapshot";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/device/[ip]/name">) {
  const denied = rejectCrossSite(request);
  if (denied) return denied;

  const { ip } = await ctx.params;
  if (!isIPv4(ip) || !isPrivate(ip)) return Response.json({ success: false, error: "Device must be a LAN IPv4 address" }, { status: 400 });

  const config = getConfig();
  if (!config.success) return Response.json(config, { status: 500 });

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  if (typeof body?.name !== "string") return Response.json({ success: false, error: "Name is required" }, { status: 400 });
  const name = body.name.replace(/[\r\n"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64);

  const result = await saveDeviceName(config.config, ip, name);
  if (result.success) refreshNamesSoon();
  return Response.json(result, { status: result.success ? 200 : 502 });
}
