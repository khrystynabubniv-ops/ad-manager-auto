import { Router } from "express";
import { randomUUID } from "node:crypto";
import { DB_STATUS } from "../config/statuses.js";
import { requireAuth } from "../middleware/auth.js";
import {
  creativeGroupId,
  getCreativeById,
  getCreativeGroupById,
  listCreativeGroups,
  listCreatives,
  updateCreativeDetails,
  updateCreativeGrouping,
  updateCreativeStatus,
  upsertCreative
} from "../services/db.js";
import { generateCreativeCopy } from "../services/copyGenerator.js";
import { getFacebookAdSet, uploadCreativeAsset } from "../services/facebook.js";
import { cleanTextSequence, normalizeCtaType, normalizeCtaTypeSequence } from "../shared/creativeCopy.js";
import { creativeGroupingForFileName } from "../utils/assetNaming.js";
import { CreativeAssetPlacement } from "../types.js";
import { AppError } from "../utils/errors.js";

export const creativesRouter = Router();

const assetPlacements = ["feed", "stories_reels", "horizontal", "unknown", "do_not_use"] as const;

function creativeListStatuses(status?: string): string[] {
  if (status === "launched") {
    return [DB_STATUS.LAUNCHED];
  }
  if (status === "ready" || !status) {
    return [DB_STATUS.READY_TO_LAUNCH, DB_STATUS.LAUNCH_FAILED];
  }
  return [status];
}

function isEmptyCreativeSlot(creative: { source_file_id: string; asset_id: string | null; asset_type: string | null }) {
  return creative.source_file_id.startsWith("slot:") || !creative.asset_id || !creative.asset_type;
}

function parseAssetPlacement(value: unknown, fallback?: CreativeAssetPlacement): CreativeAssetPlacement {
  const placement = typeof value === "string" ? value : fallback;
  if (!placement || !assetPlacements.includes(placement as CreativeAssetPlacement)) {
    throw new AppError("Invalid asset placement", { statusCode: 400, code: "INVALID_ASSET_PLACEMENT" });
  }
  return placement as CreativeAssetPlacement;
}

creativesRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const statuses = creativeListStatuses(status);
    const creatives = await listCreatives(statuses);
    res.json({ creatives });
  } catch (error) {
    next(error);
  }
});

creativesRouter.get("/groups", requireAuth, async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const statuses = creativeListStatuses(status);
    const groups = await listCreativeGroups(statuses, {
      groupByFacebookAdId: statuses.length === 1 && statuses[0] === DB_STATUS.LAUNCHED
    });
    res.json({ groups });
  } catch (error) {
    next(error);
  }
});

creativesRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError("Invalid creative id", { statusCode: 400, code: "INVALID_CREATIVE_ID" });
    }

    const existing = await getCreativeById(id);
    if (!existing) {
      throw new AppError(`Creative ${id} not found`, { statusCode: 404, code: "CREATIVE_NOT_FOUND" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const optionalText = (name: string) => {
      if (!(name in body)) return undefined;
      return typeof body[name] === "string" ? body[name].trim() || null : null;
    };
    const optionalTextArray = (name: string) => {
      if (!(name in body)) return undefined;
      return cleanTextSequence(body[name]);
    };
    const optionalCtaType = (name: string) => {
      if (!(name in body)) return undefined;
      return typeof body[name] === "string" ? normalizeCtaType(body[name]) : normalizeCtaType(null);
    };
    const optionalCtaTypeArray = (name: string) => {
      if (!(name in body)) return undefined;
      return normalizeCtaTypeSequence(body[name]);
    };
    const nextText = (name: string, current: string | null) => {
      const value = optionalText(name);
      return value === undefined ? current : value;
    };
    const nextTextArray = (name: string, current: string[]) => {
      const value = optionalTextArray(name);
      return value === undefined ? current : value;
    };
    const nextCtaType = (name: string, current: string) => {
      const value = optionalCtaType(name);
      return value === undefined ? current : value;
    };
    const nextCtaTypeArray = (name: string, current: string[]) => {
      const value = optionalCtaTypeArray(name);
      return value === undefined ? current : value;
    };

    const campaignId = nextText("campaignId", existing.campaign_id);
    const campaignName = campaignId ? nextText("campaignName", existing.campaign_name) : null;
    const adSetId = campaignId ? nextText("adSetId", existing.adset_id) : null;
    let adSetName = campaignId && adSetId ? nextText("adSetName", existing.adset_name) : null;

    if (campaignId && adSetId) {
      const adSet = await getFacebookAdSet(adSetId, req.id as string | undefined);
      if (adSet.campaign_id !== campaignId) {
        throw new AppError(`Ad set ${adSetId} belongs to campaign ${adSet.campaign_id}, not ${campaignId}`, {
          statusCode: 400,
          code: "ADSET_CAMPAIGN_MISMATCH"
        });
      }
      adSetName = adSetName || adSet.name;
    }

    const creative = await updateCreativeDetails(id, {
      projectType: nextText("projectType", existing.project_type),
      adText: nextText("adText", existing.ad_text),
      headline: nextText("headline", existing.headline),
      headlineVariants: nextTextArray("headlineVariants", existing.headline_variants ?? []),
      adTextVariants: nextTextArray("adTextVariants", existing.ad_text_variants ?? []),
      ctaType: nextCtaType("ctaType", existing.cta_type),
      ctaTypeVariants: nextCtaTypeArray("ctaTypeVariants", existing.cta_type_variants ?? []),
      ctaLink: nextText("ctaLink", existing.cta_link),
      audience: nextText("audience", existing.audience),
      location: nextText("location", existing.location),
      campaignId,
      campaignName,
      adSetId,
      adSetName
    });

    res.json({ creative });
  } catch (error) {
    next(error);
  }
});

