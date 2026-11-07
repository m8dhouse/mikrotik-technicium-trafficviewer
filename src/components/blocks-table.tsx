"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatBytes } from "./format";
import type { BlockRule } from "@/lib/types";

export function BlocksTable({ device, names = {} }: { device?: string; names?: Record<string, string> }) {
  const [rules, setRules] = useState<BlockRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; comment: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/blocks", { cache: "no-store" });
      const body = (await response.json()) as { success: boolean; data?: BlockRule[]; error?: string };
      if (body.success && body.data) {
        setRules(body.data);
        setError(null);
      } else setError(body.error ?? "Could not load rules");
    } catch {
      setError("Cannot reach the dashboard server");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void load();
    };
    run();
    const timer = setInterval(run, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  const change = async (id: string, init: RequestInit) => {
    const response = await fetch(`/api/blocks/${encodeURIComponent(id)}`, { ...init, headers: { "Content-Type": "application/json" } });
    const body = (await response.json()) as { success: boolean; error?: string };
    if (!body.success) setError(body.error ?? "Change failed");
    await load();
  };

  const shown = (rules ?? []).filter((rule) => !device || rule.device === device || rule.device === "");

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500 uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Comment</th>
              <th className="px-3 py-2 font-medium">Device</th>
              <th className="px-3 py-2 font-medium">Destination</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 text-right font-medium">Stopped</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((rule) => (
              <tr key={rule.id} className={`border-t border-zinc-100 dark:border-zinc-800/60 ${rule.disabled ? "opacity-50" : ""}`}>
                <td className="px-3 py-2">
                  {editing?.id === rule.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void change(rule.id, { method: "PATCH", body: JSON.stringify({ comment: editing.comment }) });
                        setEditing(null);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        autoFocus
                        value={editing.comment}
                        onChange={(event) => setEditing({ id: rule.id, comment: event.target.value })}
                        maxLength={200}
                        className="flex-1 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                      />
                      <button className="text-xs text-sky-600">Save</button>
                    </form>
                  ) : (
                    <button onClick={() => setEditing({ id: rule.id, comment: rule.comment })} className="text-left hover:underline" title="Edit comment">
                      {rule.comment || <span className="text-zinc-400">no comment</span>}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {rule.device ? (
                    <Link href={`/device/${rule.device}`} className="text-sky-600 hover:underline dark:text-sky-400">
                      {names[rule.device] ? `${names[rule.device]} (${rule.device})` : rule.device}
                    </Link>
                  ) : (
                    "any device"
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {rule.destination}
                  {rule.port ? ` ${rule.protocol.toUpperCase()} ${rule.port}` : rule.protocol ? ` ${rule.protocol.toUpperCase()}` : ""}
                </td>
                <td className="px-3 py-2 text-xs">{rule.disabled ? "paused" : rule.action}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {rule.packets} pkts · {formatBytes(rule.bytes)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => change(rule.id, { method: "PATCH", body: JSON.stringify({ disabled: !rule.disabled }) })} className="px-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                    {rule.disabled ? "Resume" : "Pause"}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove the block "${rule.comment}"?`)) void change(rule.id, { method: "DELETE" });
                    }}
                    className="px-1 text-xs text-red-600 hover:text-red-800 dark:text-red-400"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {rules && shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  No blocks yet. Use Block on a connection to add one.
                </td>
              </tr>
            )}
            {!rules && !error && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-400">Rules live on the router in the firewall forward chain, tagged “brol:”. Other rules are never touched.</p>
    </div>
  );
}
