import { NextRequest } from "next/server";
import { listDay } from "../../../../src/bookings";
import { dayBounds, getPool, getRestaurant, todayIn } from "../../../../src/server/context";
import { fail, json, staffOnly } from "../../../../src/server/http";

export async function GET(req: NextRequest) {
  return staffOnly(async () => {
    const r = await getRestaurant();
    const zone = r.config.restaurant.timeZone;
    const date = req.nextUrl.searchParams.get("date") ?? todayIn(zone);
    let bounds;
    try {
      bounds = dayBounds(date, zone);
    } catch {
      return fail(400, "bad_date", "Date invalide");
    }
    const bookings = await listDay(getPool(), r.id, bounds.from, bounds.to);
    return json({ date, timeZone: zone, bookings });
  });
}
