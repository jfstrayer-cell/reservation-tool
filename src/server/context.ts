// Server-side context for the web app: one database pool and the pilot restaurant.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { DateTime } from "luxon";
import { RestaurantConfig } from "../config.js";
import { createPool } from "../db.js";

const globalForDb = globalThis as unknown as { __pool?: pg.Pool; __restaurant?: Promise<Restaurant> };

export interface Restaurant {
  id: string;
  slug: string;
  config: RestaurantConfig;
}

export function getPool(): pg.Pool {
  if (!globalForDb.__pool) globalForDb.__pool = createPool(process.env.DATABASE_URL, 10);
  return globalForDb.__pool;
}

/** The pilot restaurant: configuration from config/<slug>.json, id from the database. */
export function getRestaurant(): Promise<Restaurant> {
  if (!globalForDb.__restaurant) {
    globalForDb.__restaurant = (async () => {
      const slug = process.env.RESTAURANT_SLUG ?? "les-oiseaux";
      const config: RestaurantConfig = JSON.parse(fs.readFileSync(path.resolve("config", `${slug}.json`), "utf8"));
      const { rows } = await getPool().query<{ id: string }>("SELECT id FROM restaurant WHERE slug = $1", [slug]);
      if (!rows[0]) throw new Error(`Restaurant "${slug}" is not in the database. Run: npm run seed`);
      return { id: rows[0].id, slug, config };
    })().catch((e) => {
      globalForDb.__restaurant = undefined;
      throw e;
    });
  }
  return globalForDb.__restaurant;
}

/** Start and end (exclusive) of a local date, as UTC instants. */
export function dayBounds(date: string, zone: string): { from: Date; to: Date } {
  const d = DateTime.fromISO(date, { zone });
  if (!d.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  return { from: d.startOf("day").toJSDate(), to: d.plus({ days: 1 }).startOf("day").toJSDate() };
}

export function todayIn(zone: string): string {
  return DateTime.now().setZone(zone).toISODate()!;
}
