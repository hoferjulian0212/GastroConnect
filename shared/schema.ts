import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, pgEnum, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["restaurant", "supplier"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "order", "complaint", "confirmation", "delivery_status", "document", "attachment", "order_change_request", "promotion", "voice"]);
export const notificationTypeEnum = pgEnum("notification_type", ["new_message", "new_order", "order_status", "new_complaint", "complaint_comment", "low_stock", "monthly_report", "pms_request", "erp_request"]);
export const documentTypeEnum = pgEnum("document_type", ["delivery_note", "invoice", "other"]);
export const complaintStatusEnum = pgEnum("complaint_status", ["open", "in_progress", "resolved", "closed", "rejected", "partially_resolved"]);
export const complaintReasonEnum = pgEnum("complaint_reason", ["damaged", "short", "wrong", "quality", "late", "other"]);

export const COMPLAINT_REASONS = ["damaged", "short", "wrong", "quality", "late", "other"] as const;
export type ComplaintReason = typeof COMPLAINT_REASONS[number];

export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["manual_in", "manual_out", "order_confirmed", "order_reversed", "order_cancelled", "manual_set", "order_reserved", "order_returned", "order_outbounded"]);

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  role: userRoleEnum("role").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  companyName: text("company_name"),
  description: text("description"),
  profileImageUrl: text("profile_image_url"),
  lastSeenAt: timestamp("last_seen_at"),
  monthlyRevenueTarget: decimal("monthly_revenue_target", { precision: 12, scale: 2 }),
  dashboardLayouts: jsonb("dashboard_layouts").$type<Record<string, Array<{ id: string; size: "full" | "half" }>>>(),
  dashboardWidgets: jsonb("dashboard_widgets").$type<Record<string, string[]>>(),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  dismissedHelpTopics: jsonb("dismissed_help_topics").$type<string[]>(),
  seenPageIntros: jsonb("seen_page_intros").$type<string[]>(),
  skipAllPageIntros: boolean("skip_all_page_intros").default(false).notNull(),
  monthlyReportOptOut: boolean("monthly_report_opt_out").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DashboardCardSize = "full" | "half";
export interface DashboardLayoutItem {
  id: string;
  size: DashboardCardSize;
}
export const dashboardLayoutItemSchema = z.object({
  id: z.string().min(1).max(100),
  size: z.enum(["full", "half"]),
});
export const dashboardLayoutSchema = z.array(dashboardLayoutItemSchema).max(50);

export const dashboardWidgetsSchema = z.array(z.string().min(1).max(100)).max(50);

export const products = pgTable("products", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  articleNumber: text("article_number"),
  gtin: text("gtin"),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("piece"),
  category: text("category"),
  inStock: boolean("in_stock").default(true).notNull(),
  stockQuantity: integer("stock_quantity").default(0),
  reservedQuantity: integer("reserved_quantity").default(0).notNull(),
  lowStockThreshold: integer("low_stock_threshold").default(0),
  minOrderQuantity: integer("min_order_quantity").default(1).notNull(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_products_supplier_id").on(table.supplierId),
  index("idx_products_category").on(table.category),
  index("idx_products_gtin").on(table.gtin),
  uniqueIndex("uniq_products_supplier_article").on(table.supplierId, table.articleNumber),
]);

export const customMinOrderQuantities = pgTable("custom_min_order_quantities", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  minOrderQuantity: integer("min_order_quantity").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_custom_moq_product_restaurant").on(table.productId, table.restaurantId),
  index("idx_custom_moq_supplier").on(table.supplierId),
]);

export const customPrices = pgTable("custom_prices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  customPrice: decimal("custom_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_custom_prices_product_restaurant").on(table.productId, table.restaurantId),
  index("idx_custom_prices_supplier").on(table.supplierId),
]);

export const orders = pgTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number"),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id),
  status: orderStatusEnum("status").default("pending").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  deliveryNotes: text("delivery_notes"),
  requestedDeliveryDate: text("requested_delivery_date"),
  originalDeliveryDate: text("original_delivery_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_orders_restaurant_id").on(table.restaurantId),
  index("idx_orders_supplier_id").on(table.supplierId),
  index("idx_orders_status").on(table.status),
  index("idx_orders_created_at").on(table.createdAt),
  uniqueIndex("uniq_orders_order_number").on(table.orderNumber),
]);

