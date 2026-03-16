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
 *   { type: "transferCall", destinations: [{ type: "number", number, transferPlan: { mode: "warm-transfer-with-summary" } }] }
 *   NOTE: warm transfers require Twilio telephony (not Vapi-native numbers)
 * Webhook signature: header=x-vapi-signature, method=HMAC-SHA256 of raw body
 */

import crypto from "crypto";
import type { Request } from "express";

export function verifyVapiWebhook(req: Request): boolean {
  const secret = process.env["VAPI_WEBHOOK_SECRET"];

  if (!secret) {
    if (process.env["NODE_ENV"] !== "production") {
      console.warn("[vapi] VAPI_WEBHOOK_SECRET not set — bypassing signature check (dev mode)");
      return true;
    }
    console.error("[vapi] VAPI_WEBHOOK_SECRET not set in production — rejecting request");
    return false;
  }

  const signature = req.headers["x-vapi-signature"] as string | undefined;
  if (!signature) {
    console.warn("[vapi] Missing x-vapi-signature header");
    return false;
  }

  const rawBody: Buffer | string = (req as any).rawBody ?? JSON.stringify(req.body);
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
  const expected = hmac.digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function buildAssistantConfig() {
  const voiceId = process.env["ELEVENLABS_VOICE_ID"];
  const ownerPhone = process.env["OWNER_PHONE"];

  if (!voiceId) {
    console.warn("[vapi] ELEVENLABS_VOICE_ID not set — voice will use provider default");
  }
  if (!ownerPhone) {
    console.error("[vapi] OWNER_PHONE not set — transferCall destination will be missing");
  }

  const assistant: Record<string, unknown> = {
    firstMessage: "Thank you for calling Healthy Home. How can I help you today?",
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a friendly phone receptionist for Healthy Home, an exterior cleaning company. " +
            "Greet the caller warmly. Ask how you can help. Listen to their reason for calling. " +
            "Do not answer detailed pricing questions. Do not make promises or commitments. " +
            "Do not schedule appointments. Keep the conversation brief. " +
            "Once you understand the reason for the call, transfer immediately using the transferCall function.",
        },
      ],
    },
    voice: {
      provider: "11labs",
      voiceId: voiceId ?? "",
    },
    tools: [
      {
        type: "transferCall",
        function: {
          name: "transferCall",
          description: "Transfer the caller to the owner of Healthy Home once you understand their reason for calling.",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        destinations: ownerPhone
          ? [
              {
                type: "number",
                number: ownerPhone,
                description: "Healthy Home owner",
                transferPlan: {
                  mode: "warm-transfer-with-summary",
                },
              },
            ]
          : [],
      },
    ],
  };

  return { assistant };
}
