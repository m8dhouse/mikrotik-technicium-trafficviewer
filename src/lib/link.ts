import type { Neighbor } from "./mikrotik";
import type { LinkInfo } from "./types";

const WIFI_NAME = /wi-?fi|wlan|wireless|\bap\b|access.?point/i;
const WIFI_GEAR = /tp-?link|eap|omada|unifi|ubiquiti|uap|deco|aruba|ruckus|cap ?ac|cap ?ax|hap|wap/i;
const SWITCH_GEAR = /switch|css\d|crs\d|\bs\d{3}\b|gs\d{3}|sg\d{3}|netgear|hub/i;

export function isPrivateMac(mac: string): boolean {
  const second = mac.replace(/[^0-9a-f]/gi, "")[1];
  return Boolean(second && /[26ae]/i.test(second));
}

export function describeLink(mac: string, port: string | undefined, neighbors: Neighbor[], hostsOnPort: number): LinkInfo {
  const privateMac = Boolean(mac) && isPrivateMac(mac);
  if (!port) {
    return { kind: privateMac ? "wifi" : "unknown", port: "", via: "", privateMac, reason: privateMac ? "private MAC address" : "port not known" };
  }

  const neighbor = neighbors.find((entry) => entry.interface === port);
  const via = neighbor ? [neighbor.identity, neighbor.board].filter(Boolean).join(" · ") : "";
  const gear = neighbor ? `${neighbor.identity} ${neighbor.platform} ${neighbor.board}` : "";

  if (WIFI_NAME.test(port) || WIFI_GEAR.test(gear)) {
    return { kind: "wifi", port, via, privateMac, reason: "port leads to an access point" };
  }
  if (privateMac) {
    return { kind: "wifi", port, via, privateMac, reason: "private MAC address" };
  }
  if (neighbor && (SWITCH_GEAR.test(gear) || SWITCH_GEAR.test(port))) {
    return { kind: "switch", port, via, privateMac, reason: "behind a switch; could be wired or an access point" };
  }
  if (!neighbor && hostsOnPort <= 1) {
    return { kind: "wired", port, via, privateMac, reason: "only device on this port" };
  }
  return { kind: "switch", port, via, privateMac, reason: `${hostsOnPort} devices on this port` };
}
