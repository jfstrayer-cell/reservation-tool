import { NextRequest } from "next/server";
import { releaseBooking, setPresence } from "../../../../../../src/bookings";
import { getPool, getRestaurant } from "../../../../../../src/server/context";
import { fail, json, staffOnly } from "../../../../../../src/server/http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return staffOnly(async () => {
    const { id } = await ctx.params;
    if (!UUID.test(id)) return fail(400, "bad_id", "Réservation invalide");
    const r = await getRestaurant();
    const { status } = await req.json().catch(() => ({}));
    if (status === "seated" || status === "completed") await setPresence(getPool(), r.id, id, status, "staff");
    else if (status === "cancelled" || status === "no_show") await releaseBooking(getPool(), r.id, id, status, "staff");
    else return fail(400, "bad_status", "Statut invalide");
    return json({ ok: true });
  });
}
