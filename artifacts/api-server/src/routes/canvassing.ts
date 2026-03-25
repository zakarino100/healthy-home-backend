import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  canvassingSessionsTable,
  canvassingRoutesTable,
  leadsTable,
  leadDetailsTable,
  leadMetaTable,
  customersTable,
  jobsTable,
  jobContentTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, or, isNull, sql, ne } from "drizzle-orm";

const router: IRouter = Router();

const HH_BUSINESS_UNIT = "Healthy Home";

// ---------------------------------------------------------------------------
// Helpers — map between external API shape and the shared leads + lead_details tables
// ---------------------------------------------------------------------------

/** External API → DB values for leads table */
function externalToLeadDb(body: Record<string, any>) {
  const nameParts = [body.firstName, body.lastName].filter(Boolean);
  return {
    homeownerName: nameParts.length ? nameParts.join(" ") : (body.homeownerName ?? null),
    phone: body.phone ?? null,
    email: body.email ?? null,
    addressLine1: body.address ?? body.addressLine1 ?? "",
    city: body.city ?? null,
    state: body.state ?? null,
    zip: body.zip ?? null,
    source: body.source ?? "crm",
    businessUnit: HH_BUSINESS_UNIT,
    servicesInterested: body.serviceInterest
      ? [body.serviceInterest]
      : body.servicesInterested ?? null,
    status: body.status ?? "new",
    assignedRepEmail: body.canvasser ?? body.assignedRepEmail ?? null,
    nextFollowupAt: body.followUpDate
      ? new Date(body.followUpDate)
      : body.nextFollowupAt
        ? new Date(body.nextFollowupAt)
        : null,
    createdBy: body.createdBy ?? null,
  };
}

/** Extract lead_details fields from incoming body (undefined = not provided) */
function externalToDetailsDb(body: Record<string, any>) {
  const hasDetails = body.soldPrice != null || body.quotePrice != null || body.quoteAmount != null || body.servicePackage != null;
  if (!hasDetails) return null;
  return {
    soldPrice: body.soldPrice ?? null,
    quotePrice: body.quotePrice ?? body.quoteAmount ?? null,
    servicePackage: body.servicePackage ?? body.serviceInterest ?? null,
    isBundle: body.isBundle === true || body.isBundle === "true",
    notes: body.detailsNotes ?? null,
  };
}

const WOLF_PACK_SOURCE = "Wolf Pack Wash leads historical import";

/** Returns true if this lead is a historical Wolf Pack import (should not enter jobs pipeline) */
function isWolfPackLead(lead: Record<string, any>): boolean {
  return lead.source === WOLF_PACK_SOURCE || lead.isHistoricalImport === true;
}

/** DB row + joined details (+ optional meta) → external API shape */
function dbToExternal(
  lead: Record<string, any>,
  details?: Record<string, any> | null,
  meta?: Record<string, any> | null,
) {
  const name = lead.homeownerName ?? "";
  const spaceIdx = name.indexOf(" ");
  const firstName = spaceIdx >= 0 ? name.slice(0, spaceIdx) : name;
  const lastName = spaceIdx >= 0 ? name.slice(spaceIdx + 1) : "";
  return {
    id: lead.id,
    firstName,
    lastName,
    phone: lead.phone,
    email: lead.email,
    address: lead.addressLine1,
    city: lead.city,
    state: lead.state,
    zip: lead.zip,
    source: lead.source,
    businessUnit: lead.businessUnit,
    canvasser: lead.assignedRepEmail,
    serviceInterest: Array.isArray(lead.servicesInterested)
      ? lead.servicesInterested[0] ?? null
      : null,
    status: lead.status,
    followUpDate: lead.nextFollowupAt
      ? new Date(lead.nextFollowupAt).toISOString().split("T")[0]
      : null,
    doNotKnock: lead.doNotKnock,
    // Financial details from hh_lead_details
    soldPrice: details?.soldPrice ?? null,
    quotePrice: details?.quotePrice ?? null,
    quoteAmount: details?.quotePrice ?? null, // backward compat alias
    servicePackage: details?.servicePackage ?? null,
    isBundle: details?.isBundle ?? false,
    hasJobScheduled: details?.jobId != null,
    scheduledJobId: details?.jobId ?? null,
    notes: details?.notes ?? null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    // Audit / soft-delete from hh_lead_meta
    isDeleted: meta?.isDeleted ?? false,
    deletedAt: meta?.deletedAt ?? null,
    deletedBy: meta?.deletedBy ?? null,
    updatedBy: meta?.updatedBy ?? null,
    changeLog: (meta?.changeLog as any[]) ?? [],
    // Historical import fields (Wolf Pack Wash)
    isHistoricalImport: lead.isHistoricalImport ?? false,
    importBatch: lead.importBatch ?? null,
    leadYear: lead.leadYear ?? null,
    leadSourceOriginal: lead.leadSourceOriginal ?? null,
    isServiced: lead.isServiced ?? false,
    servicedOn: lead.servicedOn ?? null,
    soldDate: lead.soldDate ?? null,
    scheduledDate: lead.scheduledDate ?? null,
    isPurchased: lead.isPurchased ?? false,
    totalQuote: lead.totalQuote ?? null,
    frequency: lead.frequency ?? null,
    houseSqft: lead.houseSqft ?? null,
    cementSqft: lead.cementSqft ?? null,
    serviceNotes: lead.serviceNotes ?? null,
    conversationNotes: lead.conversationNotes ?? null,
  };
}

