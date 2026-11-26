"use client";

import { useEffect, useState } from "react";

interface Summary { start: string; date: string; time: string; partySize: number; status: string; name: string | null }

export default function ManageBooking({ token }: { token: string }) {
  const [b, setB] = useState<Summary | null>(null);
  const [missing, setMissing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/bookings/${token}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setB)
      .catch(() => setMissing(true));
  }, [token]);

  async function cancel() {
    const res = await fetch(`/api/public/bookings/${token}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setB((x) => (x ? { ...x, status: "cancelled" } : x)); setMessage("Votre réservation est annulée. Au plaisir de vous recevoir une autre fois."); }
    else setMessage(data.message ?? "Erreur. Appelez-nous au 514 849-8844.");
  }

  if (missing) return <section className="g-card"><p>Cette réservation est introuvable. Appelez-nous au 514 849-8844.</p></section>;
  if (!b) return <p className="muted">Chargement…</p>;
  const when = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(b.start));
  return (
    <section className="g-card">
      <p><strong>{when}</strong> · {b.partySize} personne{b.partySize > 1 ? "s" : ""}{b.name && ` · ${b.name}`}</p>
      {b.status === "cancelled" ? <p>Réservation annulée.</p> : b.status === "confirmed" ? (
        <>
          <p className="g-help">Pour changer l’heure ou le nombre de personnes, annulez puis réservez de nouveau, ou appelez-nous au 514 849-8844.</p>
          <button className={armed ? "danger" : "ghost"} onClick={() => (armed ? cancel() : setArmed(true))}>{armed ? "Confirmer l’annulation" : "Annuler ma réservation"}</button>
          <p><a href="/reserver">Faire une autre réservation</a></p>
        </>
      ) : <p>Merci de votre visite.</p>}
      {message && <p className="g-notice">{message}</p>}
    </section>
  );
}
