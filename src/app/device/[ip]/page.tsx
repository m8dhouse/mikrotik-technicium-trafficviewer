import { Suspense } from "react";
import DeviceDashboard from "./device-dashboard";

export default function Page({ params }: PageProps<"/device/[ip]">) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-zinc-500">Loading…</p>}>
      {params.then(({ ip }) => (
        <DeviceDashboard ip={decodeURIComponent(ip)} />
      ))}
    </Suspense>
  );
}
