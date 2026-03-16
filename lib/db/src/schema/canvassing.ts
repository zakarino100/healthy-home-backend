import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  date,
  timestamp,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// hh_canvassing_sessions  — Healthy Home canvassing sessions
// ---------------------------------------------------------------------------
export const hhCanvassingSessionsTable = pgTable("hh_canvassing_sessions", {
  id: serial("id").primaryKey(),
  canvasser: text("canvasser").notNull(),
  sessionDate: date("session_date").notNull(),
  neighborhood: text("neighborhood"),
  route: text("route"),
  doorsKnocked: integer("doors_knocked").notNull().default(0),
  peopleReached: integer("people_reached").notNull().default(0),
  goodConversations: integer("good_conversations").notNull().default(0),
  quotesGiven: integer("quotes_given").notNull().default(0),
  closes: integer("closes").notNull().default(0),
  revenueSold: numeric("revenue_sold", { precision: 10, scale: 2 }).notNull().default("0"),
  averageTicket: numeric("average_ticket", { precision: 10, scale: 2 }),
  bundleCount: integer("bundle_count").notNull().default(0),
  driveawayAddOnCount: integer("driveway_addon_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCanvassingSessionSchema = createInsertSchema(hhCanvassingSessionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCanvassingSession = z.infer<typeof insertCanvassingSessionSchema>;
export type CanvassingSession = typeof hhCanvassingSessionsTable.$inferSelect;

// Aliases kept for backward compat with routes that import canvassingSessionsTable
export const canvassingSessionsTable = hhCanvassingSessionsTable;

// ---------------------------------------------------------------------------
// leads  — shared table with Wolfpack D2D app (existing Supabase table)
// Filter by: business_unit = 'healthy_home'
// New HH records: source = 'crm', business_unit = 'healthy_home'
// ---------------------------------------------------------------------------
export const leadsTable = pgTable("leads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  homeownerName: text("homeowner_name"),
  phone: text("phone"),
  email: text("email"),
  addressLine1: text("address_line1").notNull().default(""),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  source: text("source").default("crm"),
  businessUnit: text("business_unit").default("healthy_home"),
  servicesInterested: text("services_interested").array(),
  tags: text("tags").array(),
  status: text("status").notNull().default("new"),
  assignedRepEmail: text("assigned_rep_email"),
  lastTouchAt: timestamp("last_touch_at", { withTimezone: true }),
  nextFollowupAt: timestamp("next_followup_at", { withTimezone: true }),
  followupChannel: text("followup_channel"),
  followupPriority: text("followup_priority"),
  doNotKnock: boolean("do_not_knock").default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
