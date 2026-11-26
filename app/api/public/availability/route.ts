import { NextRequest } from "next/server";
import { getPool, getRestaurant } from "../../../../src/server/context";
import { fail, json } from "../../../../src/server/http";
import { clientIp, onlineTimes, rateLimited } from "../../../../src/server/public";

// Public, documented in docs/03-public-api.md. Usable by the booking page and by AI assistants.
export async function GET(req: NextRequest) {
  if (rateLimited(clientIp(req.headers), "avail", 120, 60_000)) return fail(429, "too_many", "Too many requests");
  const date = req.nextUrl.searchParams.get("date") ?? "";
  const party = Number(req.nextUrl.searchParams.get("party") ?? req.nextUrl.searchParams.get("personnes"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, "bad_date", "date must be YYYY-MM-DD");
  if (!Number.isInteger(party) || party < 1 || party > 200) return fail(400, "bad_party", "party must be a whole number");
  try {
    const r = await getRestaurant();
    const result = await onlineTimes(getPool(), r, date, party);
    const groupUrl = r.config.settings.largerPartiesRedirect?.url ?? null;
    if (result.kind === "group_request") return json({ date, party, times: [], groupRequest: { url: groupUrl, reason: "Groups of more than 10 book the private room" } });
    if (result.kind === "closed") return json({ date, party, times: [], closed: true });
    const zone = r.config.restaurant.timeZone;
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return json({ date, party, timeZone: zone, times: result.slots.map((s) => ({ start: s.start.toISOString(), time: fmt.format(s.start) })) });
  } catch (e) {
    console.error(e);
    return fail(500, "server_error", "Server error");
  }
}
