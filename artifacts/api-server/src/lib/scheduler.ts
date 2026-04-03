import cron from "node-cron";
import { buildRobinPayload } from "../routes/reports.js";
import { db } from "@workspace/db";
import { dailyReportsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

async function runDailyReport() {
  const date = todayString();
  console.log(`[Scheduler] Generating daily report for ${date}...`);

  try {
    const payload = await buildRobinPayload(date);

    const reportValues = {
      reportDate: date,
      doorsKnocked: payload.sales_metrics.doors_knocked,
      goodConversations: payload.sales_metrics.good_conversations,
      quotesGiven: payload.sales_metrics.quotes_given,
      closes: payload.sales_metrics.closes,
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

    console.log(`[Scheduler] Report saved for ${date}.`);

    // Webhook delivery
    const deliveryMode = process.env.REPORT_DELIVERY_MODE ?? "database";
    const webhookUrl = process.env.ROBIN_REPORT_WEBHOOK_URL;

    if ((deliveryMode === "webhook" || deliveryMode === "both") && webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await db.update(dailyReportsTable)
          .set({ webhookSent: true, webhookSentAt: new Date() })
          .where(eq(dailyReportsTable.reportDate, date));
        console.log(`[Scheduler] Webhook delivered — status ${response.status}`);
      } catch (err) {
        console.error(`[Scheduler] Webhook delivery FAILED:`, err);
        console.log(`[Scheduler] Report is still saved in DB and accessible via API.`);
      }
    } else {
      console.log(`[Scheduler] Delivery mode: ${deliveryMode}. Report available at GET /api/reports/daily/${date}/export`);
    }
  } catch (err) {
    console.error(`[Scheduler] Report generation FAILED for ${date}:`, err);
  }
}

export function startScheduler() {
  // Parse REPORT_SEND_TIME env var (format: "HH:MM", default: "20:00")
  const sendTime = process.env.REPORT_SEND_TIME ?? "20:00";
  const [hour, minute] = sendTime.split(":").map(Number);

  if (isNaN(hour) || isNaN(minute)) {
    console.warn(`[Scheduler] Invalid REPORT_SEND_TIME "${sendTime}", using default 20:00`);
  }

  const h = isNaN(hour) ? 20 : hour;
  const m = isNaN(minute) ? 0 : minute;

  const cronExpression = `${m} ${h} * * *`;
  console.log(`[Scheduler] Daily report scheduled at ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} (cron: ${cronExpression})`);

  cron.schedule(cronExpression, runDailyReport, {
    timezone: "America/Chicago",
  });
}
