import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  canvassingSessionsTable,
  leadsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const router: IRouter = Router();

// GET /canvassing/sessions
router.get("/sessions", async (req, res) => {
  try {
    const { date, canvasser, neighborhood, startDate, endDate } = req.query as Record<string, string | undefined>;

    let query = db.select().from(canvassingSessionsTable);
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

// GET /canvassing/leads
router.get("/leads", async (req, res) => {
  try {
    const { status, canvasser, startDate, endDate } = req.query as Record<string, string | undefined>;
    const conditions: ReturnType<typeof eq>[] = [];

    if (status) conditions.push(eq(leadsTable.status, status as typeof leadsTable.status._.data));
    if (canvasser) conditions.push(eq(leadsTable.canvasser, canvasser));
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
      customerName: body.customerName,
      address: body.address ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      leadSource: body.leadSource ?? null,
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
        customerName: body.customerName,
        address: body.address ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        leadSource: body.leadSource ?? null,
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

export default router;
