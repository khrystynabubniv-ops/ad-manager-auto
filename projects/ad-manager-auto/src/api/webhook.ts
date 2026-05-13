import { Router } from "express";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { extractPageIdFromWebhook, handleNotionPageChange } from "../services/pipeline.js";
import { hmacSha256Hex, safeTimingEqual } from "../utils/crypto.js";
import { AppError } from "../utils/errors.js";

export const webhookRouter = Router();

function verifyWebhookSignature(rawBody: Buffer, headers: Record<string, unknown>): boolean {
  if (env.WEBHOOK_SHARED_SECRET) {
    const sharedSecret = headers["x-webhook-secret"];
    if (sharedSecret === env.WEBHOOK_SHARED_SECRET) {
      return true;
    }
    if (!env.NOTION_WEBHOOK_SECRET) {
      return false;
    }
  }

  if (!env.NOTION_WEBHOOK_SECRET) {
    return true;
  }

  const signatureHeader =
    (headers["x-notion-signature"] as string | undefined) ??
    (headers["notion-signature"] as string | undefined);
  if (!signatureHeader) {
    return false;
  }

  const actual = signatureHeader.replace(/^sha256=/, "");
  const expected = hmacSha256Hex(env.NOTION_WEBHOOK_SECRET, rawBody);
  return safeTimingEqual(actual, expected);
}

webhookRouter.post("/notion", async (req, res, next) => {
  try {
    const requestId = req.id as string | undefined;
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody || !verifyWebhookSignature(rawBody, req.headers)) {
      throw new AppError("Invalid Notion webhook signature", {
        statusCode: 401,
        code: "INVALID_WEBHOOK_SIGNATURE"
      });
    }

    const payload = req.body;
    logger.info({ requestId, payloadType: payload?.type }, "Received Notion webhook");

    if (payload?.challenge) {
      return res.json({ challenge: payload.challenge });
    }
    if (payload?.verification_token) {
      return res.json({ verification_token: payload.verification_token });
    }

    const pageId = extractPageIdFromWebhook(payload);
    if (!pageId) {
      throw new AppError("Webhook payload did not include a Notion page id", {
        statusCode: 400,
        code: "MISSING_PAGE_ID"
      });
    }

    const result = await handleNotionPageChange(pageId, requestId);
    return res.json({ ok: true, result });
  } catch (error) {
    return next(error);
  }
});
