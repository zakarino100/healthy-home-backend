import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("No database URL");

const pool = new Pool({
  connectionString,
  ssl: process.env.SUPABASE_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("Running hh_users migration...");

    // 1. Create hh_users if it doesn't exist yet
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

    // 2. Add columns if missing
    await client.query(`
      ALTER TABLE hh_users
        ADD COLUMN IF NOT EXISTS phone text,
        ADD COLUMN IF NOT EXISTS position text,
        ADD COLUMN IF NOT EXISTS notes text
    `);

    console.log("Schema ready.");

    // 3. Seed known team members (skip if email already exists)
    const members = [
      { name: "Zak",    email: "zakarino100@gmail.com", role: "canvasser",   position: "D2D Rep",         active: true },
      { name: "Naseem", email: "naseem@healthyhome.com",  role: "technician",  position: "Service Tech",    active: true },
    ];

    for (const m of members) {
      const existing = await client.query("SELECT id FROM hh_users WHERE email = $1", [m.email]);
      if (existing.rows.length === 0) {
        await client.query(
          `INSERT INTO hh_users (name, email, role, position, active)
           VALUES ($1, $2, $3, $4, $5)`,
          [m.name, m.email, m.role, m.position, m.active]
        );
        console.log(`  Inserted: ${m.name} (${m.role})`);
      } else {
        // Update role/position if already exists
        await client.query(
          `UPDATE hh_users SET role = $1, position = $2 WHERE email = $3`,
          [m.role, m.position, m.email]
        );
        console.log(`  Updated:  ${m.name} (${m.role})`);
      }
    }

    console.log("Migration complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
