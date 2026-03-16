import {
  pgTable,
  serial,
  integer,
  boolean,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";

export const jobContentTable = pgTable("hh_job_content", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .unique()
    .references(() => jobsTable.id),
  beforePhotos: text("before_photos").array(),
  afterPhotos: text("after_photos").array(),
  videoCapture: boolean("video_capture").notNull().default(false),
  contentReady: boolean("content_ready").notNull().default(false),
  reviewScreenshot: boolean("review_screenshot").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertJobContentSchema = createInsertSchema(jobContentTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJobContent = z.infer<typeof insertJobContentSchema>;
export type JobContent = typeof jobContentTable.$inferSelect;
