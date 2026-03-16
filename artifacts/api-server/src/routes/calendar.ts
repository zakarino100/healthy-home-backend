import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { canvassingSessionsTable, jobsTable, customersTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const router: IRouter = Router();

// GET /calendar?startDate=2026-03-10&endDate=2026-03-16
// Returns jobs + canvassing sessions for the given date range
router.get("/", async (req, res) => {
  try {
    const { startDate, endDate } = req.query as Record<string, string>;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate are required" });
    }

    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);
    rangeEnd.setDate(rangeEnd.getDate() + 1); // inclusive end

    // Jobs in range — join with customers for display name
    const jobs = await db
      .select({
        id: jobsTable.id,
        customerId: jobsTable.customerId,
        customerFirstName: customersTable.firstName,
        customerLastName: customersTable.lastName,
        customerAddress: customersTable.address,
        customerCity: customersTable.city,
        serviceType: jobsTable.serviceType,
        status: jobsTable.status,
        scheduledAt: jobsTable.scheduledAt,
        technicianAssigned: jobsTable.technicianAssigned,
        soldPrice: jobsTable.soldPrice,
        paymentStatus: jobsTable.paymentStatus,
        leadId: jobsTable.leadId,
      })
      .from(jobsTable)
      .leftJoin(customersTable, eq(customersTable.id, jobsTable.customerId))
      .where(and(
        gte(jobsTable.scheduledAt, rangeStart),
        lte(jobsTable.scheduledAt, rangeEnd),
      ))
      .orderBy(jobsTable.scheduledAt);

    // Canvassing sessions in range
    const sessions = await db
      .select()
      .from(canvassingSessionsTable)
      .where(and(
        gte(canvassingSessionsTable.sessionDate, startDate),
        lte(canvassingSessionsTable.sessionDate, endDate),
      ))
      .orderBy(canvassingSessionsTable.sessionDate, canvassingSessionsTable.canvasser);

    // Shape jobs with a plain date string key
    const jobsWithDate = jobs.map(j => ({
      ...j,
      dateKey: j.scheduledAt
        ? new Date(j.scheduledAt).toISOString().split("T")[0]
        : null,
    }));

    res.json({
      startDate,
      endDate,
      jobs: jobsWithDate,
      sessions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
