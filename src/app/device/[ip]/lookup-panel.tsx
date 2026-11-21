"use client";

import { useEffect, useState } from "react";
import { flag } from "@/components/format";
import type { IpLookup, LookupResponse } from "@/lib/types";

export function LookupPanel({ ip, onClose }: { ip: string; onClose: () => void }) {
  const [result, setResult] = useState<{ ip: string; data?: IpLookup; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lookup/${ip}`)
      .then((response) => response.json() as Promise<LookupResponse>)
      .then((body) => {
        if (!cancelled) setResult(body.success ? { ip, data: body.data } : { ip, error: body.error });
      })
      .catch(() => {
        if (!cancelled) setResult({ ip, error: "Lookup failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [ip]);

  const current = result?.ip === ip ? result : null;
  const data = current?.data;
  const geo = data?.geo;
  const links = [
    { label: "ipinfo.io", href: `https://ipinfo.io/${ip}` },
    { label: "AbuseIPDB", href: `https://www.abuseipdb.com/check/${ip}` },
    { label: "VirusTotal", href: `https://www.virustotal.com/gui/ip-address/${ip}` },
    { label: "Shodan", href: `https://www.shodan.io/host/${ip}` },
    ...(geo?.asn ? [{ label: `bgp.tools AS${geo.asn}`, href: `https://bgp.tools/as/${geo.asn}` }] : []),
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside onClick={(event) => event.stopPropagation()} className="h-full w-full max-w-md space-y-5 overflow-y-auto bg-white p-6 shadow-xl dark:bg-zinc-900">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">IP lookup</h2>
            <p className="font-mono text-sm text-zinc-500">{ip}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500">
            ✕
          </button>
        </div>

        {!current && <p className="text-sm text-zinc-500">Looking up…</p>}
        {current?.error && <p className="text-sm text-red-600">{current.error}</p>}

        {data && (
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs text-zinc-500 uppercase">Location</dt>
              <dd>{geo?.country ? `${flag(geo.countryCode)} ${[geo.city, geo.region, geo.country].filter(Boolean).join(", ")}` : "Unknown"}</dd>
              {geo && (
                <dd className="text-xs text-zinc-500">
                  Source: {geo.source}
                  {geo.cloudRegion && <span className="ml-1 rounded bg-zinc-100 px-1 font-mono dark:bg-zinc-800">{geo.cloudRegion}</span>}
                </dd>
              )}
              {geo?.latitude != null && geo.longitude != null && (
                <a
                  className="text-xs text-sky-600 hover:underline dark:text-sky-400"
                  href={`https://www.openstreetmap.org/?mlat=${geo.latitude}&mlon=${geo.longitude}#map=9/${geo.latitude}/${geo.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Show on map
                </a>
              )}
            </div>
            <div>
              <dt className="text-xs text-zinc-500 uppercase">Hosted by</dt>
              <dd>
                {geo?.org || "Unknown"}
                {geo?.asn ? <span className="font-mono text-xs text-zinc-500"> · AS{geo.asn}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 uppercase">Reverse DNS</dt>
              <dd className="font-mono text-xs break-all">{data.reverseDns.length ? data.reverseDns.join(", ") : "No PTR record"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500 uppercase">Domains seen pointing here</dt>
              <dd className="text-xs break-all">{data.domains.length ? data.domains.join(", ") : "None in the recent DNS log"}</dd>
            </div>
            <div>
              <dt className="mb-1 text-xs text-zinc-500 uppercase">Check elsewhere</dt>
              <dd className="flex flex-wrap gap-2">
                {links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-zinc-300 px-2 py-1 text-xs hover:border-sky-400 dark:border-zinc-700"
                  >
                    {link.label} ↗
                  </a>
                ))}
              </dd>
            </div>
            <p className="text-xs text-zinc-400">Location and provider: DB-IP.com Lite (CC BY 4.0), looked up locally.</p>
          </dl>
        )}
      </aside>
    </div>
  );
}