/** Upsert hh_lead_details for a given leadId */
async function upsertLeadDetails(leadId: string, detailsData: Record<string, any> | null) {
  if (!detailsData) return null;
  const existing = await db.select().from(leadDetailsTable).where(eq(leadDetailsTable.leadId, leadId));
  if (existing.length > 0) {
    const [updated] = await db.update(leadDetailsTable)
      .set({ ...detailsData, updatedAt: new Date() })
      .where(eq(leadDetailsTable.leadId, leadId))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(leadDetailsTable)
      .values({ leadId, ...detailsData })
      .returning();
    return created;
  }
}

/** Upsert hh_lead_meta for a given leadId */
async function upsertLeadMeta(leadId: string, data: Record<string, any>) {
  const existing = await db.select().from(leadMetaTable).where(eq(leadMetaTable.leadId, leadId));
  if (existing.length > 0) {
    const [updated] = await db.update(leadMetaTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(leadMetaTable.leadId, leadId))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(leadMetaTable)
      .values({ leadId, ...data })
      .returning();
    return created;
  }
}

/**
 * Auto-create an hh_customers + needs_scheduling hh_jobs record for a sold lead.
 * Called when a lead's status transitions to "sold".
 * Does NOT set lead_details.job_id — the "Schedule Job" flow on the Jobs page
 * will do that when the user confirms a date/technician.
 * Idempotent: skips silently if a job already exists for this lead.
 */
