import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  date,
  timestamp,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "quoted",
  "follow_up",
  "sold",
  "lost",
]);

export const leadSourceEnum = pgEnum("lead_source_type", [
  "d2d",
  "referral",
  "ad",
  "other",
]);

export const canvassingSessionsTable = pgTable("canvassing_sessions", {
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

export const insertCanvassingSessionSchema = createInsertSchema(canvassingSessionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCanvassingSession = z.infer<typeof insertCanvassingSessionSchema>;
export type CanvassingSession = typeof canvassingSessionsTable.$inferSelect;

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull().default(""),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  source: leadSourceEnum("source").default("d2d"),
  canvasser: text("canvasser"),
  quoteAmount: numeric("quote_amount", { precision: 10, scale: 2 }),
  serviceInterest: text("service_interest"),
  status: leadStatusEnum("status").notNull().default("new"),
  followUpDate: date("follow_up_date"),
  notes: text("notes"),
  sessionId: integer("session_id").references(() => canvassingSessionsTable.id),
  convertedToCustomerId: integer("converted_to_customer_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
