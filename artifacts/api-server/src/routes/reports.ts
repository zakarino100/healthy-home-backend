import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  canvassingSessionsTable,
  jobsTable,
  reviewWorkflowsTable,
  customersTable,
  dailyReportsTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const router: IRouter = Router();

const BUSINESS_NAME = "Healthy Home";

function toLocalDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

async function buildDailyPayload(date: string) {
  const dayStart = new Date(date);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const nextDay = toLocalDateString(dayEnd);
  const nextDayEnd = new Date(dayEnd.getTime() + 86400000);

  // Canvassing totals
  const [canvasTotals] = await db
    .select({
      doorsKnocked: sql<number>`coalesce(sum(${canvassingSessionsTable.doorsKnocked}), 0)`.mapWith(Number),
      goodConversations: sql<number>`coalesce(sum(${canvassingSessionsTable.goodConversations}), 0)`.mapWith(Number),
      quotesGiven: sql<number>`coalesce(sum(${canvassingSessionsTable.quotesGiven}), 0)`.mapWith(Number),
      closes: sql<number>`coalesce(sum(${canvassingSessionsTable.closes}), 0)`.mapWith(Number),
      revenueSold: sql<number>`coalesce(sum(${canvassingSessionsTable.revenueSold}::numeric), 0)`.mapWith(Number),
      bundlesSold: sql<number>`coalesce(sum(${canvassingSessionsTable.bundleCount}), 0)`.mapWith(Number),
    })
    .from(canvassingSessionsTable)
    .where(eq(canvassingSessionsTable.sessionDate, date));

  const closes = canvasTotals.closes ?? 0;
  const quotesGiven = canvasTotals.quotesGiven ?? 0;
  const revenueSold = canvasTotals.revenueSold ?? 0;
  const closeRate = quotesGiven > 0 ? Math.round((closes / quotesGiven) * 1000) / 10 : 0;
  const averageTicket = closes > 0 ? Math.round((revenueSold / closes) * 100) / 100 : 0;

  // Job totals for day
  const [jobTotals] = await db
    .select({
      jobsCompleted: sql<number>`coalesce(count(*), 0)`.mapWith(Number),
      cashCollected: sql<number>`coalesce(sum(${jobsTable.paymentAmountCollected}::numeric), 0)`.mapWith(Number),
    })
    .from(jobsTable)
    .where(and(
      eq(jobsTable.status, "completed"),
      gte(jobsTable.completedAt, dayStart),
      lte(jobsTable.completedAt, dayEnd),
    ));

  // Review totals
  const [reviewsSent] = await db
    .select({ count: sql<number>`coalesce(count(*), 0)`.mapWith(Number) })
    .from(reviewWorkflowsTable)
    .where(and(
      gte(reviewWorkflowsTable.satisfactionSentAt, dayStart),
      lte(reviewWorkflowsTable.satisfactionSentAt, dayEnd),
    ));

  const [positiveSat] = await db
    .select({ count: sql<number>`coalesce(count(*), 0)`.mapWith(Number) })
    .from(reviewWorkflowsTable)
    .where(and(
      gte(reviewWorkflowsTable.satisfactionResponseAt, dayStart),
      lte(reviewWorkflowsTable.satisfactionResponseAt, dayEnd),
      sql`${reviewWorkflowsTable.satisfactionScore} >= 4`,
    ));

  const [negativeSat] = await db
    .select({ count: sql<number>`coalesce(count(*), 0)`.mapWith(Number) })
    .from(reviewWorkflowsTable)
    .where(and(
      gte(reviewWorkflowsTable.satisfactionResponseAt, dayStart),
      lte(reviewWorkflowsTable.satisfactionResponseAt, dayEnd),
      sql`${reviewWorkflowsTable.satisfactionScore} < 4`,
    ));

  const [reviewsReceived] = await db
    .select({ count: sql<number>`coalesce(count(*), 0)`.mapWith(Number) })
    .from(reviewWorkflowsTable)
    .where(and(
      eq(reviewWorkflowsTable.status, "review_completed"),
      gte(reviewWorkflowsTable.reviewCompletedAt, dayStart),
      lte(reviewWorkflowsTable.reviewCompletedAt, dayEnd),
    ));

  // Open issues
  const [openIssues] = await db
    .select({ count: sql<number>`coalesce(count(*), 0)`.mapWith(Number) })
    .from(reviewWorkflowsTable)
    .where(eq(reviewWorkflowsTable.isIssueFlagged, true));

  // Top canvasser
  const [topCanvasser] = await db
    .select({
      canvasser: canvassingSessionsTable.canvasser,
      totalRevenue: sql<number>`sum(${canvassingSessionsTable.revenueSold}::numeric)`.mapWith(Number),
    })
    .from(canvassingSessionsTable)
    .where(eq(canvassingSessionsTable.sessionDate, date))
    .groupBy(canvassingSessionsTable.canvasser)
    .orderBy(sql`sum(${canvassingSessionsTable.revenueSold}::numeric) DESC`)
    .limit(1);

  // Top technician
  const [topTech] = await db
    .select({
      technician: jobsTable.technicianAssigned,
      jobsDone: sql<number>`count(*)`.mapWith(Number),
    })
    .from(jobsTable)
    .where(and(
      eq(jobsTable.status, "completed"),
      gte(jobsTable.completedAt, dayStart),
      lte(jobsTable.completedAt, dayEnd),
    ))
    .groupBy(jobsTable.technicianAssigned)
    .orderBy(sql`count(*) DESC`)
    .limit(1);

  // Tomorrow's scheduled jobs
  const tomorrowJobs = await db
    .select({
      id: jobsTable.id,
      customerId: jobsTable.customerId,
      serviceType: jobsTable.serviceType,
      scheduledAt: jobsTable.scheduledAt,
      technicianAssigned: jobsTable.technicianAssigned,
    })
    .from(jobsTable)
    .where(and(
      eq(jobsTable.status, "scheduled"),
      gte(jobsTable.scheduledAt, dayEnd),
      lte(jobsTable.scheduledAt, nextDayEnd),
    ))
    .orderBy(jobsTable.scheduledAt);

  // Enrich with customer names
  const nextDaySchedule = await Promise.all(
    tomorrowJobs.map(async (j) => {
      const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, j.customerId));
      return {
        jobId: j.id,
        customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
        serviceType: j.serviceType,
        scheduledAt: j.scheduledAt?.toISOString() ?? "",
        technician: j.technicianAssigned ?? null,
      };
    })
  );

  // Build anomaly notes
  const anomalies: string[] = [];
  if (closes < 2) anomalies.push(`Low close count: only ${closes} close(s) today.`);
  if (revenueSold < 600) anomalies.push(`Revenue below 50% of target: $${revenueSold}.`);
  if ((openIssues.count ?? 0) > 0) anomalies.push(`${openIssues.count} unresolved customer issue(s) need attention.`);
  if ((canvasTotals.goodConversations ?? 0) < 10) anomalies.push(`Low conversation count: ${canvasTotals.goodConversations ?? 0} good conversations.`);

  const payload = {
    businessName: BUSINESS_NAME,
    reportDate: date,
    salesMetrics: {
      doorsKnocked: canvasTotals.doorsKnocked ?? 0,
      goodConversations: canvasTotals.goodConversations ?? 0,
      quotesGiven,
      closes,
      closeRate,
      revenueSold,
      averageTicket,
      bundlesSold: canvasTotals.bundlesSold ?? 0,
    },
    fulfillmentMetrics: {
      jobsCompleted: jobTotals.jobsCompleted ?? 0,
      cashCollected: jobTotals.cashCollected ?? 0,
      tomorrowScheduled: nextDaySchedule.length,
    },
    reviewMetrics: {
      reviewRequestsSent: reviewsSent.count ?? 0,
      positiveSatisfaction: positiveSat.count ?? 0,
      negativeSatisfaction: negativeSat.count ?? 0,
      reviewsReceived: reviewsReceived.count ?? 0,
    },
    teamMetrics: {
      topCanvasser: topCanvasser?.canvasser ?? null,
      topTechnician: topTech?.technician ?? null,
    },
    openIssues: openIssues.count ?? 0,
    nextDaySchedule,
    notes: anomalies.length > 0 ? anomalies.join(" ") : null,
  };

  return {
    payload,
    closes,
    quotesGiven,
    closeRate,
    revenueSold,
    averageTicket,
    topCanvasser: topCanvasser?.canvasser ?? null,
    topTech: topTech?.technician ?? null,
    openIssues: openIssues.count ?? 0,
    bundlesSold: canvasTotals.bundlesSold ?? 0,
    jobsCompleted: jobTotals.jobsCompleted ?? 0,
    cashCollected: jobTotals.cashCollected ?? 0,
    reviewRequestsSent: reviewsSent.count ?? 0,
    positiveSatisfaction: positiveSat.count ?? 0,
    negativeSatisfaction: negativeSat.count ?? 0,
    reviewsReceived: reviewsReceived.count ?? 0,
    doorsKnocked: canvasTotals.doorsKnocked ?? 0,
    goodConversations: canvasTotals.goodConversations ?? 0,
    anomalies: anomalies.join(" ") || null,
  };
}

