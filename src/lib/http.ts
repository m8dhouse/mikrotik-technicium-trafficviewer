import "server-only";

type Options = {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
};

export type Result<T> = { success: true; data: T } | { success: false; error: string };

export async function getJson<T>(
  url: string,
  { method = "GET", body, headers = {}, timeoutMs = 5000, retries = method === "GET" ? 2 : 0 }: Options = {},
): Promise<Result<T>> {
  let lastError = "Unknown error";

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));

    try {
      const response = await fetch(url, {
        method,
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        return { success: false, error: `Login refused (HTTP ${response.status})` };
      }
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const detail = (() => {
          try {
            return (JSON.parse(text) as { detail?: string; message?: string }).detail;
          } catch {
            return "";
          }
        })();
        lastError = detail ? `${detail} (HTTP ${response.status})` : `HTTP ${response.status}`;
        if (response.status < 500) break;
        continue;
      }

      const text = await response.text();
      return { success: true, data: (text ? JSON.parse(text) : null) as T };
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause;
      lastError = cause?.code ?? (error instanceof Error ? error.message : String(error));
    }
  }

  return { success: false, error: lastError };
}