export const orderItems = pgTable("order_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  confirmedQuantity: integer("confirmed_quantity"),
  rejectedQuantity: integer("rejected_quantity"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
}, (table) => [
  index("idx_order_items_order_id").on(table.orderId),
  index("idx_order_items_product_id").on(table.productId),
]);

export const cartItems = pgTable("cart_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_cart_items_restaurant_id").on(table.restaurantId),
  index("idx_cart_items_product_id").on(table.productId),
]);

export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  pinnedByRestaurant: boolean("pinned_by_restaurant").default(false).notNull(),
  pinnedBySupplier: boolean("pinned_by_supplier").default(false).notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_conversations_restaurant_id").on(table.restaurantId),
  index("idx_conversations_supplier_id").on(table.supplierId),
  index("idx_conversations_restaurant_supplier").on(table.restaurantId, table.supplierId),
]);

export const messages = pgTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id),
  senderId: varchar("sender_id", { length: 36 }).notNull().references(() => users.id),
  messageType: messageTypeEnum("message_type").default("text").notNull(),
  content: text("content").notNull(),
  orderId: varchar("order_id", { length: 36 }).references(() => orders.id),
  documentUrl: text("document_url"),
  audioUrl: text("audio_url"),
  audioDurationMs: integer("audio_duration_ms"),
  priority: text("priority").default("standard").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  dismissed: boolean("dismissed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_messages_conversation_id").on(table.conversationId),
  index("idx_messages_conversation_created").on(table.conversationId, table.createdAt),
  index("idx_messages_sender_id").on(table.senderId),
  index("idx_messages_is_read").on(table.conversationId, table.senderId, table.isRead),
]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: varchar("changed_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_order_status_history_order_id").on(table.orderId),
]);

export const complaints = pgTable("complaints", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  complaintNumber: text("complaint_number"),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  mediaUrls: text("media_urls").array().default([]),
  affectedItems: text("affected_items"),
  status: complaintStatusEnum("status").default("open").notNull(),
  priority: text("priority").default("standard").notNull(),
  reason: complaintReasonEnum("reason"),
  rejectionReason: text("rejection_reason"),
  lastReminderAt: timestamp("last_reminder_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_complaints_restaurant_id").on(table.restaurantId),
  index("idx_complaints_supplier_id").on(table.supplierId),
  index("idx_complaints_order_id").on(table.orderId),
  uniqueIndex("uniq_complaints_complaint_number").on(table.complaintNumber),
]);

export const complaintComments = pgTable("complaint_comments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  complaintId: varchar("complaint_id", { length: 36 }).notNull().references(() => complaints.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_complaint_comments_complaint_id").on(table.complaintId),
]);

export const complaintStatusHistory = pgTable("complaint_status_history", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  complaintId: varchar("complaint_id", { length: 36 }).notNull().references(() => complaints.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: varchar("changed_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_complaint_status_history_complaint_id").on(table.complaintId),
]);

export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  referenceId: varchar("reference_id", { length: 36 }),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notifications_user_id").on(table.userId),
  index("idx_notifications_user_read").on(table.userId, table.isRead),
]);

export const documents = pgTable("documents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  type: documentTypeEnum("type").notNull(),
  title: text("title").notNull(),
  fileUrl: text("file_url").notNull(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_documents_order_id").on(table.orderId),
  index("idx_documents_restaurant_id").on(table.restaurantId),
  index("idx_documents_supplier_id").on(table.supplierId),
]);

