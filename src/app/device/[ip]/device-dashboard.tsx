"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { BlocksTable } from "@/components/blocks-table";
import { Chart, LinkBadge, Stat, Status } from "@/components/chart";
import { flag, formatBytes, formatRate, formatTime } from "@/components/format";
import { usePolling, useStoredState } from "@/components/use-polling";
import type { DeviceDetail, FlowView } from "@/lib/types";
import { BlockDialog, type BlockTarget } from "./block-dialog";
import { CapturePanel, type CaptureTarget } from "./capture-panel";
import { LookupPanel } from "./lookup-panel";
import { DeviceTitle } from "./rename";

const POLL_MS = 3000;

type Tab = "connections" | "dns" | "capture" | "blocks";
type SortKey = "seen" | "destination" | "protocol" | "location" | "provider" | "down" | "up" | "now";

const ACTIVE_MS = 6000;

const COLUMNS: { key: SortKey; label: string; width: string; align?: "right" }[] = [
  { key: "seen", label: "First seen", width: "w-36" },
  { key: "protocol", label: "Protocol", width: "w-36" },
  { key: "destination", label: "Destination", width: "" },
  { key: "location", label: "Location", width: "w-44" },
  { key: "provider", label: "Hosted by", width: "w-56" },
  { key: "down", label: "Down", width: "w-24", align: "right" },
  { key: "up", label: "Up", width: "w-24", align: "right" },
  { key: "now", label: "Now", width: "w-56", align: "right" },
];

function ActivityDot({ flow, now }: { flow: FlowView; now: number }) {
  if (!flow.open) {
    return <span title={`Closed · last seen ${formatTime(flow.lastSeen)}`} className="inline-block h-2.5 w-2.5 rounded-full border border-zinc-400" />;
  }
  if (flow.lastActive && now - flow.lastActive < ACTIVE_MS) {
    return (
      <span title="Traffic right now" className="relative inline-flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
    );
  }
  return <span title="Open, idle" className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />;
}

type FlowGroup = { key: string; summary: FlowView; members: FlowView[] };

function groupFlows(flows: FlowView[], enabled: boolean): FlowGroup[] {
  const groups = new Map<string, FlowView[]>();
  for (const flow of flows) {
    const key = enabled ? `${flow.protocol}|${flow.dstAddress}|${flow.dstPort}` : `${flow.id}|${flow.dstAddress}|${flow.dstPort}`;
    groups.set(key, [...(groups.get(key) ?? []), flow]);
  }

  return [...groups.entries()].map(([key, members]) => {
    members.sort((a, b) => a.firstSeen - b.firstSeen || a.id.localeCompare(b.id, "en", { numeric: true }));
    if (members.length === 1) return { key, summary: members[0], members };

    const open = members.filter((flow) => flow.open);
    const latest = members[members.length - 1];
    const summary: FlowView = {
      ...latest,
      id: key,
      domain: members.find((flow) => flow.domain)?.domain ?? "",
      bytesUp: members.reduce((sum, flow) => sum + flow.bytesUp, 0),
      bytesDown: members.reduce((sum, flow) => sum + flow.bytesDown, 0),
      rateUp: members.reduce((sum, flow) => sum + flow.rateUp, 0),
      rateDown: members.reduce((sum, flow) => sum + flow.rateDown, 0),
      open: open.length > 0,
      firstSeen: members[0].firstSeen,
      lastSeen: Math.max(...members.map((flow) => flow.lastSeen)),
      lastActive: Math.max(...members.map((flow) => flow.lastActive)),
      state: "",
    };
    return { key, summary, members };
  });
}

type RowActions = {
  now: number;
  onLookup: (ip: string) => void;
  onCapture: (flow: FlowView) => void;
  onBlock: (flow: FlowView) => void;
};

