/**
 * SMS-related tables:
 *   hh_review_requests   — Twilio SMS review requests per completed job
 *   hh_sms_conversations — inbound SMS conversation state machine
 *   hh_feedback          — customer feedback form submissions
 *
 * ⚠️  hh_review_requests already exists in Supabase (created by Replit agent).
 *     Run the SQL below for the two NEW tables before deploying:
 *
 *  CREATE TABLE hh_sms_conversations (
 *    id          SERIAL PRIMARY KEY,
 *    phone       TEXT NOT NULL,
 *    customer_id INTEGER REFERENCES hh_customers(id),
 *    intent      TEXT,
 *    state       TEXT NOT NULL DEFAULT 'init',
 *    context     JSONB DEFAULT '{}',
 *    status      TEXT NOT NULL DEFAULT 'active',
 *    created_at  TIMESTAMP DEFAULT NOW() NOT NULL,
 *    updated_at  TIMESTAMP DEFAULT NOW() NOT NULL
 *  );
 *
 *  CREATE TABLE hh_feedback (
 *    id             SERIAL PRIMARY KEY,
 *    job_id         INTEGER REFERENCES hh_jobs(id),
 *    customer_name  TEXT,
 *    customer_phone TEXT,
 *    rating         INTEGER,
 *    feedback_text  TEXT,
 *    contact_ok     BOOLEAN DEFAULT FALSE,
 *    submitted_at   TIMESTAMP DEFAULT NOW() NOT NULL
 *  );
 */
import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { jobsTable } from "./jobs";

// ─── hh_review_requests ───────────────────────────────────────────────────────
// Already exists in Supabase. Schema matches what Replit agent created.

export const reviewRequestsTable = pgTable("hh_review_requests", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobsTable.id),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  response: text("response"),
  responseAt: timestamp("response_at"),
  // pending | sent | responded_positive | responded_negative | error
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ReviewRequest = typeof reviewRequestsTable.$inferSelect;
export type InsertReviewRequest = typeof reviewRequestsTable.$inferInsert;

// ─── hh_sms_conversations ─────────────────────────────────────────────────────

export const smsConversationsTable = pgTable("hh_sms_conversations", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  customerId: integer("customer_id").references(() => customersTable.id),
  // new_customer | existing_customer | cancellation | payment_inquiry | vendor | unknown
  intent: text("intent"),
  state: text("state").notNull().default("init"),
  context: jsonb("context").$type<Record<string, string>>().default({}),
  // active | completed | expired
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SmsConversation = typeof smsConversationsTable.$inferSelect;

// ─── hh_feedback ──────────────────────────────────────────────────────────────

export const feedbackTable = pgTable("hh_feedback", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobsTable.id),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  rating: integer("rating"),
  feedbackText: text("feedback_text"),
  contactOk: boolean("contact_ok").default(false),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export type Feedback = typeof feedbackTable.$inferSelect;
