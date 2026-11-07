"use client";

import { useEffect, useState } from "react";
import { formatBytes } from "@/components/format";
import type { CaptureResponse, CaptureStatus } from "@/lib/types";

export type CaptureTarget = { peer: string; port: number };

export function CapturePanel({ ip, target, onTargetChange }: { ip: string; target: CaptureTarget; onTargetChange: (target: CaptureTarget) => void }) {
  const [seconds, setSeconds] = useState(30);
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);

  const running = capture?.state === "running";
  const captureId = capture?.id;

  useEffect(() => {
    if (!running || !captureId) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      setNow(Date.now());
      try {
        const response = await fetch(`/api/capture/${captureId}`, { cache: "no-store" });
        const body = (await response.json()) as CaptureResponse;
        if (cancelled) return;
        if (body.success) setCapture(body.data);
        else setError(body.error);
      } catch {
        if (!cancelled) setError("Cannot reach the dashboard server");
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [running, captureId]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, peer: target.peer, port: target.port, seconds }),
      });
      const body = (await response.json()) as CaptureResponse;
      if (body.success) {
        setCapture(body.data);
        setNow(Date.now());
      } else setError(body.error);
    } catch {
      setError("Cannot reach the dashboard server");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!capture) return;
    const response = await fetch(`/api/capture/${capture.id}`, { method: "DELETE" });
    const body = (await response.json()) as CaptureResponse;
    if (body.success) setCapture(body.data);
  };

  const remaining = capture && running ? Math.max(0, Math.ceil((capture.endsAt - now) / 1000)) : 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="text-sm">
          <span className="block text-xs text-zinc-500">Destination IP (optional)</span>
          <input
            value={target.peer}
            onChange={(event) => onTargetChange({ ...target, peer: event.target.value.trim() })}
            placeholder="all destinations"
            className="mt-1 w-44 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-zinc-500">Port (optional)</span>
          <input
            value={target.port || ""}
            onChange={(event) => onTargetChange({ ...target, port: Number(event.target.value.replace(/\D/g, "")) || 0 })}
            placeholder="all"
            className="mt-1 w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-zinc-500">Duration</span>
          <select
            value={seconds}
            onChange={(event) => setSeconds(Number(event.target.value))}
            className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {[10, 30, 60, 120].map((value) => (
              <option key={value} value={value}>
                {value} seconds
              </option>
            ))}
          </select>
        </label>
        {running ? (
          <button onClick={stop} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white dark:bg-zinc-200 dark:text-zinc-900">
            Stop ({remaining}s left)
          </button>
        ) : (
          <button onClick={start} disabled={busy} className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50">
            {busy ? "Starting…" : "Start capture"}
          </button>
        )}
        {capture && capture.packetCount > 0 && !running && (
          <a href={`/api/capture/${capture.id}/pcap`} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
            Download .pcap for Wireshark
          </a>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {capture?.error && <p className="text-sm text-red-600">{capture.error}</p>}

      {capture && (
        <p className="text-sm text-zinc-500">
          {running ? "Capturing" : "Captured"} {capture.packetCount} packets ({formatBytes(capture.bytes)})
          {capture.peer ? ` to/from ${capture.peer}` : ""}
          {capture.port ? ` on port ${capture.port}` : ""}
          {capture.packetCount > capture.packets.length ? ` · showing the last ${capture.packets.length}` : ""}
        </p>
      )}

      {capture && capture.packets.length > 0 && (
        <div className="max-h-[32rem] overflow-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 bg-white text-left text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium" />
                <th className="px-3 py-2 font-medium">Proto</th>
                <th className="px-3 py-2 font-medium">Remote</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Flags</th>
                <th className="px-3 py-2 font-medium">Info</th>
              </tr>
            </thead>
            <tbody>
              {capture.packets.map((packet, index) => {
                const outgoing = packet.direction === "out";
                const remote = outgoing ? `${packet.dst}:${packet.dstPort}` : `${packet.src}:${packet.srcPort}`;
                return (
                  <tr key={index} className="border-t border-zinc-100 dark:border-zinc-800/60">
                    <td className="px-3 py-1 whitespace-nowrap text-zinc-500">{((packet.t - capture.startedAt) / 1000).toFixed(3)}s</td>
                    <td className={`px-3 py-1 ${outgoing ? "text-amber-600" : "text-sky-600"}`}>{outgoing ? "↑ out" : "↓ in"}</td>
                    <td className="px-3 py-1">{packet.protocol}</td>
                    <td className="px-3 py-1 whitespace-nowrap">{remote}</td>
                    <td className="px-3 py-1 text-right">{packet.length}</td>
                    <td className="px-3 py-1 whitespace-nowrap text-zinc-500">{packet.flags}</td>
                    <td className="px-3 py-1 break-all">{packet.info}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        The router copies this device’s packets to the dashboard. HTTPS and QUIC are encrypted: you see timing, sizes and the domain in the TLS hello, not
        the content. Open the .pcap in Wireshark for full detail.
      </p>
    </section>
  );
}
