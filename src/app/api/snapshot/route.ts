import { getSnapshot } from "@/lib/snapshot";

export async function GET() {
  try {
    const result = await getSnapshot();
    return Response.json(result, { status: result.success ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
