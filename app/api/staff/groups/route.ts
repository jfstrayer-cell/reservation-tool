import { listGroupRequests } from "../../../../src/groups";
import { getPool, getRestaurant } from "../../../../src/server/context";
import { json, staffOnly } from "../../../../src/server/http";

export async function GET() {
  return staffOnly(async () => {
    const r = await getRestaurant();
    return json({ requests: await listGroupRequests(getPool(), r.id) });
  });
}
