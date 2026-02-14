import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["restaurant", "supplier"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "confirmed", "in_delivery", "delivered", "cancelled"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "order", "complaint", "confirmation", "delivery_status", "document", "attachment"]);
export const notificationTypeEnum = pgEnum("notification_type", ["new_message", "new_order", "order_status", "new_complaint", "complaint_comment"]);
export const documentTypeEnum = pgEnum("document_type", ["delivery_note", "invoice", "other"]);
export const complaintStatusEnum = pgEnum("complaint_status", ["open", "in_progress", "resolved", "closed"]);

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("piece"),
  category: text("category"),
  inStock: boolean("in_stock").default(true).notNull(),
  stockQuantity: integer("stock_quantity").default(0),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  status: orderStatusEnum("status").default("pending").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
});

export const cartItems = pgTable("cart_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id),
  senderId: varchar("sender_id", { length: 36 }).notNull().references(() => users.id),
  messageType: messageTypeEnum("message_type").default("text").notNull(),
  content: text("content").notNull(),
  orderId: varchar("order_id", { length: 36 }).references(() => orders.id),
  documentUrl: text("document_url"),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderStatusHistory = pgTable("order_status_history", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: varchar("changed_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const complaints = pgTable("complaints", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  mediaUrls: text("media_urls").array().default([]),
  status: complaintStatusEnum("status").default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const complaintComments = pgTable("complaint_comments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  complaintId: varchar("complaint_id", { length: 36 }).notNull().references(() => complaints.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const complaintStatusHistory = pgTable("complaint_status_history", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  complaintId: varchar("complaint_id", { length: 36 }).notNull().references(() => complaints.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: varchar("changed_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  referenceId: varchar("reference_id", { length: 36 }),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  type: documentTypeEnum("type").notNull(),
  title: text("title").notNull(),
  fileUrl: text("file_url").notNull(),
  restaurantId: varchar("restaurant_id", { length: 36 }).notNull().references(() => users.id),
  supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertCartItemSchema = createInsertSchema(cartItems).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true, lastMessageAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true, isRead: true });
export const insertComplaintSchema = createInsertSchema(complaints).omit({ id: true, createdAt: true, updatedAt: true, status: true });
export const updateComplaintSchema = createInsertSchema(complaints).omit({ id: true, createdAt: true, updatedAt: true, orderId: true, restaurantId: true, supplierId: true }).partial();
export const insertComplaintCommentSchema = createInsertSchema(complaintComments).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, isRead: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export const insertOrderStatusHistorySchema = createInsertSchema(orderStatusHistory).omit({ id: true, createdAt: true });
export const insertComplaintStatusHistorySchema = createInsertSchema(complaintStatusHistory).omit({ id: true, createdAt: true });

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

// Extended types for frontend
export type ProductWithSupplier = Product & { supplier: User };
export type OrderWithDetails = Order & { 
  items: OrderItem[];
  restaurant: User;
  supplier: User;
};
export type ConversationWithUser = Conversation & {
  otherUser: User;
  lastMessage?: Message;
  unreadCount: number;
};
export type CartItemWithProduct = CartItem & { product: Product; supplier: User };
export type ComplaintWithDetails = Complaint & { order: Order; restaurant: User; supplier: User; comments?: ComplaintCommentWithUser[] };
export type ComplaintCommentWithUser = ComplaintComment & { user: User };
export type DocumentWithDetails = Document & { order: Order; restaurant: User; supplier: User };
export type OrderStatusHistoryWithUser = OrderStatusHistory & { changedByUser?: User };
export type ComplaintStatusHistoryWithUser = ComplaintStatusHistory & { changedByUser?: User };
