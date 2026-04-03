/**
 * Item 3 — Status mapping layer
 *
 * The D2D canvassing app uses its own status vocabulary on the shared `leads`
 * table.  The HH dashboard may need to translate those values for display,
 * filtering, and report generation.
 *
 * Design: pure functions, no DB calls — safe to call anywhere.
 */

// ---------------------------------------------------------------------------
// Lead / canvassing status
// ---------------------------------------------------------------------------

/** All status values that represent a confirmed sale */
export const LEAD_SOLD_STATUSES = new Set(["sold", "closed", "won"]);

/** All status values that indicate active pipeline interest */
export const LEAD_ACTIVE_STATUSES = new Set([
  "new",
  "contacted",
  "interested",
  "quoted",
  "follow_up_needed",
  "callback_requested",
  "warm",
]);

/** Statuses that mean the lead went cold / is not moving forward */
export const LEAD_DEAD_STATUSES = new Set([
  "not_interested",
  "do_not_knock",
  "no_answer",
  "moved",
  "duplicate",
]);

/** Map a raw DB lead status → a canonical dashboard display label */
export function normalisedLeadStatus(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  const s = raw.toLowerCase().trim();
  if (LEAD_SOLD_STATUSES.has(s)) return "Sold";
  if (LEAD_DEAD_STATUSES.has(s)) return "Dead";
  if (s === "quoted") return "Quoted";
  if (s === "follow_up_needed" || s === "callback_requested") return "Follow-up";
  if (s === "interested" || s === "warm") return "Interested";
  if (s === "contacted") return "Contacted";
  if (s === "new") return "New";
  // Fallback: title-case the raw value
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** True if the lead status represents a sale */
export function isLeadSold(status: string | null | undefined): boolean {
  return LEAD_SOLD_STATUSES.has((status ?? "").toLowerCase().trim());
}

/** True if this lead should appear in the active pipeline */
export function isLeadActive(status: string | null | undefined): boolean {
  return LEAD_ACTIVE_STATUSES.has((status ?? "").toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Job status
// ---------------------------------------------------------------------------

export type JobStatusCanonical = "scheduled" | "in_progress" | "completed" | "cancelled" | "pending";

/** Normalise any raw job status string to one of the canonical dashboard values */
export function normalisedJobStatus(raw: string | null | undefined): JobStatusCanonical {
  if (!raw) return "pending";
  const s = raw.toLowerCase().trim();
  if (s === "scheduled") return "scheduled";
  if (s === "in_progress" || s === "in progress" || s === "active") return "in_progress";
  if (s === "completed" || s === "done" || s === "finished") return "completed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  return "pending";
}

// ---------------------------------------------------------------------------
// Canvassing session — activity outcome helpers
// ---------------------------------------------------------------------------

/** Returns the effective contact rate as a percentage (0–100) */
export function contactRatePct(doorsKnocked: number, peopleReached: number): number {
  if (doorsKnocked <= 0) return 0;
  return Math.round((peopleReached / doorsKnocked) * 1000) / 10;
}

/** Returns the miss rate breakdown for a session */
export function sessionMissBreakdown(notHome: number, noAnswer: number, doorsKnocked: number) {
  const total = notHome + noAnswer;
  const pct = doorsKnocked > 0 ? Math.round((total / doorsKnocked) * 1000) / 10 : 0;
  return { notHome, noAnswer, total, pct };
}
