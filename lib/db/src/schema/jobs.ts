import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const jobStatusEnum = pgEnum("job_status", [
  "scheduled",
  "completed",
  "rescheduled",
  "canceled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "collected",
  "invoiced",
  "waived",
]);

export const serviceTypeEnum = pgEnum("service_type", [
  "house_wash",
  "driveway_cleaning",
  "bundle",
  "other",
]);

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customersTable.id),
  serviceType: serviceTypeEnum("service_type").notNull(),
  packageType: text("package_type"),
  quotedPrice: numeric("quoted_price", { precision: 10, scale: 2 }),
  soldPrice: numeric("sold_price", { precision: 10, scale: 2 }),
  status: jobStatusEnum("status").notNull().default("scheduled"),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  technicianAssigned: text("technician_assigned"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  paymentAmountCollected: numeric("payment_amount_collected", { precision: 10, scale: 2 }),
  notes: text("notes"),
  satisfactionWorkflowTriggered: boolean("satisfaction_workflow_triggered").notNull().default(false),
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
