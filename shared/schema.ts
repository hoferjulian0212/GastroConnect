import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, pgEnum, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["restaurant", "supplier"]);
export const memberRoleEnum = pgEnum("member_role", ["admin", "manager", "staff", "vertreter"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "order", "complaint", "confirmation", "delivery_status", "document", "attachment", "order_change_request", "promotion", "voice"]);
export const notificationTypeEnum = pgEnum("notification_type", ["new_message", "new_order", "order_status", "new_complaint", "complaint_comment", "low_stock", "monthly_report", "pms_request", "erp_request", "erp_sync_failed", "whatsapp_request"]);
export const documentTypeEnum = pgEnum("document_type", ["delivery_note", "invoice", "other"]);
export const complaintStatusEnum = pgEnum("complaint_status", ["open", "in_progress", "resolved", "closed", "rejected", "partially_resolved"]);
export const complaintReasonEnum = pgEnum("complaint_reason", ["damaged", "short", "wrong", "quality", "late", "other"]);

export const COMPLAINT_REASONS = ["damaged", "short", "wrong", "quality", "late", "other"] as const;
export type ComplaintReason = typeof COMPLAINT_REASONS[number];

export const stockMovementTypeEnum = pgEnum("stock_movement_type", ["manual_in", "manual_out", "order_confirmed", "order_reversed", "order_cancelled", "manual_set", "order_reserved", "order_returned", "order_outbounded", "erp_sync"]);

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  role: userRoleEnum("role").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  whatsappNumber: text("whatsapp_number"),
  address: text("address"),
  city: text("city"),
  postalCode: text("postal_code"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  companyName: text("company_name"),
  description: text("description"),
  profileImageUrl: text("profile_image_url"),
  lastSeenAt: timestamp("last_seen_at"),
  monthlyRevenueTarget: decimal("monthly_revenue_target", { precision: 12, scale: 2 }),
  dashboardLayouts: jsonb("dashboard_layouts").$type<Record<string, Array<{ id: string; size: "full" | "half" }>>>(),
  dashboardWidgets: jsonb("dashboard_widgets").$type<Record<string, string[]>>(),
  dashboardTemplates: jsonb("dashboard_templates").$type<Record<string, { templates: Array<{ id: string; name: string; layout: Array<{ id: string; size: "full" | "half" }>; widgets: string[] }>; activeId: string | null }>>(),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  dismissedHelpTopics: jsonb("dismissed_help_topics").$type<string[]>(),
  seenPageIntros: jsonb("seen_page_intros").$type<string[]>(),
  skipAllPageIntros: boolean("skip_all_page_intros").default(false).notNull(),
  monthlyReportOptOut: boolean("monthly_report_opt_out").default(false).notNull(),
  notificationPrefs: jsonb("notification_prefs").$type<NotificationPrefs>(),
  // Preferred UI language ("de" | "it"), kept in sync from the client so
  // server-generated messages (e.g. ERP sync failure alerts) can be localized.
  language: varchar("language", { length: 2 }).default("de").notNull(),
  // Max number of team members (people) allowed in this organization. Admin-set,
  // no billing. Defaults to 5; backfilled for legacy orgs.
  seatLimit: integer("seat_limit").default(5).notNull(),
  // When set, the organization has been activated (email-confirmed for
  // self-signed-up businesses; backfilled to now for legacy/seeded orgs).
  // Null means a self-registered owner has not yet confirmed their email, so
  // the org is pending and excluded from public directory listings.
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export interface NotificationChannelPrefs {
  newOrder: boolean;
  orderStatus: boolean;
  newMessage: boolean;
  complaint: boolean;
}
export interface NotificationPrefs {
  push: NotificationChannelPrefs;
  email: NotificationChannelPrefs;
}
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: { newOrder: true, orderStatus: true, newMessage: true, complaint: true },
  email: { newOrder: true, orderStatus: true, newMessage: false, complaint: true },
};
const notificationChannelPrefsSchema = z.object({
  newOrder: z.boolean(),
  orderStatus: z.boolean(),
  newMessage: z.boolean(),
  complaint: z.boolean(),
});
export const notificationPrefsSchema = z.object({
  push: notificationChannelPrefsSchema,
  email: notificationChannelPrefsSchema,
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

export interface DashboardTemplate {
  id: string;
  name: string;
  layout: DashboardLayoutItem[];
  widgets: string[];
}
export const dashboardTemplateSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(60),
  layout: dashboardLayoutSchema,
  widgets: dashboardWidgetsSchema,
});
export const dashboardTemplatesSchema = z.array(dashboardTemplateSchema).max(20);
export const dashboardTemplatesPayloadSchema = z.object({
  templates: dashboardTemplatesSchema,
  activeId: z.string().min(1).max(100).nullable().default(null),
}).refine(
  (p) => p.activeId === null || p.templates.some((t) => t.id === p.activeId),
  { message: "activeId must reference an existing template", path: ["activeId"] },
);
export type DashboardTemplatesPayload = z.infer<typeof dashboardTemplatesPayloadSchema>;