async function autoConvertSoldLead(
  leadId: string,
  lead: Record<string, any>,
  details: Record<string, any> | null,
) {
  // Skip historical imports — Wolf Pack leads should never enter the jobs pipeline
  if (isWolfPackLead(lead)) {
    console.log(`[autoConvert] skipping historical import lead ${leadId}`);
    return;
  }

  // Skip if any job already linked to this lead
  const existing = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(eq(jobsTable.leadId, leadId));
  if (existing.length > 0) return;

  const name = (lead.homeownerName as string | null) ?? "";
  const spaceIdx = name.indexOf(" ");
  const firstName = spaceIdx >= 0 ? name.slice(0, spaceIdx) : (name || "Unknown");
  const lastName = spaceIdx >= 0 ? name.slice(spaceIdx + 1) : "";

  const servicesArr = Array.isArray(lead.servicesInterested)
    ? lead.servicesInterested
    : [];
  const serviceType =
    (details as any)?.servicePackage ??
    servicesArr[0] ??
    "house_wash";

  const [customer] = await db.insert(customersTable).values({
    firstName: firstName || "Unknown",
    lastName: lastName || "",
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    address: lead.addressLine1 ?? null,
    city: lead.city ?? null,
    state: lead.state ?? null,
    zip: lead.zip ?? null,
    notes: null,
    optOut: false,
    reviewCampaignEligible: false,
  }).returning();

  const [job] = await db.insert(jobsTable).values({
    customerId: customer.id,
    serviceType,
    soldPrice: (details as any)?.soldPrice ?? null,
    quotedPrice: (details as any)?.quotePrice ?? null,
    status: "needs_scheduling",
    scheduledAt: null,
    technicianAssigned: null,
    paymentStatus: "pending",
    leadId,
    notes: null,
  }).returning();

  await db.insert(jobContentTable).values({ jobId: job.id }).onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// Canvassing Sessions
// ---------------------------------------------------------------------------

router.get("/sessions", async (req, res) => {
  try {
    const { date, canvasser, neighborhood, startDate, endDate } = req.query as Record<string, string | undefined>;
    const conditions: ReturnType<typeof eq>[] = [];
    if (date) conditions.push(eq(canvassingSessionsTable.sessionDate, date));
    if (canvasser) conditions.push(eq(canvassingSessionsTable.canvasser, canvasser));
    if (neighborhood) conditions.push(eq(canvassingSessionsTable.neighborhood, neighborhood));
    if (startDate) conditions.push(gte(canvassingSessionsTable.sessionDate, startDate));
    if (endDate) conditions.push(lte(canvassingSessionsTable.sessionDate, endDate));
    const sessions = conditions.length > 0
      ? await db.select().from(canvassingSessionsTable).where(and(...conditions)).orderBy(canvassingSessionsTable.sessionDate)
      : await db.select().from(canvassingSessionsTable).orderBy(canvassingSessionsTable.sessionDate);
    res.json(sessions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sessions", async (req, res) => {
  try {
    const body = req.body;
    const [session] = await db.insert(canvassingSessionsTable).values({
      canvasser: body.canvasser,
      sessionDate: body.sessionDate,
      neighborhood: body.neighborhood ?? null,
      route: body.route ?? null,
      doorsKnocked: body.doorsKnocked ?? 0,
      peopleReached: body.peopleReached ?? 0,
      goodConversations: body.goodConversations ?? 0,
      quotesGiven: body.quotesGiven ?? 0,
      closes: body.closes ?? 0,
      revenueSold: body.revenueSold ?? "0",
      averageTicket: body.averageTicket ?? null,
      bundleCount: body.bundleCount ?? 0,
      driveawayAddOnCount: body.driveawayAddOnCount ?? 0,
      notes: body.notes ?? null,
      notHome: body.notHome ?? 0,
      noAnswer: body.noAnswer ?? 0,
      callbacksRequested: body.callbacksRequested ?? 0,
      syncSource: body.syncSource ?? "dashboard",
      updatedBy: body.updatedBy ?? null,
      routeId: body.routeId ?? null,
    }).returning();
    res.status(201).json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sessions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [session] = await db.select().from(canvassingSessionsTable).where(eq(canvassingSessionsTable.id, id));
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/sessions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body;
    const [session] = await db.update(canvassingSessionsTable)
      .set({
        canvasser: body.canvasser,
        sessionDate: body.sessionDate,
        neighborhood: body.neighborhood ?? null,
        route: body.route ?? null,
        doorsKnocked: body.doorsKnocked ?? 0,
        peopleReached: body.peopleReached ?? 0,
        goodConversations: body.goodConversations ?? 0,
        quotesGiven: body.quotesGiven ?? 0,
        closes: body.closes ?? 0,
        revenueSold: body.revenueSold ?? "0",
        averageTicket: body.averageTicket ?? null,
        bundleCount: body.bundleCount ?? 0,
        driveawayAddOnCount: body.driveawayAddOnCount ?? 0,
        notes: body.notes ?? null,
        notHome: body.notHome ?? 0,
        noAnswer: body.noAnswer ?? 0,
        callbacksRequested: body.callbacksRequested ?? 0,
        syncSource: body.syncSource ?? undefined,
        updatedBy: body.updatedBy ?? null,
        routeId: body.routeId ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(canvassingSessionsTable.id, id))
      .returning();
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/sessions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await db.delete(canvassingSessionsTable).where(eq(canvassingSessionsTable.id, id)).returning();
    if (!deleted.length) return res.status(404).json({ error: "Session not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// Leads — filtered to business_unit = 'healthy_home', joined with hh_lead_details
// ---------------------------------------------------------------------------

router.get("/leads", async (req, res) => {
  try {
    const { status, canvasser, source, historical } = req.query as Record<string, string | undefined>;
    const conditions: ReturnType<typeof eq>[] = [
      eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      // Exclude soft-deleted leads (meta row absent = not deleted; present with is_deleted=true = excluded)
      or(isNull(leadMetaTable.leadId), eq(leadMetaTable.isDeleted, false))!,
    ];
    if (status) conditions.push(eq(leadsTable.status, status));
    if (canvasser) conditions.push(eq(leadsTable.assignedRepEmail, canvasser));
    if (historical === "true") {
      // Return only historical Wolf Pack imports
      conditions.push(eq(leadsTable.source, WOLF_PACK_SOURCE));
    } else if (historical === "false") {
      // Return only active HH leads, not historical imports
      conditions.push(ne(leadsTable.source, WOLF_PACK_SOURCE));
    } else if (source) {
      // Legacy exact-match source filter
      conditions.push(eq(leadsTable.source, source));
    }

    const rows = await db
      .select({
        lead: leadsTable,
        details: leadDetailsTable,
        meta: leadMetaTable,
      })
      .from(leadsTable)
      .leftJoin(leadDetailsTable, eq(leadDetailsTable.leadId, leadsTable.id))
      .leftJoin(leadMetaTable, eq(leadMetaTable.leadId, leadsTable.id))
      .where(and(...conditions))
      .orderBy(leadsTable.createdAt);

    res.json(rows.map(r => dbToExternal(r.lead, r.details, r.meta)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/leads", async (req, res) => {
  try {
    const leadValues = externalToLeadDb(req.body);
    const detailsData = externalToDetailsDb(req.body);

    const [lead] = await db.insert(leadsTable).values(leadValues).returning();
    const details = await upsertLeadDetails(lead.id, detailsData);

    res.status(201).json(dbToExternal(lead, details));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leads/:id", async (req, res) => {
  try {
    const [row] = await db
      .select({ lead: leadsTable, details: leadDetailsTable, meta: leadMetaTable })
      .from(leadsTable)
      .leftJoin(leadDetailsTable, eq(leadDetailsTable.leadId, leadsTable.id))
      .leftJoin(leadMetaTable, eq(leadMetaTable.leadId, leadsTable.id))
      .where(and(
        eq(leadsTable.id, req.params.id),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      ));
    if (!row) return res.status(404).json({ error: "Lead not found" });
    if (row.meta?.isDeleted) return res.status(404).json({ error: "Lead not found" });

    // Linked jobs
    const linkedJobs = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.leadId, row.lead.id));

    // Linked customer (via first job)
    let linkedCustomer = null;
    if (linkedJobs.length > 0 && linkedJobs[0].customerId) {
      const [cust] = await db
        .select()
        .from(customersTable)
        .where(eq(customersTable.id, linkedJobs[0].customerId));
      linkedCustomer = cust ?? null;
    }

    res.json({
      ...dbToExternal(row.lead, row.details, row.meta),
      linkedCustomer,
      linkedJobs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/leads/:id", async (req, res) => {
  try {
    // 1. Fetch current state
    const [row] = await db
      .select({ lead: leadsTable, details: leadDetailsTable, meta: leadMetaTable })
      .from(leadsTable)
      .leftJoin(leadDetailsTable, eq(leadDetailsTable.leadId, leadsTable.id))
      .leftJoin(leadMetaTable, eq(leadMetaTable.leadId, leadsTable.id))
      .where(and(
        eq(leadsTable.id, req.params.id),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      ));
    if (!row) return res.status(404).json({ error: "Lead not found" });
    if (row.meta?.isDeleted) return res.status(404).json({ error: "Lead not found" });

    // 2. Allowlist — only accept these external field names
    const EDITABLE_FIELDS = [
      "firstName", "lastName", "phone", "email",
      "address", "city", "state", "zip",
      "serviceInterest", "quoteAmount", "status",
      "followUpDate", "notes",
    ];
    const incoming: Record<string, any> = {};
    for (const field of EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) incoming[field] = req.body[field];
    }

    // 3. Compute changeset against current external shape
    const current = dbToExternal(row.lead, row.details, row.meta);
    const changedFields: Record<string, { from: any; to: any }> = {};
    for (const [field, newVal] of Object.entries(incoming)) {
      const oldVal = (current as Record<string, any>)[field] ?? null;
      const oldStr = oldVal === null || oldVal === undefined ? "" : String(oldVal);
      const newStr = newVal === null || newVal === undefined ? "" : String(newVal);
      if (oldStr !== newStr) {
        changedFields[field] = { from: oldVal ?? null, to: newVal };
      }
    }

    // 4. Nothing changed — return as-is
    if (Object.keys(changedFields).length === 0) {
      return res.json(current);
    }

    // 5. Build DB update maps
    const leadUpdate: Record<string, any> = {};
    const detailsUpdate: Record<string, any> = {};

    if ("firstName" in incoming || "lastName" in incoming) {
      const fn = ("firstName" in incoming ? incoming.firstName : current.firstName) ?? "";
      const ln = ("lastName" in incoming ? incoming.lastName : current.lastName) ?? "";
      leadUpdate.homeownerName = [fn, ln].filter(Boolean).join(" ");
    }
    if ("phone" in incoming) leadUpdate.phone = incoming.phone;
    if ("email" in incoming) leadUpdate.email = incoming.email;
    if ("address" in incoming) leadUpdate.addressLine1 = incoming.address;
    if ("city" in incoming) leadUpdate.city = incoming.city;
    if ("state" in incoming) leadUpdate.state = incoming.state;
    if ("zip" in incoming) leadUpdate.zip = incoming.zip;
    if ("serviceInterest" in incoming) leadUpdate.servicesInterested = incoming.serviceInterest ? [incoming.serviceInterest] : null;
    if ("status" in incoming) leadUpdate.status = incoming.status;
    if ("followUpDate" in incoming) leadUpdate.nextFollowupAt = incoming.followUpDate ? new Date(incoming.followUpDate) : null;
    if ("quoteAmount" in incoming) detailsUpdate.quotePrice = incoming.quoteAmount;
    if ("notes" in incoming) detailsUpdate.notes = incoming.notes;

    // 6. Persist lead table changes
    let updatedLead = row.lead;
    if (Object.keys(leadUpdate).length > 0) {
      const [updated] = await db.update(leadsTable)
        .set({ ...leadUpdate, updatedAt: new Date() })
        .where(and(eq(leadsTable.id, req.params.id), eq(leadsTable.businessUnit, HH_BUSINESS_UNIT)))
        .returning();
      updatedLead = updated;
    }

    // 7. Persist details changes
    let updatedDetails = row.details;
    if (Object.keys(detailsUpdate).length > 0) {
      updatedDetails = await upsertLeadDetails(req.params.id, detailsUpdate);
    }

    // 8. Append changelog entry and update meta
    const updatedBy = req.body.updatedBy ?? "system";
    const newEntry = {
      changedAt: new Date().toISOString(),
      changedBy: updatedBy,
      changedByName: req.body.updatedByName ?? updatedBy,
      fields: changedFields,
    };
    const existingLog = (row.meta?.changeLog as any[]) ?? [];
    const updatedMeta = await upsertLeadMeta(req.params.id, {
      updatedBy,
      changeLog: [...existingLog, newEntry],
    });

    // 9. Auto-convert to customer when status becomes "sold"
    const finalStatus = leadUpdate.status ?? row.lead.status;
    if (finalStatus === "sold") {
      autoConvertSoldLead(req.params.id, updatedLead, updatedDetails).catch(err =>
        console.error("[autoConvert] failed for lead", req.params.id, err)
      );
    }

    res.json(dbToExternal(updatedLead, updatedDetails, updatedMeta));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/leads/:id", async (req, res) => {
  try {
    // Verify lead exists and belongs to HH
    const [lead] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.id, req.params.id), eq(leadsTable.businessUnit, HH_BUSINESS_UNIT)));
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    // Check current meta — idempotent if already deleted
    const [existing] = await db.select().from(leadMetaTable).where(eq(leadMetaTable.leadId, req.params.id));
    if (existing?.isDeleted) {
      return res.json({ success: true, message: "Lead deleted." });
    }

    // Soft delete — upsert meta row
    await upsertLeadMeta(req.params.id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.body?.deletedBy ?? "system",
    });

    res.json({ success: true, message: "Lead deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /canvassing/leads/:id/convert — convert sold lead into customer + scheduled job
router.post("/leads/:id/convert", async (req, res) => {
  try {
    const [row] = await db
      .select({ lead: leadsTable, details: leadDetailsTable })
      .from(leadsTable)
      .leftJoin(leadDetailsTable, eq(leadDetailsTable.leadId, leadsTable.id))
      .where(and(
        eq(leadsTable.id, req.params.id),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      ));
    if (!row) return res.status(404).json({ error: "Lead not found" });

    const ext = dbToExternal(row.lead, row.details);

    // Create customer
    const [customer] = await db.insert(customersTable).values({
      firstName: ext.firstName || (row.lead.homeownerName ?? "Unknown"),
      lastName: ext.lastName || "",
      phone: row.lead.phone ?? null,
      email: row.lead.email ?? null,
      address: row.lead.addressLine1 ?? null,
      city: row.lead.city ?? null,
      state: row.lead.state ?? null,
      zip: row.lead.zip ?? null,
      notes: null,
      optOut: false,
      reviewCampaignEligible: false,
    }).returning();

    // Create job (needs_scheduling)
    const body = req.body;
    const [job] = await db.insert(jobsTable).values({
      customerId: customer.id,
      serviceType: row.details?.servicePackage ?? ext.serviceInterest ?? "house_wash",
      soldPrice: row.details?.soldPrice ?? null,
      quotedPrice: row.details?.quotePrice ?? null,
      status: body.scheduledAt ? "scheduled" : "needs_scheduling",
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      technicianAssigned: body.technicianAssigned ?? null,
      paymentStatus: "pending",
      leadId: row.lead.id,
      notes: ext.notes ?? null,
    }).returning();

    // Auto-create content record
    await db.insert(jobContentTable).values({ jobId: job.id }).onConflictDoNothing();

    // Link details.jobId back to the new job
    if (row.details) {
      await db.update(leadDetailsTable)
        .set({ jobId: job.id, updatedAt: new Date() })
        .where(eq(leadDetailsTable.leadId, row.lead.id));
    }

    // Update lead status to sold (if not already)
    await db.update(leadsTable)
      .set({ status: "sold", updatedAt: new Date() })
      .where(eq(leadsTable.id, req.params.id));

    res.status(201).json({ customer, job });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// Routes endpoints — canvassing_routes table (shared with D2D app)
// ---------------------------------------------------------------------------

// GET /canvassing/routes?startDate=&endDate=&date=
router.get("/routes", async (req, res) => {
  try {
    const { startDate, endDate, date } = req.query as Record<string, string | undefined>;
    let rows;
    if (date) {
      rows = await db.select().from(canvassingRoutesTable)
        .where(eq(canvassingRoutesTable.date, date))
        .orderBy(canvassingRoutesTable.date, canvassingRoutesTable.repName);
    } else if (startDate && endDate) {
      rows = await db.select().from(canvassingRoutesTable)
        .where(and(
          gte(canvassingRoutesTable.date, startDate),
          lte(canvassingRoutesTable.date, endDate),
        ))
        .orderBy(canvassingRoutesTable.date, canvassingRoutesTable.repName);
    } else {
      rows = await db.select().from(canvassingRoutesTable)
        .orderBy(canvassingRoutesTable.date, canvassingRoutesTable.repName);
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /canvassing/routes
router.post("/routes", async (req, res) => {
  try {
    const body = req.body;
    const [route] = await db.insert(canvassingRoutesTable).values({
      date: body.date,
      repEmail: body.repEmail,
      repName: body.repName ?? null,
      neighborhood: body.neighborhood ?? null,
      routeName: body.routeName ?? null,
      status: body.status ?? "planned",
      notes: body.notes ?? null,
    }).returning();
    res.status(201).json(route);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /canvassing/routes/:id
router.put("/routes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body;
    const [route] = await db.update(canvassingRoutesTable)
      .set({
        date: body.date,
        repEmail: body.repEmail,
        repName: body.repName ?? null,
        neighborhood: body.neighborhood ?? null,
        routeName: body.routeName ?? null,
        status: body.status ?? "planned",
        notes: body.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(canvassingRoutesTable.id, id))
      .returning();
    if (!route) return res.status(404).json({ error: "Route not found" });
    res.json(route);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /canvassing/routes/:id
router.delete("/routes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(canvassingRoutesTable).where(eq(canvassingRoutesTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
