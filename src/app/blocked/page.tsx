import Link from "next/link";
import { BlocksTable } from "@/components/blocks-table";

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <Link href="/" className="text-sm text-sky-600 hover:underline dark:text-sky-400">
        ← All devices
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">Blocked connections</h1>
        <p className="text-sm text-zinc-500">Firewall rules created from this dashboard. Click a comment to edit it.</p>
      </header>
      <BlocksTable />
    </main>
  );
}
