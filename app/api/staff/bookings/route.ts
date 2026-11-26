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
        guest: typeof body.name === "string" && body.name.trim() ? { name: body.name.trim().slice(0, 120) } : undefined,
        actor: "staff",
      });
      await setPresence(getPool(), r.id, created.id, "seated", "staff");
      return json({ booking: created }, 201);
    }

    if (body.source !== "phone") return fail(400, "bad_source", "Type de réservation invalide");
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const name = text(body.name, 120);
    const phone = text(body.phone, 40);
    const email = text(body.email, 200).toLowerCase();
    const start = new Date(body.start);
    if (!name) return fail(400, "missing_name", "Un nom ou un prénom suffit, mais il est requis");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, "bad_email", "Courriel invalide");
    if (Number.isNaN(start.getTime())) return fail(400, "bad_time", "Heure invalide");
    const groupFrom = r.config.settings.largerPartiesRedirect?.minPartySize ?? 11;
    if (partySize >= groupFrom) return fail(400, "group_request", "Groupe de plus de 10 : salle privée du 552, formulaire de groupe");

    const created = await createBooking(getPool(), r.config, {
      restaurantId: r.id,
      partySize,
      start,
      source: "phone",
      guest: { name, phone: phone || undefined, email: email || undefined, language: body.language ?? undefined },
      notes: text(body.notes, 500) || undefined,
      actor: "staff",
    });
    return json({ booking: created }, 201);
  });
}
