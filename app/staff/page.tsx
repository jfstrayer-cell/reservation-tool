import { redirect } from "next/navigation";
import { isStaff } from "../../src/server/auth";
import { getRestaurant, todayIn } from "../../src/server/context";
import StaffDay, { StaffSettings } from "./StaffDay";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  if (!(await isStaff())) redirect("/staff/login");
  const r = await getRestaurant();
  const s = r.config.settings;
  const redirectTo = s.largerPartiesRedirect;
  const settings: StaffSettings = {
    timeZone: r.config.restaurant.timeZone,
    restaurantName: r.config.restaurant.name,
    logo: r.config.brand?.logo ?? null,
    lateBadgeMinutes: s.lateBadgeMinutes,
    noShowPromptMinutes: s.noShowPromptMinutes,
    maxPartySize: (redirectTo?.minPartySize ?? 11) - 1,
    groupUrl: "/staff/groupes/nouvelle",
  };
  return <StaffDay today={todayIn(settings.timeZone)} settings={settings} />;
}