export const deliverySchedules = pgTable("delivery_schedules", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  dayOfWeek: integer("day_of_week").notNull(),
  deliveryTimeFrom: varchar("delivery_time_from", { length: 5 }),
  deliveryTimeTo: varchar("delivery_time_to", { length: 5 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_delivery_schedules_supplier_restaurant").on(table.supplierId, table.restaurantId),
]);

export const promotions = pgTable("promotions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  discountPercent: integer("discount_percent").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  name: text("name"),
  description: text("description"),
  groupId: varchar("group_id", { length: 36 }),
  targetRestaurantIds: text("target_restaurant_ids").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_promotions_supplier_id").on(table.supplierId),
  index("idx_promotions_product_id").on(table.productId),
  index("idx_promotions_active").on(table.isActive),
]);

export const stockMovements = pgTable("stock_movements", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  orderId: varchar("order_id", { length: 36 }).references(() => orders.id),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  userName: text("user_name"),
  type: stockMovementTypeEnum("type").notNull(),
  quantity: integer("quantity").notNull(),
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_stock_movements_product_id").on(table.productId),
  index("idx_stock_movements_supplier_id").on(table.supplierId),
  index("idx_stock_movements_order_id").on(table.orderId),
  index("idx_stock_movements_user_id").on(table.userId),
]);

export const orderTemplates = pgTable("order_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  name: text("name").notNull(),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_order_templates_restaurant_id").on(table.restaurantId),
]);

export const orderTemplateItems = pgTable("order_template_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id", { length: 36 }).notNull().references(() => orderTemplates.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  quantity: integer("quantity").notNull().default(1),
}, (table) => [
  index("idx_order_template_items_template_id").on(table.templateId),
]);

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, dashboardLayouts: true, dashboardWidgets: true, onboardingCompletedAt: true, dismissedHelpTopics: true, seenPageIntros: true, skipAllPageIntros: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertCartItemSchema = createInsertSchema(cartItems).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true, lastMessageAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true, isRead: true });
export const insertComplaintSchema = createInsertSchema(complaints).omit({ id: true, createdAt: true, updatedAt: true, status: true }).extend({
  reason: z.enum(["damaged", "short", "wrong", "quality", "late", "other"]),
});
export const updateComplaintSchema = createInsertSchema(complaints).omit({ id: true, createdAt: true, updatedAt: true, orderId: true, restaurantId: true, supplierId: true }).partial();
export const insertComplaintCommentSchema = createInsertSchema(complaintComments).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, isRead: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export const insertOrderStatusHistorySchema = createInsertSchema(orderStatusHistory).omit({ id: true, createdAt: true });
export const insertComplaintStatusHistorySchema = createInsertSchema(complaintStatusHistory).omit({ id: true, createdAt: true });
export const insertDeliveryScheduleSchema = createInsertSchema(deliverySchedules).omit({ id: true, createdAt: true });
export const insertPromotionSchema = createInsertSchema(promotions).omit({ id: true, createdAt: true });
export const insertCustomMinOrderQuantitySchema = createInsertSchema(customMinOrderQuantities).omit({ id: true, createdAt: true });
export const insertCustomPriceSchema = createInsertSchema(customPrices).omit({ id: true, createdAt: true });
export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({ id: true, createdAt: true });
export const insertOrderTemplateSchema = createInsertSchema(orderTemplates).omit({ id: true, createdAt: true, updatedAt: true, isFavorite: true });
export const insertOrderTemplateItemSchema = createInsertSchema(orderTemplateItems).omit({ id: true });

export const supplierRatings = pgTable("supplier_ratings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  stars: integer("stars").notNull(),
  comment: text("comment"),
  flaggedAt: timestamp("flagged_at"),
  flaggedReason: text("flagged_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_supplier_ratings_order_id").on(table.orderId),
  index("idx_supplier_ratings_supplier_id").on(table.supplierId),
  index("idx_supplier_ratings_restaurant_id").on(table.restaurantId),
]);

export const insertSupplierRatingSchema = createInsertSchema(supplierRatings).omit({
  id: true, createdAt: true, updatedAt: true, flaggedAt: true, flaggedReason: true,
}).extend({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(280).optional().nullable(),
});

export const updateSupplierRatingSchema = z.object({
  stars: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(280).optional().nullable(),
});

