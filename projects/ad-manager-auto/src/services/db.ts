import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, QueryResultRow } from "pg";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { Creative } from "../types.js";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  pool ??= new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export async function runMigrations(): Promise<void> {
  if (!env.DATABASE_URL) {
    logger.warn("DATABASE_URL is missing; skipping migrations");
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(process.cwd(), "migrations");
  const fallbackMigrationsDir = path.resolve(__dirname, "../../../migrations");
  const existingMigrationsDir = await fs
    .access(migrationsDir)
    .then(() => migrationsDir)
    .catch(() => fallbackMigrationsDir);
  const files = (await fs.readdir(existingMigrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const existing = await query("SELECT version FROM schema_migrations WHERE version = $1", [version]);
    if (existing.rowCount) {
      continue;
    }

    const sql = await fs.readFile(path.join(existingMigrationsDir, file), "utf8");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [version]);
      await client.query("COMMIT");
      logger.info({ version }, "Applied database migration");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export type CreativeUpsertInput = {
  notionTaskId: string;
  notionTaskUrl?: string;
  sourceFileId?: string;
  sourceFileName?: string;
  status: string;
  assetId?: string;
  assetType?: string;
  adText?: string;
  ctaLink?: string;
  audience?: string;
  location?: string;
  campaignId?: string;
  campaignName?: string;
  adSetId?: string;
  adSetName?: string;
  projectType?: string;
  googleDriveUrl?: string;
  previewUrl?: string;
  facebookAdId?: string;
  uploadedAt?: Date;
  launchedAt?: Date;
};

export async function upsertCreative(input: CreativeUpsertInput): Promise<Creative> {
  const sourceFileId = input.sourceFileId ?? input.notionTaskId;
  const result = await query<Creative>(
    `
      INSERT INTO creatives (
        notion_task_id, notion_task_url, source_file_id, source_file_name, status, asset_id, asset_type, ad_text, cta_link,
        audience, location, campaign_id, campaign_name, adset_id, adset_name, project_type, google_drive_url,
        preview_url, facebook_ad_id, uploaded_at, launched_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (notion_task_id, source_file_id) DO UPDATE SET
        notion_task_url = COALESCE(EXCLUDED.notion_task_url, creatives.notion_task_url),
        source_file_name = COALESCE(EXCLUDED.source_file_name, creatives.source_file_name),
        status = EXCLUDED.status,
        asset_id = COALESCE(EXCLUDED.asset_id, creatives.asset_id),
        asset_type = COALESCE(EXCLUDED.asset_type, creatives.asset_type),
        ad_text = COALESCE(EXCLUDED.ad_text, creatives.ad_text),
        cta_link = COALESCE(EXCLUDED.cta_link, creatives.cta_link),
        audience = COALESCE(EXCLUDED.audience, creatives.audience),
        location = COALESCE(EXCLUDED.location, creatives.location),
        campaign_id = COALESCE(EXCLUDED.campaign_id, creatives.campaign_id),
        campaign_name = COALESCE(EXCLUDED.campaign_name, creatives.campaign_name),
        adset_id = COALESCE(EXCLUDED.adset_id, creatives.adset_id),
        adset_name = COALESCE(EXCLUDED.adset_name, creatives.adset_name),
        project_type = COALESCE(EXCLUDED.project_type, creatives.project_type),
        google_drive_url = COALESCE(EXCLUDED.google_drive_url, creatives.google_drive_url),
        preview_url = COALESCE(EXCLUDED.preview_url, creatives.preview_url),
        facebook_ad_id = COALESCE(EXCLUDED.facebook_ad_id, creatives.facebook_ad_id),
        uploaded_at = COALESCE(EXCLUDED.uploaded_at, creatives.uploaded_at),
        launched_at = COALESCE(EXCLUDED.launched_at, creatives.launched_at)
      RETURNING *
    `,
    [
      input.notionTaskId,
      input.notionTaskUrl ?? null,
      sourceFileId,
      input.sourceFileName ?? null,
      input.status,
      input.assetId ?? null,
      input.assetType ?? null,
      input.adText ?? null,
      input.ctaLink ?? null,
      input.audience ?? null,
      input.location ?? null,
      input.campaignId ?? null,
      input.campaignName ?? null,
      input.adSetId ?? null,
      input.adSetName ?? null,
      input.projectType ?? null,
      input.googleDriveUrl ?? null,
      input.previewUrl ?? null,
      input.facebookAdId ?? null,
      input.uploadedAt ?? null,
      input.launchedAt ?? null
    ]
  );
  return result.rows[0];
}

export async function cancelStaleCreativesForTask(
  notionTaskId: string,
  activeSourceFileIds: string[]
): Promise<void> {
  if (!activeSourceFileIds.length) {
    return;
  }

  await query(
    `
      UPDATE creatives
      SET status = $3
      WHERE notion_task_id = $1
        AND NOT (source_file_id = ANY($2::text[]))
        AND status <> ALL($4::text[])
    `,
    [notionTaskId, activeSourceFileIds, "canceled", ["launched", "launching"]]
  );
}

export async function updateCreativeStatus(
  id: number,
  status: string,
  fields: Partial<
    Pick<
      CreativeUpsertInput,
      | "facebookAdId"
      | "launchedAt"
      | "assetId"
      | "assetType"
      | "uploadedAt"
      | "previewUrl"
      | "campaignId"
      | "campaignName"
      | "adSetId"
      | "adSetName"
    >
  > = {}
): Promise<Creative> {
  const result = await query<Creative>(
    `
      UPDATE creatives
      SET status = $2,
        facebook_ad_id = COALESCE($3, facebook_ad_id),
        launched_at = COALESCE($4, launched_at),
        asset_id = COALESCE($5, asset_id),
        asset_type = COALESCE($6, asset_type),
        uploaded_at = COALESCE($7, uploaded_at),
        preview_url = COALESCE($8, preview_url),
        campaign_id = COALESCE($9, campaign_id),
        campaign_name = COALESCE($10, campaign_name),
        adset_id = COALESCE($11, adset_id),
        adset_name = COALESCE($12, adset_name)
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      status,
      fields.facebookAdId ?? null,
      fields.launchedAt ?? null,
      fields.assetId ?? null,
      fields.assetType ?? null,
      fields.uploadedAt ?? null,
      fields.previewUrl ?? null,
      fields.campaignId ?? null,
      fields.campaignName ?? null,
      fields.adSetId ?? null,
      fields.adSetName ?? null
    ]
  );
  return result.rows[0];
}

export async function listCreatives(statuses: string[]): Promise<Creative[]> {
  const result = await query<Creative>(
    "SELECT * FROM creatives WHERE status = ANY($1::text[]) ORDER BY updated_at DESC",
    [statuses]
  );
  return result.rows;
}

export async function getCreativeById(id: number): Promise<Creative | undefined> {
  const result = await query<Creative>("SELECT * FROM creatives WHERE id = $1", [id]);
  return result.rows[0];
}

export async function recordEvent(input: {
  requestId?: string;
  creativeId?: number;
  notionTaskId?: string;
  action: string;
  status: string;
  metadata?: Record<string, unknown>;
  error?: string;
}): Promise<void> {
  if (!env.DATABASE_URL) {
    logger.info(input, "Automation event");
    return;
  }

  await query(
    `
      INSERT INTO automation_events(request_id, creative_id, notion_task_id, action, status, metadata, error)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      input.requestId ?? null,
      input.creativeId ?? null,
      input.notionTaskId ?? null,
      input.action,
      input.status,
      JSON.stringify(input.metadata ?? {}),
      input.error ?? null
    ]
  );
}

export async function recordFacebookRequest(input: {
  requestId?: string;
  method: string;
  endpoint: string;
  statusCode?: number;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
}): Promise<void> {
  if (!env.DATABASE_URL) {
    logger.info(input, "Facebook request");
    return;
  }

  await query(
    `
      INSERT INTO facebook_request_logs(
        request_id, method, endpoint, status_code, request_body, response_body, error
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      input.requestId ?? null,
      input.method,
      input.endpoint,
      input.statusCode ?? null,
      input.requestBody ? JSON.stringify(input.requestBody) : null,
      input.responseBody ? JSON.stringify(input.responseBody) : null,
      input.error ?? null
    ]
  );
}
