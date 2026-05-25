import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, QueryResultRow, types as pgTypes } from "pg";
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
import { DEFAULT_CTA_TYPE } from "../shared/creativeCopy.js";

let pool: Pool | undefined;

pgTypes.setTypeParser(pgTypes.builtins.INT8, (value) => Number(value));

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
  headline?: string;
  headlineVariants?: string[];
  adTextVariants?: string[];
  ctaType?: string;
  ctaTypeVariants?: string[];
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
        notion_task_id, notion_task_url, source_file_id, source_file_name, status, asset_id, asset_type, ad_text,
        headline, headline_variants, ad_text_variants, cta_type, cta_type_variants, cta_link,
        audience, location, campaign_id, campaign_name, adset_id, adset_name, project_type, google_drive_url,
        preview_url, facebook_ad_id, uploaded_at, launched_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, COALESCE($10, '{}'::text[]), COALESCE($11, '{}'::text[]), COALESCE($12, 'LEARN_MORE'), COALESCE($13, '{}'::text[]), $14,
        $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26
      )
      ON CONFLICT (notion_task_id, source_file_id) DO UPDATE SET
        notion_task_url = COALESCE(EXCLUDED.notion_task_url, creatives.notion_task_url),
        source_file_name = COALESCE(EXCLUDED.source_file_name, creatives.source_file_name),
        status = EXCLUDED.status,
        asset_id = COALESCE(EXCLUDED.asset_id, creatives.asset_id),
        asset_type = COALESCE(EXCLUDED.asset_type, creatives.asset_type),
        ad_text = COALESCE(EXCLUDED.ad_text, creatives.ad_text),
        headline = COALESCE(EXCLUDED.headline, creatives.headline),
        headline_variants = COALESCE($10, creatives.headline_variants),
        ad_text_variants = COALESCE($11, creatives.ad_text_variants),
        cta_type = COALESCE($12, creatives.cta_type),
        cta_type_variants = COALESCE($13, creatives.cta_type_variants),
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
      input.headline ?? null,
      input.headlineVariants ?? null,
      input.adTextVariants ?? null,
      input.ctaType ?? null,
      input.ctaTypeVariants ?? null,
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
      | "headline"
      | "headlineVariants"
      | "adTextVariants"
      | "ctaType"
      | "ctaTypeVariants"
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
        headline = COALESCE($14, headline),
        headline_variants = COALESCE($15, headline_variants),
        ad_text_variants = COALESCE($16, ad_text_variants),
        cta_type = COALESCE($17, cta_type),
        cta_type_variants = COALESCE($18, cta_type_variants),
        cta_link = COALESCE($19, cta_link),
        audience = COALESCE($20, audience),
        location = COALESCE($21, location),
        project_type = COALESCE($22, project_type)
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
      fields.headline ?? null,
      fields.headlineVariants ?? null,
      fields.adTextVariants ?? null,
      fields.ctaType ?? null,
      fields.ctaTypeVariants ?? null,
      fields.ctaLink ?? null,
      fields.audience ?? null,
      fields.location ?? null,
      fields.projectType ?? null
    ]
  );
  return result.rows[0];
}

