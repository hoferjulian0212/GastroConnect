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
ALTER TABLE "price_change_log" ADD CONSTRAINT "price_change_log_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_log" ADD CONSTRAINT "price_change_log_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_change_log" ADD CONSTRAINT "price_change_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_price_change_log_product_id" ON "price_change_log" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_price_change_log_supplier_id" ON "price_change_log" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_price_change_log_created_at" ON "price_change_log" USING btree ("created_at");
