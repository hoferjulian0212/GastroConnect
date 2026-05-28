ALTER TYPE "public"."notification_type" ADD VALUE 'monthly_report';--> statement-breakpoint
CREATE TABLE "monthly_reports" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"month" varchar(7) NOT NULL,
	"file_url" text,
	"total_spent" numeric(12, 2) NOT NULL,
	"prev_month_total" numeric(12, 2) NOT NULL,
	"savings_potential" numeric(12, 2) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "monthly_report_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_monthly_reports_restaurant_id" ON "monthly_reports" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_monthly_reports_restaurant_month" ON "monthly_reports" USING btree ("restaurant_id","month");