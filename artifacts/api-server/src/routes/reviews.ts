import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  reviewWorkflowsTable,
  jobsTable,
  customersTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";

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
        status: "feedback_requested",
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

export default router;
