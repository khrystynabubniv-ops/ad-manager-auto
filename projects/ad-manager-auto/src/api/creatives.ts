import { Router } from "express";
import { DB_STATUS } from "../config/statuses.js";
import { requireAuth } from "../middleware/auth.js";
import { listCreatives } from "../services/db.js";

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
