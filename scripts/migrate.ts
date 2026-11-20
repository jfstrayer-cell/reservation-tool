import { createPool, migrate } from "../src/db.js";

const pool = createPool();
const applied = await migrate(pool);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database already up to date.");
await pool.end();
