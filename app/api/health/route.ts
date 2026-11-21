import { getPool } from "../../../src/server/context";

export const dynamic = "force-dynamic";

// Used by Cloud Run and uptime monitoring: OK only if the database answers.
export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
