import "server-only";
import { getConfig } from "./env";
import { geoReady, lookupGeo } from "./geo";
import { getConnections, getLeases, type Connection, type Lease } from "./mikrotik";
import { labelFor } from "./protocols";
import { getDomainLookup, type DomainLookup } from "./technitium";
import type { DeviceView, FlowView, HistoryPoint, Snapshot, SnapshotResponse, SourceStatus } from "./types";

const CACHE_MS = 2000;
const DNS_REFRESH_MS = 15000;
const HISTORY_MS = 15 * 60 * 1000;

type State = {
  counters: Map<string, { up: number; down: number }>;
  lastPoll: number;
  history: HistoryPoint[];
  deviceHistory: Map<string, HistoryPoint[]>;
  leases: Lease[];
  dns: { lookup: DomainLookup | null; fetchedAt: number; status: SourceStatus };
  cached: SnapshotResponse | null;
  inFlight: Promise<SnapshotResponse> | null;
};

const globalState = globalThis as unknown as { __trafficState?: State };
const state: State = (globalState.__trafficState ??= {
  counters: new Map(),
  lastPoll: 0,
  history: [],
  deviceHistory: new Map(),
  leases: [],
  dns: { lookup: null, fetchedAt: 0, status: { ok: false, error: "Not loaded yet" } },
  cached: null,
  inFlight: null,
});
state.deviceHistory ??= new Map();
state.leases ??= [];

export function isPrivate(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return a >= 224;
}

function isOutbound(connection: Connection): boolean {
  return isPrivate(connection.srcAddress) && !isPrivate(connection.dstAddress);
}

async function refreshDns(): Promise<void> {
  if (Date.now() - state.dns.fetchedAt < DNS_REFRESH_MS) return;
  const config = getConfig();
  if (!config.success) return;

  const result = await getDomainLookup(config.config);
  state.dns.fetchedAt = Date.now();
  if (result.success) {
    state.dns.lookup = result.data;
    state.dns.status = { ok: true };
    return;
  }
  state.dns.status = { ok: false, error: result.error };
}

function deviceName(ip: string, lease: Lease | undefined, dns: DomainLookup | null): string {
  return lease?.comment || lease?.hostName || dns?.hostNames.get(ip) || ip;
}

function domainFor(connection: Connection, dns: DomainLookup | null): string {
  if (!dns) return "";
  return dns.byClientAndIp.get(`${connection.srcAddress}|${connection.dstAddress}`) ?? dns.byIp.get(connection.dstAddress) ?? "";
}

function emptyDevice(ip: string, lease: Lease | undefined, dns: DomainLookup | null): DeviceView {
  return {
    ip,
    name: deviceName(ip, lease, dns),
    mac: lease?.macAddress ?? "",
    hostName: lease?.hostName ?? "",
    rateUp: 0,
    rateDown: 0,
    bytesUp: 0,
    bytesDown: 0,
    flows: [],
  };
}

function pushPoint(list: HistoryPoint[], point: HistoryPoint): HistoryPoint[] {
  list.push(point);
  while (list.length && point.t - list[0].t > HISTORY_MS) list.shift();
  return list;
}

