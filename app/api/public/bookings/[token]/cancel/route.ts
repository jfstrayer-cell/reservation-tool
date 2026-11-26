import { releaseBooking } from "../../../../../../src/bookings";
import { getPool, getRestaurant } from "../../../../../../src/server/context";
import { fail, json } from "../../../../../../src/server/http";

// The guest cancels from the private link in their confirmation.
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{48}$/.test(token)) return fail(404, "not_found", "Réservation introuvable");
  const r = await getRestaurant();
  const { rows } = await getPool().query("SELECT id, status, starts_at FROM booking WHERE manage_token = $1 AND restaurant_id = $2", [token, r.id]);
  const b = rows[0];
  if (!b) return fail(404, "not_found", "Réservation introuvable");
  if (b.status !== "confirmed") return fail(409, "not_cancellable", "Cette réservation ne peut plus être annulée en ligne. Appelez-nous au 514 849-8844.");
  if (new Date(b.starts_at).getTime() < Date.now()) return fail(409, "past", "L’heure de cette réservation est passée.");
  await releaseBooking(getPool(), r.id, b.id, "cancelled", "guest");
  return json({ ok: true });
}
