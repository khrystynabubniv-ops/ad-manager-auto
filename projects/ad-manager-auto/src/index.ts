import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { adDraftsRouter, adSetDraftsRouter, campaignDraftsRouter } from "./api/campaignDrafts.js";
import { campaignsRouter } from "./api/campaigns.js";
import { creativesRouter } from "./api/creatives.js";
import { launchRouter } from "./api/launch.js";
import { manualRouter } from "./api/manual.js";
import { webhookRouter } from "./api/webhook.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { closePool, runMigrations } from "./services/db.js";
import { httpLogger, logger } from "./logger.js";

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(httpLogger);
app.use(
  express.json({
    limit: "25mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = Buffer.from(buf);
    }
  })
);

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "ad-manager-auto" });
});

app.get("/config.js", (req, res) => {
  const origin = env.PUBLIC_BASE_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
  const config = {
    API_BASE_URL: "",
    AUTH_DISABLED: String(env.AUTH_DISABLED),
    OKTA_ISSUER: env.OKTA_ISSUER ?? "",
    OKTA_CLIENT_ID: env.OKTA_CLIENT_ID ?? "",
    OKTA_REDIRECT_URI: `${origin}/login/callback`
  };

  res
    .type("application/javascript")
    .set("cache-control", "no-store")
    .send(`window.__APP_CONFIG__ = ${JSON.stringify(config)};`);
});

app.use("/webhook", webhookRouter);
app.use("/api/creatives", creativesRouter);
app.use("/api/launch", launchRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/campaign-drafts", campaignDraftsRouter);
app.use("/api/adset-drafts", adSetDraftsRouter);
app.use("/api/ad-drafts", adDraftsRouter);
app.use("/api/manual", manualRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builtUiDir = path.resolve(process.cwd(), "dist/ui");
const uiDir = fs.existsSync(builtUiDir) ? builtUiDir : path.resolve(__dirname, "../ui");
app.use(express.static(uiDir));
app.get(
  [
    "/",
    "/dashboard",
    "/in-use",
    "/drafts",
    "/archived",
    "/needs-details",
    "/upload-failed",
    "/launched",
    "/campaigns",
    "/campaigns/:id",
    "/builder",
    "/builder/:id",
    "/login/callback"
  ],
  (_req, res, next) => {
    res.sendFile(path.join(uiDir, "index.html"), (error) => {
      if (error) next(error);
    });
  }
);

app.use(errorHandler);

async function main() {
  if (env.RUN_MIGRATIONS_ON_START) {
    await runMigrations();
  }

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Promo ad manager started");
  });

  const shutdown = async () => {
    logger.info("Shutting down");
    server.close();
    await closePool();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.error({ error }, "Failed to start server");
  process.exit(1);
});
