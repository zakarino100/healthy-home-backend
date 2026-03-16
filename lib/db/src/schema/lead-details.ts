import {
  pgTable,
  serial,
  uuid,
  numeric,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadDetailsTable = pgTable("hh_lead_details", {
  id: serial("id").primaryKey(),
  leadId: uuid("lead_id").notNull().unique(),
  soldPrice: numeric("sold_price", { precision: 10, scale: 2 }),
  quotePrice: numeric("quote_price", { precision: 10, scale: 2 }),
  servicePackage: text("service_package"),
  isBundle: boolean("is_bundle").notNull().default(false),
  jobId: integer("job_id"),
  notes: text("notes"),
  // Item 2 — sync provenance
  syncSource: text("sync_source"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertLeadDetailsSchema = createInsertSchema(leadDetailsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLeadDetails = z.infer<typeof insertLeadDetailsSchema>;
export type LeadDetails = typeof leadDetailsTable.$inferSelect;
