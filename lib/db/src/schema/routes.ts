import {
  pgTable,
  serial,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const canvassingRoutesTable = pgTable("canvassing_routes", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  repEmail: text("rep_email").notNull(),
  repName: text("rep_name"),
  neighborhood: text("neighborhood"),
  routeName: text("route_name"),
  status: text("status").notNull().default("planned"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCanvassingRouteSchema = createInsertSchema(canvassingRoutesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCanvassingRoute = z.infer<typeof insertCanvassingRouteSchema>;
export type CanvassingRoute = typeof canvassingRoutesTable.$inferSelect;
