// Helpers for the guest-facing (public) booking flow.
import pg from "pg";
import { findSlots } from "../availability.js";
import { loadHolds } from "../bookings.js";
import { dayBounds } from "./context.js";
import type { Restaurant } from "./context.js";

const hits = new Map<string, number[]>();

/** Simple per-address rate limit: max `n` calls per `windowMs`. */
export function rateLimited(ip: string, key: string, n: number, windowMs: number): boolean {
  const k = `${key}:${ip}`;
  const now = Date.now();
  const list = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= n) return true;
  list.push(now);
  hits.set(k, list);
  return false;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

/** Free start times for guests booking themselves (online rules: cut-off, max party size). */
export async function onlineTimes(pool: pg.Pool, r: Restaurant, date: string, party: number) {
  const zone = r.config.restaurant.timeZone;
  const { from, to } = dayBounds(date, zone);
  const holds = await loadHolds(pool, r.id, new Date(from.getTime() - 86_400_000), new Date(to.getTime() + 86_400_000));
  return findSlots(r.config, date, party, holds, { now: new Date(), channel: "online" });
}

export function bookingSummary(row: { starts_at: Date; party_size: number; status: string; name: string | null }, zone: string) {
  return {
    start: row.starts_at.toISOString(),
    date: new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(row.starts_at),
    time: new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(row.starts_at),
    partySize: row.party_size,
    status: row.status,
    name: row.name,
  };
}
