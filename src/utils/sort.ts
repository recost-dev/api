import { SortOrder } from "../models/types";
import { AppError } from "./app-error";

export const parseOrder = (raw: unknown): SortOrder => {
  if (raw === undefined) return "asc";
  if (raw === "asc" || raw === "desc") return raw;
  throw new AppError("INVALID_SORT_ORDER", "Query param 'order' must be 'asc' or 'desc'", 422);
};

export const compareValues = <T>(
  a: T,
  b: T,
  order: SortOrder
): number => {
  if (a < b) return order === "asc" ? -1 : 1;
  if (a > b) return order === "asc" ? 1 : -1;
  return 0;
};

