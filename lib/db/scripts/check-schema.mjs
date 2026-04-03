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
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: {rejectUnauthorized:false} });
const tables = ['hh_jobs','hh_lead_details','hh_canvassing_sessions','d2d_touches','pins'];
for (const t of tables) {
  const { rows } = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position
  `, [t]);
  console.log(`\n=== ${t} ===`);
  rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));
}
await pool.end();
