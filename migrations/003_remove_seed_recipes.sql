-- Seed recipes were created before the first account and later assigned to it.
-- Remove both unowned recipes and recipes created before the first account.
DELETE FROM recipes
WHERE user_id IS NULL
   OR created_at < (SELECT MIN(created_at) FROM users);