export type SupplierRating = typeof supplierRatings.$inferSelect;
export type InsertSupplierRating = z.infer<typeof insertSupplierRatingSchema>;
export type UpdateSupplierRating = z.infer<typeof updateSupplierRatingSchema>;

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_push_subscriptions_user_id").on(table.userId),
]);

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });

export const overnightStays = pgTable("overnight_stays", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  date: varchar("date", { length: 10 }).notNull(),
  overnightStays: integer("overnight_stays").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_overnight_stays_restaurant_date").on(table.restaurantId, table.date),
]);

export const insertOvernightStaysSchema = createInsertSchema(overnightStays).omit({ id: true, createdAt: true, updatedAt: true });

export const costSettings = pgTable("cost_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  targetCostPerGuest: decimal("target_cost_per_guest", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_cost_settings_restaurant_id").on(table.restaurantId),
]);

export const insertCostSettingsSchema = createInsertSchema(costSettings).omit({ id: true, createdAt: true, updatedAt: true });

export const minimumOrderValues = pgTable("minimum_order_values", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  zone: text("zone"),
  minimumValue: decimal("minimum_value", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_minimum_order_values_supplier_id").on(table.supplierId),
]);

export const insertMinimumOrderValueSchema = createInsertSchema(minimumOrderValues).omit({ id: true, createdAt: true, updatedAt: true });

// ===== PMS (Property Management System) Integration =====
export const pmsConnectionStatusEnum = pgEnum("pms_connection_status", ["pending", "active", "paused", "disconnected", "error"]);
export const pmsRequestStatusEnum = pgEnum("pms_request_status", ["pending", "in_progress", "approved", "rejected", "completed"]);
export const guestCountSourceEnum = pgEnum("guest_count_source", ["manual", "api", "pms", "import"]);

export const PMS_REQUEST_STATUSES = ["pending", "in_progress", "approved", "rejected", "completed"] as const;
export const PMS_SYNC_FEATURES = ["guests", "occupancy", "forecast"] as const;

export const pmsProviders = pgTable("pms_providers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_pms_providers_slug").on(table.slug),
]);

export const hotelPmsConnections = pgTable("hotel_pms_connections", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  providerId: varchar("provider_id", { length: 36 }).notNull().references(() => pmsProviders.id),
  status: pmsConnectionStatusEnum("status").default("pending").notNull(),
  externalHotelId: text("external_hotel_id"),
  lastSyncAt: timestamp("last_sync_at"),
  guestsImported: integer("guests_imported").default(0).notNull(),
  syncGuests: boolean("sync_guests").default(true).notNull(),
  syncOccupancy: boolean("sync_occupancy").default(false).notNull(),
  syncForecast: boolean("sync_forecast").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_hotel_pms_connections_restaurant_id").on(table.restaurantId),
  index("idx_hotel_pms_connections_provider_id").on(table.providerId),
]);

export const pmsConnectionRequests = pgTable("pms_connection_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  providerId: varchar("provider_id", { length: 36 }).references(() => pmsProviders.id),
  pmsName: text("pms_name").notNull(),
  hotelName: text("hotel_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  roomCount: integer("room_count"),
  requestedFeatures: text("requested_features").array(),
  message: text("message"),
  adminNotes: text("admin_notes"),
  status: pmsRequestStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_pms_connection_requests_restaurant_id").on(table.restaurantId),
  index("idx_pms_connection_requests_status").on(table.status),
]);

export const guestCountImports = pgTable("guest_count_imports", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  date: varchar("date", { length: 10 }).notNull(),
  guestCount: integer("guest_count").notNull(),
  source: guestCountSourceEnum("source").default("pms").notNull(),
  providerId: varchar("provider_id", { length: 36 }).references(() => pmsProviders.id),
  externalRef: text("external_ref"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_guest_count_imports_restaurant_date").on(table.restaurantId, table.date),
  uniqueIndex("uniq_guest_count_imports_restaurant_date").on(table.restaurantId, table.date),
]);

