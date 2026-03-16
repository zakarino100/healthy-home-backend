import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  canvassingSessionsTable,
  leadsTable,
  customersTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers — map between our external API shape and the shared leads table
// ---------------------------------------------------------------------------

const HH_BUSINESS_UNIT = "healthy_home";

/** External API → DB row (for inserts/updates) */
function externalToDb(body: Record<string, any>) {
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

/** DB row → external API shape */
function dbToExternal(lead: Record<string, any>) {
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
    notes: null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Canvassing Sessions
// ---------------------------------------------------------------------------

// GET /canvassing/sessions
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

// POST /canvassing/sessions
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

// GET /canvassing/sessions/:id
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

// PUT /canvassing/sessions/:id
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

// DELETE /canvassing/sessions/:id
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
// Leads — filtered to business_unit = 'healthy_home'
// ---------------------------------------------------------------------------

// GET /canvassing/leads
router.get("/leads", async (req, res) => {
  try {
    const { status, canvasser, source } = req.query as Record<string, string | undefined>;
    const conditions: ReturnType<typeof eq>[] = [
      eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
    ];

    if (status) conditions.push(eq(leadsTable.status, status));
    if (canvasser) conditions.push(eq(leadsTable.assignedRepEmail, canvasser));
    if (source) conditions.push(eq(leadsTable.source, source));

    const leads = await db.select().from(leadsTable)
      .where(and(...conditions))
      .orderBy(leadsTable.createdAt);

    res.json(leads.map(dbToExternal));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /canvassing/leads
router.post("/leads", async (req, res) => {
  try {
    const values = externalToDb(req.body);
    const [lead] = await db.insert(leadsTable).values(values).returning();
    res.status(201).json(dbToExternal(lead));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /canvassing/leads/:id
router.get("/leads/:id", async (req, res) => {
  try {
    const [lead] = await db.select().from(leadsTable)
      .where(and(
        eq(leadsTable.id, req.params.id),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      ));
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json(dbToExternal(lead));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /canvassing/leads/:id
router.put("/leads/:id", async (req, res) => {
  try {
    const values = externalToDb(req.body);
    const [lead] = await db.update(leadsTable)
      .set({ ...values, updatedAt: new Date() })
      .where(and(
        eq(leadsTable.id, req.params.id),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      ))
      .returning();
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json(dbToExternal(lead));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /canvassing/leads/:id
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

// POST /canvassing/leads/:id/convert — convert sold lead to customer
router.post("/leads/:id/convert", async (req, res) => {
  try {
    const [lead] = await db.select().from(leadsTable)
      .where(and(
        eq(leadsTable.id, req.params.id),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      ));
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    const ext = dbToExternal(lead);
    const [customer] = await db.insert(customersTable).values({
      firstName: ext.firstName || (lead.homeownerName ?? "Unknown"),
      lastName: ext.lastName || "",
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

    // Mark lead as sold
    await db.update(leadsTable)
      .set({ status: "sold", updatedAt: new Date() })
      .where(eq(leadsTable.id, req.params.id));

    res.status(201).json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
