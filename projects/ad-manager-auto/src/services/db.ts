import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, QueryResultRow } from "pg";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import {
  AdDraft,
  AdDraftWithCreative,
  AdSetDraft,
  AdSetDraftWithAds,
  CampaignDraft,
  CampaignDraftTree,
  Creative,
  DraftStatus
} from "../types.js";

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
      | "adText"
      | "ctaLink"
      | "audience"
      | "location"
      | "projectType"
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
        adset_name = COALESCE($12, adset_name),
        ad_text = COALESCE($13, ad_text),
        cta_link = COALESCE($14, cta_link),
        audience = COALESCE($15, audience),
        location = COALESCE($16, location),
        project_type = COALESCE($17, project_type)
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
      fields.adSetName ?? null,
      fields.adText ?? null,
      fields.ctaLink ?? null,
      fields.audience ?? null,
      fields.location ?? null,
      fields.projectType ?? null
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

type JsonObject = Record<string, unknown>;

export type CreateCampaignDraftInput = {
  name: string;
  objective?: string;
  buyingType?: string;
  specialAdCategories?: string[];
  status?: DraftStatus;
  metaStatus?: string;
  metadata?: JsonObject;
};

export async function createCampaignDraft(input: CreateCampaignDraftInput): Promise<CampaignDraft> {
  const result = await query<CampaignDraft>(
    `
      INSERT INTO campaign_drafts (
        name, objective, buying_type, special_ad_categories, status, meta_status, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [
      input.name,
      input.objective ?? "OUTCOME_TRAFFIC",
      input.buyingType ?? "AUCTION",
      input.specialAdCategories ?? [],
      input.status ?? "draft",
      input.metaStatus ?? "PAUSED",
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return result.rows[0];
}

export type UpdateCampaignDraftInput = Partial<
  Pick<CreateCampaignDraftInput, "name" | "objective" | "buyingType" | "specialAdCategories" | "status" | "metaStatus" | "metadata">
> & {
  metaCampaignId?: string | null;
  lastError?: string | null;
  publishedAt?: Date | null;
};

export async function updateCampaignDraft(
  id: number,
  input: UpdateCampaignDraftInput
): Promise<CampaignDraft | undefined> {
  const result = await query<CampaignDraft>(
    `
      UPDATE campaign_drafts
      SET name = COALESCE($2, name),
        objective = COALESCE($3, objective),
        buying_type = COALESCE($4, buying_type),
        special_ad_categories = COALESCE($5, special_ad_categories),
        status = COALESCE($6, status),
        meta_status = COALESCE($7, meta_status),
        meta_campaign_id = COALESCE($8, meta_campaign_id),
        metadata = COALESCE($9, metadata),
        last_error = COALESCE($10, last_error),
        published_at = COALESCE($11, published_at)
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      input.name ?? null,
      input.objective ?? null,
      input.buyingType ?? null,
      input.specialAdCategories ?? null,
      input.status ?? null,
      input.metaStatus ?? null,
      input.metaCampaignId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.lastError ?? null,
      input.publishedAt ?? null
    ]
  );
  return result.rows[0];
}

export async function listCampaignDrafts(statuses?: DraftStatus[]): Promise<CampaignDraft[]> {
  const result = statuses?.length
    ? await query<CampaignDraft>(
        "SELECT * FROM campaign_drafts WHERE status = ANY($1::text[]) ORDER BY updated_at DESC",
        [statuses]
      )
    : await query<CampaignDraft>("SELECT * FROM campaign_drafts ORDER BY updated_at DESC");
  return result.rows;
}

export async function getCampaignDraftById(id: number): Promise<CampaignDraft | undefined> {
  const result = await query<CampaignDraft>("SELECT * FROM campaign_drafts WHERE id = $1", [id]);
  return result.rows[0];
}

export type CreateAdSetDraftInput = {
  campaignDraftId: number;
  name: string;
  optimizationGoal?: string;
  billingEvent?: string;
  bidStrategy?: string;
  dailyBudgetMinor?: number;
  lifetimeBudgetMinor?: number;
  startTime?: Date;
  endTime?: Date;
  targeting?: JsonObject;
  promotedObject?: JsonObject;
  status?: DraftStatus;
  metaStatus?: string;
  sortOrder?: number;
  metadata?: JsonObject;
};

