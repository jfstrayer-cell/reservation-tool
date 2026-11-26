"use client";

import { useEffect, useState } from "react";

interface Req {
  id: string; registreId: string; status: string; eventDate: string; alternateDate: string | null; arrivalTime: string | null;
  guestsMin: number; guestsMax: number; occasion: string | null; eventFormat: string; drinks: string; options: string[];
  dietaryNotes: string | null; message: string | null; contactName: string; organisation: string | null; email: string;
  phone: string | null; createdAt: string;
}

const FORMAT: Record<string, string> = { souper: "Souper servi à table", cocktail: "Cocktail dînatoire", autre: "Autre" };
const DRINKS: Record<string, string> = { apportez: "Apportez votre vin", service: "Service du vin", a_discuter: "Boissons à discuter" };
const OPTIONS: Record<string, string> = { gateau: "gâteau", musiciens: "musique", decoration: "décoration", ecran: "écran/karaoké", verres: "verres", plan_de_table: "plan de table" };
const fmtDate = (d: string) => new Intl.DateTimeFormat("fr-CA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${d}T12:00:00Z`));

function hoursSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
}

export default function GroupRequests() {
  const [items, setItems] = useState<Req[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/staff/groups", { cache: "no-store" });
    if (res.status === 401) { window.location.href = "/staff/login"; return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.message ?? "Erreur");
    setItems(data.requests);
  }
  useEffect(() => { load(); }, []);

  async function mark(id: string, status: "traitee" | "demande") {
    await fetch(`/api/staff/groups/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }

  return (
    <main className="wrap">
      <header className="top">
        <img className="logo" src="/brand/les-oiseaux.svg" alt="Les Oiseaux de Passage" />
        <div className="daynav"><a className="ghost back" href="/staff">‹ Réservations</a><div className="day"><strong>Demandes de groupe</strong></div><span /></div>
        <p className="totals">Salle privée du 552 · réponse complète visée en 48 h</p>
      </header>
      {error && <div className="error">{error}</div>}
      {items === null && <p className="muted">Chargement…</p>}
      {items?.length === 0 && <p className="muted">Aucune demande pour l’instant.</p>}
      <ul className="list">
        {items?.map((r) => {
          const h = hoursSince(r.createdAt);
          const waiting = r.status === "demande";
          return (
            <li key={r.id} className={`row g-req ${waiting ? (h >= 48 ? "is-late" : h >= 24 ? "ask-noshow" : "") : "completed"}`}>
              <div className="who" style={{ gridColumn: "1 / -1" }}>
                <div className="name">{r.contactName}{r.organisation && <span className="party">{r.organisation}</span>}</div>
                <div className="meta">
                  {fmtDate(r.eventDate)}{r.arrivalTime && ` · ${r.arrivalTime.replace(":", " h ")}`}
                  {" · "}{r.guestsMin === r.guestsMax ? r.guestsMin : `${r.guestsMin} à ${r.guestsMax}`} convives
                  {r.alternateDate && ` · rechange : ${fmtDate(r.alternateDate)}`}
                </div>
                <div className="meta">{FORMAT[r.eventFormat]} · {DRINKS[r.drinks]}{r.options.length > 0 && ` · ${r.options.map((o) => OPTIONS[o] ?? o).join(", ")}`}{r.occasion && ` · ${r.occasion}`}</div>
                <div className="meta"><a href={`mailto:${r.email}`}>{r.email}</a>{r.phone && <> · <a href={`tel:${r.phone}`}>{r.phone}</a></>} · Registre : {r.registreId}</div>
                {r.dietaryNotes && <div className="notes">Allergies : {r.dietaryNotes}</div>}
                {r.message && <div className="notes">{r.message}</div>}
              </div>
              <div className="buttons" style={{ gridColumn: "1 / -1" }}>
                {waiting ? (
                  <>
                    <span className={`badge ${h >= 48 ? "late" : h >= 24 ? "noshow" : "seated"}`}>Reçue il y a {h < 1 ? "moins d’une heure" : `${h} h`}</span>
                    <button className="ok" onClick={() => mark(r.id, "traitee")}>Offre envoyée</button>
                  </>
                ) : (
                  <button className="ghost" onClick={() => mark(r.id, "demande")}>Remettre en attente</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
