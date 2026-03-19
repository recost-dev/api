-- Assign any seed/demo projects with user_id = NULL to the local admin user.
-- This prevents existing data from becoming inaccessible after project scoping is enforced.
UPDATE projects
SET user_id = (SELECT id FROM users WHERE is_admin = 1 LIMIT 1)
WHERE user_id IS NULL;
