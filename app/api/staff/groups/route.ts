import { NextRequest } from "next/server";
import { createGroupRequest, listGroupRequests, validateGroupRequest } from "../../../../src/groups";
import { getPool, getRestaurant, todayIn } from "../../../../src/server/context";
import { json, staffOnly } from "../../../../src/server/http";

export async function GET() {
  return staffOnly(async () => {
    const r = await getRestaurant();
    return json({ requests: await listGroupRequests(getPool(), r.id) });
  });
}

// A group request taken on the phone by staff.
export async function POST(req: NextRequest) {
  return staffOnly(async () => {
    const r = await getRestaurant();
    const zone = r.config.restaurant.timeZone;
    const body = (await req.json().catch(() => ({}))) ?? {};
    const result = validateGroupRequest(body, { today: todayIn(zone), zone, staff: true });
    if (!result.ok || !result.value) return json({ ok: false, errors: result.errors }, 400);
    const created = await createGroupRequest(getPool(), r.id, result.value, "téléphone (personnel)");
    return json({ ok: true, reference: created.registreId, notices: result.notices }, 201);
  });
}
