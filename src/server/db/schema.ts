import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Minimal operational table. Business tables arrive with their user-facing slices.
export const serviceState = pgTable("service_state", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
