import { createWriteStream } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "geo");
const DATABASES = ["country", "city", "asn"];

function months() {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const format = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return [format(now), format(previous)];
}

async function download(kind) {
  for (const month of months()) {
    const url = `https://download.db-ip.com/free/dbip-${kind}-lite-${month}.mmdb.gz`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
        if (response.status === 404) break;
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

        const target = path.join(DIR, `dbip-${kind}-lite.mmdb`);
        const temp = `${target}.tmp`;
        await pipeline(Readable.fromWeb(response.body), createGunzip(), createWriteStream(temp));
        await rename(temp, target);
        console.log(`✓ ${kind} (${month})`);
        return;
      } catch (error) {
        console.warn(`  ${kind} ${month} attempt ${attempt + 1} failed: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
  }
  throw new Error(`Could not download the ${kind} database`);
}

const CLOUD_RANGES = [{ name: "Google Cloud", url: "https://www.gstatic.com/ipranges/cloud.json", file: "google-cloud.json" }];

async function downloadRanges({ name, url, file }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body.prefixes)) throw new Error("no prefixes in the file");

      const target = path.join(DIR, file);
      await writeFile(`${target}.tmp`, JSON.stringify(body));
      await rename(`${target}.tmp`, target);
      console.log(`✓ ${name} ranges (${body.prefixes.length} prefixes, published ${body.creationTime ?? "?"})`);
      return;
    } catch (error) {
      console.warn(`  ${name} attempt ${attempt + 1} failed: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  console.warn(`! Could not download the ${name} ranges; locations fall back to DB-IP`);
}

await mkdir(DIR, { recursive: true });
for (const kind of DATABASES) await download(kind);
for (const source of CLOUD_RANGES) await downloadRanges(source);
console.log("IP geolocation by DB-IP.com (CC BY 4.0)");
