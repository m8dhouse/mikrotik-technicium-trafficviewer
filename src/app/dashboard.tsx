"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Chart, Stat, Status } from "@/components/chart";
import { flag, formatBytes, formatRate } from "@/components/format";
import { usePolling, useStoredState } from "@/components/use-polling";
import type { DeviceView, Snapshot } from "@/lib/types";

const POLL_MS = 3000;

type SortKey = "name" | "ip" | "total" | "speed";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "ip", label: "IP address" },
  { key: "total", label: "Total traffic" },
  { key: "speed", label: "Current speed (moves)" },
];

function ipValue(ip: string): number {
  return ip.split(".").reduce((sum, part) => sum * 256 + Number(part), 0);
}

function compare(sort: SortKey) {
  return (a: DeviceView, b: DeviceView) => {
    if (sort === "ip") return ipValue(a.ip) - ipValue(b.ip);
    if (sort === "total") return b.bytesDown + b.bytesUp - (a.bytesDown + a.bytesUp);
    if (sort === "speed") return b.rateDown + b.rateUp - (a.rateDown + a.rateUp);
    return a.name.localeCompare(b.name, "en", { numeric: true });
  };
}

function topCountries(device: DeviceView): string {
  const seen = new Map<string, number>();
  for (const flow of device.flows) {
    if (flow.countryCode) seen.set(flow.countryCode, (seen.get(flow.countryCode) ?? 0) + flow.bytesDown + flow.bytesUp);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code]) => flag(code))
    .join(" ");
}

function DeviceRow({ device }: { device: DeviceView }) {
  return (
    <li>
      <Link
        href={`/device/${device.ip}`}
        className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-sky-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-sky-700"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{device.name}</span>
          <span className="block font-mono text-xs text-zinc-500">
            {device.ip}
            {device.mac ? ` · ${device.mac}` : ""}
          </span>
        </span>
        <span className="hidden w-32 truncate text-right text-sm md:block" title="Countries by traffic">
          {topCountries(device)}
        </span>
        <span className="hidden w-28 text-right text-sm text-zinc-500 sm:block">{device.flows.length} connections</span>
        <span className="hidden w-24 text-right font-mono text-xs text-zinc-500 lg:block">{formatBytes(device.bytesDown + device.bytesUp)}</span>
        <span className="w-28 text-right font-mono text-sm text-sky-600 dark:text-sky-400">↓ {formatRate(device.rateDown)}</span>
        <span className="w-28 text-right font-mono text-sm text-amber-600 dark:text-amber-400">↑ {formatRate(device.rateUp)}</span>
        <span className="text-zinc-400">›</span>
      </Link>
    </li>
  );
}

export default function Dashboard() {
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useStoredState<SortKey>("device-sort", "name");
  const { data: snapshot, error } = usePolling<Snapshot>("/api/snapshot", POLL_MS, paused);

  const devices = useMemo(() => {
    if (!snapshot) return [];
    const needle = filter.trim().toLowerCase();
    const matches = needle
      ? snapshot.devices.filter((device) =>
          [device.name, device.ip, device.mac, ...device.flows.flatMap((flow) => [flow.domain, flow.dstAddress, flow.label, flow.org, flow.country])]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        )
      : snapshot.devices;
    return [...matches].sort(compare(sort));
  }, [snapshot, filter, sort]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Outbound traffic</h1>
          <p className="text-sm text-zinc-500">
            Devices on your LAN talking to the internet · refreshes every {POLL_MS / 1000}s
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {snapshot && (
            <>
              <Status label="MikroTik" ok={snapshot.sources.mikrotik.ok} error={snapshot.sources.mikrotik.error} />
              <Status label="Technitium" ok={snapshot.sources.technitium.ok} error={snapshot.sources.technitium.error} />
              <Status label="Geo" ok={snapshot.sources.geo.ok} error={snapshot.sources.geo.error} />
            </>
          )}
          <Link href="/blocked" className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">
            Blocked
          </Link>
          <button onClick={() => setPaused((value) => !value)} className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {snapshot && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Download" value={formatRate(snapshot.totals.rateDown)} className="text-sky-600 dark:text-sky-400" />
            <Stat label="Upload" value={formatRate(snapshot.totals.rateUp)} className="text-amber-600 dark:text-amber-400" />
            <Stat label="Active devices" value={String(snapshot.totals.devices)} />
            <Stat label="Connections" value={String(snapshot.totals.flows)} />
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 flex gap-4 text-xs text-zinc-500">
              <span>Last 15 minutes</span>
              <span className="text-sky-600 dark:text-sky-400">● download</span>
              <span className="text-amber-600 dark:text-amber-400">● upload</span>
            </div>
            <Chart points={snapshot.history} />
          </section>

          <div className="flex flex-wrap gap-3">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter by device, domain, IP, protocol, country or provider…"
              className="min-w-64 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <label className="flex items-center gap-2 text-sm text-zinc-500">
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {SORTS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ul className="space-y-2">
            {devices.map((device) => (
              <DeviceRow key={device.ip} device={device} />
            ))}
            {devices.length === 0 && <li className="py-8 text-center text-sm text-zinc-500">No outbound connections match.</li>}
          </ul>
        </>
      )}

      {!snapshot && !error && <p className="text-sm text-zinc-500">Loading…</p>}
    </main>
  );
}
