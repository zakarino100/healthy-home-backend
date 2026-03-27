/**
 * Facebook Lead Ads integration
 *
 * GET  /api/facebook/webhook  — Meta hub.challenge webhook verification
 * POST /api/facebook/webhook  — Inbound Lead Ads events
 *
 * Flow:
 *  1. Meta sends a webhook notification with the leadgen_id
 *  2. We fetch the full lead from Graph API (field_data, attribution IDs)
 *  3. Normalise fields → insert/upsert into `leads` + `hh_fb_lead_details`
 *  4. Log raw payload + result to `hh_integration_logs`
 *  5. Return 200 immediately (Meta requires fast response or retries indefinitely)
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  leadsTable,
  fbLeadDetailsTable,
  integrationLogsTable,
} from "@workspace/db/schema";
import { eq, or } from "drizzle-orm";
import { sendMetaEvent } from "../services/meta-capi.js";

const router = Router();

const FB_SOURCE      = "facebook_lead_ads";
const HH_BUSINESS    = "Healthy Home";
const VERIFY_TOKEN   = () => process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN ?? "";
const ACCESS_TOKEN   = () => process.env.META_CONVERSIONS_ACCESS_TOKEN ?? "";
const GRAPH_BASE     = "https://graph.facebook.com/v25.0";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch the full lead from Graph API using the leadgen_id */
async function fetchGraphLead(leadgenId: string): Promise<Record<string, any> | null> {
  const token = ACCESS_TOKEN();
  if (!token) {
    console.warn("[facebook] META_CONVERSIONS_ACCESS_TOKEN not set — cannot fetch lead");
    return null;
  }
  const fields = "field_data,created_time,id,ad_id,adset_id,campaign_id,form_id,page_id";
  const url = `${GRAPH_BASE}/${leadgenId}?fields=${fields}&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API ${res.status}: ${err}`);
  }
  return res.json();
}

/** Parse field_data array → flat object.  Facebook key → our key */
function parseFieldData(fieldData: Array<{ name: string; values: string[] }>) {
  const raw: Record<string, string> = {};
  for (const f of fieldData) {
    raw[f.name] = (f.values ?? [])[0] ?? "";
  }

  // Common FB field name normalisation
  const firstName =
    raw.first_name || raw.firstname || raw.name?.split(" ")[0] || "";
  const lastName  =
    raw.last_name  || raw.lastname  || raw.name?.split(" ").slice(1).join(" ") || "";
  const fullName  = raw.full_name || raw.name || `${firstName} ${lastName}`.trim();
  const phone     = raw.phone_number || raw.phone || raw.mobile_phone || "";
  const email     = raw.email || "";
  const address   = raw.street_address || raw.address || "";
  const city      = raw.city || "";
  const state     = raw.state || raw.province || "";
  const zip       = raw.zip_code || raw.postal_code || raw.zip || "";
  const service   = raw.service_interest || raw.what_service_are_you_looking_for || raw.service || "";
  const message   = raw.message || raw.comments || raw.notes || "";
  const preferred = raw.preferred_contact_method || raw.preferred_contact || "";

  return { firstName, lastName, fullName, phone, email, address, city, state, zip, service, message, preferred };
}

// ---------------------------------------------------------------------------
// GET /api/facebook/webhook — Meta hub.challenge verification
// ---------------------------------------------------------------------------
router.get("/webhook", (req: Request, res: Response) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN()) {
    console.log("[facebook] Webhook verified by Meta");
    return res.status(200).send(challenge);
  }

  console.warn("[facebook] Webhook verification failed — token mismatch or wrong mode");
  return res.sendStatus(403);
});