// GET /reports/daily
router.get("/daily", async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query as Record<string, string | undefined>;
    let query = db.select().from(dailyReportsTable);
    const conditions: ReturnType<typeof eq>[] = [];
    if (startDate) conditions.push(gte(dailyReportsTable.reportDate, startDate));
    if (endDate) conditions.push(lte(dailyReportsTable.reportDate, endDate));

    const reports = conditions.length > 0
      ? await db.select().from(dailyReportsTable)
          .where(and(...conditions))
          .orderBy(sql`${dailyReportsTable.reportDate} DESC`)
          .limit(limit ? parseInt(limit) : 90)
      : await db.select().from(dailyReportsTable)
          .orderBy(sql`${dailyReportsTable.reportDate} DESC`)
          .limit(limit ? parseInt(limit) : 90);

    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /reports/daily/generate
router.post("/daily/generate", async (req, res) => {
  try {
    const { date, webhookUrl } = req.body as { date: string; webhookUrl?: string };
    if (!date) return res.status(400).json({ error: "date is required" });

    const data = await buildDailyPayload(date);

    // Upsert daily report
    const reportValues = {
      reportDate: date,
      doorsKnocked: data.doorsKnocked,
      goodConversations: data.goodConversations,
      quotesGiven: data.quotesGiven,
      closes: data.closes,
      closeRate: data.closeRate.toString(),
      revenueSold: data.revenueSold.toString(),
      averageTicket: data.averageTicket.toString(),
      bundlesSold: data.bundlesSold,
      jobsCompleted: data.jobsCompleted,
      cashCollected: data.cashCollected.toString(),
      reviewRequestsSent: data.reviewRequestsSent,
      positiveSatisfactionResponses: data.positiveSatisfaction,
      negativeSatisfactionResponses: data.negativeSatisfaction,
      reviewsReceived: data.reviewsReceived,
      topCanvasser: data.topCanvasser,
      topTechnician: data.topTech,
      openIssuesCount: data.openIssues,
      anomaliesNotes: data.anomalies,
      fullPayload: data.payload,
    };

    await db.insert(dailyReportsTable)
      .values(reportValues)
      .onConflictDoUpdate({
        target: dailyReportsTable.reportDate,
        set: reportValues,
      });

    // If webhookUrl provided, post to it (fire and forget)
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.payload),
      }).then(async () => {
        await db.update(dailyReportsTable)
          .set({ webhookSent: true, webhookSentAt: new Date() })
          .where(eq(dailyReportsTable.reportDate, date));
      }).catch(err => {
        console.error("Webhook delivery failed:", err);
      });
    }

    res.json(data.payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/daily/:date/export
router.get("/daily/:date/export", async (req, res) => {
  try {
    const { date } = req.params;

    // Try to get from DB first
    const [stored] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.reportDate, date));
    if (stored?.fullPayload) {
      return res.json(stored.fullPayload);
    }

    // Otherwise build fresh
    const data = await buildDailyPayload(date);
    res.json(data.payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
