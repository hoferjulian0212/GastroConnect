-- Persist per-user, per-role active dashboard widgets selection
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dashboard_widgets" jsonb;