creativesRouter.patch("/:id/grouping", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError("Invalid creative id", { statusCode: 400, code: "INVALID_CREATIVE_ID" });
    }

    const existing = await getCreativeById(id);
    if (!existing) {
      throw new AppError(`Creative ${id} not found`, { statusCode: 404, code: "CREATIVE_NOT_FOUND" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const creativeGroupKey = typeof body.creativeGroupKey === "string" ? body.creativeGroupKey.trim() : "";
    const creativeGroupName = typeof body.creativeGroupName === "string" ? body.creativeGroupName.trim() : creativeGroupKey;
    const assetPlacement = parseAssetPlacement(body.assetPlacement, existing.asset_placement);
    if (!creativeGroupKey) {
      throw new AppError("creativeGroupKey is required", { statusCode: 400, code: "MISSING_CREATIVE_GROUP_KEY" });
    }

    const creative = await updateCreativeGrouping(id, {
      creativeGroupKey,
      creativeGroupName,
      assetPlacement
    });
    res.json({ creative });
  } catch (error) {
    next(error);
  }
});

creativesRouter.post("/groups/:groupId/slots", requireAuth, async (req, res, next) => {
  try {
    const group = await getCreativeGroupById(req.params.groupId, [DB_STATUS.READY_TO_LAUNCH, DB_STATUS.LAUNCH_FAILED]);
    if (!group) {
      throw new AppError("Creative group not found", { statusCode: 404, code: "CREATIVE_GROUP_NOT_FOUND" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const assetPlacement = parseAssetPlacement(body.assetPlacement, "unknown");
    const sourceFileId = `slot:${group.group_key}:${randomUUID()}`;
    const sourceFileName = `Empty ${assetPlacement.replaceAll("_", "/")} slot`;
    const primary = group.primary_creative;

    await upsertCreative({
      notionTaskId: group.notion_task_id,
      notionTaskUrl: group.notion_task_url ?? undefined,
      sourceFileId,
      sourceFileName,
      creativeGroupKey: group.group_key,
      creativeGroupName: group.group_name,
      assetPlacement,
      groupingStatus: "manual",
      status: DB_STATUS.READY_TO_LAUNCH,
      projectType: primary.project_type ?? undefined,
      adText: primary.ad_text ?? undefined,
      headline: primary.headline ?? undefined,
      headlineVariants: primary.headline_variants ?? undefined,
      adTextVariants: primary.ad_text_variants ?? undefined,
      ctaType: primary.cta_type ?? undefined,
      ctaTypeVariants: primary.cta_type_variants ?? undefined,
      ctaLink: primary.cta_link ?? undefined,
      campaignId: primary.campaign_id ?? undefined,
      campaignName: primary.campaign_name ?? undefined,
      adSetId: primary.adset_id ?? undefined,
      adSetName: primary.adset_name ?? undefined,
      googleDriveUrl: primary.google_drive_url ?? undefined
    });

    res.status(201).json({ group: await getCreativeGroupById(req.params.groupId) });
  } catch (error) {
    next(error);
  }
});

creativesRouter.post("/:id/fill-slot", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError("Invalid creative id", { statusCode: 400, code: "INVALID_CREATIVE_ID" });
    }

    const slot = await getCreativeById(id);
    if (!slot) {
      throw new AppError(`Creative ${id} not found`, { statusCode: 404, code: "CREATIVE_NOT_FOUND" });
    }
    if (!isEmptyCreativeSlot(slot)) {
      throw new AppError("Creative is not an empty slot", { statusCode: 400, code: "NOT_EMPTY_SLOT" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceCreativeId = Number(body.sourceCreativeId);
    if (!Number.isInteger(sourceCreativeId) || sourceCreativeId <= 0) {
      throw new AppError("sourceCreativeId is required", { statusCode: 400, code: "MISSING_SOURCE_CREATIVE_ID" });
    }

    const source = await getCreativeById(sourceCreativeId);
    if (!source) {
      throw new AppError(`Creative ${sourceCreativeId} not found`, { statusCode: 404, code: "SOURCE_CREATIVE_NOT_FOUND" });
    }
    if (isEmptyCreativeSlot(source)) {
      throw new AppError("Choose an uploaded asset to fill the slot", { statusCode: 400, code: "SOURCE_ASSET_REQUIRED" });
    }
    if (source.notion_task_id !== slot.notion_task_id) {
      throw new AppError("Asset must belong to the same task as the empty slot", {
        statusCode: 400,
        code: "SOURCE_TASK_MISMATCH"
      });
    }
    const fillableStatuses: string[] = [DB_STATUS.READY_TO_LAUNCH, DB_STATUS.LAUNCH_FAILED];
    if (!fillableStatuses.includes(source.status)) {
      throw new AppError("Asset is not ready to be added to this set", { statusCode: 400, code: "SOURCE_STATUS_INVALID" });
    }

    await updateCreativeGrouping(source.id, {
      creativeGroupKey: slot.creative_group_key,
      creativeGroupName: slot.creative_group_name,
      assetPlacement: slot.asset_placement
    });
    await updateCreativeDetails(source.id, {
      projectType: slot.project_type,
      adText: slot.ad_text,
      headline: slot.headline,
      headlineVariants: slot.headline_variants ?? [],
      adTextVariants: slot.ad_text_variants ?? [],
      ctaType: slot.cta_type,
      ctaTypeVariants: slot.cta_type_variants ?? [],
      ctaLink: slot.cta_link,
      audience: slot.audience,
      location: slot.location,
      campaignId: slot.campaign_id,
      campaignName: slot.campaign_name,
      adSetId: slot.adset_id,
      adSetName: slot.adset_name
    });
    await updateCreativeStatus(slot.id, DB_STATUS.CANCELED);

    const groupId = creativeGroupId(slot.notion_task_id, slot.creative_group_key);
    res.json({ group: await getCreativeGroupById(groupId, [DB_STATUS.READY_TO_LAUNCH, DB_STATUS.LAUNCH_FAILED]) });
  } catch (error) {
    next(error);
  }
});

creativesRouter.post("/:id/ready", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError("Invalid creative id", { statusCode: 400, code: "INVALID_CREATIVE_ID" });
    }

    const existing = await getCreativeById(id);
    if (!existing) {
      throw new AppError(`Creative ${id} not found`, { statusCode: 404, code: "CREATIVE_NOT_FOUND" });
    }
    if (existing.status !== DB_STATUS.CANCELED) {
      throw new AppError("Only archived creatives can be moved to Ready", {
        statusCode: 400,
        code: "CREATIVE_NOT_ARCHIVED"
      });
    }
    if (isEmptyCreativeSlot(existing)) {
      throw new AppError("Only uploaded assets can be moved to Ready", {
        statusCode: 400,
        code: "CREATIVE_ASSET_REQUIRED"
      });
    }

    const grouping = creativeGroupingForFileName(existing.source_file_name ?? `creative_${existing.id}`);
    await updateCreativeGrouping(id, {
      creativeGroupKey: grouping.groupKey,
      creativeGroupName: grouping.groupName,
      assetPlacement: grouping.placement === "unknown" ? existing.asset_placement : grouping.placement
    });

    const creative = await updateCreativeStatus(id, DB_STATUS.READY_TO_LAUNCH);
    res.json({ creative });
  } catch (error) {
    next(error);
  }
});

