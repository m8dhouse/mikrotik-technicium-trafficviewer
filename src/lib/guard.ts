import "server-only";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function rejectCrossSite(request: Request): Response | null {
  const deny = (reason: string) => Response.json({ success: false, error: reason }, { status: 403 });

  const host = request.headers.get("host") ?? "";
  if (!LOCAL_HOSTS.has(host.replace(/:\d+$/, ""))) return deny("Only allowed from this computer");

  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return deny("Cross-site request blocked");

  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== host) return deny("Cross-site request blocked");

  if (request.method !== "DELETE" && !request.headers.get("content-type")?.includes("application/json")) {
    return deny("JSON body required");
  }
  return null;
}
