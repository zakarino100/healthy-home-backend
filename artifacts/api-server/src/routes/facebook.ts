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

// ---------------------------------------------------------------------------
// POST /api/facebook/backfill
//
// One-time (or repeatable) backfill: fetches every lead ever submitted to a
// Facebook Lead Ads form via the Graph API and upserts any that are missing
// from Supabase.  Deduplicates on meta_lead_id, then falls back to phone/email.
//
// Auth: requires X-HH-Token header matching FORM_SUBMIT_SECRET env var.
//
// Body: { "form_id": "<your_FB_form_id>" }
// Optional: { "form_id": "...", "page_id": "..." }
//
// Returns: { inserted, skipped, errors, leads: [{...}] }
// ---------------------------------------------------------------------------

const ADMIN_TOKEN = () => process.env.FORM_SUBMIT_SECRET ?? "";

router.post("/backfill", async (req: Request, res: Response) => {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const token = req.headers["x-hh-token"] as string | undefined;
  if (!ADMIN_TOKEN() || token !== ADMIN_TOKEN()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { form_id: formId, page_id: pageId } = req.body ?? {};
  if (!formId) {
    return res.status(400).json({ error: "form_id is required" });
  }

  const accessToken = ACCESS_TOKEN();
  if (!accessToken) {
    return res.status(500).json({ error: "META_CONVERSIONS_ACCESS_TOKEN is not configured" });
  }

  console.log(`[facebook/backfill] Starting backfill for form_id=${formId}`);

  // ── Optional: fetch form metadata (page_id, form name) ───────────────────
  let resolvedPageId = pageId ?? null;
  let formName = formId;
  try {
    const formMeta = await fetch(
      `${GRAPH_BASE}/${formId}?fields=id,name,page&access_token=${accessToken}`
    ).then(r => r.json()) as any;

    if (formMeta.error) {
      console.warn("[facebook/backfill] Could not fetch form metadata:", formMeta.error?.message);
    } else {
      formName = formMeta.name ?? formId;
      resolvedPageId = resolvedPageId ?? formMeta.page?.id ?? null;
    }
  } catch (err: any) {
    console.warn("[facebook/backfill] form metadata fetch failed:", err.message);
  }

  // ── Paginate through all leads on the form ────────────────────────────────
  const fields = "id,created_time,field_data,ad_id,adset_id,campaign_id,ad_name,adset_name,campaign_name";
  let nextUrl: string | null =
    `${GRAPH_BASE}/${formId}/leads?fields=${fields}&limit=100&access_token=${accessToken}`;

  const allGraphLeads: any[] = [];
  let pageCount = 0;

  while (nextUrl) {
    const page = await fetch(nextUrl).then(r => r.json()) as any;

    if (page.error) {
      console.error("[facebook/backfill] Graph API error:", page.error);
      return res.status(502).json({ error: "Graph API error", detail: page.error });
    }

    allGraphLeads.push(...(page.data ?? []));
    nextUrl = page.paging?.next ?? null;
    pageCount++;
    console.log(`[facebook/backfill] Page ${pageCount}: fetched ${page.data?.length ?? 0} leads (total so far: ${allGraphLeads.length})`);
  }

  console.log(`[facebook/backfill] Total leads from Meta: ${allGraphLeads.length}`);

  // ── Fetch all existing meta_lead_ids so we can fast-dedup in memory ───────
  const existingFbRows = await db
    .select({ metaLeadId: fbLeadDetailsTable.metaLeadId, leadId: fbLeadDetailsTable.leadId })
    .from(fbLeadDetailsTable)
    .catch(() => []);

  const existingMetaIds = new Set(existingFbRows.map(r => r.metaLeadId).filter(Boolean));

  // ── Process each lead ────────────────────────────────────────────────────
  const results: Array<{ metaLeadId: string; action: "inserted" | "skipped"; name?: string; reason?: string }> = [];
  let insertedCount = 0;
  let skippedCount  = 0;
  let errorCount    = 0;

  for (const graphLead of allGraphLeads) {
    const leadgenId = String(graphLead.id ?? "");
    if (!leadgenId) { errorCount++; continue; }

    // 1. Dedup on meta_lead_id (fast in-memory check)
    if (existingMetaIds.has(leadgenId)) {
      skippedCount++;
      results.push({ metaLeadId: leadgenId, action: "skipped", reason: "meta_lead_id already exists" });
      continue;
    }

    const { firstName, lastName, fullName, phone, email, address, city, state, zip, service, message } =
      parseFieldData(graphLead.field_data ?? []);

    // 2. Phone/email dedup (check DB)
    let existingLeadId: string | null = null;
    if (phone || email) {
      const conditions: any[] = [];
      if (phone)  conditions.push(eq(leadsTable.phone, phone));
      if (email)  conditions.push(eq(leadsTable.email, email));
      const hit = await db
        .select({ id: leadsTable.id })
        .from(leadsTable)
        .where(or(...conditions))
        .limit(1)
        .catch(() => []);
      if (hit.length > 0) existingLeadId = hit[0].id;
    }

    try {
      let leadId: string;

      if (existingLeadId) {
        // Update existing lead's source attribution if it came from FB
        leadId = existingLeadId;
        await db
          .update(leadsTable)
          .set({
            source: FB_SOURCE,
            ...(email   ? { email }   : {}),
            ...(address ? { addressLine1: address } : {}),
            ...(city    ? { city }    : {}),
            ...(state   ? { state }   : {}),
            ...(zip     ? { zip }     : {}),
          })
          .where(eq(leadsTable.id, leadId))
          .catch(console.error);
      } else {
        // Insert brand-new lead
        const createdAt = graphLead.created_time ? new Date(graphLead.created_time) : new Date();
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
            createdAt,
          })
          .returning({ id: leadsTable.id });
        leadId = inserted.id;
      }

      // Upsert hh_fb_lead_details
      await db
        .insert(fbLeadDetailsTable)
        .values({
          leadId,
          metaLeadId:      leadgenId,
          metaPageId:      resolvedPageId,
          metaFormId:      formId,
          metaCampaignId:  graphLead.campaign_id ?? null,
          metaCampaignName: graphLead.campaign_name ?? null,
          metaAdsetId:     graphLead.adset_id   ?? null,
          metaAdsetName:   graphLead.adset_name  ?? null,
          metaAdId:        graphLead.ad_id       ?? null,
          metaAdName:      graphLead.ad_name     ?? null,
          rawPayload:      graphLead as any,
        })
        .onConflictDoUpdate({
          target: fbLeadDetailsTable.leadId,
          set: {
            metaLeadId:  leadgenId,
            metaFormId:  formId,
            rawPayload:  graphLead as any,
            updatedAt:   new Date(),
          },
        })
        .catch(console.error);

      // Audit log
      await db.insert(integrationLogsTable).values({
        direction:   "inbound",
        integration: "facebook_lead_ads",
        eventType:   "backfill",
        leadId,
        payloadSent: graphLead as any,
        status:      "success",
      }).catch(console.error);

      existingMetaIds.add(leadgenId); // prevent re-insert if same ID appears twice in API response
      insertedCount++;
      results.push({ metaLeadId: leadgenId, action: "inserted", name: fullName || phone || email });
      console.log(`[facebook/backfill] ✓ Inserted lead ${leadId} (${fullName || phone})`);

    } catch (err: any) {
      errorCount++;
      console.error(`[facebook/backfill] Failed for leadgen_id=${leadgenId}:`, err.message);
      results.push({ metaLeadId: leadgenId, action: "skipped", reason: `error: ${err.message}` });
    }
  }

  console.log(`[facebook/backfill] Done — inserted:${insertedCount} skipped:${skippedCount} errors:${errorCount}`);

  return res.json({
    form_id:   formId,
    form_name: formName,
    total_from_meta: allGraphLeads.length,
    inserted: insertedCount,
    skipped:  skippedCount,
    errors:   errorCount,
    leads: results,
  });
});

export default router;
