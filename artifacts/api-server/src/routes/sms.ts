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
  customersTable,
  jobsTable,
  leadsTable,
} from "@workspace/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { sendSms, normalizePhone } from "../services/twilio.js";
import { scheduleFollowUpReminders } from "../services/scout.js";

const router: IRouter = Router();

const GOOGLE_REVIEW_URL = "https://g.page/r/CWg6db4vRcotEBM/review";
const BACKEND_URL = process.env.BACKEND_PUBLIC_URL ?? "https://healthy-home-backend.replit.app";

function reviewTrackingUrl(reviewRequestId: number): string {
  return `${BACKEND_URL}/api/reviews/received?token=${reviewRequestId}`;
}
const FEEDBACK_BASE_URL = "https://feedback.myhealthyhome.io/feedback";
const QUOTE_KEYWORDS = [
  "quote",
  "estimate",
  "price",
  "pricing",
  "how much",
  "service",
  "wash",
  "cleaning",
  "driveway",
  "roof",
  "gutter",
  "gutters",
  "deck",
  "fence",
  "house wash",
  "roof wash",
  "pressure washing",
];


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

function detectKeywordIntent(message: string): string | null {
  const lower = message.toLowerCase();
  if (QUOTE_KEYWORDS.some(keyword => lower.includes(keyword))) return "new_customer";
  return null;
}

function detectService(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes("roof")) return "roof wash";
  if (lower.includes("driveway")) return "driveway cleaning";
  if (lower.includes("gutter") || lower.includes("downspout")) return "gutter cleaning";
  if (lower.includes("deck")) return "deck cleaning";
  if (lower.includes("fence")) return "fence cleaning";
  if (lower.includes("house") || lower.includes("siding") || lower.includes("soft wash") || lower.includes("pressure washing") || lower.includes("wash")) return "house wash";
  return null;
}

