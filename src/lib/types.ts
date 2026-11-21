export type GeoInfo = {
  countryCode: string;
  country: string;
  region: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  asn: number | null;
  org: string;
  source: string;
  cloudRegion: string;
};

export type FlowView = {
  id: string;
  protocol: string;
  label: string;
  domain: string;
  dstAddress: string;
  dstPort: number;
  srcPort: number;
  bytesUp: number;
  bytesDown: number;
  rateUp: number;
  rateDown: number;
  state: string;
  countryCode: string;
  country: string;
  city: string;
  org: string;
  open: boolean;
  firstSeen: number;
  lastSeen: number;
  lastActive: number;
};

export type LinkInfo = {
  kind: "wifi" | "wired" | "switch" | "unknown";
  port: string;
  via: string;
  privateMac: boolean;
  reason: string;
};

export type DeviceView = {
  ip: string;
  name: string;
  mac: string;
  hostName: string;
  link: LinkInfo;
  rateUp: number;
  rateDown: number;
  bytesUp: number;
  bytesDown: number;
  flows: FlowView[];
};

export type HistoryPoint = { t: number; up: number; down: number };

export type SourceStatus = { ok: boolean; error?: string };

export type Snapshot = {
  takenAt: number;
  devices: DeviceView[];
  history: HistoryPoint[];
  totals: { rateUp: number; rateDown: number; flows: number; devices: number };
  sources: { mikrotik: SourceStatus; technitium: SourceStatus; geo: SourceStatus };
};

export type SnapshotResponse = { success: true; data: Snapshot } | { success: false; error: string };

export type DnsQuery = {
  timestamp: string;
  qname: string;
  qtype: string;
  responseType: string;
  rcode: string;
  answer: string;
};

export type DeviceDetail = {
  takenAt: number;
  device: DeviceView;
  history: HistoryPoint[];
  dns: { ok: boolean; error?: string; queries: DnsQuery[] };
  sources: Snapshot["sources"];
};

export type DeviceResponse = { success: true; data: DeviceDetail } | { success: false; error: string };

export type IpLookup = {
  ip: string;
  reverseDns: string[];
  geo: GeoInfo | null;
  domains: string[];
};

export type LookupResponse = { success: true; data: IpLookup } | { success: false; error: string };

export type CapturedPacket = {
  t: number;
  direction: "out" | "in" | "other";
  protocol: string;
  src: string;
  dst: string;
  srcPort: number;
  dstPort: number;
  length: number;
  flags: string;
  info: string;
};

export type CaptureStatus = {
  id: string;
  ip: string;
  peer: string;
  port: number;
  seconds: number;
  startedAt: number;
  endsAt: number;
  state: "running" | "done" | "failed";
  error?: string;
  packetCount: number;
  bytes: number;
  packets: CapturedPacket[];
};

export type BlockRule = {
  id: string;
  comment: string;
  device: string;
  destination: string;
  protocol: string;
  port: string;
  action: string;
  disabled: boolean;
  packets: number;
  bytes: number;
};

export type CaptureResponse = { success: true; data: CaptureStatus } | { success: false; error: string };
