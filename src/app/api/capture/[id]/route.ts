import type { NextRequest } from "next/server";
import { getCapture, stopCapture } from "@/lib/capture";
import { rejectCrossSite } from "@/lib/guard";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/capture/[id]">) {
  const { id } = await ctx.params;
  const result = getCapture(id);
  return Response.json(result, { status: result.success ? 200 : 404 });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/capture/[id]">) {
  const denied = rejectCrossSite(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const result = await stopCapture(id);
  return Response.json(result, { status: result.success ? 200 : 404 });
}
