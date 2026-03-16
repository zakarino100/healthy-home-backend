/**
 * One-time backfill: create hh_customers + needs_scheduling hh_jobs
 * for all sold leads that don't have a job yet.
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
  // Find sold leads with no job yet (lead_details.job_id IS NULL or no details row)
  const { rows: soldLeads } = await client.query(`
    SELECT
      l.id          AS lead_id,
      l.homeowner_name,
      l.phone,
      l.email,
      l.address_line1,
      l.city,
      l.state,
      l.zip,
      l.services_interested,
      ld.id         AS details_id,
      ld.sold_price,
      ld.quote_price,
      ld.service_package
    FROM leads l
    LEFT JOIN hh_lead_details ld ON ld.lead_id = l.id
    WHERE l.status = 'sold'
      AND l.business_unit = 'Healthy Home'
      AND ld.job_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM hh_jobs j WHERE j.lead_id = l.id
      )
  `);

  console.log(`Found ${soldLeads.length} sold lead(s) needing customer conversion`);

  for (const lead of soldLeads) {
    const name = lead.homeowner_name ?? "";
    const spaceIdx = name.indexOf(" ");
    const firstName = spaceIdx >= 0 ? name.slice(0, spaceIdx) : (name || "Unknown");
    const lastName = spaceIdx >= 0 ? name.slice(spaceIdx + 1) : "";

    const services = Array.isArray(lead.services_interested)
      ? lead.services_interested
      : (typeof lead.services_interested === "string"
          ? JSON.parse(lead.services_interested)
          : []);
    const serviceType = lead.service_package ?? services[0] ?? "house_wash";

    // Create customer
    const { rows: [customer] } = await client.query(
      `INSERT INTO hh_customers (first_name, last_name, phone, email, address, city, state, zip, opt_out, review_campaign_eligible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,false) RETURNING id`,
      [firstName, lastName, lead.phone, lead.email, lead.address_line1, lead.city, lead.state, lead.zip]
    );

    // Create needs_scheduling job (do NOT set lead_details.job_id — let the user
    // confirm via "Schedule Job" to set date + technician)
    const { rows: [job] } = await client.query(
      `INSERT INTO hh_jobs (customer_id, service_type, sold_price, quoted_price, status, payment_status, lead_id)
       VALUES ($1,$2,$3,$4,'needs_scheduling','pending',$5) RETURNING id`,
      [customer.id, serviceType, lead.sold_price, lead.quote_price, lead.lead_id]
    );

    // Auto-create content record
    await client.query(
      `INSERT INTO hh_job_content (job_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [job.id]
    );

    console.log(`  ✓ [${lead.lead_id}] ${firstName} ${lastName} → customer #${customer.id}, job #${job.id} (${serviceType})`);
  }

  console.log("Backfill complete.");
} catch (err) {
  console.error("Error:", err.message);
} finally {
  client.release();
  await pool.end();
}
