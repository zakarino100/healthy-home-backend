/**
 * Feedback form — served at feedback.myhealthyhome.io/feedback
 *
 * GET  /feedback        → Renders the standalone HTML form
 * POST /feedback/submit → Saves to hh_feedback, notifies Scout, redirects to /feedback/thanks
 * GET  /feedback/thanks → Thank you page
 *
 * Query params for pre-fill: ?name=&phone=&rating=
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { feedbackTable } from "@workspace/db/schema";

const router: IRouter = Router();

const SCOUT_CHANNEL = () => process.env.DISCORD_LEADS_CHANNEL_ID ?? "";
const BOT_TOKEN     = () => process.env.DISCORD_BOT_TOKEN ?? "";

async function notifyScout(content: string) {
  const channelId = SCOUT_CHANNEL();
  const token     = BOT_TOKEN();
  if (!channelId || !token) return;
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  }).catch(err => console.error("[feedback] scout notify failed:", err));
}

// ─── GET /feedback ────────────────────────────────────────────────────────────

// GET /feedback/list — dashboard data endpoint
router.get("/list", async (_req, res) => {
  try {
    const rows = await db.select().from(feedbackTable).orderBy(feedbackTable.submittedAt);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", (req, res) => {
  const name   = (req.query.name   as string) ?? "";
  const phone  = (req.query.phone  as string) ?? "";
  const rating = (req.query.rating as string) ?? "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Healthy Home — Share Your Feedback</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f9fafb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 2rem;
      max-width: 460px;
      width: 100%;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
    }
    .logo {
      font-size: 1.4rem;
      font-weight: 700;
      color: #16a34a;
      margin-bottom: .25rem;
    }
    h1 { font-size: 1.2rem; color: #111; margin-bottom: .5rem; }
    p  { font-size: .9rem; color: #666; margin-bottom: 1.5rem; }
    label { display: block; font-size: .85rem; font-weight: 600; color: #374151; margin-bottom: .3rem; }
    input, textarea, select {
      width: 100%;
      padding: .6rem .8rem;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: .95rem;
      margin-bottom: 1rem;
      outline: none;
      transition: border-color .2s;
    }
    input:focus, textarea:focus { border-color: #16a34a; }
    textarea { resize: vertical; min-height: 100px; }
    .star-row { display: flex; gap: .5rem; margin-bottom: 1rem; }
    .star-row label {
      cursor: pointer;
      font-size: 1.8rem;
      color: #d1d5db;
      transition: color .15s;
      font-weight: 400;
      margin: 0;
    }
    .star-row input[type=radio] { display: none; }
    .star-row input[type=radio]:checked ~ label,
    .star-row label:hover,
    .star-row label:hover ~ label { color: #f59e0b; }
    .toggle-row {
      display: flex;
      align-items: center;
      gap: .75rem;
      margin-bottom: 1.25rem;
    }
    .toggle-row span { font-size: .9rem; color: #374151; }
    .toggle {
      position: relative;
      width: 44px;
      height: 24px;
    }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute;
      inset: 0;
      background: #d1d5db;
      border-radius: 24px;
      cursor: pointer;
      transition: background .2s;
    }
    .slider:before {
      content: "";
      position: absolute;
      height: 18px; width: 18px;
      left: 3px; bottom: 3px;
      background: #fff;
      border-radius: 50%;
      transition: transform .2s;
    }
    .toggle input:checked + .slider { background: #16a34a; }
    .toggle input:checked + .slider:before { transform: translateX(20px); }
    button {
      width: 100%;
      padding: .75rem;
      background: #16a34a;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .2s;
    }
    button:hover { background: #15803d; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🏡 Healthy Home</div>
    <h1>We'd love your feedback</h1>
    <p>We're sorry your experience wasn't perfect. Tell us what happened so we can make it right.</p>

    <form method="POST" action="/feedback/submit">
      <input type="hidden" name="phone"  value="${escapeHtml(phone)}"/>
      <input type="hidden" name="rating" value="${escapeHtml(rating)}"/>

      <label for="name">Your name</label>
      <input id="name" name="name" type="text" value="${escapeHtml(name)}" placeholder="Jane Smith" required/>

      <label>What could we have done better?</label>
      <textarea name="feedback_text" placeholder="Tell us what happened..." required></textarea>

      <label>May we contact you to make this right?</label>
      <div class="toggle-row">
        <label class="toggle">
          <input type="checkbox" name="contact_ok" value="yes"/>
          <span class="slider"></span>
        </label>
        <span>Yes, please reach out</span>
      </div>

      <button type="submit">Submit Feedback</button>
    </form>
  </div>
</body>
</html>`;

  res.set("Content-Type", "text/html").send(html);
});

// ─── GET /feedback/thanks ─────────────────────────────────────────────────────

router.get("/thanks", (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Thank You — Healthy Home</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f9fafb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 2.5rem 2rem;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
      text-align: center;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.4rem; color: #111; margin-bottom: .5rem; }
    p  { font-size: .95rem; color: #555; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🙏</div>
    <h1>Thank you for your feedback</h1>
    <p>We appreciate your honesty and we'll use it to improve. If you asked us to reach out, we'll be in touch soon.</p>
  </div>
</body>
</html>`;
  res.set("Content-Type", "text/html").send(html);
});

// ─── POST /feedback/submit ────────────────────────────────────────────────────

router.post("/submit", async (req, res) => {
  try {
    const name         = (req.body.name          as string | undefined)?.trim() ?? null;
    const phone        = (req.body.phone         as string | undefined)?.trim() ?? null;
    const ratingRaw    = req.body.rating;
    const rating       = ratingRaw ? parseInt(ratingRaw as string, 10) : null;
    const feedbackText = (req.body.feedback_text as string | undefined)?.trim() ?? null;
    const contactOk    = req.body.contact_ok === "yes";

    await db.insert(feedbackTable).values({
      customerName:  name,
      customerPhone: phone,
      rating:        isNaN(rating ?? NaN) ? null : rating,
      feedbackText,
      contactOk,
    });

    // Scout notification
    const stars = rating ? "⭐".repeat(Math.min(rating, 5)) : "?";
    const snippet = feedbackText ? feedbackText.slice(0, 100) : "—";
    await notifyScout(
      `⚠️ **Negative Feedback** — ${name ?? "Unknown"} (${stars})\n💬 "${snippet}"\n📞 ${phone ?? "—"}\n${contactOk ? "✅ Wants follow-up" : "❌ No follow-up requested"}`
    );

    res.redirect("/feedback/thanks");
  } catch (err) {
    console.error("[feedback/submit] error:", err);
    res.status(500).send("Something went wrong. Please try again.");
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default router;
