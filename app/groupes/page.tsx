import type { Metadata } from "next";
import { getRestaurant, todayIn } from "../../src/server/context";
import GroupForm from "./GroupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Groupes et salle privée — Les Oiseaux de Passage", robots: { index: true } };

export default async function GroupsPage() {
  const r = await getRestaurant();
  return (
    <main className="wrap g-page">
      {r.config.brand?.logo && <img className="logo g-logo" src={r.config.brand.logo} alt={r.config.restaurant.name} />}
      <h1>Groupes et salle privée</h1>
      <p className="g-intro">
        Notre salle privée du 552, avenue Duluth Est, reçoit les groupes de 11 à 40 convives : soupers, cocktails dînatoires,
        réceptions avec votre traiteur, concerts. Parlez-nous de votre événement ; nous vous revenons avec une offre complète.
      </p>
      <GroupForm today={todayIn(r.config.restaurant.timeZone)} />
      <p className="g-foot muted">Les Oiseaux de Passage · 554–552, avenue Duluth Est, Montréal · 514 849-8844</p>
    </main>
  );
}
