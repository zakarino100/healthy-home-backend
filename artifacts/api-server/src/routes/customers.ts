import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { customersTable, jobsTable } from "@workspace/db/schema";
import { eq, ilike, or } from "drizzle-orm";

const router: IRouter = Router();

// GET /customers
router.get("/", async (req, res) => {
  try {
    const { search } = req.query as Record<string, string | undefined>;

    if (search) {
      const customers = await db.select().from(customersTable)
        .where(or(
          ilike(customersTable.firstName, `%${search}%`),
          ilike(customersTable.lastName, `%${search}%`),
          ilike(customersTable.phone, `%${search}%`),
          ilike(customersTable.email, `%${search}%`),
        ))
        .orderBy(customersTable.lastName);
      return res.json(customers);
    }

    const customers = await db.select().from(customersTable).orderBy(customersTable.lastName);
    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /customers
router.post("/", async (req, res) => {
  try {
    const body = req.body;
    const [customer] = await db.insert(customersTable).values({
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone ?? null,
      email: body.email ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      notes: body.notes ?? null,
      optOut: body.optOut ?? false,
      reviewCampaignEligible: body.reviewCampaignEligible ?? false,
    }).returning();
    res.status(201).json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /customers/:id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /customers/:id
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body;
    const [customer] = await db.update(customersTable)
      .set({
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone ?? null,
        email: body.email ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zip: body.zip ?? null,
        notes: body.notes ?? null,
        optOut: body.optOut ?? false,
        reviewCampaignEligible: body.reviewCampaignEligible ?? false,
        updatedAt: new Date(),
      })
      .where(eq(customersTable.id, id))
      .returning();
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /customers/:id/jobs — job history for a customer
router.get("/:id/jobs", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const jobs = await db.select().from(jobsTable).where(eq(jobsTable.customerId, id)).orderBy(jobsTable.createdAt);
    res.json(jobs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /customers/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, id));
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const linkedJobs = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.customerId, id));
    if (linkedJobs.length > 0) {
      return res.status(409).json({
        error: `Cannot delete — this customer has ${linkedJobs.length} linked job(s). Remove the jobs first.`,
        linkedJobCount: linkedJobs.length,
      });
    }

    await db.delete(customersTable).where(eq(customersTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
