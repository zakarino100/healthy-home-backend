import pg from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/home/runner/workspace/.env', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([^#=\s]+)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// Count by status
const { rows: statusCounts } = await client.query(`
  SELECT status, count(*) 
  FROM leads WHERE business_unit='Healthy Home' 
  GROUP BY status ORDER BY count DESC
`);
console.log('Leads by status:');
statusCounts.forEach(r => console.log(`  ${r.status}: ${r.count}`));

// Check what the hh_jobs records look like - are any linked to non-sold leads?
const { rows: jobsWithStatus } = await client.query(`
  SELECT j.id, j.status as job_status, l.status as lead_status, l.homeowner_name,
         l.services_interested, ld.sold_price, ld.service_package
  FROM hh_jobs j
  JOIN leads l ON l.id = j.lead_id
  LEFT JOIN hh_lead_details ld ON ld.lead_id = l.id
  WHERE j.lead_id IS NOT NULL
  ORDER BY l.status
`);
console.log('\nhh_jobs linked to leads (checking status match):');
jobsWithStatus.forEach(r => {
  console.log(`  job#${r.id} status=${r.job_status} | lead.status=${r.lead_status} | ${r.homeowner_name} | soldPrice=${r.sold_price}`);
});

await client.release();
await pool.end();
