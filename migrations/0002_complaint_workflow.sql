-- Add complaint reason enum
CREATE TYPE "public"."complaint_reason" AS ENUM('damaged', 'short', 'wrong', 'quality', 'late', 'other');--> statement-breakpoint

-- Extend complaint_status enum with new statuses
ALTER TYPE "public"."complaint_status" ADD VALUE IF NOT EXISTS 'rejected';--> statement-breakpoint
ALTER TYPE "public"."complaint_status" ADD VALUE IF NOT EXISTS 'partially_resolved';--> statement-breakpoint

-- Add new columns to complaints
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "reason" "complaint_reason";--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN IF NOT EXISTS "last_reminder_at" timestamp;
