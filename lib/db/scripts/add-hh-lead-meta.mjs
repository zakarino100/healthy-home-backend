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

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS hh_lead_meta (
      id         SERIAL PRIMARY KEY,
      lead_id    UUID NOT NULL UNIQUE,
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT,
      updated_by TEXT,
      change_log JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS hh_lead_meta_lead_id_idx   ON hh_lead_meta(lead_id);
    CREATE INDEX IF NOT EXISTS hh_lead_meta_is_deleted_idx ON hh_lead_meta(is_deleted);
  `);
  console.log("✓ hh_lead_meta table created (or already exists)");
} catch (err) {
  console.error("Error:", err.message);
} finally {
  client.release();
  await pool.end();
}
