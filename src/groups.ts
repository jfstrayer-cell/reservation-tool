// Group requests for the private room at 552 Duluth.
// Rules come from the "Guide des demandes de groupes 552" (Oct. 2026) and JF's 2026 decisions:
// 11+ guests (the main room takes up to 10), 40 seated at most, only the questions needed for an
// offer, a complete answer within 48 hours, no prices or formulas on the public form.

import pg from "pg";
import { DateTime } from "luxon";

export const GROUP_LIMITS = { minGuests: 11, maxGuests: 40, idealMin: 25, idealMax: 30, farAheadMonths: 3 };

export const OPTIONS = {
  gateau: "Gâteau apporté",
  musiciens: "Musique ou musiciens",
  decoration: "Décoration par le groupe",
  ecran: "Écran ou karaoké",
  verres: "Verres de dégustation",
  plan_de_table: "Plan de table particulier",
} as const;
export type OptionKey = keyof typeof OPTIONS;

export interface GroupRequestInput {
  eventDate: string;          // YYYY-MM-DD
  alternateDate?: string;     // YYYY-MM-DD
  arrivalTime?: string;       // HH:mm
  guestsMin: number;
  guestsMax?: number;
  occasion?: string;
  eventFormat: "souper" | "cocktail" | "autre";
  drinks: "apportez" | "service" | "a_discuter";
  options?: string[];
  dietaryNotes?: string;
  message?: string;
  contactName: string;
  organisation?: string;
  email: string;
  phone?: string;
  language?: "fr" | "en";
  consent: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  notices: string[];          // shown to the guest, not blocking
  value?: Required<Pick<GroupRequestInput, "eventDate" | "guestsMin" | "eventFormat" | "drinks" | "contactName" | "email" | "consent">> &
    Omit<GroupRequestInput, "guestsMax"> & { guestsMax: number; options: OptionKey[] };
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const cleanLong = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function validateGroupRequest(raw: Record<string, unknown>, opts: { today: string; zone: string }): ValidationResult {
  const errors: Record<string, string> = {};
  const notices: string[] = [];

  const eventDate = clean(raw.eventDate, 10);
  const d = DateTime.fromISO(eventDate, { zone: opts.zone });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !d.isValid) errors.eventDate = "Choisissez une date.";
  else if (eventDate < opts.today) errors.eventDate = "Cette date est déjà passée.";

  const alternateDate = clean(raw.alternateDate, 10);
  if (alternateDate && (!/^\d{4}-\d{2}-\d{2}$/.test(alternateDate) || alternateDate < opts.today)) errors.alternateDate = "Date de rechange invalide.";

  const arrivalTime = clean(raw.arrivalTime, 5);
  if (arrivalTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(arrivalTime)) errors.arrivalTime = "Heure invalide.";

  const guestsMin = Number(raw.guestsMin);
  const guestsMax = raw.guestsMax === undefined || raw.guestsMax === "" || raw.guestsMax === null ? guestsMin : Number(raw.guestsMax);
  if (!Number.isInteger(guestsMin) || guestsMin < 1) errors.guestsMin = "Indiquez le nombre de convives.";
  else if (!Number.isInteger(guestsMax) || guestsMax < guestsMin) errors.guestsMax = "Le maximum doit être égal ou supérieur au minimum.";
  else {
    if (guestsMax < GROUP_LIMITS.minGuests)
      notices.push("Pour 10 personnes ou moins, vous pouvez réserver une table directement au restaurant. Nous étudierons tout de même votre demande.");
    if (guestsMax > GROUP_LIMITS.maxGuests)
      notices.push(`Notre salle privée accueille jusqu'à ${GROUP_LIMITS.maxGuests} convives assis. Nous vous reviendrons avec les possibilités pour votre groupe.`);
  }

  const eventFormat = clean(raw.eventFormat, 20) as GroupRequestInput["eventFormat"];
  if (!["souper", "cocktail", "autre"].includes(eventFormat)) errors.eventFormat = "Choisissez le type d'événement.";

  const drinks = clean(raw.drinks, 20) as GroupRequestInput["drinks"];
  if (!["apportez", "service", "a_discuter"].includes(drinks)) errors.drinks = "Choisissez une option pour les boissons.";

  const options = (Array.isArray(raw.options) ? raw.options : []).filter((o): o is OptionKey => typeof o === "string" && o in OPTIONS);

