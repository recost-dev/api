export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const notFound = (resource: string, id: string): AppError =>
  new AppError(
    "RESOURCE_NOT_FOUND",
    `${resource} with id '${id}' not found`,
    404
  );

