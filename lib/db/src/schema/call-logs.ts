import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

export const callLogsTable = pgTable("hh_call_logs", {
  id: serial("id").primaryKey(),
  providerCallId: text("provider_call_id").unique(),
  callerPhone: text("caller_phone"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  transcript: text("transcript"),
  summary: text("summary"),
  category: text("category"),
  transferStatus: text("transfer_status"),
  answeredByOwner: boolean("answered_by_owner").notNull().default(false),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type CallLog = typeof callLogsTable.$inferSelect;
export type NewCallLog = typeof callLogsTable.$inferInsert;
