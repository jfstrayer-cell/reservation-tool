import type { Metadata } from "next";
import { headers } from "next/headers";
import { getRestaurant, todayIn } from "../../src/server/context";
import BookingForm from "./BookingForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Réserver une table — Les Oiseaux de Passage", robots: { index: true } };

// Guest-facing page, opened from Google Maps, lesoiseaux.ca or social media.
// AI assistants can prefill it: /reserver?date=2026-12-04&personnes=4&heure=19:00
export default async function ReservePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const r = await getRestaurant();
  const q = await searchParams;
  const s = r.config.settings;
  const maxParty = (s.largerPartiesRedirect?.minPartySize ?? 11) - 1;
  const host = (await headers()).get("host") ?? "";
  const base = `https://${host}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: r.config.restaurant.name,
    address: { "@type": "PostalAddress", streetAddress: "554, avenue Duluth Est", addressLocality: "Montréal", addressRegion: "QC", addressCountry: "CA" },
    telephone: "+1-514-849-8844",
    acceptsReservations: true,
    potentialAction: {
      "@type": "ReserveAction",
      target: { "@type": "EntryPoint", urlTemplate: `${base}/reserver?date={date}&personnes={partySize}&heure={time}`, inLanguage: "fr-CA" },
      result: { "@type": "FoodEstablishmentReservation", name: "Réservation de table" },
    },
  };
  const party = Number(q.personnes ?? q.party);
  return (
    <main className="wrap g-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {r.config.brand?.logo && <img className="logo g-logo" src={r.config.brand.logo} alt={r.config.restaurant.name} />}
      <h1>Réserver une table</h1>
      <p className="g-intro">Ouvert tous les soirs dès 17 h. En cas de retard, appelez-nous au 514 849-8844.</p>
      <BookingForm
        today={todayIn(r.config.restaurant.timeZone)}
        maxParty={maxParty}
        groupUrl={s.largerPartiesRedirect?.url ?? null}
        initial={{ date: q.date, party: Number.isInteger(party) ? party : undefined, time: q.heure ?? q.time }}
      />
      <p className="g-foot muted">Les Oiseaux de Passage · 554, avenue Duluth Est, Montréal · 514 849-8844</p>
    </main>
  );
}
