/**
 * POST /api/form/submit
 *
 * Public-facing endpoint for website lead form submissions.
 * Accepts submissions from the Wolf Pack Wash embedded contact form (and any
 * future HH web properties) and stores them directly in the HH CRM leads table.
 *
 * Auth: lightweight shared-secret token via `X-HH-Token` header.
 *       Token value is stored in the `FORM_SUBMIT_SECRET` environment variable.
 *       This prevents casual abuse while keeping integration simple for embedded forms.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leadsTable, leadDetailsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const HH_BUSINESS_UNIT = "Healthy Home";
const FORM_SOURCE = "wolf_pack_wash_website";

// ---------------------------------------------------------------------------
// Auth middleware — shared secret token
// ---------------------------------------------------------------------------
function requireFormToken(req: any, res: any, next: any) {
  const secret = process.env.FORM_SUBMIT_SECRET;

  // If no secret is configured, allow all submissions (dev mode)
  if (!secret) {
    console.warn("[form] FORM_SUBMIT_SECRET not set — accepting all submissions (dev mode)");
    return next();
  }

  const provided =
    req.headers["x-hh-token"] ??
    req.headers["authorization"]?.replace(/^bearer\s+/i, "") ??
    req.query?.token;

  if (!provided || provided !== secret) {
    return res.status(401).json({
      error: "Unauthorized",
      hint: "Provide the shared token via X-HH-Token header.",
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// POST /api/form/submit
// ---------------------------------------------------------------------------
router.post("/submit", requireFormToken, async (req, res) => {
  try {
    const b = req.body as Record<string, any>;

    // ── Field normalization (accept both snake_case and camelCase) ──────────
    const firstName  = b.first_name  ?? b.firstName  ?? "";
    const lastName   = b.last_name   ?? b.lastName   ?? "";
    const fullName   = b.full_name   ?? b.fullName   ?? b.name ?? "";
    const phone      = b.phone       ?? b.phone_number ?? b.phoneNumber ?? null;
    const email      = b.email       ?? null;
    const address    = b.address     ?? b.address_line1 ?? b.addressLine1 ?? null;
    const city       = b.city        ?? null;
    const state      = b.state       ?? null;
    const zip        = b.zip         ?? b.postal_code ?? b.postalCode ?? null;

    // Accept single string or array
    const serviceRaw = b.service_interest ?? b.serviceInterest ?? b.services ?? b.service ?? null;
    const services: string[] | null = serviceRaw
      ? (Array.isArray(serviceRaw) ? serviceRaw : [serviceRaw])
      : null;

    const notes         = b.message ?? b.notes ?? b.comments ?? null;
    const preferredContact = b.preferred_contact ?? b.preferredContact ?? b.contact_method ?? null;

    // UTM / attribution passthrough
    const utmSource   = b.utm_source   ?? null;
    const utmMedium   = b.utm_medium   ?? null;
    const utmCampaign = b.utm_campaign ?? null;
    const utmContent  = b.utm_content  ?? null;

    // ── Resolve homeowner name ───────────────────────────────────────────────
    let homeownerName: string | null = null;
    if (firstName || lastName) {
      homeownerName = [firstName, lastName].filter(Boolean).join(" ");
    } else if (fullName) {
      homeownerName = fullName;
    }

    // ── Basic validation ────────────────────────────────────────────────────
    if (!homeownerName && !phone && !email) {
      return res.status(400).json({
        error: "Validation failed",
        details: "At least one of: name, phone, or email is required.",
      });
    }

    // ── Build notes with UTM attribution appended ────────────────────────────
    const utmParts: string[] = [];
    if (utmSource)   utmParts.push(`utm_source=${utmSource}`);
    if (utmMedium)   utmParts.push(`utm_medium=${utmMedium}`);
    if (utmCampaign) utmParts.push(`utm_campaign=${utmCampaign}`);
    if (utmContent)  utmParts.push(`utm_content=${utmContent}`);
    if (preferredContact) utmParts.push(`preferred_contact=${preferredContact}`);
    const attribution = utmParts.length ? `\n\n[Attribution] ${utmParts.join(" | ")}` : "";
    const fullNotes = notes ? `${notes}${attribution}` : (attribution.trim() || null);

    // ── Insert lead ──────────────────────────────────────────────────────────
    const [lead] = await db.insert(leadsTable).values({
      homeownerName,
      phone,
      email,
      addressLine1: address ?? "",   // column is NOT NULL; empty string when form omits address
      city,
      state,
      zip,
      source: FORM_SOURCE,
      businessUnit: HH_BUSINESS_UNIT,
      servicesInterested: services,
      status: "new",
      followupChannel: preferredContact ?? null,
      createdBy: "web_form",
    }).returning();

    // ── Insert details (notes + quote placeholder) ───────────────────────────
    if (fullNotes) {
      await db.insert(leadDetailsTable).values({
        leadId: lead.id,
        notes: fullNotes,
        syncSource: FORM_SOURCE,
        updatedBy: "web_form",
      }).onConflictDoNothing();
    }

    // ── Response ─────────────────────────────────────────────────────────────
    return res.status(201).json({
      success: true,
      id: lead.id,
      message: "Lead received. We'll be in touch soon!",
    });
  } catch (err) {
    console.error("[form/submit] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
