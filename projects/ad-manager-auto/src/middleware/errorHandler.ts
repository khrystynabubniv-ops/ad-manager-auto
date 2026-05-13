import { NextFunction, Request, Response } from "express";
import { logger } from "../logger.js";
import { AppError, getErrorMessage } from "../utils/errors.js";

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.id as string | undefined;
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
  const message = getErrorMessage(error);

  logger.error({ requestId, error }, "Request failed");
  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId
    }
  });
}
