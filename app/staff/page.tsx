import { redirect } from "next/navigation";
import { isStaff } from "../../src/server/auth";
import { getRestaurant, todayIn } from "../../src/server/context";
import StaffDay from "./StaffDay";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  if (!(await isStaff())) redirect("/staff/login");
  const r = await getRestaurant();
  const zone = r.config.restaurant.timeZone;
  return <StaffDay today={todayIn(zone)} timeZone={zone} />;
}
