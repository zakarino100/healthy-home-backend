/**
 * SMS Routes
 *
 * POST /api/sms/inbound          — Twilio inbound webhook (all incoming SMS)
 * POST /api/sms/review/backfill  — One-time backfill of completed jobs (last 60 days)
 * GET  /api/sms/review/pending   — List pending review requests
 *
 * Inbound SMS routing:
 *  1. If phone has an open hh_sms_conversations row → continue that flow
 *  2. If phone matches a pending hh_review_requests row → handle review reply
 *  3. Otherwise → classify intent via OpenAI, start appropriate flow
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  reviewRequestsTable,
  smsConversationsTable,
  feedbackTable,
  customersTable,
  jobsTable,
} from "@workspace/db/schema";
import { eq, and, lte, gte, isNull, or } from "drizzle-orm";
import { sendSms, normalizePhone } from "../services/twilio.js";
import { notifyNewLead, scheduleFollowUpReminders } from "../services/scout.js";
import { leadsTable } from "@workspace/db/schema";

const router: IRouter = Router();

const GOOGLE_REVIEW_URL = "https://g.page/r/CWg6db4vRcotEBM/review";
const FEEDBACK_BASE_URL = "https://feedback.myhealthyhome.io/feedback";

// ─── Auth middleware (shared token) ──────────────────────────────────────────
function requireToken(req: any, res: any, next: any) {
  const secret = process.env.FORM_SUBMIT_SECRET;
  if (!secret) return next();
  const provided = req.headers["x-hh-token"] ?? req.query?.token;
  if (!provided || provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function twimlOk(res: any) {
  res.set("Content-Type", "text/xml");
  res.send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
}

async function classifyIntent(message: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "unknown";

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 20,
        messages: [
          {
            role: "system",
            content: `Classify the SMS intent into one of: new_customer, existing_customer, cancellation, payment_inquiry, vendor, unknown.
Reply with ONLY the intent label, nothing else.
new_customer = wants a quote or first-time inquiry
existing_customer = booked customer asking about their appointment
cancellation = wants to cancel
payment_inquiry = asking about payment, invoice, refund
vendor = sales rep or service vendor reaching out
unknown = anything else`,
          },
          { role: "user", content: message },
        ],
      }),
    });

    const data = await resp.json() as any;
    const raw = (data.choices?.[0]?.message?.content ?? "unknown").trim().toLowerCase();
    const valid = ["new_customer", "existing_customer", "cancellation", "payment_inquiry", "vendor", "unknown"];
    return valid.includes(raw) ? raw : "unknown";
  } catch (err) {
    console.error("[sms] Intent classification failed:", err);
    return "unknown";
  }
}

async function aiReply(userMessage: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "Thanks for reaching out! A team member will be with you shortly.";

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content: `You are a friendly customer service assistant for Healthy Home, an exterior home cleaning company. 
Keep replies short (1-2 sentences), warm, and professional. 
If the message is actionable or you can't handle it, end with "A team member will follow up with you shortly!"`,
          },
          { role: "user", content: userMessage },
        ],
      }),
    });
    const data = await resp.json() as any;
    return data.choices?.[0]?.message?.content?.trim() ?? "Thanks for reaching out! A team member will be with you shortly.";
  } catch {
    return "Thanks for reaching out! A team member will be with you shortly.";
  }
}

async function notifyScout(content: string) {
  const channelId = process.env.DISCORD_LEADS_CHANNEL_ID;
  const token     = process.env.DISCORD_BOT_TOKEN;
  if (!channelId || !token) return;

  const DISCORD_API = "https://discord.com/api/v10";
  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  }).catch(err => console.error("[scout-sms] notify failed:", err));
}

// ─── Conversation state machine ───────────────────────────────────────────────

async function continueConversation(
  conv: typeof smsConversationsTable.$inferSelect,
  from: string,
  body: string,
): Promise<void> {
  const ctx = (conv.context ?? {}) as Record<string, string>;

  if (conv.intent === "new_customer") {
    if (conv.state === "ask_name") {
      ctx.name = body.trim();
      await db.update(smsConversationsTable)
        .set({ state: "ask_address", context: ctx, updatedAt: new Date() })
        .where(eq(smsConversationsTable.id, conv.id));
      await sendSms(from, `Nice to meet you, ${ctx.name}! 🏡 What's the address we'd be cleaning?`);

    } else if (conv.state === "ask_address") {
      ctx.address = body.trim();
      await db.update(smsConversationsTable)
        .set({ state: "ask_last_service", context: ctx, updatedAt: new Date() })
        .where(eq(smsConversationsTable.id, conv.id));
      await sendSms(from, `Got it! When was the last time the exterior was cleaned? (Or is this the first time?)`);

    } else if (conv.state === "ask_last_service") {
      ctx.lastService = body.trim();
      await db.update(smsConversationsTable)
        .set({ state: "completed", status: "completed", context: ctx, updatedAt: new Date() })
        .where(eq(smsConversationsTable.id, conv.id));
      await sendSms(from, `Perfect — we'll get you a quote shortly! Someone from our team will follow up soon 👍`);

      // Create lead in CRM
      const nameParts = (ctx.name ?? "").split(" ");
      const firstName = nameParts[0] ?? "Unknown";
      const lastName  = nameParts.slice(1).join(" ") ?? "";
      const [lead] = await db.insert(leadsTable).values({
        homeownerName: ctx.name ?? "Unknown",
        phone: from,
        addressLine1: ctx.address ?? "",
        source: "sms_inbound",
        businessUnit: "Healthy Home",
        status: "new",
        createdBy: "sms_agent",
      }).returning();

      // Scout notification
      await notifyScout(
        `📱 **SMS Lead** — ${ctx.name ?? "Unknown"}\n📞 ${from}\n🏠 ${ctx.address ?? "—"}\n🧹 Last cleaned: ${ctx.lastService ?? "—"}\n🔗 <https://healthy-home-backend.replit.app/leads/${lead.id}>`
      );
      scheduleFollowUpReminders(
        process.env.DISCORD_LEADS_CHANNEL_ID ?? "",
        ctx.name ?? null,
        async () => {
          const rows = await db.select({ status: leadsTable.status }).from(leadsTable).where(eq(leadsTable.id, lead.id)).limit(1);
          return rows[0]?.status ?? null;
        },
      );
    }
    return;
  }

  // existing_customer / cancellation / payment_inquiry
  if (["existing_customer", "cancellation", "payment_inquiry"].includes(conv.intent ?? "")) {
    if (conv.state === "ask_name") {
      ctx.name = body.trim();
      await db.update(smsConversationsTable)
        .set({ state: "completed", status: "completed", context: ctx, updatedAt: new Date() })
        .where(eq(smsConversationsTable.id, conv.id));
      await sendSms(from, `Thanks ${ctx.name} — we'll have someone reach out to you shortly! 👍`);

      const intentLabel =
        conv.intent === "cancellation"     ? "🚫 Cancellation Request"
        : conv.intent === "payment_inquiry" ? "💰 Payment Inquiry"
        : "📋 Appointment Inquiry";

      await notifyScout(
        `📱 **${intentLabel}**\n👤 ${ctx.name}\n📞 ${from}\n💬 Original: "${ctx.originalMessage ?? "—"}"`
      );
    }
    return;
  }

  // vendor
  if (conv.intent === "vendor") {
    if (conv.state === "ask_info") {
      ctx.vendorInfo = body.trim();
      await db.update(smsConversationsTable)
        .set({ state: "completed", status: "completed", context: ctx, updatedAt: new Date() })
        .where(eq(smsConversationsTable.id, conv.id));
      await sendSms(from, `Got it — we'll pass this along to our team. Thanks!`);
      await notifyScout(
        `📱 **Vendor/Sales SMS**\n📞 ${from}\n💬 "${ctx.originalMessage ?? "—"}"\nℹ️ Follow-up: "${ctx.vendorInfo}"`
      );
    }
    return;
  }
}

// ─── POST /api/sms/inbound ────────────────────────────────────────────────────

router.post("/inbound", async (req, res) => {
  // Twilio sends form-encoded; express.urlencoded handles it
  const from: string = req.body?.From ?? "";
  const body: string = (req.body?.Body ?? "").trim();

  if (!from || !body) return twimlOk(res);

  const normalized = normalizePhone(from) ?? from;

  try {
    // 1. Check for open conversation (updated in last 24h)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [openConv] = await db.select()
      .from(smsConversationsTable)
      .where(and(
        eq(smsConversationsTable.phone, normalized),
        eq(smsConversationsTable.status, "active"),
        gte(smsConversationsTable.updatedAt, cutoff),
      ))
      .orderBy(smsConversationsTable.updatedAt)
      .limit(1);

    if (openConv) {
      await continueConversation(openConv, normalized, body);
      return twimlOk(res);
    }

    // 2. Check for pending review request
    const [reviewReq] = await db.select()
      .from(reviewRequestsTable)
      .where(and(
        eq(reviewRequestsTable.customerPhone, normalized),
        eq(reviewRequestsTable.status, "sent"),
      ))
      .limit(1);

    if (reviewReq) {
      const rating = parseInt(body.replace(/\D/g, ""), 10);
      const now = new Date();

      if (!isNaN(rating) && rating >= 1 && rating <= 5) {
        if (rating === 5) {
          await db.update(reviewRequestsTable)
            .set({ response: body, responseAt: now, status: "responded_positive", updatedAt: now })
            .where(eq(reviewRequestsTable.id, reviewReq.id));
          await sendSms(
            normalized,
            `That's amazing, thank you! 🙏 Would you mind leaving us a quick Google review? It takes 30 seconds and means everything to us: ${GOOGLE_REVIEW_URL}`,
          );
        } else {
          await db.update(reviewRequestsTable)
            .set({ response: body, responseAt: now, status: "responded_negative", updatedAt: now })
            .where(eq(reviewRequestsTable.id, reviewReq.id));
          const name = encodeURIComponent(reviewReq.customerName ?? "");
          const phone = encodeURIComponent(normalized);
          const feedbackUrl = `${FEEDBACK_BASE_URL}?name=${name}&phone=${phone}&rating=${rating}`;
          await sendSms(
            normalized,
            `We're sorry to hear that 😔 We want to make it right — please share what happened: ${feedbackUrl}`,
          );
          await notifyScout(
            `⚠️ **Negative Review Response** — ${reviewReq.customerName ?? "Unknown"} rated ${rating}⭐\n📞 ${normalized}`
          );
        }
      } else {
        // Non-numeric reply to review request — treat as unknown
        const reply = await aiReply(body);
        await sendSms(normalized, reply);
      }
      return twimlOk(res);
    }

    // 3. New inbound — classify and start flow
    const intent = await classifyIntent(body);

    if (intent === "new_customer") {
      await db.insert(smsConversationsTable).values({
        phone: normalized,
        intent,
        state: "ask_name",
        context: { originalMessage: body },
        status: "active",
      });
      await sendSms(normalized, `Hey! Thanks for reaching out to Healthy Home 🏡 I'd love to get you a quote. What's your name?`);

    } else if (["existing_customer", "cancellation", "payment_inquiry"].includes(intent)) {
      await db.insert(smsConversationsTable).values({
        phone: normalized,
        intent,
        state: "ask_name",
        context: { originalMessage: body },
        status: "active",
      });
      await sendSms(normalized, `Got it! Let me get someone from our team to help you with that. What's your name so we can pull up your account?`);

    } else if (intent === "vendor") {
      await db.insert(smsConversationsTable).values({
        phone: normalized,
        intent,
        state: "ask_info",
        context: { originalMessage: body },
        status: "active",
      });
      await sendSms(normalized, `Thanks for reaching out! What's your name and company, and what can we help you with?`);

    } else {
      // unknown — AI handles it
      const reply = await aiReply(body);
      await sendSms(normalized, reply);
      // Log to Scout if potentially actionable
      await notifyScout(
        `📱 **Unknown SMS** — ${normalized}\n💬 "${body}"\n🤖 Replied: "${reply}"`
      );
    }

    return twimlOk(res);
  } catch (err) {
    console.error("[sms/inbound] error:", err);
    return twimlOk(res); // always return 200 to Twilio
  }
});

// ─── POST /api/sms/review/backfill ───────────────────────────────────────────

router.post("/review/backfill", requireToken, async (req, res) => {
  try {
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Get all completed jobs with a customer phone in the last 60 days
    const completedJobs = await db
      .select({
        jobId: jobsTable.id,
        customerId: jobsTable.customerId,
        customerName: customersTable.firstName,
        customerLastName: customersTable.lastName,
        customerPhone: customersTable.phone,
        completedAt: jobsTable.completedAt,
      })
      .from(jobsTable)
      .leftJoin(customersTable, eq(customersTable.id, jobsTable.customerId))
      .where(and(
        eq(jobsTable.status, "completed"),
        gte(jobsTable.completedAt, since),
      ));

    let queued = 0;
    let skipped = 0;

    for (const job of completedJobs) {
      if (!job.customerPhone) { skipped++; continue; }

      const normalized = normalizePhone(job.customerPhone);
      if (!normalized) { skipped++; continue; }

      // Skip if already in review_requests
      const [existing] = await db.select({ id: reviewRequestsTable.id })
        .from(reviewRequestsTable)
        .where(eq(reviewRequestsTable.jobId, job.jobId))
        .limit(1);

      if (existing) { skipped++; continue; }

      const name = [job.customerName, job.customerLastName].filter(Boolean).join(" ");
      const message = `Hey ${job.customerName ?? "there"}! This is Zak from Healthy Home 🏡 How would you rate your recent service? Reply with a number 1-5 ⭐`;

      const sent = await sendSms(normalized, message);

      await db.insert(reviewRequestsTable).values({
        jobId: job.jobId,
        customerName: name,
        customerPhone: normalized,
        sentAt: new Date(),
        status: sent ? "sent" : "error",
      });

      if (sent) queued++;
      else skipped++;
    }

    res.json({ queued, skipped, total: completedJobs.length });
  } catch (err) {
    console.error("[sms/review/backfill] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/sms/review/pending ─────────────────────────────────────────────

router.get("/review/pending", requireToken, async (req, res) => {
  try {
    const pending = await db.select()
      .from(reviewRequestsTable)
      .where(eq(reviewRequestsTable.status, "pending"));
    res.json(pending);
  } catch (err) {
    console.error("[sms/review/pending] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
