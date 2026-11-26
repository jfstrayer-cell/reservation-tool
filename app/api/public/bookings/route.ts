import { NextRequest } from "next/server";
import { createBooking } from "../../../../src/bookings";
import { getPool, getRestaurant } from "../../../../src/server/context";
import { fail, json } from "../../../../src/server/http";
import { clientIp, onlineTimes, rateLimited } from "../../../../src/server/public";

// Guests (or their AI assistant) booking a table themselves.
export async function POST(req: NextRequest) {
  if (rateLimited(clientIp(req.headers), "book", 10, 3_600_000)) return fail(429, "too_many", "Trop de réservations envoyées. Appelez-nous au 514 849-8844.");
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return fail(400, "bad_request", "Requête invalide");
  if (typeof b.website === "string" && b.website.trim()) return json({ ok: true }); // honeypot

  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const name = text(b.name, 120);
  const email = text(b.email, 200).toLowerCase();
  const phone = text(b.phone, 40);
  const party = Number(b.partySize);
  const start = new Date(b.start);
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Votre nom est requis.";
  if (!email && !phone) errors.contact = "Laissez un courriel ou un téléphone, pour la confirmation et en cas d’imprévu.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Courriel invalide.";
  if (!Number.isInteger(party) || party < 1) errors.partySize = "Nombre de personnes invalide.";
  if (Number.isNaN(start.getTime())) errors.start = "Choisissez une heure.";
  if (Object.keys(errors).length) return json({ ok: false, errors }, 400);

  try {
    const r = await getRestaurant();
    const zone = r.config.restaurant.timeZone;
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
    // Only times the page would offer: within hours, after the cut-off, with a free table.
    const offered = await onlineTimes(getPool(), r, date, party);
    if (offered.kind === "group_request") return json({ ok: false, groupRequest: { url: r.config.settings.largerPartiesRedirect?.url ?? null } }, 400);
    if (offered.kind !== "slots" || !offered.slots.some((s) => s.start.getTime() === start.getTime()))
      return fail(409, "slot_unavailable", "Cette heure n’est plus disponible. Choisissez-en une autre.");

    const created = await createBooking(getPool(), r.config, {
      restaurantId: r.id,
      partySize: party,
      start,
      source: "online",
      guest: { name, email: email || undefined, phone: phone || undefined, language: b.language === "en" ? "en" : "fr" },
      notes: text(b.notes, 500) || undefined,
      actor: "guest",
    });
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const origin = host && !host.startsWith("localhost") ? `https://${host}` : req.nextUrl.origin;
    return json({ ok: true, start: created.start.toISOString(), partySize: party, manageUrl: `${origin}/reservation/${created.manageToken}` }, 201);
  } catch (e) {
    if ((e as Error).name === "SlotUnavailableError") return fail(409, "slot_unavailable", "Cette heure vient d’être prise. Choisissez-en une autre.");
    console.error(e);
    return fail(500, "server_error", "Erreur du serveur. Appelez-nous au 514 849-8844.");
  }
}
