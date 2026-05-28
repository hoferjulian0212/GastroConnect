ALTER TYPE "public"."message_type" ADD VALUE 'voice';--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "pinned_by_restaurant" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "pinned_by_supplier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "audio_url" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "audio_duration_ms" integer;