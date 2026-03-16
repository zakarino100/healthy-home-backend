/*
 * VAPI DOCS AUDIT — 2026-03-16
 * Inbound webhook event name: assistant-request (message.type === "assistant-request")
 * Final call event name (carries transcript + summary): end-of-call-report
 * Caller phone field path: message.call.customer.number
 * Transcript field path: message.artifact.transcript
 * Summary field path: message.analysis.summary
 * Transfer/end reason field path: message.endedReason
 * Vapi call ID field path: message.call.id
 * Assistant config response format: { "assistant": { firstMessage, model, voice, tools } }
 * transferCall warm-transfer-with-summary format:
 *   type="transferCall", destinations[].transferPlan.mode="warm-transfer-with-summary"
 *   NOTE: warm transfers require Twilio telephony
 * Webhook signature: header=x-vapi-signature, method=HMAC-SHA256 of raw body
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { callLogsTable } from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { verifyVapiWebhook, buildAssistantConfig } from "../services/vapi";

const router: IRouter = Router();

// ─── POST /api/phone/webhook ──────────────────────────────────────────────────
// Single entry point for all Vapi server messages.
// Raw body is captured in app.ts (express.json verify callback) so HMAC works.
router.post("/webhook", async (req, res) => {
  if (!verifyVapiWebhook(req)) {
    return res.status(401).json({ error: "Invalid or missing webhook signature" });
  }

  const message = req.body?.message;
  const eventType: string = message?.type ?? "";

  if (eventType === "assistant-request") {
    return res.json(buildAssistantConfig());
  }

  if (eventType === "end-of-call-report") {
    await handleCallEnded(message);
    return res.json({ received: true });
  }

  return res.json({ received: true });
});

// ─── Internal: persist call log ───────────────────────────────────────────────
async function handleCallEnded(message: any) {
  try {
    const call = message?.call ?? {};
    const artifact = message?.artifact ?? {};
    const analysis = message?.analysis ?? {};

    const providerCallId: string | null = call.id ?? null;
    const callerPhone: string | null = call.customer?.number ?? null;

    const startedAt: Date | null = call.startedAt ? new Date(call.startedAt) : null;
    const endedAt: Date | null = call.endedAt ? new Date(call.endedAt) : null;
    const durationSeconds: number | null =
      startedAt && endedAt
        ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
        : null;

    const transcript: string | null = artifact.transcript ?? null;
    const summary: string | null = analysis.summary ?? null;

    const endedReason: string = message?.endedReason ?? "";
    const transferStatus = mapTransferStatus(endedReason, message);
    const answeredByOwner = transferStatus === "transferred";

    const rawPayload = message ?? null;

    const fields = {
      callerPhone,
      startedAt,
      endedAt,
      durationSeconds,
      transcript,
      summary,
      transferStatus,
      answeredByOwner,
      rawPayload,
      updatedAt: new Date(),
    };

    if (providerCallId) {
      await db
        .insert(callLogsTable)
        .values({ providerCallId, ...fields })
        .onConflictDoUpdate({
          target: callLogsTable.providerCallId,
          set: fields,
        });
    } else {
      console.warn("[phone] end-of-call-report missing call.id — inserting without idempotency key");
      await db.insert(callLogsTable).values(fields);
    }
  } catch (err) {
    console.error("[phone] Failed to write call log:", err);
  }
}

function mapTransferStatus(endedReason: string, message: any): string {
  const reason = endedReason.toLowerCase();
  if (reason.includes("transfer") || reason.includes("transferred")) return "transferred";
  if (reason.includes("voicemail")) return "voicemail";
  if (reason.includes("no-answer") || reason.includes("no_answer") || reason.includes("busy")) return "no_answer";
  if (message?.call?.status === "ended" && !reason.includes("transfer")) return "not_attempted";
  return "not_attempted";
}

// ─── GET /api/phone/calls ─────────────────────────────────────────────────────
router.get("/calls", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
    const limit = 20;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (req.query["date"]) {
      const d = String(req.query["date"]);
      conditions.push(
        sql`DATE(${callLogsTable.createdAt} AT TIME ZONE 'America/New_York') = ${d}`
      );
    }

    if (req.query["transferStatus"]) {
      conditions.push(eq(callLogsTable.transferStatus, String(req.query["transferStatus"])));
    }

    const rows = await db
      .select({
        id: callLogsTable.id,
        providerCallId: callLogsTable.providerCallId,
        callerPhone: callLogsTable.callerPhone,
        startedAt: callLogsTable.startedAt,
        endedAt: callLogsTable.endedAt,
        durationSeconds: callLogsTable.durationSeconds,
        summary: callLogsTable.summary,
        category: callLogsTable.category,
        transferStatus: callLogsTable.transferStatus,
        answeredByOwner: callLogsTable.answeredByOwner,
        createdAt: callLogsTable.createdAt,
      })
      .from(callLogsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(callLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ page, limit, results: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/phone/calls/:id ─────────────────────────────────────────────────
router.get("/calls/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"]!, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [row] = await db
      .select()
      .from(callLogsTable)
      .where(eq(callLogsTable.id, id))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Not found" });

    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
