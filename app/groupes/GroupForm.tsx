"use client";

import { useState } from "react";

const OPTIONS: [string, string][] = [
  ["gateau", "Gâteau apporté"],
  ["musiciens", "Musique ou musiciens"],
  ["decoration", "Décoration par le groupe"],
  ["ecran", "Écran ou karaoké"],
  ["verres", "Verres de dégustation"],
  ["plan_de_table", "Plan de table particulier"],
];

export default function GroupForm({ today, mode = "guest" }: { today: string; mode?: "guest" | "staff" }) {
  const staff = mode === "staff";
  const [f, setF] = useState({
    eventDate: "", alternateDate: "", arrivalTime: "18:30", guestsMin: "", guestsMax: "", occasion: "",
    eventFormat: "souper", drinks: "", dietaryNotes: "", message: "", contactName: "", organisation: "", email: "", phone: "", website: "",
  });
  const [options, setOptions] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; notices: string[] } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const toggle = (k: string) => setOptions((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    const res = await fetch(staff ? "/api/staff/groups" : "/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, guestsMin: Number(f.guestsMin), guestsMax: f.guestsMax ? Number(f.guestsMax) : undefined, options, consent }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setFailure("Connexion impossible. Réessayez dans un instant.");
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setDone({ reference: data.reference ?? "", notices: data.notices ?? [] });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (data.errors) setErrors(data.errors);
    else setFailure(data.message ?? "Erreur. Écrivez-nous à info@lesoiseaux.ca.");
  }

  if (done) {
    return (
      <section className="g-card g-done">
        <h2>{staff ? "Demande de groupe enregistrée." : "Merci, votre demande est bien reçue."}</h2>
        <p>{staff ? "Elle apparaît dans les demandes de groupe. Vous pouvez dire au client qu’il recevra une offre complète d’ici 48 heures." : "Nous vous répondons par courriel avec une offre complète d’ici 48 heures : disponibilité, menu et estimé."}</p>
        {done.notices.map((n) => <p key={n} className="g-notice">{n}</p>)}
        {done.reference && <p className="muted">Référence : {done.reference}</p>}
        {staff ? <p><a href="/staff/groupes">Voir les demandes de groupe</a> · <a href="/staff">Retour aux réservations</a></p> : <p className="muted">Une question d’ici là ? 514 849-8844 · info@lesoiseaux.ca</p>}
      </section>
    );
  }

  const err = (k: string) => errors[k] && <span className="g-error">{errors[k]}</span>;

  return (
    <form className="g-card" onSubmit={submit} noValidate>
      <fieldset>
        <legend>Votre événement</legend>
        <div className="g-row">
          <label>Date souhaitée<input type="date" min={today} value={f.eventDate} onChange={set("eventDate")} required />{err("eventDate")}</label>
          <label><span>Date de rechange <small>(facultatif)</small></span><input type="date" min={today} value={f.alternateDate} onChange={set("alternateDate")} />{err("alternateDate")}</label>
        </div>
        <div className="g-row">
          <label>Heure d’arrivée<input type="time" min="17:00" max="22:00" step={900} value={f.arrivalTime} onChange={set("arrivalTime")} />{err("arrivalTime")}</label>
          <label><span>Occasion <small>(facultatif)</small></span><input placeholder="Anniversaire, souper d’équipe…" value={f.occasion} onChange={set("occasion")} /></label>
        </div>
        <div className="g-row">
          <label>Nombre de convives<input type="number" inputMode="numeric" min={1} max={200} placeholder="ex. 20" value={f.guestsMin} onChange={set("guestsMin")} required />{err("guestsMin")}</label>
          <label><span>Jusqu’à <small>(si incertain)</small></span><input type="number" inputMode="numeric" min={1} max={200} placeholder="ex. 25" value={f.guestsMax} onChange={set("guestsMax")} />{err("guestsMax")}</label>
        </div>
        <p className="g-help">Notre salle privée accueille jusqu’à 40 convives assis.</p>
      </fieldset>

      <fieldset>
        <legend>Formule</legend>
        <div className="g-choices">
          {[["souper", "Souper servi à table"], ["cocktail", "Cocktail dînatoire (bouchées)"], ["traiteur", "Avec votre traiteur"], ["concert", "Concert"], ["autre", "Autre"]].map(([v, l]) => (
            <label key={v} className={f.eventFormat === v ? "g-choice on" : "g-choice"}><input type="radio" name="format" checked={f.eventFormat === v} onChange={() => setF({ ...f, eventFormat: v })} />{l}</label>
          ))}
        </div>
        {err("eventFormat")}
        <p className="g-q">Boissons</p>
        <div className="g-choices">
          {[["apportez", "Nous apportons nos boissons"], ["service", "Service du vin par le restaurant"], ["a_discuter", "À discuter"]].map(([v, l]) => (
            <label key={v} className={f.drinks === v ? "g-choice on" : "g-choice"}><input type="radio" name="drinks" checked={f.drinks === v} onChange={() => setF({ ...f, drinks: v })} />{l}</label>
          ))}
        </div>
        {err("drinks")}
        <p className="g-q">Autres besoins <small>(facultatif)</small></p>
        <div className="g-checks">
          {OPTIONS.map(([k, l]) => (
            <label key={k} className="g-check"><input type="checkbox" checked={options.includes(k)} onChange={() => toggle(k)} />{l}</label>
          ))}
        </div>
        <label><span>Allergies ou restrictions connues <small>(facultatif, à confirmer au plus tard 7 jours avant)</small></span>
          <textarea rows={2} value={f.dietaryNotes} onChange={set("dietaryNotes")} />
        </label>
        <label><span>Message <small>(facultatif)</small></span><textarea rows={3} value={f.message} onChange={set("message")} /></label>
      </fieldset>

      <fieldset>
        <legend>{staff ? "Coordonnées du client" : "Vos coordonnées"}</legend>
        <div className="g-row">
          <label>Nom<input autoComplete="name" value={f.contactName} onChange={set("contactName")} required />{err("contactName")}</label>
          <label><span>Organisme <small>(facultatif)</small></span><input autoComplete="organization" value={f.organisation} onChange={set("organisation")} /></label>
        </div>
        <div className="g-row">
          <label><span>Courriel {staff && <small>(ou téléphone)</small>}</span><input type="email" autoComplete="email" value={f.email} onChange={set("email")} required />{err("email")}</label>
          <label><span>Téléphone <small>{staff ? "(ou courriel)" : "(facultatif)"}</small></span><input type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} />{err("phone")}</label>
        </div>
        <input className="g-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} placeholder="Site web" />
        <label className="g-check g-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {staff ? "Le client accepte d’être recontacté pour cette demande." : "J’accepte que Les Oiseaux de Passage utilisent ces renseignements pour répondre à ma demande."}
        </label>
        {err("consent")}
      </fieldset>

      {failure && <div className="error" role="alert">{failure}</div>}
      {Object.keys(errors).length > 0 && <div className="error" role="alert">Quelques champs sont à corriger.</div>}
      <button className="primary g-submit" disabled={busy}>{busy ? "Envoi…" : staff ? "Enregistrer la demande" : "Envoyer ma demande"}</button>
      {!staff && <p className="g-help center">Réponse complète par courriel d’ici 48 heures.</p>}
    </form>
  );
}