// Nutritional values per 100 g / 100 ml ("Nährwerte").
export type ProductNutrition = {
  energyKcal?: number;
  fat?: number;
  saturatedFat?: number;
  carbs?: number;
  sugar?: number;
  protein?: number;
  salt?: number;
};

export const products = pgTable("products", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  articleNumber: text("article_number"),
  gtin: text("gtin"),
  name: text("name").notNull(),
  description: text("description"),
  // Zutaten / ingredients (free text).
  ingredients: text("ingredients"),
  // EU-deklarationspflichtige Allergene, e.g. ["Gluten", "Milch"].
  allergens: text("allergens").array(),
  // Nährwerte per 100 g / 100 ml.
  nutrition: jsonb("nutrition").$type<ProductNutrition>(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("piece"),
  category: text("category"),
  inStock: boolean("in_stock").default(true).notNull(),
  stockQuantity: integer("stock_quantity").default(0),
  reservedQuantity: integer("reserved_quantity").default(0).notNull(),
  lowStockThreshold: integer("low_stock_threshold").default(0),
  minOrderQuantity: integer("min_order_quantity").default(1).notNull(),
  imageUrl: text("image_url"),
  // ERP sync ownership: when true, ERP-owned fields (name, description, unit,
  // category, articleNumber, gtin, price, stockQuantity, inStock,
  // minOrderQuantity) are managed by the supplier's ERP and read-only in the
  // GastroConnect product UI. GastroConnect-owned fields (imageUrl,
  // lowStockThreshold, promotions, per-restaurant prices/MOQ) stay editable.
  erpManaged: boolean("erp_managed").default(false).notNull(),
  // External primary key from the ERP feed (most authoritative match key).
  erpExternalId: text("erp_external_id"),
  // Soft-deactivation: product present in GastroConnect but missing from the
  // latest ERP feed. Never hard-deleted so order history stays intact.
  discontinued: boolean("discontinued").default(false).notNull(),
  lastErpSyncAt: timestamp("last_erp_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_products_supplier_id").on(table.supplierId),
  index("idx_products_category").on(table.category),
  index("idx_products_gtin").on(table.gtin),
  index("idx_products_erp_external").on(table.supplierId, table.erpExternalId),
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
  // Person (member) who placed the order. Falls back to the org (restaurantId)
  // for legacy rows where this is null.
  createdByMemberId: varchar("created_by_member_id", { length: 36 }).references(() => members.id),
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
  // Person (member) who sent the message. Falls back to the org (senderId) for legacy rows.
  senderMemberId: varchar("sender_member_id", { length: 36 }).references(() => members.id),
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
  changedByMemberId: varchar("changed_by_member_id", { length: 36 }).references(() => members.id),
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
  changedByMemberId: varchar("changed_by_member_id", { length: 36 }).references(() => members.id),
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
  complaintId: varchar("complaint_id", { length: 36 }).references(() => complaints.id),
  type: documentTypeEnum("type").notNull(),
  title: text("title").notNull(),
  fileUrl: text("file_url").notNull(),
  isUpload: boolean("is_upload").default(false).notNull(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_documents_order_id").on(table.orderId),
  index("idx_documents_complaint_id").on(table.complaintId),
  index("idx_documents_restaurant_id").on(table.restaurantId),
  index("idx_documents_supplier_id").on(table.supplierId),
  uniqueIndex("uq_documents_delivery_note_per_order")
    .on(table.orderId)
    .where(sql`${table.type} = 'delivery_note' AND ${table.isUpload} = false`),
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
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true, erpManaged: true, erpExternalId: true, discontinued: true, lastErpSyncAt: true });
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
export const erpSyncStatusEnum = pgEnum("erp_sync_status", ["idle", "running", "success", "error"]);

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
  // ----- Automatic catalog sync state -----
  // Whether the scheduled daily sync is enabled (manual "Sync now" works
  // regardless). Off by default until the supplier confirms the first run.
  syncEnabled: boolean("sync_enabled").default(false).notNull(),
  // Current/last run lifecycle. "running" doubles as an overlap lock so two
  // syncs never apply at once.
  syncStatus: erpSyncStatusEnum("sync_status").default("idle").notNull(),
  syncStartedAt: timestamp("sync_started_at"),
  lastSyncError: text("last_sync_error"),
  lastSyncCreated: integer("last_sync_created").default(0).notNull(),
  lastSyncUpdated: integer("last_sync_updated").default(0).notNull(),
  lastSyncDeactivated: integer("last_sync_deactivated").default(0).notNull(),
  // The supplier must preview + confirm the first overwrite before scheduled
  // syncs are allowed to run, so an unexpected feed can't silently wipe data.
  firstSyncConfirmed: boolean("first_sync_confirmed").default(false).notNull(),
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

// Per-connection ERP credentials (API key or mailbox login), encrypted at rest.
// The secret values live ONLY inside the AES-256-GCM ciphertext blob and are
// NEVER returned to any client. Non-sensitive metadata (which fields are set, a
// masked hint) may be shown so suppliers/admins can confirm credentials exist.
export const erpCredentialTypeEnum = pgEnum("erp_credential_type", ["api", "excel_email"]);

export const supplierErpCredentials = pgTable("supplier_erp_credentials", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id", { length: 36 }).notNull().references(() => supplierErpConnections.id, { onDelete: "cascade" }),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  credentialType: erpCredentialTypeEnum("credential_type").notNull(),
  // Encrypted secret payload (AES-256-GCM). Never sent to clients.
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  // Non-sensitive metadata safe to expose.
  fieldsSet: text("fields_set").array().notNull().default(sql`'{}'::text[]`),
  hint: text("hint"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_supplier_erp_credentials_connection").on(table.connectionId),
  index("idx_supplier_erp_credentials_supplier").on(table.supplierId),
]);

export const insertErpProviderSchema = createInsertSchema(erpProviders).omit({ id: true, createdAt: true });
export const insertSupplierErpConnectionSchema = createInsertSchema(supplierErpConnections).omit({ id: true, createdAt: true, updatedAt: true, syncStatus: true, syncStartedAt: true, lastSyncError: true, lastSyncCreated: true, lastSyncUpdated: true, lastSyncDeactivated: true });
export const insertErpConnectionRequestSchema = createInsertSchema(erpConnectionRequests).omit({ id: true, createdAt: true, updatedAt: true, status: true, adminNotes: true });

export type ErpProvider = typeof erpProviders.$inferSelect;
export type InsertErpProvider = z.infer<typeof insertErpProviderSchema>;
export type SupplierErpConnection = typeof supplierErpConnections.$inferSelect;
export type InsertSupplierErpConnection = z.infer<typeof insertSupplierErpConnectionSchema>;
export type ErpConnectionRequest = typeof erpConnectionRequests.$inferSelect;
export type InsertErpConnectionRequest = z.infer<typeof insertErpConnectionRequestSchema>;
export type ErpRequestStatus = typeof ERP_REQUEST_STATUSES[number];
export type ErpConnectionMethod = typeof ERP_CONNECTION_METHODS[number];
export type SupplierErpCredential = typeof supplierErpCredentials.$inferSelect;
export type ErpCredentialType = "api" | "excel_email";
// Client-safe view of a credential: presence + masked hint only, NO secret values.
export type ErpCredentialPublicMeta = {
  id: string;
  connectionId: string;
  supplierId: string;
  credentialType: ErpCredentialType;
  fieldsSet: string[];
  hint: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ===== WhatsApp Inbox connection (connect + request flow) =====
// Single provider (WhatsApp), so no providers catalog. Reuses the ERP
// connection/request status enums and mirrors the ERP table structure.
export const whatsappUsagePreferenceEnum = pgEnum("whatsapp_usage_preference", ["alongside", "whatsapp_only"]);
export const WHATSAPP_USAGE_PREFERENCES = ["alongside", "whatsapp_only"] as const;

export const whatsappConnections = pgTable("whatsapp_connections", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  status: erpConnectionStatusEnum("status").default("pending").notNull(),
  usagePreference: whatsappUsagePreferenceEnum("usage_preference").default("alongside").notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_whatsapp_connections_user_id").on(table.userId),
  index("idx_whatsapp_connections_status").on(table.status),
]);

export const whatsappConnectionRequests = pgTable("whatsapp_connection_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  whatsappNumber: text("whatsapp_number").notNull(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  usagePreference: whatsappUsagePreferenceEnum("usage_preference").default("alongside").notNull(),
  message: text("message"),
  adminNotes: text("admin_notes"),
  status: erpRequestStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_whatsapp_connection_requests_user_id").on(table.userId),
  index("idx_whatsapp_connection_requests_status").on(table.status),
]);

