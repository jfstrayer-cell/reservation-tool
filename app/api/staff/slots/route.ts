import { NextRequest } from "next/server";
import { findSlots } from "../../../../src/availability";
import { loadHolds } from "../../../../src/bookings";
import { dayBounds, getPool, getRestaurant } from "../../../../src/server/context";
import { fail, json, staffOnly } from "../../../../src/server/http";

export async function GET(req: NextRequest) {
  return staffOnly(async () => {
    const r = await getRestaurant();
    const zone = r.config.restaurant.timeZone;
    const date = req.nextUrl.searchParams.get("date") ?? "";
    const party = Number(req.nextUrl.searchParams.get("party"));
    let bounds;
    try {
      bounds = dayBounds(date, zone);
    } catch {
      return fail(400, "bad_date", "Date invalide");
    }
    if (!Number.isInteger(party) || party < 1 || party > 20) return fail(400, "bad_party", "Nombre de personnes invalide");
    const holds = await loadHolds(getPool(), r.id, new Date(bounds.from.getTime() - 86_400_000), new Date(bounds.to.getTime() + 86_400_000));
    const result = findSlots(r.config, date, party, holds, { now: new Date(), channel: "staff" });
    if (result.kind !== "slots") return json({ times: [], reason: result.kind });
    return json({ times: result.slots.map((s) => ({ start: s.start.toISOString(), tables: s.tables })) });
  });
}
