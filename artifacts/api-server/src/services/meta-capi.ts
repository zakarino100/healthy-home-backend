/**
 * Meta Conversions API (CAPI) service
 *
 * Sends CRM stage-change events back to Meta so Facebook can optimise
 * ad delivery based on actual downstream outcomes.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import crypto from "crypto";
import { db } from "@workspace/db";
import { fbLeadDetailsTable, integrationLogsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// CRM status → Meta event name mapping (single source of truth)
// ---------------------------------------------------------------------------
export const CRM_TO_META_EVENT: Record<string, string> = {
  new:       "Lead",
  contacted: "Contacted",
  quoted:    "QualifiedLead",
  scheduled: "AppointmentScheduled",
  sold:      "ConvertedLead",
  // 'lost' intentionally omitted — no standard Meta CRM event
};

// ---------------------------------------------------------------------------
// PII normalisation + SHA256 hashing (Meta's required format)
// ---------------------------------------------------------------------------
function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Normalise email: lowercase + trim */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** Normalise phone: digits only (strip +, spaces, dashes, parens) */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Normalise name part: lowercase + trim */
function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// sendMetaEvent — main function called from canvassing PUT route
// ---------------------------------------------------------------------------
export async function sendMetaEvent(
  leadId: string,
  newStatus: string,
  lead: Record<string, any>,
  fbDetails?: Record<string, any> | null,
): Promise<void> {
  const eventName = CRM_TO_META_EVENT[newStatus];
  if (!eventName) {
    // No mapped event for this status (e.g. 'lost') — skip silently
    return;
  }

  const accessToken = process.env.META_CONVERSIONS_ACCESS_TOKEN;
  const datasetId   = process.env.META_DATASET_ID ?? "738171941965940";
  const apiVersion  = process.env.META_CONVERSIONS_API_VERSION ?? "v25.0";

  if (!accessToken) {
    console.warn("[meta-capi] META_CONVERSIONS_ACCESS_TOKEN not set — skipping CAPI event");
    return;
  }

  // ── Build user_data with hashed PII ──────────────────────────────────────
  const userData: Record<string, string | string[]> = {};

  if (lead.email) {
    userData.em = sha256(normalizeEmail(lead.email));
  }
  if (lead.phone) {
    userData.ph = sha256(normalizePhone(lead.phone));
  }
  if (lead.firstName || lead.homeownerName) {
    const firstName = lead.firstName || (lead.homeownerName ?? "").split(" ")[0] || "";
    if (firstName) userData.fn = sha256(normalizeName(firstName));
  }
  if (lead.lastName) {
    userData.ln = sha256(normalizeName(lead.lastName));
  }
  if (lead.city)  userData.ct  = sha256(normalizeName(lead.city));
  if (lead.state) userData.st  = sha256(normalizeName(lead.state));
  if (lead.zip)   userData.zp  = sha256(lead.zip.trim());

  // Include original Meta lead_id for matching if available
  if (fbDetails?.metaLeadId) {
    userData.lead_id = fbDetails.metaLeadId;
  }

  const eventTime = Math.floor(Date.now() / 1000);

  const eventPayload = {
    data: [
      {
        event_name:   eventName,
        event_time:   eventTime,
        action_source: "system_generated",
        user_data:    userData,
        custom_data:  {
          event_source:       "crm",
          lead_event_source:  "Healthy Home CRM",
          lead_id:            fbDetails?.metaLeadId ?? null,
          crm_lead_id:        leadId,
          crm_status:         newStatus,
        },
      },
    ],
  };

  const endpoint = `https://graph.facebook.com/${apiVersion}/${datasetId}/events?access_token=${accessToken}`;

  // ── Fire the request ──────────────────────────────────────────────────────
  let responseBody: any = null;
  let success = false;
  let errorDetails: string | null = null;

  try {
    const res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(eventPayload),
    });

    responseBody = await res.json();
    success = res.ok;

    if (!res.ok) {
      errorDetails = JSON.stringify(responseBody?.error ?? responseBody);
      console.error("[meta-capi] CAPI error response:", errorDetails);
    } else {
      console.log(`[meta-capi] Sent ${eventName} for lead ${leadId} — events_received:`, responseBody?.events_received);
    }
  } catch (err: any) {
    errorDetails = err?.message ?? String(err);
    console.error("[meta-capi] fetch failed:", errorDetails);
  }

  // ── Persist audit log ─────────────────────────────────────────────────────
  try {
    await db.insert(integrationLogsTable).values({
      direction:   "outbound",
      integration: "facebook_capi",
      eventType:   eventName,
      leadId:      leadId,
      payloadSent:      eventPayload as any,
      responseReceived: responseBody ? (responseBody as any) : null,
      status:      success ? "success" : "error",
      errorDetails,
    });
  } catch (logErr) {
    console.error("[meta-capi] failed to write integration log:", logErr);
  }

  // ── Update hh_fb_lead_details sync tracking ───────────────────────────────
  try {
    await db
      .update(fbLeadDetailsTable)
      .set({
        lastMetaSyncAt:       new Date(),
        lastMetaSyncStatus:   success ? "success" : "error",
        lastMetaSyncError:    errorDetails,
        lastMetaEventName:    eventName,
        metaSyncAttemptCount: (fbDetails?.metaSyncAttemptCount ?? 0) + 1,
        updatedAt:            new Date(),
      })
      .where(eq(fbLeadDetailsTable.leadId, leadId));
  } catch (updateErr) {
    // Non-fatal — lead may not have an FB details row if it didn't come from FB
    // (we still sent the CAPI event and logged it)
  }
}
