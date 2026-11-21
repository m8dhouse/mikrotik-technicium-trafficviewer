import type { HistoryPoint, LinkInfo } from "@/lib/types";
import { formatRate } from "./format";

export function Chart({ points, height = 120 }: { points: HistoryPoint[]; height?: number }) {
  const width = 800;
  if (points.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-sm text-zinc-500">
        Collecting data…
      </div>
    );
  }

  const max = Math.max(1, ...points.map((point) => Math.max(point.up, point.down)));
  const start = points[0].t;
  const span = Math.max(1, points[points.length - 1].t - start);
  const path = (key: "up" | "down") =>
    points
      .map((point, index) => {
        const x = ((point.t - start) / span) * width;
        const y = height - (point[key] / max) * (height - 8) - 4;
        return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} className="w-full">
        <path d={`${path("down")} L${width},${height} L0,${height} Z`} className="fill-sky-500/15" />
        <path d={path("down")} className="fill-none stroke-sky-500" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path d={path("up")} className="fill-none stroke-amber-500" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute top-0 right-0 text-xs text-zinc-500">peak {formatRate(max)}</span>
    </div>
  );
}

export function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`font-mono text-lg ${className}`}>{value}</div>
    </div>
  );
}

const LINK_STYLE: Record<LinkInfo["kind"], { icon: string; label: string; className: string }> = {
  wifi: { icon: "📶", label: "Wi-Fi", className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  wired: { icon: "🔌", label: "Wired", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  switch: { icon: "🔀", label: "Via switch", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  unknown: { icon: "❔", label: "Unknown link", className: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
};

export function LinkBadge({ link, detailed = false }: { link: LinkInfo; detailed?: boolean }) {
  const style = LINK_STYLE[link.kind];
  const where = [link.port, detailed ? link.via : ""].filter(Boolean).join(" → ");
  const title = [`${style.label}: ${link.reason}`, link.via ? `Neighbour: ${link.via}` : "", link.privateMac ? "Uses a private (randomised) MAC address" : ""]
    .filter(Boolean)
    .join("\n");

  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${style.className}`}>
      <span>{style.icon}</span>
      <span>{style.label}</span>
      {where && <span className="opacity-75">· {where}</span>}
      {detailed && link.privateMac && <span className="opacity-75">· private MAC</span>}
    </span>
  );
}

export function Status({ label, ok, error }: { label: string; ok: boolean; error?: string }) {
  return (
    <span title={error} className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${ok && !error ? "bg-emerald-500" : ok ? "bg-amber-500" : "bg-red-500"}`} />
      {label}
    </span>
  );
}