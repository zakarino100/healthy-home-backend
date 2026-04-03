import {
  pgTable,
  serial,
  uuid,
  boolean,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export const leadMetaTable = pgTable("hh_lead_meta", {
  id: serial("id").primaryKey(),
  leadId: uuid("lead_id").notNull().unique(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  updatedBy: text("updated_by"),
  changeLog: jsonb("change_log").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type LeadMeta = typeof leadMetaTable.$inferSelect;
