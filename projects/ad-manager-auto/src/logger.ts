import pino from "pino";
import { pinoHttp } from "pino-http";
import crypto from "node:crypto";
import { env } from "./config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-webhook-secret",
      "*.access_token",
      "*.accessToken",
      "*.NOTION_TOKEN",
      "*.FB_ACCESS_TOKEN",
      "*.GOOGLE_SERVICE_ACCOUNT_JSON"
    ],
    censor: "[redacted]"
  }
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: any) =>
    (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID(),
  customProps: (req: any) => ({
    requestId: req.id
  })
});
