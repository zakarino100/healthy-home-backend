/**
 * Scout — Discord Lead Notification Bot
 *
 * Fires a rich embed into the Wolf Pack Wash Discord server whenever
 * a new lead comes in (web form OR Facebook Lead Ad).
 *
 * Each lead gets its own thread inside the configured forum/text channel
 * so the team can track every touch in one place.
 *
 * Env vars required:
 *   DISCORD_BOT_TOKEN     — Scout's bot token
 *   DISCORD_LEADS_CHANNEL_ID — ID of the #leads channel (right-click → Copy Channel ID)
 *
 * Follow-up reminders fire at: 1h, 4h, 24h, 72h after lead creation.
 * Reminders stop if the lead status is updated (checked via the reminderId stored on thread).
 */

const BOT_TOKEN   = () => process.env.DISCORD_BOT_TOKEN ?? "";
const CHANNEL_ID  = () => process.env.DISCORD_LEADS_CHANNEL_ID ?? "";
const DISCORD_API = "https://discord.com/api/v10";

// Colour codes
const COLOURS = {
  web:      0x7c3aed, // purple — website form
  facebook: 0x1877f2, // Facebook blue
  default:  0x10b981, // green fallback
};

// Lead score logic
function scoreLeadquality(lead: LeadPayload): { score: number; label: string; stars: string } {
  let score = 0;
  if (lead.phone)    score += 30;
  if (lead.email)    score += 15;
  if (lead.address)  score += 25;
  if (lead.services?.length) score += 20;
  if (lead.source === "facebook" || lead.source === "ad") score += 10;

  const pct = Math.min(score, 100);
  let label: string;
  let stars: string;

  if (pct >= 80)      { label = "Hot";    stars = "🔥🔥🔥"; }
  else if (pct >= 55) { label = "Warm";   stars = "⭐⭐⭐"; }
  else if (pct >= 35) { label = "Medium"; stars = "⭐⭐"; }
  else                { label = "Cold";   stars = "⭐"; }

  return { score: pct, label, stars };
}

export interface LeadPayload {
  id: string | number;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  services?: string[] | null;
  source: string;          // "wolf_pack_wash_website" | "ad" | etc.
  notes?: string | null;
  crmUrl?: string;
}

async function discordRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const token = BOT_TOKEN();
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN not set" };

  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Discord ${res.status}: ${text}` };
  }

  const data = res.headers.get("content-type")?.includes("application/json")
    ? await res.json()
    : {};

  return { ok: true, data };
}

/**
 * Post a lead notification to Discord.
 * Returns the thread ID (or null on failure) for use in follow-up reminders.
 */
export async function notifyNewLead(lead: LeadPayload): Promise<string | null> {
  const channelId = CHANNEL_ID();
  if (!channelId) {
    console.warn("[scout] DISCORD_LEADS_CHANNEL_ID not set — skipping notification");
    return null;
  }

  const { score, label, stars } = scoreLeadquality(lead);

  const sourceLabel =
    lead.source === "wolf_pack_wash_website" ? "🌐 Website Form"
    : (lead.source === "ad" || lead.source?.includes("facebook") || lead.source?.includes("meta")) ? "📘 Facebook Ad"
    : `📋 ${lead.source}`;

  const fullAddress = [lead.address, lead.city, lead.state, lead.zip]
    .filter(Boolean)
    .join(", ") || "Not provided";

  const crmLink = lead.crmUrl
    ?? `https://healthy-home-backend.replit.app/leads/${lead.id}`;

  const colour =
    lead.source === "wolf_pack_wash_website" ? COLOURS.web
    : (lead.source === "ad" || lead.source?.includes("facebook")) ? COLOURS.facebook
    : COLOURS.default;

  const embed = {
    title: `🐺 New Lead — ${lead.name ?? "Unknown"}`,
    color: colour,
    fields: [
      { name: "📞 Phone",    value: lead.phone   ?? "—", inline: true },
      { name: "📧 Email",    value: lead.email   ?? "—", inline: true },
      { name: "🏠 Address",  value: fullAddress,          inline: false },
      {
        name: "🔧 Services",
        value: lead.services?.join(", ") || "Not specified",
        inline: false,
      },
      { name: "📣 Source",   value: sourceLabel,  inline: true },
      { name: "🎯 Lead Score", value: `${stars} ${label} (${score}/100)`, inline: true },
    ],
    footer: { text: `Lead ID: ${lead.id}` },
    timestamp: new Date().toISOString(),
  };

  const threadName = `${lead.name ?? "Lead"} — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  // Try to create a thread with the initial message.
  // Works for both Forum channels (start_thread) and regular text channels (message + create_thread).
  // We attempt as a Forum channel first (POST /channels/:id/threads).
  const forumResult = await discordRequest("POST", `/channels/${channelId}/threads`, {
    name: threadName,
    message: {
      embeds: [embed],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5, // Link button
              label: "Open in CRM",
              url: crmLink,
            },
          ],
        },
      ],
    },
  });

  if (forumResult.ok) {
    console.log(`[scout] Thread created: ${forumResult.data?.id}`);
    return forumResult.data?.id ?? null;
  }

  // Fallback: regular text channel — post message then start thread on it
  console.warn(`[scout] Forum thread failed (${forumResult.error}), trying text channel fallback`);

  const msgResult = await discordRequest("POST", `/channels/${channelId}/messages`, {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "Open in CRM",
            url: crmLink,
          },
        ],
      },
    ],
  });

  if (!msgResult.ok) {
    console.error(`[scout] Failed to post message: ${msgResult.error}`);
    return null;
  }

  const messageId = msgResult.data?.id;

  // Create a thread on the message
  const threadResult = await discordRequest(
    "POST",
    `/channels/${channelId}/messages/${messageId}/threads`,
    { name: threadName, auto_archive_duration: 10080 }, // 7 days
  );

  if (!threadResult.ok) {
    console.error(`[scout] Thread creation failed: ${threadResult.error}`);
    return null;
  }

  return threadResult.data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Follow-up reminders
// ---------------------------------------------------------------------------

const REMINDER_INTERVALS = [
  { delayMs: 1  * 60 * 60 * 1000, label: "1 hour" },
  { delayMs: 4  * 60 * 60 * 1000, label: "4 hours" },
  { delayMs: 24 * 60 * 60 * 1000, label: "24 hours" },
  { delayMs: 72 * 60 * 60 * 1000, label: "72 hours" },
];

/**
 * Schedule follow-up reminders in a lead thread.
 * Each reminder pings the thread asking for a status update.
 * In-process only (restarts clear timers) — good enough for now.
 */
export function scheduleFollowUpReminders(
  threadId: string,
  leadName: string | null,
  getLeadStatus: () => Promise<string | null>,
) {
  const name = leadName ?? "this lead";

  for (const { delayMs, label } of REMINDER_INTERVALS) {
    setTimeout(async () => {
      try {
        // Check if lead is still open
        const status = await getLeadStatus();
        const closedStatuses = ["sold", "closed", "lost", "completed", "won"];
        if (status && closedStatuses.includes(status.toLowerCase())) {
          console.log(`[scout] Skipping ${label} reminder for ${name} — status: ${status}`);
          return;
        }

        await discordRequest("POST", `/channels/${threadId}/messages`, {
          content: `⏰ **${label} check-in** — What's the status on **${name}**? Remember to update the CRM when you make contact!`,
        });
        console.log(`[scout] Sent ${label} reminder for thread ${threadId}`);
      } catch (err) {
        console.error(`[scout] Reminder error (${label}):`, err);
      }
    }, delayMs);
  }
}
