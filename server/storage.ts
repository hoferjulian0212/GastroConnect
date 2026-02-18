import { db } from "./db";
import { eq, and, desc, or, sql, ne, inArray } from "drizzle-orm";
import {
  users, products, orders, orderItems, cartItems, conversations, messages, complaints, notifications, complaintComments, documents,
  orderStatusHistory, complaintStatusHistory, promotions, deliverySchedules, customMinOrderQuantities,
  type User, type InsertUser, type Product, type InsertProduct,
  type Order, type InsertOrder, type OrderItem, type InsertOrderItem,
  type CartItem, type InsertCartItem, type Conversation, type InsertConversation,
  type Message, type InsertMessage, type ProductWithSupplier, type OrderWithDetails,
  type ConversationWithUser, type CartItemWithProduct, type Complaint, type InsertComplaint,
  type ComplaintWithDetails, type Notification, type InsertNotification, type UpdateComplaint,
  type ComplaintComment, type InsertComplaintComment, type ComplaintCommentWithUser,
  type Document, type InsertDocument, type DocumentWithDetails,
  type OrderStatusHistory, type OrderStatusHistoryWithUser,
  type ComplaintStatusHistory, type ComplaintStatusHistoryWithUser,
  type Promotion, type InsertPromotion, type PromotionWithProduct,
  type DeliverySchedule, type InsertDeliverySchedule,
  type CustomMinOrderQuantity, type InsertCustomMinOrderQuantity
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUsersByRole(role: "restaurant" | "supplier"): Promise<User[]>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

  // Products
  getProducts(): Promise<ProductWithSupplier[]>;
  getProductsBySupplier(supplierId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;

  // Orders
  getOrdersByRestaurant(restaurantId: string): Promise<OrderWithDetails[]>;
  getOrdersBySupplier(supplierId: string): Promise<OrderWithDetails[]>;
  getRecentOrdersByRestaurant(restaurantId: string): Promise<Order[]>;
  getRecentOrdersBySupplier(supplierId: string): Promise<Order[]>;
  getOrder(id: string): Promise<OrderWithDetails | undefined>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order | undefined>;
  updateOrderItems(id: string, items: InsertOrderItem[], totalAmount: string, requestedDeliveryDate?: string | null): Promise<Order | undefined>;

  // Cart
  getCartItems(restaurantId: string): Promise<CartItemWithProduct[]>;
  getCartItem(id: string): Promise<CartItem | undefined>;
  getCartCount(restaurantId: string): Promise<number>;
  addToCart(item: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: string, quantity: number): Promise<CartItem | undefined>;
  removeCartItem(id: string): Promise<void>;
  clearCart(restaurantId: string): Promise<void>;

  // Conversations & Messages
  getConversations(userId: string, role: "restaurant" | "supplier"): Promise<ConversationWithUser[]>;
  getConversation(conversationId: string): Promise<Conversation | undefined>;
  getOrCreateConversation(restaurantId: string, supplierId: string): Promise<Conversation>;
  getMessages(conversationId: string): Promise<Message[]>;
  getConversationStatuses(conversationId: string): Promise<{ orderStatuses: Record<string, string>; complaintStatuses: Record<string, { status: string; complaintId: string }> }>;
  sendMessage(message: InsertMessage): Promise<Message>;
  getUnreadCount(userId: string): Promise<number>;
  markMessagesAsRead(conversationId: string, userId: string): Promise<void>;

  // Stats
  getRestaurantStats(restaurantId: string): Promise<{
    pendingOrders: number;
    unreadMessages: number;
    totalSuppliers: number;
  }>;
  getSupplierStats(supplierId: string): Promise<{
    newOrders: number;
    unreadMessages: number;
    totalProducts: number;
    monthlyRevenue: number;
  }>;
  getPendingOrderCount(supplierId: string): Promise<number>;
  getRestaurantsForSupplier(supplierId: string): Promise<User[]>;

  // Complaints
  getComplaintsByRestaurant(restaurantId: string): Promise<ComplaintWithDetails[]>;
  getComplaintsBySupplier(supplierId: string): Promise<ComplaintWithDetails[]>;
  getComplaint(id: string): Promise<ComplaintWithDetails | undefined>;
  getComplaintByOrderId(orderId: string): Promise<ComplaintWithDetails | undefined>;
  createComplaint(complaint: InsertComplaint): Promise<Complaint>;
  updateComplaint(id: string, data: UpdateComplaint): Promise<Complaint | undefined>;
  getSuppliersWithOrders(restaurantId: string): Promise<User[]>;
  getOrdersByRestaurantAndSupplier(restaurantId: string, supplierId: string): Promise<Order[]>;
  
  // Complaint Comments
  getComplaintComments(complaintId: string): Promise<ComplaintCommentWithUser[]>;
  addComplaintComment(comment: InsertComplaintComment): Promise<ComplaintComment>;

  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  markNotificationsByReferenceAsRead(userId: string, referenceId: string, type?: string): Promise<void>;

  // Documents
  getDocumentsByOrder(orderId: string): Promise<Document[]>;
  getDocumentsByUser(userId: string, role: "restaurant" | "supplier"): Promise<DocumentWithDetails[]>;
  createDocument(doc: InsertDocument): Promise<Document>;

  // Status History
  getOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryWithUser[]>;
  addOrderStatusHistory(orderId: string, fromStatus: string | null, toStatus: string, changedBy?: string): Promise<OrderStatusHistory>;
  getComplaintStatusHistory(complaintId: string): Promise<ComplaintStatusHistoryWithUser[]>;
  addComplaintStatusHistory(complaintId: string, fromStatus: string | null, toStatus: string, changedBy?: string): Promise<ComplaintStatusHistory>;

  // Delivery Schedules
  getDeliverySchedules(supplierId: string): Promise<(DeliverySchedule & { restaurant: User })[]>;
  getDeliverySchedulesForRestaurant(supplierId: string, restaurantId: string): Promise<DeliverySchedule[]>;
  setDeliverySchedules(supplierId: string, restaurantId: string, days: number[]): Promise<void>;

  // Promotions
  getPromotionsBySupplier(supplierId: string): Promise<PromotionWithProduct[]>;
  getActivePromotionForProduct(productId: string): Promise<Promotion | undefined>;
  getActivePromotions(): Promise<Promotion[]>;
  createPromotion(promotion: InsertPromotion): Promise<Promotion>;
  updatePromotion(id: string, data: Partial<InsertPromotion>): Promise<Promotion | undefined>;
  deletePromotion(id: string): Promise<void>;

  // Custom Min Order Quantities
  getCustomMinOrderQuantities(supplierId: string): Promise<(CustomMinOrderQuantity & { product: Product; restaurant: User })[]>;
  getCustomMinOrderQuantitiesByRestaurant(restaurantId: string): Promise<CustomMinOrderQuantity[]>;
  getCustomMinOrderQuantity(productId: string, restaurantId: string): Promise<CustomMinOrderQuantity | undefined>;
  setCustomMinOrderQuantity(data: InsertCustomMinOrderQuantity): Promise<CustomMinOrderQuantity>;
  deleteCustomMinOrderQuantity(id: string): Promise<void>;

  // Seed
  seedData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUsersByRole(role: "restaurant" | "supplier"): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, role));
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  // Products
  async getProducts(): Promise<ProductWithSupplier[]> {
    const result = await db
      .select()
      .from(products)
      .leftJoin(users, eq(products.supplierId, users.id))
      .orderBy(desc(products.createdAt));
    
    return result.map(r => ({
      ...r.products,
      supplier: r.users!
    }));
  }

  async getProductsBySupplier(supplierId: string): Promise<Product[]> {
    return db.select().from(products).where(eq(products.supplierId, supplierId)).orderBy(desc(products.createdAt));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // Orders
  async getOrdersByRestaurant(restaurantId: string): Promise<OrderWithDetails[]> {
    const ordersResult = await db
      .select()
      .from(orders)
      .where(eq(orders.restaurantId, restaurantId))
      .orderBy(desc(orders.createdAt));

    const ordersWithDetails: OrderWithDetails[] = [];
    for (const order of ordersResult) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const [restaurant] = await db.select().from(users).where(eq(users.id, order.restaurantId));
      const [supplier] = await db.select().from(users).where(eq(users.id, order.supplierId));
      ordersWithDetails.push({ ...order, items, restaurant, supplier });
    }
    return ordersWithDetails;
  }

  async getOrdersBySupplier(supplierId: string): Promise<OrderWithDetails[]> {
    const ordersResult = await db
      .select()
      .from(orders)
      .where(eq(orders.supplierId, supplierId))
      .orderBy(desc(orders.createdAt));

    const ordersWithDetails: OrderWithDetails[] = [];
    for (const order of ordersResult) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const [restaurant] = await db.select().from(users).where(eq(users.id, order.restaurantId));
      const [supplier] = await db.select().from(users).where(eq(users.id, order.supplierId));
      ordersWithDetails.push({ ...order, items, restaurant, supplier });
    }
    return ordersWithDetails;
  }

  async getRecentOrdersByRestaurant(restaurantId: string): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(eq(orders.restaurantId, restaurantId))
      .orderBy(desc(orders.createdAt))
      .limit(5);
  }

  async getRecentOrdersBySupplier(supplierId: string): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(and(eq(orders.supplierId, supplierId), eq(orders.status, "pending")))
      .orderBy(desc(orders.createdAt))
      .limit(5);
  }

  async getOrder(id: string): Promise<OrderWithDetails | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;
    
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    const [restaurant] = await db.select().from(users).where(eq(users.id, order.restaurantId));
    const [supplier] = await db.select().from(users).where(eq(users.id, order.supplierId));
    
    return { ...order, items, restaurant, supplier };
  }

  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const [created] = await db.insert(orders).values(order).returning();
    
    for (const item of items) {
      await db.insert(orderItems).values({ ...item, orderId: created.id });
    }
    
    return created;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    const [updated] = await db
      .update(orders)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  async updateOrderItems(id: string, items: InsertOrderItem[], totalAmount: string, requestedDeliveryDate?: string | null): Promise<Order | undefined> {
    await db.delete(orderItems).where(eq(orderItems.orderId, id));
    for (const item of items) {
      await db.insert(orderItems).values({ ...item, orderId: id });
    }
    const setData: any = { totalAmount, updatedAt: new Date() };
    if (requestedDeliveryDate !== undefined) {
      setData.requestedDeliveryDate = requestedDeliveryDate;
    }
    const [updated] = await db
      .update(orders)
      .set(setData)
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  // Cart
  async getCartItem(id: string): Promise<CartItem | undefined> {
    const [item] = await db.select().from(cartItems).where(eq(cartItems.id, id));
    return item;
  }

  async getCartItems(restaurantId: string): Promise<CartItemWithProduct[]> {
    const result = await db
      .select()
      .from(cartItems)
      .leftJoin(products, eq(cartItems.productId, products.id))
      .leftJoin(users, eq(cartItems.supplierId, users.id))
      .where(eq(cartItems.restaurantId, restaurantId));

    return result.map(r => ({
      ...r.cart_items,
      product: r.products!,
      supplier: r.users!
    }));
  }

  async getCartCount(restaurantId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(cartItems)
      .where(eq(cartItems.restaurantId, restaurantId));
    return result[0]?.count || 0;
  }

  async addToCart(item: InsertCartItem): Promise<CartItem> {
    // Check if item already exists
    const [existing] = await db
      .select()
      .from(cartItems)
      .where(and(
        eq(cartItems.restaurantId, item.restaurantId),
        eq(cartItems.productId, item.productId)
      ));

    if (existing) {
      const [updated] = await db
        .update(cartItems)
        .set({ quantity: existing.quantity + (item.quantity || 1) })
        .where(eq(cartItems.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(cartItems).values(item).returning();
    return created;
  }

  async updateCartItem(id: string, quantity: number): Promise<CartItem | undefined> {
    const [updated] = await db
      .update(cartItems)
      .set({ quantity })
      .where(eq(cartItems.id, id))
      .returning();
    return updated;
  }

  async removeCartItem(id: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }

  async clearCart(restaurantId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.restaurantId, restaurantId));
  }

  // Conversations & Messages
  async getConversations(userId: string, role: "restaurant" | "supplier"): Promise<ConversationWithUser[]> {
    const convs = await db
      .select()
      .from(conversations)
      .where(
        role === "restaurant" 
          ? eq(conversations.restaurantId, userId)
          : eq(conversations.supplierId, userId)
      )
      .orderBy(desc(conversations.lastMessageAt));

    const result: ConversationWithUser[] = [];
    for (const conv of convs) {
      const otherUserId = role === "restaurant" ? conv.supplierId : conv.restaurantId;
      const [otherUser] = await db.select().from(users).where(eq(users.id, otherUserId));
      
      const [lastMessage] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const unreadResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(and(
          eq(messages.conversationId, conv.id),
          ne(messages.senderId, userId),
          eq(messages.isRead, false)
        ));

      result.push({
        ...conv,
        otherUser,
        lastMessage,
        unreadCount: Number(unreadResult[0]?.count) || 0
      });
    }
    return result;
  }

  async getConversation(conversationId: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    return conversation;
  }

  async getOrCreateConversation(restaurantId: string, supplierId: string): Promise<Conversation> {
    const [existing] = await db
      .select()
      .from(conversations)
      .where(and(
        eq(conversations.restaurantId, restaurantId),
        eq(conversations.supplierId, supplierId)
      ));

    if (existing) return existing;

    const [created] = await db
      .insert(conversations)
      .values({ restaurantId, supplierId })
      .returning();
    return created;
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async getConversationStatuses(conversationId: string): Promise<{ orderStatuses: Record<string, string>; complaintStatuses: Record<string, { status: string; complaintId: string }> }> {
    const convMessages = await db
      .select({ orderId: messages.orderId, messageType: messages.messageType, content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    const orderIds = new Set<string>();
    const complaintIds = new Set<string>();

    for (const msg of convMessages) {
      if (msg.orderId) orderIds.add(msg.orderId);
      if (msg.messageType === "complaint") {
        try {
          const data = JSON.parse(msg.content);
          if (data.complaintId) complaintIds.add(data.complaintId);
          if (data.orderId) orderIds.add(data.orderId);
        } catch {}
      }
    }

    const orderStatuses: Record<string, string> = {};
    const complaintStatuses: Record<string, { status: string; complaintId: string }> = {};

    if (orderIds.size > 0) {
      const orderRows = await db
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(inArray(orders.id, Array.from(orderIds)));
      for (const row of orderRows) {
        orderStatuses[row.id] = row.status;
      }
    }

    if (complaintIds.size > 0) {
      const complaintRows = await db
        .select({ id: complaints.id, status: complaints.status, orderId: complaints.orderId })
        .from(complaints)
        .where(inArray(complaints.id, Array.from(complaintIds)));
      for (const row of complaintRows) {
        complaintStatuses[row.orderId] = { status: row.status, complaintId: row.id };
      }
    }

    // Also look up complaints by orderId for messages that don't have complaintId embedded
    const orderIdsWithoutComplaint = Array.from(orderIds).filter(id => !Object.values(complaintStatuses).some(c => c.complaintId && complaintStatuses[id]));
    if (orderIdsWithoutComplaint.length > 0) {
      const extraComplaints = await db
        .select({ id: complaints.id, status: complaints.status, orderId: complaints.orderId })
        .from(complaints)
        .where(inArray(complaints.orderId, orderIdsWithoutComplaint));
      for (const row of extraComplaints) {
        if (!complaintStatuses[row.orderId]) {
          complaintStatuses[row.orderId] = { status: row.status, complaintId: row.id };
        }
      }
    }

    return { orderStatuses, complaintStatuses };
  }

  async sendMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();
    
    // Update conversation lastMessageAt
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, message.conversationId));

    return created;
  }

  async getUnreadCount(userId: string): Promise<number> {
    // Get conversations where user is participant
    const userConvs = await db
      .select()
      .from(conversations)
      .where(or(
        eq(conversations.restaurantId, userId),
        eq(conversations.supplierId, userId)
      ));

    let total = 0;
    for (const conv of userConvs) {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(and(
          eq(messages.conversationId, conv.id),
          ne(messages.senderId, userId),
          eq(messages.isRead, false)
        ));
      total += Number(result[0]?.count) || 0;
    }
    return total;
  }

  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(and(
        eq(messages.conversationId, conversationId),
        ne(messages.senderId, userId)
      ));
  }

  // Stats
  async getRestaurantStats(restaurantId: string): Promise<{
    pendingOrders: number;
    unreadMessages: number;
    totalSuppliers: number;
  }> {
    const pendingResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(
        eq(orders.restaurantId, restaurantId),
        or(eq(orders.status, "pending"), eq(orders.status, "confirmed"), eq(orders.status, "in_delivery"))
      ));

    const suppliers = await db.select().from(users).where(eq(users.role, "supplier"));
    const unreadMessages = await this.getUnreadCount(restaurantId);

    return {
      pendingOrders: Number(pendingResult[0]?.count) || 0,
      unreadMessages: Number(unreadMessages) || 0,
      totalSuppliers: suppliers.length
    };
  }

  async getSupplierStats(supplierId: string): Promise<{
    newOrders: number;
    unreadMessages: number;
    totalProducts: number;
    monthlyRevenue: number;
  }> {
    const newOrdersResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(eq(orders.supplierId, supplierId), eq(orders.status, "pending")));

    const productsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.supplierId, supplierId));

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const revenueResult = await db
      .select({ total: sql<number>`COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0)` })
      .from(orders)
      .where(and(
        eq(orders.supplierId, supplierId),
        eq(orders.status, "delivered"),
        sql`${orders.createdAt} >= ${startOfMonth}`
      ));

    const unreadMessages = await this.getUnreadCount(supplierId);

    return {
      newOrders: Number(newOrdersResult[0]?.count) || 0,
      unreadMessages: Number(unreadMessages) || 0,
      totalProducts: Number(productsResult[0]?.count) || 0,
      monthlyRevenue: Number(revenueResult[0]?.total) || 0
    };
  }

  async getPendingOrderCount(supplierId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(eq(orders.supplierId, supplierId), eq(orders.status, "pending")));
    return result[0]?.count || 0;
  }

  async getRestaurantsForSupplier(supplierId: string): Promise<User[]> {
    // Get unique restaurants that have ordered from this supplier
    const restaurantIds = await db
      .selectDistinct({ id: orders.restaurantId })
      .from(orders)
      .where(eq(orders.supplierId, supplierId));

    if (restaurantIds.length === 0) return [];

    return db
      .select()
      .from(users)
      .where(or(...restaurantIds.map(r => eq(users.id, r.id))));
  }

  // Complaints
  async getComplaintsByRestaurant(restaurantId: string): Promise<ComplaintWithDetails[]> {
    const result = await db
      .select()
      .from(complaints)
      .where(eq(complaints.restaurantId, restaurantId))
      .orderBy(desc(complaints.createdAt));

    const complaintsWithDetails: ComplaintWithDetails[] = [];
    for (const complaint of result) {
      const [order] = await db.select().from(orders).where(eq(orders.id, complaint.orderId));
      const [restaurant] = await db.select().from(users).where(eq(users.id, complaint.restaurantId));
      const [supplier] = await db.select().from(users).where(eq(users.id, complaint.supplierId));
      complaintsWithDetails.push({ ...complaint, order, restaurant, supplier });
    }
    return complaintsWithDetails;
  }

  async getComplaintsBySupplier(supplierId: string): Promise<ComplaintWithDetails[]> {
    const result = await db
      .select()
      .from(complaints)
      .where(eq(complaints.supplierId, supplierId))
      .orderBy(desc(complaints.createdAt));

    const complaintsWithDetails: ComplaintWithDetails[] = [];
    for (const complaint of result) {
      const [order] = await db.select().from(orders).where(eq(orders.id, complaint.orderId));
      const [restaurant] = await db.select().from(users).where(eq(users.id, complaint.restaurantId));
      const [supplier] = await db.select().from(users).where(eq(users.id, complaint.supplierId));
      complaintsWithDetails.push({ ...complaint, order, restaurant, supplier });
    }
    return complaintsWithDetails;
  }

  async createComplaint(complaint: InsertComplaint): Promise<Complaint> {
    const [created] = await db.insert(complaints).values(complaint).returning();
    return created;
  }

  async getComplaint(id: string): Promise<ComplaintWithDetails | undefined> {
    const [complaint] = await db.select().from(complaints).where(eq(complaints.id, id));
    if (!complaint) return undefined;

    const [order] = await db.select().from(orders).where(eq(orders.id, complaint.orderId));
    const [restaurant] = await db.select().from(users).where(eq(users.id, complaint.restaurantId));
    const [supplier] = await db.select().from(users).where(eq(users.id, complaint.supplierId));
    const comments = await this.getComplaintComments(id);
    
    return { ...complaint, order, restaurant, supplier, comments };
  }

  async getComplaintByOrderId(orderId: string): Promise<ComplaintWithDetails | undefined> {
    const [complaint] = await db.select().from(complaints).where(eq(complaints.orderId, orderId));
    if (!complaint) return undefined;

    const [order] = await db.select().from(orders).where(eq(orders.id, complaint.orderId));
    const [restaurant] = await db.select().from(users).where(eq(users.id, complaint.restaurantId));
    const [supplier] = await db.select().from(users).where(eq(users.id, complaint.supplierId));
    const comments = await this.getComplaintComments(complaint.id);
    
    return { ...complaint, order, restaurant, supplier, comments };
  }

  async updateComplaint(id: string, data: UpdateComplaint): Promise<Complaint | undefined> {
    const [updated] = await db
      .update(complaints)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(complaints.id, id))
      .returning();
    return updated;
  }

  async getComplaintComments(complaintId: string): Promise<ComplaintCommentWithUser[]> {
    const result = await db
      .select()
      .from(complaintComments)
      .where(eq(complaintComments.complaintId, complaintId))
      .orderBy(desc(complaintComments.createdAt));

    const commentsWithUser: ComplaintCommentWithUser[] = [];
    for (const comment of result) {
      const [user] = await db.select().from(users).where(eq(users.id, comment.userId));
      commentsWithUser.push({ ...comment, user });
    }
    return commentsWithUser;
  }

  async addComplaintComment(comment: InsertComplaintComment): Promise<ComplaintComment> {
    const [created] = await db.insert(complaintComments).values(comment).returning();
    return created;
  }

  async getSuppliersWithOrders(restaurantId: string): Promise<User[]> {
    const supplierIds = await db
      .selectDistinct({ id: orders.supplierId })
      .from(orders)
      .where(eq(orders.restaurantId, restaurantId));

    if (supplierIds.length === 0) return [];

    return db
      .select()
      .from(users)
      .where(or(...supplierIds.map(s => eq(users.id, s.id))));
  }

  async getOrdersByRestaurantAndSupplier(restaurantId: string, supplierId: string): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), eq(orders.supplierId, supplierId)))
      .orderBy(desc(orders.createdAt));
  }

  // Seed Data
  async getOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryWithUser[]> {
    const result = await db
      .select()
      .from(orderStatusHistory)
      .leftJoin(users, eq(orderStatusHistory.changedBy, users.id))
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(orderStatusHistory.createdAt);
    return result.map(r => ({
      ...r.order_status_history,
      changedByUser: r.users || undefined,
    }));
  }

  async addOrderStatusHistory(orderId: string, fromStatus: string | null, toStatus: string, changedBy?: string): Promise<OrderStatusHistory> {
    const [entry] = await db
      .insert(orderStatusHistory)
      .values({ orderId, fromStatus, toStatus, changedBy: changedBy || null })
      .returning();
    return entry;
  }

  async getComplaintStatusHistory(complaintId: string): Promise<ComplaintStatusHistoryWithUser[]> {
    const result = await db
      .select()
      .from(complaintStatusHistory)
      .leftJoin(users, eq(complaintStatusHistory.changedBy, users.id))
      .where(eq(complaintStatusHistory.complaintId, complaintId))
      .orderBy(complaintStatusHistory.createdAt);
    return result.map(r => ({
      ...r.complaint_status_history,
      changedByUser: r.users || undefined,
    }));
  }

  async addComplaintStatusHistory(complaintId: string, fromStatus: string | null, toStatus: string, changedBy?: string): Promise<ComplaintStatusHistory> {
    const [entry] = await db
      .insert(complaintStatusHistory)
      .values({ complaintId, fromStatus, toStatus, changedBy: changedBy || null })
      .returning();
    return entry;
  }

  async seedData(): Promise<void> {
    // Check if data already exists
    const existingUsers = await db.select().from(users);
    if (existingUsers.length > 0) return;

    // Create restaurants
    const restaurant1 = await this.createUser({
      role: "restaurant",
      name: "Thomas Weber",
      email: "thomas@biergarten-muenchen.de",
      phone: "+49 89 1234567",
      companyName: "Biergarten München",
      address: "Marienplatz 1",
      city: "München",
      postalCode: "80331",
      description: "Traditioneller Biergarten im Herzen von München"
    });

    const restaurant2 = await this.createUser({
      role: "restaurant",
      name: "Maria Schmidt",
      email: "maria@pizzeria-bella.de",
      phone: "+49 30 9876543",
      companyName: "Pizzeria Bella Italia",
      address: "Friedrichstraße 45",
      city: "Berlin",
      postalCode: "10117",
      description: "Authentische italienische Küche"
    });

    const restaurant3 = await this.createUser({
      role: "restaurant",
      name: "Klaus Fischer",
      email: "klaus@gasthof-alpenblick.de",
      phone: "+49 8821 12345",
      companyName: "Gasthof Alpenblick",
      address: "Bergstraße 12",
      city: "Garmisch-Partenkirchen",
      postalCode: "82467",
      description: "Bayerische Spezialitäten mit Alpenblick"
    });

    // Create suppliers
    const supplier1 = await this.createUser({
      role: "supplier",
      name: "Hans Müller",
      email: "hans@frische-produkte.de",
      phone: "+49 89 5555666",
      companyName: "Frische Produkte GmbH",
      address: "Industriestraße 23",
      city: "München",
      postalCode: "80939",
      description: "Ihr Partner für frisches Obst und Gemüse"
    });

    const supplier2 = await this.createUser({
      role: "supplier",
      name: "Anna Bauer",
      email: "anna@metzgerei-bauer.de",
      phone: "+49 89 7778899",
      companyName: "Metzgerei Bauer",
      address: "Fleischweg 5",
      city: "München",
      postalCode: "80469",
      description: "Qualitätsfleisch aus der Region"
    });

    const supplier3 = await this.createUser({
      role: "supplier",
      name: "Peter Klein",
      email: "peter@getraenke-klein.de",
      phone: "+49 89 3334455",
      companyName: "Getränke Klein",
      address: "Braustraße 88",
      city: "München",
      postalCode: "80337",
      description: "Getränke-Großhandel für die Gastronomie"
    });

    // Create products for supplier1 (Frische Produkte)
    await this.createProduct({ supplierId: supplier1.id, name: "Bio Tomaten", description: "Frische Bio-Tomaten aus regionalem Anbau", price: "3.99", unit: "kg", category: "Gemüse", inStock: true, stockQuantity: 100 });
    await this.createProduct({ supplierId: supplier1.id, name: "Eisbergsalat", description: "Knackiger Eisbergsalat", price: "1.49", unit: "Stück", category: "Gemüse", inStock: true, stockQuantity: 50 });
    await this.createProduct({ supplierId: supplier1.id, name: "Karotten", description: "Frische Karotten im Bund", price: "2.29", unit: "kg", category: "Gemüse", inStock: true, stockQuantity: 80 });
    await this.createProduct({ supplierId: supplier1.id, name: "Bio Äpfel", description: "Knackige Bio-Äpfel, Sorte Elstar", price: "4.49", unit: "kg", category: "Obst", inStock: true, stockQuantity: 60 });
    await this.createProduct({ supplierId: supplier1.id, name: "Zitronen", description: "Frische Zitronen aus Sizilien", price: "3.29", unit: "kg", category: "Obst", inStock: true, stockQuantity: 40 });

    // Create products for supplier2 (Metzgerei)
    await this.createProduct({ supplierId: supplier2.id, name: "Schweineschnitzel", description: "Zartes Schweineschnitzel, panierfertig", price: "12.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 30 });
    await this.createProduct({ supplierId: supplier2.id, name: "Rinderfilet", description: "Premium Rinderfilet vom Weiderind", price: "39.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 15 });
    await this.createProduct({ supplierId: supplier2.id, name: "Hähnchenbrust", description: "Zarte Hähnchenbrust", price: "9.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 40 });
    await this.createProduct({ supplierId: supplier2.id, name: "Bratwurst", description: "Original Nürnberger Bratwurst", price: "8.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 50 });
    await this.createProduct({ supplierId: supplier2.id, name: "Hackfleisch gemischt", description: "Hackfleisch gemischt Rind/Schwein", price: "7.99", unit: "kg", category: "Fleisch", inStock: false, stockQuantity: 0 });

    // Create products for supplier3 (Getränke)
    await this.createProduct({ supplierId: supplier3.id, name: "Augustiner Helles", description: "Münchner Augustiner Helles, Kiste 20x0,5l", price: "19.99", unit: "Kiste", category: "Getränke", inStock: true, stockQuantity: 100 });
    await this.createProduct({ supplierId: supplier3.id, name: "Mineralwasser", description: "Gerolsteiner Mineralwasser, Kiste 12x1l", price: "8.49", unit: "Kiste", category: "Getränke", inStock: true, stockQuantity: 200 });
    await this.createProduct({ supplierId: supplier3.id, name: "Apfelsaft", description: "Naturtrüber Apfelsaft, Kiste 6x1l", price: "11.99", unit: "Kiste", category: "Getränke", inStock: true, stockQuantity: 80 });
    await this.createProduct({ supplierId: supplier3.id, name: "Cola", description: "Coca-Cola Classic, Kiste 24x0,33l", price: "18.99", unit: "Kiste", category: "Getränke", inStock: true, stockQuantity: 60 });

    // Create conversations and messages
    const conv1 = await this.getOrCreateConversation(restaurant1.id, supplier1.id);
    await this.sendMessage({ conversationId: conv1.id, senderId: restaurant1.id, messageType: "text", content: "Hallo, haben Sie Bio Tomaten vorrätig?" });
    await this.sendMessage({ conversationId: conv1.id, senderId: supplier1.id, messageType: "text", content: "Ja, wir haben frische Bio-Tomaten aus der Region. Wie viel benötigen Sie?" });
    await this.sendMessage({ conversationId: conv1.id, senderId: restaurant1.id, messageType: "text", content: "10kg wären super, können Sie die morgen früh liefern?" });

    const conv2 = await this.getOrCreateConversation(restaurant1.id, supplier2.id);
    await this.sendMessage({ conversationId: conv2.id, senderId: restaurant1.id, messageType: "text", content: "Guten Tag, ich würde gerne Schweineschnitzel bestellen." });
    await this.sendMessage({ conversationId: conv2.id, senderId: supplier2.id, messageType: "text", content: "Gerne! Unsere Schnitzel sind heute frisch eingetroffen." });

    const conv3 = await this.getOrCreateConversation(restaurant2.id, supplier1.id);
    await this.sendMessage({ conversationId: conv3.id, senderId: restaurant2.id, messageType: "text", content: "Können Sie uns wöchentlich mit frischem Salat beliefern?" });

    // Create some sample orders
    const productList = await this.getProductsBySupplier(supplier1.id);
    if (productList.length > 0) {
      const order1Items = [
        { productId: productList[0].id, productName: productList[0].name, quantity: 5, unitPrice: productList[0].price, totalPrice: (parseFloat(productList[0].price) * 5).toFixed(2) },
        { productId: productList[1].id, productName: productList[1].name, quantity: 10, unitPrice: productList[1].price, totalPrice: (parseFloat(productList[1].price) * 10).toFixed(2) }
      ];
      const total1 = order1Items.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0).toFixed(2);
      await this.createOrder({ restaurantId: restaurant1.id, supplierId: supplier1.id, totalAmount: total1, status: "delivered" }, order1Items as any);

      const order2Items = [
        { productId: productList[0].id, productName: productList[0].name, quantity: 8, unitPrice: productList[0].price, totalPrice: (parseFloat(productList[0].price) * 8).toFixed(2) }
      ];
      const total2 = order2Items.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0).toFixed(2);
      await this.createOrder({ restaurantId: restaurant1.id, supplierId: supplier1.id, totalAmount: total2, status: "pending" }, order2Items as any);
    }

    const meatProducts = await this.getProductsBySupplier(supplier2.id);
    if (meatProducts.length > 0) {
      const order3Items = [
        { productId: meatProducts[0].id, productName: meatProducts[0].name, quantity: 3, unitPrice: meatProducts[0].price, totalPrice: (parseFloat(meatProducts[0].price) * 3).toFixed(2) }
      ];
      const total3 = order3Items.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0).toFixed(2);
      await this.createOrder({ restaurantId: restaurant1.id, supplierId: supplier2.id, totalAmount: total3, status: "confirmed" }, order3Items as any);
    }

    console.log("Seed data created successfully!");
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result[0]?.count || 0;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return updated;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async markNotificationsByReferenceAsRead(userId: string, referenceId: string, type?: string): Promise<void> {
    const conditions = [
      eq(notifications.userId, userId),
      eq(notifications.referenceId, referenceId),
      eq(notifications.isRead, false),
    ];
    if (type) {
      conditions.push(eq(notifications.type, type as any));
    }
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(...conditions));
  }

  // Documents
  async getDocumentsByOrder(orderId: string): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.orderId, orderId)).orderBy(desc(documents.createdAt));
  }

  async getDocumentsByUser(userId: string, role: "restaurant" | "supplier"): Promise<DocumentWithDetails[]> {
    const field = role === "restaurant" ? documents.restaurantId : documents.supplierId;
    const docs = await db.select().from(documents).where(eq(field, userId)).orderBy(desc(documents.createdAt));
    const result: DocumentWithDetails[] = [];
    for (const doc of docs) {
      const [order] = await db.select().from(orders).where(eq(orders.id, doc.orderId));
      const [restaurant] = await db.select().from(users).where(eq(users.id, doc.restaurantId));
      const [supplier] = await db.select().from(users).where(eq(users.id, doc.supplierId));
      if (order && restaurant && supplier) {
        result.push({ ...doc, order, restaurant, supplier });
      }
    }
    return result;
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values(doc).returning();
    return created;
  }

  // Promotions
  async getPromotionsBySupplier(supplierId: string): Promise<PromotionWithProduct[]> {
    const promos = await db.select().from(promotions)
      .where(eq(promotions.supplierId, supplierId))
      .orderBy(desc(promotions.createdAt));
    const result: PromotionWithProduct[] = [];
    for (const promo of promos) {
      const [product] = await db.select().from(products).where(eq(products.id, promo.productId));
      if (product) {
        result.push({ ...promo, product });
      }
    }
    return result;
  }

  async getActivePromotionForProduct(productId: string): Promise<Promotion | undefined> {
    const [promo] = await db.select().from(promotions)
      .where(and(
        eq(promotions.productId, productId),
        eq(promotions.isActive, true),
        sql`${promotions.startDate} <= NOW()`,
        sql`${promotions.endDate} >= NOW()`
      ))
      .orderBy(desc(promotions.discountPercent))
      .limit(1);
    return promo;
  }

  async getActivePromotions(): Promise<Promotion[]> {
    return db.select().from(promotions)
      .where(and(
        eq(promotions.isActive, true),
        sql`${promotions.startDate} <= NOW()`,
        sql`${promotions.endDate} >= NOW()`
      ));
  }

  async createPromotion(promotion: InsertPromotion): Promise<Promotion> {
    const [created] = await db.insert(promotions).values(promotion).returning();
    return created;
  }

  async updatePromotion(id: string, data: Partial<InsertPromotion>): Promise<Promotion | undefined> {
    const [updated] = await db.update(promotions).set(data).where(eq(promotions.id, id)).returning();
    return updated;
  }

  async deletePromotion(id: string): Promise<void> {
    await db.delete(promotions).where(eq(promotions.id, id));
  }

  async getDeliverySchedules(supplierId: string): Promise<(DeliverySchedule & { restaurant: User })[]> {
    const schedules = await db.select().from(deliverySchedules).where(eq(deliverySchedules.supplierId, supplierId));
    const restaurantIds = [...new Set(schedules.map(s => s.restaurantId))];
    if (restaurantIds.length === 0) return [];
    const restaurants = await db.select().from(users).where(inArray(users.id, restaurantIds));
    const restaurantMap = Object.fromEntries(restaurants.map(r => [r.id, r]));
    return schedules.map(s => ({ ...s, restaurant: restaurantMap[s.restaurantId] }));
  }

  async getDeliverySchedulesForRestaurant(supplierId: string, restaurantId: string): Promise<DeliverySchedule[]> {
    return db.select().from(deliverySchedules).where(
      and(eq(deliverySchedules.supplierId, supplierId), eq(deliverySchedules.restaurantId, restaurantId))
    );
  }

  async setDeliverySchedules(supplierId: string, restaurantId: string, days: number[]): Promise<void> {
    await db.delete(deliverySchedules).where(
      and(eq(deliverySchedules.supplierId, supplierId), eq(deliverySchedules.restaurantId, restaurantId))
    );
    if (days.length > 0) {
      await db.insert(deliverySchedules).values(
        days.map(day => ({ supplierId, restaurantId, dayOfWeek: day }))
      );
    }
  }

  async getCustomMinOrderQuantities(supplierId: string): Promise<(CustomMinOrderQuantity & { product: Product; restaurant: User })[]> {
    const rows = await db.select().from(customMinOrderQuantities)
      .where(eq(customMinOrderQuantities.supplierId, supplierId));
    if (rows.length === 0) return [];
    const productIds = [...new Set(rows.map(r => r.productId))];
    const restaurantIds = [...new Set(rows.map(r => r.restaurantId))];
    const productList = await db.select().from(products).where(inArray(products.id, productIds));
    const restaurantList = await db.select().from(users).where(inArray(users.id, restaurantIds));
    const productMap = Object.fromEntries(productList.map(p => [p.id, p]));
    const restaurantMap = Object.fromEntries(restaurantList.map(r => [r.id, r]));
    return rows.map(r => ({ ...r, product: productMap[r.productId], restaurant: restaurantMap[r.restaurantId] }));
  }

  async getCustomMinOrderQuantitiesByRestaurant(restaurantId: string): Promise<CustomMinOrderQuantity[]> {
    return db.select().from(customMinOrderQuantities)
      .where(eq(customMinOrderQuantities.restaurantId, restaurantId));
  }

  async getCustomMinOrderQuantity(productId: string, restaurantId: string): Promise<CustomMinOrderQuantity | undefined> {
    const [row] = await db.select().from(customMinOrderQuantities)
      .where(and(eq(customMinOrderQuantities.productId, productId), eq(customMinOrderQuantities.restaurantId, restaurantId)));
    return row;
  }

  async setCustomMinOrderQuantity(data: InsertCustomMinOrderQuantity): Promise<CustomMinOrderQuantity> {
    const existing = await this.getCustomMinOrderQuantity(data.productId, data.restaurantId);
    if (existing) {
      const [updated] = await db.update(customMinOrderQuantities)
        .set({ minOrderQuantity: data.minOrderQuantity })
        .where(eq(customMinOrderQuantities.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(customMinOrderQuantities).values(data).returning();
    return created;
  }

  async deleteCustomMinOrderQuantity(id: string): Promise<void> {
    await db.delete(customMinOrderQuantities).where(eq(customMinOrderQuantities.id, id));
  }
}

export const storage = new DatabaseStorage();
