"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "confirmed" | "late" | "seated" | "completed" | "no_show" | "cancelled";
interface Booking {
  id: string;
  start: string;
  end: string;
  partySize: number;
  status: Status;
  source: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  tables: string[];
}

export interface StaffSettings {
  timeZone: string;
  restaurantName: string;
  logo: string | null;
  lateBadgeMinutes: number;
  noShowPromptMinutes: number;
  maxPartySize: number;
  groupUrl: string | null;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function StaffDay({ today, settings }: { today: string; settings: StaffSettings }) {
  const { timeZone } = settings;
  const sizes = Array.from({ length: settings.maxPartySize }, (_, i) => i + 1);
  const [date, setDate] = useState(today);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "walkin" | "phone">("none");
  const [now, setNow] = useState(() => Date.now());

  const time = useMemo(() => new Intl.DateTimeFormat("fr-CA", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }), [timeZone]);
  const dayLabel = useMemo(
    () => new Intl.DateTimeFormat("fr-CA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00Z`)),
    [date],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/day?date=${date}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/staff/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setBookings(data.bookings);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Connexion perdue — nouvel essai dans quelques secondes");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    load();
    const refresh = setInterval(load, 20_000); // new online bookings appear on their own
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [load]);

  async function setStatus(id: string, status: Status) {
    setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, status } : b))); // instant on screen
    const res = await fetch(`/api/staff/bookings/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).message ?? "Erreur");
    load();
  }

  const active = bookings.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
  const covers = active.reduce((n, b) => n + b.partySize, 0);
  const closed = bookings.filter((b) => b.status === "cancelled" || b.status === "no_show");

  return (
    <main className="wrap">
      <header className="top">
        {settings.logo && <img className="logo" src={settings.logo} alt={settings.restaurantName} />}
        <div className="daynav">
          <button className="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="Jour précédent">‹</button>
          <div className="day">
            <strong>{dayLabel}</strong>
            {date !== today && (
              <button className="link" onClick={() => setDate(today)}>Aujourd’hui</button>
            )}
          </div>
          <button className="ghost" onClick={() => setDate(addDays(date, 1))} aria-label="Jour suivant">›</button>
        </div>
        <a className="groups-link" href="/staff/groupes">Demandes de groupe ›</a>
        <div className="totals">
          {active.length} réservation{active.length > 1 ? "s" : ""} · {covers} couvert{covers > 1 ? "s" : ""}
        </div>
      </header>

      <div className="actions">
        <button className="primary" onClick={() => setPanel(panel === "walkin" ? "none" : "walkin")}>+ Sans réservation</button>
        <button className="primary" onClick={() => setPanel(panel === "phone" ? "none" : "phone")}>+ Réservation tél.</button>
      </div>

      {panel === "walkin" && <WalkIn sizes={sizes} groupUrl={settings.groupUrl} onDone={() => { setPanel("none"); if (date !== today) setDate(today); else load(); }} onError={setError} />}
      {panel === "phone" && (
        <PhoneBooking
          initialDate={date}
          today={today}
          sizes={sizes}
          groupUrl={settings.groupUrl}
          time={time}
          onDone={(bookedDate) => { setPanel("none"); if (bookedDate !== date) setDate(bookedDate); else load(); }}
          onError={setError}
        />
      )}

      {error && <div className="error" role="alert">{error}</div>}
      {loading && <p className="muted">Chargement…</p>}
      {!loading && active.length === 0 && <p className="muted">Aucune réservation pour cette journée.</p>}

      <ul className="list">
        {active.map((b) => {
          const waiting = b.status === "confirmed" || b.status === "late";
          const minutesLate = waiting ? Math.floor((now - new Date(b.start).getTime()) / 60_000) : 0;
          const late = waiting && minutesLate >= settings.lateBadgeMinutes;
          const askNoShow = waiting && minutesLate >= settings.noShowPromptMinutes;
          return (
            <li key={b.id} className={`row ${b.status} ${late ? "is-late" : ""} ${askNoShow ? "ask-noshow" : ""}`}>
              <div className="when">{time.format(new Date(b.start))}</div>
              <div className="who">
                <div className="name">
                  {b.name ?? (b.source === "walk_in" ? "Sans réservation" : "—")}
                  <span className="party">{b.partySize} pers.</span>
                </div>
                <div className="meta">
                  {b.tables.join(" + ")}
                    {b.phone && <> · <a href={`tel:${b.phone}`}>{b.phone}</a></>}
                  {!b.phone && b.email && <> · {b.email}</>}
                  {!b.phone && !b.email && b.source === "phone" && " · sans coordonnées"}
                  {b.source === "online" && " · en ligne"}
                  {b.source === "phone" && " · tél."}
                </div>
                {b.notes && <div className="notes">{b.notes}</div>}
              </div>
              <div className="state">
                {b.status === "seated" && <span className="badge seated">Arrivé</span>}
                {b.status === "completed" && <span className="badge done">Parti</span>}
                {late && !askNoShow && <span className="badge late">En retard · {minutesLate} min</span>}
                {askNoShow && <span className="badge noshow">Absent ? · {minutesLate} min</span>}
              </div>
              <div className="buttons">
                {(b.status === "confirmed" || b.status === "late") && (
                  <>
                    <button className="ok" onClick={() => setStatus(b.id, "seated")}>Arrivé</button>
                    <TwoTap label="Absent" onConfirm={() => setStatus(b.id, "no_show")} />
                    <TwoTap label="Annuler" onConfirm={() => setStatus(b.id, "cancelled")} />
                  </>
                )}
                {b.status === "seated" && <button className="ghost" onClick={() => setStatus(b.id, "completed")}>Parti</button>}
              </div>
            </li>
          );
        })}
      </ul>

      {closed.length > 0 && (
        <details className="closed">
          <summary>Annulées et absents ({closed.length})</summary>
          <ul>
            {closed.map((b) => (
              <li key={b.id}>
                {time.format(new Date(b.start))} · {b.name ?? "—"} · {b.partySize} pers. · {b.status === "no_show" ? "absent" : "annulée"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}

/** A button that asks for a second tap instead of a pop-up. */
function TwoTap({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={armed ? "danger" : "ghost"} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? "Confirmer ?" : label}
    </button>
  );
}

function PartyPicker({ sizes, value, onPick, onGroup }: { sizes: number[]; value: number | null; onPick: (n: number) => void; onGroup: () => void }) {
  return (
    <div className="party-picker">
      {sizes.map((n) => (
        <button type="button" key={n} className={value === n ? "chip on" : "chip"} onClick={() => onPick(n)}>{n}</button>
      ))}
      <button type="button" className="chip group" onClick={onGroup}>{sizes.length + 1}+</button>
    </div>
  );
}

function GroupNotice({ groupUrl, max }: { groupUrl: string | null; max: number }) {
  return (
    <div className="group-notice">
      Groupes de plus de {max} personnes : {groupUrl ? <a href={groupUrl} target="_blank" rel="noreferrer">demande de groupe</a> : "demande de groupe"}
    </div>
  );
}

function WalkIn({ sizes, groupUrl, onDone, onError }: { sizes: number[]; groupUrl: string | null; onDone: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState(false);
  async function seat(partySize: number) {
    setBusy(true);
    const res = await fetch("/api/staff/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "walk_in", partySize }) });
    setBusy(false);
    if (!res.ok) return onError((await res.json().catch(() => ({}))).message ?? "Aucune table libre maintenant");
    onDone();
  }
  return (
    <section className="panel">
      <h2>Sans réservation — combien de personnes ?</h2>
      <p className="muted">Un toucher : la meilleure table libre est attribuée et le client est noté comme arrivé.</p>
      <fieldset disabled={busy}><PartyPicker sizes={sizes} value={null} onPick={seat} onGroup={() => setGroup(true)} /></fieldset>
      {group && <GroupNotice groupUrl={groupUrl} max={sizes.length} />}
    </section>
  );
}

function PhoneBooking({ initialDate, today, sizes, groupUrl, time, onDone, onError }: {
  initialDate: string; today: string; sizes: number[]; groupUrl: string | null; time: Intl.DateTimeFormat;
  onDone: (date: string) => void; onError: (m: string) => void;
}) {
  const [date, setDate] = useState(initialDate < today ? today : initialDate);
  const [party, setParty] = useState<number | null>(null);
  const [group, setGroup] = useState(false);
  const [times, setTimes] = useState<{ start: string; tables: string[] }[] | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!party) return;
    setTimes(null);
    setStart(null);
    fetch(`/api/staff/slots?date=${date}&party=${party}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTimes(d.times ?? []))
      .catch(() => setTimes([]));
  }, [party, date]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!party || !start) return;
    setBusy(true);
    const res = await fetch("/api/staff/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "phone", partySize: party, start, name, phone, email, notes }),
    });
    setBusy(false);
    if (!res.ok) return onError((await res.json().catch(() => ({}))).message ?? "Erreur");
    onDone(date);
  }

  return (
    <form className="panel" onSubmit={save}>
      <h2>Réservation par téléphone</h2>
      <label className="step" htmlFor="booking-date">Date</label>
      <input id="booking-date" type="date" className="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      <label className="step">Personnes</label>
      <PartyPicker sizes={sizes} value={party} onPick={(n) => { setGroup(false); setParty(n); }} onGroup={() => { setParty(null); setGroup(true); }} />
      {group && <GroupNotice groupUrl={groupUrl} max={sizes.length} />}
      {party && (
        <>
          <label className="step">Heure</label>
          {times === null && <p className="muted">Recherche des heures libres…</p>}
          {times?.length === 0 && <p className="muted">Aucune heure libre ce jour-là pour {party} personne{party > 1 ? "s" : ""}.</p>}
          <div className="times">
            {times?.map((t) => (
              <button type="button" key={t.start} className={start === t.start ? "chip on" : "chip"} onClick={() => setStart(t.start)}>
                {time.format(new Date(t.start))}
              </button>
            ))}
          </div>
        </>
      )}
      {start && (
        <div className="fields">
          <input autoFocus required placeholder="Nom ou prénom" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <input placeholder="Téléphone (facultatif)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
          <input placeholder="Courriel (facultatif)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          {!phone && !email && <p className="hint">Sans téléphone ni courriel, le client ne recevra ni confirmation ni rappel.</p>}
          <input placeholder="Note (allergie, occasion…)" value={notes} onChange={(e) => setNotes(e.target.value)} autoComplete="off" />
          <button className="primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      )}
    </form>
  );
}
