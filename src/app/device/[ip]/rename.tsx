"use client";

import { useState } from "react";

export function DeviceTitle({ ip, name, onSaved }: { ip: string; name: string; onSaved: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/device/${ip}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      const body = (await response.json()) as { success: boolean; error?: string; data?: { where: string; madeStatic: boolean } };
      if (!body.success) {
        setError(body.error ?? "Could not save the name");
        return;
      }
      setEditing(false);
      const where = body.data?.where === "lease" ? "the DHCP lease comment" : "the router address list “brol-names”";
      onSaved(`Name saved to ${where}${body.data?.madeStatic ? "; the lease is now static, so this device keeps its IP address" : ""}.`);
    } catch {
      setError("Cannot reach the dashboard server");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <h1 className="flex items-center gap-2 text-2xl font-semibold">
        {name}
        <button
          onClick={() => {
            setValue(name === ip ? "" : name);
            setEditing(true);
          }}
          className="rounded px-1.5 text-sm font-normal text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Rename this device (saved on the router)"
        >
          ✎ Rename
        </button>
      </h1>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-1"
    >
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setEditing(false)}
          maxLength={64}
          placeholder="e.g. Kitchen tablet"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xl font-semibold dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button disabled={busy} className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          Cancel
        </button>
      </div>
      <p className="text-xs text-zinc-500">Saved on the router as the DHCP lease comment. A dynamic lease is made static so the name sticks. Leave empty to clear.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