export const insertWhatsappConnectionSchema = createInsertSchema(whatsappConnections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWhatsappConnectionRequestSchema = createInsertSchema(whatsappConnectionRequests).omit({ id: true, createdAt: true, updatedAt: true, status: true, adminNotes: true });

export type WhatsappConnection = typeof whatsappConnections.$inferSelect;
export type InsertWhatsappConnection = z.infer<typeof insertWhatsappConnectionSchema>;
export type WhatsappConnectionRequest = typeof whatsappConnectionRequests.$inferSelect;
export type InsertWhatsappConnectionRequest = z.infer<typeof insertWhatsappConnectionRequestSchema>;
export type WhatsappUsagePreference = typeof WHATSAPP_USAGE_PREFERENCES[number];

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
  createdByMember?: Member | null;
};
export type ProductPurchaseHistoryEntry = {
  orderId: string;
  orderNumber: string | null;
  status: typeof orderStatusEnum.enumValues[number];
  createdAt: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
};
export type MessageWithOrderNumber = Message & { orderNumber?: string | null; senderMember?: Member | null };
export type ConversationWithUser = Conversation & {
  otherUser: User;
  lastMessage?: MessageWithOrderNumber;
  unreadCount: number;
};
export type CartItemWithProduct = CartItem & { product: Product; supplier: User };
export type ComplaintWithDetails = Complaint & { order: Order; restaurant: User; supplier: User; comments?: ComplaintCommentWithUser[] };
export type ComplaintCommentWithUser = ComplaintComment & { user: User };
export type DocumentWithDetails = Document & { order: Order; restaurant: User; supplier: User };
export type OrderStatusHistoryWithUser = OrderStatusHistory & { changedByUser?: User; changedByMember?: Member | null };
export type ComplaintStatusHistoryWithUser = ComplaintStatusHistory & { changedByUser?: User; changedByMember?: Member | null };
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

