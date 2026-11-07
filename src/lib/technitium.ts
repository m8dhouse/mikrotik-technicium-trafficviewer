import "server-only";
import type { Config } from "./env";
import { getJson, type Result } from "./http";
import type { DnsQuery } from "./types";

type Envelope<T> = { status: string; errorMessage?: string; response?: T };

type AppList = {
  apps: { name: string; dnsApps: { classPath: string; isQueryLogs?: boolean }[] }[];
};

type LogEntry = DnsQuery & { clientIpAddress: string };

type LogPage = { entries: LogEntry[] };

export type DomainLookup = {
  byClientAndIp: Map<string, string>;
  byIp: Map<string, string>;
  domainsByIp: Map<string, Set<string>>;
  hostNames: Map<string, string>;
};

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

async function call<T>(config: Config, path: string, params: Record<string, string> = {}): Promise<Result<T>> {
  const query = new URLSearchParams(params).toString();
  const url = `${config.technitiumUrl}/api${path}${query ? `?${query}` : ""}`;
  const result = await getJson<Envelope<T>>(url, { headers: { Authorization: `Bearer ${config.technitiumToken}` } });
  if (!result.success) return result;
  if (result.data.status !== "ok" || !result.data.response) {
    return { success: false, error: result.data.errorMessage ?? `Technitium status: ${result.data.status}` };
  }
  return { success: true, data: result.data.response };
}

async function findQueryLogApp(config: Config): Promise<Result<{ name: string; classPath: string }>> {
  const result = await call<AppList>(config, "/apps/list");
  if (!result.success) return result;

  for (const app of result.data.apps) {
    const reader = app.dnsApps.find((dnsApp) => dnsApp.isQueryLogs);
    if (reader) return { success: true, data: { name: app.name, classPath: reader.classPath } };
  }
  return { success: false, error: "No query-log app installed in Technitium" };
}

async function queryLogs(config: Config, params: Record<string, string>): Promise<Result<LogEntry[]>> {
  const app = await findQueryLogApp(config);
  if (!app.success) return app;

  const logs = await call<LogPage>(config, "/logs/query", {
    name: app.data.name,
    classPath: app.data.classPath,
    pageNumber: "1",
    descendingOrder: "true",
    ...params,
  });
  if (!logs.success) return logs;
  return { success: true, data: logs.data.entries };
}

async function getClientNames(config: Config): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const result = await call<{ topClients: { name: string; domain?: string }[] }>(config, "/dashboard/stats/getTop", {
    type: "LastDay",
    statsType: "TopClients",
    limit: "500",
  });
  if (!result.success) return names;

  for (const client of result.data.topClients) {
    if (client.domain) names.set(client.name, client.domain);
  }
  return names;
}

export async function getDomainLookup(config: Config, entries = 2000): Promise<Result<DomainLookup>> {
  const [logs, hostNames] = await Promise.all([
    queryLogs(config, { entriesPerPage: String(entries) }),
    getClientNames(config),
  ]);
  if (!logs.success) return logs;

  const byClientAndIp = new Map<string, string>();
  const byIp = new Map<string, string>();
  const domainsByIp = new Map<string, Set<string>>();

  for (const entry of logs.data) {
    if (!entry.answer || !entry.qname) continue;
    for (const ip of entry.answer.match(IPV4) ?? []) {
      const clientKey = `${entry.clientIpAddress}|${ip}`;
      if (!byClientAndIp.has(clientKey)) byClientAndIp.set(clientKey, entry.qname);
      if (!byIp.has(ip)) byIp.set(ip, entry.qname);
      const domains = domainsByIp.get(ip) ?? new Set<string>();
      domains.add(entry.qname);
      domainsByIp.set(ip, domains);
    }
  }

  return { success: true, data: { byClientAndIp, byIp, domainsByIp, hostNames } };
}

export async function getClientQueries(config: Config, clientIp: string, entries = 300): Promise<Result<DnsQuery[]>> {
  const logs = await queryLogs(config, { entriesPerPage: String(entries), clientIpAddress: clientIp });
  if (!logs.success) return logs;

  return {
    success: true,
    data: logs.data.map(({ timestamp, qname, qtype, responseType, rcode, answer }) => ({
      timestamp,
      qname,
      qtype,
      responseType,
      rcode,
      answer: answer ?? "",
    })),
  };
}
