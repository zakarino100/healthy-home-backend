import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  jobsTable,
  reviewWorkflowsTable,
  jobContentTable,
  customersTable,
  leadsTable,
  leadDetailsTable,
  leadMetaTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, sql, isNull, or } from "drizzle-orm";

const HH_BUSINESS_UNIT = "Healthy Home";

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

    const baseQuery = db
      .select({
        id: jobsTable.id,
        customerId: jobsTable.customerId,
        customerFirstName: customersTable.firstName,
        customerLastName: customersTable.lastName,
        customerAddress: customersTable.address,
        customerCity: customersTable.city,
        customerPhone: customersTable.phone,
        serviceType: jobsTable.serviceType,
        status: jobsTable.status,
        scheduledAt: jobsTable.scheduledAt,
        completedAt: jobsTable.completedAt,
        technicianAssigned: jobsTable.technicianAssigned,
        soldPrice: jobsTable.soldPrice,
        quotedPrice: jobsTable.quotedPrice,
        paymentStatus: jobsTable.paymentStatus,
        paymentAmountCollected: jobsTable.paymentAmountCollected,
        notes: jobsTable.notes,
        leadId: jobsTable.leadId,
        repNotes: leadDetailsTable.notes,
        createdAt: jobsTable.createdAt,
      })
      .from(jobsTable)
      .leftJoin(customersTable, eq(customersTable.id, jobsTable.customerId))
      .leftJoin(leadDetailsTable, eq(leadDetailsTable.leadId, jobsTable.leadId));

    const jobs = conditions.length > 0
      ? await baseQuery.where(and(...conditions)).orderBy(jobsTable.scheduledAt)
      : await baseQuery.orderBy(jobsTable.scheduledAt);

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

