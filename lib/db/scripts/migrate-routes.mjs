import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(resolve(__dirname, "../../../.env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {}
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  console.log("Creating canvassing_routes table...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS canvassing_routes (
      id          serial PRIMARY KEY,
      date        date NOT NULL,
      rep_email   text NOT NULL,
      rep_name    text,
      neighborhood text,
      route_name  text,
      status      text NOT NULL DEFAULT 'planned',
      notes       text,
      created_at  timestamp with time zone DEFAULT now() NOT NULL,
      updated_at  timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  console.log("Creating index on date...");
  await client.query(`CREATE INDEX IF NOT EXISTS idx_canvassing_routes_date ON canvassing_routes (date)`);
  console.log("Done — canvassing_routes table ready.");
  const { rows } = await client.query("SELECT COUNT(*) FROM canvassing_routes");
  console.log("Row count:", rows[0].count);
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
