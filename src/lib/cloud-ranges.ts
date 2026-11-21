import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type CloudMatch = { provider: string; region: string; countryCode: string; city: string };

type Range = { start: number; end: number; scope: string };
type RangeSet = { provider: string; ranges: Range[] };

const GOOGLE_REGIONS: Record<string, [countryCode: string, city: string]> = {
  "africa-south1": ["ZA", "Johannesburg"],
  "asia-east1": ["TW", "Changhua County"],
  "asia-east2": ["HK", "Hong Kong"],
  "asia-northeast1": ["JP", "Tokyo"],
  "asia-northeast2": ["JP", "Osaka"],
  "asia-northeast3": ["KR", "Seoul"],
  "asia-south1": ["IN", "Mumbai"],
  "asia-south2": ["IN", "Delhi"],
  "asia-southeast1": ["SG", "Singapore"],
  "asia-southeast2": ["ID", "Jakarta"],
  "asia-southeast3": ["TH", "Bangkok"],
  "australia-southeast1": ["AU", "Sydney"],
  "australia-southeast2": ["AU", "Melbourne"],
  "europe-central2": ["PL", "Warsaw"],
  "europe-north1": ["FI", "Hamina"],
  "europe-north2": ["SE", "Stockholm"],
  "europe-southwest1": ["ES", "Madrid"],
  "europe-west1": ["BE", "Saint-Ghislain"],
  "europe-west2": ["GB", "London"],
  "europe-west3": ["DE", "Frankfurt"],
  "europe-west4": ["NL", "Eemshaven"],
  "europe-west6": ["CH", "Zurich"],
  "europe-west8": ["IT", "Milan"],
  "europe-west9": ["FR", "Paris"],
  "europe-west10": ["DE", "Berlin"],
  "europe-west12": ["IT", "Turin"],
  "me-central1": ["QA", "Doha"],
  "me-central2": ["SA", "Dammam"],
  "me-west1": ["IL", "Tel Aviv"],
  "northamerica-northeast1": ["CA", "Montréal"],
  "northamerica-northeast2": ["CA", "Toronto"],
  "northamerica-south1": ["MX", "Querétaro"],
  "southamerica-east1": ["BR", "São Paulo"],
  "southamerica-west1": ["CL", "Santiago"],
  "us-central1": ["US", "Council Bluffs, Iowa"],
  "us-east1": ["US", "Moncks Corner, South Carolina"],
  "us-east4": ["US", "Ashburn, Virginia"],
  "us-east5": ["US", "Columbus, Ohio"],
  "us-south1": ["US", "Dallas, Texas"],
  "us-west1": ["US", "The Dalles, Oregon"],
  "us-west2": ["US", "Los Angeles, California"],
  "us-west3": ["US", "Salt Lake City, Utah"],
  "us-west4": ["US", "Las Vegas, Nevada"],
};

const RELOAD_MS = 60 * 60_000;
const RETRY_MS = 60_000;

const holder = globalThis as unknown as { __cloudRanges?: { sets: Promise<RangeSet[]>; at: number; empty: boolean } };

function current(): Promise<RangeSet[]> {
  const cached = holder.__cloudRanges;
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached && age < (cached.empty ? RETRY_MS : RELOAD_MS)) return cached.sets;

  const entry = { sets: load(), at: Date.now(), empty: false };
  void entry.sets.then((sets) => (entry.empty = sets.length === 0));
  holder.__cloudRanges = entry;
  return entry.sets;
}

function toNumber(ip: string): number {
  return ip.split(".").reduce((total, part) => total * 256 + Number(part), 0);
}

async function loadGoogle(): Promise<RangeSet | null> {
  try {
    const file = await readFile(path.join(process.cwd(), "data", "geo", "google-cloud.json"), "utf8");
    const body = JSON.parse(file) as { prefixes?: { ipv4Prefix?: string; scope?: string }[] };
    const ranges = (body.prefixes ?? []).flatMap((prefix) => {
      if (!prefix.ipv4Prefix || !prefix.scope) return [];
      const [base, bits] = prefix.ipv4Prefix.split("/");
      const start = toNumber(base);
      return [{ start, end: start + 2 ** (32 - Number(bits)) - 1, scope: prefix.scope }];
    });
    return { provider: "Google Cloud", ranges };
  } catch {
    return null;
  }
}

async function load(): Promise<RangeSet[]> {
  const google = await loadGoogle();
  return google ? [google] : [];
}

export async function lookupCloud(ip: string): Promise<CloudMatch | null> {
  const sets = await current();
  const value = toNumber(ip);

  for (const set of sets) {
    let best: Range | null = null;
    for (const range of set.ranges) {
      if (value < range.start || value > range.end) continue;
      if (!best || range.end - range.start < best.end - best.start) best = range;
    }
    if (!best) continue;

    const place = GOOGLE_REGIONS[best.scope] ?? (best.scope.startsWith("us-") ? ["US", ""] : undefined);
    return { provider: set.provider, region: best.scope, countryCode: place?.[0] ?? "", city: place?.[1] ?? "" };
  }
  return null;
}
