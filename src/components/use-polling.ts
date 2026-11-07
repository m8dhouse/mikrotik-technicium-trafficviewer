"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type Envelope<T> = { success: true; data: T } | { success: false; error: string };

export function usePolling<T>(url: string, intervalMs: number, paused = false) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(url, { cache: "no-store" });
        const result = (await response.json()) as Envelope<T>;
        if (cancelled) return;
        if (result.success) {
          setData(result.data);
          setError(null);
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Cannot reach the dashboard server");
      }
    }

    poll();
    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, intervalMs, paused]);

  return { data, error };
}

const STORAGE_EVENT = "local-storage-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

export function useStoredState<T extends string>(key: string, initial: T): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (window.localStorage.getItem(key) as T | null) ?? initial,
    () => initial,
  );

  const update = (next: T) => {
    window.localStorage.setItem(key, next);
    window.dispatchEvent(new Event(STORAGE_EVENT));
  };
  return [value, update];
}
