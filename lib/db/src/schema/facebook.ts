import {
  pgTable,
  serial,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// hh_fb_lead_details — Facebook Lead Ads attribution + CAPI sync tracking
// One row per lead that originated from (or has been synced to) Facebook.
// ---------------------------------------------------------------------------
export const fbLeadDetailsTable = pgTable("hh_fb_lead_details", {
  id:     serial("id").primaryKey(),
  leadId: uuid("lead_id").notNull().unique(),

  // ── Facebook attribution (read from Graph API after webhook) ──────────────
  metaLeadId:     text("meta_lead_id").unique(), // Graph leadgen_id — dedup key
  metaPageId:     text("meta_page_id"),
  metaFormId:     text("meta_form_id"),
  metaCampaignId:   text("meta_campaign_id"),
  metaCampaignName: text("meta_campaign_name"),
  metaAdsetId:      text("meta_adset_id"),
  metaAdsetName:    text("meta_adset_name"),
  metaAdId:         text("meta_ad_id"),
  metaAdName:       text("meta_ad_name"),
  metaClickId:      text("meta_click_id"),       // fbclid value
  rawPayload:       jsonb("raw_payload"),         // full Graph API lead response

  // ── CAPI outbound sync tracking ───────────────────────────────────────────
  lastMetaSyncAt:        timestamp("last_meta_sync_at", { withTimezone: true }),
  lastMetaSyncStatus:    text("last_meta_sync_status"),  // 'success' | 'error'
  lastMetaSyncError:     text("last_meta_sync_error"),
  lastMetaEventName:     text("last_meta_event_name"),
  metaSyncAttemptCount:  integer("meta_sync_attempt_count").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FbLeadDetails     = typeof fbLeadDetailsTable.$inferSelect;
export type InsertFbLeadDetails = typeof fbLeadDetailsTable.$inferInsert;

// ---------------------------------------------------------------------------
// hh_integration_logs — inbound / outbound event audit trail
// ---------------------------------------------------------------------------
export const integrationLogsTable = pgTable("hh_integration_logs", {
  id:          serial("id").primaryKey(),
  direction:   text("direction").notNull(),     // 'inbound' | 'outbound'
  integration: text("integration").notNull(),   // 'facebook_lead_ads' | 'facebook_capi'
  eventType:   text("event_type"),              // e.g. 'lead_created', 'ConvertedLead'
  leadId:      uuid("lead_id"),                 // soft FK (no constraint — survives lead delete)
  payloadSent:      jsonb("payload_sent"),       // outbound: what we sent; inbound: raw webhook
  responseReceived: jsonb("response_received"), // outbound: Meta's response
  status:      text("status").notNull(),        // 'success' | 'error' | 'pending'
  errorDetails: text("error_details"),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type IntegrationLog       = typeof integrationLogsTable.$inferSelect;
export type InsertIntegrationLog = typeof integrationLogsTable.$inferInsert;
