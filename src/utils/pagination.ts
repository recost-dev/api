import { PaginationMeta } from "../models/types";
import { AppError } from "./app-error";

export const parsePagination = (query: Record<string, unknown>): { page: number; limit: number } => {
  const pageRaw = query.page as string | undefined;
  const limitRaw = query.limit as string | undefined;

  const page = pageRaw ? Number(pageRaw) : 1;
  const limit = limitRaw ? Number(limitRaw) : 20;

  if (!Number.isInteger(page) || page < 1) {
    throw new AppError("INVALID_PAGINATION", "Query param 'page' must be an integer >= 1", 422);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("INVALID_PAGINATION", "Query param 'limit' must be an integer between 1 and 100", 422);
  }

  return { page, limit };
};

export const buildPaginationMeta = (
  page: number,
  limit: number,
  total: number
): PaginationMeta => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
};

export const paginate = <T>(items: T[], page: number, limit: number): T[] => {
  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
};

