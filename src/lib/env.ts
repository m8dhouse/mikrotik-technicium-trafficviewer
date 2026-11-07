import "server-only";

export type Config = {
  mikrotikUrl: string;
  mikrotikUser: string;
  mikrotikPassword: string;
  technitiumUrl: string;
  technitiumToken: string;
};

function read(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export function getConfig(): { success: true; config: Config } | { success: false; error: string } {
  const config: Config = {
    mikrotikUrl: read("MIKROTIK_URL").replace(/\/+$/, ""),
    mikrotikUser: read("MIKROTIK_USERNAME"),
    mikrotikPassword: read("MIKROTIK_PASSWORD"),
    technitiumUrl: read("TECHNITIUM_URL", "TECHNICIIUM_URL").replace(/\/+$/, ""),
    technitiumToken: read("TECHNITIUM_API", "TECHNICIIUM_API"),
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) return { success: false, error: `Missing settings in .env: ${missing.join(", ")}` };

  return { success: true, config };
}
