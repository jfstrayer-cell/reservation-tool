import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { RestaurantConfig } from "./config.js";

export function createPool(connectionString = process.env.DATABASE_URL, max = 20): pg.Pool {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new pg.Pool({ connectionString, max });
}

/** Runs db/migrations/*.sql in order, once each. */
export async function migrate(pool: pg.Pool, dir = path.resolve("db/migrations")): Promise<string[]> {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await pool.query<{ name: string }>("SELECT name FROM schema_migration")).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(fs.readFileSync(path.join(dir, file), "utf8"));
      await client.query("INSERT INTO schema_migration (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      applied.push(file);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  return applied;
}

const ISO_DAY: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

/** Loads a restaurant configuration (e.g. config/les-oiseaux.json) into the database. Returns its id. */
export async function seedRestaurant(pool: pg.Pool, slug: string, config: RestaurantConfig): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = config.restaurant;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO restaurant (slug, name, time_zone, default_language, settings)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [slug, r.name, r.timeZone, r.defaultLanguage, { ...config.settings, turnTimeMinutes: config.turnTimeMinutes }],
    );
    const id = rows[0].id;
    for (const p of config.servicePeriods)
      for (const d of p.days)
        await client.query("INSERT INTO service_period (restaurant_id, weekday, opens, last_seating) VALUES ($1,$2,$3,$4)", [id, ISO_DAY[d], p.opens, p.lastSeating]);
    const tableIds = new Map<string, string>();
    for (const t of config.tables) {
      const res = await client.query<{ id: string }>(
        "INSERT INTO dining_table (restaurant_id, label, min_seats, max_seats, online_bookable) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [id, t.label, t.minSeats, t.maxSeats, t.onlineBookable !== false],
      );
      tableIds.set(t.label, res.rows[0].id);
    }
    for (const c of config.combinations) {
      const res = await client.query<{ id: string }>(
        "INSERT INTO table_combination (restaurant_id, min_seats, max_seats) VALUES ($1,$2,$3) RETURNING id",
        [id, c.minSeats, c.maxSeats],
      );
      for (const label of c.tables) {
        const tid = tableIds.get(label);
        if (!tid) throw new Error(`Combination refers to unknown table ${label}`);
        await client.query("INSERT INTO table_combination_member (combination_id, table_id) VALUES ($1,$2)", [res.rows[0].id, tid]);
      }
    }
    for (const c of config.closures ?? [])
      await client.query("INSERT INTO closure (restaurant_id, starts_on, ends_on, reason) VALUES ($1,$2,$3,$4)", [id, c.startsOn, c.endsOn, c.reason ?? null]);
    await client.query("COMMIT");
    return id;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
