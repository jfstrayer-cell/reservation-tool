// Loads config/<slug>.json into the database (once). Usage: npm run seed
import fs from "node:fs";
import { createPool, migrate, seedRestaurant } from "../src/db.js";

const slug = process.env.RESTAURANT_SLUG ?? "les-oiseaux";
const pool = createPool();
await migrate(pool);
const { rows } = await pool.query("SELECT id FROM restaurant WHERE slug = $1", [slug]);
if (rows[0]) console.log(`${slug} already loaded (${rows[0].id}).`);
else console.log(`Loaded ${slug}: ${await seedRestaurant(pool, slug, JSON.parse(fs.readFileSync(`config/${slug}.json`, "utf8")))}`);
await pool.end();