// ===== AI Assistant chat history =====
// Each user (scoped by role) has a list of conversations with the in-app AI
// assistant. Conversations and their messages persist across sessions so the
// floating chat can show history and continue multi-turn context.
export interface AiChatAction {
  kind: "open_inbox" | "open_order";
  label: string;
  href: string;
  orderId?: string;
  orderNumber?: string;
  partnerId?: string;
  suggestedMessage?: string;
}

export const aiChats = pgTable("ai_chats", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  role: userRoleEnum("role").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_chats_user").on(table.userId),
  index("idx_ai_chats_user_role_updated").on(table.userId, table.role, table.updatedAt),
]);

export const aiChatMessages = pgTable("ai_chat_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  chatId: varchar("chat_id", { length: 36 }).notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  // "user" | "assistant"
  role: text("role").notNull(),
  content: text("content").notNull(),
  // Resolved deep-link actions attached to an assistant message (server-verified).
  actions: jsonb("actions").$type<AiChatAction[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_chat_messages_chat").on(table.chatId),
  index("idx_ai_chat_messages_chat_created").on(table.chatId, table.createdAt),
]);

export const insertAiChatSchema = createInsertSchema(aiChats).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiChatMessageSchema = createInsertSchema(aiChatMessages).omit({ id: true, createdAt: true });
export type AiChat = typeof aiChats.$inferSelect;
export type InsertAiChat = z.infer<typeof insertAiChatSchema>;
export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type InsertAiChatMessage = z.infer<typeof insertAiChatMessageSchema>;

// ─── Organizations, teams & seats ─────────────────────────────────────────
// A `users` row IS the organization (Betrieb / supplier company). `members`
// are the people who work there. Attribution fields point at members with a
// graceful fallback to the org.
export const members = pgTable("members", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => users.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  profileImageUrl: text("profile_image_url"),
  role: memberRoleEnum("role").notNull().default("staff"),
  // ── Authentication (added by Member Authentication task) ──────────────────
  // All nullable so existing seeded members keep working until they claim
  // credentials. `passwordHash` is null for OAuth-only or not-yet-claimed
  // accounts. Email (lower-cased) is the login key and is uniquely indexed
  // below, but only enforced for non-null emails so legacy members without an
  // email are unaffected.
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_members_organization_id").on(table.organizationId),
  uniqueIndex("uniq_members_login_email")
    .on(sql`lower(${table.email})`)
    .where(sql`${table.email} is not null`),
]);

