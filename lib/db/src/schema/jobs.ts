import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const jobsTable = pgTable("hh_jobs", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customersTable.id),
  serviceType: text("service_type").notNull(),
  packageType: text("package_type"),
  quotedPrice: numeric("quoted_price", { precision: 10, scale: 2 }),
  soldPrice: numeric("sold_price", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("scheduled"),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  technicianAssigned: text("technician_assigned"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  paymentAmountCollected: numeric("payment_amount_collected", { precision: 10, scale: 2 }),
  notes: text("notes"),
  satisfactionWorkflowTriggered: boolean("satisfaction_workflow_triggered").notNull().default(false),
  leadId: uuid("lead_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
