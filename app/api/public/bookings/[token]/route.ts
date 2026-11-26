import { getPool, getRestaurant } from "../../../../../src/server/context";
import { fail, json } from "../../../../../src/server/http";
import { bookingSummary } from "../../../../../src/server/public";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{48}$/.test(token)) return fail(404, "not_found", "Réservation introuvable");
  const r = await getRestaurant();
  const { rows } = await getPool().query(
    "SELECT b.starts_at, b.party_size, b.status, g.name FROM booking b LEFT JOIN guest g ON g.id = b.guest_id WHERE b.manage_token = $1 AND b.restaurant_id = $2",
    [token, r.id],
  );
  if (!rows[0]) return fail(404, "not_found", "Réservation introuvable");
  return json(bookingSummary(rows[0], r.config.restaurant.timeZone));
}