// ── Auth: invitations, password resets & linked OAuth accounts ──────────────
// Invitations and resets store only a SHA-256 hash of the raw token; the raw
// token lives solely in the emailed link. Both reference a member (invite-only
// model: the member row is created first, then invited to claim credentials).
export const invitations = pgTable("invitations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id", { length: 36 }).notNull().references(() => members.id),
  tokenHash: text("token_hash").notNull(),
  invitedByMemberId: varchar("invited_by_member_id", { length: 36 }).references(() => members.id),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_invitations_token_hash").on(table.tokenHash),
  index("idx_invitations_member_id").on(table.memberId),
]);

export const passwordResets = pgTable("password_resets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id", { length: 36 }).notNull().references(() => members.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_password_resets_token_hash").on(table.tokenHash),
  index("idx_password_resets_member_id").on(table.memberId),
]);

// Email-verification tokens for self-signed-up business owners. Mirrors the
// password-reset model: only the SHA-256 hash is stored, single-use,
// time-limited; the raw token travels solely in the emailed link.
export const emailVerifications = pgTable("email_verifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id", { length: 36 }).notNull().references(() => members.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_email_verifications_token_hash").on(table.tokenHash),
  index("idx_email_verifications_member_id").on(table.memberId),
]);

export const oauthProviderEnum = pgEnum("oauth_provider", ["google", "apple", "microsoft"]);

export const oauthAccounts = pgTable("oauth_accounts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id", { length: 36 }).notNull().references(() => members.id),
  provider: oauthProviderEnum("provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uniq_oauth_provider_user").on(table.provider, table.providerUserId),
  index("idx_oauth_accounts_member_id").on(table.memberId),
]);

// A Vertreter (sales rep) is a member of a supplier org. This assignment maps
// that rep to the restaurant orgs (Betriebe) they are responsible for.
// Platform-level admin accounts. These are the GastroConnect system owners
// who authenticate via Replit OIDC. Stored separately from the org/member
// system. Status: 'pending' (awaiting approval) | 'approved' | 'denied'.
// The table is created by runAdminMigration() (idempotent DDL), not db:push.
export const platformAdmins = pgTable("platform_admins", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  replitUserId: text("replit_user_id").notNull().unique(),
  replitUsername: text("replit_username").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  // 'pending' | 'approved' | 'denied'
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPlatformAdminSchema = createInsertSchema(platformAdmins).omit({ id: true, createdAt: true });
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type InsertPlatformAdmin = z.infer<typeof insertPlatformAdminSchema>;

export const vertreterAssignments = pgTable("vertreter_assignments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id", { length: 36 }).notNull().references(() => members.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_vertreter_assignments_member_id").on(table.memberId),
  index("idx_vertreter_assignments_supplier_id").on(table.supplierId),
  index("idx_vertreter_assignments_restaurant_id").on(table.restaurantId),
  uniqueIndex("uniq_vertreter_assignment").on(table.supplierId, table.restaurantId),
]);

export const MEMBER_ROLES = ["admin", "manager", "staff", "vertreter"] as const;
export type MemberRole = typeof MEMBER_ROLES[number];

export const insertMemberSchema = createInsertSchema(members).omit({
  id: true,
  createdAt: true,
  passwordHash: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
});
export const insertVertreterAssignmentSchema = createInsertSchema(vertreterAssignments).omit({ id: true, createdAt: true });
export type Member = typeof members.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type VertreterAssignment = typeof vertreterAssignments.$inferSelect;
export type InsertVertreterAssignment = z.infer<typeof insertVertreterAssignmentSchema>;

// ── Auth table insert schemas & types ───────────────────────────────────────
export const insertInvitationSchema = createInsertSchema(invitations).omit({ id: true, createdAt: true, acceptedAt: true });
export const insertPasswordResetSchema = createInsertSchema(passwordResets).omit({ id: true, createdAt: true, usedAt: true });
export const insertEmailVerificationSchema = createInsertSchema(emailVerifications).omit({ id: true, createdAt: true, usedAt: true });
export const insertOauthAccountSchema = createInsertSchema(oauthAccounts).omit({ id: true, createdAt: true });
export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type InsertPasswordReset = z.infer<typeof insertPasswordResetSchema>;
export type EmailVerification = typeof emailVerifications.$inferSelect;
export type InsertEmailVerification = z.infer<typeof insertEmailVerificationSchema>;
export type OauthAccount = typeof oauthAccounts.$inferSelect;
export type InsertOauthAccount = z.infer<typeof insertOauthAccountSchema>;
export const OAUTH_PROVIDERS = ["google", "apple", "microsoft"] as const;
export type OauthProvider = typeof OAUTH_PROVIDERS[number];

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
