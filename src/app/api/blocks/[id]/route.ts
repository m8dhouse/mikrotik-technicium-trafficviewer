import type { NextRequest } from "next/server";
import { getConfig } from "@/lib/env";
import { removeBlock, setBlockDisabled, updateBlockComment } from "@/lib/firewall";
import { rejectCrossSite } from "@/lib/guard";

function validId(id: string): boolean {
  return /^\*[0-9A-F]+$/i.test(id);
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/blocks/[id]">) {
  const denied = rejectCrossSite(request);
  if (denied) return denied;

  const id = decodeURIComponent((await ctx.params).id);
  if (!validId(id)) return Response.json({ success: false, error: "Invalid rule id" }, { status: 400 });

  const config = getConfig();
  if (!config.success) return Response.json(config, { status: 500 });

  const body = (await request.json().catch(() => null)) as { disabled?: unknown; comment?: unknown } | null;
  if (typeof body?.disabled === "boolean") {
    const result = await setBlockDisabled(config.config, id, body.disabled);
    if (!result.success) return Response.json(result, { status: 502 });
  }
  if (typeof body?.comment === "string") {
    const comment = body.comment.replace(/[\r\n"\\]/g, " ").trim().slice(0, 200);
    const result = await updateBlockComment(config.config, id, comment);
    if (!result.success) return Response.json(result, { status: 502 });
  }
  return Response.json({ success: true, data: null });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/blocks/[id]">) {
  const denied = rejectCrossSite(request);
  if (denied) return denied;

  const id = decodeURIComponent((await ctx.params).id);
  if (!validId(id)) return Response.json({ success: false, error: "Invalid rule id" }, { status: 400 });

  const config = getConfig();
  if (!config.success) return Response.json(config, { status: 500 });

  const result = await removeBlock(config.config, id);
  return Response.json(result, { status: result.success ? 200 : 502 });
}
