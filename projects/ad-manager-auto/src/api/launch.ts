import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { launchCreative } from "../services/pipeline.js";
import { AppError } from "../utils/errors.js";

export const launchRouter = Router();

launchRouter.post("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError("Invalid creative id", { statusCode: 400, code: "INVALID_CREATIVE_ID" });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creative = await launchCreative(
      id,
      {
        campaignId: typeof body.campaignId === "string" ? body.campaignId : undefined,
        campaignName: typeof body.campaignName === "string" ? body.campaignName : undefined,
        adSetId: typeof body.adSetId === "string" ? body.adSetId : undefined,
        adSetName: typeof body.adSetName === "string" ? body.adSetName : undefined
      },
      req.id as string | undefined
    );
    res.json({ creative });
  } catch (error) {
    next(error);
  }
});
