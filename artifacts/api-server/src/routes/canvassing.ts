import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  canvassingSessionsTable,
  leadsTable,
  customersTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

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
    res.json({ error: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /canvassing/leads
router.get("/leads", async (req, res) => {
  try {
    const { status, canvasser, source, startDate, endDate } = req.query as Record<string, string | undefined>;
    const conditions: ReturnType<typeof eq>[] = [];

    if (status) conditions.push(eq(leadsTable.status, status as typeof leadsTable.status._.data));
    if (canvasser) conditions.push(eq(leadsTable.canvasser, canvasser));
    if (source) conditions.push(eq(leadsTable.source, source as typeof leadsTable.source._.data));
    if (startDate) conditions.push(gte(leadsTable.followUpDate, startDate));
    if (endDate) conditions.push(lte(leadsTable.followUpDate, endDate));

    const leads = conditions.length > 0
      ? await db.select().from(leadsTable).where(and(...conditions)).orderBy(leadsTable.createdAt)
      : await db.select().from(leadsTable).orderBy(leadsTable.createdAt);

    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /canvassing/leads
router.post("/leads", async (req, res) => {
  try {
    const body = req.body;
    const [lead] = await db.insert(leadsTable).values({
      firstName: body.firstName,
      lastName: body.lastName ?? "",
      address: body.address ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      source: body.source ?? "d2d",
      canvasser: body.canvasser ?? null,
      quoteAmount: body.quoteAmount ?? null,
      serviceInterest: body.serviceInterest ?? null,
      status: body.status ?? "new",
      followUpDate: body.followUpDate ?? null,
      notes: body.notes ?? null,
      sessionId: body.sessionId ?? null,
    }).returning();
    res.status(201).json(lead);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /canvassing/leads/:id
router.get("/leads/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json(lead);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /canvassing/leads/:id
router.put("/leads/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body;
    const [lead] = await db.update(leadsTable)
      .set({
        firstName: body.firstName,
        lastName: body.lastName ?? "",
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zip: body.zip ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        source: body.source ?? "d2d",
        canvasser: body.canvasser ?? null,
        quoteAmount: body.quoteAmount ?? null,
        serviceInterest: body.serviceInterest ?? null,
        status: body.status ?? "new",
        followUpDate: body.followUpDate ?? null,
        notes: body.notes ?? null,
        sessionId: body.sessionId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(leadsTable.id, id))
      .returning();
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json(lead);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /canvassing/leads/:id
router.delete("/leads/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await db.delete(leadsTable).where(eq(leadsTable.id, id)).returning();
    if (!deleted.length) return res.status(404).json({ error: "Lead not found" });
    res.json({ error: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /canvassing/leads/:id/convert — convert sold lead to customer
router.post("/leads/:id/convert", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id));

    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (lead.convertedToCustomerId) {
      const [existing] = await db.select().from(customersTable).where(eq(customersTable.id, lead.convertedToCustomerId));
      if (existing) return res.status(400).json({ error: "Lead already converted to customer", customerId: existing.id });
    }

    // Create customer from lead
    const [customer] = await db.insert(customersTable).values({
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone ?? null,
      email: lead.email ?? null,
      address: lead.address ?? null,
      city: lead.city ?? null,
      state: lead.state ?? null,
      zip: lead.zip ?? null,
      notes: lead.notes ?? null,
      optOut: false,
      reviewCampaignEligible: false,
    }).returning();

    // Mark lead as sold + linked
    await db.update(leadsTable)
      .set({
        status: "sold",
        convertedToCustomerId: customer.id,
        updatedAt: new Date(),
      })
      .where(eq(leadsTable.id, id));

    res.status(201).json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
