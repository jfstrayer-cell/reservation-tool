import { redirect } from "next/navigation";
import { isStaff } from "../../../../src/server/auth";
import { getRestaurant, todayIn } from "../../../../src/server/context";
import GroupForm from "../../../groupes/GroupForm";

export const dynamic = "force-dynamic";

// Staff taking a group request on the phone: same questions, a phone number is enough.
export default async function StaffNewGroupPage() {
  if (!(await isStaff())) redirect("/staff/login");
  const r = await getRestaurant();
  return (
    <main className="wrap g-page">
      <header className="top">
        <img className="logo" src="/brand/les-oiseaux.svg" alt={r.config.restaurant.name} />
        <div className="daynav"><a className="ghost back" href="/staff">‹ Réservations</a><div className="day"><strong>Nouvelle demande de groupe</strong></div><span /></div>
        <p className="totals">Salle privée du 552 · 11 à 40 convives</p>
      </header>
      <GroupForm today={todayIn(r.config.restaurant.timeZone)} mode="staff" />
    </main>
  );
}