creativesRouter.post("/:id/copy-suggestions", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError("Invalid creative id", { statusCode: 400, code: "INVALID_CREATIVE_ID" });
    }

    const creative = await getCreativeById(id);
    if (!creative) {
      throw new AppError(`Creative ${id} not found`, { statusCode: 404, code: "CREATIVE_NOT_FOUND" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const text = (name: string) => (typeof body[name] === "string" ? body[name].trim() || null : undefined);
    const suggestions = await generateCreativeCopy({
      creative,
      projectType: text("projectType"),
      adText: text("adText"),
      headline: text("headline"),
      headlineVariants: cleanTextSequence(body.headlineVariants),
      adTextVariants: cleanTextSequence(body.adTextVariants),
      ctaType: text("ctaType"),
      ctaTypeVariants: normalizeCtaTypeSequence(body.ctaTypeVariants),
      ctaLink: text("ctaLink"),
      audience: text("audience"),
      location: text("location")
    });

    res.json({ suggestions });
  } catch (error) {
    next(error);
  }
});

creativesRouter.post("/:id/archive", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError("Invalid creative id", { statusCode: 400, code: "INVALID_CREATIVE_ID" });
    }

    const existing = await getCreativeById(id);
    if (!existing) {
      throw new AppError(`Creative ${id} not found`, { statusCode: 404, code: "CREATIVE_NOT_FOUND" });
    }

    const creative = await updateCreativeStatus(id, DB_STATUS.CANCELED);
    res.json({ creative });
  } catch (error) {
    next(error);
  }
});

