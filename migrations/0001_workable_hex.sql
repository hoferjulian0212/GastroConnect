ALTER TABLE "complaints" ADD COLUMN "complaint_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_notes" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "article_number" text;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "user_id" varchar(36);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "user_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "monthly_revenue_target" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_complaints_complaint_number" ON "complaints" USING btree ("complaint_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_orders_order_number" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_products_supplier_article" ON "products" USING btree ("supplier_id","article_number");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_user_id" ON "stock_movements" USING btree ("user_id");