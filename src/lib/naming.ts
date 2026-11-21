import "server-only";
import type { Config } from "./env";
import { getJson, type Result } from "./http";
import { getLeases, routerCommand } from "./mikrotik";

export const NAME_LIST = "brol-names";

type RawRow = Record<string, string | undefined>;

function auth(config: Config): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${config.mikrotikUser}:${config.mikrotikPassword}`).toString("base64")}` };
}

async function nameEntries(config: Config): Promise<Result<RawRow[]>> {
  return getJson<RawRow[]>(`${config.mikrotikUrl}/rest/ip/firewall/address-list?list=${NAME_LIST}`, { headers: auth(config) });
}

export async function getNameList(config: Config): Promise<Result<Map<string, string>>> {
  const entries = await nameEntries(config);
  if (!entries.success) return entries;
  return {
    success: true,
    data: new Map(entries.data.filter((row) => row.address && row.comment).map((row) => [row.address as string, row.comment as string])),
  };
}

export type SavedName = { where: "lease" | "address-list"; madeStatic: boolean };

export async function saveDeviceName(config: Config, ip: string, name: string): Promise<Result<SavedName>> {
  const leases = await getLeases(config);
  if (!leases.success) return leases;

  const lease = leases.data.find((entry) => entry.address === ip);
  if (lease) {
    let madeStatic = false;
    if (lease.dynamic && name) {
      const made = await routerCommand(config, "/ip/dhcp-server/lease/make-static", { ".id": lease.id });
      if (!made.success) return { success: false, error: `Could not make the lease static: ${made.error}` };
      madeStatic = true;
    }

    const fresh = madeStatic ? await getLeases(config) : leases;
    const target = fresh.success ? (fresh.data.find((entry) => entry.macAddress === lease.macAddress && !entry.dynamic) ?? lease) : lease;
    const set = await routerCommand(config, "/ip/dhcp-server/lease/set", { ".id": target.id, comment: name });
    if (!set.success) return { success: false, error: `Could not save the name on the lease: ${set.error}` };
    return { success: true, data: { where: "lease", madeStatic } };
  }

  const entries = await nameEntries(config);
  if (!entries.success) return entries;
  const existing = entries.data.find((row) => row.address === ip);

  if (!name) {
    if (!existing?.[".id"]) return { success: true, data: { where: "address-list", madeStatic: false } };
    const removed = await routerCommand(config, "/ip/firewall/address-list/remove", { ".id": existing[".id"] });
    return removed.success ? { success: true, data: { where: "address-list", madeStatic: false } } : removed;
  }

  const saved = existing?.[".id"]
    ? await routerCommand(config, "/ip/firewall/address-list/set", { ".id": existing[".id"], comment: name })
    : await routerCommand(config, "/ip/firewall/address-list/add", { list: NAME_LIST, address: ip, comment: name });
  if (!saved.success) return { success: false, error: `Could not save the name: ${saved.error}` };
  return { success: true, data: { where: "address-list", madeStatic: false } };
}
