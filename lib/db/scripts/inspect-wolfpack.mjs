import pg from 'pg';
const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.SUPABASE_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});
const client = await pool.connect();

// What business units exist?
const { rows: units } = await client.query(`SELECT business_unit, count(*) FROM leads GROUP BY business_unit ORDER BY count DESC`);
console.log('Business units in leads:');
units.forEach(r => console.log(`  ${r.business_unit}: ${r.count}`));

// What statuses do Wolf Pack leads have?
const { rows: wpStatuses } = await client.query(`
  SELECT status, count(*) FROM leads WHERE business_unit != 'Healthy Home' OR business_unit IS NULL
  GROUP BY status ORDER BY count DESC
`);
console.log('\nNon-HH lead statuses:');
wpStatuses.forEach(r => console.log(`  ${r.status}: ${r.count}`));

// Show sample Wolf Pack leads with key fields
const { rows: samples } = await client.query(`
  SELECT id, business_unit, status, homeowner_name, address_line1, city, state, 
         services_interested, created_at
  FROM leads 
  WHERE business_unit != 'Healthy Home' OR business_unit IS NULL
  LIMIT 10
`);
console.log('\nSample non-HH leads:');
samples.forEach(r => console.log(`  ${r.id.slice(-8)} | ${r.business_unit} | status=${r.status} | ${r.homeowner_name} | ${r.address_line1}`));

// Check if any of these have hh_jobs created
const { rows: wpJobs } = await client.query(`
  SELECT j.id, j.status, j.scheduled_at, l.business_unit, l.homeowner_name
  FROM hh_jobs j
  JOIN leads l ON l.id = j.lead_id
  WHERE l.business_unit != 'Healthy Home' OR l.business_unit IS NULL
  LIMIT 20
`);
console.log('\nJobs linked to non-HH leads:');
wpJobs.forEach(r => console.log(`  job#${r.id} ${r.status} | ${r.business_unit} | ${r.homeowner_name}`));

// Count total jobs linked to non-HH leads
const { rows: wpJobCount } = await client.query(`
  SELECT count(*) FROM hh_jobs j
  JOIN leads l ON l.id = j.lead_id
  WHERE l.business_unit != 'Healthy Home' OR l.business_unit IS NULL
`);
console.log(`\nTotal jobs linked to non-HH leads: ${wpJobCount[0].count}`);

// Also check hh_customers for non-HH leads
const { rows: wpCusts } = await client.query(`
  SELECT count(*) FROM hh_customers c
  JOIN leads l ON l.id::text = c.lead_id::text
  WHERE l.business_unit != 'Healthy Home' OR l.business_unit IS NULL
`);
console.log(`Total customers from non-HH leads: ${wpCusts[0].count}`);

await client.release();
await pool.end();
