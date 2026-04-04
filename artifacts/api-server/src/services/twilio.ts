/**
 * Twilio SMS service
 * Sends outbound SMS via Twilio REST API (no SDK dependency needed — plain fetch).
 *
 * Env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER  (e.g. +19193715474)
 */

const SID  = () => process.env.TWILIO_ACCOUNT_SID  ?? "";
const AUTH = () => process.env.TWILIO_AUTH_TOKEN    ?? "";
const FROM = () => process.env.TWILIO_PHONE_NUMBER  ?? "";

export async function sendSms(to: string, body: string): Promise<boolean> {
  const sid  = SID();
  const auth = AUTH();
  const from = FROM();

  if (!sid || !auth || !from) {
    console.error("[twilio] Missing env vars (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER)");
    return false;
  }

  // Normalize phone — ensure +1 prefix
  const normalized = normalizePhone(to);
  if (!normalized) {
    console.error(`[twilio] Invalid phone number: ${to}`);
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ From: from, To: normalized, Body: body });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[twilio] SMS failed (${res.status}): ${text}`);
    return false;
  }

  const data = await res.json() as { sid: string };
  console.log(`[twilio] SMS sent to ${normalized} — SID: ${data.sid}`);
  return true;
}

export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}
