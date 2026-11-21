import "server-only";
import path from "node:path";
import maxmind, { type AsnResponse, type CityResponse, type Reader } from "maxmind";
import { lookupCloud } from "./cloud-ranges";
import type { GeoInfo } from "./types";

type Readers = { city: Reader<CityResponse> | null; asn: Reader<AsnResponse> | null; error?: string };

const holder = globalThis as unknown as { __geo?: Promise<Readers> };

async function openReaders(): Promise<Readers> {
  const dir = path.join(process.cwd(), "data", "geo");
  try {
    const [city, asn] = await Promise.all([
      maxmind.open<CityResponse>(path.join(dir, "dbip-city-lite.mmdb")),
      maxmind.open<AsnResponse>(path.join(dir, "dbip-asn-lite.mmdb")),
    ]);
    return { city, asn };
  } catch {
    return { city: null, asn: null, error: "Geo databases missing: run npm run geo:update" };
  }
}

export async function geoReady(): Promise<{ ok: boolean; error?: string }> {
  const readers = await (holder.__geo ??= openReaders());
  return readers.error ? { ok: false, error: readers.error } : { ok: true };
}

export async function lookupGeo(ip: string): Promise<GeoInfo | null> {
  const readers = await (holder.__geo ??= openReaders());
  if (!readers.city || !maxmind.validate(ip)) return null;

  const city = readers.city.get(ip);
  const asn = readers.asn?.get(ip);
  const cloud = await lookupCloud(ip);
  if (!city && !asn && !cloud) return null;

  const base: GeoInfo = {
    countryCode: city?.country?.iso_code ?? "",
    country: city?.country?.names?.en ?? "",
    region: city?.subdivisions?.[0]?.names?.en ?? "",
    city: city?.city?.names?.en ?? "",
    latitude: city?.location?.latitude ?? null,
    longitude: city?.location?.longitude ?? null,
    asn: asn?.autonomous_system_number ?? null,
    org: asn?.autonomous_system_organization ?? "",
    source: "DB-IP",
    cloudRegion: "",
  };
  if (!cloud) return base;
  if (!cloud.countryCode) return { ...base, cloudRegion: cloud.region, source: `DB-IP (${cloud.provider} region ${cloud.region})` };

  const sameCountry = cloud.countryCode === base.countryCode;
  return {
    ...base,
    countryCode: cloud.countryCode,
    country: countryName(cloud.countryCode),
    region: sameCountry ? base.region : "",
    city: cloud.city,
    latitude: sameCountry ? base.latitude : null,
    longitude: sameCountry ? base.longitude : null,
    org: base.org || cloud.provider,
    source: `${cloud.provider} published ranges`,
    cloudRegion: cloud.region,
  };
}

const COUNTRY_NAMES = new Intl.DisplayNames(["en-GB"], { type: "region" });

function countryName(code: string): string {
  return COUNTRY_NAMES.of(code) ?? code;
}
