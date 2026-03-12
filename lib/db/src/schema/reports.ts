import {
  pgTable,
  serial,
  date,
  integer,
  numeric,
  text,
  jsonb,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyReportsTable = pgTable("daily_reports", {
  id: serial("id").primaryKey(),
  reportDate: date("report_date").notNull().unique(),
  doorsKnocked: integer("doors_knocked").notNull().default(0),
  goodConversations: integer("good_conversations").notNull().default(0),
  quotesGiven: integer("quotes_given").notNull().default(0),
  closes: integer("closes").notNull().default(0),
  closeRate: numeric("close_rate", { precision: 5, scale: 2 }),
  revenueSold: numeric("revenue_sold", { precision: 10, scale: 2 }).notNull().default("0"),
  averageTicket: numeric("average_ticket", { precision: 10, scale: 2 }),
  bundlesSold: integer("bundles_sold").notNull().default(0),
  jobsCompleted: integer("jobs_completed").notNull().default(0),
  cashCollected: numeric("cash_collected", { precision: 10, scale: 2 }).notNull().default("0"),
  reviewRequestsSent: integer("review_requests_sent").notNull().default(0),
  positiveSatisfactionResponses: integer("positive_satisfaction_responses").notNull().default(0),
  negativeSatisfactionResponses: integer("negative_satisfaction_responses").notNull().default(0),
  reviewsReceived: integer("reviews_received").notNull().default(0),
  topCanvasser: text("top_canvasser"),
  topTechnician: text("top_technician"),
  openIssuesCount: integer("open_issues_count").notNull().default(0),
  anomaliesNotes: text("anomalies_notes"),
  fullPayload: jsonb("full_payload"),
  webhookSent: boolean("webhook_sent").notNull().default(false),
  webhookSentAt: timestamp("webhook_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDailyReportSchema = createInsertSchema(dailyReportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;
export type DailyReport = typeof dailyReportsTable.$inferSelect;