export async function updateCreativeDetails(
  id: number,
  fields: {
    projectType: string | null;
    adText: string | null;
    headline: string | null;
    headlineVariants: string[];
    adTextVariants: string[];
    ctaType: string | null;
    ctaTypeVariants: string[];
    ctaLink: string | null;
    audience: string | null;
    location: string | null;
    campaignId: string | null;
    campaignName: string | null;
    adSetId: string | null;
    adSetName: string | null;
  }
): Promise<Creative | undefined> {
  const result = await query<Creative>(
    `
      UPDATE creatives
      SET project_type = $2,
        ad_text = $3,
        headline = $4,
        headline_variants = $5,
        ad_text_variants = $6,
        cta_type = $7,
        cta_type_variants = $8,
        cta_link = $9,
        audience = $10,
        location = $11,
        campaign_id = $12,
        campaign_name = $13,
        adset_id = $14,
        adset_name = $15
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      fields.projectType,
      fields.adText,
      fields.headline,
      fields.headlineVariants,
      fields.adTextVariants,
      fields.ctaType ?? DEFAULT_CTA_TYPE,
      fields.ctaTypeVariants,
      fields.ctaLink,
      fields.audience,
      fields.location,
      fields.campaignId,
      fields.campaignName,
      fields.adSetId,
      fields.adSetName
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
type JsonInput = JsonObject | Array<Record<string, unknown>>;

export type CreateCampaignDraftInput = {
  name: string;
  objective?: string;
  buyingType?: string;
  specialAdCategories?: string[];
  campaignSettingsMode?: string;
  budgetStrategy?: string;
  campaignDailyBudgetMinor?: number | null;
  campaignLifetimeBudgetMinor?: number | null;
  bidStrategy?: string | null;
  spendCapMinor?: number | null;
  specialAdCategoryCountries?: string[];
  promotedObject?: JsonObject | null;
  budgetScheduleSpecs?: JsonInput | null;
  isSkadnetworkAttribution?: boolean;
  abTestEnabled?: boolean;
  liveAdsEnabled?: boolean;
  status?: DraftStatus;
  metaStatus?: string;
  metadata?: JsonObject;
};

export async function createCampaignDraft(input: CreateCampaignDraftInput): Promise<CampaignDraft> {
  const result = await query<CampaignDraft>(
    `
      INSERT INTO campaign_drafts (
        name, objective, buying_type, special_ad_categories, campaign_settings_mode, budget_strategy,
        campaign_daily_budget_minor, campaign_lifetime_budget_minor, bid_strategy, spend_cap_minor,
        special_ad_category_countries, promoted_object, budget_schedule_specs, is_skadnetwork_attribution,
        a_b_test_enabled, live_ads_enabled, status, meta_status, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `,
    [
      input.name,
      input.objective ?? "OUTCOME_TRAFFIC",
      input.buyingType ?? "AUCTION",
      input.specialAdCategories ?? [],
      input.campaignSettingsMode ?? "MANUAL",
      input.budgetStrategy ?? "AD_SET",
      input.campaignDailyBudgetMinor ?? null,
      input.campaignLifetimeBudgetMinor ?? null,
      input.bidStrategy ?? null,
      input.spendCapMinor ?? null,
      input.specialAdCategoryCountries ?? [],
      input.promotedObject ? JSON.stringify(input.promotedObject) : null,
      input.budgetScheduleSpecs ? JSON.stringify(input.budgetScheduleSpecs) : null,
      input.isSkadnetworkAttribution ?? false,
      input.abTestEnabled ?? false,
      input.liveAdsEnabled ?? false,
      input.status ?? "draft",
      input.metaStatus ?? "PAUSED",
      JSON.stringify(input.metadata ?? {})
    ]
  );
  return result.rows[0];
}

export type UpdateCampaignDraftInput = Partial<
  Pick<
    CreateCampaignDraftInput,
    | "name"
    | "objective"
    | "buyingType"
    | "specialAdCategories"
    | "campaignSettingsMode"
    | "budgetStrategy"
    | "campaignDailyBudgetMinor"
    | "campaignLifetimeBudgetMinor"
    | "bidStrategy"
    | "spendCapMinor"
    | "specialAdCategoryCountries"
    | "promotedObject"
    | "budgetScheduleSpecs"
    | "isSkadnetworkAttribution"
    | "abTestEnabled"
    | "liveAdsEnabled"
    | "status"
    | "metaStatus"
    | "metadata"
  >
> & {
  metaCampaignId?: string | null;
  lastError?: string | null;
  publishedAt?: Date | null;
};

export async function updateCampaignDraft(
  id: number,
  input: UpdateCampaignDraftInput
): Promise<CampaignDraft | undefined> {
  const setters: string[] = [];
  const values: unknown[] = [id];

  function add(field: keyof UpdateCampaignDraftInput, column: string, value: unknown = input[field]) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      return;
    }
    values.push(value);
    setters.push(`${column} = $${values.length}`);
  }

  add("name", "name");
  add("objective", "objective");
  add("buyingType", "buying_type");
  add("specialAdCategories", "special_ad_categories");
  add("campaignSettingsMode", "campaign_settings_mode");
  add("budgetStrategy", "budget_strategy");
  add("campaignDailyBudgetMinor", "campaign_daily_budget_minor");
  add("campaignLifetimeBudgetMinor", "campaign_lifetime_budget_minor");
  add("bidStrategy", "bid_strategy");
  add("spendCapMinor", "spend_cap_minor");
  add("specialAdCategoryCountries", "special_ad_category_countries");
  add("promotedObject", "promoted_object", input.promotedObject ? JSON.stringify(input.promotedObject) : null);
  add(
    "budgetScheduleSpecs",
    "budget_schedule_specs",
    input.budgetScheduleSpecs ? JSON.stringify(input.budgetScheduleSpecs) : null
  );
  add("isSkadnetworkAttribution", "is_skadnetwork_attribution");
  add("abTestEnabled", "a_b_test_enabled");
  add("liveAdsEnabled", "live_ads_enabled");
  add("status", "status");
  add("metaStatus", "meta_status");
  add("metaCampaignId", "meta_campaign_id");
  add("metadata", "metadata", input.metadata ? JSON.stringify(input.metadata) : null);
  add("lastError", "last_error");
  add("publishedAt", "published_at");

  if (!setters.length) {
    return getCampaignDraftById(id);
  }

  const result = await query<CampaignDraft>(
    `
      UPDATE campaign_drafts
      SET ${setters.join(", ")}
      WHERE id = $1
      RETURNING *
    `,
    values
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
  destinationType?: string;
  conversionEvent?: string | null;
  optimizationGoal?: string;
  billingEvent?: string;
  bidStrategy?: string | null;
  bidAmountMinor?: number | null;
  dailyBudgetMinor?: number | null;
  lifetimeBudgetMinor?: number | null;
  startTime?: Date | null;
  endTime?: Date | null;
  targeting?: JsonObject;
  promotedObject?: JsonObject | null;
  attributionSetting?: string | null;
  isDynamicCreative?: boolean;
  useAdvantageAudience?: boolean;
  savedAudienceId?: string | null;
  audienceControls?: JsonObject;
  audienceRecommendations?: JsonObject;
  placementMode?: string;
  placementSettings?: JsonObject;
  brandSafetyControls?: JsonObject;
  pacingType?: string | null;
  adsetSchedule?: JsonInput | null;
  frequencyControlSpecs?: JsonInput | null;
  beneficiary?: string | null;
  payor?: string | null;
  status?: DraftStatus;
  metaStatus?: string;
  sortOrder?: number;
  metadata?: JsonObject;
};

export async function createAdSetDraft(input: CreateAdSetDraftInput): Promise<AdSetDraft> {
  const result = await query<AdSetDraft>(
    `
      INSERT INTO adset_drafts (
        campaign_draft_id, name, destination_type, conversion_event, optimization_goal, billing_event,
        bid_strategy, bid_amount_minor, daily_budget_minor, lifetime_budget_minor, start_time, end_time,
        targeting, promoted_object, attribution_setting, is_dynamic_creative, use_advantage_audience,
        saved_audience_id, audience_controls, audience_recommendations, placement_mode, placement_settings,
        brand_safety_controls, pacing_type, adset_schedule, frequency_control_specs, beneficiary, payor,
        status, meta_status, sort_order, metadata
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28, $29, $30, $31, $32
      )
      RETURNING *
    `,
    [
      input.campaignDraftId,
      input.name,
      input.destinationType ?? "WEBSITE",
      input.conversionEvent ?? null,
      input.optimizationGoal ?? "LINK_CLICKS",
      input.billingEvent ?? "IMPRESSIONS",
      input.bidStrategy ?? null,
      input.bidAmountMinor ?? null,
      input.dailyBudgetMinor ?? null,
      input.lifetimeBudgetMinor ?? null,
      input.startTime ?? null,
      input.endTime ?? null,
      JSON.stringify(input.targeting ?? {}),
      input.promotedObject ? JSON.stringify(input.promotedObject) : null,
      input.attributionSetting ?? null,
      input.isDynamicCreative ?? false,
      input.useAdvantageAudience ?? true,
      input.savedAudienceId ?? null,
      JSON.stringify(input.audienceControls ?? {}),
      JSON.stringify(input.audienceRecommendations ?? {}),
      input.placementMode ?? "ADVANTAGE_PLUS",
      JSON.stringify(input.placementSettings ?? {}),
      JSON.stringify(input.brandSafetyControls ?? {}),
      input.pacingType ?? null,
      input.adsetSchedule ? JSON.stringify(input.adsetSchedule) : null,
      input.frequencyControlSpecs ? JSON.stringify(input.frequencyControlSpecs) : null,
      input.beneficiary ?? null,
      input.payor ?? null,
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
    | "destinationType"
    | "conversionEvent"
    | "optimizationGoal"
    | "billingEvent"
    | "bidStrategy"
    | "bidAmountMinor"
    | "dailyBudgetMinor"
    | "lifetimeBudgetMinor"
    | "startTime"
    | "endTime"
    | "targeting"
    | "promotedObject"
    | "attributionSetting"
    | "isDynamicCreative"
    | "useAdvantageAudience"
    | "savedAudienceId"
    | "audienceControls"
    | "audienceRecommendations"
    | "placementMode"
    | "placementSettings"
    | "brandSafetyControls"
    | "pacingType"
    | "adsetSchedule"
    | "frequencyControlSpecs"
    | "beneficiary"
    | "payor"
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
  const setters: string[] = [];
  const values: unknown[] = [id];

  function add(field: keyof UpdateAdSetDraftInput, column: string, value: unknown = input[field]) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      return;
    }
    values.push(value);
    setters.push(`${column} = $${values.length}`);
  }

  add("name", "name");
  add("destinationType", "destination_type");
  add("conversionEvent", "conversion_event");
  add("optimizationGoal", "optimization_goal");
  add("billingEvent", "billing_event");
  add("bidStrategy", "bid_strategy");
  add("bidAmountMinor", "bid_amount_minor");
  add("dailyBudgetMinor", "daily_budget_minor");
  add("lifetimeBudgetMinor", "lifetime_budget_minor");
  add("startTime", "start_time");
  add("endTime", "end_time");
  add("targeting", "targeting", input.targeting ? JSON.stringify(input.targeting) : null);
  add("promotedObject", "promoted_object", input.promotedObject ? JSON.stringify(input.promotedObject) : null);
  add("attributionSetting", "attribution_setting");
  add("isDynamicCreative", "is_dynamic_creative");
  add("useAdvantageAudience", "use_advantage_audience");
  add("savedAudienceId", "saved_audience_id");
  add("audienceControls", "audience_controls", input.audienceControls ? JSON.stringify(input.audienceControls) : null);
  add(
    "audienceRecommendations",
    "audience_recommendations",
    input.audienceRecommendations ? JSON.stringify(input.audienceRecommendations) : null
  );
  add("placementMode", "placement_mode");
  add("placementSettings", "placement_settings", input.placementSettings ? JSON.stringify(input.placementSettings) : null);
  add(
    "brandSafetyControls",
    "brand_safety_controls",
    input.brandSafetyControls ? JSON.stringify(input.brandSafetyControls) : null
  );
  add("pacingType", "pacing_type");
  add("adsetSchedule", "adset_schedule", input.adsetSchedule ? JSON.stringify(input.adsetSchedule) : null);
  add(
    "frequencyControlSpecs",
    "frequency_control_specs",
    input.frequencyControlSpecs ? JSON.stringify(input.frequencyControlSpecs) : null
  );
  add("beneficiary", "beneficiary");
  add("payor", "payor");
  add("status", "status");
  add("metaStatus", "meta_status");
  add("metaAdSetId", "meta_adset_id");
  add("sortOrder", "sort_order");
  add("metadata", "metadata", input.metadata ? JSON.stringify(input.metadata) : null);
  add("lastError", "last_error");
  add("publishedAt", "published_at");

  if (!setters.length) {
    return getAdSetDraftById(id);
  }

  const result = await query<AdSetDraft>(
    `
      UPDATE adset_drafts
      SET ${setters.join(", ")}
      WHERE id = $1
      RETURNING *
    `,
    values
  );
  return result.rows[0];
}

export type CreateAdDraftInput = {
  adSetDraftId: number;
  creativeId: number;
  name?: string | null;
  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;
  ctaType?: string;
  ctaLink?: string | null;
  displayLink?: string | null;
  urlTags?: string | null;
  facebookPageId?: string | null;
  instagramActorId?: string | null;
  threadsActorId?: string | null;
  brandedContentSponsorPageId?: string | null;
  brandIdentitySettings?: JsonObject;
  destinationType?: string;
  destinationUrl?: string | null;
  leadFormId?: string | null;
  leadFormName?: string | null;
  instantExperienceId?: string | null;
  appDeepLinkUrl?: string | null;
  phoneNumber?: string | null;
  whatsappPhoneNumber?: string | null;
  primaryTextVariants?: string[];
  headlineVariants?: string[];
  descriptionVariants?: string[];
  objectStorySpec?: JsonObject | null;
  assetFeedSpec?: JsonObject | null;
  callToActionValue?: JsonObject | null;
  creativeFeaturesSpec?: JsonObject | null;
  degreesOfFreedomSpec?: JsonObject | null;
  trackingSpecs?: JsonInput | null;
  conversionSpecs?: JsonInput | null;
  urlParameters?: JsonObject;
  metaPixelId?: string | null;
  conversionEventName?: string | null;
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
        cta_link, display_link, url_tags, facebook_page_id, instagram_actor_id, threads_actor_id,
        branded_content_sponsor_page_id, brand_identity_settings, destination_type, destination_url,
        lead_form_id, lead_form_name, instant_experience_id, app_deep_link_url, phone_number,
        whatsapp_phone_number, primary_text_variants, headline_variants, description_variants,
        object_story_spec, asset_feed_spec, call_to_action_value, creative_features_spec,
        degrees_of_freedom_spec, tracking_specs, conversion_specs, url_parameters, meta_pixel_id,
        conversion_event_name, status, meta_status, sort_order, metadata
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28, $29, $30, $31, $32,
        $33, $34, $35, $36, $37, $38, $39, $40
      )
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
      input.facebookPageId ?? null,
      input.instagramActorId ?? null,
      input.threadsActorId ?? null,
      input.brandedContentSponsorPageId ?? null,
      JSON.stringify(input.brandIdentitySettings ?? {}),
      input.destinationType ?? "WEBSITE",
      input.destinationUrl ?? null,
      input.leadFormId ?? null,
      input.leadFormName ?? null,
      input.instantExperienceId ?? null,
      input.appDeepLinkUrl ?? null,
      input.phoneNumber ?? null,
      input.whatsappPhoneNumber ?? null,
      input.primaryTextVariants ?? [],
      input.headlineVariants ?? [],
      input.descriptionVariants ?? [],
      input.objectStorySpec ? JSON.stringify(input.objectStorySpec) : null,
      input.assetFeedSpec ? JSON.stringify(input.assetFeedSpec) : null,
      input.callToActionValue ? JSON.stringify(input.callToActionValue) : null,
      input.creativeFeaturesSpec ? JSON.stringify(input.creativeFeaturesSpec) : null,
      input.degreesOfFreedomSpec ? JSON.stringify(input.degreesOfFreedomSpec) : null,
      input.trackingSpecs ? JSON.stringify(input.trackingSpecs) : null,
      input.conversionSpecs ? JSON.stringify(input.conversionSpecs) : null,
      JSON.stringify(input.urlParameters ?? {}),
      input.metaPixelId ?? null,
      input.conversionEventName ?? null,
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
	    | "facebookPageId"
	    | "instagramActorId"
	    | "threadsActorId"
	    | "brandedContentSponsorPageId"
	    | "brandIdentitySettings"
	    | "destinationType"
	    | "destinationUrl"
	    | "leadFormId"
	    | "leadFormName"
	    | "instantExperienceId"
	    | "appDeepLinkUrl"
	    | "phoneNumber"
	    | "whatsappPhoneNumber"
	    | "primaryTextVariants"
	    | "headlineVariants"
	    | "descriptionVariants"
	    | "objectStorySpec"
	    | "assetFeedSpec"
	    | "callToActionValue"
	    | "creativeFeaturesSpec"
	    | "degreesOfFreedomSpec"
	    | "trackingSpecs"
	    | "conversionSpecs"
	    | "urlParameters"
	    | "metaPixelId"
	    | "conversionEventName"
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
  const setters: string[] = [];
  const values: unknown[] = [id];

  function add(field: keyof UpdateAdDraftInput, column: string, value: unknown = input[field]) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      return;
    }
    values.push(value);
    setters.push(`${column} = $${values.length}`);
  }

  add("creativeId", "creative_id");
  add("name", "name");
  add("primaryText", "primary_text");
  add("headline", "headline");
  add("description", "description");
  add("ctaType", "cta_type");
  add("ctaLink", "cta_link");
  add("displayLink", "display_link");
  add("urlTags", "url_tags");
  add("facebookPageId", "facebook_page_id");
  add("instagramActorId", "instagram_actor_id");
  add("threadsActorId", "threads_actor_id");
  add("brandedContentSponsorPageId", "branded_content_sponsor_page_id");
  add("brandIdentitySettings", "brand_identity_settings", input.brandIdentitySettings ? JSON.stringify(input.brandIdentitySettings) : null);
  add("destinationType", "destination_type");
  add("destinationUrl", "destination_url");
  add("leadFormId", "lead_form_id");
  add("leadFormName", "lead_form_name");
  add("instantExperienceId", "instant_experience_id");
  add("appDeepLinkUrl", "app_deep_link_url");
  add("phoneNumber", "phone_number");
  add("whatsappPhoneNumber", "whatsapp_phone_number");
  add("primaryTextVariants", "primary_text_variants");
  add("headlineVariants", "headline_variants");
  add("descriptionVariants", "description_variants");
  add("objectStorySpec", "object_story_spec", input.objectStorySpec ? JSON.stringify(input.objectStorySpec) : null);
  add("assetFeedSpec", "asset_feed_spec", input.assetFeedSpec ? JSON.stringify(input.assetFeedSpec) : null);
  add("callToActionValue", "call_to_action_value", input.callToActionValue ? JSON.stringify(input.callToActionValue) : null);
  add(
    "creativeFeaturesSpec",
    "creative_features_spec",
    input.creativeFeaturesSpec ? JSON.stringify(input.creativeFeaturesSpec) : null
  );
  add(
    "degreesOfFreedomSpec",
    "degrees_of_freedom_spec",
    input.degreesOfFreedomSpec ? JSON.stringify(input.degreesOfFreedomSpec) : null
  );
  add("trackingSpecs", "tracking_specs", input.trackingSpecs ? JSON.stringify(input.trackingSpecs) : null);
  add("conversionSpecs", "conversion_specs", input.conversionSpecs ? JSON.stringify(input.conversionSpecs) : null);
  add("urlParameters", "url_parameters", input.urlParameters ? JSON.stringify(input.urlParameters) : null);
  add("metaPixelId", "meta_pixel_id");
  add("conversionEventName", "conversion_event_name");
  add("status", "status");
  add("metaStatus", "meta_status");
  add("metaAdCreativeId", "meta_adcreative_id");
  add("metaAdId", "meta_ad_id");
  add("sortOrder", "sort_order");
  add("metadata", "metadata", input.metadata ? JSON.stringify(input.metadata) : null);
  add("lastError", "last_error");
  add("publishedAt", "published_at");

  if (!setters.length) {
    return getAdDraftById(id);
  }

  const result = await query<AdDraft>(
    `
      UPDATE ad_drafts
      SET ${setters.join(", ")}
      WHERE id = $1
      RETURNING *
    `,
    values
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
