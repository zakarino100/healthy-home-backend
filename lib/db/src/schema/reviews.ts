import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";
import { customersTable } from "./customers";

export const reviewWorkflowStatusEnum = pgEnum("review_workflow_status", [
  "pending",
  "satisfaction_sent",
  "satisfaction_responded",
  "review_link_sent",
  "review_completed",
  "feedback_requested",
  "issue_flagged",
]);

export const reviewWorkflowsTable = pgTable("review_workflows", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobsTable.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customersTable.id),
  status: reviewWorkflowStatusEnum("status").notNull().default("pending"),
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