function FlowRow({
  flow,
  count = 1,
  openMembers = 0,
  expanded = false,
  nested = false,
  onToggle,
  now,
  onLookup,
  onCapture,
  onBlock,
}: RowActions & { flow: FlowView; count?: number; openMembers?: number; expanded?: boolean; nested?: boolean; onToggle?: () => void }) {
  const status = count > 1 ? (openMembers ? `${openMembers} of ${count} open` : `${count} connections, all closed`) : flow.state;

  return (
    <tr
      className={`border-t border-zinc-100 align-top dark:border-zinc-800/60 ${flow.open ? "" : "text-zinc-400 dark:text-zinc-500"} ${nested ? "bg-zinc-50 text-xs dark:bg-zinc-950/40" : ""}`}
    >
      <td className={`py-3 ${nested ? "pr-3 pl-6" : "px-3"}`}>
        <ActivityDot flow={flow} now={now} />
      </td>
      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-zinc-500">
        {formatTime(flow.firstSeen)}
        {!flow.open && <span className="block">closed {formatTime(flow.lastSeen)}</span>}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{flow.label}</span>
        {count > 1 && (
          <button
            onClick={onToggle}
            className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-300"
            title={expanded ? "Hide individual connections" : "Show individual connections"}
          >
            {expanded ? "▾" : "▸"} ×{count}
          </button>
        )}
      </td>
      <td className="truncate px-3 py-2">
        {nested ? (
          <span className="font-mono text-xs text-zinc-500">source port {flow.srcPort}</span>
        ) : (
          <>
            <span className="block truncate" title={flow.domain}>
              {flow.domain || <span className="text-zinc-400">unknown domain</span>}
            </span>
            <button onClick={() => onLookup(flow.dstAddress)} className="font-mono text-xs text-sky-600 hover:underline dark:text-sky-400">
              {flow.dstAddress}:{flow.dstPort}
            </button>
          </>
        )}
        {status && <span className="font-mono text-xs text-zinc-500"> · {status}</span>}
      </td>
      <td className="truncate px-3 py-2">
        {nested ? null : flow.country ? (
          <span title={flow.country}>
            {flag(flow.countryCode)} {flow.city || flow.country}
          </span>
        ) : (
          <span className="text-zinc-400">–</span>
        )}
      </td>
      <td className="truncate px-3 py-2" title={flow.org}>
        {nested ? null : flow.org || <span className="text-zinc-400">–</span>}
      </td>
      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatBytes(flow.bytesDown)}</td>
      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatBytes(flow.bytesUp)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap text-zinc-500">
        {!flow.open ? "closed" : flow.rateDown + flow.rateUp > 0 ? `↓ ${formatRate(flow.rateDown)} ↑ ${formatRate(flow.rateUp)}` : "idle"}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {!nested && (
          <>
            <button onClick={() => onLookup(flow.dstAddress)} className="px-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" title="Look up this IP">
              Info
            </button>
            <button onClick={() => onCapture(flow)} className="px-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" title="Capture packets for this destination">
              Capture
            </button>
            <button onClick={() => onBlock(flow)} className="px-1 text-xs text-red-600 hover:text-red-800 dark:text-red-400">
              Block
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function sortValue(flow: FlowView, key: SortKey): string | number {
  if (key === "seen") return flow.firstSeen;
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
  const [sort, setSort] = useStoredState<SortKey>("flow-sort-v2", "seen");
  const [descending, setDescending] = useStoredState<"yes" | "no">("flow-sort-desc-v2", "no");
  const [showClosed, setShowClosed] = useStoredState<"yes" | "no">("flow-show-closed", "yes");
  const [grouped, setGrouped] = useStoredState<"yes" | "no">("flow-grouped", "yes");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [dnsFilter, setDnsFilter] = useState("");
  const [lookup, setLookup] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget>({ peer: "", port: 0 });
  const [notice, setNotice] = useState<string | null>(null);

  const { data, error } = usePolling<DeviceDetail>(`/api/device/${ip}`, POLL_MS, paused);
  const device = data?.device;

  const rows = useMemo(() => {
    if (!device) return [];
    const needle = filter.trim().toLowerCase();
    const visible = showClosed === "yes" ? device.flows : device.flows.filter((flow) => flow.open);
    const list = needle
      ? visible.filter((flow) =>
          [flow.domain, flow.dstAddress, String(flow.dstPort), flow.label, flow.country, flow.city, flow.org].join(" ").toLowerCase().includes(needle),
        )
      : visible;
    const direction = descending === "yes" ? -1 : 1;
    return groupFlows(list, grouped === "yes").sort((a, b) => {
      const left = sortValue(a.summary, sort);
      const right = sortValue(b.summary, sort);
      const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "en", { numeric: true });
      return result * direction || a.key.localeCompare(b.key, "en", { numeric: true });
    });
  }, [device, filter, sort, descending, showClosed, grouped]);

  const toggleRow = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const openCount = device?.flows.filter((flow) => flow.open).length ?? 0;
  const closedCount = (device?.flows.length ?? 0) - openCount;
  const now = data?.takenAt ?? 0;

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
    { key: "connections", label: `Connections${device ? ` (${openCount} open · ${closedCount} closed)` : ""}` },
    { key: "dns", label: `DNS lookups${data ? ` (${data.dns.queries.length})` : ""}` },
    { key: "capture", label: "Capture" },
    { key: "blocks", label: "Blocks" },
  ];

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-8">
      <Link href="/" className="text-sm text-sky-600 hover:underline dark:text-sky-400">
        ← All devices
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {device ? <DeviceTitle key={device.name} ip={ip} name={device.name} onSaved={setNotice} /> : <h1 className="text-2xl font-semibold">{ip}</h1>}
          <p className="font-mono text-sm text-zinc-500">
            {ip}
            {device?.mac ? ` · ${device.mac}` : ""}
            {device?.hostName && device.hostName !== device.name ? ` · ${device.hostName}` : ""}
          </p>
          {device && (
            <p className="mt-2">
              <LinkBadge link={device.link} detailed />
            </p>
          )}
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
            <Stat label="Downloaded (all seen connections)" value={formatBytes(device.bytesDown)} />
            <Stat label="Uploaded (all seen connections)" value={formatBytes(device.bytesUp)} />
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
                <label className="flex items-center gap-2 text-sm text-zinc-500">
                  <input type="checkbox" checked={grouped === "yes"} onChange={(event) => setGrouped(event.target.checked ? "yes" : "no")} />
                  Group same destination
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-500">
                  <input type="checkbox" checked={showClosed === "yes"} onChange={(event) => setShowClosed(event.target.checked ? "yes" : "no")} />
                  Show closed
                </label>
                <button onClick={() => capture()} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
                  Capture all traffic of this device
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full min-w-[1200px] table-fixed text-sm tabular-nums">
                  <thead className="text-left text-xs text-zinc-500 uppercase">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      {COLUMNS.map((column) => (
                        <th key={column.key} className={`${column.width} px-3 py-2 font-medium whitespace-nowrap ${column.align === "right" ? "text-right" : ""}`}>
                          <button onClick={() => sortBy(column.key)} className="uppercase hover:text-zinc-900 dark:hover:text-zinc-100">
                            {column.label}
                            {sort === column.key ? (descending === "yes" ? " ↓" : " ↑") : ""}
                          </button>
                        </th>
                      ))}
                      <th className="w-44 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const isOpen = expanded.has(row.key);
                      const actions = {
                        now,
                        onLookup: setLookup,
                        onCapture: capture,
                        onBlock: (flow: FlowView) =>
                          setBlockTarget({
                            device: ip,
                            deviceName: device.name,
                            destination: flow.dstAddress,
                            protocol: flow.protocol === "tcp" || flow.protocol === "udp" ? flow.protocol : "",
                            port: flow.dstPort,
                            hint: flow.domain || flow.org,
                          }),
                      };
                      return (
                        <Fragment key={row.key}>
                          <FlowRow
                            flow={row.summary}
                            count={row.members.length}
                            openMembers={row.members.filter((flow) => flow.open).length}
                            expanded={isOpen}
                            onToggle={row.members.length > 1 ? () => toggleRow(row.key) : undefined}
                            {...actions}
                          />
                          {isOpen &&
                            row.members.length > 1 &&
                            row.members.map((flow) => <FlowRow key={`${flow.id}|${flow.dstAddress}|${flow.dstPort}`} flow={flow} nested {...actions} />)}
                        </Fragment>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-3 py-8 text-center text-zinc-500">
                          No outbound connections seen yet.
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
