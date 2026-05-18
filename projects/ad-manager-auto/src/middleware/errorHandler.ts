import { NextFunction, Request, Response } from "express";
import { logger } from "../logger.js";
import { AppError, getErrorMessage } from "../utils/errors.js";

function sanitizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const url = new URL(value);
    url.searchParams.delete("access_token");
    return url.toString();
  } catch {
    return value.replace(/access_token=[^&\s]+/g, "access_token=[redacted]");
  }
}

function sanitizeRequestData(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(/access_token=[^&\s]+/g, "access_token=[redacted]");
}

function loggableError(error: unknown) {
  if (error instanceof AppError) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details
    };
  }

  if (error instanceof Error) {
    const maybeAxios = error as Error & {
      code?: unknown;
      status?: unknown;
      response?: { status?: unknown; data?: unknown };
      config?: { method?: unknown; url?: unknown; data?: unknown };
      isAxiosError?: boolean;
    };

    if (maybeAxios.isAxiosError || maybeAxios.response || maybeAxios.config) {
      return {
        name: error.name,
        message: error.message,
        code: maybeAxios.code,
        status: maybeAxios.response?.status ?? maybeAxios.status,
        response: maybeAxios.response?.data,
        request: maybeAxios.config
          ? {
              method: maybeAxios.config.method,
              url: sanitizeUrl(maybeAxios.config.url),
              data: sanitizeRequestData(maybeAxios.config.data)
            }
          : undefined
      };
    }

    return {
      name: error.name,
      message: error.message
    };
  }

  return error;
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.id as string | undefined;
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
  const message = getErrorMessage(error);

  logger.error({ requestId, error: loggableError(error) }, "Request failed");
  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId
    }
  });
}
