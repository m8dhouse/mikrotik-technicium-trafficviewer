import type { NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { isIPv4 } from "@/lib/ip";
import { getDeviceFromSnapshot, getSnapshot } from "@/lib/snapshot";
import { getClientQueries } from "@/lib/technitium";
import type { DeviceResponse } from "@/lib/types";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/device/[ip]">) {
  const { ip } = await ctx.params;
  if (!isIPv4(ip)) return Response.json({ success: false, error: "Invalid IP address" }, { status: 400 });

  const config = getConfig();
  if (!config.success) return Response.json(config, { status: 500 });

  try {
    const [snapshot, queries] = await Promise.all([getSnapshot(), getClientQueries(config.config, ip)]);
    if (!snapshot.success) return Response.json(snapshot, { status: 502 });

    const { device, history } = getDeviceFromSnapshot(snapshot.data, ip);
    const body: DeviceResponse = {
      success: true,
      data: {
        takenAt: snapshot.data.takenAt,
        device,
        history,
        dns: queries.success ? { ok: true, queries: queries.data } : { ok: false, error: queries.error, queries: [] },
        sources: snapshot.data.sources,
      },
    };
    return Response.json(body);
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