// ---------------------------------------------------------------------------
// POST /api/facebook/webhook — Inbound Lead Ads events
// ---------------------------------------------------------------------------
router.post("/webhook", async (req: Request, res: Response) => {
  // Respond immediately — Meta retries if we take > 20 s
  res.sendStatus(200);

  const body = req.body as any;

  // Basic shape guard
  if (!body || body.object !== "page") {
    console.warn("[facebook] Unexpected webhook object:", body?.object);
    return;
  }

  const entries: any[] = body.entry ?? [];

  for (const entry of entries) {
    const pageId   = String(entry.id ?? "");
    const changes: any[] = entry.changes ?? [];

    for (const change of changes) {
      if (change.field !== "leadgen") continue;

      const val        = change.value ?? {};
      const leadgenId  = String(val.leadgen_id ?? "");
      const formId     = String(val.form_id     ?? "");
      const adId       = String(val.ad_id       ?? "");
      const adsetId    = String(val.adset_id    ?? "");
      const campaignId = String(val.campaign_id ?? "");

      if (!leadgenId) {
        console.warn("[facebook] Change missing leadgen_id:", JSON.stringify(val));
        continue;
      }

      console.log(`[facebook] Processing leadgen_id=${leadgenId}`);

      // Log raw inbound webhook immediately (before Graph API call)
      await db.insert(integrationLogsTable).values({
        direction:   "inbound",
        integration: "facebook_lead_ads",
        eventType:   "lead_created",
        payloadSent: val as any,
        status:      "pending",
      }).catch(console.error);

      // --- Fetch full lead from Graph API ---
      let graphLead: Record<string, any> | null = null;
      try {
        graphLead = await fetchGraphLead(leadgenId);
      } catch (err: any) {
        console.error(`[facebook] Graph API fetch failed for ${leadgenId}:`, err.message);
        await db.insert(integrationLogsTable).values({
          direction:    "inbound",
          integration:  "facebook_lead_ads",
          eventType:    "lead_created",
          payloadSent:  val as any,
          status:       "error",
          errorDetails: `Graph API fetch failed: ${err.message}`,
        }).catch(console.error);
        continue;
      }

      if (!graphLead) continue;

      const { firstName, lastName, fullName, phone, email, address, city, state, zip, service, message, preferred } =
        parseFieldData(graphLead.field_data ?? []);

      // --- Dedup: check meta_lead_id, then phone, then email ---
      let existingLeadId: string | null = null;

      const existingFb = await db
        .select({ leadId: fbLeadDetailsTable.leadId })
        .from(fbLeadDetailsTable)
        .where(eq(fbLeadDetailsTable.metaLeadId, leadgenId))
        .limit(1)
        .catch(() => []);

      if (existingFb.length > 0) {
        existingLeadId = existingFb[0].leadId;
        console.log(`[facebook] Duplicate leadgen_id ${leadgenId} — skipping insert`);
      }

      // --- Phone/email dedup (only if no meta_lead_id match) ---
      if (!existingLeadId && (phone || email)) {
        const conditions: any[] = [];
        if (phone) conditions.push(eq(leadsTable.phone, phone));
        if (email) conditions.push(eq(leadsTable.email, email));

        const existingByContact = await db
          .select({ id: leadsTable.id })
          .from(leadsTable)
          .where(or(...conditions))
          .limit(1)
          .catch(() => []);

        if (existingByContact.length > 0) {
          existingLeadId = existingByContact[0].id;
          console.log(`[facebook] Matched existing lead by phone/email — id=${existingLeadId}`);
        }
      }

      // --- Insert or update lead ---
      let leadId: string;

      if (existingLeadId) {
        leadId = existingLeadId;
        // Update contact info if we now have richer data
        await db
          .update(leadsTable)
          .set({
            ...(email   ? { email }   : {}),
            ...(phone   ? { phone }   : {}),
            ...(address ? { addressLine1: address } : {}),
            ...(city    ? { city }    : {}),
            ...(state   ? { state }   : {}),
            ...(zip     ? { zip }     : {}),
            source: FB_SOURCE,   // ensure source attribution
          })
          .where(eq(leadsTable.id, leadId))
          .catch(console.error);
      } else {
        // New lead
        const [inserted] = await db
          .insert(leadsTable)
          .values({
            homeownerName: fullName || `${firstName} ${lastName}`.trim() || "Unknown",
            phone,
            email,
            addressLine1: address ?? "",
            city,
            state,
            zip,
            source:       FB_SOURCE,
            businessUnit: HH_BUSINESS,
            status:       "new",
          })
          .returning({ id: leadsTable.id });

        leadId = inserted.id;
        console.log(`[facebook] Created new lead id=${leadId} for leadgen_id=${leadgenId}`);

        // Auto-fire Lead event to Meta CAPI for new leads
        setImmediate(() =>
          sendMetaEvent(leadId, "new", { email, phone, city, state, zip, homeownerName: fullName }).catch(console.error)
        );
      }

      // --- Upsert hh_fb_lead_details ---
      await db
        .insert(fbLeadDetailsTable)
        .values({
          leadId,
          metaLeadId:      leadgenId,
          metaPageId:      pageId || (graphLead.page_id ?? null),
          metaFormId:      formId || (graphLead.form_id ?? null),
          metaCampaignId:  campaignId || (graphLead.campaign_id ?? null),
          metaAdsetId:     adsetId    || (graphLead.adset_id    ?? null),
          metaAdId:        adId       || (graphLead.ad_id       ?? null),
          rawPayload:      graphLead as any,
        })
        .onConflictDoUpdate({
          target: fbLeadDetailsTable.leadId,
          set: {
            metaLeadId:  leadgenId,
            metaPageId:  pageId || (graphLead.page_id ?? null),
            rawPayload:  graphLead as any,
            updatedAt:   new Date(),
          },
        })
        .catch(console.error);

      // --- Final audit log (success) ---
      await db.insert(integrationLogsTable).values({
        direction:        "inbound",
        integration:      "facebook_lead_ads",
        eventType:        "lead_created",
        leadId,
        payloadSent:      graphLead as any,
        status:           "success",
      }).catch(console.error);

      console.log(`[facebook] ✓ Processed leadgen_id=${leadgenId} → lead ${leadId}`);
    }
  }
});

export default router;
