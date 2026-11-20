// Creating bookings safely.
// Bookings for one restaurant are taken one at a time (a transaction-level lock), so two
// guests can never be given the same table. PostgreSQL's no_double_booking constraint is
// the backstop: even a bug elsewhere cannot write an overlapping hold.

import pg from "pg";
import { checkStart, Channel, Hold } from "./availability.js";
import { RestaurantConfig } from "./config.js";

export type BookingSource = "online" | "phone" | "walk_in" | "api";

export interface NewBooking {
  restaurantId: string;
  partySize: number;
  start: Date;
  source: BookingSource;
  guest?: { name: string; phone?: string; email?: string; language?: string };
  notes?: string;
  actor?: string; // who made it: guest, staff:<id>, api:<client>
}

export interface CreatedBooking {
  id: string;
  manageToken: string;
  tables: string[];
  start: Date;
  end: Date;
}

export class SlotUnavailableError extends Error {
  constructor() {
    super("This time is no longer available");
    this.name = "SlotUnavailableError";
  }
}

const EXCLUSION_VIOLATION = "23P01";
const DEADLOCK = "40P01";
const MAX_ATTEMPTS = 3;

/** Active holds that could touch [from, to). */
export async function loadHolds(db: pg.Pool | pg.PoolClient, restaurantId: string, from: Date, to: Date): Promise<Hold[]> {
  const { rows } = await db.query<{ label: string; starts_at: Date; held_until: Date; party_size: number; booking_id: string }>(
    `SELECT t.label, bt.starts_at, bt.held_until, b.party_size, b.id AS booking_id
       FROM booking_table bt
       JOIN dining_table t ON t.id = bt.table_id
       JOIN booking b ON b.id = bt.booking_id
      WHERE bt.restaurant_id = $1 AND bt.active
        AND bt.starts_at < $3 AND bt.held_until > $2`,
    [restaurantId, from, to],
  );
  return rows.map((r) => ({ table: r.label, start: r.starts_at, heldUntil: r.held_until, partySize: r.party_size, bookingId: r.booking_id }));
}

export async function createBooking(pool: pg.Pool, config: RestaurantConfig, input: NewBooking): Promise<CreatedBooking> {
  const channel: Channel = input.source === "online" ? "online" : "staff";
  if (channel === "online" && input.partySize > config.settings.maxPartySizeOnline) throw new SlotUnavailableError();

  // Look a full day around the start so every overlapping hold is seen.
  const windowFrom = new Date(input.start.getTime() - 24 * 3_600_000);
  const windowTo = new Date(input.start.getTime() + 24 * 3_600_000);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // One booking at a time per restaurant: a small room never notices the wait, and it
      // removes races and deadlocks. The no_double_booking constraint stays as the backstop.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [input.restaurantId]);
      const holds = await loadHolds(client, input.restaurantId, windowFrom, windowTo);
      const slot = checkStart(config, input.partySize, input.start, holds, channel);
      if (!slot) throw new SlotUnavailableError();

      let guestId: string | null = null;
      if (input.guest) {
        const g = await client.query<{ id: string }>(
          "INSERT INTO guest (restaurant_id, name, phone, email, language) VALUES ($1,$2,$3,$4,$5) RETURNING id",
          [input.restaurantId, input.guest.name, input.guest.phone ?? null, input.guest.email ?? null, input.guest.language ?? null],
        );
        guestId = g.rows[0].id;
      }
      const b = await client.query<{ id: string; manage_token: string }>(
        `INSERT INTO booking (restaurant_id, guest_id, party_size, starts_at, ends_at, source, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, manage_token`,
        [input.restaurantId, guestId, input.partySize, slot.start, slot.end, input.source, input.notes ?? null],
      );
      const bookingId = b.rows[0].id;
      await client.query(
        `INSERT INTO booking_table (booking_id, table_id, restaurant_id, starts_at, held_until)
         SELECT $1, t.id, $2, $3, $4 FROM dining_table t WHERE t.restaurant_id = $2 AND t.label = ANY($5::text[])`,
        [bookingId, input.restaurantId, slot.start, slot.heldUntil, slot.tables],
      );
      await client.query(
        "INSERT INTO booking_event (booking_id, restaurant_id, kind, actor, data) VALUES ($1,$2,'created',$3,$4)",
        [bookingId, input.restaurantId, input.actor ?? input.source, { tables: slot.tables, partySize: input.partySize }],
      );
      await client.query("COMMIT");
      return { id: bookingId, manageToken: b.rows[0].manage_token, tables: slot.tables, start: slot.start, end: slot.end };
    } catch (e: unknown) {
      await client.query("ROLLBACK").catch(() => undefined);
      const code = (e as { code?: string }).code;
      if ((code === EXCLUSION_VIOLATION || code === DEADLOCK) && attempt < MAX_ATTEMPTS) continue; // lost a race: retry with fresh holds
      if (code === EXCLUSION_VIOLATION) throw new SlotUnavailableError();
      throw e;
    } finally {
      client.release();
    }
  }
  throw new SlotUnavailableError();
}

/** Releases a booking's tables (cancelled, no-show, or late past the grace period). */
export async function releaseBooking(
  pool: pg.Pool,
  restaurantId: string,
  bookingId: string,
  status: "cancelled" | "no_show" | "late",
  actor: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query("UPDATE booking SET status = $3, updated_at = now() WHERE id = $1 AND restaurant_id = $2", [bookingId, restaurantId, status]);
    if (res.rowCount === 0) throw new Error("Booking not found");
    await client.query("UPDATE booking_table SET active = false WHERE booking_id = $1", [bookingId]);
    await client.query("INSERT INTO booking_event (booking_id, restaurant_id, kind, actor) VALUES ($1,$2,$3,$4)", [bookingId, restaurantId, status, actor]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