export const insertPmsProviderSchema = createInsertSchema(pmsProviders).omit({ id: true, createdAt: true });
export const insertHotelPmsConnectionSchema = createInsertSchema(hotelPmsConnections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPmsConnectionRequestSchema = createInsertSchema(pmsConnectionRequests).omit({ id: true, createdAt: true, updatedAt: true, status: true, adminNotes: true });
export const insertGuestCountImportSchema = createInsertSchema(guestCountImports).omit({ id: true, createdAt: true, updatedAt: true });

export type PmsProvider = typeof pmsProviders.$inferSelect;
export type InsertPmsProvider = z.infer<typeof insertPmsProviderSchema>;
export type HotelPmsConnection = typeof hotelPmsConnections.$inferSelect;
export type InsertHotelPmsConnection = z.infer<typeof insertHotelPmsConnectionSchema>;
export type PmsConnectionRequest = typeof pmsConnectionRequests.$inferSelect;
export type InsertPmsConnectionRequest = z.infer<typeof insertPmsConnectionRequestSchema>;
export type GuestCountImport = typeof guestCountImports.$inferSelect;
export type InsertGuestCountImport = z.infer<typeof insertGuestCountImportSchema>;
export type PmsRequestStatus = typeof PMS_REQUEST_STATUSES[number];

// ===== Supplier ERP integration =====
export const erpConnectionStatusEnum = pgEnum("erp_connection_status", ["pending", "active", "paused", "disconnected", "error"]);
export const erpRequestStatusEnum = pgEnum("erp_request_status", ["pending", "in_progress", "approved", "rejected", "completed"]);
export const erpConnectionMethodEnum = pgEnum("erp_connection_method", ["api", "excel_email", "unsure"]);

export const ERP_REQUEST_STATUSES = ["pending", "in_progress", "approved", "rejected", "completed"] as const;
export const ERP_CONNECTION_METHODS = ["api", "excel_email", "unsure"] as const;

export const erpProviders = pgTable("erp_providers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_erp_providers_slug").on(table.slug),
]);

export const supplierErpConnections = pgTable("supplier_erp_connections", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  providerId: varchar("provider_id", { length: 36 }).notNull().references(() => erpProviders.id),
  status: erpConnectionStatusEnum("status").default("pending").notNull(),
  connectionMethod: erpConnectionMethodEnum("connection_method").default("unsure").notNull(),
  preferredSyncTime: text("preferred_sync_time"),
  externalSupplierId: text("external_supplier_id"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_supplier_erp_connections_supplier_id").on(table.supplierId),
  index("idx_supplier_erp_connections_provider_id").on(table.providerId),
]);

export const erpConnectionRequests = pgTable("erp_connection_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  providerId: varchar("provider_id", { length: 36 }).references(() => erpProviders.id),
  erpName: text("erp_name").notNull(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  productCount: integer("product_count"),
  connectionMethod: erpConnectionMethodEnum("connection_method").default("unsure").notNull(),
  preferredSyncTime: text("preferred_sync_time"),
  message: text("message"),
  adminNotes: text("admin_notes"),
  status: erpRequestStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_erp_connection_requests_supplier_id").on(table.supplierId),
  index("idx_erp_connection_requests_status").on(table.status),
]);

