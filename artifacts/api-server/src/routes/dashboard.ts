import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  canvassingSessionsTable,
  jobsTable,
  reviewWorkflowsTable,
  customersTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql, sum, count } from "drizzle-orm";

const router: IRouter = Router();

const KPI_TARGETS = {
  goodConversations: 20,
  closes: 4,
  revenueSold: 1200,
  bundles: 1,
};

function toLocalDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

// GET /dashboard/today
router.get("/today", async (req, res) => {
  try {
    const today = toLocalDateString(new Date());
    const tomorrow = toLocalDateString(new Date(Date.now() + 86400000));

    // Canvassing totals for today
    const [canvassingTotals] = await db
      .select({
        doorsKnocked: sql<number>`coalesce(sum(${canvassingSessionsTable.doorsKnocked}), 0)`.mapWith(Number),
        goodConversations: sql<number>`coalesce(sum(${canvassingSessionsTable.goodConversations}), 0)`.mapWith(Number),
        quotesGiven: sql<number>`coalesce(sum(${canvassingSessionsTable.quotesGiven}), 0)`.mapWith(Number),
        closes: sql<number>`coalesce(sum(${canvassingSessionsTable.closes}), 0)`.mapWith(Number),
        revenueSold: sql<number>`coalesce(sum(${canvassingSessionsTable.revenueSold}::numeric), 0)`.mapWith(Number),
        bundleCount: sql<number>`coalesce(sum(${canvassingSessionsTable.bundleCount}), 0)`.mapWith(Number),
      })
      .from(canvassingSessionsTable)
      .where(eq(canvassingSessionsTable.sessionDate, today));

    const closes = canvassingTotals.closes ?? 0;
    const quotesGiven = canvassingTotals.quotesGiven ?? 0;
    const closeRate = quotesGiven > 0 ? (closes / quotesGiven) * 100 : 0;
    const revenueSold = canvassingTotals.revenueSold ?? 0;
    const averageTicket = closes > 0 ? revenueSold / closes : 0;

    // Jobs completed today
    const todayStart = new Date(today);
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const [jobTotals] = await db
      .select({
        jobsCompleted: sql<number>`coalesce(count(*), 0)`.mapWith(Number),
        cashCollected: sql<number>`coalesce(sum(${jobsTable.paymentAmountCollected}::numeric), 0)`.mapWith(Number),
      })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.status, "completed"),
        gte(jobsTable.completedAt, todayStart),
        lte(jobsTable.completedAt, todayEnd),
      ));

    // Review metrics today
    const [reviewTotals] = await db
      .select({
        reviewRequestsSent: sql<number>`coalesce(count(*), 0)`.mapWith(Number),
      })
      .from(reviewWorkflowsTable)
      .where(and(
        gte(reviewWorkflowsTable.satisfactionSentAt, todayStart),
        lte(reviewWorkflowsTable.satisfactionSentAt, todayEnd),
      ));

    const [reviewsReceived] = await db
      .select({ count: sql<number>`coalesce(count(*), 0)`.mapWith(Number) })
      .from(reviewWorkflowsTable)
      .where(and(
        eq(reviewWorkflowsTable.status, "review_completed"),
        gte(reviewWorkflowsTable.reviewCompletedAt, todayStart),
        lte(reviewWorkflowsTable.reviewCompletedAt, todayEnd),
      ));

    // Unresolved issues
    const [issueCount] = await db
      .select({ count: sql<number>`coalesce(count(*), 0)`.mapWith(Number) })
      .from(reviewWorkflowsTable)
      .where(eq(reviewWorkflowsTable.isIssueFlagged, true));

    // Tomorrow's scheduled jobs
    const tomorrowStart = new Date(tomorrow);
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 86400000);
    const [tomorrowJobs] = await db
      .select({ count: sql<number>`coalesce(count(*), 0)`.mapWith(Number) })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.status, "scheduled"),
        gte(jobsTable.scheduledAt, tomorrowStart),
        lte(jobsTable.scheduledAt, tomorrowEnd),
      ));

    res.json({
      date: today,
      doorsKnocked: canvassingTotals.doorsKnocked ?? 0,
      goodConversations: canvassingTotals.goodConversations ?? 0,
      quotesGiven: canvassingTotals.quotesGiven ?? 0,
      closes,
      closeRate: Math.round(closeRate * 10) / 10,
      revenueSold,
      averageTicket: Math.round(averageTicket * 100) / 100,
      bundleCount: canvassingTotals.bundleCount ?? 0,
      jobsCompleted: jobTotals.jobsCompleted ?? 0,
      cashCollected: jobTotals.cashCollected ?? 0,
      reviewRequestsSent: reviewTotals.reviewRequestsSent ?? 0,
      reviewsReceived: reviewsReceived.count ?? 0,
      unresolvedIssues: issueCount.count ?? 0,
      tomorrowScheduledJobs: tomorrowJobs.count ?? 0,
      kpiTargets: KPI_TARGETS,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /dashboard/weekly
router.get("/weekly", async (req, res) => {
  try {
    const { startDate, endDate } = req.query as Record<string, string | undefined>;

    // Default to current week (Mon-Sun)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 7);

    const weekStart = startDate ?? toLocalDateString(monday);
    const weekEnd = endDate ?? toLocalDateString(sunday);
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekEnd);

    // Canvassing totals for week
    const [weekCanvas] = await db
      .select({
        closes: sql<number>`coalesce(sum(${canvassingSessionsTable.closes}), 0)`.mapWith(Number),
        quotesGiven: sql<number>`coalesce(sum(${canvassingSessionsTable.quotesGiven}), 0)`.mapWith(Number),
        revenueSold: sql<number>`coalesce(sum(${canvassingSessionsTable.revenueSold}::numeric), 0)`.mapWith(Number),
        bundleCount: sql<number>`coalesce(sum(${canvassingSessionsTable.bundleCount}), 0)`.mapWith(Number),
      })
      .from(canvassingSessionsTable)
      .where(and(
        gte(canvassingSessionsTable.sessionDate, weekStart),
        lte(canvassingSessionsTable.sessionDate, weekEnd),
      ));

    const closes = weekCanvas.closes ?? 0;
    const quotesGiven = weekCanvas.quotesGiven ?? 0;
    const revenueSold = weekCanvas.revenueSold ?? 0;
    const bundleCount = weekCanvas.bundleCount ?? 0;
    const weekCloseRate = quotesGiven > 0 ? (closes / quotesGiven) * 100 : 0;
    const weekAvgTicket = closes > 0 ? revenueSold / closes : 0;
    const weekBundleRate = closes > 0 ? (bundleCount / closes) * 100 : 0;

    // Job totals for week
    const [weekJobs] = await db
      .select({
        totalCompleted: sql<number>`coalesce(count(*), 0)`.mapWith(Number),
        cashCollected: sql<number>`coalesce(sum(${jobsTable.paymentAmountCollected}::numeric), 0)`.mapWith(Number),
      })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.status, "completed"),
        gte(jobsTable.completedAt, weekStartDate),
        lte(jobsTable.completedAt, weekEndDate),
      ));

    // Canvasser leaderboard
    const canvasserStats = await db
      .select({
        canvasser: canvassingSessionsTable.canvasser,
        closes: sql<number>`coalesce(sum(${canvassingSessionsTable.closes}), 0)`.mapWith(Number),
        revenueSold: sql<number>`coalesce(sum(${canvassingSessionsTable.revenueSold}::numeric), 0)`.mapWith(Number),
        goodConversations: sql<number>`coalesce(sum(${canvassingSessionsTable.goodConversations}), 0)`.mapWith(Number),
        quotesGiven: sql<number>`coalesce(sum(${canvassingSessionsTable.quotesGiven}), 0)`.mapWith(Number),
      })
      .from(canvassingSessionsTable)
      .where(and(
        gte(canvassingSessionsTable.sessionDate, weekStart),
        lte(canvassingSessionsTable.sessionDate, weekEnd),
      ))
      .groupBy(canvassingSessionsTable.canvasser)
      .orderBy(sql`sum(${canvassingSessionsTable.closes}) DESC`);

    const canvasserLeaderboard = canvasserStats.map(c => ({
      canvasser: c.canvasser,
      closes: c.closes,
      revenueSold: c.revenueSold,
      goodConversations: c.goodConversations,
      closeRate: c.quotesGiven > 0 ? Math.round((c.closes / c.quotesGiven) * 1000) / 10 : 0,
    }));

    // Tech completion stats
    const techStats = await db
      .select({
        technician: jobsTable.technicianAssigned,
        jobsCompleted: sql<number>`coalesce(count(*), 0)`.mapWith(Number),
        cashCollected: sql<number>`coalesce(sum(${jobsTable.paymentAmountCollected}::numeric), 0)`.mapWith(Number),
      })
      .from(jobsTable)
      .where(and(
        eq(jobsTable.status, "completed"),
        gte(jobsTable.completedAt, weekStartDate),
        lte(jobsTable.completedAt, weekEndDate),
      ))
      .groupBy(jobsTable.technicianAssigned)
      .orderBy(sql`count(*) DESC`);

    const techCompletionStats = techStats
      .filter(t => t.technician)
      .map(t => ({
        technician: t.technician!,
        jobsCompleted: t.jobsCompleted,
        cashCollected: t.cashCollected,
      }));

    // Reviews received this week
    const [reviewsReceived] = await db
      .select({ count: sql<number>`coalesce(count(*), 0)`.mapWith(Number) })
      .from(reviewWorkflowsTable)
      .where(and(
        eq(reviewWorkflowsTable.status, "review_completed"),
        gte(reviewWorkflowsTable.reviewCompletedAt, weekStartDate),
        lte(reviewWorkflowsTable.reviewCompletedAt, weekEndDate),
      ));

    const [issueCount] = await db
      .select({ count: sql<number>`coalesce(count(*), 0)`.mapWith(Number) })
      .from(reviewWorkflowsTable)
      .where(eq(reviewWorkflowsTable.isIssueFlagged, true));

    res.json({
      startDate: weekStart,
      endDate: weekEnd,
      totalSold: revenueSold,
      totalCollected: weekJobs.cashCollected ?? 0,
      totalCompleted: weekJobs.totalCompleted ?? 0,
      closeRate: Math.round(weekCloseRate * 10) / 10,
      averageTicket: Math.round(weekAvgTicket * 100) / 100,
      bundleRate: Math.round(weekBundleRate * 10) / 10,
      canvasserLeaderboard,
      techCompletionStats,
      reviewGrowth: reviewsReceived.count ?? 0,
      unresolvedIssues: issueCount.count ?? 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
