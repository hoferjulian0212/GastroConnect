-- Persist per-user, per-role dashboard card layout
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dashboard_layouts" jsonb;
