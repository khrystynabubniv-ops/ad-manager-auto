import { Router } from "express";
import { z, ZodError } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  createAdDraft,
  createAdSetDraft,
  createCampaignDraft,
  getAdDraftById,
  getAdSetDraftById,
  getCampaignDraftById,
  getCampaignDraftTree,
  getCreativeById,
  listCampaignDrafts,
  updateAdDraft,
  updateAdSetDraft,
  updateCampaignDraft
} from "../services/db.js";
import { DraftStatus } from "../types.js";
import { AppError } from "../utils/errors.js";

const draftStatusSchema = z.enum(["draft", "publishing", "published", "publish_failed", "archived"]);
const jsonObjectSchema = z.record(z.unknown());
const nonEmptyString = z.string().trim().min(1);
const optionalString = nonEmptyString.optional();
const nullableString = nonEmptyString.nullable().optional();
const nullablePositiveInt = z.number().int().positive().nullable().optional();
const optionalJsonValue = z.union([jsonObjectSchema, z.array(jsonObjectSchema)]).nullable().optional();
const optionalDate = z.string().datetime().transform((value) => new Date(value)).optional();

const campaignCreateSchema = z
  .object({
    name: nonEmptyString,
    objective: optionalString,
    buyingType: optionalString,
    specialAdCategories: z.array(nonEmptyString).optional(),
    campaignSettingsMode: optionalString,
    budgetStrategy: optionalString,
    campaignDailyBudgetMinor: nullablePositiveInt,
    campaignLifetimeBudgetMinor: nullablePositiveInt,
    bidStrategy: nullableString,
    spendCapMinor: nullablePositiveInt,
    specialAdCategoryCountries: z.array(nonEmptyString).optional(),
    promotedObject: jsonObjectSchema.nullable().optional(),
    budgetScheduleSpecs: optionalJsonValue,
    isSkadnetworkAttribution: z.boolean().optional(),
    abTestEnabled: z.boolean().optional(),
    liveAdsEnabled: z.boolean().optional(),
    status: draftStatusSchema.optional(),
    metaStatus: optionalString,
    metadata: jsonObjectSchema.optional()
  })
  .strict();

const campaignUpdateSchema = campaignCreateSchema.partial();

const adSetCreateSchema = z
  .object({
    name: nonEmptyString,
    optimizationGoal: optionalString,
    billingEvent: optionalString,
    bidStrategy: optionalString,
    dailyBudgetMinor: z.number().int().positive().optional(),
    lifetimeBudgetMinor: z.number().int().positive().optional(),
    startTime: optionalDate,
    endTime: optionalDate,
    targeting: jsonObjectSchema.optional(),
    promotedObject: jsonObjectSchema.optional(),
    status: draftStatusSchema.optional(),
    metaStatus: optionalString,
    sortOrder: z.number().int().min(0).optional(),
    metadata: jsonObjectSchema.optional()
  })
  .strict();

const adSetUpdateSchema = adSetCreateSchema.partial();

const adCreateSchema = z
  .object({
    creativeId: z.number().int().positive(),
    name: optionalString,
    primaryText: optionalString,
    headline: optionalString,
    description: optionalString,
    ctaType: optionalString,
    ctaLink: optionalString,
    displayLink: optionalString,
    urlTags: optionalString,
    status: draftStatusSchema.optional(),
    metaStatus: optionalString,
    sortOrder: z.number().int().min(0).optional(),
    metadata: jsonObjectSchema.optional()
  })
  .strict();

const adUpdateSchema = adCreateSchema.partial();

export const campaignDraftsRouter = Router();
export const adSetDraftsRouter = Router();
export const adDraftsRouter = Router();

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  try {
    return schema.parse(body ?? {});
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
      throw new AppError(`Invalid request body: ${message}`, {
        statusCode: 400,
        code: "INVALID_REQUEST_BODY",
        details: error.issues
      });
    }
    throw error;
  }
}

function parseId(value: string | undefined, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(`Invalid ${label}`, { statusCode: 400, code: "INVALID_ID" });
  }
  return id;
}

function parseStatuses(value: unknown): DraftStatus[] | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const statuses = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const parsed = z.array(draftStatusSchema).safeParse(statuses);
  if (!parsed.success) {
    throw new AppError("Invalid draft status filter", { statusCode: 400, code: "INVALID_STATUS_FILTER" });
  }
  return parsed.data;
}

