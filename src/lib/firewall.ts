import "server-only";
import type { Config } from "./env";
import { getJson, type Result } from "./http";
import { getConnections, routerCommand } from "./mikrotik";
import type { BlockRule } from "./types";

const TAG = "brol:";

type RawRule = Record<string, string | undefined>;

function auth(config: Config): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${config.mikrotikUser}:${config.mikrotikPassword}`).toString("base64")}` };
}

async function forwardRules(config: Config): Promise<Result<RawRule[]>> {
  return getJson<RawRule[]>(`${config.mikrotikUrl}/rest/ip/firewall/filter?chain=forward`, { headers: auth(config), timeoutMs: 8000 });
}

function toRule(raw: RawRule): BlockRule {
  return {
    id: raw[".id"] ?? "",
    comment: (raw.comment ?? "").slice(TAG.length).trim(),
    device: (raw["src-address"] ?? "").replace(/\/32$/, ""),
    destination: (raw["dst-address"] ?? "").replace(/\/32$/, ""),
    protocol: raw.protocol ?? "",
    port: raw["dst-port"] ?? "",
    action: raw.action ?? "",
    disabled: raw.disabled === "true",
    packets: Number(raw.packets ?? 0),
    bytes: Number(raw.bytes ?? 0),
  };
}

export async function listBlocks(config: Config): Promise<Result<BlockRule[]>> {
  const rules = await forwardRules(config);
  if (!rules.success) return rules;
  return { success: true, data: rules.data.filter((rule) => rule.comment?.startsWith(TAG)).map(toRule) };
}

async function ownRule(config: Config, id: string): Promise<Result<BlockRule>> {
  const rules = await listBlocks(config);
  if (!rules.success) return rules;
  const rule = rules.data.find((entry) => entry.id === id);
  return rule ? { success: true, data: rule } : { success: false, error: "Rule not found or not created by this dashboard" };
}

export type NewBlock = {
  device: string;
  destination: string;
  protocol: "" | "tcp" | "udp";
  port: number;
  comment: string;
  action: "reject" | "drop";
};

export async function addBlock(config: Config, block: NewBlock): Promise<Result<{ cleared: number }>> {
  const rules = await forwardRules(config);
  if (!rules.success) return rules;

  const body: Record<string, string> = {
    chain: "forward",
    action: block.action,
    "dst-address": block.destination,
    comment: `${TAG} ${block.comment}`.trim(),
  };
  if (block.device) body["src-address"] = block.device;
  if (block.protocol) body.protocol = block.protocol;
  if (block.protocol && block.port) body["dst-port"] = String(block.port);
  if (block.action === "reject") body["reject-with"] = block.protocol === "tcp" ? "tcp-reset" : "icmp-admin-prohibited";
  const first = rules.data.find((rule) => rule.dynamic !== "true")?.[".id"];
  if (first) body["place-before"] = first;

  const added = await routerCommand(config, "/ip/firewall/filter/add", body);
  if (!added.success) return { success: false, error: `Router refused the rule: ${added.error}` };

  const connections = await getConnections(config);
  let cleared = 0;
  if (connections.success) {
    const matching = connections.data.filter(
      (connection) =>
        connection.dstAddress === block.destination &&
        (!block.device || connection.srcAddress === block.device) &&
        (!block.protocol || connection.protocol === block.protocol) &&
        (!block.port || connection.dstPort === block.port),
    );
    for (const connection of matching) {
      const removed = await routerCommand(config, "/ip/firewall/connection/remove", { ".id": connection.id });
      if (removed.success) cleared++;
    }
  }
  return { success: true, data: { cleared } };
}

export async function setBlockDisabled(config: Config, id: string, disabled: boolean): Promise<Result<null>> {
  const rule = await ownRule(config, id);
  if (!rule.success) return rule;
  const result = await routerCommand(config, "/ip/firewall/filter/set", { ".id": id, disabled: disabled ? "yes" : "no" });
  return result.success ? { success: true, data: null } : result;
}

export async function updateBlockComment(config: Config, id: string, comment: string): Promise<Result<null>> {
  const rule = await ownRule(config, id);
  if (!rule.success) return rule;
  const result = await routerCommand(config, "/ip/firewall/filter/set", { ".id": id, comment: `${TAG} ${comment}`.trim() });
  return result.success ? { success: true, data: null } : result;
}

export async function removeBlock(config: Config, id: string): Promise<Result<null>> {
  const rule = await ownRule(config, id);
  if (!rule.success) return rule;
  const result = await routerCommand(config, "/ip/firewall/filter/remove", { ".id": id });
  return result.success ? { success: true, data: null } : result;
}
