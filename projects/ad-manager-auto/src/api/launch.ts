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
    const stringField = (name: string) => (typeof body[name] === "string" ? body[name] : undefined);
    const creative = await launchCreative(
      id,
      {
        campaignId: stringField("campaignId"),
        campaignName: stringField("campaignName"),
        adSetId: stringField("adSetId"),
        adSetName: stringField("adSetName"),
        projectType: stringField("projectType"),
        adText: stringField("adText"),
        ctaLink: stringField("ctaLink"),
        audience: stringField("audience"),
        location: stringField("location")
      },
      req.id as string | undefined
    );
    res.json({ creative });
  } catch (error) {
    next(error);
  }
});
