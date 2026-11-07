import { reverse } from "node:dns/promises";
import type { NextRequest } from "next/server";
import { lookupGeo } from "@/lib/geo";
import { isIPv4 } from "@/lib/ip";
import { knownDomainsFor } from "@/lib/snapshot";
import type { LookupResponse } from "@/lib/types";

const reverseCache = globalThis as unknown as { __reverse?: Map<string, { names: string[]; at: number }> };
const cache = (reverseCache.__reverse ??= new Map());

async function reverseDns(ip: string): Promise<string[]> {
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.names;

  const names = await Promise.race([
    reverse(ip).catch(() => [] as string[]),
    new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 3000)),
  ]);
  cache.set(ip, { names, at: Date.now() });
  return names;
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/lookup/[ip]">) {
  const { ip } = await ctx.params;
  if (!isIPv4(ip)) return Response.json({ success: false, error: "Invalid IP address" }, { status: 400 });

  const [reverseNames, geo] = await Promise.all([reverseDns(ip), lookupGeo(ip)]);
  const body: LookupResponse = {
    success: true,
    data: { ip, reverseDns: reverseNames, geo, domains: knownDomainsFor(ip) },
  };
  return Response.json(body);
}
