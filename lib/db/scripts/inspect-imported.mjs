import pg from 'pg';
const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.SUPABASE_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});
const client = await pool.connect();

// Count all leads by status
const { rows: allStatuses } = await client.query(`
  SELECT status, count(*) FROM leads WHERE business_unit='Healthy Home'
  GROUP BY status ORDER BY count DESC
`);
console.log('All HH leads by status:');
allStatuses.forEach(r => console.log(`  ${r.status}: ${r.count}`));

// All hh_jobs by status
const { rows: jobStatuses } = await client.query(`
  SELECT status, count(*) FROM hh_jobs GROUP BY status ORDER BY count DESC
`);
console.log('\nAll hh_jobs by status:');
jobStatuses.forEach(r => console.log(`  ${r.status}: ${r.count}`));

// Date range of leads - old leads vs new
const { rows: dateRange } = await client.query(`
  SELECT 
    DATE_TRUNC('month', created_at)::date as month,
    count(*),
    count(*) FILTER (WHERE status='sold') as sold_count
  FROM leads WHERE business_unit='Healthy Home'
  GROUP BY month ORDER BY month
`);
console.log('\nLead counts by month:');
dateRange.forEach(r => console.log(`  ${r.month}: ${r.count} total, ${r.sold_count} sold`));

// Check hh_jobs - what leads are linked
const { rows: jobsWithLeads } = await client.query(`
  SELECT j.id, j.status, j.scheduled_at, j.lead_id, 
         l.homeowner_name, l.created_at as lead_created,
         l.status as lead_status, ld.sold_price,
         (SELECT name FROM hh_customers WHERE id = j.customer_id LIMIT 1) as customer_name
  FROM hh_jobs j
  LEFT JOIN leads l ON l.id = j.lead_id
  LEFT JOIN hh_lead_details ld ON ld.lead_id = l.id
  ORDER BY j.id
`);
console.log('\nAll hh_jobs:');
jobsWithLeads.forEach(r => {
  console.log(`  job#${r.id} status=${r.status} | leadId=${r.lead_id?.slice(-8) ?? 'NULL'} | leadStatus=${r.lead_status} | ${r.customer_name ?? r.homeowner_name} | leadDate=${r.lead_created?.toISOString().slice(0,10) ?? 'null'} | soldPrice=${r.sold_price}`);
});

// Check hh_customers count and date range
const { rows: custInfo } = await client.query(`
  SELECT count(*), min(created_at), max(created_at) FROM hh_customers
`);
console.log(`\nhh_customers: ${custInfo[0].count} total | ${custInfo[0].min?.toISOString().slice(0,10)} to ${custInfo[0].max?.toISOString().slice(0,10)}`);

// Show hh_customers
const { rows: custs } = await client.query(`
  SELECT id, name, address, city, created_at FROM hh_customers ORDER BY created_at
`);
console.log('\nAll hh_customers:');
custs.forEach(r => console.log(`  id#${r.id} | ${r.name} | ${r.address}, ${r.city} | ${r.created_at?.toISOString().slice(0,10)}`));

await client.release();
await pool.end();
