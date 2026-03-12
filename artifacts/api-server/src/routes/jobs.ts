import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  jobsTable,
  reviewWorkflowsTable,
  jobContentTable,
  customersTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const router: IRouter = Router();

// GET /jobs
router.get("/", async (req, res) => {
  try {
    const { status, technician, date, startDate, endDate } = req.query as Record<string, string | undefined>;
    const conditions: ReturnType<typeof eq>[] = [];

    if (status) conditions.push(eq(jobsTable.status, status as typeof jobsTable.status._.data));
    if (technician) conditions.push(eq(jobsTable.technicianAssigned, technician));
    if (date) {
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setDate(dayEnd.getDate() + 1);
      conditions.push(gte(jobsTable.scheduledAt, dayStart));
      conditions.push(lte(jobsTable.scheduledAt, dayEnd));
    }
    if (startDate) conditions.push(gte(jobsTable.scheduledAt, new Date(startDate)));
    if (endDate) conditions.push(lte(jobsTable.scheduledAt, new Date(endDate)));

    const jobs = conditions.length > 0
      ? await db.select().from(jobsTable).where(and(...conditions)).orderBy(jobsTable.scheduledAt)
      : await db.select().from(jobsTable).orderBy(jobsTable.scheduledAt);

    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /jobs
router.post("/", async (req, res) => {
  try {
    const body = req.body;
    const [job] = await db.insert(jobsTable).values({
      customerId: body.customerId,
      serviceType: body.serviceType,
      packageType: body.packageType ?? null,
      quotedPrice: body.quotedPrice ?? null,
      soldPrice: body.soldPrice ?? null,
      status: body.status ?? "scheduled",
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      completedAt: body.completedAt ? new Date(body.completedAt) : null,
      technicianAssigned: body.technicianAssigned ?? null,
      paymentStatus: body.paymentStatus ?? "pending",
      paymentAmountCollected: body.paymentAmountCollected ?? null,
      notes: body.notes ?? null,
    }).returning();

    // Auto-create content record
    await db.insert(jobContentTable).values({ jobId: job.id }).onConflictDoNothing();

    res.status(201).json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /jobs/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /jobs/:id
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body;
    const [job] = await db.update(jobsTable)
      .set({
        customerId: body.customerId,
        serviceType: body.serviceType,
        packageType: body.packageType ?? null,
        quotedPrice: body.quotedPrice ?? null,
        soldPrice: body.soldPrice ?? null,
        status: body.status ?? "scheduled",
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        completedAt: body.completedAt ? new Date(body.completedAt) : null,
        technicianAssigned: body.technicianAssigned ?? null,
        paymentStatus: body.paymentStatus ?? "pending",
        paymentAmountCollected: body.paymentAmountCollected ?? null,
        notes: body.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(jobsTable.id, id))
      .returning();
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /jobs/:id/complete - Mark job complete and trigger review workflow
router.post("/:id/complete", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const [job] = await db.update(jobsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        satisfactionWorkflowTriggered: true,
        updatedAt: new Date(),
      })
      .where(eq(jobsTable.id, id))
      .returning();

    if (!job) return res.status(404).json({ error: "Job not found" });

    // Check if review workflow already exists
    const [existing] = await db.select().from(reviewWorkflowsTable).where(eq(reviewWorkflowsTable.jobId, id));

    let reviewWorkflow = existing;
    if (!existing) {
      const [rw] = await db.insert(reviewWorkflowsTable).values({
        jobId: job.id,
        customerId: job.customerId,
        status: "satisfaction_sent",
        satisfactionSentAt: new Date(),
      }).returning();
      reviewWorkflow = rw;
    } else {
      const [rw] = await db.update(reviewWorkflowsTable)
        .set({
          status: "satisfaction_sent",
          satisfactionSentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(reviewWorkflowsTable.id, existing.id))
        .returning();
      reviewWorkflow = rw;
    }

    res.json({ job, reviewWorkflow });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
