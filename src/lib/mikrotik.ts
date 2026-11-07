import "server-only";
import type { Config } from "./env";
import { getJson, type Result } from "./http";

export type Lease = {
  address: string;
  macAddress: string;
  hostName: string;
  comment: string;
};

export type Connection = {
  id: string;
  protocol: string;
  srcAddress: string;
  srcPort: number;
  dstAddress: string;
  dstPort: number;
  origBytes: number;
  replBytes: number;
  tcpState: string;
};

type RawRow = Record<string, string | undefined>;

function auth(config: Config): Record<string, string> {
  const token = Buffer.from(`${config.mikrotikUser}:${config.mikrotikPassword}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

async function rest(config: Config, path: string, props: string[]): Promise<Result<RawRow[]>> {
  const url = `${config.mikrotikUrl}/rest${path}?.proplist=${props.join(",")}`;
  return getJson<RawRow[]>(url, { headers: auth(config), timeoutMs: 8000 });
}

export async function routerCommand<T = unknown>(config: Config, path: string, body: Record<string, string> = {}): Promise<Result<T>> {
  return getJson<T>(`${config.mikrotikUrl}/rest${path}`, { method: "POST", body, headers: auth(config), timeoutMs: 8000 });
}

export async function getLeases(config: Config): Promise<Result<Lease[]>> {
  const result = await rest(config, "/ip/dhcp-server/lease", ["address", "active-address", "mac-address", "host-name", "comment"]);
  if (!result.success) return result;

  return {
    success: true,
    data: result.data.map((row) => ({
      address: row["active-address"] || row.address || "",
      macAddress: row["mac-address"] ?? "",
      hostName: row["host-name"] ?? "",
      comment: row.comment ?? "",
    })),
  };
}

export async function getConnections(config: Config): Promise<Result<Connection[]>> {
  const result = await rest(config, "/ip/firewall/connection", [
    ".id",
    "protocol",
    "src-address",
    "src-port",
    "dst-address",
    "dst-port",
    "orig-bytes",
    "repl-bytes",
    "tcp-state",
  ]);
  if (!result.success) return result;

  return {
    success: true,
    data: result.data.map((row) => ({
      id: row[".id"] ?? "",
      protocol: row.protocol ?? "",
      srcAddress: row["src-address"] ?? "",
      srcPort: Number(row["src-port"] ?? 0),
      dstAddress: row["dst-address"] ?? "",
      dstPort: Number(row["dst-port"] ?? 0),
      origBytes: Number(row["orig-bytes"] ?? 0),
      replBytes: Number(row["repl-bytes"] ?? 0),
      tcpState: row["tcp-state"] ?? "",
    })),
  };
}