async function build(): Promise<SnapshotResponse> {
  const config = getConfig();
  if (!config.success) return config;

  const [connections, leases, , geo] = await Promise.all([
    getConnections(config.config),
    getLeases(config.config),
    refreshDns(),
    geoReady(),
  ]);

  if (!connections.success) return { success: false, error: `MikroTik: ${connections.error}` };
  const mikrotik: SourceStatus = leases.success ? { ok: true } : { ok: true, error: `Leases: ${leases.error}` };
  if (leases.success) state.leases = leases.data;

  const now = Date.now();
  const firstPoll = state.lastPoll === 0;
  const seconds = firstPoll ? 0 : (now - state.lastPoll) / 1000;
  const leaseByIp = new Map(state.leases.map((lease) => [lease.address, lease]));
  const dns = state.dns.lookup;

  const devices = new Map<string, DeviceView>();
  const nextCounters = new Map<string, { up: number; down: number }>();

  for (const connection of connections.data) {
    if (!isOutbound(connection)) continue;

    const previous = state.counters.get(connection.id);
    nextCounters.set(connection.id, { up: connection.origBytes, down: connection.replBytes });

    const rateUp = seconds > 0 ? Math.max(0, connection.origBytes - (previous?.up ?? 0)) / seconds : 0;
    const rateDown = seconds > 0 ? Math.max(0, connection.replBytes - (previous?.down ?? 0)) / seconds : 0;
    const location = await lookupGeo(connection.dstAddress);

    const flow: FlowView = {
      id: connection.id,
      protocol: connection.protocol,
      label: labelFor(connection.protocol, connection.dstPort),
      domain: domainFor(connection, dns),
      dstAddress: connection.dstAddress,
      dstPort: connection.dstPort,
      srcPort: connection.srcPort,
      bytesUp: connection.origBytes,
      bytesDown: connection.replBytes,
      rateUp,
      rateDown,
      state: connection.tcpState,
      countryCode: location?.countryCode ?? "",
      country: location?.country ?? "",
      city: location?.city ?? "",
      org: location?.org ?? "",
    };

    const ip = connection.srcAddress;
    let device = devices.get(ip);
    if (!device) {
      device = emptyDevice(ip, leaseByIp.get(ip), dns);
      devices.set(ip, device);
    }
    device.flows.push(flow);
    device.rateUp += rateUp;
    device.rateDown += rateDown;
    device.bytesUp += flow.bytesUp;
    device.bytesDown += flow.bytesDown;
  }

  state.counters = nextCounters;
  state.lastPoll = now;

  const list = [...devices.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  for (const device of list) device.flows.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

  const totals = {
    rateUp: list.reduce((sum, device) => sum + device.rateUp, 0),
    rateDown: list.reduce((sum, device) => sum + device.rateDown, 0),
    flows: list.reduce((sum, device) => sum + device.flows.length, 0),
    devices: list.length,
  };

  if (!firstPoll) {
    pushPoint(state.history, { t: now, up: totals.rateUp, down: totals.rateDown });
    const seen = new Set<string>();
    for (const device of list) {
      seen.add(device.ip);
      const history = state.deviceHistory.get(device.ip) ?? [];
      state.deviceHistory.set(device.ip, pushPoint(history, { t: now, up: device.rateUp, down: device.rateDown }));
    }
    for (const [ip, history] of state.deviceHistory) {
      if (seen.has(ip)) continue;
      pushPoint(history, { t: now, up: 0, down: 0 });
      if (history.every((point) => point.up === 0 && point.down === 0)) state.deviceHistory.delete(ip);
    }
  }

  const snapshot: Snapshot = {
    takenAt: now,
    devices: list,
    history: state.history,
    totals,
    sources: { mikrotik, technitium: state.dns.status, geo },
  };
  return { success: true, data: snapshot };
}

export async function getSnapshot(): Promise<SnapshotResponse> {
  if (state.cached?.success && Date.now() - state.cached.data.takenAt < CACHE_MS) return state.cached;
  if (state.inFlight) return state.inFlight;

  state.inFlight = build()
    .then((result) => {
      state.cached = result;
      return result;
    })
    .finally(() => {
      state.inFlight = null;
    });
  return state.inFlight;
}

export function getDeviceFromSnapshot(snapshot: Snapshot, ip: string): { device: DeviceView; history: HistoryPoint[] } {
  const found = snapshot.devices.find((device) => device.ip === ip);
  const lease = state.leases.find((entry) => entry.address === ip);
  return {
    device: found ?? emptyDevice(ip, lease, state.dns.lookup),
    history: state.deviceHistory.get(ip) ?? [],
  };
}

export function knownDomainsFor(ip: string): string[] {
  return [...(state.dns.lookup?.domainsByIp.get(ip) ?? [])];
}
