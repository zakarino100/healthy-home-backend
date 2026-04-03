import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { jobsTable, customersTable, canvassingRoutesTable } from "@workspace/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

const router: IRouter = Router();

// GET /calendar?startDate=2026-03-10&endDate=2026-03-16
router.get("/", async (req, res) => {
  try {
    const { startDate, endDate } = req.query as Record<string, string>;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate are required" });
    }

    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

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

    // Routes from shared canvassing_routes table
    const routes = await db
      .select()
      .from(canvassingRoutesTable)
      .where(and(
        gte(canvassingRoutesTable.date, startDate),
        lte(canvassingRoutesTable.date, endDate),
      ))
      .orderBy(canvassingRoutesTable.date, canvassingRoutesTable.repName);

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
      routes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
