import {
  pgTable,
  serial,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// hh_tasks — follow-up tasks linked to jobs, leads, or sessions
// ---------------------------------------------------------------------------
export const tasksTable = pgTable("hh_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  relatedToType: text("related_to_type"), // 'job' | 'lead' | 'session' | 'customer'
  relatedToId: text("related_to_id"),
  dueDate: date("due_date"),
  status: text("status").notNull().default("pending"), // pending | completed | cancelled
  priority: text("priority").notNull().default("normal"), // low | normal | high | urgent
  assignedTo: text("assigned_to"),
  createdBy: text("created_by"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  syncSource: text("sync_source"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
