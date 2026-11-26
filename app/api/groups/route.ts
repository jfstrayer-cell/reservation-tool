import { NextRequest } from "next/server";
import { createGroupRequest, validateGroupRequest } from "../../../src/groups";
import { getPool, getRestaurant, todayIn } from "../../../src/server/context";
import { fail, json } from "../../../src/server/http";

// Public: anyone can send a group request. Light protections against spam.
const recent = new Map<string, number[]>();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= 5) return fail(429, "too_many", "Trop de demandes envoyées. Réessayez plus tard ou écrivez-nous à info@lesoiseaux.ca.");

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return fail(400, "bad_request", "Requête invalide");
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true }); // honeypot: silently ignore bots

  try {
    const r = await getRestaurant();
    const zone = r.config.restaurant.timeZone;
    const result = validateGroupRequest(body, { today: todayIn(zone), zone });
    if (!result.ok || !result.value) return json({ ok: false, errors: result.errors }, 400);
    hits.push(now);
    recent.set(ip, hits);
    const created = await createGroupRequest(getPool(), r.id, result.value);
    return json({ ok: true, reference: created.registreId, notices: result.notices }, 201);
  } catch (e) {
    console.error(e);
    return fail(500, "server_error", "Erreur du serveur. Écrivez-nous à info@lesoiseaux.ca.");
  }
}
