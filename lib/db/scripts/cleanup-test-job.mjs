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
  await client.query(`DELETE FROM hh_lead_details WHERE job_id = 1 AND lead_id = 'd6060de7-5bc2-4db4-95a2-a5cff7ede359'`);
  await client.query(`DELETE FROM hh_job_content WHERE job_id = 1`);
  await client.query(`DELETE FROM hh_jobs WHERE id = 1`);
  await client.query(`DELETE FROM hh_customers WHERE id = 1 AND first_name = 'Unknown'`);
  console.log("✓ Test data cleaned up");
} catch (err) {
  console.error("Error:", err.message);
} finally {
  client.release();
  await pool.end();
}