function ensureCampaignDraft(id: number) {
  return getCampaignDraftById(id).then((campaign) => {
    if (!campaign) {
      throw new AppError(`Campaign draft ${id} not found`, { statusCode: 404, code: "CAMPAIGN_DRAFT_NOT_FOUND" });
    }
    return campaign;
  });
}

function ensureAdSetDraft(id: number) {
  return getAdSetDraftById(id).then((adset) => {
    if (!adset) {
      throw new AppError(`Ad set draft ${id} not found`, { statusCode: 404, code: "ADSET_DRAFT_NOT_FOUND" });
    }
    return adset;
  });
}

async function ensureUploadedCreative(id: number) {
  const creative = await getCreativeById(id);
  if (!creative) {
    throw new AppError(`Creative ${id} not found`, { statusCode: 404, code: "CREATIVE_NOT_FOUND" });
  }
  if (!creative.asset_id || !creative.asset_type) {
    throw new AppError(`Creative ${id} must be uploaded before it can be assigned to an ad draft`, {
      statusCode: 400,
      code: "CREATIVE_NOT_UPLOADED"
    });
  }
  return creative;
}

campaignDraftsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const drafts = await listCampaignDrafts(parseStatuses(req.query.status));
    res.json({ campaignDrafts: drafts });
  } catch (error) {
    next(error);
  }
});

campaignDraftsRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = parseBody(campaignCreateSchema, req.body);
    const campaignDraft = await createCampaignDraft(input);
    res.status(201).json({ campaignDraft });
  } catch (error) {
    next(error);
  }
});

campaignDraftsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "campaign draft id");
    const campaignDraft = await getCampaignDraftTree(id);
    if (!campaignDraft) {
      throw new AppError(`Campaign draft ${id} not found`, {
        statusCode: 404,
        code: "CAMPAIGN_DRAFT_NOT_FOUND"
      });
    }
    res.json({ campaignDraft });
  } catch (error) {
    next(error);
  }
});

campaignDraftsRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "campaign draft id");
    await ensureCampaignDraft(id);
    const input = parseBody(campaignUpdateSchema, req.body);
    const campaignDraft = await updateCampaignDraft(id, input);
    res.json({ campaignDraft });
  } catch (error) {
    next(error);
  }
});

campaignDraftsRouter.post("/:id/adsets", requireAuth, async (req, res, next) => {
  try {
    const campaignDraftId = parseId(req.params.id, "campaign draft id");
    await ensureCampaignDraft(campaignDraftId);
    const input = parseBody(adSetCreateSchema, req.body);
    const adSetDraft = await createAdSetDraft({ ...input, campaignDraftId });
    res.status(201).json({ adSetDraft });
  } catch (error) {
    next(error);
  }
});

adSetDraftsRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "ad set draft id");
    await ensureAdSetDraft(id);
    const input = parseBody(adSetUpdateSchema, req.body);
    const adSetDraft = await updateAdSetDraft(id, input);
    res.json({ adSetDraft });
  } catch (error) {
    next(error);
  }
});

adSetDraftsRouter.post("/:id/ads", requireAuth, async (req, res, next) => {
  try {
    const adSetDraftId = parseId(req.params.id, "ad set draft id");
    await ensureAdSetDraft(adSetDraftId);
    const input = parseBody(adCreateSchema, req.body);
    const creative = await ensureUploadedCreative(input.creativeId);
    const adDraft = await createAdDraft({
      ...input,
      adSetDraftId,
      name: input.name ?? creative.source_file_name ?? creative.project_type ?? `Creative ${creative.id}`,
      primaryText: input.primaryText ?? creative.ad_text ?? undefined,
      ctaLink: input.ctaLink ?? creative.cta_link ?? undefined
    });
    res.status(201).json({ adDraft });
  } catch (error) {
    next(error);
  }
});

adDraftsRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = parseId(req.params.id, "ad draft id");
    const existing = await getAdDraftById(id);
    if (!existing) {
      throw new AppError(`Ad draft ${id} not found`, { statusCode: 404, code: "AD_DRAFT_NOT_FOUND" });
    }
    const input = parseBody(adUpdateSchema, req.body);
    if (input.creativeId) {
      await ensureUploadedCreative(input.creativeId);
    }
    const adDraft = await updateAdDraft(id, input);
    res.json({ adDraft });
  } catch (error) {
    next(error);
  }
});
