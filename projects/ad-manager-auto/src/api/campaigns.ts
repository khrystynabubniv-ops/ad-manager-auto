import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { listFacebookAdSets, listFacebookCampaigns, searchFacebookTargetingLocations } from "../services/facebook.js";
import { syncFacebookCampaigns } from "../services/pipeline.js";

export const campaignsRouter = Router();

campaignsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const campaigns = await listFacebookCampaigns(req.id as string | undefined);
    res.json({ campaigns });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post("/sync", requireAuth, async (req, res, next) => {
  try {
    const campaigns = await syncFacebookCampaigns(req.id as string | undefined);
    res.json({ campaigns });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.get("/targeting/locations", requireAuth, async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const locationTypes =
      typeof req.query.locationTypes === "string"
        ? req.query.locationTypes
            .split(",")
            .map((type) => type.trim())
            .filter(Boolean)
        : undefined;
    const countryCode = typeof req.query.countryCode === "string" ? req.query.countryCode.trim() : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    const locations = await searchFacebookTargetingLocations({
      query: q,
      locationTypes,
      countryCode,
      limit: Number.isFinite(limit) ? limit : undefined,
      requestId: req.id as string | undefined
    });
    res.json({ locations });
  } catch (error) {
    next(error);
  }
});

campaignsRouter.get("/:campaignId/adsets", requireAuth, async (req, res, next) => {
  try {
    const adsets = await listFacebookAdSets({
      campaignId: req.params.campaignId,
      requestId: req.id as string | undefined
    });
    res.json({ adsets });
  } catch (error) {
    next(error);
  }
});
