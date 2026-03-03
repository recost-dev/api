import type { ErrorHandler, NotFoundHandler } from "hono";
import type { ApiErrorBody } from "../models/types";
import { AppError } from "../utils/app-error";

export const notFoundHandler: NotFoundHandler = (c) => {
  const body: ApiErrorBody = {
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "Route not found",
      status: 404
    }
  };
  return c.json(body, 404);
};

export const errorHandler: ErrorHandler = (err, c) => {
  const appError =
    err instanceof AppError
      ? err
      : err instanceof SyntaxError
        ? new AppError("MALFORMED_JSON", "Malformed JSON request body", 400)
        : new AppError("INTERNAL_SERVER_ERROR", "An unexpected error occurred", 500);

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      status: appError.status,
      ...(appError.details !== undefined ? { details: appError.details } : {})
    }
  };

  return c.json(body, appError.status as Parameters<typeof c.json>[1]);
};
