import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { launchCreative, launchCreativeGroup } from "../services/pipeline.js";
import { cleanTextSequence, normalizeCtaType, normalizeCtaTypeSequence } from "../shared/creativeCopy.js";
import { AppError } from "../utils/errors.js";

export const launchRouter = Router();

function launchBody(body: Record<string, unknown>) {
  const stringField = (name: string) => (typeof body[name] === "string" ? body[name] : undefined);
  const ctaType = typeof body.ctaType === "string" ? normalizeCtaType(body.ctaType) : undefined;
  return {
    campaignId: stringField("campaignId"),
    campaignName: stringField("campaignName"),
    adSetId: stringField("adSetId"),
    adSetName: stringField("adSetName"),
    projectType: stringField("projectType"),
    adText: stringField("adText"),
    headline: stringField("headline"),
    headlineVariants: Array.isArray(body.headlineVariants) ? cleanTextSequence(body.headlineVariants) : undefined,
    adTextVariants: Array.isArray(body.adTextVariants) ? cleanTextSequence(body.adTextVariants) : undefined,
    ctaType,
    ctaTypeVariants: Array.isArray(body.ctaTypeVariants) ? normalizeCtaTypeSequence(body.ctaTypeVariants) : undefined,
    ctaLink: stringField("ctaLink"),
    audience: stringField("audience"),
    location: stringField("location")
  };
}

launchRouter.post("/groups/:groupId", requireAuth, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const group = await launchCreativeGroup(req.params.groupId, launchBody(body), req.id as string | undefined);
    res.json({ group });
  } catch (error) {
    next(error);
  }
});

launchRouter.post("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw new AppError("Invalid creative id", { statusCode: 400, code: "INVALID_CREATIVE_ID" });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const creative = await launchCreative(id, launchBody(body), req.id as string | undefined);
    res.json({ creative });
  } catch (error) {
    next(error);
  }
});
