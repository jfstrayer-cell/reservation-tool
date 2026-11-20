// Availability engine — pure functions, no database.
// Given a restaurant's configuration and the tables already held, it says which start
// times are free for a party, and which table(s) would hold it.
// Rules: docs/01-data-model-and-availability.md §4.

import { DateTime } from "luxon";
import { RestaurantConfig, turnTimeFor, Weekday } from "./config.js";

/** A table already held by a booking, from starts_at to held_until (end + buffer). */
export interface Hold {
  table: string;      // table label
  start: Date;
  heldUntil: Date;
  partySize?: number; // used for pacing
  bookingId?: string;
}

/** Tables that could hold a party: a single table or a combination. */
export interface Candidate {
  tables: string[];
  minSeats: number;
  maxSeats: number;
}

export interface Slot {
  start: Date;
  end: Date;        // start + turn time
  heldUntil: Date;  // end + buffer
  tables: string[]; // best candidate
}

export type Channel = "online" | "staff";

export type SlotsResult =
  | { kind: "slots"; slots: Slot[] }
  | { kind: "group_request"; reason: "party_too_large" }
  | { kind: "closed" };

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]; // luxon: 1 = Monday

/** Single tables first, then combinations; within each, smallest first, so a 2 never takes a 6-top. */
export function candidatesFor(config: RestaurantConfig, partySize: number, channel: Channel): Candidate[] {
  const onlineOk = new Map(config.tables.map((t) => [t.label, t.onlineBookable !== false]));
  const usable = (labels: string[]) => channel === "staff" || labels.every((l) => onlineOk.get(l));
  const fits = (c: Candidate) => c.minSeats <= partySize && partySize <= c.maxSeats;

  const singles: Candidate[] = config.tables
    .map((t) => ({ tables: [t.label], minSeats: t.minSeats, maxSeats: t.maxSeats }))
    .filter((c) => fits(c) && usable(c.tables));
  const combos: Candidate[] = config.combinations
    .map((c) => ({ tables: [...c.tables], minSeats: c.minSeats, maxSeats: c.maxSeats }))
    .filter((c) => fits(c) && usable(c.tables));

  const order = (a: Candidate, b: Candidate) =>
    a.maxSeats - b.maxSeats || a.tables.length - b.tables.length || a.tables.join().localeCompare(b.tables.join(), "en", { numeric: true });
  return [...singles.sort(order), ...combos.sort(order)];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd; // half-open intervals, same as tstzrange '[)'
}

/** First candidate whose tables are all free from start to heldUntil, or null. */
export function pickCandidate(candidates: Candidate[], holds: Hold[], start: Date, heldUntil: Date): Candidate | null {
  const s = start.getTime();
  const e = heldUntil.getTime();
  const busy = new Set(holds.filter((h) => overlaps(s, e, h.start.getTime(), h.heldUntil.getTime())).map((h) => h.table));
  return candidates.find((c) => c.tables.every((t) => !busy.has(t))) ?? null;
}

/** Local start times for a date, every interval from opening to last seating (inclusive), minus closures. */
export function startTimesFor(config: RestaurantConfig, date: string): DateTime[] {
  const zone = config.restaurant.timeZone;
  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid) throw new Error(`Invalid date: ${date}`);
  const closed = (config.closures ?? []).some((c) => date >= c.startsOn && date <= c.endsOn);
  if (closed) return [];

  const weekday = WEEKDAYS[day.weekday - 1];
  const step = config.settings.slotIntervalMinutes;
  const times: DateTime[] = [];
  for (const p of config.servicePeriods.filter((sp) => sp.days.includes(weekday))) {
    const [oh, om] = p.opens.split(":").map(Number);
    const [lh, lm] = p.lastSeating.split(":").map(Number);
    let t = day.set({ hour: oh, minute: om, second: 0, millisecond: 0 });
    const last = day.set({ hour: lh, minute: lm, second: 0, millisecond: 0 });
    while (t <= last) {
      times.push(t);
      t = t.plus({ minutes: step });
    }
  }
  return times.sort((a, b) => a.toMillis() - b.toMillis());
}

function pacingAllows(config: RestaurantConfig, holds: Hold[], start: Date, partySize: number): boolean {
  const limit = config.settings.pacingLimitPer15Min;
  if (!limit) return true;
  const bucket = Math.floor(start.getTime() / (15 * 60_000));
  const seen = new Set<string>();
  let guests = 0;
  for (const h of holds) {
    const key = h.bookingId ?? `${h.table}@${h.start.getTime()}`;
    if (seen.has(key) || Math.floor(h.start.getTime() / (15 * 60_000)) !== bucket) continue;
    seen.add(key);
    guests += h.partySize ?? 0;
  }
  return guests + partySize <= limit;
}

/** Times and tables for one start time, or null if that time can't take the party. */
export function checkStart(
  config: RestaurantConfig,
  partySize: number,
  start: Date,
  holds: Hold[],
  channel: Channel,
): Slot | null {
  const turn = turnTimeFor(config, partySize);
  const end = new Date(start.getTime() + turn * 60_000);
  const heldUntil = new Date(end.getTime() + config.settings.bufferMinutes * 60_000);
  if (channel === "online" && !pacingAllows(config, holds, start, partySize)) return null;
  const pick = pickCandidate(candidatesFor(config, partySize, channel), holds, start, heldUntil);
  return pick ? { start, end, heldUntil, tables: pick.tables } : null;
}

/** All free start times for a party on a date. */
export function findSlots(
  config: RestaurantConfig,
  date: string,
  partySize: number,
  holds: Hold[],
  opts: { now: Date; channel: Channel },
): SlotsResult {
  if (!Number.isInteger(partySize) || partySize < 1) throw new Error(`Invalid party size: ${partySize}`);
  if (opts.channel === "online" && partySize > config.settings.maxPartySizeOnline) {
    return { kind: "group_request", reason: "party_too_large" };
  }
  const times = startTimesFor(config, date);
  if (times.length === 0) return { kind: "closed" };

  const cutoff = opts.channel === "online" ? opts.now.getTime() + config.settings.onlineCutoffMinutes * 60_000 : opts.now.getTime();
  const slots: Slot[] = [];
  for (const t of times) {
    const start = t.toJSDate();
    if (start.getTime() < cutoff) continue;
    const slot = checkStart(config, partySize, start, holds, opts.channel);
    if (slot) slots.push(slot);
  }
  return { kind: "slots", slots };
}
