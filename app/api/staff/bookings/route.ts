import { NextRequest } from "next/server";
import { createBooking, setPresence } from "../../../../src/bookings";
import { getPool, getRestaurant } from "../../../../src/server/context";
import { fail, json, staffOnly } from "../../../../src/server/http";

// Phone bookings and walk-ins, entered by staff.
export async function POST(req: NextRequest) {
  return staffOnly(async () => {
    const r = await getRestaurant();
    const body = await req.json().catch(() => null);
    if (!body) return fail(400, "bad_request", "Requête invalide");
    const partySize = Number(body.partySize);
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) return fail(400, "bad_party", "Nombre de personnes invalide");

    if (body.source === "walk_in") {
      const created = await createBooking(getPool(), r.config, {
        restaurantId: r.id,
        partySize,
        start: new Date(),
        source: "walk_in",
        guest: body.name && body.phone ? { name: String(body.name), phone: String(body.phone) } : undefined,
        actor: "staff",
      });
      await setPresence(getPool(), r.id, created.id, "seated", "staff");
      return json({ booking: created }, 201);
    }

    if (body.source !== "phone") return fail(400, "bad_source", "Type de réservation invalide");
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const start = new Date(body.start);
    if (!name) return fail(400, "missing_name", "Nom requis");
    if (!phone) return fail(400, "missing_phone", "Téléphone requis");
    if (Number.isNaN(start.getTime())) return fail(400, "bad_time", "Heure invalide");

    const created = await createBooking(getPool(), r.config, {
      restaurantId: r.id,
      partySize,
      start,
      source: "phone",
      guest: { name, phone, language: body.language ?? undefined },
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : undefined,
      actor: "staff",
    });
    return json({ booking: created }, 201);
  });
}
