import { Router } from "express";
import { DB_STATUS } from "../config/statuses.js";
import { requireAuth } from "../middleware/auth.js";
import { listCreatives, upsertCreative } from "../services/db.js";
import { uploadCreativeAsset } from "../services/facebook.js";
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