creativesRouter.post("/groups/:groupId/archive", requireAuth, async (req, res, next) => {
  try {
    const group = await getCreativeGroupById(req.params.groupId, [DB_STATUS.READY_TO_LAUNCH, DB_STATUS.LAUNCH_FAILED]);
    if (!group) {
      throw new AppError("Creative group not found", { statusCode: 404, code: "CREATIVE_GROUP_NOT_FOUND" });
    }

    for (const creative of group.creatives) {
      await updateCreativeStatus(creative.id, DB_STATUS.CANCELED);
    }

    res.json({ group: await getCreativeGroupById(req.params.groupId) });
  } catch (error) {
    next(error);
  }
});

creativesRouter.get("/launched", requireAuth, async (_req, res, next) => {
  try {
    const creatives = await listCreatives([DB_STATUS.LAUNCHED]);
    res.json({ creatives });
  } catch (error) {
    next(error);
  }
});

creativesRouter.post("/upload", requireAuth, async (req, res, next) => {
  try {
    const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim() : "";
    const dataBase64 = typeof req.body?.dataBase64 === "string" ? req.body.dataBase64 : "";

    if (!fileName || !mimeType || !dataBase64) {
      throw new AppError("fileName, mimeType and dataBase64 are required", {
        statusCode: 400,
        code: "MISSING_UPLOAD_FIELDS"
      });
    }

    const buffer = Buffer.from(dataBase64, "base64");
    if (!buffer.length) {
      throw new AppError("Uploaded file is empty", { statusCode: 400, code: "EMPTY_UPLOAD" });
    }

    const uploaded = await uploadCreativeAsset(
      {
        fileId: `manual:${Date.now()}:${fileName}`,
        fileName,
        mimeType,
        buffer,
        size: buffer.length
      },
      req.id as string | undefined
    );
    const sourceFileId = `manual:${uploaded.assetId}`;
    const grouping = creativeGroupingForFileName(fileName);
    const creative = await upsertCreative({
      notionTaskId: `manual-upload:${sourceFileId}`,
      sourceFileId,
      sourceFileName: fileName,
      creativeGroupKey: grouping.groupKey,
      creativeGroupName: grouping.groupName,
      assetPlacement: grouping.placement,
      status: DB_STATUS.READY_TO_LAUNCH,
      assetId: uploaded.assetId,
      assetType: uploaded.assetType,
      previewUrl: uploaded.previewUrl,
      uploadedAt: new Date(),
      projectType: typeof req.body?.projectType === "string" ? req.body.projectType.trim() : undefined,
      adText: typeof req.body?.adText === "string" ? req.body.adText.trim() : undefined,
      headline: typeof req.body?.headline === "string" ? req.body.headline.trim() : undefined,
      headlineVariants: Array.isArray(req.body?.headlineVariants) ? cleanTextSequence(req.body.headlineVariants) : undefined,
      adTextVariants: Array.isArray(req.body?.adTextVariants) ? cleanTextSequence(req.body.adTextVariants) : undefined,
      ctaType: typeof req.body?.ctaType === "string" ? normalizeCtaType(req.body.ctaType) : undefined,
      ctaTypeVariants: Array.isArray(req.body?.ctaTypeVariants) ? normalizeCtaTypeSequence(req.body.ctaTypeVariants) : undefined,
      ctaLink: typeof req.body?.ctaLink === "string" ? req.body.ctaLink.trim() : undefined
    });

    res.status(201).json({ creative });
  } catch (error) {
    next(error);
  }
});
