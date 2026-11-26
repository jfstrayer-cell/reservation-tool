import { NextRequest } from "next/server";
import { markGroupRequest } from "../../../../../src/groups";
import { getPool, getRestaurant } from "../../../../../src/server/context";
import { fail, json, staffOnly } from "../../../../../src/server/http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return staffOnly(async () => {
    const { id } = await ctx.params;
    if (!UUID.test(id)) return fail(400, "bad_id", "Demande invalide");
    const { status } = await req.json().catch(() => ({}));
    if (status !== "traitee" && status !== "demande") return fail(400, "bad_status", "Statut invalide");
    const r = await getRestaurant();
    await markGroupRequest(getPool(), r.id, id, status, "staff");
    return json({ ok: true });
  });
}
