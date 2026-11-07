"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BlocksTable } from "@/components/blocks-table";
import { Chart, Stat, Status } from "@/components/chart";
import { flag, formatBytes, formatRate, formatTime } from "@/components/format";
import { usePolling, useStoredState } from "@/components/use-polling";
import type { DeviceDetail, FlowView } from "@/lib/types";
import { BlockDialog, type BlockTarget } from "./block-dialog";
import { CapturePanel, type CaptureTarget } from "./capture-panel";
import { LookupPanel } from "./lookup-panel";

const POLL_MS = 3000;

type Tab = "connections" | "dns" | "capture" | "blocks";
type SortKey = "destination" | "protocol" | "location" | "provider" | "down" | "up" | "now";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "protocol", label: "Protocol" },
  { key: "destination", label: "Destination" },
  { key: "location", label: "Location" },
  { key: "provider", label: "Hosted by" },
  { key: "down", label: "Down", align: "right" },
  { key: "up", label: "Up", align: "right" },
  { key: "now", label: "Now", align: "right" },
];

function sortValue(flow: FlowView, key: SortKey): string | number {
  if (key === "destination") return `${flow.domain || "~"} ${flow.dstAddress}`;
  if (key === "protocol") return flow.label;
  if (key === "location") return `${flow.country} ${flow.city}`;
  if (key === "provider") return flow.org;
  if (key === "down") return flow.bytesDown;
  if (key === "up") return flow.bytesUp;
  return flow.rateDown + flow.rateUp;
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; bytes: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.bytes));
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 text-xs font-medium text-zinc-500 uppercase">{title}</h3>
      {rows.length === 0 && <p className="text-sm text-zinc-500">Nothing yet</p>}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.label} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate">{row.label}</span>
              <span className="font-mono text-xs text-zinc-500">{formatBytes(row.bytes)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-zinc-100 dark:bg-zinc-800">
              <div className="h-1.5 rounded bg-sky-500" style={{ width: `${(row.bytes / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function group(flows: FlowView[], key: (flow: FlowView) => string): { label: string; bytes: number }[] {
  const totals = new Map<string, number>();
  for (const flow of flows) {
    const label = key(flow);
    totals.set(label, (totals.get(label) ?? 0) + flow.bytesDown + flow.bytesUp);
  }
  return [...totals.entries()]
    .map(([label, bytes]) => ({ label, bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 6);
}

export default function DeviceDashboard({ ip }: { ip: string }) {
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState<Tab>("connections");
  const [sort, setSort] = useStoredState<SortKey>("flow-sort", "destination");
  const [descending, setDescending] = useStoredState<"yes" | "no">("flow-sort-desc", "no");
  const [filter, setFilter] = useState("");
  const [dnsFilter, setDnsFilter] = useState("");
  const [lookup, setLookup] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget>({ peer: "", port: 0 });
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error } = usePolling<DeviceDetail>(`/api/device/${ip}`, POLL_MS, paused);
  const device = data?.device;

  const flows = useMemo(() => {
    if (!device) return [];
    const needle = filter.trim().toLowerCase();
    const list = needle
      ? device.flows.filter((flow) =>
          [flow.domain, flow.dstAddress, String(flow.dstPort), flow.label, flow.country, flow.city, flow.org].join(" ").toLowerCase().includes(needle),
        )
      : device.flows;
    const direction = descending === "yes" ? -1 : 1;
    return [...list].sort((a, b) => {
      const left = sortValue(a, sort);
      const right = sortValue(b, sort);
      const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "en", { numeric: true });
      return result * direction || a.id.localeCompare(b.id, "en", { numeric: true });
    });
  }, [device, filter, sort, descending]);

  const queries = useMemo(() => {
    const list = data?.dns.queries ?? [];
    const needle = dnsFilter.trim().toLowerCase();
    return needle ? list.filter((query) => `${query.qname} ${query.answer} ${query.responseType}`.toLowerCase().includes(needle)) : list;
  }, [data, dnsFilter]);

  const sortBy = (key: SortKey) => {
    if (key === sort) {
      setDescending(descending === "yes" ? "no" : "yes");
      return;
    }
    setSort(key);
    setDescending(["down", "up", "now"].includes(key) ? "yes" : "no");
  };

  const capture = (flow?: FlowView) => {
    setCaptureTarget({ peer: flow?.dstAddress ?? "", port: flow?.dstPort ?? 0 });
    setTab("capture");
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "connections", label: `Connections${device ? ` (${device.flows.length})` : ""}` },
    { key: "dns", label: `DNS lookups${data ? ` (${data.dns.queries.length})` : ""}` },
    { key: "capture", label: "Capture" },
    { key: "blocks", label: "Blocks" },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <Link href="/" className="text-sm text-sky-600 hover:underline dark:text-sky-400">
        ← All devices
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{device?.name ?? ip}</h1>
          <p className="font-mono text-sm text-zinc-500">
            {ip}
            {device?.mac ? ` · ${device.mac}` : ""}
            {device?.hostName && device.hostName !== device.name ? ` · ${device.hostName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {data && (
            <>
              <Status label="MikroTik" ok={data.sources.mikrotik.ok} error={data.sources.mikrotik.error} />
              <Status label="Technitium" ok={data.dns.ok} error={data.dns.error} />
              <Status label="Geo" ok={data.sources.geo.ok} error={data.sources.geo.error} />
            </>
          )}
          <button onClick={() => setPaused((value) => !value)} className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700">
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div>}
      {notice && (
        <div className="flex justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {notice}
          <button onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      {device && data && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Download now" value={formatRate(device.rateDown)} className="text-sky-600 dark:text-sky-400" />
            <Stat label="Upload now" value={formatRate(device.rateUp)} className="text-amber-600 dark:text-amber-400" />
            <Stat label="Downloaded (open connections)" value={formatBytes(device.bytesDown)} />
            <Stat label="Uploaded (open connections)" value={formatBytes(device.bytesUp)} />
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 flex gap-4 text-xs text-zinc-500">
              <span>Last 15 minutes (since the dashboard started)</span>
              <span className="text-sky-600 dark:text-sky-400">● download</span>
              <span className="text-amber-600 dark:text-amber-400">● upload</span>
            </div>
            <Chart points={data.history} />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Breakdown title="By protocol" rows={group(device.flows, (flow) => flow.label)} />
            <Breakdown title="By domain" rows={group(device.flows, (flow) => flow.domain || "unknown domain")} />
            <Breakdown title="By country" rows={group(device.flows, (flow) => (flow.country ? `${flag(flow.countryCode)} ${flow.country}` : "unknown"))} />
            <Breakdown title="By hosting provider" rows={group(device.flows, (flow) => flow.org || "unknown")} />
          </section>

          <nav className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
            {tabs.map((entry) => (
              <button
                key={entry.key}
                onClick={() => setTab(entry.key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === entry.key ? "border-sky-500 font-medium" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          {tab === "connections" && (
            <section className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter by domain, IP, port, protocol, country or provider…"
                  className="min-w-64 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button onClick={() => capture()} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
                  Capture all traffic of this device
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-zinc-500 uppercase">
                    <tr>
                      {COLUMNS.map((column) => (
                        <th key={column.key} className={`px-3 py-2 font-medium ${column.align === "right" ? "text-right" : ""}`}>
                          <button onClick={() => sortBy(column.key)} className="uppercase hover:text-zinc-900 dark:hover:text-zinc-100">
                            {column.label}
                            {sort === column.key ? (descending === "yes" ? " ↓" : " ↑") : ""}
                          </button>
                        </th>
                      ))}
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {flows.map((flow) => (
                      <tr key={flow.id} className="border-t border-zinc-100 align-top dark:border-zinc-800/60">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{flow.label}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="block">{flow.domain || <span className="text-zinc-400">unknown domain</span>}</span>
                          <button onClick={() => setLookup(flow.dstAddress)} className="font-mono text-xs text-sky-600 hover:underline dark:text-sky-400">
                            {flow.dstAddress}:{flow.dstPort}
                          </button>
                          {flow.state && <span className="font-mono text-xs text-zinc-500"> · {flow.state}</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {flow.country ? (
                            <span title={flow.country}>
                              {flag(flow.countryCode)} {flow.city || flow.country}
                            </span>
                          ) : (
                            <span className="text-zinc-400">–</span>
                          )}
                        </td>
                        <td className="max-w-48 truncate px-3 py-2" title={flow.org}>
                          {flow.org || <span className="text-zinc-400">–</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatBytes(flow.bytesDown)}</td>
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatBytes(flow.bytesUp)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap text-zinc-500">
                          {flow.rateDown + flow.rateUp > 0 ? `↓ ${formatRate(flow.rateDown)} ↑ ${formatRate(flow.rateUp)}` : "idle"}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => setLookup(flow.dstAddress)} className="px-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" title="Look up this IP">
                            Info
                          </button>
                          <button onClick={() => capture(flow)} className="px-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" title="Capture packets for this destination">
                            Capture
                          </button>
                          <button
                            onClick={() =>
                              setBlockTarget({
                                device: ip,
                                deviceName: device.name,
                                destination: flow.dstAddress,
                                protocol: flow.protocol === "tcp" || flow.protocol === "udp" ? flow.protocol : "",
                                port: flow.dstPort,
                                hint: flow.domain || flow.org,
                              })
                            }
                            className="px-1 text-xs text-red-600 hover:text-red-800 dark:text-red-400"
                          >
                            Block
                          </button>
                        </td>
                      </tr>
                    ))}
                    {flows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-zinc-500">
                          No open outbound connections right now.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === "dns" && (
            <section className="space-y-3">
              {!data.dns.ok && <p className="text-sm text-amber-600">Technitium: {data.dns.error}</p>}
              <input
                value={dnsFilter}
                onChange={(event) => setDnsFilter(event.target.value)}
                placeholder="Filter lookups…"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-zinc-500 uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Domain</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                      <th className="px-3 py-2 font-medium">Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queries.map((query, index) => {
                      const blocked = query.responseType.includes("Blocked");
                      return (
                        <tr key={`${query.timestamp}-${index}`} className="border-t border-zinc-100 align-top dark:border-zinc-800/60">
                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-zinc-500">{formatTime(query.timestamp)}</td>
                          <td className="px-3 py-2 break-all">{query.qname}</td>
                          <td className="px-3 py-2 text-xs">{query.qtype}</td>
                          <td className={`px-3 py-2 text-xs whitespace-nowrap ${blocked ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                            {query.responseType}
                            {query.rcode !== "NoError" ? ` · ${query.rcode}` : ""}
                          </td>
                          <td className="max-w-80 truncate px-3 py-2 font-mono text-xs text-zinc-500" title={query.answer}>
                            {query.answer}
                          </td>
                        </tr>
                      );
                    })}
                    {queries.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                          No DNS lookups from this device in the log. It may use another DNS server.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === "capture" && <CapturePanel ip={ip} target={captureTarget} onTargetChange={setCaptureTarget} />}
          {tab === "blocks" && <BlocksTable device={ip} names={{ [ip]: device.name }} />}
        </>
      )}

      {!data && !error && <p className="text-sm text-zinc-500">Loading…</p>}

      {lookup && <LookupPanel ip={lookup} onClose={() => setLookup(null)} />}
      {blockTarget && (
        <BlockDialog
          target={blockTarget}
          onClose={() => setBlockTarget(null)}
          onDone={(message) => {
            setBlockTarget(null);
            setNotice(message);
          }}
        />
      )}
    </main>
  );
}
