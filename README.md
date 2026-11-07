**Last Updated:** 2026-11-07 | **Log:** Phase 2: device page, geo/hosting, capture and blocking

# Outbound traffic dashboard

A local page showing which LAN devices talk to the internet, over which protocol, to which domain, where it is hosted and how much traffic, with tools to capture packets and block destinations.

- **MikroTik** (REST API): connections, DHCP leases, packet sniffer and firewall rules.
- **Technitium** (query logs): matches each destination IP to the domain the device looked up, plus per-device DNS history.
- **DB-IP Lite** (offline databases): country, city and hosting provider (ASN) for each destination.

## Set-up

1. Copy `.env.example` to `.env` and fill in the MikroTik password and Technitium API token.
2. On the router, a user for the dashboard that can only log in from your LAN (replace `<lan-subnet>`, for example `192.168.88.0/24`):
   ```routeros
   /user/group/add name=api-dashboard policy=read,write,api,rest-api,sniff,test
   /user/add name=<router-api-user> group=api-dashboard password=... address=<lan-subnet>
   /ip service set www address=<lan-subnet>
   ```
   `write` is only needed for packet capture and blocking. Captures sniff the `bridge` interface.
3. In Technitium, install **Query Logs (Sqlite)** from the App Store.
4. `npm install`, then `npm run geo:update` (re-run monthly), then `npm run dev` and open <http://127.0.0.1:3000>.

The server listens on `127.0.0.1` only, because the page has no login. Endpoints that change the router reject cross-site requests.

IP geolocation by [DB-IP.com](https://db-ip.com) (CC BY 4.0).

## Phases

### Phase 1: live view (done)

- **Goal:** One page listing devices and their current outbound connections, with protocol and a 15-minute traffic chart.
- **Tasks:**
  - [x] Read MikroTik connections and leases, and Technitium query logs
  - [x] Keep only LAN-to-internet IPv4 connections, label protocols by port, attach domains
  - [x] Calculate rates from byte counters between polls
  - [x] Dashboard with totals, chart and filter
- **Validation:** Loading a site on a device shows it within a few seconds with the right name, protocol and rising download bytes.

### Phase 2a: stable list and device page (done)

- **Goal:** The list stops reordering; clicking a device opens a page dedicated to it.
- **Tasks:**
  - [x] Stable sort (name, IP, total traffic, speed), remembered in the browser
  - [x] `/device/<ip>` with per-device chart, breakdowns, sortable connections table and DNS lookups
- **Validation:** The list keeps its order across refreshes; device totals match the main list.

### Phase 2b: where it is hosted (done)

- **Goal:** Each destination shows its country, city and hosting provider.
- **Tasks:**
  - [x] DB-IP Lite databases in `data/geo/` with `npm run geo:update`
  - [x] Location and provider on every connection; IP panel with reverse DNS and outside links
- **Validation:** `1.1.1.1` shows Cloudflare, AS13335, reverse DNS `one.one.one.one`.

### Phase 2c: packet capture (built, waiting for router `write` right)

- **Goal:** Capture packets for a device or one destination, view them, and download a `.pcap`.
- **Tasks:**
  - [x] TZSP receiver on UDP 37008, accepting packets only from the router
  - [x] Capture button for a device or a single connection, sniffing the `bridge` interface for 10–120 s
  - [x] Packet list with direction, TCP flags, TLS server name and DNS names; `.pcap` download
  - [ ] Test against the router
- **Validation:** A 30-second capture while the device loads a site shows packets both ways, and the `.pcap` opens in Wireshark.

### Phase 2d: blocking (built, waiting for router `write` right)

- **Goal:** Block a destination IP, optionally per port and per device, with a comment.
- **Tasks:**
  - [x] Block dialog on each connection; reject or drop rule placed at the top of the forward chain, tagged `brol:`
  - [x] Open matching connections are cut straight away
  - [x] Blocked page and device tab: pause, resume, edit comment, remove
  - [ ] Test against the router
- **Validation:** Blocking a test destination stops it within seconds; removing the rule restores access.

### Phase 3: history (not started)

- **Goal:** Totals for past hours and days, including closed connections.
- **Tasks:** MikroTik traffic-flow (IPFIX) to a small collector, stored locally.
- **Validation:** A connection that ended ten minutes ago still shows with correct byte totals.