// GET /jobs/pending-sales — MUST be defined before /:id to avoid route clash
router.get("/pending-sales", async (req, res) => {
  try {
    const rows = await db
      .select({
        leadId: leadsTable.id,
        homeownerName: leadsTable.homeownerName,
        addressLine1: leadsTable.addressLine1,
        city: leadsTable.city,
        state: leadsTable.state,
        zip: leadsTable.zip,
        phone: leadsTable.phone,
        canvasser: leadsTable.assignedRepEmail,
        servicesInterested: leadsTable.servicesInterested,
        createdAt: leadsTable.createdAt,
        soldPrice: leadDetailsTable.soldPrice,
        quotePrice: leadDetailsTable.quotePrice,
        servicePackage: leadDetailsTable.servicePackage,
        isBundle: leadDetailsTable.isBundle,
        detailsJobId: leadDetailsTable.jobId,
        repNotes: leadDetailsTable.notes,
        latestTouchNote: sql<string | null>`(
          SELECT notes FROM d2d_touches
          WHERE lead_id = ${leadsTable.id}
            AND notes IS NOT NULL AND notes <> ''
          ORDER BY created_at DESC
          LIMIT 1
        )`,
        latestTouchDate: sql<string | null>`(
          SELECT created_at::text FROM d2d_touches
          WHERE lead_id = ${leadsTable.id}
            AND notes IS NOT NULL AND notes <> ''
          ORDER BY created_at DESC
          LIMIT 1
        )`,
      })
      .from(leadsTable)
      .leftJoin(leadDetailsTable, eq(leadDetailsTable.leadId, leadsTable.id))
      .leftJoin(leadMetaTable, eq(leadMetaTable.leadId, leadsTable.id))
      .where(and(
        eq(leadsTable.status, "sold"),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
        isNull(leadDetailsTable.jobId),
        or(isNull(leadMetaTable.leadId), eq(leadMetaTable.isDeleted, false))!,
      ))
      .orderBy(leadsTable.createdAt);

    const pendingSales = rows.map(r => {
      const name = r.homeownerName ?? "";
      const spaceIdx = name.indexOf(" ");
      const servicePackage = r.servicePackage
        ?? (Array.isArray(r.servicesInterested) ? r.servicesInterested[0] : null)
        ?? null;
      return {
        leadId: r.leadId,
        firstName: spaceIdx >= 0 ? name.slice(0, spaceIdx) : name,
        lastName: spaceIdx >= 0 ? name.slice(spaceIdx + 1) : "",
        address: r.addressLine1,
        city: r.city,
        state: r.state,
        zip: r.zip,
        phone: r.phone,
        canvasser: r.canvasser,
        soldPrice: r.soldPrice,
        quotePrice: r.quotePrice,
        servicePackage,
        isBundle: r.isBundle ?? false,
        repNotes: r.repNotes ?? null,
        latestTouchNote: r.latestTouchNote ?? null,
        latestTouchDate: r.latestTouchDate ?? null,
        createdAt: r.createdAt,
      };
    });

    res.json(pendingSales);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /jobs/from-lead/:leadId — MUST be before /:id
router.post("/from-lead/:leadId", async (req, res) => {
  try {
    const leadId = req.params.leadId;
    const body = req.body;

    // leftJoin so leads without an hh_lead_details row are still schedulable
    const [row] = await db
      .select({ lead: leadsTable, details: leadDetailsTable })
      .from(leadsTable)
      .leftJoin(leadDetailsTable, eq(leadDetailsTable.leadId, leadsTable.id))
      .where(and(
        eq(leadsTable.id, leadId),
        eq(leadsTable.businessUnit, HH_BUSINESS_UNIT),
      ));

    if (!row) return res.status(404).json({ error: "Lead not found" });

    const name = row.lead.homeownerName ?? "";
    const spaceIdx = name.indexOf(" ");
    const firstName = spaceIdx >= 0 ? name.slice(0, spaceIdx) : name;
    const lastName = spaceIdx >= 0 ? name.slice(spaceIdx + 1) : "";

    // Derive service type: details row > services_interested array > fallback
    const serviceType = row.details?.servicePackage
      ?? (Array.isArray(row.lead.servicesInterested) ? row.lead.servicesInterested[0] : null)
      ?? body.serviceType
      ?? "SERVICE TBD";

    // Check if a job was already auto-created for this lead (needs_scheduling)
    const [existingJob] = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.leadId, leadId));

    if (existingJob) {
      // Reuse the existing customer + job — just apply schedule info
      const [existingCustomer] = await db
        .select()
        .from(customersTable)
        .where(eq(customersTable.id, existingJob.customerId));

      const [updatedJob] = await db.update(jobsTable)
        .set({
          status: body.scheduledAt ? "scheduled" : existingJob.status,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : existingJob.scheduledAt,
          technicianAssigned: body.technicianAssigned ?? existingJob.technicianAssigned,
          notes: body.notes ?? existingJob.notes,
          updatedAt: new Date(),
        })
        .where(eq(jobsTable.id, existingJob.id))
        .returning();

      // Link lead_details.job_id so the lead disappears from pending-sales
      if (row.details) {
        await db.update(leadDetailsTable)
          .set({ jobId: existingJob.id, updatedAt: new Date() })
          .where(eq(leadDetailsTable.leadId, leadId));
      } else {
        await db.insert(leadDetailsTable).values({
          leadId,
          jobId: existingJob.id,
          soldPrice: null,
          quotePrice: null,
          servicePackage: serviceType,
          isBundle: false,
        }).onConflictDoNothing();
      }

      return res.status(201).json({ customer: existingCustomer, job: updatedJob });
    }

    // No existing job — create customer + job from scratch
    const [customer] = await db.insert(customersTable).values({
      firstName: firstName || "Unknown",
      lastName,
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

    const [job] = await db.insert(jobsTable).values({
      customerId: customer.id,
      serviceType,
      soldPrice: row.details?.soldPrice ?? null,
      quotedPrice: row.details?.quotePrice ?? null,
      status: "scheduled",
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      technicianAssigned: body.technicianAssigned ?? null,
      paymentStatus: "pending",
      leadId,
      notes: body.notes ?? null,
    }).returning();

    await db.insert(jobContentTable).values({ jobId: job.id }).onConflictDoNothing();

    // If a details row exists, link it — otherwise create one now
    if (row.details) {
      await db.update(leadDetailsTable)
        .set({ jobId: job.id, updatedAt: new Date() })
        .where(eq(leadDetailsTable.leadId, leadId));
    } else {
      await db.insert(leadDetailsTable).values({
        leadId,
        jobId: job.id,
        soldPrice: null,
        quotePrice: null,
        servicePackage: serviceType,
        isBundle: false,
      }).onConflictDoNothing();
    }

    res.status(201).json({ customer, job });
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
