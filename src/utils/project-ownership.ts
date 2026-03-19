import { AppError } from "./app-error";

/**
 * Asserts that the given user owns the given project.
 * Admin users (is_admin = 1) bypass the ownership check.
 * Throws 404 (not 403) on failure to avoid leaking project existence.
 */
export async function assertProjectOwnership(
  db: D1Database,
  projectId: string,
  userId: string
): Promise<void> {
  const user = await db
    .prepare("SELECT is_admin FROM users WHERE id = ?")
    .bind(userId)
    .first<{ is_admin: number }>();

  if (user?.is_admin === 1) return;

  const row = await db
    .prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, userId)
    .first<{ id: string }>();

  if (!row) {
    throw new AppError("RESOURCE_NOT_FOUND", `Project '${projectId}' not found`, 404);
  }
}