export const insertErpProviderSchema = createInsertSchema(erpProviders).omit({ id: true, createdAt: true });
export const insertSupplierErpConnectionSchema = createInsertSchema(supplierErpConnections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertErpConnectionRequestSchema = createInsertSchema(erpConnectionRequests).omit({ id: true, createdAt: true, updatedAt: true, status: true, adminNotes: true });

export type ErpProvider = typeof erpProviders.$inferSelect;
export type InsertErpProvider = z.infer<typeof insertErpProviderSchema>;
export type SupplierErpConnection = typeof supplierErpConnections.$inferSelect;
export type InsertSupplierErpConnection = z.infer<typeof insertSupplierErpConnectionSchema>;
export type ErpConnectionRequest = typeof erpConnectionRequests.$inferSelect;
export type InsertErpConnectionRequest = z.infer<typeof insertErpConnectionRequestSchema>;
export type ErpRequestStatus = typeof ERP_REQUEST_STATUSES[number];
export type ErpConnectionMethod = typeof ERP_CONNECTION_METHODS[number];

export const confirmOrderItemSchema = z.object({
  orderItemId: z.string(),
  confirmedQuantity: z.number().int().min(0),
});
export const confirmOrderSchema = z.object({
  items: z.array(confirmOrderItemSchema).min(1),
  changedBy: z.string().optional(),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertComplaint = z.infer<typeof insertComplaintSchema>;
export type UpdateComplaint = z.infer<typeof updateComplaintSchema>;
export type Complaint = typeof complaints.$inferSelect;
export type InsertComplaintComment = z.infer<typeof insertComplaintCommentSchema>;
export type ComplaintComment = typeof complaintComments.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertOrderStatusHistory = z.infer<typeof insertOrderStatusHistorySchema>;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
export type InsertComplaintStatusHistory = z.infer<typeof insertComplaintStatusHistorySchema>;
export type ComplaintStatusHistory = typeof complaintStatusHistory.$inferSelect;
export type InsertDeliverySchedule = z.infer<typeof insertDeliveryScheduleSchema>;
export type DeliverySchedule = typeof deliverySchedules.$inferSelect;
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;
export type Promotion = typeof promotions.$inferSelect;
export type InsertCustomMinOrderQuantity = z.infer<typeof insertCustomMinOrderQuantitySchema>;
export type CustomMinOrderQuantity = typeof customMinOrderQuantities.$inferSelect;
export type InsertCustomPrice = z.infer<typeof insertCustomPriceSchema>;
export type CustomPrice = typeof customPrices.$inferSelect;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;

// Extended types for frontend
export type ProductWithSupplier = Product & { supplier: User };
export type OrderItemWithProduct = OrderItem & {
  productImageUrl?: string | null;
  productUnit?: string | null;
};
export type OrderWithDetails = Order & { 
  items: OrderItemWithProduct[];
  restaurant: User;
  supplier: User;
  createdByUser?: User | null;
};
export type MessageWithOrderNumber = Message & { orderNumber?: string | null };
export type ConversationWithUser = Conversation & {
  otherUser: User;
  lastMessage?: MessageWithOrderNumber;
  unreadCount: number;
};
export type CartItemWithProduct = CartItem & { product: Product; supplier: User };
export type ComplaintWithDetails = Complaint & { order: Order; restaurant: User; supplier: User; comments?: ComplaintCommentWithUser[] };
export type ComplaintCommentWithUser = ComplaintComment & { user: User };
export type DocumentWithDetails = Document & { order: Order; restaurant: User; supplier: User };
export type OrderStatusHistoryWithUser = OrderStatusHistory & { changedByUser?: User };
export type ComplaintStatusHistoryWithUser = ComplaintStatusHistory & { changedByUser?: User };
export type PromotionWithProduct = Promotion & { product: Product };
export type ProductWithSupplierAndPromotion = ProductWithSupplier & { activePromotion?: Promotion | null };
export type StockMovementWithProduct = StockMovement & { product: Product };
export type InsertOrderTemplate = z.infer<typeof insertOrderTemplateSchema>;
export type OrderTemplate = typeof orderTemplates.$inferSelect;
export type InsertOrderTemplateItem = z.infer<typeof insertOrderTemplateItemSchema>;
export type OrderTemplateItem = typeof orderTemplateItems.$inferSelect;
export type OrderTemplateItemWithProduct = OrderTemplateItem & { product: Product & { supplier: User } };
export type OrderTemplateWithItems = OrderTemplate & { items: OrderTemplateItemWithProduct[] };
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertOvernightStays = z.infer<typeof insertOvernightStaysSchema>;
export type OvernightStays = typeof overnightStays.$inferSelect;
export type InsertCostSettings = z.infer<typeof insertCostSettingsSchema>;
export type CostSettings = typeof costSettings.$inferSelect;
export type InsertMinimumOrderValue = z.infer<typeof insertMinimumOrderValueSchema>;
export type MinimumOrderValue = typeof minimumOrderValues.$inferSelect;


export const priceChangeLog = pgTable("price_change_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  userName: text("user_name"),
  oldPrice: decimal("old_price", { precision: 10, scale: 2 }),
  newPrice: decimal("new_price", { precision: 10, scale: 2 }),
  oldMinOrderQuantity: integer("old_min_order_quantity"),
  newMinOrderQuantity: integer("new_min_order_quantity"),
  source: text("source").default("manual").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_price_change_log_product_id").on(table.productId),
  index("idx_price_change_log_supplier_id").on(table.supplierId),
  index("idx_price_change_log_created_at").on(table.createdAt),
]);

export const insertPriceChangeLogSchema = createInsertSchema(priceChangeLog).omit({ id: true, createdAt: true });
export type PriceChangeLog = typeof priceChangeLog.$inferSelect;
export type InsertPriceChangeLog = z.infer<typeof insertPriceChangeLogSchema>;

// ─── Monthly comparison reports (Task #45) ──────────────────────────────
export interface MonthlyReportProductRow {
  productKey: string;
  name: string;
  unit: string;
  category: string | null;
  currentSupplierId: string;
  currentSupplierName: string;
  currentUnitPrice: number;
  totalQuantity: number;
  totalSpent: number;
  cheapestSupplierId: string | null;
  cheapestSupplierName: string | null;
  cheapestUnitPrice: number | null;
  potentialSaving: number;
}
export interface MonthlyReportSwitchRecommendation {
  fromSupplierId: string;
  fromSupplierName: string;
  toSupplierId: string;
  toSupplierName: string;
  productCount: number;
  expectedMonthlySaving: number;
  products: Array<{ name: string; unit: string; saving: number }>;
}
export interface MonthlyReportMissedPromotion {
  promotionId: string;
  productName: string;
  unit: string;
  supplierName: string;
  discountPercent: number;
  startDate: string;
  endDate: string;
  estimatedMissedSaving: number;
}
export interface MonthlyReportPayload {
  month: string; // YYYY-MM
  generatedAt: string;
  restaurantName: string;
  totalSpent: number;
  prevMonthTotal: number;
  trendPercent: number;
  orderCount: number;
  topProducts: Array<{ name: string; unit: string; totalSpent: number; totalQuantity: number; supplierName: string }>;
  productRows: MonthlyReportProductRow[];
  totalSavingPotential: number;
  recommendedSwitches: MonthlyReportSwitchRecommendation[];
  missedPromotions: MonthlyReportMissedPromotion[];
}

export const monthlyReports = pgTable("monthly_reports", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  fileUrl: text("file_url"),
  totalSpent: decimal("total_spent", { precision: 12, scale: 2 }).notNull(),
  prevMonthTotal: decimal("prev_month_total", { precision: 12, scale: 2 }).notNull(),
  savingsPotential: decimal("savings_potential", { precision: 12, scale: 2 }).notNull(),
  payload: jsonb("payload").$type<MonthlyReportPayload>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_monthly_reports_restaurant_id").on(table.restaurantId),
  uniqueIndex("uniq_monthly_reports_restaurant_month").on(table.restaurantId, table.month),
]);

export const insertMonthlyReportSchema = createInsertSchema(monthlyReports).omit({ id: true, createdAt: true });
export type MonthlyReport = typeof monthlyReports.$inferSelect;
export type InsertMonthlyReport = z.infer<typeof insertMonthlyReportSchema>;

// ─── Display helpers for business numbers ────────────────────────────────
// Each order/complaint has ONE unique business-facing number that appears
// everywhere in the UI so both parties (restaurant + supplier) reference the
// exact same identifier in chats, documents, and across pages.
export function formatOrderNumber(order: { orderNumber?: string | null; id: string } | null | undefined): string {
  if (!order) return "";
  if (order.orderNumber && order.orderNumber.length > 0) return order.orderNumber;
  return "B-" + order.id.slice(0, 6).toUpperCase();
}

export function formatComplaintNumber(complaint: { complaintNumber?: string | null; id: string } | null | undefined): string {
  if (!complaint) return "";
  if (complaint.complaintNumber && complaint.complaintNumber.length > 0) return complaint.complaintNumber;
  return "R-" + complaint.id.slice(0, 6).toUpperCase();
}
