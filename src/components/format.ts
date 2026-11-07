export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatRate(bytesPerSecond: number): string {
  const bits = bytesPerSecond * 8;
  if (bits < 1000) return `${Math.round(bits)} bit/s`;
  if (bits < 1_000_000) return `${(bits / 1000).toFixed(1)} kbit/s`;
  if (bits < 1_000_000_000) return `${(bits / 1_000_000).toFixed(1)} Mbit/s`;
  return `${(bits / 1_000_000_000).toFixed(2)} Gbit/s`;
}

export function flag(countryCode: string): string {
  if (!/^[A-Z]{2}$/.test(countryCode)) return "🌐";
  return String.fromCodePoint(...[...countryCode].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

export function formatTime(value: string | number): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
