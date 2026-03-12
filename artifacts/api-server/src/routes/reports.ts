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

const KPI_GOALS = {
  good_conversations: 20,
  closes: 4,
  revenue_sold: 1200,
  bundles: 1,
};

function toLocalDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export async function buildRobinPayload(date: string) {
  const dayStart = new Date(date);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
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
      canvasserCount: sql<number>`coalesce(count(distinct ${canvassingSessionsTable.canvasser}), 0)`.mapWith(Number),
    })
    .from(canvassingSessionsTable)
    .where(eq(canvassingSessionsTable.sessionDate, date));

  const closes = canvasTotals.closes ?? 0;
  const quotesGiven = canvasTotals.quotesGiven ?? 0;
  const revenueSold = canvasTotals.revenueSold ?? 0;
  const goodConversations = canvasTotals.goodConversations ?? 0;
  const bundlesSold = canvasTotals.bundlesSold ?? 0;
  const closeRatePct = quotesGiven > 0 ? Math.round((closes / quotesGiven) * 1000) / 10 : 0;
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

  // Open issues with details
  const openIssueRecords = await db
    .select({
      id: reviewWorkflowsTable.id,
      customerId: reviewWorkflowsTable.customerId,
      jobId: reviewWorkflowsTable.jobId,
      internalIssueNotes: reviewWorkflowsTable.internalIssueNotes,
    })
    .from(reviewWorkflowsTable)
    .where(eq(reviewWorkflowsTable.isIssueFlagged, true));

  // Top canvasser
  const [topCanvasser] = await db
    .select({
      canvasser: canvassingSessionsTable.canvasser,
    })
    .from(canvassingSessionsTable)
    .where(eq(canvassingSessionsTable.sessionDate, date))
    .groupBy(canvassingSessionsTable.canvasser)
    .orderBy(sql`sum(${canvassingSessionsTable.revenueSold}::numeric) DESC`)
    .limit(1);

  // Top technician
  const [topTech] = await db
    .select({ technician: jobsTable.technicianAssigned })
    .from(jobsTable)
    .where(and(
      eq(jobsTable.status, "completed"),
      gte(jobsTable.completedAt, dayStart),
      lte(jobsTable.completedAt, dayEnd),
    ))
    .groupBy(jobsTable.technicianAssigned)
    .orderBy(sql`count(*) DESC`)
    .limit(1);

  // Tomorrow's schedule
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

  const nextDaySchedule = await Promise.all(
    tomorrowJobs.map(async (j) => {
      const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, j.customerId));
      return {
        job_id: j.id,
        customer_name: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
        service_type: j.serviceType,
        scheduled_at: j.scheduledAt?.toISOString() ?? "",
        technician: j.technicianAssigned ?? null,
      };
    })
  );

  // Build anomaly notes
  const anomalies: string[] = [];
  if (closes === 0) anomalies.push("No closes recorded today.");
  else if (closes < 2) anomalies.push(`Low close count: only ${closes} close(s) today.`);
  if (revenueSold === 0) anomalies.push("No revenue sold today.");
  else if (revenueSold < 600) anomalies.push(`Revenue below 50% of target: $${revenueSold}.`);
  if (goodConversations < 10) anomalies.push(`Low conversation count: ${goodConversations} good conversations.`);
  if (openIssueRecords.length > 0) anomalies.push(`${openIssueRecords.length} unresolved customer issue(s) need attention.`);
  if (bundlesSold === 0) anomalies.push("No bundles sold today.");

  // Canonical Robin payload (snake_case)
  const payload = {
    business_name: BUSINESS_NAME,
    report_date: date,
    sales_metrics: {
      doors_knocked: canvasTotals.doorsKnocked ?? 0,
      good_conversations: goodConversations,
      quotes_given: quotesGiven,
      closes,
      close_rate_pct: closeRatePct,
      revenue_sold: revenueSold,
      average_ticket: averageTicket,
      bundles_sold: bundlesSold,
    },
    fulfillment_metrics: {
      jobs_completed: jobTotals.jobsCompleted ?? 0,
      cash_collected: jobTotals.cashCollected ?? 0,
      jobs_scheduled_tomorrow: nextDaySchedule.length,
    },
    review_metrics: {
      satisfaction_requests_sent: reviewsSent.count ?? 0,
      positive_responses: positiveSat.count ?? 0,
      negative_responses: negativeSat.count ?? 0,
      reviews_received: reviewsReceived.count ?? 0,
    },
    team_metrics: {
      top_canvasser: topCanvasser?.canvasser ?? null,
      top_technician: topTech?.technician ?? null,
      canvasser_count_active_today: canvasTotals.canvasserCount ?? 0,
    },
    open_issues: {
      count: openIssueRecords.length,
      details: openIssueRecords.map(r => ({
        workflowId: r.id,
        customerId: r.customerId,
        jobId: r.jobId,
        notes: r.internalIssueNotes ?? null,
      })),
    },
    next_day_schedule: nextDaySchedule,
    daily_targets: {
      good_conversations: { goal: KPI_GOALS.good_conversations, actual: goodConversations, met: goodConversations >= KPI_GOALS.good_conversations },
      closes: { goal: KPI_GOALS.closes, actual: closes, met: closes >= KPI_GOALS.closes },
      revenue_sold: { goal: KPI_GOALS.revenue_sold, actual: revenueSold, met: revenueSold >= KPI_GOALS.revenue_sold },
      bundles: { goal: KPI_GOALS.bundles, actual: bundlesSold, met: bundlesSold >= KPI_GOALS.bundles },
    },
    anomaly_notes: anomalies.length > 0 ? anomalies.join(" ") : null,
  };

  return payload;
}