export async function createAdSetDraft(input: CreateAdSetDraftInput): Promise<AdSetDraft> {
  const result = await query<AdSetDraft>(
    `
      INSERT INTO adset_drafts (
        campaign_draft_id, name, optimization_goal, billing_event, bid_strategy, daily_budget_minor,
        lifetime_budget_minor, start_time, end_time, targeting, promoted_object, status, meta_status,
        sort_order, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `,
    [
      input.campaignDraftId,
      input.name,
      input.optimizationGoal ?? "LINK_CLICKS",
      input.billingEvent ?? "IMPRESSIONS",
      input.bidStrategy ?? null,
      input.dailyBudgetMinor ?? null,
      input.lifetimeBudgetMinor ?? null,
      input.startTime ?? null,
      input.endTime ?? null,
      JSON.stringify(input.targeting ?? {}),
      input.promotedObject ? JSON.stringify(input.promotedObject) : null,
      input.status ?? "draft",
      input.metaStatus ?? "PAUSED",
      input.sortOrder ?? 0,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return result.rows[0];
}

export async function listAdSetDrafts(campaignDraftId: number): Promise<AdSetDraft[]> {
  const result = await query<AdSetDraft>(
    "SELECT * FROM adset_drafts WHERE campaign_draft_id = $1 ORDER BY sort_order ASC, id ASC",
    [campaignDraftId]
  );
  return result.rows;
}

export async function getAdSetDraftById(id: number): Promise<AdSetDraft | undefined> {
  const result = await query<AdSetDraft>("SELECT * FROM adset_drafts WHERE id = $1", [id]);
  return result.rows[0];
}

export type UpdateAdSetDraftInput = Partial<
  Pick<
    CreateAdSetDraftInput,
    | "name"
    | "optimizationGoal"
    | "billingEvent"
    | "bidStrategy"
    | "dailyBudgetMinor"
    | "lifetimeBudgetMinor"
    | "startTime"
    | "endTime"
    | "targeting"
    | "promotedObject"
    | "status"
    | "metaStatus"
    | "sortOrder"
    | "metadata"
  >
> & {
  metaAdSetId?: string | null;
  lastError?: string | null;
  publishedAt?: Date | null;
};

export async function updateAdSetDraft(id: number, input: UpdateAdSetDraftInput): Promise<AdSetDraft | undefined> {
  const result = await query<AdSetDraft>(
    `
      UPDATE adset_drafts
      SET name = COALESCE($2, name),
        optimization_goal = COALESCE($3, optimization_goal),
        billing_event = COALESCE($4, billing_event),
        bid_strategy = COALESCE($5, bid_strategy),
        daily_budget_minor = COALESCE($6, daily_budget_minor),
        lifetime_budget_minor = COALESCE($7, lifetime_budget_minor),
        start_time = COALESCE($8, start_time),
        end_time = COALESCE($9, end_time),
        targeting = COALESCE($10, targeting),
        promoted_object = COALESCE($11, promoted_object),
        status = COALESCE($12, status),
        meta_status = COALESCE($13, meta_status),
        meta_adset_id = COALESCE($14, meta_adset_id),
        sort_order = COALESCE($15, sort_order),
        metadata = COALESCE($16, metadata),
        last_error = COALESCE($17, last_error),
        published_at = COALESCE($18, published_at)
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      input.name ?? null,
      input.optimizationGoal ?? null,
      input.billingEvent ?? null,
      input.bidStrategy ?? null,
      input.dailyBudgetMinor ?? null,
      input.lifetimeBudgetMinor ?? null,
      input.startTime ?? null,
      input.endTime ?? null,
      input.targeting ? JSON.stringify(input.targeting) : null,
      input.promotedObject ? JSON.stringify(input.promotedObject) : null,
      input.status ?? null,
      input.metaStatus ?? null,
      input.metaAdSetId ?? null,
      input.sortOrder ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.lastError ?? null,
      input.publishedAt ?? null
    ]
  );
  return result.rows[0];
}

export type CreateAdDraftInput = {
  adSetDraftId: number;
  creativeId: number;
  name?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  ctaType?: string;
  ctaLink?: string;
  displayLink?: string;
  urlTags?: string;
  status?: DraftStatus;
  metaStatus?: string;
  sortOrder?: number;
  metadata?: JsonObject;
};

export async function createAdDraft(input: CreateAdDraftInput): Promise<AdDraft> {
  const result = await query<AdDraft>(
    `
      INSERT INTO ad_drafts (
        adset_draft_id, creative_id, name, primary_text, headline, description, cta_type,
        cta_link, display_link, url_tags, status, meta_status, sort_order, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `,
    [
      input.adSetDraftId,
      input.creativeId,
      input.name ?? null,
      input.primaryText ?? null,
      input.headline ?? null,
      input.description ?? null,
      input.ctaType ?? "LEARN_MORE",
      input.ctaLink ?? null,
      input.displayLink ?? null,
      input.urlTags ?? null,
      input.status ?? "draft",
      input.metaStatus ?? "PAUSED",
      input.sortOrder ?? 0,
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return result.rows[0];
}

export async function getAdDraftById(id: number): Promise<AdDraft | undefined> {
  const result = await query<AdDraft>("SELECT * FROM ad_drafts WHERE id = $1", [id]);
  return result.rows[0];
}

export type UpdateAdDraftInput = Partial<
  Pick<
    CreateAdDraftInput,
    | "name"
    | "creativeId"
    | "primaryText"
    | "headline"
    | "description"
    | "ctaType"
    | "ctaLink"
    | "displayLink"
    | "urlTags"
    | "status"
    | "metaStatus"
    | "sortOrder"
    | "metadata"
  >
> & {
  metaAdCreativeId?: string | null;
  metaAdId?: string | null;
  lastError?: string | null;
  publishedAt?: Date | null;
};

export async function updateAdDraft(id: number, input: UpdateAdDraftInput): Promise<AdDraft | undefined> {
  const result = await query<AdDraft>(
    `
      UPDATE ad_drafts
      SET creative_id = COALESCE($2, creative_id),
        name = COALESCE($3, name),
        primary_text = COALESCE($4, primary_text),
        headline = COALESCE($5, headline),
        description = COALESCE($6, description),
        cta_type = COALESCE($7, cta_type),
        cta_link = COALESCE($8, cta_link),
        display_link = COALESCE($9, display_link),
        url_tags = COALESCE($10, url_tags),
        status = COALESCE($11, status),
        meta_status = COALESCE($12, meta_status),
        meta_adcreative_id = COALESCE($13, meta_adcreative_id),
        meta_ad_id = COALESCE($14, meta_ad_id),
        sort_order = COALESCE($15, sort_order),
        metadata = COALESCE($16, metadata),
        last_error = COALESCE($17, last_error),
        published_at = COALESCE($18, published_at)
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      input.creativeId ?? null,
      input.name ?? null,
      input.primaryText ?? null,
      input.headline ?? null,
      input.description ?? null,
      input.ctaType ?? null,
      input.ctaLink ?? null,
      input.displayLink ?? null,
      input.urlTags ?? null,
      input.status ?? null,
      input.metaStatus ?? null,
      input.metaAdCreativeId ?? null,
      input.metaAdId ?? null,
      input.sortOrder ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.lastError ?? null,
      input.publishedAt ?? null
    ]
  );
  return result.rows[0];
}

export async function listAdDraftsForAdSets(adSetDraftIds: number[]): Promise<AdDraftWithCreative[]> {
  if (!adSetDraftIds.length) {
    return [];
  }

  const result = await query<AdDraftWithCreative>(
    `
      SELECT ad_drafts.*, to_jsonb(creatives.*) AS creative
      FROM ad_drafts
      JOIN creatives ON creatives.id = ad_drafts.creative_id
      WHERE ad_drafts.adset_draft_id = ANY($1::bigint[])
      ORDER BY ad_drafts.adset_draft_id ASC, ad_drafts.sort_order ASC, ad_drafts.id ASC
    `,
    [adSetDraftIds]
  );
  return result.rows;
}

export async function getCampaignDraftTree(id: number): Promise<CampaignDraftTree | undefined> {
  const campaign = await getCampaignDraftById(id);
  if (!campaign) {
    return undefined;
  }

  const adsets = await listAdSetDrafts(id);
  const ads = await listAdDraftsForAdSets(adsets.map((adset) => adset.id));
  const adsByAdSetId = new Map<string, AdDraftWithCreative[]>();
  for (const ad of ads) {
    const key = String(ad.adset_draft_id);
    adsByAdSetId.set(key, [...(adsByAdSetId.get(key) ?? []), ad]);
  }

  return {
    ...campaign,
    adsets: adsets.map<AdSetDraftWithAds>((adset) => ({
      ...adset,
      ads: adsByAdSetId.get(String(adset.id)) ?? []
    }))
  };
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
