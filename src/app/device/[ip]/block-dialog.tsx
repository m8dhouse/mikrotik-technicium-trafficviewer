"use client";

import { useState } from "react";

export type BlockTarget = {
  device: string;
  deviceName: string;
  destination: string;
  protocol: "" | "tcp" | "udp";
  port: number;
  hint: string;
};

export function BlockDialog({ target, onClose, onDone }: { target: BlockTarget; onClose: () => void; onDone: (message: string) => void }) {
  const [onlyDevice, setOnlyDevice] = useState(true);
  const [onlyPort, setOnlyPort] = useState(Boolean(target.protocol && target.port));
  const [action, setAction] = useState<"reject" | "drop">("reject");
  const [comment, setComment] = useState(`${target.deviceName}${target.hint ? ` → ${target.hint}` : ""}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device: onlyDevice ? target.device : "",
          destination: target.destination,
          protocol: onlyPort ? target.protocol : "",
          port: onlyPort ? target.port : 0,
          action,
          comment,
        }),
      });
      const body = (await response.json()) as { success: boolean; error?: string; data?: { cleared: number } };
      if (!body.success) {
        setError(body.error ?? "Could not add the rule");
        return;
      }
      onDone(`Blocked ${target.destination}${onlyPort ? ` ${target.protocol.toUpperCase()} ${target.port}` : ""}. ${body.data?.cleared ?? 0} open connection(s) cut.`);
    } catch {
      setError("Cannot reach the dashboard server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Block outgoing connection</h2>

        <div className="rounded-lg bg-zinc-50 p-3 font-mono text-sm dark:bg-zinc-800">
          {onlyDevice ? target.device : "any device"} → {target.destination}
          {onlyPort ? ` ${target.protocol.toUpperCase()} ${target.port}` : " (all ports)"}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyDevice} onChange={(event) => setOnlyDevice(event.target.checked)} />
          Only for {target.deviceName}
        </label>
        {target.protocol && target.port > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyPort} onChange={(event) => setOnlyPort(event.target.checked)} />
            Only {target.protocol.toUpperCase()} port {target.port}
          </label>
        )}

        <label className="block text-sm">
          <span className="text-zinc-500">Comment (stored on the router rule)</span>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="block text-sm">
          <span className="text-zinc-500">How</span>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as "reject" | "drop")}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="reject">Reject: the device gets an error straight away</option>
            <option value="drop">Drop: silently discard, the device waits and times out</option>
          </select>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">
            Cancel
          </button>
          <button onClick={submit} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? "Blocking…" : "Block"}
          </button>
        </div>
      </div>
    </div>
  );
}
