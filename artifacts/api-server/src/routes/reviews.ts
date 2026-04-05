import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  reviewWorkflowsTable,
  reviewRequestsTable,
  jobsTable,
  customersTable,
} from "@workspace/db/schema";
import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { normalizePhone } from "../services/twilio.js";

// In-memory toggle for auto-send (persists until server restart; env var for cold start)
let autoSendEnabled: boolean = process.env.REVIEW_AUTO_SEND !== "false";

// Export so jobs.ts can read it
export function isReviewAutoSendEnabled(): boolean {
  return autoSendEnabled;
}

const router: IRouter = Router();

// GET /reviews
router.get("/", async (req, res) => {
  try {
    const { status, isIssueFlagged } = req.query as Record<string, string | undefined>;
    const conditions: ReturnType<typeof eq>[] = [];

    if (status) conditions.push(eq(reviewWorkflowsTable.status, status as typeof reviewWorkflowsTable.status._.data));
    if (isIssueFlagged !== undefined) {
      conditions.push(eq(reviewWorkflowsTable.isIssueFlagged, isIssueFlagged === "true"));
    }

    const workflows = conditions.length > 0
      ? await db.select().from(reviewWorkflowsTable).where(and(...conditions)).orderBy(reviewWorkflowsTable.createdAt)
      : await db.select().from(reviewWorkflowsTable).orderBy(reviewWorkflowsTable.createdAt);

    res.json(workflows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /reviews/:id/satisfaction - Record satisfaction score and route
router.post("/:id/satisfaction", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { score } = req.body as { score: number };

    if (!score || score < 1 || score > 5) {
      return res.status(400).json({ error: "Score must be between 1 and 5" });
    }

    const now = new Date();
    const isHappy = score >= 4;

    const [workflow] = await db.update(reviewWorkflowsTable)
      .set({
        satisfactionScore: score,
        satisfactionResponseAt: now,
        status: isHappy ? "review_link_sent" : "feedback_requested",
        reviewRequestSentAt: isHappy ? now : null,
        feedbackFormSentAt: isHappy ? null : now,
        isIssueFlagged: !isHappy,
        updatedAt: now,
      })
      .where(eq(reviewWorkflowsTable.id, id))
      .returning();

    if (!workflow) return res.status(404).json({ error: "Review workflow not found" });

    res.json(workflow);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /reviews/:id/resolve-issue
router.post("/:id/resolve-issue", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { notes } = req.body as { notes: string };

    const [workflow] = await db.update(reviewWorkflowsTable)
      .set({
        isIssueFlagged: false,
        internalIssueNotes: notes,
        status: "resolved",
        feedbackReceivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reviewWorkflowsTable.id, id))
      .returning();

    if (!workflow) return res.status(404).json({ error: "Review workflow not found" });

    res.json(workflow);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /reviews/campaign/batch - Launch review campaign for old customers
router.post("/campaign/batch", async (req, res) => {
  try {
    const { customerIds } = req.body as { customerIds: number[] };

    if (!customerIds?.length) {
      return res.status(400).json({ error: "customerIds required" });
    }

    // Check which customers already have open review workflows (not from campaign)
    const existing = await db.select({ customerId: reviewWorkflowsTable.customerId })
      .from(reviewWorkflowsTable)
      .where(and(
        inArray(reviewWorkflowsTable.customerId, customerIds),
        eq(reviewWorkflowsTable.isOldCustomerCampaign, false),
      ));

    const existingIds = new Set(existing.map(r => r.customerId));
    const eligible = customerIds.filter(id => !existingIds.has(id));

    if (eligible.length === 0) {
      return res.json({ queued: 0, skipped: customerIds.length, workflowIds: [] });
    }

    // Find a dummy job to attach (or we create campaign-only workflows without job)
    // For campaign workflows we need a jobId — find latest completed job per customer
    const workflows: typeof reviewWorkflowsTable.$inferInsert[] = [];
    for (const customerId of eligible) {
      const [latestJob] = await db.select().from(jobsTable)
        .where(and(eq(jobsTable.customerId, customerId), eq(jobsTable.status, "completed")))
        .orderBy(jobsTable.completedAt)
        .limit(1);

      if (!latestJob) continue;

      workflows.push({
        jobId: latestJob.id,
        customerId,
        status: "satisfaction_sent",
        satisfactionSentAt: new Date(),
        isOldCustomerCampaign: true,
      });
    }

    if (workflows.length === 0) {
      return res.json({ queued: 0, skipped: customerIds.length, workflowIds: [] });
    }

    const created = await db.insert(reviewWorkflowsTable)
      .values(workflows)
      .onConflictDoNothing()
      .returning({ id: reviewWorkflowsTable.id });

    res.json({
      queued: created.length,
      skipped: customerIds.length - created.length,
      workflowIds: created.map(r => r.id),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reviews/settings - Get auto-send toggle state
router.get("/settings", (_req, res) => {
  res.json({ autoSendEnabled });
});

// POST /reviews/settings - Update auto-send toggle
router.post("/settings", (req, res) => {
  const { autoSendEnabled: val } = req.body as { autoSendEnabled: boolean };
  if (typeof val !== "boolean") {
    return res.status(400).json({ error: "autoSendEnabled must be a boolean" });
  }
  autoSendEnabled = val;
  console.log(`[reviews/settings] Auto-send toggled: ${autoSendEnabled}`);
  res.json({ autoSendEnabled });
});

// POST /reviews/campaign/date-range - Queue review requests for completed jobs in a date range
router.post("/campaign/date-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.body as { startDate: string; endDate: string };
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate required (YYYY-MM-DD)" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    // Find completed jobs in range with a customer phone
    const jobs = await db
      .select({
        jobId: jobsTable.id,
        customerId: jobsTable.customerId,
        completedAt: jobsTable.completedAt,
        firstName: customersTable.firstName,
        lastName: customersTable.lastName,
        phone: customersTable.phone,
        optOut: customersTable.optOut,
      })
      .from(jobsTable)
      .leftJoin(customersTable, eq(customersTable.id, jobsTable.customerId))
      .where(
        and(
          eq(jobsTable.status, "completed"),
          gte(jobsTable.completedAt, start),
          lte(jobsTable.completedAt, end),
        )
      );

    let queued = 0;
    let skipped = 0;
    const workflowIds: number[] = [];

    for (const job of jobs) {
      if (!job.phone || job.optOut) { skipped++; continue; }
      const normalized = normalizePhone(job.phone);
      if (!normalized) { skipped++; continue; }

      // Skip if already has a review request for this job
      const [existingReq] = await db.select({ id: reviewRequestsTable.id })
        .from(reviewRequestsTable)
        .where(eq(reviewRequestsTable.jobId, job.jobId))
        .limit(1);
      if (existingReq) { skipped++; continue; }

      const name = [job.firstName, job.lastName].filter(Boolean).join(" ");

      // Schedule for next 10 AM
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + 1);
      scheduledAt.setHours(10, 0, 0, 0);

      const [req] = await db.insert(reviewRequestsTable).values({
        jobId: job.jobId,
        customerName: name,
        customerPhone: normalized,
        scheduledAt,
        status: "pending",
      }).returning({ id: reviewRequestsTable.id });

      workflowIds.push(req.id);
      queued++;
    }

    res.json({ queued, skipped, total: jobs.length, workflowIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /reviews/received - Redirect from Google review link and mark review as completed
// Usage: https://yourdomain.com/api/reviews/received?token=<reviewRequestId>
router.get("/received", async (req, res) => {
  const GOOGLE_REVIEW_URL = "https://g.page/r/CWg6db4vRcotEBM/review";
  const token = req.query?.token as string | undefined;

  if (token) {
    try {
      const id = parseInt(token, 10);
      if (!isNaN(id)) {
        // Mark review request as received
        await db.update(reviewRequestsTable)
          .set({ status: "review_received", updatedAt: new Date() })
          .where(eq(reviewRequestsTable.id, id));

        // Also update linked workflow if exists
        const [rr] = await db.select({ jobId: reviewRequestsTable.jobId })
          .from(reviewRequestsTable)
          .where(eq(reviewRequestsTable.id, id))
          .limit(1);

        if (rr?.jobId) {
          await db.update(reviewWorkflowsTable)
            .set({
              status: "review_received",
              reviewCompletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(reviewWorkflowsTable.jobId, rr.jobId));
        }
      }
    } catch (err) {
      console.error("[reviews/received] tracking error:", err);
      // Non-fatal — still redirect
    }
  }

  // Always redirect to actual Google review page
  res.redirect(302, GOOGLE_REVIEW_URL);
});

export default router;
