import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";
import { customersTable } from "./customers";

export const reviewWorkflowsTable = pgTable("hh_review_workflows", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customersTable.id),
  status: text("status").notNull().default("pending"),
  satisfactionScore: integer("satisfaction_score"),
  satisfactionResponseAt: timestamp("satisfaction_response_at"),
  satisfactionSentAt: timestamp("satisfaction_sent_at"),
  reviewRequestSentAt: timestamp("review_request_sent_at"),
  reviewReminderSentAt: timestamp("review_reminder_sent_at"),
  reviewCompletedAt: timestamp("review_completed_at"),
  feedbackFormSentAt: timestamp("feedback_form_sent_at"),
  feedbackReceivedAt: timestamp("feedback_received_at"),
  isIssueFlagged: boolean("is_issue_flagged").notNull().default(false),
  internalIssueNotes: text("internal_issue_notes"),
  isOldCustomerCampaign: boolean("is_old_customer_campaign").notNull().default(false),
  deliveryChannel: text("delivery_channel").notNull().default("unknown"),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  deliveryLog: text("delivery_log"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertReviewWorkflowSchema = createInsertSchema(reviewWorkflowsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReviewWorkflow = z.infer<typeof insertReviewWorkflowSchema>;
export type ReviewWorkflow = typeof reviewWorkflowsTable.$inferSelect;
