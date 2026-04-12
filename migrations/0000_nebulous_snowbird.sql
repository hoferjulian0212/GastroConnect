CREATE TYPE "public"."complaint_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('delivery_note', 'invoice', 'other');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'order', 'complaint', 'confirmation', 'delivery_status', 'document', 'attachment', 'order_change_request', 'promotion');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('new_message', 'new_order', 'order_status', 'new_complaint', 'complaint_comment', 'low_stock');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'partially_confirmed', 'in_delivery', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('manual_in', 'manual_out', 'order_confirmed', 'order_reversed', 'order_cancelled', 'manual_set');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('restaurant', 'supplier');--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"product_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaint_comments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaint_status_history" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" varchar(36) NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"media_urls" text[] DEFAULT '{}',
	"affected_items" text,
	"status" "complaint_status" DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'standard' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_settings" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"target_cost_per_guest" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_min_order_quantities" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"min_order_quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_prices" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"custom_price" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_schedules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"day_of_week" integer NOT NULL,
	"delivery_time_from" varchar(5),
	"delivery_time_to" varchar(5),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"type" "document_type" NOT NULL,
	"title" text NOT NULL,
	"file_url" text NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar(36) NOT NULL,
	"sender_id" varchar(36) NOT NULL,
	"message_type" "message_type" DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"order_id" varchar(36),
	"document_url" text,
	"priority" text DEFAULT 'standard' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minimum_order_values" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"zone" text,
	"minimum_value" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"reference_id" varchar(36),
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"product_id" varchar(36) NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"confirmed_quantity" integer,
	"rejected_quantity" integer,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_template_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar(36) NOT NULL,
	"product_id" varchar(36) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"created_by_user_id" varchar(36),
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"notes" text,
	"requested_delivery_date" text,
	"original_delivery_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overnight_stays" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" varchar(36) NOT NULL,
	"date" varchar(10) NOT NULL,
	"overnight_stays" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"unit" text DEFAULT 'piece' NOT NULL,
	"category" text,
	"in_stock" boolean DEFAULT true NOT NULL,
	"stock_quantity" integer DEFAULT 0,
	"low_stock_threshold" integer DEFAULT 0,
	"min_order_quantity" integer DEFAULT 1 NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"discount_percent" integer NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"name" text,
	"description" text,
	"group_id" varchar(36),
	"target_restaurant_ids" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(36) NOT NULL,
	"supplier_id" varchar(36) NOT NULL,
	"order_id" varchar(36),
	"type" "stock_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"previous_stock" integer NOT NULL,
	"new_stock" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"address" text,
	"city" text,
	"postal_code" text,
	"company_name" text,
	"description" text,
	"profile_image_url" text,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_status_history" ADD CONSTRAINT "complaint_status_history_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_status_history" ADD CONSTRAINT "complaint_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_settings" ADD CONSTRAINT "cost_settings_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_min_order_quantities" ADD CONSTRAINT "custom_min_order_quantities_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_min_order_quantities" ADD CONSTRAINT "custom_min_order_quantities_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_min_order_quantities" ADD CONSTRAINT "custom_min_order_quantities_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_prices" ADD CONSTRAINT "custom_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_prices" ADD CONSTRAINT "custom_prices_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_prices" ADD CONSTRAINT "custom_prices_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_schedules" ADD CONSTRAINT "delivery_schedules_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_schedules" ADD CONSTRAINT "delivery_schedules_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minimum_order_values" ADD CONSTRAINT "minimum_order_values_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_template_items" ADD CONSTRAINT "order_template_items_template_id_order_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."order_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_template_items" ADD CONSTRAINT "order_template_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_templates" ADD CONSTRAINT "order_templates_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overnight_stays" ADD CONSTRAINT "overnight_stays_restaurant_id_users_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplier_id_users_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cart_items_restaurant_id" ON "cart_items" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_cart_items_product_id" ON "cart_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_complaint_comments_complaint_id" ON "complaint_comments" USING btree ("complaint_id");--> statement-breakpoint
CREATE INDEX "idx_complaint_status_history_complaint_id" ON "complaint_status_history" USING btree ("complaint_id");--> statement-breakpoint
CREATE INDEX "idx_complaints_restaurant_id" ON "complaints" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_complaints_supplier_id" ON "complaints" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_complaints_order_id" ON "complaints" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_restaurant_id" ON "conversations" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_supplier_id" ON "conversations" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_restaurant_supplier" ON "conversations" USING btree ("restaurant_id","supplier_id");--> statement-breakpoint
CREATE INDEX "idx_cost_settings_restaurant_id" ON "cost_settings" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_custom_moq_product_restaurant" ON "custom_min_order_quantities" USING btree ("product_id","restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_custom_moq_supplier" ON "custom_min_order_quantities" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_custom_prices_product_restaurant" ON "custom_prices" USING btree ("product_id","restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_custom_prices_supplier" ON "custom_prices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_delivery_schedules_supplier_restaurant" ON "delivery_schedules" USING btree ("supplier_id","restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_documents_order_id" ON "documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_documents_restaurant_id" ON "documents" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_documents_supplier_id" ON "documents" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_created" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_sender_id" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_messages_is_read" ON "messages" USING btree ("conversation_id","sender_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_minimum_order_values_supplier_id" ON "minimum_order_values" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_read" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_order_items_order_id" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_product_id" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_order_status_history_order_id" ON "order_status_history" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_template_items_template_id" ON "order_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_order_templates_restaurant_id" ON "order_templates" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_orders_restaurant_id" ON "orders" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_orders_supplier_id" ON "orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_overnight_stays_restaurant_date" ON "overnight_stays" USING btree ("restaurant_id","date");--> statement-breakpoint
CREATE INDEX "idx_products_supplier_id" ON "products" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_promotions_supplier_id" ON "promotions" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_promotions_product_id" ON "promotions" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_promotions_active" ON "promotions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_push_subscriptions_user_id" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_product_id" ON "stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_supplier_id" ON "stock_movements" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_order_id" ON "stock_movements" USING btree ("order_id");