  const contactName = clean(raw.contactName, 120);
  if (!contactName) errors.contactName = "Votre nom est requis.";
  const email = clean(raw.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Un courriel valide est requis pour vous envoyer notre offre.";
  const phone = clean(raw.phone, 40);
  if (raw.consent !== true) errors.consent = "Votre accord est nécessaire pour que nous puissions vous répondre.";

  if (d.isValid && !errors.eventDate) {
    const months = d.diff(DateTime.fromISO(opts.today, { zone: opts.zone }), "months").months;
    if (months > GROUP_LIMITS.farAheadMonths)
      notices.push("Votre événement est dans plus de trois mois : nous confirmerons la date maintenant, et le menu sera finalisé quelques mois avant, selon le marché et la saison.");
  }

  if (Object.keys(errors).length) return { ok: false, errors, notices };
  return {
    ok: true,
    errors,
    notices,
    value: {
      eventDate,
      alternateDate: alternateDate || undefined,
      arrivalTime: arrivalTime || undefined,
      guestsMin,
      guestsMax,
      occasion: clean(raw.occasion, 120) || undefined,
      eventFormat,
      drinks,
      options,
      dietaryNotes: cleanLong(raw.dietaryNotes, 1000) || undefined,
      message: cleanLong(raw.message, 2000) || undefined,
      contactName,
      organisation: clean(raw.organisation, 160) || undefined,
      email,
      phone: phone || undefined,
      language: raw.language === "en" ? "en" : "fr",
      consent: true,
    },
  };
}

/** Registre ID: AAAA-MM-JJ-XXX (event date + first three letters of the last name, no accents). */
export function registreId(eventDate: string, contactName: string): string {
  const parts = contactName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/);
  const last = (parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "").toUpperCase();
  return `${eventDate}-${(last + "XXX").slice(0, 3)}`;
}

export async function createGroupRequest(pool: pg.Pool, restaurantId: string, v: NonNullable<ValidationResult["value"]>) {
  const { rows } = await pool.query<{ id: string; registre_id: string }>(
    `INSERT INTO group_request (restaurant_id, registre_id, event_date, alternate_date, arrival_time, guests_min, guests_max,
       occasion, event_format, drinks, options, dietary_notes, message, contact_name, organisation, email, phone, language, consent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id, registre_id`,
    [restaurantId, registreId(v.eventDate, v.contactName), v.eventDate, v.alternateDate ?? null, v.arrivalTime ?? null, v.guestsMin, v.guestsMax,
      v.occasion ?? null, v.eventFormat, v.drinks, v.options, v.dietaryNotes ?? null, v.message ?? null, v.contactName, v.organisation ?? null,
      v.email, v.phone ?? null, v.language ?? "fr", v.consent],
  );
  return { id: rows[0].id, registreId: rows[0].registre_id };
}

export interface GroupRequestRow {
  id: string; registreId: string; status: string; eventDate: string; alternateDate: string | null; arrivalTime: string | null;
  guestsMin: number; guestsMax: number; occasion: string | null; eventFormat: string; drinks: string; options: string[];
  dietaryNotes: string | null; message: string | null; contactName: string; organisation: string | null; email: string;
  phone: string | null; language: string; createdAt: string; handledAt: string | null;
}

export async function listGroupRequests(pool: pg.Pool, restaurantId: string): Promise<GroupRequestRow[]> {
  const { rows } = await pool.query(
    `SELECT id, registre_id, status, to_char(event_date, 'YYYY-MM-DD') AS event_date, to_char(alternate_date, 'YYYY-MM-DD') AS alternate_date,
            to_char(arrival_time, 'HH24:MI') AS arrival_time, guests_min, guests_max, occasion, event_format, drinks, options, dietary_notes,
            message, contact_name, organisation, email, phone, language, created_at, handled_at
       FROM group_request WHERE restaurant_id = $1 AND status <> 'archivee'
      ORDER BY (status = 'demande') DESC, created_at DESC LIMIT 200`,
    [restaurantId],
  );
  return rows.map((r) => ({
    id: r.id, registreId: r.registre_id, status: r.status, eventDate: r.event_date, alternateDate: r.alternate_date, arrivalTime: r.arrival_time,
    guestsMin: r.guests_min, guestsMax: r.guests_max, occasion: r.occasion, eventFormat: r.event_format, drinks: r.drinks, options: r.options,
    dietaryNotes: r.dietary_notes, message: r.message, contactName: r.contact_name, organisation: r.organisation, email: r.email,
    phone: r.phone, language: r.language, createdAt: r.created_at.toISOString(), handledAt: r.handled_at ? r.handled_at.toISOString() : null,
  }));
}

export async function markGroupRequest(pool: pg.Pool, restaurantId: string, id: string, status: "traitee" | "demande", by: string) {
  const res = await pool.query(
    `UPDATE group_request SET status = $3, handled_at = CASE WHEN $3 = 'traitee' THEN now() ELSE NULL END, handled_by = $4
      WHERE id = $1 AND restaurant_id = $2`,
    [id, restaurantId, status, by],
  );
  if (res.rowCount === 0) throw new Error("Demande introuvable");
}
