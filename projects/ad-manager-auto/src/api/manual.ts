import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { handleNotionPageChange } from "../services/pipeline.js";
import { AppError } from "../utils/errors.js";

export const manualRouter = Router();

manualRouter.post("/process-notion-page", requireAuth, async (req, res, next) => {
  try {
    const pageId = req.body?.pageId;
    if (!pageId || typeof pageId !== "string") {
      throw new AppError("pageId is required", { statusCode: 400, code: "MISSING_PAGE_ID" });
    }
    const result = await handleNotionPageChange(pageId, req.id as string | undefined);
    res.json({ ok: true, result });
  } catch (error) {
    next(error);
  }
});
