// Database tests: need a PostgreSQL in DATABASE_URL (skipped otherwise).
// These prove the main promise: never a double booking, even under a rush.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import fs from "node:fs";
import pg from "pg";
import { createBooking, releaseBooking, SlotUnavailableError } from "../src/bookings.js";
import { RestaurantConfig } from "../src/config.js";
import { createPool, migrate, seedRestaurant } from "../src/db.js";

const url = process.env.DATABASE_URL;
const config: RestaurantConfig = JSON.parse(fs.readFileSync("config/les-oiseaux.json", "utf8"));
const at = (iso: string) => DateTime.fromISO(iso, { zone: config.restaurant.timeZone }).toJSDate();
const FRIDAY = "2027-01-15";

describe.skipIf(!url)("bookings in the database", () => {
  let pool: pg.Pool;
  let restaurantId: string;

  beforeAll(async () => {
    pool = createPool(url, 30);
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrate(pool);
    restaurantId = await seedRestaurant(pool, "les-oiseaux", config);
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function overlappingHolds(): Promise<number> {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM booking_table a JOIN booking_table b
         ON a.table_id = b.table_id AND a.booking_id < b.booking_id AND a.active AND b.active
        AND tstzrange(a.starts_at, a.held_until, '[)') && tstzrange(b.starts_at, b.held_until, '[)')`,
    );
    return Number(rows[0].n);
  }

  it("the database itself refuses an overlapping hold", async () => {
    const b = await createBooking(pool, config, { restaurantId, partySize: 2, start: at(`${FRIDAY}T17:00`), source: "phone", guest: { name: "Test", phone: "5145550000" } });
    const { rows } = await pool.query("SELECT table_id FROM booking_table WHERE booking_id = $1", [b.id]);
    const other = await pool.query("INSERT INTO booking (restaurant_id, party_size, starts_at, ends_at, source) VALUES ($1, 2, $2, $3, 'phone') RETURNING id", [restaurantId, at(`${FRIDAY}T18:00`), at(`${FRIDAY}T20:30`)]);
    await expect(
      pool.query("INSERT INTO booking_table (booking_id, table_id, restaurant_id, starts_at, held_until) VALUES ($1,$2,$3,$4,$5)", [other.rows[0].id, rows[0].table_id, restaurantId, at(`${FRIDAY}T18:00`), at(`${FRIDAY}T20:40`)]),
    ).rejects.toMatchObject({ code: "23P01" });
    await pool.query("DELETE FROM booking");
  });

  it("200 guests rushing for 19:00 on a Friday: exactly 12 tables of 2 are given, zero double bookings", async () => {
    const start = at(`${FRIDAY}T19:00`);
    const results = await Promise.allSettled(
      Array.from({ length: 200 }, (_, i) =>
        createBooking(pool, config, { restaurantId, partySize: 2, start, source: "online", guest: { name: `Guest ${i}`, email: `g${i}@example.com` } }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(12);
    const unexpected = refused.map((r) => (r as PromiseRejectedResult).reason).filter((e) => !(e instanceof SlotUnavailableError));
    expect(unexpected.map((e) => `${e.code} ${e.message}`)).toEqual([]);
    expect(await overlappingHolds()).toBe(0);
    await pool.query("DELETE FROM booking");
  });

  it("200 mixed bookings across a Friday night: zero double bookings, never more than 24 guests at once", async () => {
    const starts = Array.from({ length: 21 }, (_, i) => at(`${FRIDAY}T17:00`).getTime() + i * 15 * 60_000);
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    await Promise.allSettled(
      Array.from({ length: 200 }, (_, i) =>
        createBooking(pool, config, {
          restaurantId,
          partySize: 1 + Math.floor(rand() * 6),
          start: new Date(starts[Math.floor(rand() * starts.length)]),
          source: i % 3 === 0 ? "phone" : "online",
          guest: { name: `Mixed ${i}`, phone: `514555${String(i).padStart(4, "0")}` },
        }),
      ),
    );
    expect(await overlappingHolds()).toBe(0);
    const { rows } = await pool.query<{ peak: string }>(
      `SELECT max(seated) AS peak FROM (
         SELECT s.t, sum(b.party_size) AS seated
           FROM generate_series($1::timestamptz, $2::timestamptz, interval '5 minutes') AS s(t)
           JOIN booking b ON b.starts_at <= s.t AND b.ends_at > s.t AND b.status = 'confirmed'
          GROUP BY s.t) x`,
      [at(`${FRIDAY}T17:00`), at(`${FRIDAY}T23:59`)],
    );
    expect(Number(rows[0].peak)).toBeLessThanOrEqual(24);
    await pool.query("DELETE FROM booking");
  });

  it("a cancelled booking frees its table", async () => {
    const start = at(`${FRIDAY}T20:00`);
    const made = [];
    for (let i = 0; i < 12; i++) made.push(await createBooking(pool, config, { restaurantId, partySize: 2, start, source: "phone", guest: { name: `C${i}`, phone: "5145551111" } }));
    await expect(createBooking(pool, config, { restaurantId, partySize: 2, start, source: "phone", guest: { name: "Late", phone: "5145552222" } })).rejects.toBeInstanceOf(SlotUnavailableError);
    await releaseBooking(pool, restaurantId, made[0].id, "cancelled", "guest");
    const again = await createBooking(pool, config, { restaurantId, partySize: 2, start, source: "phone", guest: { name: "Late", phone: "5145552222" } });
    expect(again.tables).toEqual(made[0].tables);
    const events = await pool.query("SELECT kind FROM booking_event WHERE booking_id = $1 ORDER BY id", [made[0].id]);
    expect(events.rows.map((r) => r.kind)).toEqual(["created", "cancelled"]);
  });
});
