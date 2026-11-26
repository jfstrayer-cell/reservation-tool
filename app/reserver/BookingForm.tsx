"use client";

import { useEffect, useState } from "react";

interface Props {
  today: string;
  maxParty: number;
  groupUrl: string | null;
  initial: { date?: string; party?: number; time?: string };
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayLabel = (d: string) => new Intl.DateTimeFormat("fr-CA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${d}T12:00:00Z`));

export default function BookingForm({ today, maxParty, groupUrl, initial }: Props) {
  const [date, setDate] = useState(initial.date && initial.date >= today ? initial.date : today);
  const [party, setParty] = useState<number | null>(initial.party && initial.party <= maxParty ? initial.party : null);
  const [times, setTimes] = useState<{ start: string; time: string }[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [start, setStart] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "", website: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ start: string; partySize: number; manageUrl: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const sizes = Array.from({ length: maxParty }, (_, i) => i + 1);

  useEffect(() => {
    if (!party) return;
    setTimes(null);
    setClosed(false);
    setStart(null);
    fetch(`/api/public/availability?date=${date}&party=${party}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setTimes(d.times ?? []);
        setClosed(!!d.closed);
        if (initial.time) {
          const match = (d.times ?? []).find((t: { time: string }) => t.time === initial.time);
          if (match) setStart(match.start);
        }
      })
      .catch(() => setTimes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!party || !start) return;
    setBusy(true);
    setFailure(null);
    setErrors({});
    const res = await fetch("/api/public/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, partySize: party, start, language: "fr" }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setFailure("Connexion impossible. Réessayez dans un instant.");
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return setDone(data);
    if (data.errors) return setErrors(data.errors);
    setFailure(data.message ?? "Erreur. Appelez-nous au 514 849-8844.");
    if (res.status === 409) setDate((d) => d); // refresh times
  }

  if (done) {
    const fmt = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    return (
      <section className="g-card g-done">
        <h2>Votre table est réservée.</h2>
        <p>{fmt.format(new Date(done.start))} · {done.partySize} personne{done.partySize > 1 ? "s" : ""}</p>
        <p>Pour modifier ou annuler, gardez ce lien : <a href={done.manageUrl}>gérer ma réservation</a>.</p>
        <p className="muted">Les Oiseaux de Passage · 554, avenue Duluth Est · 514 849-8844</p>
      </section>
    );
  }

  return (
    <form className="g-card" onSubmit={submit} noValidate aria-label="Réserver une table">
      <fieldset>
        <legend>Date</legend>
        <div className="times">
          <button type="button" className={date === today ? "chip on" : "chip"} onClick={() => setDate(today)}>Ce soir</button>
          <button type="button" className={date === addDays(today, 1) ? "chip on" : "chip"} onClick={() => setDate(addDays(today, 1))}>Demain</button>
          <input type="date" className="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Autre date" />
        </div>
        <p className="g-help">{dayLabel(date)}</p>
      </fieldset>

      <fieldset>
        <legend>Personnes</legend>
        <div className="party-picker">
          {sizes.map((n) => (
            <button type="button" key={n} className={party === n ? "chip on" : "chip"} onClick={() => setParty(n)} aria-pressed={party === n}>{n}</button>
          ))}
          {groupUrl && <a className="chip group as-chip" href={groupUrl}>{maxParty + 1}+</a>}
        </div>
        {groupUrl && <p className="g-help">Groupes de plus de {maxParty} personnes : <a href={groupUrl}>demande de groupe</a></p>}
      </fieldset>

      {party && (
        <fieldset>
          <legend>Heure</legend>
          {times === null && <p className="muted">Recherche des tables libres…</p>}
          {times?.length === 0 && <p className="muted">{closed ? "Le restaurant est fermé ce jour-là." : "Plus de table libre ce jour-là. Essayez une autre date, ou appelez-nous au 514 849-8844."}</p>}
          <div className="times">
            {times?.map((t) => (
              <button type="button" key={t.start} className={start === t.start ? "chip on" : "chip"} onClick={() => setStart(t.start)} aria-pressed={start === t.start}>
                {t.time.replace(":", " h ")}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {start && (
        <fieldset>
          <legend>Vos coordonnées</legend>
          <label>Nom<input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />{errors.name && <span className="g-error">{errors.name}</span>}</label>
          <div className="g-row">
            <label>Courriel<input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />{errors.email && <span className="g-error">{errors.email}</span>}</label>
            <label>Téléphone<input type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          </div>
          <p className="g-help">Un courriel ou un téléphone suffit : il sert à confirmer la réservation et à vous joindre en cas d’imprévu.</p>
          {errors.contact && <span className="g-error">{errors.contact}</span>}
          <label><span>Note <small>(allergie, occasion…)</small></span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <input className="g-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          {failure && <div className="error" role="alert">{failure}</div>}
          <button className="primary g-submit" disabled={busy}>{busy ? "Réservation…" : "Réserver"}</button>
        </fieldset>
      )}
    </form>
  );
}
