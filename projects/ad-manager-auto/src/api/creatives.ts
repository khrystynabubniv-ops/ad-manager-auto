import { Router } from "express";
import { DB_STATUS } from "../config/statuses.js";
import { requireAuth } from "../middleware/auth.js";
import { getCreativeById, listCreatives, updateCreativeDetails, upsertCreative } from "../services/db.js";
import { getFacebookAdSet, uploadCreativeAsset } from "../services/facebook.js";
import { AppError } from "../utils/errors.js";

export const creativesRouter = Router();

creativesRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const statuses =
      status === "launched"
        ? [DB_STATUS.LAUNCHED]
        : status
          ? [status]
          : [DB_STATUS.READY_TO_LAUNCH];
    const creatives = await listCreatives(statuses);
    res.json({ creatives });
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
    const nextText = (name: string, current: string | null) => {
      const value = optionalText(name);
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
    const creative = await upsertCreative({
      notionTaskId: `manual-upload:${sourceFileId}`,
      sourceFileId,
      sourceFileName: fileName,
      status: DB_STATUS.READY_TO_LAUNCH,
      assetId: uploaded.assetId,
      assetType: uploaded.assetType,
      previewUrl: uploaded.previewUrl,
      uploadedAt: new Date(),
      projectType: typeof req.body?.projectType === "string" ? req.body.projectType.trim() : undefined,
      adText: typeof req.body?.adText === "string" ? req.body.adText.trim() : undefined,
      ctaLink: typeof req.body?.ctaLink === "string" ? req.body.ctaLink.trim() : undefined
    });

    res.status(201).json({ creative });
  } catch (error) {
    next(error);
  }
});
