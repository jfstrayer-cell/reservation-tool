import type { Metadata } from "next";
import ManageBooking from "./ManageBooking";

export const metadata: Metadata = { title: "Ma réservation — Les Oiseaux de Passage", robots: { index: false } };

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="wrap g-page">
      <img className="logo g-logo" src="/brand/les-oiseaux.svg" alt="Les Oiseaux de Passage" />
      <h1>Ma réservation</h1>
      <ManageBooking token={token} />
      <p className="g-foot muted">Les Oiseaux de Passage · 554, avenue Duluth Est, Montréal · 514 849-8844</p>
    </main>
  );
}
