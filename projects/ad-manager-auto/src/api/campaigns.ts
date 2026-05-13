import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { listFacebookAdSets, listFacebookCampaigns } from "../services/facebook.js";
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
