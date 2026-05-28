CREATE TABLE "price_change_log" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"user_name" text,
	"old_price" numeric(10, 2),
	"new_price" numeric(10, 2),
	"old_min_order_quantity" integer,
	"new_min_order_quantity" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_ratings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"flagged_at" timestamp,
	"flagged_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dashboard_widgets" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dismissed_help_topics" jsonb;--> statement-breakpoint
ALTER TABLE "price_change_log" ADD CONSTRAINT "price_change_log_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_log" ADD CONSTRAINT "price_change_log_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_log" ADD CONSTRAINT "price_change_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ratings" ADD CONSTRAINT "supplier_ratings_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_price_change_log_product_id" ON "price_change_log" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_price_change_log_supplier_id" ON "price_change_log" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_price_change_log_created_at" ON "price_change_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_supplier_ratings_order_id" ON "supplier_ratings" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_ratings_supplier_id" ON "supplier_ratings" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_supplier_ratings_restaurant_id" ON "supplier_ratings" USING btree ("restaurant_id");