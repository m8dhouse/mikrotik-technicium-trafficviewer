import type { NextRequest } from "next/server";
import { capturePcap, getCapture } from "@/lib/capture";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/capture/[id]/pcap">) {
  const { id } = await ctx.params;
  const pcap = capturePcap(id);
  const status = getCapture(id);
  if (!pcap || !status.success) return Response.json({ success: false, error: "Capture not found" }, { status: 404 });

  const stamp = new Date(status.data.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new Response(new Uint8Array(pcap), {
    headers: {
      "Content-Type": "application/vnd.tcpdump.pcap",
      "Content-Disposition": `attachment; filename="capture-${status.data.ip}-${stamp}.pcap"`,
    },
  });
}
