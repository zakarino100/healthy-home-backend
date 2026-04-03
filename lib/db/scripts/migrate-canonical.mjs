/**
 * Canonical schema migration — items 1, 2, 6, 7
 * Item 1: Add activity columns to hh_canvassing_sessions
 * Item 2: Add sync_source + updated_by to core HH tables
 * Item 6: Create hh_tasks table
 * Item 7: Add route_id FK to hh_canvassing_sessions
 */
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
  console.log("=== Item 1: Add activity columns to hh_canvassing_sessions ===");
  await client.query(`
    ALTER TABLE hh_canvassing_sessions
      ADD COLUMN IF NOT EXISTS not_home           integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS no_answer          integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS callbacks_requested integer NOT NULL DEFAULT 0
  `);
  console.log("  ✓ not_home, no_answer, callbacks_requested added");

  console.log("\n=== Item 2: Add sync_source + updated_by to core HH tables ===");
  const tables = ["hh_canvassing_sessions", "hh_jobs", "hh_lead_details", "hh_customers"];
  for (const t of tables) {
    await client.query(`
      ALTER TABLE ${t}
        ADD COLUMN IF NOT EXISTS sync_source text,
        ADD COLUMN IF NOT EXISTS updated_by  text
    `);
    console.log(`  ✓ ${t}`);
  }

  console.log("\n=== Item 6: Create hh_tasks table ===");
  await client.query(`
    CREATE TABLE IF NOT EXISTS hh_tasks (
      id              serial PRIMARY KEY,
      title           text NOT NULL,
      description     text,
      related_to_type text,
      related_to_id   text,
      due_date        date,
      status          text NOT NULL DEFAULT 'pending',
      priority        text NOT NULL DEFAULT 'normal',
      assigned_to     text,
      created_by      text,
      completed_at    timestamp with time zone,
      sync_source     text,
      updated_by      text,
      created_at      timestamp with time zone DEFAULT now() NOT NULL,
      updated_at      timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_hh_tasks_status ON hh_tasks (status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_hh_tasks_due_date ON hh_tasks (due_date)`);
  console.log("  ✓ hh_tasks table created");

  console.log("\n=== Item 7: Add route_id FK to hh_canvassing_sessions ===");
  await client.query(`
    ALTER TABLE hh_canvassing_sessions
      ADD COLUMN IF NOT EXISTS route_id integer REFERENCES canvassing_routes(id) ON DELETE SET NULL
  `);
  console.log("  ✓ route_id FK added to hh_canvassing_sessions");

  console.log("\n=== Verifying ===");
  const { rows: sessionCols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hh_canvassing_sessions'
    ORDER BY ordinal_position
  `);
  console.log("  hh_canvassing_sessions columns:", sessionCols.map(r => r.column_name).join(", "));

  const { rows: taskCols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hh_tasks'
    ORDER BY ordinal_position
  `);
  console.log("  hh_tasks columns:", taskCols.map(r => r.column_name).join(", "));

  console.log("\n✅ All migrations complete.");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
