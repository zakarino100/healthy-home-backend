import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  canvassingSessionsTable,
  leadsTable,
  leadDetailsTable,
  customersTable,
  jobsTable,
  jobContentTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const router: IRouter = Router();

const HH_BUSINESS_UNIT = "healthy_home";

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

/** DB row + joined details → external API shape */
function dbToExternal(lead: Record<string, any>, details?: Record<string, any> | null) {
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
    notes: null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
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
    const { status, canvasser, source } = req.query as Record<string, string | undefined>;
    const conditions: ReturnType<typeof eq>[] = [
      eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
    ];
    if (status) conditions.push(eq(leadsTable.status, status));
    if (canvasser) conditions.push(eq(leadsTable.assignedRepEmail, canvasser));
    if (source) conditions.push(eq(leadsTable.source, source));

    const rows = await db
      .select({
        lead: leadsTable,
        details: leadDetailsTable,
      })
      .from(leadsTable)
      .leftJoin(leadDetailsTable, eq(leadDetailsTable.leadId, leadsTable.id))
      .where(and(...conditions))
      .orderBy(leadsTable.createdAt);

    res.json(rows.map(r => dbToExternal(r.lead, r.details)));
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
      .select({ lead: leadsTable, details: leadDetailsTable })
      .from(leadsTable)
      .leftJoin(leadDetailsTable, eq(leadDetailsTable.leadId, leadsTable.id))
      .where(and(
        eq(leadsTable.id, req.params.id),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      ));
    if (!row) return res.status(404).json({ error: "Lead not found" });
    res.json(dbToExternal(row.lead, row.details));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/leads/:id", async (req, res) => {
  try {
    const leadValues = externalToLeadDb(req.body);
    const detailsData = externalToDetailsDb(req.body);

    const [lead] = await db.update(leadsTable)
      .set({ ...leadValues, updatedAt: new Date() })
      .where(and(
        eq(leadsTable.id, req.params.id),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      ))
      .returning();
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const details = await upsertLeadDetails(lead.id, detailsData);
    res.json(dbToExternal(lead, details));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/leads/:id", async (req, res) => {
  try {
    const deleted = await db.delete(leadsTable)
      .where(and(
        eq(leadsTable.id, req.params.id),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      ))
      .returning();
    if (!deleted.length) return res.status(404).json({ error: "Lead not found" });
    res.json({ message: "Deleted successfully" });
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

export default router;