function looksLikeName(message: string): boolean {
  const cleaned = message.trim();
  if (!cleaned) return false;
  if (cleaned.length > 40) return false;

  const lower = cleaned.toLowerCase();
  const disqualifiers = [
    "price",
    "quote",
    "estimate",
    "how much",
    "just want",
    "cost",
    "clean",
    "cleaned",
    "service",
    "address",
    "my house",
    "my gutters",
    "my driveway",
    "roof",
    "gutter",
    "driveway",
  ];
  if (disqualifiers.some(term => lower.includes(term))) return false;

  return /^[a-zA-Z][a-zA-Z\s'\-]{0,38}$/.test(cleaned);
}

function pricingReplyForService(service: string | undefined): string {
  if (service === "gutter cleaning") {
    return "I can help with that. Gutter cleaning pricing depends on the home and how much buildup is there, so I need the property address to give you an accurate quote. What's the address?";
  }
  if (service === "driveway cleaning") {
    return "I can help with that. Driveway pricing depends on the size and condition, so I need the property address to give you an accurate quote. What's the address?";
  }
  if (service === "roof wash") {
    return "I can help with that. Roof wash pricing depends on the size, pitch, and buildup, so I need the property address to give you an accurate quote. What's the address?";
  }
  if (service === "house wash") {
    return "I can help with that. House wash pricing depends on the size and condition of the home, so I need the property address to give you an accurate quote. What's the address?";
  }
  if (service === "deck cleaning" || service === "fence cleaning") {
    return `I can help with that. ${service === "deck cleaning" ? "Deck" : "Fence"} cleaning pricing depends on the size and condition, so I need the property address to give you an accurate quote. What's the address?`;
  }
  return "I can help with that. Pricing depends on the property and the service, so I need the address to give you an accurate quote. What's the address?";
}

type ClassificationResult = {
  intent: string;
  source: "keyword" | "claude" | "fallback";
  service?: string | null;
  replyStyle?: "collect_name" | "collect_address" | "answer_then_collect" | null;
};

async function callClaude(system: string, user: string, maxTokens = 220): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[sms] Claude call failed (${resp.status}): ${text}`);
      return null;
    }

    const data = await resp.json() as any;
    const text = data?.content?.find((c: any) => c.type === "text")?.text ?? null;
    return typeof text === "string" ? text.trim() : null;
  } catch (err) {
    console.error("[sms] Claude call failed:", err);
    return null;
  }
}

async function classifyIntent(message: string): Promise<ClassificationResult> {
  const keywordIntent = detectKeywordIntent(message);
  const keywordService = detectService(message);
  if (keywordIntent) {
    return {
      intent: keywordIntent,
      source: "keyword",
      service: keywordService,
      replyStyle: "collect_name",
    };
  }

  const result = await callClaude(
    `You are Mia's intent classifier for Healthy Home SMS.
Return strict JSON only.
Classify the inbound text into one of:
- new_customer
- existing_customer
- cancellation
- payment_inquiry
- vendor
- unknown

Healthy Home services:
- house wash
- roof wash
- driveway cleaning
- gutter cleaning / downspout cleaning
- deck cleaning
- fence cleaning

Extract the most likely service if present.
Also choose replyStyle from:
- collect_name
- collect_address
- answer_then_collect

Rules:
- If someone asks for pricing, estimate, quote, or how much for a service, this is usually new_customer.
- If they already included the property address, replyStyle should usually be collect_name.
- If they ask a basic service question and are likely a lead, replyStyle can be answer_then_collect.
- Never include markdown or explanation. Output valid JSON only.`,
    message,
    180,
  );

  if (!result) {
    return { intent: "unknown", source: "fallback", service: keywordService, replyStyle: null };
  }

  try {
    const parsed = JSON.parse(result);
    const validIntents = ["new_customer", "existing_customer", "cancellation", "payment_inquiry", "vendor", "unknown"];
    const validReplyStyles = ["collect_name", "collect_address", "answer_then_collect", null];
    return {
      intent: validIntents.includes(parsed.intent) ? parsed.intent : "unknown",
      source: "claude",
      service: typeof parsed.service === "string" ? parsed.service : keywordService,
      replyStyle: validReplyStyles.includes(parsed.replyStyle) ? parsed.replyStyle : null,
    };
  } catch (err) {
    console.error("[sms] Claude classification parse failed:", err, result);
    return { intent: "unknown", source: "fallback", service: keywordService, replyStyle: null };
  }
}

async function aiReply(userMessage: string): Promise<string> {
  const result = await callClaude(
    `You are Mia, the SMS assistant for Healthy Home.
Healthy Home offers house washing, roof washing, driveway cleaning, gutter and downspout cleaning, deck cleaning, and fence cleaning.
Speak like a calm, helpful front desk assistant.
Keep replies short and natural for SMS.
Use plain language.
Maximum 1 emoji per message, and avoid emojis in consecutive messages.
Most replies should have no emoji.
Do not sound robotic, cheesy, or overly excited.
If you are unsure, say a team member will follow up shortly.
Do not invent pricing, availability, or technical certainty.
If asked about services, answer at a basic but credible level:
- house washing = soft washing for siding/exterior surfaces to remove algae, mildew, dirt, and grime
- roof washing = soft washing for black streaks, algae, and buildup; never describe it as high-pressure roof blasting
- driveway cleaning = pressure washing / surface cleaning for dirt, algae, grime, and curb appeal
- gutter cleaning = clearing gutters and downspouts to improve drainage and help prevent overflow
- deck cleaning = cleaning slippery buildup, grime, and surface discoloration
- fence cleaning = cleaning wood or vinyl fencing to remove dirt, algae, and discoloration
If the customer seems like a lead, move the conversation toward collecting the info needed for a quote.
Return only the SMS reply text.`,
    userMessage,
    140,
  );

  return result ?? "Thanks for reaching out to Healthy Home. A team member will follow up with you shortly.";
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
      const lower = body.trim().toLowerCase();

      if (!looksLikeName(body)) {
        if (QUOTE_KEYWORDS.some(keyword => lower.includes(keyword))) {
          await sendSms(from, pricingReplyForService(ctx.service));
        } else {
          await sendSms(from, "I can help with that. First, what's your name?");
        }
        return;
      }

      ctx.name = body.trim();
      await db.update(smsConversationsTable)
        .set({
          state: ctx.service ? "ask_address" : "ask_service",
          context: ctx,
          updatedAt: new Date(),
        })
        .where(eq(smsConversationsTable.id, conv.id));
      if (ctx.service) {
        await sendSms(from, `Nice to meet you, ${ctx.name}. What's the address for the property?`);
      } else {
        await sendSms(from, `Nice to meet you, ${ctx.name}. Which service are you looking for? We handle house wash, roof wash, driveway cleaning, gutter cleaning, deck cleaning, and fence cleaning.`);
      }

    } else if (conv.state === "ask_service") {
      ctx.service = detectService(body) ?? body.trim();
      await db.update(smsConversationsTable)
        .set({ state: "ask_address", context: ctx, updatedAt: new Date() })
        .where(eq(smsConversationsTable.id, conv.id));
      await sendSms(from, `Got it. What's the address for the property?`);

    } else if (conv.state === "ask_address") {
      ctx.address = body.trim();
      await db.update(smsConversationsTable)
        .set({ state: "ask_last_service", context: ctx, updatedAt: new Date() })
        .where(eq(smsConversationsTable.id, conv.id));
      await sendSms(from, `Got it. When was the last time it was cleaned, or is this the first time?`);

    } else if (conv.state === "ask_last_service") {
      ctx.lastService = body.trim();
      await db.update(smsConversationsTable)
        .set({ state: "completed", status: "completed", context: ctx, updatedAt: new Date() })
        .where(eq(smsConversationsTable.id, conv.id));
      await sendSms(from, `Perfect — we'll get you a quote shortly. Someone from our team will follow up soon.`);

      const [lead] = await db.insert(leadsTable).values({
        homeownerName: ctx.name ?? "Unknown",
        phone: from,
        addressLine1: ctx.address ?? "",
        source: "sms_inbound",
        businessUnit: "Healthy Home",
        servicesInterested: ctx.service ? [ctx.service] : null,
        status: "new",
        createdBy: "mia_sms_agent",
      }).returning();

      await notifyScout(
        `📱 **SMS Lead** — ${ctx.name ?? "Unknown"}\n📞 ${from}\n🏠 ${ctx.address ?? "—"}\n🧰 Service: ${ctx.service ?? "—"}\n🧹 Last cleaned: ${ctx.lastService ?? "—"}\n🔗 <https://healthy-home-backend.replit.app/leads/${lead.id}>`
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
      await sendSms(from, `Thanks ${ctx.name}. We'll have someone reach out to you shortly.`);

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
      await sendSms(from, `Got it — we'll pass this along to our team.`);
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
      const resetIntent = detectKeywordIntent(body);
      const openCtx = (openConv.context ?? {}) as Record<string, string>;
      const currentService = openCtx.service ?? detectService(body) ?? undefined;
      const looksLikeFreshLead = resetIntent === "new_customer" && (
        openConv.intent !== "new_customer" ||
        openConv.state === "completed" ||
        body.toLowerCase().includes("new quote") ||
        body.toLowerCase().includes("start over") ||
        (!!currentService && currentService !== openCtx.service)
      );

      if (!looksLikeFreshLead) {
        await continueConversation(openConv, normalized, body);
        return twimlOk(res);
      }

      await db.update(smsConversationsTable)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(smsConversationsTable.id, openConv.id));
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
          const trackingUrl = reviewTrackingUrl(reviewReq.id);
          await sendSms(
            normalized,
            `That's amazing, thank you! 🙏 Would you mind leaving us a quick Google review? It takes 30 seconds and means everything to us: ${trackingUrl}`,
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
    const classification = await classifyIntent(body);
    const intent = classification.intent;
    const service = classification.service ?? detectService(body);
    console.log(`[sms/inbound] from=${normalized} body=${JSON.stringify(body)} intent=${intent} source=${classification.source} service=${service ?? "none"}`);

    if (intent === "new_customer") {
      await db.insert(smsConversationsTable).values({
        phone: normalized,
        intent,
        state: "ask_name",
        context: {
          originalMessage: body,
          ...(service ? { service } : {}),
        },
        status: "active",
      });

      if (classification.replyStyle === "answer_then_collect") {
        await sendSms(normalized, `Hi, this is Mia with Healthy Home. I can help with that. Pricing depends on the property and the service, so I’ll ask a couple quick questions to get you pointed the right way. What's your name?`);
      } else {
        await sendSms(normalized, `Hi, this is Mia with Healthy Home. I can help with that. What's your name?`);
      }

    } else if (["existing_customer", "cancellation", "payment_inquiry"].includes(intent)) {
      await db.insert(smsConversationsTable).values({
        phone: normalized,
        intent,
        state: "ask_name",
        context: { originalMessage: body },
        status: "active",
      });
      await sendSms(normalized, `Got it. What's your name so we can pull up your account?`);

    } else if (intent === "vendor") {
      await db.insert(smsConversationsTable).values({
        phone: normalized,
        intent,
        state: "ask_info",
        context: { originalMessage: body },
        status: "active",
      });
      await sendSms(normalized, `Thanks for reaching out. What's your name and company, and what can we help you with?`);

    } else {
      const reply = await aiReply(body);
      await sendSms(normalized, reply);
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
