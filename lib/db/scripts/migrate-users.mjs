import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
try {
  const envPath = resolve(__dirname, "../../../.env");
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=\s]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match) process.env[match[1]] = match[2];
  }
} catch {}

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error("No DB URL"); process.exit(1); }

const pool = new pg.Pool({
  connectionString,
  ssl: process.env.SUPABASE_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

const client = await pool.connect();
try {
  console.log("Creating hh_users table if not exists...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS hh_users (
      id serial PRIMARY KEY,
      name text NOT NULL,
      email text UNIQUE,
      role text NOT NULL DEFAULT 'canvasser',
      active boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    )
  `);

  console.log("Adding columns if missing...");
  await client.query(`
    ALTER TABLE hh_users
      ADD COLUMN IF NOT EXISTS phone text,
      ADD COLUMN IF NOT EXISTS position text,
      ADD COLUMN IF NOT EXISTS notes text
  `);

  console.log("Seeding known team members...");
  const members = [
    { name: "Zak",    email: "zakarino100@gmail.com", role: "canvasser",  position: "D2D Sales Rep",   phone: null },
    { name: "Naseem", email: "naseem@healthyhome.com", role: "technician", position: "Service Tech",    phone: null },
  ];

  for (const m of members) {
    const { rows } = await client.query("SELECT id FROM hh_users WHERE email = $1", [m.email]);
    if (rows.length === 0) {
      await client.query(
        `INSERT INTO hh_users (name, email, role, position, active) VALUES ($1,$2,$3,$4,true)`,
        [m.name, m.email, m.role, m.position]
      );
      console.log(`  ✓ Inserted ${m.name}`);
    } else {
      await client.query(
        `UPDATE hh_users SET role=$1, position=$2 WHERE email=$3`,
        [m.role, m.position, m.email]
      );
      console.log(`  ✓ Updated  ${m.name}`);
    }
  }

  const { rows: all } = await client.query("SELECT id, name, role, email FROM hh_users ORDER BY id");
  console.log("\nhh_users table contents:");
  all.forEach(r => console.log(`  [${r.id}] ${r.name} (${r.role}) — ${r.email}`));
  console.log("\nDone.");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