async function saveAndDeliver(date: string, payload: ReturnType<typeof buildRobinPayload> extends Promise<infer T> ? T : never, webhookUrl?: string) {
  const closes = payload.sales_metrics.closes;
  const quotesGiven = payload.sales_metrics.quotes_given;

  const reportValues = {
    reportDate: date,
    doorsKnocked: payload.sales_metrics.doors_knocked,
    goodConversations: payload.sales_metrics.good_conversations,
    quotesGiven,
    closes,
    closeRate: payload.sales_metrics.close_rate_pct.toString(),
    revenueSold: payload.sales_metrics.revenue_sold.toString(),
    averageTicket: payload.sales_metrics.average_ticket.toString(),
    bundlesSold: payload.sales_metrics.bundles_sold,
    jobsCompleted: payload.fulfillment_metrics.jobs_completed,
    cashCollected: payload.fulfillment_metrics.cash_collected.toString(),
    reviewRequestsSent: payload.review_metrics.satisfaction_requests_sent,
    positiveSatisfactionResponses: payload.review_metrics.positive_responses,
    negativeSatisfactionResponses: payload.review_metrics.negative_responses,
    reviewsReceived: payload.review_metrics.reviews_received,
    topCanvasser: payload.team_metrics.top_canvasser,
    topTechnician: payload.team_metrics.top_technician,
    openIssuesCount: payload.open_issues.count,
    anomaliesNotes: payload.anomaly_notes,
    fullPayload: payload as unknown as Record<string, unknown>,
  };

  await db.insert(dailyReportsTable)
    .values(reportValues)
    .onConflictDoUpdate({
      target: dailyReportsTable.reportDate,
      set: reportValues,
    });

  // Webhook delivery
  const deliveryUrl = webhookUrl || process.env.ROBIN_REPORT_WEBHOOK_URL;
  if (deliveryUrl) {
    try {
      const response = await fetch(deliveryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await db.update(dailyReportsTable)
        .set({ webhookSent: true, webhookSentAt: new Date() })
        .where(eq(dailyReportsTable.reportDate, date));
      console.log(`[Report] Webhook delivered to ${deliveryUrl} — status ${response.status}`);
    } catch (err) {
      console.error(`[Report] Webhook delivery failed:`, err);
    }
  }
}

// GET /reports/daily
router.get("/daily", async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query as Record<string, string | undefined>;
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

    const payload = await buildRobinPayload(date);
    await saveAndDeliver(date, payload, webhookUrl);

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reports/daily/:date/export
router.get("/daily/:date/export", async (req, res) => {
  try {
    const { date } = req.params;
    const format = (req.query.format as string) ?? "json";

    // Try stored payload first
    const [stored] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.reportDate, date));
    const payload = stored?.fullPayload ?? await buildRobinPayload(date);

    if (format === "csv") {
      // Flatten top-level metrics into CSV
      const flat = stored ? {
        report_date: stored.reportDate,
        doors_knocked: stored.doorsKnocked,
        good_conversations: stored.goodConversations,
        quotes_given: stored.quotesGiven,
        closes: stored.closes,
        close_rate: stored.closeRate,
        revenue_sold: stored.revenueSold,
        average_ticket: stored.averageTicket,
        bundles_sold: stored.bundlesSold,
        jobs_completed: stored.jobsCompleted,
        cash_collected: stored.cashCollected,
        review_requests_sent: stored.reviewRequestsSent,
        positive_sat: stored.positiveSatisfactionResponses,
        negative_sat: stored.negativeSatisfactionResponses,
        reviews_received: stored.reviewsReceived,
        top_canvasser: stored.topCanvasser,
        top_technician: stored.topTechnician,
        open_issues: stored.openIssuesCount,
        anomalies: stored.anomaliesNotes,
      } : { report_date: date, error: "no stored report" };

      const headers = Object.keys(flat).join(",");
      const values = Object.values(flat).map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
      const csv = `${headers}\n${values}`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="healthy-home-report-${date}.csv"`);
      return res.send(csv);
    }

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
