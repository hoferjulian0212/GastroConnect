import { db } from "./db";
import { eq, and, desc, or, sql, ne, inArray, gte, isNull } from "drizzle-orm";
import {
  users, products, orders, orderItems, cartItems, conversations, messages, complaints, notifications, complaintComments, documents,
  orderStatusHistory, complaintStatusHistory, promotions, deliverySchedules, customMinOrderQuantities, customPrices, stockMovements,
  orderTemplates, orderTemplateItems, costSettings, overnightStays, minimumOrderValues, supplierRatings,
  type User, type InsertUser, type Product, type InsertProduct,
  type Order, type InsertOrder, type OrderItem, type InsertOrderItem,
  type CartItem, type InsertCartItem, type Conversation, type InsertConversation,
  type Message, type InsertMessage, type MessageWithOrderNumber, type ProductWithSupplier, type OrderWithDetails,
  type ConversationWithUser, type CartItemWithProduct, type Complaint, type InsertComplaint,
  type ComplaintWithDetails, type Notification, type InsertNotification, type UpdateComplaint,
  type ComplaintComment, type InsertComplaintComment, type ComplaintCommentWithUser,
  type Document, type InsertDocument, type DocumentWithDetails,
  type OrderStatusHistory, type OrderStatusHistoryWithUser,
  type ComplaintStatusHistory, type ComplaintStatusHistoryWithUser,
  type Promotion, type InsertPromotion, type PromotionWithProduct,
  type DeliverySchedule, type InsertDeliverySchedule,
  type CustomMinOrderQuantity, type InsertCustomMinOrderQuantity,
  type CustomPrice, type InsertCustomPrice,
  type StockMovement, type InsertStockMovement, type StockMovementWithProduct,
  type OrderTemplate, type InsertOrderTemplate, type InsertOrderTemplateItem, type OrderTemplateWithItems,
  pushSubscriptions, type InsertPushSubscription, type PushSubscription,
  type SupplierRating, type InsertSupplierRating, type UpdateSupplierRating
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUsersByRole(role: "restaurant" | "supplier"): Promise<User[]>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  updateLastSeen(userId: string): Promise<void>;
  getDashboardLayout(userId: string, role: string): Promise<Array<{ id: string; size: "full" | "half" }> | null>;
  setDashboardLayout(userId: string, role: string, layout: Array<{ id: string; size: "full" | "half" }>): Promise<void>;

  // Products
  getProducts(): Promise<ProductWithSupplier[]>;
  getProductsBySupplier(supplierId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;

  // Orders
  getOrdersByRestaurant(restaurantId: string, opts?: { status?: string | string[]; limit?: number }): Promise<OrderWithDetails[]>;
  getOrdersBySupplier(supplierId: string, opts?: { status?: string | string[]; limit?: number }): Promise<OrderWithDetails[]>;
  getRecentOrdersByRestaurant(restaurantId: string): Promise<OrderWithDetails[]>;
  getRecentOrdersBySupplier(supplierId: string): Promise<OrderWithDetails[]>;
  getOrder(id: string): Promise<OrderWithDetails | undefined>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrderStatus(id: string, status: string, requestedDeliveryDate?: string, deliveryNotes?: string | null): Promise<Order | undefined>;
  updateOrderItems(id: string, items: InsertOrderItem[], totalAmount: string, requestedDeliveryDate?: string | null): Promise<Order | undefined>;
  updateOrderItemConfirmation(orderItemId: string, confirmedQuantity: number, rejectedQuantity: number): Promise<OrderItem | undefined>;

  // Cart
  getCartItems(restaurantId: string): Promise<CartItemWithProduct[]>;
  getCartItem(id: string): Promise<CartItem | undefined>;
  getCartCount(restaurantId: string): Promise<number>;
  addToCart(item: InsertCartItem, mode?: "add" | "set"): Promise<CartItem>;
  updateCartItem(id: string, quantity: number): Promise<CartItem | undefined>;
  removeCartItem(id: string): Promise<void>;
  clearCart(restaurantId: string): Promise<void>;
  clearCartBySupplier(restaurantId: string, supplierId: string): Promise<void>;

  // Conversations & Messages
  getConversations(userId: string, role: "restaurant" | "supplier"): Promise<ConversationWithUser[]>;

  getConversation(conversationId: string): Promise<Conversation | undefined>;
  getOrCreateConversation(restaurantId: string, supplierId: string): Promise<Conversation>;
  getMessages(conversationId: string): Promise<MessageWithOrderNumber[]>;
  getConversationStatuses(conversationId: string): Promise<{ orderStatuses: Record<string, string>; complaintStatuses: Record<string, { status: string; complaintId: string }> }>;
  sendMessage(message: InsertMessage): Promise<Message>;
  getUnreadCount(userId: string): Promise<number>;
  markMessagesAsRead(conversationId: string, userId: string): Promise<void>;

  // Product Volumes (for price-comparison projections)
  getProductVolumesForRestaurant(restaurantId: string, days: number): Promise<Array<{
    productId: string;
    supplierId: string;
    totalQuantity: number;
    orderCount: number;
    lastOrderedAt: Date | null;
  }>>;

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
  getSupplierDetailedStats(supplierId: string, period?: "7d" | "30d" | "6m" | "12m"): Promise<{
    period: "7d" | "30d" | "6m" | "12m";
    bucket: "day" | "month";
    timeSeries: { key: string; revenue: number; orders: number }[];
    monthlyRevenue: { month: string; revenue: number }[];
    topProducts: { productId: string; name: string; quantity: number; revenue: number; previousQuantity: number }[];
    topCustomers: { restaurantId: string; name: string; orders: number; revenue: number }[];
    ordersByStatus: { status: string; count: number }[];
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    activeCustomers: number;
    previous: { totalRevenue: number; totalOrders: number; avgOrderValue: number; activeCustomers: number };
  }>;
  getSupplierInsights(supplierId: string): Promise<Array<{ type: string; title: string; count: number; link: string }>>;
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
  setDeliverySchedules(supplierId: string, restaurantId: string, days: { day: number; timeFrom?: string | null; timeTo?: string | null }[]): Promise<void>;

  // Promotions
  getPromotionsBySupplier(supplierId: string): Promise<PromotionWithProduct[]>;
  getActivePromotionForProduct(productId: string): Promise<Promotion | undefined>;
  getActivePromotions(): Promise<Promotion[]>;
  createPromotion(promotion: InsertPromotion): Promise<Promotion>;
  updatePromotion(id: string, data: Partial<InsertPromotion>): Promise<Promotion | undefined>;
  deletePromotion(id: string): Promise<void>;
  deletePromotionsByGroup(groupId: string): Promise<void>;

  // Custom Min Order Quantities
  getCustomMinOrderQuantities(supplierId: string): Promise<(CustomMinOrderQuantity & { product: Product; restaurant: User })[]>;
  getCustomMinOrderQuantitiesByRestaurant(restaurantId: string): Promise<CustomMinOrderQuantity[]>;
  getCustomMinOrderQuantity(productId: string, restaurantId: string): Promise<CustomMinOrderQuantity | undefined>;
  setCustomMinOrderQuantity(data: InsertCustomMinOrderQuantity): Promise<CustomMinOrderQuantity>;
  deleteCustomMinOrderQuantity(id: string): Promise<void>;

  // Custom Prices
  getCustomPrices(supplierId: string): Promise<(CustomPrice & { product: Product; restaurant: User })[]>;
  getCustomPricesByRestaurant(restaurantId: string): Promise<(CustomPrice & { product: Product; restaurant: User })[]>;
  getCustomPrice(productId: string, restaurantId: string): Promise<CustomPrice | undefined>;
  setCustomPrice(data: InsertCustomPrice): Promise<CustomPrice>;
  deleteCustomPrice(id: string): Promise<void>;

  // Stock Movements
  getStockMovements(productId: string): Promise<StockMovement[]>;
  getStockMovementsBySupplier(supplierId: string): Promise<StockMovementWithProduct[]>;
  getStockMovementsByOrder(orderId: string): Promise<StockMovement[]>;
  addStockMovement(movement: InsertStockMovement): Promise<StockMovement>;
  updateProductStock(productId: string, newStock: number): Promise<Product | undefined>;
  getLowStockProducts(supplierId: string): Promise<Product[]>;

  // Order Templates
  getOrderTemplates(restaurantId: string): Promise<OrderTemplateWithItems[]>;
  getOrderTemplate(id: string): Promise<OrderTemplateWithItems | undefined>;
  createOrderTemplate(template: InsertOrderTemplate, items: InsertOrderTemplateItem[]): Promise<OrderTemplate>;
  updateOrderTemplate(id: string, name: string, items: InsertOrderTemplateItem[]): Promise<OrderTemplate | undefined>;
  deleteOrderTemplate(id: string): Promise<void>;

  // Push Subscriptions
  getPushSubscriptions(userId: string): Promise<PushSubscription[]>;
  savePushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(endpoint: string): Promise<void>;

  // Supplier Ratings
  getRatingByOrder(orderId: string): Promise<SupplierRating | undefined>;
  getRatingById(id: string): Promise<SupplierRating | undefined>;
  getRatingsBySupplier(supplierId: string, limit?: number): Promise<(SupplierRating & { restaurant: User })[]>;
  getSupplierRatingSummary(supplierId: string): Promise<{ avg: number; count: number }>;
  getSupplierRatingSummaries(supplierIds: string[]): Promise<Record<string, { avg: number; count: number }>>;
  createRating(data: InsertSupplierRating): Promise<SupplierRating>;
  updateRating(id: string, data: UpdateSupplierRating): Promise<SupplierRating | undefined>;
  deleteRating(id: string): Promise<void>;
  flagRating(id: string, reason?: string): Promise<SupplierRating | undefined>;

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

  async updateLastSeen(userId: string): Promise<void> {
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
  }

  async getDashboardLayout(userId: string, role: string): Promise<Array<{ id: string; size: "full" | "half" }> | null> {
    const [u] = await db.select({ dashboardLayouts: users.dashboardLayouts }).from(users).where(eq(users.id, userId));
    if (!u) return null;
    const layouts = u.dashboardLayouts || {};
    return layouts[role] ?? null;
  }

  async setDashboardLayout(userId: string, role: string, layout: Array<{ id: string; size: "full" | "half" }>): Promise<void> {
    const [u] = await db.select({ dashboardLayouts: users.dashboardLayouts }).from(users).where(eq(users.id, userId));
    if (!u) return;
    const existing = u.dashboardLayouts || {};
    const next = { ...existing, [role]: layout };
    await db.update(users).set({ dashboardLayouts: next }).where(eq(users.id, userId));
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

  private generateArticleNumber(): string {
    return "GC-" + Math.random().toString(36).slice(2, 9).toUpperCase();
  }

  private async generateUniqueArticleNumber(supplierId: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = this.generateArticleNumber();
      const [existing] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.supplierId, supplierId), eq(products.articleNumber, candidate)))
        .limit(1);
      if (!existing) return candidate;
    }
    return this.generateArticleNumber() + "-" + Date.now().toString(36).toUpperCase();
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    let articleNumber = product.articleNumber?.trim() || null;
    if (!articleNumber) {
      articleNumber = await this.generateUniqueArticleNumber(product.supplierId);
    }
    const [created] = await db.insert(products).values({ ...product, articleNumber }).returning();
    return created;
  }

  async updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const payload: Partial<InsertProduct> = { ...data };
    if (Object.prototype.hasOwnProperty.call(payload, "articleNumber")) {
      const trimmed = (payload.articleNumber as string | null | undefined)?.toString().trim();
      if (!trimmed) {
        const [existing] = await db.select({ supplierId: products.supplierId }).from(products).where(eq(products.id, id));
        if (existing) {
          payload.articleNumber = await this.generateUniqueArticleNumber(existing.supplierId);
        } else {
          delete payload.articleNumber;
        }
      } else {
        payload.articleNumber = trimmed;
      }
    }
    const [updated] = await db.update(products).set(payload).where(eq(products.id, id)).returning();
    return updated;
  }

  async backfillArticleNumbers(): Promise<number> {
    const rows = await db.select({ id: products.id, supplierId: products.supplierId }).from(products).where(isNull(products.articleNumber));
    let updated = 0;
    for (const row of rows) {
      const num = await this.generateUniqueArticleNumber(row.supplierId);
      await db.update(products).set({ articleNumber: num }).where(eq(products.id, row.id));
      updated++;
    }
    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  private async enrichOrderItemsWithImages(items: OrderItem[]): Promise<OrderItem[]> {
    if (items.length === 0) return items;
    const productIds = [...new Set(items.map(i => i.productId))];
    const productRows = await db.select({ id: products.id, imageUrl: products.imageUrl }).from(products).where(inArray(products.id, productIds));
    const imageMap = new Map(productRows.map(p => [p.id, p.imageUrl]));
    return items.map(item => ({ ...item, productImageUrl: imageMap.get(item.productId) || null })) as any;
  }

  // Orders
  private async enrichOrderWithDetails(order: Order): Promise<OrderWithDetails> {
    const items = await this.enrichOrderItemsWithImages(await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)));
    const [restaurant] = await db.select().from(users).where(eq(users.id, order.restaurantId));
    const [supplier] = await db.select().from(users).where(eq(users.id, order.supplierId));
    let createdByUser: User | null = null;
    if (order.createdByUserId) {
      const [creator] = await db.select().from(users).where(eq(users.id, order.createdByUserId));
      createdByUser = creator || null;
    }
    return { ...order, items, restaurant, supplier, createdByUser };
  }

  async getOrdersByRestaurant(restaurantId: string, opts?: { status?: string | string[]; limit?: number }): Promise<OrderWithDetails[]> {
    const conditions = [eq(orders.restaurantId, restaurantId)];
    if (opts?.status) {
      const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
      conditions.push(inArray(orders.status, statuses as any));
    }
    let query = db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt));
    const ordersResult = opts?.limit ? await (query as any).limit(opts.limit) : await query;

    return Promise.all(ordersResult.map((order: Order) => this.enrichOrderWithDetails(order)));
  }

  async getOrdersBySupplier(supplierId: string, opts?: { status?: string | string[]; limit?: number }): Promise<OrderWithDetails[]> {
    const conditions = [eq(orders.supplierId, supplierId)];
    if (opts?.status) {
      const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
      conditions.push(inArray(orders.status, statuses as any));
    }
    let query = db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt));
    const ordersResult = opts?.limit ? await (query as any).limit(opts.limit) : await query;

    return Promise.all(ordersResult.map((order: Order) => this.enrichOrderWithDetails(order)));
  }

  async getProductVolumesForRestaurant(restaurantId: string, days: number): Promise<Array<{
    productId: string;
    supplierId: string;
    totalQuantity: number;
    orderCount: number;
    lastOrderedAt: Date | null;
  }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        productId: orderItems.productId,
        supplierId: orders.supplierId,
        totalQuantity: sql<number>`COALESCE(SUM(COALESCE(${orderItems.confirmedQuantity}, ${orderItems.quantity})), 0)::int`,
        orderCount: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
        lastOrderedAt: sql<Date | null>`MAX(${orders.createdAt})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(orders.restaurantId, restaurantId),
        gte(orders.createdAt, since),
        ne(orders.status, "cancelled"),
      ))
      .groupBy(orderItems.productId, orders.supplierId);
    return rows.map(r => ({
      productId: r.productId,
      supplierId: r.supplierId,
      totalQuantity: Number(r.totalQuantity) || 0,
      orderCount: Number(r.orderCount) || 0,
      lastOrderedAt: r.lastOrderedAt,
    }));
  }

  async getRecentOrdersByRestaurant(restaurantId: string): Promise<OrderWithDetails[]> {
    const recentOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.restaurantId, restaurantId))
      .orderBy(desc(orders.createdAt))
      .limit(5);

    return Promise.all(recentOrders.map(order => this.enrichOrderWithDetails(order)));
  }

  async getRecentOrdersBySupplier(supplierId: string): Promise<OrderWithDetails[]> {
    const recentOrders = await db
      .select()
      .from(orders)
      .where(and(eq(orders.supplierId, supplierId), eq(orders.status, "pending")))
      .orderBy(desc(orders.createdAt))
      .limit(5);

    return Promise.all(recentOrders.map(order => this.enrichOrderWithDetails(order)));
  }

  async getOrder(id: string): Promise<OrderWithDetails | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;
    
    return this.enrichOrderWithDetails(order);
  }

  private generateOrderNumber(): string {
    return "B-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  private async generateUniqueOrderNumber(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = this.generateOrderNumber();
      const [existing] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.orderNumber, candidate))
        .limit(1);
      if (!existing) return candidate;
    }
    return this.generateOrderNumber() + "-" + Date.now().toString(36).toUpperCase();
  }

  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const orderNumber = await this.generateUniqueOrderNumber();
    const [created] = await db.insert(orders).values({ ...order, orderNumber }).returning();
    
    for (const item of items) {
      await db.insert(orderItems).values({ ...item, orderId: created.id });
    }
    
    return created;
  }

  async backfillOrderNumbers(): Promise<number> {
    const rows = await db.select({ id: orders.id }).from(orders).where(isNull(orders.orderNumber));
    let updated = 0;
    for (const row of rows) {
      const num = await this.generateUniqueOrderNumber();
      await db.update(orders).set({ orderNumber: num }).where(eq(orders.id, row.id));
      updated++;
    }
    return updated;
  }

  async updateOrderStatus(id: string, status: string, requestedDeliveryDate?: string, deliveryNotes?: string | null): Promise<Order | undefined> {
    const setData: any = { status: status as any, updatedAt: new Date() };
    if (requestedDeliveryDate !== undefined) {
      setData.requestedDeliveryDate = requestedDeliveryDate;
    }
    if (deliveryNotes !== undefined) {
      setData.deliveryNotes = deliveryNotes;
    }
    const [updated] = await db
      .update(orders)
      .set(setData)
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  async updateOrderItems(id: string, items: InsertOrderItem[], totalAmount: string, requestedDeliveryDate?: string | null): Promise<Order | undefined> {
    return await db.transaction(async (tx) => {
      await tx.delete(orderItems).where(eq(orderItems.orderId, id));
      if (items.length > 0) {
        await tx.insert(orderItems).values(items.map(item => ({ ...item, orderId: id })));
      }
      const setData: any = { totalAmount, updatedAt: new Date() };
      if (requestedDeliveryDate !== undefined) {
        setData.requestedDeliveryDate = requestedDeliveryDate;
      }
      const [updated] = await tx
        .update(orders)
        .set(setData)
        .where(eq(orders.id, id))
        .returning();
      return updated;
    });
  }

  async updateOrderItemConfirmation(orderItemId: string, confirmedQuantity: number, rejectedQuantity: number): Promise<OrderItem | undefined> {
    const [updated] = await db
      .update(orderItems)
      .set({ confirmedQuantity, rejectedQuantity })
      .where(eq(orderItems.id, orderItemId))
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

  async addToCart(item: InsertCartItem, mode: "add" | "set" = "add"): Promise<CartItem> {
    const [existing] = await db
      .select()
      .from(cartItems)
      .where(and(
        eq(cartItems.restaurantId, item.restaurantId),
        eq(cartItems.productId, item.productId)
      ));

    if (existing) {
      const newQuantity = mode === "set" ? (item.quantity || 1) : existing.quantity + (item.quantity || 1);
      const [updated] = await db
        .update(cartItems)
        .set({ quantity: newQuantity })
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

  async clearCartBySupplier(restaurantId: string, supplierId: string): Promise<void> {
    await db.delete(cartItems).where(and(eq(cartItems.restaurantId, restaurantId), eq(cartItems.supplierId, supplierId)));
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

    if (convs.length === 0) return [];

    const otherUserIds = [...new Set(convs.map(c => role === "restaurant" ? c.supplierId : c.restaurantId))];
    const otherUsers = await db.select().from(users).where(inArray(users.id, otherUserIds));
    const userMap = new Map(otherUsers.map(u => [u.id, u]));

    const convIds = convs.map(c => c.id);

    const lastMsgResults = await Promise.all(
      convIds.map(convId => db
        .select({ message: messages, orderNumber: orders.orderNumber })
        .from(messages)
        .leftJoin(orders, eq(messages.orderId, orders.id))
        .where(eq(messages.conversationId, convId))
        .orderBy(desc(messages.createdAt))
        .limit(1))
    );
    const lastMsgMap = new Map<string, MessageWithOrderNumber>();
    for (const [i, rows] of lastMsgResults.entries()) {
      if (rows.length > 0) {
        const r = rows[0];
        lastMsgMap.set(convIds[i], { ...r.message, orderNumber: r.orderNumber });
      }
    }

    const unreadCounts = await db
      .select({ conversationId: messages.conversationId, count: sql<number>`count(*)` })
      .from(messages)
      .where(and(
        inArray(messages.conversationId, convIds),
        ne(messages.senderId, userId),
        eq(messages.isRead, false)
      ))
      .groupBy(messages.conversationId);
    const unreadMap = new Map(unreadCounts.map(u => [u.conversationId, Number(u.count)]));

    return convs.map(conv => {
      const otherUserId = role === "restaurant" ? conv.supplierId : conv.restaurantId;
      return {
        ...conv,
        otherUser: userMap.get(otherUserId)!,
        lastMessage: lastMsgMap.get(conv.id),
        unreadCount: unreadMap.get(conv.id) || 0
      };
    });
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

  async getMessages(conversationId: string): Promise<MessageWithOrderNumber[]> {
    const rows = await db
      .select({ message: messages, orderNumber: orders.orderNumber })
      .from(messages)
      .leftJoin(orders, eq(messages.orderId, orders.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
    return rows.map(r => ({ ...r.message, orderNumber: r.orderNumber }));
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

  async getSupplierDetailedStats(supplierId: string, period: "7d" | "30d" | "6m" | "12m" = "6m"): Promise<{
    period: "7d" | "30d" | "6m" | "12m";
    bucket: "day" | "month";
    timeSeries: { key: string; revenue: number; orders: number }[];
    monthlyRevenue: { month: string; revenue: number }[];
    topProducts: { productId: string; name: string; quantity: number; revenue: number; previousQuantity: number }[];
    topCustomers: { restaurantId: string; name: string; orders: number; revenue: number }[];
    ordersByStatus: { status: string; count: number }[];
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    activeCustomers: number;
    currentMonthRevenue: number;
    previous: { totalRevenue: number; totalOrders: number; avgOrderValue: number; activeCustomers: number };
  }> {
    const now = new Date();
    const bucket: "day" | "month" = period === "7d" || period === "30d" ? "day" : "month";

    let currentFrom = new Date(now);
    let prevFrom = new Date(now);
    let prevTo = new Date(now);

    if (period === "7d") {
      currentFrom = new Date(now); currentFrom.setDate(now.getDate() - 6); currentFrom.setHours(0, 0, 0, 0);
      prevTo = new Date(currentFrom); prevTo.setMilliseconds(prevTo.getMilliseconds() - 1);
      prevFrom = new Date(currentFrom); prevFrom.setDate(currentFrom.getDate() - 7);
    } else if (period === "30d") {
      currentFrom = new Date(now); currentFrom.setDate(now.getDate() - 29); currentFrom.setHours(0, 0, 0, 0);
      prevTo = new Date(currentFrom); prevTo.setMilliseconds(prevTo.getMilliseconds() - 1);
      prevFrom = new Date(currentFrom); prevFrom.setDate(currentFrom.getDate() - 30);
    } else if (period === "6m") {
      currentFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
      prevTo = new Date(currentFrom); prevTo.setMilliseconds(prevTo.getMilliseconds() - 1);
      prevFrom = new Date(currentFrom.getFullYear(), currentFrom.getMonth() - 6, 1, 0, 0, 0, 0);
    } else {
      currentFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
      prevTo = new Date(currentFrom); prevTo.setMilliseconds(prevTo.getMilliseconds() - 1);
      prevFrom = new Date(currentFrom.getFullYear(), currentFrom.getMonth() - 12, 1, 0, 0, 0, 0);
    }

    // Current month boundary (independent of selected period — used for the monthly revenue goal)
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    // Time series (current period) bucketed
    const seriesFmt = bucket === "day" ? "YYYY-MM-DD" : "YYYY-MM";
    const seriesResult = await db.execute(sql`
      SELECT
        TO_CHAR(created_at, ${seriesFmt}) as key,
        COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0) as revenue,
        COUNT(*) as orders
      FROM orders
      WHERE supplier_id = ${supplierId}
        AND status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
        AND created_at >= ${currentFrom}
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    // Build full series with zeros
    const seriesMap = new Map<string, { revenue: number; orders: number }>();
    for (const r of (seriesResult.rows || [])) {
      seriesMap.set(String((r as any).key), { revenue: Number((r as any).revenue) || 0, orders: Number((r as any).orders) || 0 });
    }
    const timeSeries: { key: string; revenue: number; orders: number }[] = [];
    if (bucket === "day") {
      const days = period === "7d" ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const f = seriesMap.get(key);
        timeSeries.push({ key, revenue: f?.revenue || 0, orders: f?.orders || 0 });
      }
    } else {
      const months = period === "6m" ? 6 : 12;
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const f = seriesMap.get(key);
        timeSeries.push({ key, revenue: f?.revenue || 0, orders: f?.orders || 0 });
      }
    }

    const monthlyRevenue = bucket === "month"
      ? timeSeries.map(t => ({ month: t.key, revenue: t.revenue }))
      : (() => {
          const arr: { month: string; revenue: number }[] = [];
          for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            arr.push({ month: key, revenue: 0 });
          }
          return arr;
        })();

    // Current totals
    const totalsCur = await db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0) as total_revenue,
        COUNT(*) as total_orders,
        COUNT(DISTINCT restaurant_id) as active_customers
      FROM orders
      WHERE supplier_id = ${supplierId}
        AND status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
        AND created_at >= ${currentFrom}
    `);
    const totalRevenue = Number(totalsCur.rows?.[0]?.total_revenue) || 0;
    const totalOrders = Number(totalsCur.rows?.[0]?.total_orders) || 0;
    const activeCustomers = Number(totalsCur.rows?.[0]?.active_customers) || 0;

    // Previous totals
    const totalsPrev = await db.execute(sql`
      SELECT
        COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0) as total_revenue,
        COUNT(*) as total_orders,
        COUNT(DISTINCT restaurant_id) as active_customers
      FROM orders
      WHERE supplier_id = ${supplierId}
        AND status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
        AND created_at >= ${prevFrom}
        AND created_at <= ${prevTo}
    `);
    const prevRevenue = Number(totalsPrev.rows?.[0]?.total_revenue) || 0;
    const prevOrders = Number(totalsPrev.rows?.[0]?.total_orders) || 0;
    const prevActive = Number(totalsPrev.rows?.[0]?.active_customers) || 0;

    // Current calendar month revenue (independent of selected period — used for monthly revenue goal)
    const currentMonthRes = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0) as revenue
      FROM orders
      WHERE supplier_id = ${supplierId}
        AND status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
        AND created_at >= ${startOfThisMonth}
    `);
    const currentMonthRevenue = Number(currentMonthRes.rows?.[0]?.revenue) || 0;

    // Top products in period
    const topProductsResult = await db.execute(sql`
      SELECT
        oi.product_id as product_id,
        MAX(oi.product_name) as name,
        SUM(oi.quantity) as quantity,
        COALESCE(SUM(CAST(oi.total_price AS DECIMAL)), 0) as revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.supplier_id = ${supplierId}
        AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
        AND o.created_at >= ${currentFrom}
      GROUP BY oi.product_id
      ORDER BY quantity DESC
      LIMIT 6
    `);
    const productIds = (topProductsResult.rows || []).map((r: any) => r.product_id).filter(Boolean);

    // Previous-period quantities for the same products
    let prevQtyMap = new Map<string, number>();
    if (productIds.length > 0) {
      const prevQty = await db.execute(sql`
        SELECT
          oi.product_id as product_id,
          SUM(oi.quantity) as quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.supplier_id = ${supplierId}
          AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
          AND o.created_at >= ${prevFrom}
          AND o.created_at <= ${prevTo}
          AND oi.product_id IN (${sql.join(productIds.map((id: string) => sql`${id}`), sql`, `)})
        GROUP BY oi.product_id
      `);
      for (const r of (prevQty.rows || [])) {
        prevQtyMap.set(String((r as any).product_id), Number((r as any).quantity) || 0);
      }
    }

    // Top customers in period
    const topCustomersResult = await db.execute(sql`
      SELECT
        o.restaurant_id as restaurant_id,
        COALESCE(MAX(u.company_name), MAX(u.name)) as name,
        COUNT(*) as orders,
        COALESCE(SUM(CAST(o.total_amount AS DECIMAL)), 0) as revenue
      FROM orders o
      LEFT JOIN users u ON u.id = o.restaurant_id
      WHERE o.supplier_id = ${supplierId}
        AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
        AND o.created_at >= ${currentFrom}
      GROUP BY o.restaurant_id
      ORDER BY revenue DESC
      LIMIT 6
    `);

    const ordersByStatusResult = await db.execute(sql`
      SELECT status, COUNT(*) as count
      FROM orders
      WHERE supplier_id = ${supplierId}
      GROUP BY status
    `);

    return {
      period,
      bucket,
      timeSeries,
      monthlyRevenue,
      topProducts: (topProductsResult.rows || []).map((r: any) => ({
        productId: r.product_id,
        name: r.name,
        quantity: Number(r.quantity) || 0,
        revenue: Number(r.revenue) || 0,
        previousQuantity: prevQtyMap.get(String(r.product_id)) || 0,
      })),
      topCustomers: (topCustomersResult.rows || []).map((r: any) => ({
        restaurantId: r.restaurant_id,
        name: r.name || "—",
        orders: Number(r.orders) || 0,
        revenue: Number(r.revenue) || 0,
      })),
      ordersByStatus: (ordersByStatusResult.rows || []).map((r: any) => ({
        status: r.status,
        count: Number(r.count) || 0,
      })),
      totalRevenue,
      totalOrders,
      avgOrderValue: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
      activeCustomers,
      currentMonthRevenue,
      previous: {
        totalRevenue: prevRevenue,
        totalOrders: prevOrders,
        avgOrderValue: prevOrders > 0 ? Math.round((prevRevenue / prevOrders) * 100) / 100 : 0,
        activeCustomers: prevActive,
      },
    };
  }

  async getSupplierInsights(supplierId: string): Promise<Array<{ type: string; title: string; count: number; link: string }>> {
    const insights: Array<{ type: string; title: string; count: number; link: string }> = [];

    // 1) Inactive customers (>= 30 days no order, but had >= 2 orders in 90 days before that)
    const inactiveResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM (
        SELECT o.restaurant_id,
          MAX(o.created_at) AS last_order,
          COUNT(*) FILTER (WHERE o.created_at < (NOW() - INTERVAL '30 days') AND o.created_at >= (NOW() - INTERVAL '120 days')) AS prior_count
        FROM orders o
        WHERE o.supplier_id = ${supplierId}
          AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
        GROUP BY o.restaurant_id
        HAVING MAX(o.created_at) < (NOW() - INTERVAL '30 days')
          AND COUNT(*) FILTER (WHERE o.created_at < (NOW() - INTERVAL '30 days') AND o.created_at >= (NOW() - INTERVAL '120 days')) >= 2
      ) sub
    `);
    const inactiveCount = Number((inactiveResult.rows?.[0] as any)?.count) || 0;
    if (inactiveCount > 0) {
      insights.push({
        type: "inactive_customers",
        title: "inactive_customers",
        count: inactiveCount,
        link: "/supplier/restaurants",
      });
    }

    // 2) Low stock among top products (intersection)
    const lowStockTopResult = await db.execute(sql`
      WITH top_products AS (
        SELECT oi.product_id
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.supplier_id = ${supplierId}
          AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
          AND o.created_at >= (NOW() - INTERVAL '90 days')
        GROUP BY oi.product_id
        ORDER BY SUM(oi.quantity) DESC
        LIMIT 10
      )
      SELECT COUNT(*)::int AS count
      FROM products p
      JOIN top_products t ON t.product_id = p.id
      WHERE p.supplier_id = ${supplierId}
        AND COALESCE(p.low_stock_threshold, 0) > 0
        AND COALESCE(p.stock_quantity, 0) <= COALESCE(p.low_stock_threshold, 0)
    `);
    const lowStockTopCount = Number((lowStockTopResult.rows?.[0] as any)?.count) || 0;
    if (lowStockTopCount > 0) {
      insights.push({
        type: "low_stock_top",
        title: "low_stock_top",
        count: lowStockTopCount,
        link: "/supplier/products",
      });
    }

    // 3) Strongly trending products (current 30d vs prior 30d, top up-mover by qty delta)
    const trendingResult = await db.execute(sql`
      WITH cur AS (
        SELECT oi.product_id, MAX(oi.product_name) AS name, SUM(oi.quantity) AS qty
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.supplier_id = ${supplierId}
          AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
          AND o.created_at >= (NOW() - INTERVAL '30 days')
        GROUP BY oi.product_id
      ),
      prev AS (
        SELECT oi.product_id, SUM(oi.quantity) AS qty
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.supplier_id = ${supplierId}
          AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'partially_confirmed')
          AND o.created_at < (NOW() - INTERVAL '30 days')
          AND o.created_at >= (NOW() - INTERVAL '60 days')
        GROUP BY oi.product_id
      )
      SELECT COUNT(*)::int AS count
      FROM cur
      LEFT JOIN prev ON prev.product_id = cur.product_id
      WHERE cur.qty >= 10
        AND (COALESCE(prev.qty, 0) = 0 OR (cur.qty::numeric / NULLIF(prev.qty, 0)) >= 1.5)
    `);
    const trendingCount = Number((trendingResult.rows?.[0] as any)?.count) || 0;
    if (trendingCount > 0) {
      insights.push({
        type: "trending_up",
        title: "trending_up",
        count: trendingCount,
        link: "/supplier/products",
      });
    }

    return insights.slice(0, 3);
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

  private generateComplaintNumber(): string {
    return "R-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  private async generateUniqueComplaintNumber(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = this.generateComplaintNumber();
      const [existing] = await db
        .select({ id: complaints.id })
        .from(complaints)
        .where(eq(complaints.complaintNumber, candidate))
        .limit(1);
      if (!existing) return candidate;
    }
    return this.generateComplaintNumber() + "-" + Date.now().toString(36).toUpperCase();
  }

  async createComplaint(complaint: InsertComplaint): Promise<Complaint> {
    const complaintNumber = await this.generateUniqueComplaintNumber();
    const [created] = await db.insert(complaints).values({ ...complaint, complaintNumber }).returning();
    return created;
  }

  async backfillComplaintNumbers(): Promise<number> {
    const rows = await db.select({ id: complaints.id }).from(complaints).where(isNull(complaints.complaintNumber));
    let updated = 0;
    for (const row of rows) {
      const num = await this.generateUniqueComplaintNumber();
      await db.update(complaints).set({ complaintNumber: num }).where(eq(complaints.id, row.id));
      updated++;
    }
    return updated;
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

  async getOrderTemplates(restaurantId: string): Promise<OrderTemplateWithItems[]> {
    const templates = await db.select().from(orderTemplates)
      .where(eq(orderTemplates.restaurantId, restaurantId))
      .orderBy(desc(orderTemplates.updatedAt));
    
    const result: OrderTemplateWithItems[] = [];
    for (const template of templates) {
      const items = await db.select().from(orderTemplateItems)
        .where(eq(orderTemplateItems.templateId, template.id));
      
      const itemsWithProducts: OrderTemplateWithItems["items"] = [];
      for (const item of items) {
        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        if (product) {
          const [supplier] = await db.select().from(users).where(eq(users.id, product.supplierId));
          if (supplier) {
            itemsWithProducts.push({ ...item, product: { ...product, supplier } });
          }
        }
      }
      result.push({ ...template, items: itemsWithProducts });
    }
    return result;
  }

  async getOrderTemplate(id: string): Promise<OrderTemplateWithItems | undefined> {
    const [template] = await db.select().from(orderTemplates).where(eq(orderTemplates.id, id));
    if (!template) return undefined;
    
    const items = await db.select().from(orderTemplateItems)
      .where(eq(orderTemplateItems.templateId, template.id));
    
    const itemsWithProducts: OrderTemplateWithItems["items"] = [];
    for (const item of items) {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId));
      if (product) {
        const [supplier] = await db.select().from(users).where(eq(users.id, product.supplierId));
        if (supplier) {
          itemsWithProducts.push({ ...item, product: { ...product, supplier } });
        }
      }
    }
    return { ...template, items: itemsWithProducts };
  }

  async createOrderTemplate(template: InsertOrderTemplate, items: InsertOrderTemplateItem[]): Promise<OrderTemplate> {
    const id = randomUUID();
    const [created] = await db.insert(orderTemplates).values({ ...template, id }).returning();
    for (const item of items) {
      await db.insert(orderTemplateItems).values({ ...item, id: randomUUID(), templateId: id });
    }
    return created;
  }

  async updateOrderTemplate(id: string, name: string, items: InsertOrderTemplateItem[]): Promise<OrderTemplate | undefined> {
    const [updated] = await db.update(orderTemplates)
      .set({ name, updatedAt: new Date() })
      .where(eq(orderTemplates.id, id))
      .returning();
    if (!updated) return undefined;
    
    await db.delete(orderTemplateItems).where(eq(orderTemplateItems.templateId, id));
    for (const item of items) {
      await db.insert(orderTemplateItems).values({ ...item, id: randomUUID(), templateId: id });
    }
    return updated;
  }

  async deleteOrderTemplate(id: string): Promise<void> {
    await db.delete(orderTemplateItems).where(eq(orderTemplateItems.templateId, id));
    await db.delete(orderTemplates).where(eq(orderTemplates.id, id));
  }

  // ===== Supplier Ratings =====
  async getRatingByOrder(orderId: string): Promise<SupplierRating | undefined> {
    const [r] = await db.select().from(supplierRatings).where(eq(supplierRatings.orderId, orderId));
    return r;
  }

  async getRatingById(id: string): Promise<SupplierRating | undefined> {
    const [r] = await db.select().from(supplierRatings).where(eq(supplierRatings.id, id));
    return r;
  }

  async getRatingsBySupplier(supplierId: string, limit = 50): Promise<(SupplierRating & { restaurant: User })[]> {
    const rows = await db
      .select()
      .from(supplierRatings)
      .leftJoin(users, eq(supplierRatings.restaurantId, users.id))
      .where(eq(supplierRatings.supplierId, supplierId))
      .orderBy(desc(supplierRatings.createdAt))
      .limit(limit);
    return rows.map(r => ({ ...r.supplier_ratings, restaurant: r.users! }));
  }

  async getSupplierRatingSummary(supplierId: string): Promise<{ avg: number; count: number }> {
    const [row] = await db
      .select({
        avg: sql<string>`COALESCE(AVG(${supplierRatings.stars}), 0)`,
        count: sql<string>`COUNT(*)`,
      })
      .from(supplierRatings)
      .where(eq(supplierRatings.supplierId, supplierId));
    return { avg: Number(row?.avg || 0), count: Number(row?.count || 0) };
  }

  async getSupplierRatingSummaries(supplierIds: string[]): Promise<Record<string, { avg: number; count: number }>> {
    const out: Record<string, { avg: number; count: number }> = {};
    if (supplierIds.length === 0) return out;
    const rows = await db
      .select({
        supplierId: supplierRatings.supplierId,
        avg: sql<string>`AVG(${supplierRatings.stars})`,
        count: sql<string>`COUNT(*)`,
      })
      .from(supplierRatings)
      .where(inArray(supplierRatings.supplierId, supplierIds))
      .groupBy(supplierRatings.supplierId);
    for (const r of rows) out[r.supplierId] = { avg: Number(r.avg || 0), count: Number(r.count || 0) };
    return out;
  }

  async createRating(data: InsertSupplierRating): Promise<SupplierRating> {
    const [created] = await db.insert(supplierRatings).values(data).returning();
    return created;
  }

  async updateRating(id: string, data: UpdateSupplierRating): Promise<SupplierRating | undefined> {
    const [updated] = await db
      .update(supplierRatings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supplierRatings.id, id))
      .returning();
    return updated;
  }

  async deleteRating(id: string): Promise<void> {
    await db.delete(supplierRatings).where(eq(supplierRatings.id, id));
  }

  async flagRating(id: string, reason?: string): Promise<SupplierRating | undefined> {
    const [updated] = await db
      .update(supplierRatings)
      .set({ flaggedAt: new Date(), flaggedReason: reason ?? null })
      .where(eq(supplierRatings.id, id))
      .returning();
    return updated;
  }

  async seedData(): Promise<void> {
    const DEMO_VERSION = "demo-v8";
    const sentinelEmail = `${DEMO_VERSION}@gastroconnect.dev`;
    const existing = await db.select().from(users).where(eq(users.email, sentinelEmail));
    if (existing.length > 0) {
      console.log(`Demo data ${DEMO_VERSION} already present, skipping seed.`);
      return;
    }

    console.log(`Wiping existing data and seeding ${DEMO_VERSION}...`);
    // Wipe in FK-safe reverse order
    await db.delete(stockMovements);
    await db.delete(complaintComments);
    await db.delete(complaintStatusHistory);
    await db.delete(complaints);
    await db.delete(orderStatusHistory);
    await db.delete(documents);
    await db.delete(orderTemplateItems);
    await db.delete(orderTemplates);
    await db.delete(orderItems);
    await db.delete(cartItems);
    await db.delete(messages);
    await db.delete(conversations);
    await db.delete(orders);
    await db.delete(notifications);
    await db.delete(promotions);
    await db.delete(customPrices);
    await db.delete(customMinOrderQuantities);
    await db.delete(deliverySchedules);
    await db.delete(pushSubscriptions);
    await db.delete(costSettings);
    await db.delete(overnightStays);
    await db.delete(minimumOrderValues);
    await db.delete(products);
    await db.delete(users);

    const avatar = (n: number) => `https://i.pravatar.cc/300?img=${n}`;
    const unsplash = (id: string, w = 600, h = 600) => `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&auto=format`;

    // ===== USERS =====
    const restaurant1 = await this.createUser({
      role: "restaurant", name: "Thomas Weber", email: "thomas@biergarten-muenchen.de",
      phone: "+49 89 1234567", companyName: "Biergarten München",
      address: "Marienplatz 1", city: "München", postalCode: "80331",
      description: "Traditioneller Biergarten im Herzen von München mit 200 Plätzen",
      profileImageUrl: avatar(12),
    });
    const restaurant2 = await this.createUser({
      role: "restaurant", name: "Maria Schmidt", email: "maria@pizzeria-bella.de",
      phone: "+49 30 9876543", companyName: "Pizzeria Bella Italia",
      address: "Friedrichstraße 45", city: "Berlin", postalCode: "10117",
      description: "Authentische italienische Küche, Steinofenpizza & hausgemachte Pasta",
      profileImageUrl: avatar(45),
    });
    const restaurant3 = await this.createUser({
      role: "restaurant", name: "Klaus Fischer", email: "klaus@gasthof-alpenblick.de",
      phone: "+49 8821 12345", companyName: "Gasthof Alpenblick",
      address: "Bergstraße 12", city: "Garmisch-Partenkirchen", postalCode: "82467",
      description: "Bayerische Spezialitäten mit Alpenblick, 4-Sterne Hotel mit 60 Zimmern",
      profileImageUrl: avatar(53),
    });
    const restaurant4 = await this.createUser({
      role: "restaurant", name: "Marco Bianchi", email: "marco@trattoria-roma.de",
      phone: "+49 40 5544332", companyName: "Trattoria Roma",
      address: "Hafenstraße 22", city: "Hamburg", postalCode: "20359",
      description: "Familiengeführte Trattoria mit Blick auf den Hafen",
      profileImageUrl: avatar(33),
    });
    const restaurant5 = await this.createUser({
      role: "restaurant", name: "Sophie Laurent", email: "sophie@bistro-paris.de",
      phone: "+49 221 6677889", companyName: "Bistro Paris",
      address: "Hohe Straße 88", city: "Köln", postalCode: "50667",
      description: "Französische Bistroküche, Weinkarte mit über 200 Positionen",
      profileImageUrl: avatar(47),
    });

    const supplier1 = await this.createUser({
      role: "supplier", name: "Hans Müller", email: "hans@frische-produkte.de",
      phone: "+49 89 5555666", companyName: "Frische Produkte GmbH",
      address: "Industriestraße 23", city: "München", postalCode: "80939",
      description: "Ihr Partner für frisches Obst und Gemüse — täglich vom Großmarkt",
      profileImageUrl: avatar(13),
    });
    const supplier2 = await this.createUser({
      role: "supplier", name: "Anna Bauer", email: "anna@metzgerei-bauer.de",
      phone: "+49 89 7778899", companyName: "Metzgerei Bauer",
      address: "Fleischweg 5", city: "München", postalCode: "80469",
      description: "Qualitätsfleisch aus der Region — Bio-zertifiziert seit 1985",
      profileImageUrl: avatar(20),
    });
    const supplier3 = await this.createUser({
      role: "supplier", name: "Peter Klein", email: "peter@getraenke-klein.de",
      phone: "+49 89 3334455", companyName: "Getränke Klein",
      address: "Braustraße 88", city: "München", postalCode: "80337",
      description: "Getränke-Großhandel für die Gastronomie — Bier, Wein, Spirituosen",
      profileImageUrl: avatar(60),
    });
    const supplier4 = await this.createUser({
      role: "supplier", name: "Julia Romano", email: "julia@italia-import.de",
      phone: "+49 89 9988776", companyName: "Italia Import GmbH",
      address: "Mailänder Straße 7", city: "München", postalCode: "80939",
      description: "Italienische Spezialitäten — Olivenöl, Pasta, Käse direkt vom Erzeuger",
      profileImageUrl: avatar(44),
    });
    const supplier5 = await this.createUser({
      role: "supplier", name: "Erik Andersen", email: "erik@nordsee-fisch.de",
      phone: "+49 471 112233", companyName: "Nordsee Fisch & Meer",
      address: "Fischhafen 1", city: "Bremerhaven", postalCode: "27572",
      description: "Frischfisch und Meeresfrüchte — täglich gefangen, schnell geliefert",
      profileImageUrl: avatar(11),
    });

    // Sentinel marker user (hidden, just for version detection)
    await this.createUser({
      role: "supplier", name: "Demo Marker", email: sentinelEmail,
      companyName: "Demo Marker (intern)",
    });

    // ===== PRODUCTS =====
    // Supplier 1 (Frische Produkte) — local images for the originals
    const p_tomaten = await this.createProduct({ supplierId: supplier1.id, name: "Bio Tomaten", description: "Frische Bio-Tomaten aus regionalem Anbau", price: "3.99", unit: "kg", category: "Gemüse", inStock: true, stockQuantity: 100, lowStockThreshold: 20, imageUrl: "/images/products/bio-tomaten.png" });
    const p_salat = await this.createProduct({ supplierId: supplier1.id, name: "Eisbergsalat", description: "Knackiger Eisbergsalat", price: "1.49", unit: "Stück", category: "Gemüse", inStock: true, stockQuantity: 50, lowStockThreshold: 10, imageUrl: "/images/products/eisbergsalat.png" });
    const p_karotten = await this.createProduct({ supplierId: supplier1.id, name: "Karotten", description: "Frische Karotten im Bund", price: "2.29", unit: "kg", category: "Gemüse", inStock: true, stockQuantity: 80, lowStockThreshold: 15, imageUrl: "/images/products/karotten.png" });
    const p_aepfel = await this.createProduct({ supplierId: supplier1.id, name: "Bio Äpfel", description: "Knackige Bio-Äpfel, Sorte Elstar", price: "4.49", unit: "kg", category: "Obst", inStock: true, stockQuantity: 60, lowStockThreshold: 12, imageUrl: "/images/products/bio-aepfel.png" });
    const p_zitronen = await this.createProduct({ supplierId: supplier1.id, name: "Zitronen", description: "Frische Zitronen aus Sizilien", price: "3.29", unit: "kg", category: "Obst", inStock: true, stockQuantity: 40, lowStockThreshold: 8, imageUrl: "/images/products/zitronen.png" });
    await this.createProduct({ supplierId: supplier1.id, name: "Bio Gurken", description: "Knackfrische Salatgurken aus Bio-Anbau", price: "1.99", unit: "Stück", category: "Gemüse", inStock: true, stockQuantity: 70, lowStockThreshold: 15, imageUrl: "/images/products/bio-gurken.png" });
    await this.createProduct({ supplierId: supplier1.id, name: "Paprika rot", description: "Süße rote Paprika", price: "4.79", unit: "kg", category: "Gemüse", inStock: true, stockQuantity: 35, lowStockThreshold: 10, imageUrl: "/images/products/paprika-rot.png" });
    await this.createProduct({ supplierId: supplier1.id, name: "Champignons", description: "Frische Champignons, weiß", price: "5.49", unit: "kg", category: "Gemüse", inStock: true, stockQuantity: 25, lowStockThreshold: 5, imageUrl: "/images/products/champignons.png" });
    await this.createProduct({ supplierId: supplier1.id, name: "Kartoffeln", description: "Festkochende Kartoffeln, Sorte Annabelle", price: "1.29", unit: "kg", category: "Gemüse", inStock: true, stockQuantity: 250, lowStockThreshold: 50, imageUrl: "/images/products/kartoffeln.png" });
    await this.createProduct({ supplierId: supplier1.id, name: "Zwiebeln", description: "Gelbe Speisezwiebeln", price: "1.49", unit: "kg", category: "Gemüse", inStock: true, stockQuantity: 120, lowStockThreshold: 25, imageUrl: "/images/products/zwiebeln.png" });
    await this.createProduct({ supplierId: supplier1.id, name: "Bananen", description: "Fairtrade Bananen aus Ecuador", price: "2.19", unit: "kg", category: "Obst", inStock: true, stockQuantity: 90, lowStockThreshold: 20, imageUrl: "/images/products/bananen.png" });
    await this.createProduct({ supplierId: supplier1.id, name: "Erdbeeren", description: "Saisonale Erdbeeren, 500g Schale", price: "3.99", unit: "Schale", category: "Obst", inStock: false, stockQuantity: 0, lowStockThreshold: 10, imageUrl: "/images/products/erdbeeren.png" });

    // Supplier 2 (Metzgerei) — local images
    const p_schnitzel = await this.createProduct({ supplierId: supplier2.id, name: "Schweineschnitzel", description: "Zartes Schweineschnitzel, panierfertig", price: "12.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 30, lowStockThreshold: 8, imageUrl: "/images/products/schweineschnitzel.png" });
    const p_filet = await this.createProduct({ supplierId: supplier2.id, name: "Rinderfilet", description: "Premium Rinderfilet vom Weiderind", price: "39.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 15, lowStockThreshold: 4, imageUrl: "/images/products/rinderfilet.png" });
    const p_haehnchen = await this.createProduct({ supplierId: supplier2.id, name: "Hähnchenbrust", description: "Zarte Hähnchenbrust", price: "9.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 40, lowStockThreshold: 10, imageUrl: "/images/products/haehnchenbrust.png" });
    const p_bratwurst = await this.createProduct({ supplierId: supplier2.id, name: "Bratwurst", description: "Original Nürnberger Bratwurst", price: "8.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 50, lowStockThreshold: 15, imageUrl: "/images/products/bratwurst.png" });
    await this.createProduct({ supplierId: supplier2.id, name: "Hackfleisch gemischt", description: "Hackfleisch gemischt Rind/Schwein", price: "7.99", unit: "kg", category: "Fleisch", inStock: false, stockQuantity: 0, lowStockThreshold: 10, imageUrl: "/images/products/hackfleisch.png" });
    await this.createProduct({ supplierId: supplier2.id, name: "Entenbrust", description: "Barbarie-Entenbrust, vakuumiert", price: "21.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 12, lowStockThreshold: 4, imageUrl: "/images/products/entenbrust.png" });
    await this.createProduct({ supplierId: supplier2.id, name: "Lammkarree", description: "Lammkarree french-trimmed", price: "32.50", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 8, lowStockThreshold: 3, imageUrl: "/images/products/lammkarree.png" });
    await this.createProduct({ supplierId: supplier2.id, name: "Rinderhüfte", description: "Rinderhüfte am Stück, dry-aged 21 Tage", price: "28.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 18, lowStockThreshold: 5, imageUrl: "/images/products/rinderhuefte.png" });
    await this.createProduct({ supplierId: supplier2.id, name: "Salami Fenchel", description: "Hausgemachte Salami mit Fenchel", price: "24.50", unit: "kg", category: "Wurst", inStock: true, stockQuantity: 22, lowStockThreshold: 5, imageUrl: "/images/products/salami-fenchel.png" });
    await this.createProduct({ supplierId: supplier2.id, name: "Schinken Speck", description: "Tiroler Speck, geschnitten", price: "29.99", unit: "kg", category: "Wurst", inStock: true, stockQuantity: 14, lowStockThreshold: 4, imageUrl: "/images/products/schinken-speck.png" });

    // Supplier 3 (Getränke) — local images
    const p_augustiner = await this.createProduct({ supplierId: supplier3.id, name: "Augustiner Helles", description: "Münchner Augustiner Helles, Kiste 20x0,5l", price: "19.99", unit: "Kiste", category: "Getränke", inStock: true, stockQuantity: 100, lowStockThreshold: 20, imageUrl: "/images/products/augustiner-helles.png" });
    const p_wasser = await this.createProduct({ supplierId: supplier3.id, name: "Mineralwasser", description: "Gerolsteiner Mineralwasser, Kiste 12x1l", price: "8.49", unit: "Kiste", category: "Getränke", inStock: true, stockQuantity: 200, lowStockThreshold: 40, imageUrl: "/images/products/mineralwasser.png" });
    const p_apfelsaft = await this.createProduct({ supplierId: supplier3.id, name: "Apfelsaft", description: "Naturtrüber Apfelsaft, Kiste 6x1l", price: "11.99", unit: "Kiste", category: "Getränke", inStock: true, stockQuantity: 80, lowStockThreshold: 15, imageUrl: "/images/products/apfelsaft.png" });
    await this.createProduct({ supplierId: supplier3.id, name: "Cola", description: "Coca-Cola Classic, Kiste 24x0,33l", price: "18.99", unit: "Kiste", category: "Getränke", inStock: true, stockQuantity: 60, lowStockThreshold: 15, imageUrl: "/images/products/cola.png" });
    await this.createProduct({ supplierId: supplier3.id, name: "Weizenbier", description: "Erdinger Weißbier, Kiste 20x0,5l", price: "21.99", unit: "Kiste", category: "Getränke", inStock: true, stockQuantity: 75, lowStockThreshold: 15, imageUrl: "/images/products/weizenbier.png" });
    await this.createProduct({ supplierId: supplier3.id, name: "Riesling QbA", description: "Mosel Riesling, trocken, Kiste 6x0,75l", price: "44.99", unit: "Kiste", category: "Wein", inStock: true, stockQuantity: 40, lowStockThreshold: 10, imageUrl: "/images/products/riesling.png" });
    await this.createProduct({ supplierId: supplier3.id, name: "Chianti DOCG", description: "Toskanischer Chianti, Kiste 6x0,75l", price: "59.99", unit: "Kiste", category: "Wein", inStock: true, stockQuantity: 30, lowStockThreshold: 8, imageUrl: "/images/products/chianti.png" });
    await this.createProduct({ supplierId: supplier3.id, name: "Espresso Bohnen", description: "Premium Espresso, 1kg Beutel", price: "16.50", unit: "kg", category: "Kaffee", inStock: true, stockQuantity: 55, lowStockThreshold: 12, imageUrl: "/images/products/espresso-bohnen.png" });
    await this.createProduct({ supplierId: supplier3.id, name: "Orangensaft", description: "Direktsaft, Kiste 6x1l", price: "13.49", unit: "Kiste", category: "Getränke", inStock: true, stockQuantity: 65, lowStockThreshold: 15, imageUrl: "/images/products/orangensaft.png" });

    // Supplier 4 (Italia Import) — Unsplash
    const p_olivenoel = await this.createProduct({ supplierId: supplier4.id, name: "Olivenöl extra vergine", description: "Sizilianisches Olivenöl, 5L Kanister", price: "59.90", unit: "Kanister", category: "Öl & Essig", inStock: true, stockQuantity: 45, lowStockThreshold: 10, imageUrl: "/images/products/olivenoel.png" });
    const p_pasta = await this.createProduct({ supplierId: supplier4.id, name: "Spaghetti N°5", description: "Bronze gezogene Spaghetti, 12x500g", price: "23.40", unit: "Karton", category: "Pasta", inStock: true, stockQuantity: 80, lowStockThreshold: 20, imageUrl: "/images/products/spaghetti.png" });
    const p_mozzarella = await this.createProduct({ supplierId: supplier4.id, name: "Mozzarella di Bufala", description: "Büffelmozzarella DOP, 125g Beutel", price: "3.50", unit: "Stück", category: "Käse", inStock: true, stockQuantity: 120, lowStockThreshold: 30, imageUrl: "/images/products/mozzarella.png" });
    const p_parmesan = await this.createProduct({ supplierId: supplier4.id, name: "Parmigiano Reggiano", description: "24 Monate gereift, am Stück", price: "32.90", unit: "kg", category: "Käse", inStock: true, stockQuantity: 28, lowStockThreshold: 8, imageUrl: "/images/products/parmigiano.png" });
    await this.createProduct({ supplierId: supplier4.id, name: "Prosciutto di Parma", description: "Parmaschinken DOP 18 Monate, am Stück", price: "39.90", unit: "kg", category: "Wurst", inStock: true, stockQuantity: 16, lowStockThreshold: 5, imageUrl: "/images/products/prosciutto.png" });
    await this.createProduct({ supplierId: supplier4.id, name: "Tomaten passata", description: "San Marzano Tomaten, 12x680g", price: "27.60", unit: "Karton", category: "Konserven", inStock: true, stockQuantity: 95, lowStockThreshold: 20, imageUrl: "/images/products/tomaten-passata.png" });
    await this.createProduct({ supplierId: supplier4.id, name: "Pesto Genovese", description: "Original Pesto, 200g Glas", price: "5.90", unit: "Glas", category: "Saucen", inStock: true, stockQuantity: 60, lowStockThreshold: 15, imageUrl: "/images/products/pesto.png" });
    await this.createProduct({ supplierId: supplier4.id, name: "Balsamico Tradizionale", description: "12 Jahre gereift, 250ml", price: "29.90", unit: "Flasche", category: "Öl & Essig", inStock: true, stockQuantity: 35, lowStockThreshold: 10, imageUrl: "/images/products/balsamico.png" });

    // Supplier 5 (Nordsee Fisch)
    const p_lachs = await this.createProduct({ supplierId: supplier5.id, name: "Lachsfilet", description: "Norwegischer Lachs, Aquakultur, ohne Haut", price: "24.90", unit: "kg", category: "Fisch", inStock: true, stockQuantity: 22, lowStockThreshold: 6, imageUrl: "/images/products/lachsfilet.png" });
    await this.createProduct({ supplierId: supplier5.id, name: "Kabeljau Filet", description: "Wildfang aus der Nordsee", price: "19.50", unit: "kg", category: "Fisch", inStock: true, stockQuantity: 18, lowStockThreshold: 5, imageUrl: "/images/products/kabeljau.png" });
    await this.createProduct({ supplierId: supplier5.id, name: "Garnelen Black Tiger", description: "Geschält, IQF, 1kg Beutel", price: "32.90", unit: "kg", category: "Meeresfrüchte", inStock: true, stockQuantity: 24, lowStockThreshold: 6, imageUrl: "/images/products/garnelen.png" });
    await this.createProduct({ supplierId: supplier5.id, name: "Miesmuscheln", description: "Frische Bouchot-Miesmuscheln, 5kg", price: "14.90", unit: "Sack", category: "Meeresfrüchte", inStock: true, stockQuantity: 12, lowStockThreshold: 4, imageUrl: "/images/products/miesmuscheln.png" });
    await this.createProduct({ supplierId: supplier5.id, name: "Thunfisch Sashimi", description: "Sashimi-Qualität, Loin", price: "54.90", unit: "kg", category: "Fisch", inStock: true, stockQuantity: 8, lowStockThreshold: 3, imageUrl: "/images/products/thunfisch.png" });
    await this.createProduct({ supplierId: supplier5.id, name: "Forellenfilet", description: "Geräucherte Lachsforelle", price: "22.50", unit: "kg", category: "Fisch", inStock: true, stockQuantity: 15, lowStockThreshold: 5, imageUrl: "/images/products/forellenfilet.png" });

    // ===== CONVERSATIONS & MESSAGES =====
    const conv1 = await this.getOrCreateConversation(restaurant1.id, supplier1.id);
    await this.sendMessage({ conversationId: conv1.id, senderId: restaurant1.id, messageType: "text", content: "Hallo Hans, haben Sie Bio Tomaten vorrätig?" });
    await this.sendMessage({ conversationId: conv1.id, senderId: supplier1.id, messageType: "text", content: "Ja, frisch eingetroffen! Wie viel benötigen Sie?" });
    await this.sendMessage({ conversationId: conv1.id, senderId: restaurant1.id, messageType: "text", content: "10kg wären super, können Sie morgen früh liefern?" });
    await this.sendMessage({ conversationId: conv1.id, senderId: supplier1.id, messageType: "text", content: "Klar, kommt morgen vor 8 Uhr. Beste Grüße!" });

    const conv2 = await this.getOrCreateConversation(restaurant1.id, supplier2.id);
    await this.sendMessage({ conversationId: conv2.id, senderId: restaurant1.id, messageType: "text", content: "Guten Tag Anna, ich brauche 20kg Schweineschnitzel für Samstag." });
    await this.sendMessage({ conversationId: conv2.id, senderId: supplier2.id, messageType: "text", content: "Notiert! Wir liefern Freitagnachmittag." });

    const conv3 = await this.getOrCreateConversation(restaurant2.id, supplier4.id);
    await this.sendMessage({ conversationId: conv3.id, senderId: restaurant2.id, messageType: "text", content: "Ciao Julia! Brauchen 15kg Mozzarella und 5kg Parmigiano." });
    await this.sendMessage({ conversationId: conv3.id, senderId: supplier4.id, messageType: "text", content: "Perfetto, geht raus mit der Tour morgen früh." });
    await this.sendMessage({ conversationId: conv3.id, senderId: restaurant2.id, messageType: "text", content: "Danke! Auch noch 10L Olivenöl bitte." });

    const conv4 = await this.getOrCreateConversation(restaurant3.id, supplier3.id);
    await this.sendMessage({ conversationId: conv4.id, senderId: restaurant3.id, messageType: "text", content: "Hallo Peter, brauche dringend 30 Kisten Augustiner für Samstag — Hochzeit." });
    await this.sendMessage({ conversationId: conv4.id, senderId: supplier3.id, messageType: "text", content: "30 Kisten gehen klar. Liefere Samstag früh." });

    const conv5 = await this.getOrCreateConversation(restaurant4.id, supplier5.id);
    await this.sendMessage({ conversationId: conv5.id, senderId: restaurant4.id, messageType: "text", content: "Ciao Erik, was empfiehlst du heute frisch?" });
    await this.sendMessage({ conversationId: conv5.id, senderId: supplier5.id, messageType: "text", content: "Heute kam Wildlachs aus Norwegen rein, top Qualität!" });

    // ===== HELPER for orders with offset dates =====
    const createOrderWithDate = async (
      data: { restaurantId: string; supplierId: string; status: any; totalAmount: string; notes?: string; requestedDeliveryDate?: string },
      items: any[],
      daysAgo: number,
    ) => {
      const [order] = await db.insert(orders).values({
        ...data,
        createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
      }).returning();
      for (const item of items) {
        await db.insert(orderItems).values({ ...item, orderId: order.id });
      }
      return order;
    };

    const itemFor = (p: any, qty: number, confirmedQty?: number) => ({
      productId: p.id, productName: p.name, quantity: qty,
      unitPrice: p.price, totalPrice: (parseFloat(p.price) * qty).toFixed(2),
      confirmedQuantity: confirmedQty ?? null,
    });
    const sumOf = (items: any[]) => items.reduce((s, i) => s + parseFloat(i.totalPrice), 0).toFixed(2);

    const futureDate = (days: number) => {
      const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      return d.toISOString().slice(0, 10);
    };

    // ===== ORDERS — every status, recent + historical =====
    // Restaurant 1 + Supplier 1 — multiple historical
    const o1items = [itemFor(p_tomaten, 10), itemFor(p_salat, 20), itemFor(p_karotten, 5)];
    await createOrderWithDate({ restaurantId: restaurant1.id, supplierId: supplier1.id, status: "delivered", totalAmount: sumOf(o1items) }, o1items, 14);

    const o2items = [itemFor(p_aepfel, 15), itemFor(p_zitronen, 4)];
    await createOrderWithDate({ restaurantId: restaurant1.id, supplierId: supplier1.id, status: "delivered", totalAmount: sumOf(o2items) }, o2items, 9);

    const o3items = [itemFor(p_tomaten, 8), itemFor(p_salat, 15)];
    await createOrderWithDate({ restaurantId: restaurant1.id, supplierId: supplier1.id, status: "in_delivery", totalAmount: sumOf(o3items), requestedDeliveryDate: futureDate(0) }, o3items, 1);

    const o4items = [itemFor(p_karotten, 6), itemFor(p_aepfel, 8)];
    await createOrderWithDate({ restaurantId: restaurant1.id, supplierId: supplier1.id, status: "confirmed", totalAmount: sumOf(o4items), requestedDeliveryDate: futureDate(2) }, o4items, 0);

    const o5items = [itemFor(p_tomaten, 12), itemFor(p_zitronen, 3)];
    await createOrderWithDate({ restaurantId: restaurant1.id, supplierId: supplier1.id, status: "pending", totalAmount: sumOf(o5items), requestedDeliveryDate: futureDate(3) }, o5items, 0);

    // Restaurant 1 + Supplier 2 (Metzgerei)
    const o6items = [itemFor(p_schnitzel, 10), itemFor(p_haehnchen, 6)];
    await createOrderWithDate({ restaurantId: restaurant1.id, supplierId: supplier2.id, status: "delivered", totalAmount: sumOf(o6items) }, o6items, 6);

    const o7items = [itemFor(p_filet, 3, 2), itemFor(p_bratwurst, 5)];
    const o7 = await createOrderWithDate({ restaurantId: restaurant1.id, supplierId: supplier2.id, status: "partially_confirmed", totalAmount: sumOf(o7items), requestedDeliveryDate: futureDate(1) }, o7items, 0);

    // Restaurant 1 + Supplier 3 (Getränke)
    const o8items = [itemFor(p_augustiner, 5), itemFor(p_wasser, 8), itemFor(p_apfelsaft, 4)];
    const o8 = await createOrderWithDate({ restaurantId: restaurant1.id, supplierId: supplier3.id, status: "delivered", totalAmount: sumOf(o8items) }, o8items, 4);

    const o9items = [itemFor(p_augustiner, 3), itemFor(p_wasser, 5)];
    await createOrderWithDate({ restaurantId: restaurant1.id, supplierId: supplier3.id, status: "cancelled", totalAmount: sumOf(o9items), notes: "Kunde hat storniert wegen Lieferverspätung" }, o9items, 7);

    // Restaurant 2 (Pizzeria) + Supplier 4 (Italia)
    const o10items = [itemFor(p_mozzarella, 30), itemFor(p_parmesan, 4), itemFor(p_pasta, 6), itemFor(p_olivenoel, 2)];
    const o10 = await createOrderWithDate({ restaurantId: restaurant2.id, supplierId: supplier4.id, status: "delivered", totalAmount: sumOf(o10items) }, o10items, 10);

    const o11items = [itemFor(p_mozzarella, 25), itemFor(p_pasta, 4)];
    await createOrderWithDate({ restaurantId: restaurant2.id, supplierId: supplier4.id, status: "delivered", totalAmount: sumOf(o11items) }, o11items, 5);

    const o12items = [itemFor(p_mozzarella, 20), itemFor(p_olivenoel, 1)];
    await createOrderWithDate({ restaurantId: restaurant2.id, supplierId: supplier4.id, status: "in_delivery", totalAmount: sumOf(o12items), requestedDeliveryDate: futureDate(0) }, o12items, 1);

    // Restaurant 3 + Supplier 3 (Getränke, Hochzeit)
    const o13items = [itemFor(p_augustiner, 30), itemFor(p_wasser, 20)];
    await createOrderWithDate({ restaurantId: restaurant3.id, supplierId: supplier3.id, status: "confirmed", totalAmount: sumOf(o13items), requestedDeliveryDate: futureDate(2), notes: "Hochzeit Samstag — bitte vor 10 Uhr liefern" }, o13items, 0);

    // Restaurant 4 + Supplier 5 (Fisch)
    const o14items = [itemFor(p_lachs, 5)];
    await createOrderWithDate({ restaurantId: restaurant4.id, supplierId: supplier5.id, status: "delivered", totalAmount: sumOf(o14items) }, o14items, 3);

    const o15items = [itemFor(p_lachs, 8)];
    await createOrderWithDate({ restaurantId: restaurant4.id, supplierId: supplier5.id, status: "pending", totalAmount: sumOf(o15items), requestedDeliveryDate: futureDate(1) }, o15items, 0);

    // Restaurant 5 + Supplier 4
    const o16items = [itemFor(p_pasta, 10), itemFor(p_olivenoel, 3), itemFor(p_parmesan, 2)];
    await createOrderWithDate({ restaurantId: restaurant5.id, supplierId: supplier4.id, status: "delivered", totalAmount: sumOf(o16items) }, o16items, 11);

    const o17items = [itemFor(p_pasta, 8)];
    await createOrderWithDate({ restaurantId: restaurant5.id, supplierId: supplier4.id, status: "confirmed", totalAmount: sumOf(o17items), requestedDeliveryDate: futureDate(3) }, o17items, 0);

    // ===== COMPLAINTS =====
    await db.insert(complaints).values({
      orderId: o7.id, restaurantId: restaurant1.id, supplierId: supplier2.id,
      title: "Falsches Gewicht beim Rinderfilet",
      description: "Bestellt: 3kg Rinderfilet. Geliefert: nur 2,1kg. Bitte um Klärung.",
      status: "in_progress", priority: "high",
    });
    await db.insert(complaints).values({
      orderId: o8.id, restaurantId: restaurant1.id, supplierId: supplier3.id,
      title: "Eine Kiste Augustiner beschädigt",
      description: "5 Flaschen waren bei der Lieferung gebrochen, Foto im Anhang.",
      mediaUrls: [unsplash("1535958636474-b021ee887b13", 800, 600)],
      status: "open", priority: "standard",
    });
    await db.insert(complaints).values({
      orderId: o10.id, restaurantId: restaurant2.id, supplierId: supplier4.id,
      title: "Mozzarella mit kurzem MHD",
      description: "Die Mozzarella läuft schon in 2 Tagen ab, normalerweise haben wir 7+ Tage.",
      status: "resolved", priority: "low",
    });

    // ===== PROMOTIONS =====
    const now = new Date();
    const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    await db.insert(promotions).values([
      { productId: p_tomaten.id, supplierId: supplier1.id, discountPercent: 15, startDate: inDays(-1), endDate: inDays(7), isActive: true, name: "Sommer-Aktion", description: "15% Rabatt auf Bio Tomaten" },
      { productId: p_salat.id, supplierId: supplier1.id, discountPercent: 20, startDate: inDays(-3), endDate: inDays(4), isActive: true, name: "Salat-Wochen", description: "20% Rabatt auf Eisbergsalat" },
      { productId: p_augustiner.id, supplierId: supplier3.id, discountPercent: 10, startDate: inDays(0), endDate: inDays(14), isActive: true, name: "Biergarten-Saison", description: "10% Rabatt auf Augustiner Helles" },
      { productId: p_mozzarella.id, supplierId: supplier4.id, discountPercent: 12, startDate: inDays(-2), endDate: inDays(10), isActive: true, name: "Pizza Mozzarella", description: "12% Rabatt für Pizzerien" },
      { productId: p_lachs.id, supplierId: supplier5.id, discountPercent: 8, startDate: inDays(-1), endDate: inDays(5), isActive: true, name: "Frischer Wildlachs", description: "8% Rabatt auf Lachsfilet" },
    ]);

    // ===== CUSTOM PRICES =====
    await db.insert(customPrices).values([
      { productId: p_tomaten.id, supplierId: supplier1.id, restaurantId: restaurant1.id, customPrice: "3.49" },
      { productId: p_schnitzel.id, supplierId: supplier2.id, restaurantId: restaurant1.id, customPrice: "11.99" },
      { productId: p_mozzarella.id, supplierId: supplier4.id, restaurantId: restaurant2.id, customPrice: "3.20" },
    ]);

    // ===== CUSTOM MIN ORDER QUANTITIES =====
    await db.insert(customMinOrderQuantities).values([
      { productId: p_filet.id, supplierId: supplier2.id, restaurantId: restaurant1.id, minOrderQuantity: 2 },
      { productId: p_olivenoel.id, supplierId: supplier4.id, restaurantId: restaurant2.id, minOrderQuantity: 1 },
    ]);

    // ===== DELIVERY SCHEDULES =====
    await db.insert(deliverySchedules).values([
      { supplierId: supplier1.id, restaurantId: restaurant1.id, dayOfWeek: 1, deliveryTimeFrom: "06:00", deliveryTimeTo: "08:00" },
      { supplierId: supplier1.id, restaurantId: restaurant1.id, dayOfWeek: 3, deliveryTimeFrom: "06:00", deliveryTimeTo: "08:00" },
      { supplierId: supplier1.id, restaurantId: restaurant1.id, dayOfWeek: 5, deliveryTimeFrom: "06:00", deliveryTimeTo: "08:00" },
      { supplierId: supplier2.id, restaurantId: restaurant1.id, dayOfWeek: 2, deliveryTimeFrom: "07:00", deliveryTimeTo: "10:00" },
      { supplierId: supplier2.id, restaurantId: restaurant1.id, dayOfWeek: 5, deliveryTimeFrom: "07:00", deliveryTimeTo: "10:00" },
      { supplierId: supplier3.id, restaurantId: restaurant3.id, dayOfWeek: 4, deliveryTimeFrom: "08:00", deliveryTimeTo: "12:00" },
      { supplierId: supplier4.id, restaurantId: restaurant2.id, dayOfWeek: 1, deliveryTimeFrom: "06:30", deliveryTimeTo: "09:00" },
      { supplierId: supplier4.id, restaurantId: restaurant2.id, dayOfWeek: 4, deliveryTimeFrom: "06:30", deliveryTimeTo: "09:00" },
      { supplierId: supplier5.id, restaurantId: restaurant4.id, dayOfWeek: 2, deliveryTimeFrom: "05:00", deliveryTimeTo: "07:00" },
      { supplierId: supplier5.id, restaurantId: restaurant4.id, dayOfWeek: 5, deliveryTimeFrom: "05:00", deliveryTimeTo: "07:00" },
    ]);

    // ===== NOTIFICATIONS =====
    await db.insert(notifications).values([
      { userId: restaurant1.id, type: "order_status", title: "Lieferung unterwegs", message: "Ihre Bestellung von Frische Produkte GmbH ist in Auslieferung.", isRead: false },
      { userId: restaurant1.id, type: "new_message", title: "Neue Nachricht", message: "Hans Müller hat Ihnen eine Nachricht gesendet.", isRead: false },
      { userId: restaurant1.id, type: "order_status", title: "Bestellung bestätigt", message: "Metzgerei Bauer hat Ihre Bestellung bestätigt.", isRead: true },
      { userId: supplier1.id, type: "new_order", title: "Neue Bestellung", message: "Biergarten München hat eine neue Bestellung aufgegeben.", isRead: false },
      { userId: supplier1.id, type: "low_stock", title: "Niedriger Lagerbestand", message: "Erdbeeren sind ausverkauft.", isRead: false },
      { userId: supplier2.id, type: "new_complaint", title: "Neue Reklamation", message: "Reklamation zu Bestellung erhalten.", isRead: false },
      { userId: supplier3.id, type: "new_order", title: "Großbestellung", message: "Gasthof Alpenblick hat 30 Kisten Augustiner bestellt.", isRead: false },
      { userId: supplier4.id, type: "new_message", title: "Neue Nachricht", message: "Pizzeria Bella Italia hat geschrieben.", isRead: true },
    ]);

    // ===== STOCK MOVEMENTS =====
    await db.insert(stockMovements).values([
      { productId: p_tomaten.id, supplierId: supplier1.id, type: "manual_in", quantity: 50, previousStock: 50, newStock: 100, note: "Wareneingang Großmarkt" },
      { productId: p_tomaten.id, supplierId: supplier1.id, type: "order_confirmed", quantity: -10, previousStock: 100, newStock: 90, note: "Bestellung Biergarten München" },
      { productId: p_schnitzel.id, supplierId: supplier2.id, type: "manual_in", quantity: 30, previousStock: 0, newStock: 30, note: "Wochenlieferung Schlachthof" },
      { productId: p_augustiner.id, supplierId: supplier3.id, type: "manual_in", quantity: 100, previousStock: 0, newStock: 100, note: "Brauerei-Lieferung" },
    ]);

    // ===== ORDER TEMPLATES =====
    const [tmpl1] = await db.insert(orderTemplates).values({ restaurantId: restaurant1.id, name: "Wöchentliche Gemüse-Bestellung" }).returning();
    await db.insert(orderTemplateItems).values([
      { templateId: tmpl1.id, productId: p_tomaten.id, quantity: 10 },
      { templateId: tmpl1.id, productId: p_salat.id, quantity: 20 },
      { templateId: tmpl1.id, productId: p_karotten.id, quantity: 5 },
    ]);
    const [tmpl2] = await db.insert(orderTemplates).values({ restaurantId: restaurant2.id, name: "Pizza-Standard Wochenende" }).returning();
    await db.insert(orderTemplateItems).values([
      { templateId: tmpl2.id, productId: p_mozzarella.id, quantity: 30 },
      { templateId: tmpl2.id, productId: p_pasta.id, quantity: 6 },
      { templateId: tmpl2.id, productId: p_olivenoel.id, quantity: 2 },
    ]);

    // ============================================================
    // ===== MASSIVE EXPANSION (demo-v4) ==========================
    // ============================================================
    const restaurants = [restaurant1, restaurant2, restaurant3, restaurant4, restaurant5];
    const suppliers = [supplier1, supplier2, supplier3, supplier4, supplier5];

    // ===== ADDITIONAL PRODUCTS — full catalogs per supplier =====
    const moreProducts: Array<{ s: any; name: string; desc: string; price: string; unit: string; cat: string; stock: number; low: number; img: string; moq?: number; }> = [
      // Supplier 1: Frische Produkte
      { s: supplier1, name: "Bio Spinat", desc: "Junger Babyspinat", price: "5.99", unit: "kg", cat: "Gemüse", stock: 30, low: 8, img: "/images/products/bio-spinat.png" },
      { s: supplier1, name: "Brokkoli", desc: "Frischer Brokkoli", price: "3.49", unit: "kg", cat: "Gemüse", stock: 45, low: 10, img: "/images/products/brokkoli.png" },
      { s: supplier1, name: "Blumenkohl", desc: "Weißer Blumenkohl", price: "2.99", unit: "Stück", cat: "Gemüse", stock: 38, low: 10, img: "/images/products/blumenkohl.png" },
      { s: supplier1, name: "Zucchini", desc: "Grüne Zucchini", price: "2.79", unit: "kg", cat: "Gemüse", stock: 55, low: 12, img: "/images/products/zucchini.png" },
      { s: supplier1, name: "Auberginen", desc: "Glänzende Auberginen", price: "3.49", unit: "kg", cat: "Gemüse", stock: 30, low: 8, img: "/images/products/auberginen.png" },
      { s: supplier1, name: "Bio Knoblauch", desc: "Knoblauch im Netz", price: "8.99", unit: "kg", cat: "Gemüse", stock: 22, low: 5, img: "/images/products/bio-knoblauch.png" },
      { s: supplier1, name: "Petersilie", desc: "Glatte Petersilie, Bund", price: "1.49", unit: "Bund", cat: "Kräuter", stock: 60, low: 15, img: "/images/products/petersilie.png" },
      { s: supplier1, name: "Basilikum", desc: "Frischer Basilikum, Topf", price: "2.49", unit: "Topf", cat: "Kräuter", stock: 40, low: 10, img: "/images/products/basilikum.png" },
      { s: supplier1, name: "Rosmarin", desc: "Rosmarin, Bund", price: "1.99", unit: "Bund", cat: "Kräuter", stock: 35, low: 8, img: "/images/products/rosmarin.png" },
      { s: supplier1, name: "Trauben kernlos", desc: "Süße kernlose Trauben", price: "5.99", unit: "kg", cat: "Obst", stock: 25, low: 6, img: "/images/products/trauben.png" },
      { s: supplier1, name: "Birnen Williams", desc: "Williams Christ Birnen", price: "3.79", unit: "kg", cat: "Obst", stock: 40, low: 10, img: "/images/products/birnen.png" },
      { s: supplier1, name: "Avocado", desc: "Reife Hass Avocados", price: "2.49", unit: "Stück", cat: "Obst", stock: 80, low: 20, img: "/images/products/avocado.png" },
      { s: supplier1, name: "Limetten", desc: "Frische Limetten", price: "5.49", unit: "kg", cat: "Obst", stock: 30, low: 8, img: "/images/products/limetten.png" },
      { s: supplier1, name: "Mango", desc: "Reife Mangos", price: "4.99", unit: "Stück", cat: "Obst", stock: 35, low: 10, img: "/images/products/mango.png" },
      { s: supplier1, name: "Heidelbeeren", desc: "Frische Heidelbeeren, 250g", price: "4.49", unit: "Schale", cat: "Obst", stock: 28, low: 8, img: "/images/products/heidelbeeren.png" },
      { s: supplier1, name: "Marokk. Minze", desc: "Marokkanische Minze, Bund", price: "1.99", unit: "Bund", cat: "Kräuter", stock: 30, low: 8, img: "/images/products/minze.png" },
      { s: supplier1, name: "Lauch", desc: "Frischer Lauch", price: "3.29", unit: "kg", cat: "Gemüse", stock: 42, low: 10, img: "/images/products/lauch.png" },
      { s: supplier1, name: "Spargel weiß", desc: "Weißer Spargel, Klasse 1", price: "12.99", unit: "kg", cat: "Gemüse", stock: 18, low: 5, img: "/images/products/spargel.png" },

      // Supplier 2: Metzgerei
      { s: supplier2, name: "Schweinebauch", desc: "Schweinebauch ohne Schwarte", price: "8.49", unit: "kg", cat: "Fleisch", stock: 25, low: 6, img: "/images/products/schweinebauch.png" },
      { s: supplier2, name: "Kalbsschnitzel", desc: "Kalbsschnitzel zart", price: "32.50", unit: "kg", cat: "Fleisch", stock: 12, low: 4, img: "/images/products/kalbsschnitzel.png" },
      { s: supplier2, name: "Hackfleisch Rind", desc: "Reines Rinderhack", price: "12.99", unit: "kg", cat: "Fleisch", stock: 28, low: 8, img: "/images/products/hackfleisch-rind.png" },
      { s: supplier2, name: "Wiener Würstchen", desc: "Im Saitling", price: "10.99", unit: "kg", cat: "Wurst", stock: 35, low: 10, img: "/images/products/wiener-wuerstchen.png" },
      { s: supplier2, name: "Leberkäse", desc: "Bayerischer Leberkäse", price: "9.49", unit: "kg", cat: "Wurst", stock: 18, low: 5, img: "/images/products/leberkaese.png" },
      { s: supplier2, name: "Weißwurst", desc: "Münchner Weißwurst, Paar", price: "0.99", unit: "Paar", cat: "Wurst", stock: 200, low: 50, img: "/images/products/weisswurst.png" },
      { s: supplier2, name: "Salami Mailand", desc: "Salami Milano, geschnitten", price: "26.50", unit: "kg", cat: "Wurst", stock: 16, low: 5, img: "/images/products/salami-mailand.png" },
      { s: supplier2, name: "Putenbrust", desc: "Putenbrust am Stück", price: "10.99", unit: "kg", cat: "Fleisch", stock: 22, low: 6, img: "/images/products/putenbrust.png" },
      { s: supplier2, name: "Lammkeule", desc: "Lammkeule mit Knochen", price: "26.50", unit: "kg", cat: "Fleisch", stock: 9, low: 3, img: "/images/products/lammkeule.png" },
      { s: supplier2, name: "Roastbeef", desc: "Roastbeef vom Weiderind", price: "34.90", unit: "kg", cat: "Fleisch", stock: 14, low: 4, img: "/images/products/roastbeef.png" },
      { s: supplier2, name: "Spareribs", desc: "Schweinerippchen, frisch", price: "11.50", unit: "kg", cat: "Fleisch", stock: 30, low: 8, img: "/images/products/spareribs.png" },
      { s: supplier2, name: "Bacon geräuchert", desc: "Bacon Streifen, vakuumiert", price: "16.50", unit: "kg", cat: "Wurst", stock: 25, low: 8, img: "/images/products/bacon.png" },
      { s: supplier2, name: "Bauchspeck", desc: "Geräucherter Bauchspeck", price: "18.90", unit: "kg", cat: "Wurst", stock: 20, low: 6, img: "/images/products/bauchspeck.png" },
      { s: supplier2, name: "Mortadella", desc: "Mortadella Bologna IGP", price: "15.50", unit: "kg", cat: "Wurst", stock: 22, low: 6, img: "/images/products/mortadella.png" },
      { s: supplier2, name: "Kasseler", desc: "Kasseler Lachs", price: "13.50", unit: "kg", cat: "Fleisch", stock: 26, low: 7, img: "/images/products/kasseler.png" },

      // Supplier 3: Getränke
      { s: supplier3, name: "Pils Premium", desc: "Pils Premium, Kiste 24x0,33l", price: "16.99", unit: "Kiste", cat: "Getränke", stock: 90, low: 20, img: "/images/products/pils.png" },
      { s: supplier3, name: "Hefeweizen Dunkel", desc: "Dunkles Hefeweizen, Kiste 20x0,5l", price: "23.49", unit: "Kiste", cat: "Getränke", stock: 50, low: 12, img: "/images/products/hefeweizen-dunkel.png" },
      { s: supplier3, name: "Radler", desc: "Radler 50/50, Kiste 20x0,5l", price: "18.49", unit: "Kiste", cat: "Getränke", stock: 70, low: 15, img: "/images/products/radler.png" },
      { s: supplier3, name: "Alkoholfrei", desc: "Alkoholfreies Bier, Kiste 20x0,5l", price: "17.99", unit: "Kiste", cat: "Getränke", stock: 45, low: 12, img: "/images/products/bier-alkoholfrei.png" },
      { s: supplier3, name: "Grüner Veltliner", desc: "Österr. Veltliner, Kiste 6x0,75l", price: "48.50", unit: "Kiste", cat: "Wein", stock: 35, low: 10, img: "/images/products/veltliner.png" },
      { s: supplier3, name: "Pinot Grigio", desc: "Norditalienischer Pinot Grigio", price: "42.90", unit: "Kiste", cat: "Wein", stock: 38, low: 10, img: "/images/products/pinot-grigio.png" },
      { s: supplier3, name: "Spätburgunder", desc: "Deutscher Spätburgunder", price: "62.50", unit: "Kiste", cat: "Wein", stock: 28, low: 8, img: "/images/products/spaetburgunder.png" },
      { s: supplier3, name: "Prosecco DOC", desc: "Prosecco di Treviso", price: "54.90", unit: "Kiste", cat: "Wein", stock: 42, low: 10, img: "/images/products/prosecco.png" },
      { s: supplier3, name: "Champagner Brut", desc: "Champagner Brut, 0,75l", price: "39.90", unit: "Flasche", cat: "Wein", stock: 24, low: 6, img: "/images/products/champagner.png" },
      { s: supplier3, name: "Aperol", desc: "Aperol, 1L Flasche", price: "16.50", unit: "Flasche", cat: "Spirituosen", stock: 35, low: 10, img: "/images/products/aperol.png" },
      { s: supplier3, name: "Gin London Dry", desc: "Premium Gin, 0,7L", price: "28.90", unit: "Flasche", cat: "Spirituosen", stock: 22, low: 6, img: "/images/products/gin.png" },
      { s: supplier3, name: "Wodka Premium", desc: "Premium Vodka, 0,7L", price: "24.50", unit: "Flasche", cat: "Spirituosen", stock: 28, low: 8, img: "/images/products/wodka.png" },
      { s: supplier3, name: "Whisky Single Malt", desc: "Single Malt 12 Jahre, 0,7L", price: "45.90", unit: "Flasche", cat: "Spirituosen", stock: 18, low: 5, img: "/images/products/whisky.png" },
      { s: supplier3, name: "Grappa Riserva", desc: "Grappa Riserva, 0,5L", price: "32.90", unit: "Flasche", cat: "Spirituosen", stock: 14, low: 4, img: "/images/products/grappa.png" },
      { s: supplier3, name: "Tonic Water", desc: "Premium Tonic, Kiste 24x0,2l", price: "28.50", unit: "Kiste", cat: "Getränke", stock: 50, low: 12, img: "/images/products/tonic-water.png" },
      { s: supplier3, name: "Espresso 250g", desc: "Premium Espresso Beutel", price: "5.99", unit: "Beutel", cat: "Kaffee", stock: 80, low: 20, img: "/images/products/espresso-250g.png" },
      { s: supplier3, name: "Cappuccino Bohnen", desc: "Cappuccino Mischung, 1kg", price: "14.90", unit: "kg", cat: "Kaffee", stock: 45, low: 12, img: "/images/products/cappuccino-bohnen.png" },
      { s: supplier3, name: "Earl Grey Tee", desc: "Earl Grey, 250g", price: "8.99", unit: "Packung", cat: "Kaffee", stock: 30, low: 8, img: "/images/products/earl-grey.png" },
      { s: supplier3, name: "Bio Limonade", desc: "Bio Zitronenlimonade, Kiste 24x0,33l", price: "21.50", unit: "Kiste", cat: "Getränke", stock: 60, low: 15, img: "/images/products/bio-limonade.png" },
      { s: supplier3, name: "Tomatensaft", desc: "Tomatensaft, Kiste 6x1l", price: "10.90", unit: "Kiste", cat: "Getränke", stock: 45, low: 12, img: "/images/products/tomatensaft.png" },
      { s: supplier3, name: "Sprudelwasser", desc: "Mineralwasser sprudelnd, 12x0,75l", price: "9.49", unit: "Kiste", cat: "Getränke", stock: 110, low: 25, img: "/images/products/sprudelwasser.png" },

      // Supplier 4: Italia Import
      { s: supplier4, name: "Penne Rigate", desc: "Penne Rigate Bronze, 12x500g", price: "22.40", unit: "Karton", cat: "Pasta", stock: 75, low: 18, img: "/images/products/penne.png" },
      { s: supplier4, name: "Tagliatelle", desc: "Tagliatelle all'uovo, 12x250g", price: "26.80", unit: "Karton", cat: "Pasta", stock: 50, low: 12, img: "/images/products/tagliatelle.png" },
      { s: supplier4, name: "Lasagne Blätter", desc: "Lasagne all'uovo, 12x500g", price: "28.40", unit: "Karton", cat: "Pasta", stock: 42, low: 10, img: "/images/products/lasagne.png" },
      { s: supplier4, name: "Ravioli Ricotta", desc: "Ravioli mit Ricotta, 6x500g", price: "32.50", unit: "Karton", cat: "Pasta", stock: 35, low: 10, img: "/images/products/ravioli.png" },
      { s: supplier4, name: "Gnocchi Kartoffel", desc: "Hausgemachte Gnocchi, 6x500g", price: "18.50", unit: "Karton", cat: "Pasta", stock: 40, low: 12, img: "/images/products/gnocchi.png" },
      { s: supplier4, name: "Risotto Carnaroli", desc: "Carnaroli Reis, 12x1kg", price: "39.90", unit: "Karton", cat: "Pasta", stock: 30, low: 8, img: "/images/products/risotto.png" },
      { s: supplier4, name: "Burrata", desc: "Frische Burrata, 125g", price: "4.50", unit: "Stück", cat: "Käse", stock: 80, low: 20, img: "/images/products/burrata.png" },
      { s: supplier4, name: "Gorgonzola DOP", desc: "Gorgonzola dolce, am Stück", price: "21.50", unit: "kg", cat: "Käse", stock: 18, low: 5, img: "/images/products/gorgonzola.png" },
      { s: supplier4, name: "Pecorino Romano", desc: "Pecorino Romano DOP", price: "26.90", unit: "kg", cat: "Käse", stock: 22, low: 6, img: "/images/products/pecorino.png" },
      { s: supplier4, name: "Ricotta", desc: "Frische Ricotta, 1kg", price: "7.50", unit: "kg", cat: "Käse", stock: 35, low: 10, img: "/images/products/ricotta.png" },
      { s: supplier4, name: "Olivenöl 1L", desc: "Extra vergine, 6x1L", price: "39.90", unit: "Karton", cat: "Öl & Essig", stock: 60, low: 15, img: "/images/products/olivenoel-1l.png" },
      { s: supplier4, name: "Aceto Balsamico", desc: "Balsamico di Modena, 6x500ml", price: "29.50", unit: "Karton", cat: "Öl & Essig", stock: 40, low: 10, img: "/images/products/aceto-balsamico.png" },
      { s: supplier4, name: "Trüffelöl", desc: "Weißes Trüffelöl, 250ml", price: "18.90", unit: "Flasche", cat: "Öl & Essig", stock: 25, low: 6, img: "/images/products/trueffeloel.png" },
      { s: supplier4, name: "Sugo Arrabbiata", desc: "Arrabbiata Sauce, 12x400g", price: "29.40", unit: "Karton", cat: "Saucen", stock: 50, low: 12, img: "/images/products/sugo-arrabbiata.png" },
      { s: supplier4, name: "Sugo Bolognese", desc: "Bolognese Sauce, 12x400g", price: "32.90", unit: "Karton", cat: "Saucen", stock: 45, low: 12, img: "/images/products/sugo-bolognese.png" },
      { s: supplier4, name: "Taggiasche Oliven", desc: "Taggiasche Oliven, 1kg", price: "16.90", unit: "kg", cat: "Konserven", stock: 30, low: 8, img: "/images/products/oliven.png" },
      { s: supplier4, name: "Sardellen Filets", desc: "Sardellen in Olivenöl, 12x100g", price: "24.50", unit: "Karton", cat: "Konserven", stock: 35, low: 10, img: "/images/products/sardellen.png" },
      { s: supplier4, name: "Polenta Bramata", desc: "Polenta Bramata, 12x500g", price: "21.90", unit: "Karton", cat: "Pasta", stock: 28, low: 8, img: "/images/products/polenta.png" },
      { s: supplier4, name: "Cantucci Mandel", desc: "Cantucci mit Mandeln, 6x250g", price: "19.50", unit: "Karton", cat: "Konserven", stock: 32, low: 8, img: "/images/products/cantucci.png" },
      { s: supplier4, name: "Tiramisu Fertig", desc: "Tiramisu fertig, 6x500g", price: "29.90", unit: "Karton", cat: "Konserven", stock: 18, low: 5, img: "/images/products/tiramisu.png" },
      { s: supplier4, name: "Lavazza Crema", desc: "Lavazza Crema e Aroma, 1kg", price: "18.90", unit: "kg", cat: "Kaffee", stock: 65, low: 15, img: "/images/products/lavazza.png" },
      { s: supplier4, name: "Polpa Tomate", desc: "Tomatenstücke, 12x400g", price: "22.50", unit: "Karton", cat: "Konserven", stock: 70, low: 18, img: "/images/products/polpa-tomate.png" },

      // Supplier 5: Nordsee Fisch
      { s: supplier5, name: "Seezunge", desc: "Frische Seezunge, ausgenommen", price: "38.90", unit: "kg", cat: "Fisch", stock: 10, low: 3, img: "/images/products/seezunge.png" },
      { s: supplier5, name: "Doradenfilet", desc: "Doradenfilet ohne Haut", price: "26.50", unit: "kg", cat: "Fisch", stock: 14, low: 4, img: "/images/products/dorade.png" },
      { s: supplier5, name: "Wolfsbarsch", desc: "Wolfsbarsch ganz, 400-600g", price: "29.90", unit: "kg", cat: "Fisch", stock: 12, low: 4, img: "/images/products/wolfsbarsch.png" },
      { s: supplier5, name: "Heilbutt Steak", desc: "Heilbutt Steaks, ohne Haut", price: "42.50", unit: "kg", cat: "Fisch", stock: 8, low: 3, img: "/images/products/heilbutt.png" },
      { s: supplier5, name: "Rotbarsch", desc: "Rotbarschfilet", price: "21.90", unit: "kg", cat: "Fisch", stock: 16, low: 5, img: "/images/products/rotbarsch.png" },
      { s: supplier5, name: "Pulpo", desc: "Pulpo, gefroren, 2-4kg", price: "28.50", unit: "kg", cat: "Meeresfrüchte", stock: 12, low: 4, img: "/images/products/pulpo.png" },
      { s: supplier5, name: "Calamari Ringe", desc: "Calamari Ringe, IQF, 1kg", price: "16.90", unit: "kg", cat: "Meeresfrüchte", stock: 25, low: 8, img: "/images/products/calamari.png" },
      { s: supplier5, name: "Jakobsmuscheln", desc: "St. Jakobsmuscheln, ohne Schale", price: "44.90", unit: "kg", cat: "Meeresfrüchte", stock: 8, low: 3, img: "/images/products/jakobsmuscheln.png" },
      { s: supplier5, name: "Hummerschwänze", desc: "Hummerschwänze, gefroren", price: "78.90", unit: "kg", cat: "Meeresfrüchte", stock: 6, low: 2, img: "/images/products/hummer.png" },
      { s: supplier5, name: "Krebsfleisch", desc: "Krebsfleisch weiß, 500g Dose", price: "32.50", unit: "Dose", cat: "Meeresfrüchte", stock: 15, low: 4, img: "/images/products/krebsfleisch.png" },
      { s: supplier5, name: "Räucherlachs", desc: "Räucherlachs Scheiben, vakuumiert", price: "39.90", unit: "kg", cat: "Fisch", stock: 18, low: 5, img: "/images/products/raeucherlachs.png" },
      { s: supplier5, name: "Matjes Filet", desc: "Matjes Filet in Öl, 1kg", price: "16.50", unit: "kg", cat: "Fisch", stock: 22, low: 6, img: "/images/products/matjes.png" },
      { s: supplier5, name: "Nordseekrabben", desc: "Nordseekrabben frisch gepult", price: "62.50", unit: "kg", cat: "Meeresfrüchte", stock: 7, low: 2, img: "/images/products/nordseekrabben.png" },
      { s: supplier5, name: "Austern Fines", desc: "Austern Fines de Claire", price: "1.95", unit: "Stück", cat: "Meeresfrüchte", stock: 100, low: 24, img: "/images/products/austern.png" },

      // ====== CROSS-SUPPLIER OVERLAPS — same name+unit at different suppliers ======
      // Diese Produkte liefern echte Vergleiche auf der Preisvergleich-Seite.
      // Bio Tomaten kg (Original supplier1: 3.99)
      { s: supplier4, name: "Bio Tomaten", desc: "Italienische Bio-Tomaten, Klasse 1", price: "4.79", unit: "kg", cat: "Gemüse", stock: 70, low: 15, img: "/images/products/bio-tomaten.png" },
      { s: supplier2, name: "Bio Tomaten", desc: "Regionale Bio-Tomaten, Großhandel", price: "4.29", unit: "kg", cat: "Gemüse", stock: 50, low: 12, img: "/images/products/bio-tomaten.png" },
      // Karotten kg (Original supplier1: 2.29)
      { s: supplier4, name: "Karotten", desc: "Karotten Klasse 1, lose", price: "2.79", unit: "kg", cat: "Gemüse", stock: 60, low: 15, img: "/images/products/karotten.png" },
      // Bio Äpfel kg (Original supplier1: 4.49)
      { s: supplier4, name: "Bio Äpfel", desc: "Bio Äpfel Royal Gala", price: "5.20", unit: "kg", cat: "Obst", stock: 50, low: 12, img: "/images/products/bio-aepfel.png" },
      // Zitronen kg (Original supplier1: 3.29)
      { s: supplier4, name: "Zitronen", desc: "Bio-Zitronen aus Süditalien", price: "3.99", unit: "kg", cat: "Obst", stock: 35, low: 10, img: "/images/products/zitronen.png" },
      // Eisbergsalat Stück (Original supplier1: 1.49)
      { s: supplier4, name: "Eisbergsalat", desc: "Knackiger Eisbergsalat", price: "1.79", unit: "Stück", cat: "Gemüse", stock: 40, low: 10, img: "/images/products/eisbergsalat.png" },
      // Hähnchenbrust kg (Original supplier2: 9.99)
      { s: supplier1, name: "Hähnchenbrust", desc: "Hähnchenbrust frisch, Geflügelhof", price: "11.49", unit: "kg", cat: "Fleisch", stock: 25, low: 8, img: "/images/products/haehnchenbrust.png" },
      // Bratwurst kg (Original supplier2: 8.99)
      { s: supplier1, name: "Bratwurst", desc: "Hofmacher-Bratwurst", price: "10.49", unit: "kg", cat: "Fleisch", stock: 30, low: 8, img: "/images/products/bratwurst.png" },
      // Schweineschnitzel kg (Original supplier2: 12.99)
      { s: supplier1, name: "Schweineschnitzel", desc: "Schweineschnitzel ausgelöst", price: "14.49", unit: "kg", cat: "Fleisch", stock: 20, low: 6, img: "/images/products/schweineschnitzel.png" },
      // Mineralwasser Kiste (Original supplier3: 8.49)
      { s: supplier1, name: "Mineralwasser", desc: "Stilles Mineralwasser, Kiste 12x1l", price: "9.49", unit: "Kiste", cat: "Getränke", stock: 100, low: 25, img: "/images/products/mineralwasser.png" },
      { s: supplier4, name: "Mineralwasser", desc: "San Pellegrino, Kiste 12x1l", price: "12.90", unit: "Kiste", cat: "Getränke", stock: 80, low: 20, img: "/images/products/mineralwasser.png" },
      // Apfelsaft Kiste (Original supplier3: 11.99)
      { s: supplier1, name: "Apfelsaft", desc: "Bio-Apfelsaft, Kiste 6x1l", price: "13.49", unit: "Kiste", cat: "Getränke", stock: 50, low: 12, img: "/images/products/apfelsaft.png" },
      // Orangensaft Kiste (Original supplier3: 13.49)
      { s: supplier4, name: "Orangensaft", desc: "Spremuta d'arancia, Kiste 6x1l", price: "15.90", unit: "Kiste", cat: "Getränke", stock: 40, low: 10, img: "/images/products/orangensaft.png" },
      // Espresso Bohnen kg (Original supplier3: 16.50)
      { s: supplier4, name: "Espresso Bohnen", desc: "Italienische Espresso-Mischung", price: "21.50", unit: "kg", cat: "Kaffee", stock: 35, low: 10, img: "/images/products/espresso-bohnen.png" },
      // Olivenöl extra vergine Kanister (Original supplier4: 59.90)
      { s: supplier1, name: "Olivenöl extra vergine", desc: "Spanisches Olivenöl, 5L Kanister", price: "64.90", unit: "Kanister", cat: "Öl & Essig", stock: 30, low: 8, img: "/images/products/olivenoel.png" },
      // Mozzarella di Bufala Stück (Original supplier4: 3.50)
      { s: supplier1, name: "Mozzarella di Bufala", desc: "Büffelmozzarella, 125g", price: "3.99", unit: "Stück", cat: "Käse", stock: 80, low: 20, img: "/images/products/mozzarella.png" },
      // Parmigiano Reggiano kg (Original supplier4: 32.90)
      { s: supplier3, name: "Parmigiano Reggiano", desc: "Parmigiano 18 Monate", price: "38.90", unit: "kg", cat: "Käse", stock: 18, low: 5, img: "/images/products/parmigiano.png" },
      // Spaghetti N°5 Karton (Original supplier4: 23.40)
      { s: supplier1, name: "Spaghetti N°5", desc: "Pasta lange, 12x500g", price: "26.90", unit: "Karton", cat: "Pasta", stock: 50, low: 12, img: "/images/products/spaghetti.png" },
      // Lachsfilet kg (Original supplier5: 24.90)
      { s: supplier2, name: "Lachsfilet", desc: "Lachsfilet, frisch ohne Haut", price: "27.90", unit: "kg", cat: "Fisch", stock: 18, low: 5, img: "/images/products/lachsfilet.png" },
      // Riesling QbA Kiste (Original supplier3: 44.99)
      { s: supplier4, name: "Riesling QbA", desc: "Italienischer Riesling, 6x0,75l", price: "49.90", unit: "Kiste", cat: "Wein", stock: 25, low: 8, img: "/images/products/riesling.png" },
      // Burrata Stück (moreProducts supplier4: 4.50)
      { s: supplier1, name: "Burrata", desc: "Frische Burrata, 125g", price: "5.20", unit: "Stück", cat: "Käse", stock: 50, low: 15, img: "/images/products/burrata.png" },
      // Penne Rigate Karton (moreProducts supplier4: 22.40)
      { s: supplier1, name: "Penne Rigate", desc: "Penne Rigate, 12x500g", price: "25.90", unit: "Karton", cat: "Pasta", stock: 45, low: 12, img: "/images/products/penne.png" },
      // Olivenöl 1L Karton (moreProducts supplier4: 39.90)
      { s: supplier1, name: "Olivenöl 1L", desc: "Olivenöl, 6x1L", price: "44.90", unit: "Karton", cat: "Öl & Essig", stock: 35, low: 10, img: "/images/products/olivenoel-1l.png" },
      // Pils Premium Kiste (moreProducts supplier3: 16.99)
      { s: supplier1, name: "Pils Premium", desc: "Premium Pils, Kiste 24x0,33l", price: "19.49", unit: "Kiste", cat: "Getränke", stock: 60, low: 15, img: "/images/products/pils.png" },
      // Brokkoli kg (moreProducts supplier1: 3.49)
      { s: supplier4, name: "Brokkoli", desc: "Brokkoli aus Italien", price: "4.20", unit: "kg", cat: "Gemüse", stock: 30, low: 8, img: "/images/products/brokkoli.png" },
      // Zucchini kg (moreProducts supplier1: 2.79)
      { s: supplier4, name: "Zucchini", desc: "Zucchini italienisch", price: "3.49", unit: "kg", cat: "Gemüse", stock: 35, low: 10, img: "/images/products/zucchini.png" },
      // Avocado Stück (moreProducts supplier1: 2.49)
      { s: supplier4, name: "Avocado", desc: "Avocado Hass, reif", price: "2.99", unit: "Stück", cat: "Obst", stock: 60, low: 15, img: "/images/products/avocado.png" },
    ];

    for (const mp of moreProducts) {
      await this.createProduct({
        supplierId: mp.s.id, name: mp.name, description: mp.desc, price: mp.price,
        unit: mp.unit, category: mp.cat, inStock: mp.stock > 0, stockQuantity: mp.stock,
        lowStockThreshold: mp.low, imageUrl: mp.img,
      });
    }

    // ===== Build product map per supplier (incl. originals) =====
    const allProducts = await db.select().from(products);
    const productsBySupplier: Record<string, any[]> = {};
    for (const p of allProducts) {
      (productsBySupplier[p.supplierId] = productsBySupplier[p.supplierId] || []).push(p);
    }

    // Deterministic PRNG so seed is repeatable
    let _seed = 91827;
    const rand = () => { _seed = (_seed * 9301 + 49297) % 233280; return _seed / 233280; };
    const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

    // ===== ORDERS — many per restaurant-supplier pair =====
    const statusBuckets: Array<{ status: string; weight: number; daysAgoMin: number; daysAgoMax: number; futureDays?: number }> = [
      { status: "delivered", weight: 18, daysAgoMin: 5, daysAgoMax: 90 },
      { status: "delivered", weight: 6, daysAgoMin: 1, daysAgoMax: 4 },
      { status: "in_delivery", weight: 2, daysAgoMin: 0, daysAgoMax: 1, futureDays: 0 },
      { status: "confirmed", weight: 3, daysAgoMin: 0, daysAgoMax: 1, futureDays: 2 },
      { status: "partially_confirmed", weight: 2, daysAgoMin: 0, daysAgoMax: 2, futureDays: 1 },
      { status: "pending", weight: 2, daysAgoMin: 0, daysAgoMax: 0, futureDays: 3 },
      { status: "cancelled", weight: 2, daysAgoMin: 7, daysAgoMax: 35 },
    ];
    const totalWeight = statusBuckets.reduce((s, b) => s + b.weight, 0);
    const generatedOrders: any[] = [];

    for (const restaurant of restaurants) {
      for (const supplier of suppliers) {
        const supProducts = productsBySupplier[supplier.id] || [];
        if (!supProducts.length) continue;
        const numOrders = randInt(7, 11);
        for (let i = 0; i < numOrders; i++) {
          let r = rand() * totalWeight;
          let chosen = statusBuckets[0];
          for (const b of statusBuckets) { r -= b.weight; if (r <= 0) { chosen = b; break; } }
          const numItems = randInt(2, 6);
          const used = new Set<number>();
          const items: any[] = [];
          for (let j = 0; j < numItems && used.size < supProducts.length; j++) {
            let idx; do { idx = randInt(0, supProducts.length - 1); } while (used.has(idx));
            used.add(idx);
            const p = supProducts[idx];
            const qty = randInt(2, 18);
            const confirmedQty = chosen.status === "partially_confirmed" ? Math.max(1, qty - randInt(1, 3)) : null;
            items.push({
              productId: p.id, productName: p.name, quantity: qty,
              unitPrice: p.price, totalPrice: (parseFloat(p.price) * qty).toFixed(2),
              confirmedQuantity: confirmedQty,
            });
          }
          const total = items.reduce((s, it) => s + parseFloat(it.totalPrice), 0).toFixed(2);
          const days = randInt(chosen.daysAgoMin, chosen.daysAgoMax);
          const order = await createOrderWithDate({
            restaurantId: restaurant.id, supplierId: supplier.id,
            status: chosen.status as any, totalAmount: total,
            requestedDeliveryDate: chosen.futureDays !== undefined ? futureDate(chosen.futureDays) : undefined,
          }, items, days);
          generatedOrders.push(order);
        }
      }
    }

    // ===== ADDITIONAL CONVERSATIONS — every restaurant-supplier pair =====
    const convoStarters = [
      "Hallo, brauchen wir noch was zur aktuellen Lieferung?",
      "Können Sie kurz die Verfügbarkeit für nächste Woche bestätigen?",
      "Danke für die letzte Lieferung — alles bestens angekommen.",
      "Können wir den Liefertag fix auf Mittwoch verlegen?",
      "Gibt es aktuell Sonderkonditionen bei Großbestellungen?",
      "Brauche dringend Nachschub, geht das spontan?",
      "Wann erhalte ich die Rechnung für letzte Woche?",
      "Können Sie mir Ihren aktuellen Katalog mailen?",
    ];
    const convoReplies = [
      "Klar, geht in Ordnung — melde mich gleich nochmal.",
      "Ja, alles auf Lager. Wann brauchen Sie es?",
      "Freut mich zu hören! Bis nächste Woche.",
      "Mittwoch passt perfekt, ab nächster Woche.",
      "Bei Mengen über 500€ gibt's 5% Rabatt — passt das?",
      "Spontan ist eng, aber morgen früh ginge.",
      "Rechnung kommt heute Abend per Mail.",
      "Sende ich Ihnen gleich rüber, danke für die Anfrage!",
    ];
    for (const restaurant of restaurants) {
      for (const supplier of suppliers) {
        const conv = await this.getOrCreateConversation(restaurant.id, supplier.id);
        const numMsgs = randInt(3, 8);
        for (let i = 0; i < numMsgs; i++) {
          const fromRestaurant = i % 2 === 0;
          const senderId = fromRestaurant ? restaurant.id : supplier.id;
          const text = fromRestaurant ? pick(convoStarters) : pick(convoReplies);
          await this.sendMessage({ conversationId: conv.id, senderId, messageType: "text", content: text });
        }
      }
    }

    // ===== CUSTOM PRICES — many per restaurant-supplier pair =====
    const customPriceRows: any[] = [];
    for (const restaurant of restaurants) {
      for (const supplier of suppliers) {
        const supProducts = productsBySupplier[supplier.id] || [];
        const sample = [...supProducts].sort(() => rand() - 0.5).slice(0, randInt(3, 6));
        for (const p of sample) {
          const discount = 0.85 + rand() * 0.1;
          customPriceRows.push({
            productId: p.id, supplierId: supplier.id, restaurantId: restaurant.id,
            customPrice: (parseFloat(p.price) * discount).toFixed(2),
          });
        }
      }
    }
    if (customPriceRows.length) await db.insert(customPrices).values(customPriceRows);

    // ===== CUSTOM MOQs =====
    const moqRows: any[] = [];
    for (const restaurant of restaurants) {
      for (const supplier of suppliers) {
        const supProducts = productsBySupplier[supplier.id] || [];
        const sample = [...supProducts].sort(() => rand() - 0.5).slice(0, randInt(1, 3));
        for (const p of sample) {
          moqRows.push({
            productId: p.id, supplierId: supplier.id, restaurantId: restaurant.id,
            minOrderQuantity: randInt(2, 5),
          });
        }
      }
    }
    if (moqRows.length) await db.insert(customMinOrderQuantities).values(moqRows);

    // ===== DELIVERY SCHEDULES — every pair gets 2-3 days =====
    const scheduleRows: any[] = [];
    for (const restaurant of restaurants) {
      for (const supplier of suppliers) {
        const days = [1, 2, 3, 4, 5].sort(() => rand() - 0.5).slice(0, randInt(2, 3));
        for (const d of days) {
          scheduleRows.push({
            supplierId: supplier.id, restaurantId: restaurant.id, dayOfWeek: d,
            deliveryTimeFrom: pick(["06:00", "07:00", "08:00"]),
            deliveryTimeTo: pick(["09:00", "10:00", "11:00", "12:00"]),
          });
        }
      }
    }
    if (scheduleRows.length) await db.insert(deliverySchedules).values(scheduleRows);

    // ===== PROMOTIONS — 4-6 per supplier =====
    const promoRows: any[] = [];
    const promoNames = ["Wochen-Aktion", "Frischetage", "Saison-Sale", "Großkunden-Bonus", "Neukunden-Rabatt", "Best-Preis-Garantie", "Lager-Räumung"];
    for (const supplier of suppliers) {
      const supProducts = productsBySupplier[supplier.id] || [];
      const sample = [...supProducts].sort(() => rand() - 0.5).slice(0, randInt(4, 6));
      for (const p of sample) {
        const startOffset = randInt(-7, 0);
        const endOffset = startOffset + randInt(7, 30);
        promoRows.push({
          productId: p.id, supplierId: supplier.id,
          discountPercent: randInt(5, 25),
          startDate: inDays(startOffset), endDate: inDays(endOffset),
          isActive: true,
          name: pick(promoNames),
          description: `Sonderpreis auf ${p.name}`,
        });
      }
    }
    if (promoRows.length) await db.insert(promotions).values(promoRows);

    // ===== ADDITIONAL COMPLAINTS — programmatic =====
    const deliveredOrders = generatedOrders.filter(o => o.status === "delivered");
    const complaintTitles = [
      { t: "Ware beschädigt geliefert", d: "Ein Teil der Ware wurde beschädigt geliefert. Bitte um Klärung.", p: "high" },
      { t: "Falsche Menge", d: "Die gelieferte Menge stimmt nicht mit der Bestellung überein.", p: "standard" },
      { t: "MHD zu kurz", d: "Das Mindesthaltbarkeitsdatum war beim Erhalt deutlich zu kurz.", p: "standard" },
      { t: "Qualität nicht zufriedenstellend", d: "Die Qualität entspricht nicht den vereinbarten Standards.", p: "high" },
      { t: "Lieferung verspätet", d: "Die Lieferung kam mehrere Stunden zu spät — Service stark beeinträchtigt.", p: "low" },
      { t: "Falsches Produkt geliefert", d: "Statt des bestellten Produkts wurde ein anderes Produkt geliefert.", p: "standard" },
    ];
    const complaintStatuses = ["open", "in_progress", "resolved"];
    const sampledForComplaints = [...deliveredOrders].sort(() => rand() - 0.5).slice(0, 12);
    for (const o of sampledForComplaints) {
      const c = pick(complaintTitles);
      await db.insert(complaints).values({
        orderId: o.id, restaurantId: o.restaurantId, supplierId: o.supplierId,
        title: c.t, description: c.d, status: pick(complaintStatuses) as any, priority: c.p as any,
      });
    }

    // ===== NOTIFICATIONS — many per user =====
    const notifRows: any[] = [];
    const restaurantNotifs = [
      { type: "order_status", title: "Lieferung unterwegs", message: "Ihre Bestellung ist in Auslieferung." },
      { type: "order_status", title: "Bestellung bestätigt", message: "Der Lieferant hat Ihre Bestellung bestätigt." },
      { type: "order_status", title: "Lieferung abgeschlossen", message: "Ihre Bestellung wurde erfolgreich geliefert." },
      { type: "new_message", title: "Neue Nachricht", message: "Sie haben eine neue Nachricht erhalten." },
      { type: "new_message", title: "Neues Angebot", message: "Ein Lieferant hat ein neues Angebot veröffentlicht." },
      { type: "complaint_comment", title: "Reklamation aktualisiert", message: "Ihre Reklamation wurde bearbeitet." },
      { type: "order_status", title: "Teilbestätigung", message: "Ein Teil Ihrer Bestellung wurde bestätigt." },
      { type: "new_message", title: "Antwort erhalten", message: "Antwort auf Ihre Anfrage eingetroffen." },
    ];
    const supplierNotifs = [
      { type: "new_order", title: "Neue Bestellung", message: "Sie haben eine neue Bestellung erhalten." },
      { type: "new_order", title: "Großbestellung", message: "Ein Restaurant hat eine Großbestellung aufgegeben." },
      { type: "new_complaint", title: "Neue Reklamation", message: "Eine neue Reklamation wurde eingereicht." },
      { type: "new_message", title: "Neue Nachricht", message: "Sie haben eine neue Nachricht erhalten." },
      { type: "low_stock", title: "Niedriger Lagerbestand", message: "Ein Produkt nähert sich dem Mindestbestand." },
      { type: "low_stock", title: "Produkt ausverkauft", message: "Ein Produkt ist nicht mehr auf Lager." },
      { type: "order_status", title: "Stornierung", message: "Eine Bestellung wurde storniert." },
      { type: "new_order", title: "Wiederholungsbestellung", message: "Stammkunde hat erneut bestellt." },
    ];
    for (const r of restaurants) {
      const num = randInt(15, 22);
      for (let i = 0; i < num; i++) {
        const n = pick(restaurantNotifs);
        notifRows.push({ userId: r.id, type: n.type, title: n.title, message: n.message, isRead: rand() > 0.5 });
      }
    }
    for (const s of suppliers) {
      const num = randInt(15, 22);
      for (let i = 0; i < num; i++) {
        const n = pick(supplierNotifs);
        notifRows.push({ userId: s.id, type: n.type, title: n.title, message: n.message, isRead: rand() > 0.5 });
      }
    }
    if (notifRows.length) await db.insert(notifications).values(notifRows);

    // ===== STOCK MOVEMENTS — many per product =====
    const stockRows: any[] = [];
    for (const supplier of suppliers) {
      const supProducts = productsBySupplier[supplier.id] || [];
      for (const p of supProducts) {
        let currentStock = randInt(0, 50);
        const moves = randInt(4, 8);
        for (let i = 0; i < moves; i++) {
          const isIn = rand() > 0.4;
          const delta = isIn ? randInt(20, 80) : -randInt(2, 20);
          const newStock = Math.max(0, currentStock + delta);
          stockRows.push({
            productId: p.id, supplierId: supplier.id,
            type: isIn ? "manual_in" : "order_confirmed",
            quantity: delta,
            previousStock: currentStock, newStock,
            note: isIn ? "Wareneingang" : "Bestellabzug",
          });
          currentStock = newStock;
        }
      }
    }
    if (stockRows.length) {
      // batch insert in chunks to avoid huge single insert
      const chunkSize = 200;
      for (let i = 0; i < stockRows.length; i += chunkSize) {
        await db.insert(stockMovements).values(stockRows.slice(i, i + chunkSize));
      }
    }

    // ===== ORDER TEMPLATES — 2-3 more per restaurant =====
    const templateNames = [
      "Tägliche Frischeware", "Wochenend-Großbestellung", "Standard-Wochenpaket",
      "Notfall-Nachbestellung", "Monatliche Grundausstattung",
    ];
    for (const restaurant of restaurants) {
      const numTmpls = randInt(2, 3);
      for (let i = 0; i < numTmpls; i++) {
        const supplier = pick(suppliers);
        const supProducts = productsBySupplier[supplier.id] || [];
        if (!supProducts.length) continue;
        const [tmpl] = await db.insert(orderTemplates).values({
          restaurantId: restaurant.id, name: pick(templateNames),
        }).returning();
        const items = [...supProducts].sort(() => rand() - 0.5).slice(0, randInt(3, 6));
        await db.insert(orderTemplateItems).values(items.map(p => ({
          templateId: tmpl.id, productId: p.id, quantity: randInt(2, 12),
        })));
      }
    }

    // ===== COST SETTINGS + OVERNIGHT STAYS per restaurant =====
    const costRows: any[] = [];
    const stayRows: any[] = [];
    for (const restaurant of restaurants) {
      costRows.push({ restaurantId: restaurant.id, targetCostPerGuest: (12 + rand() * 8).toFixed(2) });
      // 60 days of overnight stays
      for (let d = 0; d < 60; d++) {
        const date = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().slice(0, 10);
        const isWeekend = [0, 5, 6].includes(date.getDay());
        const stays = isWeekend ? randInt(40, 80) : randInt(20, 55);
        stayRows.push({ restaurantId: restaurant.id, date: dateStr, overnightStays: stays });
      }
    }
    if (costRows.length) await db.insert(costSettings).values(costRows);
    if (stayRows.length) {
      const chunkSize = 200;
      for (let i = 0; i < stayRows.length; i += chunkSize) {
        await db.insert(overnightStays).values(stayRows.slice(i, i + chunkSize));
      }
    }

    // ===== MINIMUM ORDER VALUES per supplier =====
    const movRows: any[] = [];
    for (const supplier of suppliers) {
      movRows.push({ supplierId: supplier.id, zone: "Zone Stadt", minimumValue: (50 + randInt(0, 50)).toFixed(2) });
      movRows.push({ supplierId: supplier.id, zone: "Zone Umland", minimumValue: (100 + randInt(0, 100)).toFixed(2) });
      movRows.push({ supplierId: supplier.id, zone: null, minimumValue: (75 + randInt(0, 50)).toFixed(2) });
    }
    if (movRows.length) await db.insert(minimumOrderValues).values(movRows);

    // ============================================================
    // ===== PIRI'S JAGDHOF — vollständiger Test-Betrieb ==========
    // ============================================================
    const piri = await this.createUser({
      role: "restaurant", name: "Pirmin Hofer", email: "piri@jagdhof.de",
      phone: "+49 8022 887766", companyName: "Piri's Jagdhof",
      address: "Wildbachweg 7", city: "Tegernsee", postalCode: "83684",
      description: "Traditioneller Jagdhof mit Wildküche, Hotel mit 28 Zimmern und Restaurant für 90 Gäste",
      profileImageUrl: avatar(67),
    });

    const piriSuppliers = [supplier1, supplier2, supplier3, supplier4, supplier5];

    // ----- Konversationen mit allen Lieferanten -----
    const piriConvs: Record<string, string> = {};
    for (const s of piriSuppliers) {
      const c = await this.getOrCreateConversation(piri.id, s.id);
      piriConvs[s.id] = c.id;
    }
    const piriMessages: Array<{ supId: string; from: "r" | "s"; text: string; daysAgo: number }> = [
      { supId: supplier1.id, from: "r", text: "Servus Hans, brauchen ab nächster Woche jeden Mo/Mi/Fr Frischeware. Können wir das fix vereinbaren?", daysAgo: 75 },
      { supId: supplier1.id, from: "s", text: "Servus Piri, klar — drei Touren die Woche, jeweils zwischen 06:00 und 08:00.", daysAgo: 75 },
      { supId: supplier1.id, from: "r", text: "Perfekt, danke! Dann fangen wir Anfang Februar an.", daysAgo: 75 },
      { supId: supplier1.id, from: "s", text: "Spinat und Wurzelgemüse für Wildgerichte hab ich diese Woche besonders günstig.", daysAgo: 21 },
      { supId: supplier1.id, from: "r", text: "Top, schick mir ein Angebot über 30kg Spinat und 50kg Karotten.", daysAgo: 21 },
      { supId: supplier1.id, from: "s", text: "Geht heute Abend per Mail raus, beste Grüße!", daysAgo: 21 },
      { supId: supplier1.id, from: "r", text: "Hans, kannst Du Freitag noch 10kg Steinpilze besorgen?", daysAgo: 4 },
      { supId: supplier1.id, from: "s", text: "Pilze sind eingeplant, kommen mit der Freitagstour.", daysAgo: 4 },

      { supId: supplier2.id, from: "r", text: "Anna, brauche regelmäßig Wildbret-Begleiter: Speck, Bauchfleisch, Bratwürste. Standardrhythmus 14-tägig?", daysAgo: 70 },
      { supId: supplier2.id, from: "s", text: "Geht klar, alle 2 Wochen am Dienstag. Pass ich auf Dich zu.", daysAgo: 70 },
      { supId: supplier2.id, from: "r", text: "Für Ostern brauch ich 8kg Lammkarree und 5kg Lammkeule.", daysAgo: 26 },
      { supId: supplier2.id, from: "s", text: "Notiert, kommt eine Woche vorher.", daysAgo: 26 },
      { supId: supplier2.id, from: "r", text: "Anna, das letzte Rinderfilet war zu fettreich, bitte beim nächsten Mal genauer trimmen.", daysAgo: 9 },
      { supId: supplier2.id, from: "s", text: "Sorry, kümmer mich drum. Nächste Lieferung wird Premium-Trim.", daysAgo: 9 },

      { supId: supplier3.id, from: "r", text: "Peter, für die Saison brauche ich 20 Kisten Augustiner pro Woche fix.", daysAgo: 68 },
      { supId: supplier3.id, from: "s", text: "Mach ich Dir, jeden Donnerstag 20 Kisten. Wein dazu?", daysAgo: 68 },
      { supId: supplier3.id, from: "r", text: "Ja, 6 Kisten Riesling und 4 Chianti monatlich.", daysAgo: 68 },
      { supId: supplier3.id, from: "s", text: "Eingetragen. Kannst Dich drauf verlassen.", daysAgo: 68 },
      { supId: supplier3.id, from: "r", text: "Peter, hast Du was günstiges in Roten zur Wildsaison?", daysAgo: 12 },
      { supId: supplier3.id, from: "s", text: "Spätburgunder hab ich gerade zum Aktionspreis, sehr passend zum Wild.", daysAgo: 12 },

      { supId: supplier4.id, from: "r", text: "Ciao Julia, bitte 5kg Parmigiano und 4L Olivenöl monatlich.", daysAgo: 60 },
      { supId: supplier4.id, from: "s", text: "Ciao Piri, geht klar! Ab Mitte Februar dann mit Stammkundenrabatt.", daysAgo: 60 },
      { supId: supplier4.id, from: "r", text: "Trüffelöl bitte zur Saisonkarte mit reinpacken.", daysAgo: 18 },
      { supId: supplier4.id, from: "s", text: "Trüffelöl 250ml liegt bei.", daysAgo: 18 },

      { supId: supplier5.id, from: "r", text: "Erik, einmal die Woche frischen Fisch wäre top — am liebsten Forelle und Lachs.", daysAgo: 65 },
      { supId: supplier5.id, from: "s", text: "Mittwoch ist mein Tag für die Region — passt das?", daysAgo: 65 },
      { supId: supplier5.id, from: "r", text: "Mittwoch passt. Lieferung bitte vor 10 Uhr.", daysAgo: 65 },
      { supId: supplier5.id, from: "s", text: "Geht klar. Sag Bescheid wenn Du Sondersachen brauchst.", daysAgo: 65 },
      { supId: supplier5.id, from: "r", text: "Brauche kommende Woche 4kg Jakobsmuscheln für Tasting-Menü.", daysAgo: 6 },
      { supId: supplier5.id, from: "s", text: "Jakobsmuscheln frisch eingetroffen, sind reserviert.", daysAgo: 6 },
    ];
    for (const m of piriMessages) {
      const senderId = m.from === "r" ? piri.id : m.supId;
      const ts = new Date(Date.now() - m.daysAgo * 24 * 60 * 60 * 1000);
      await db.insert(messages).values({
        conversationId: piriConvs[m.supId], senderId, messageType: "text", content: m.text, createdAt: ts,
      });
    }

    // ----- Bestellungen Feb-Apr 2026 (heute = 2026-04-20) -----
    const piriProducts: Record<string, any[]> = {};
    for (const s of piriSuppliers) piriProducts[s.id] = productsBySupplier[s.id] || [];

    // Deterministischer PRNG nur für Piri (separater seed)
    let _ps = 42424;
    const prand = () => { _ps = (_ps * 9301 + 49297) % 233280; return _ps / 233280; };
    const prandInt = (mn: number, mx: number) => Math.floor(prand() * (mx - mn + 1)) + mn;
    const ppick = <T,>(arr: T[]): T => arr[Math.floor(prand() * arr.length)];

    type PiriOrderSpec = { supplier: any; daysAgo: number; status: string; items: number; futureDays?: number; notes?: string };
    const piriOrderSpecs: PiriOrderSpec[] = [];

    // Wöchentlicher Frische-Rhythmus (Supplier 1) — Mo/Mi/Fr, 11 Wochen
    for (let week = 0; week < 11; week++) {
      const baseDays = week * 7;
      // Mo
      if (baseDays + 4 <= 78) piriOrderSpecs.push({ supplier: supplier1, daysAgo: 78 - baseDays, status: "delivered", items: prandInt(3, 6) });
      // Mi
      if (baseDays + 2 <= 78) piriOrderSpecs.push({ supplier: supplier1, daysAgo: 76 - baseDays, status: "delivered", items: prandInt(3, 5) });
      // Fr
      if (baseDays <= 78) piriOrderSpecs.push({ supplier: supplier1, daysAgo: 74 - baseDays, status: "delivered", items: prandInt(3, 6) });
    }
    // Metzgerei (Supplier 2) — alle 2 Wochen
    for (let i = 0; i < 6; i++) {
      const d = 75 - i * 14;
      if (d > 0) piriOrderSpecs.push({ supplier: supplier2, daysAgo: d, status: "delivered", items: prandInt(3, 5) });
    }
    // Getränke (Supplier 3) — wöchentlich Augustiner
    for (let i = 0; i < 11; i++) {
      const d = 73 - i * 7;
      if (d > 0) piriOrderSpecs.push({ supplier: supplier3, daysAgo: d, status: "delivered", items: prandInt(2, 4) });
    }
    // Italia Import (Supplier 4) — monatlich
    piriOrderSpecs.push({ supplier: supplier4, daysAgo: 70, status: "delivered", items: 4 });
    piriOrderSpecs.push({ supplier: supplier4, daysAgo: 42, status: "delivered", items: 5 });
    piriOrderSpecs.push({ supplier: supplier4, daysAgo: 14, status: "delivered", items: 4 });
    // Fisch (Supplier 5) — wöchentlich Mittwochs
    for (let i = 0; i < 10; i++) {
      const d = 72 - i * 7;
      if (d > 0) piriOrderSpecs.push({ supplier: supplier5, daysAgo: d, status: "delivered", items: prandInt(2, 4) });
    }

    // Aktuelle Bestellungen (offene Pipeline)
    piriOrderSpecs.push({ supplier: supplier1, daysAgo: 1, status: "in_delivery", items: 5, futureDays: 0, notes: "Tour heute Vormittag" });
    piriOrderSpecs.push({ supplier: supplier2, daysAgo: 0, status: "confirmed", items: 4, futureDays: 2, notes: "Wildbegleiter für Wochenende" });
    piriOrderSpecs.push({ supplier: supplier3, daysAgo: 0, status: "pending", items: 3, futureDays: 3 });
    piriOrderSpecs.push({ supplier: supplier4, daysAgo: 1, status: "partially_confirmed", items: 4, futureDays: 1, notes: "Trüffelöl evtl. nicht verfügbar" });
    piriOrderSpecs.push({ supplier: supplier5, daysAgo: 0, status: "confirmed", items: 3, futureDays: 1, notes: "Jakobsmuscheln Tasting-Menü" });
    // Eine Stornierung
    piriOrderSpecs.push({ supplier: supplier3, daysAgo: 19, status: "cancelled", items: 2, notes: "Falsche Bestellung — wurde manuell storniert" });
    piriOrderSpecs.push({ supplier: supplier1, daysAgo: 38, status: "cancelled", items: 3, notes: "Veranstaltung abgesagt" });

    const piriDeliveredOrders: any[] = [];
    for (const spec of piriOrderSpecs) {
      const supProds = piriProducts[spec.supplier.id];
      if (!supProds || !supProds.length) continue;
      const used = new Set<number>();
      const items: any[] = [];
      for (let j = 0; j < spec.items && used.size < supProds.length; j++) {
        let idx; do { idx = prandInt(0, supProds.length - 1); } while (used.has(idx));
        used.add(idx);
        const p = supProds[idx];
        const qty = prandInt(2, 14);
        const confirmedQty = spec.status === "partially_confirmed" ? Math.max(1, qty - prandInt(1, 3)) : null;
        items.push({
          productId: p.id, productName: p.name, quantity: qty,
          unitPrice: p.price, totalPrice: (parseFloat(p.price) * qty).toFixed(2),
          confirmedQuantity: confirmedQty,
        });
      }
      const total = items.reduce((s, it) => s + parseFloat(it.totalPrice), 0).toFixed(2);
      const order = await createOrderWithDate({
        restaurantId: piri.id, supplierId: spec.supplier.id,
        status: spec.status as any, totalAmount: total,
        notes: spec.notes,
        requestedDeliveryDate: spec.futureDays !== undefined ? futureDate(spec.futureDays) : undefined,
      }, items, spec.daysAgo);
      if (spec.status === "delivered") piriDeliveredOrders.push(order);
    }

    // ----- Reklamationen (4 Stück, gemischter Status) -----
    const piriComplaintSpecs = [
      { idx: 0, title: "Forelle nicht sashimi-frisch", desc: "Lieferung am Mittwoch kam, Forelle hatte bereits leichten Geruch. Ware musste weggeworfen werden — bitte Gutschrift.", status: "in_progress", priority: "high" },
      { idx: 1, title: "Augustiner-Kiste mit 3 zerbrochenen Flaschen", desc: "Beim Abladen waren 3 von 20 Flaschen gebrochen. Kartonboden war durchnässt.", status: "resolved", priority: "standard" },
      { idx: 2, title: "Falsche Spaghetti-Sorte", desc: "Bestellt war Spaghetti N°5, geliefert wurde N°7. Bitte beim nächsten Mal beachten.", status: "open", priority: "low" },
      { idx: 3, title: "Rinderfilet zu fettreich", desc: "Das gelieferte Rinderfilet hatte deutlich mehr Fett als üblich. Mussten viel wegtrimmen.", status: "resolved", priority: "standard" },
    ];
    for (const cs of piriComplaintSpecs) {
      if (cs.idx >= piriDeliveredOrders.length) continue;
      const o = piriDeliveredOrders[cs.idx * 3];
      if (!o) continue;
      await db.insert(complaints).values({
        orderId: o.id, restaurantId: piri.id, supplierId: o.supplierId,
        title: cs.title, description: cs.desc, status: cs.status as any, priority: cs.priority as any,
      });
    }

    // ----- Sonderpreise (Stammkunden-Konditionen) -----
    const piriCustomPriceRows: any[] = [];
    for (const s of piriSuppliers) {
      const sample = [...piriProducts[s.id]].sort(() => prand() - 0.5).slice(0, 4);
      for (const p of sample) {
        const discount = 0.85 + prand() * 0.08;
        piriCustomPriceRows.push({
          productId: p.id, supplierId: s.id, restaurantId: piri.id,
          customPrice: (parseFloat(p.price) * discount).toFixed(2),
        });
      }
    }
    if (piriCustomPriceRows.length) await db.insert(customPrices).values(piriCustomPriceRows);

    // ----- Mindestbestellmengen -----
    const piriMoqRows: any[] = [];
    for (const s of piriSuppliers) {
      const sample = [...piriProducts[s.id]].sort(() => prand() - 0.5).slice(0, 2);
      for (const p of sample) {
        piriMoqRows.push({
          productId: p.id, supplierId: s.id, restaurantId: piri.id,
          minOrderQuantity: prandInt(2, 5),
        });
      }
    }
    if (piriMoqRows.length) await db.insert(customMinOrderQuantities).values(piriMoqRows);

    // ----- Liefertage -----
    await db.insert(deliverySchedules).values([
      { supplierId: supplier1.id, restaurantId: piri.id, dayOfWeek: 1, deliveryTimeFrom: "06:00", deliveryTimeTo: "08:00" },
      { supplierId: supplier1.id, restaurantId: piri.id, dayOfWeek: 3, deliveryTimeFrom: "06:00", deliveryTimeTo: "08:00" },
      { supplierId: supplier1.id, restaurantId: piri.id, dayOfWeek: 5, deliveryTimeFrom: "06:00", deliveryTimeTo: "08:00" },
      { supplierId: supplier2.id, restaurantId: piri.id, dayOfWeek: 2, deliveryTimeFrom: "07:00", deliveryTimeTo: "10:00" },
      { supplierId: supplier3.id, restaurantId: piri.id, dayOfWeek: 4, deliveryTimeFrom: "08:00", deliveryTimeTo: "12:00" },
      { supplierId: supplier4.id, restaurantId: piri.id, dayOfWeek: 1, deliveryTimeFrom: "07:00", deliveryTimeTo: "11:00" },
      { supplierId: supplier5.id, restaurantId: piri.id, dayOfWeek: 3, deliveryTimeFrom: "07:00", deliveryTimeTo: "10:00" },
    ]);

    // ----- Bestellvorlagen -----
    const piriTemplates = [
      { name: "Wildküche Standard", supId: supplier2.id, productNames: ["Schweinebauch", "Bratwurst", "Bacon geräuchert", "Roastbeef"] },
      { name: "Tägliche Frischeware", supId: supplier1.id, productNames: ["Karotten", "Bio Spinat", "Petersilie", "Lauch", "Bio Knoblauch"] },
      { name: "Wochenend-Getränke", supId: supplier3.id, productNames: ["Augustiner Helles", "Mineralwasser", "Riesling QbA", "Apfelsaft"] },
      { name: "Hochzeits-Menü Mai", supId: supplier5.id, productNames: ["Lachsfilet", "Jakobsmuscheln", "Forellenfilet"] },
    ];
    for (const t of piriTemplates) {
      const supProds = piriProducts[t.supId];
      const matched = t.productNames.map(n => supProds.find(p => p.name === n)).filter(Boolean);
      if (!matched.length) continue;
      const [tmpl] = await db.insert(orderTemplates).values({ restaurantId: piri.id, name: t.name }).returning();
      await db.insert(orderTemplateItems).values(matched.map((p: any) => ({
        templateId: tmpl.id, productId: p.id, quantity: prandInt(3, 10),
      })));
    }

    // ----- Benachrichtigungen -----
    const piriNotifs: any[] = [
      { userId: piri.id, type: "order_status", title: "Lieferung unterwegs", message: "Frische Produkte GmbH liefert gerade Ihre Bestellung.", isRead: false },
      { userId: piri.id, type: "order_status", title: "Bestellung bestätigt", message: "Metzgerei Bauer hat Ihre Wildbegleiter-Bestellung bestätigt.", isRead: false },
      { userId: piri.id, type: "new_message", title: "Neue Nachricht", message: "Erik Andersen: Jakobsmuscheln frisch eingetroffen, sind reserviert.", isRead: false },
      { userId: piri.id, type: "complaint_comment", title: "Reklamation aktualisiert", message: "Nordsee Fisch hat zur Reklamation 'Forelle nicht sashimi-frisch' geantwortet.", isRead: false },
      { userId: piri.id, type: "order_status", title: "Teilbestätigung", message: "Italia Import hat Ihre Bestellung teilweise bestätigt — Trüffelöl evtl. nicht verfügbar.", isRead: false },
      { userId: piri.id, type: "new_message", title: "Antwort erhalten", message: "Peter Klein: Spätburgunder hab ich zum Aktionspreis.", isRead: true },
      { userId: piri.id, type: "order_status", title: "Lieferung abgeschlossen", message: "Ihre Bestellung von Getränke Klein wurde geliefert.", isRead: true },
      { userId: piri.id, type: "order_status", title: "Lieferung abgeschlossen", message: "Ihre Bestellung von Frische Produkte GmbH wurde geliefert.", isRead: true },
      { userId: piri.id, type: "new_message", title: "Neue Nachricht", message: "Anna Bauer hat geantwortet zu Ihrer Anfrage.", isRead: true },
      { userId: piri.id, type: "complaint_comment", title: "Reklamation gelöst", message: "Ihre Reklamation 'Augustiner-Kiste' wurde als gelöst markiert.", isRead: true },
      { userId: piri.id, type: "order_status", title: "Bestellung bestätigt", message: "Nordsee Fisch hat Ihre Bestellung bestätigt.", isRead: true },
      { userId: piri.id, type: "order_status", title: "Bestellung storniert", message: "Eine Bestellung wurde manuell storniert.", isRead: true },
    ];
    await db.insert(notifications).values(piriNotifs);

    // ----- Kosten-Einstellung + Übernachtungen Feb-Apr 2026 -----
    await db.insert(costSettings).values({ restaurantId: piri.id, targetCostPerGuest: "16.50" });

    // 79 Tage von Feb 1 (78 days ago) bis heute (Apr 20)
    const piriStays: any[] = [];
    for (let d = 0; d <= 78; d++) {
      const date = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().slice(0, 10);
      const dow = date.getDay(); // 0=So
      // Hotel mit 28 Zimmern; Wochenende voller, Karwoche/Ostern Spitze
      const isWeekend = dow === 5 || dow === 6;
      // Ostern 2026: 5. April (Sonntag); Karwoche 30.03 - 05.04
      const isEaster = d >= 15 && d <= 21;
      let stays: number;
      if (isEaster) stays = prandInt(48, 56);
      else if (isWeekend) stays = prandInt(34, 50);
      else stays = prandInt(14, 30);
      piriStays.push({ restaurantId: piri.id, date: dateStr, overnightStays: stays });
    }
    const chunkSize = 200;
    for (let i = 0; i < piriStays.length; i += chunkSize) {
      await db.insert(overnightStays).values(piriStays.slice(i, i + chunkSize));
    }

    console.log(`Piri's Jagdhof: ${piriOrderSpecs.length} Bestellungen, ${piriStays.length} Übernachtungstage seeded.`);

    console.log(`Demo data ${DEMO_VERSION} seeded successfully!`);
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

  async deletePromotionsByGroup(groupId: string): Promise<void> {
    await db.delete(promotions).where(eq(promotions.groupId, groupId));
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

  async setDeliverySchedules(supplierId: string, restaurantId: string, days: { day: number; timeFrom?: string | null; timeTo?: string | null }[]): Promise<void> {
    await db.delete(deliverySchedules).where(
      and(eq(deliverySchedules.supplierId, supplierId), eq(deliverySchedules.restaurantId, restaurantId))
    );
    if (days.length > 0) {
      await db.insert(deliverySchedules).values(
        days.map(d => ({ supplierId, restaurantId, dayOfWeek: d.day, deliveryTimeFrom: d.timeFrom || null, deliveryTimeTo: d.timeTo || null }))
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

  // Custom Prices
  async getCustomPrices(supplierId: string): Promise<(CustomPrice & { product: Product; restaurant: User })[]> {
    const rows = await db.select().from(customPrices)
      .where(eq(customPrices.supplierId, supplierId));
    if (rows.length === 0) return [];
    const productIds = [...new Set(rows.map(r => r.productId))];
    const restaurantIds = [...new Set(rows.map(r => r.restaurantId))];
    const productList = await db.select().from(products).where(inArray(products.id, productIds));
    const restaurantList = await db.select().from(users).where(inArray(users.id, restaurantIds));
    const productMap = Object.fromEntries(productList.map(p => [p.id, p]));
    const restaurantMap = Object.fromEntries(restaurantList.map(r => [r.id, r]));
    return rows.map(r => ({ ...r, product: productMap[r.productId], restaurant: restaurantMap[r.restaurantId] }));
  }

  async getCustomPricesByRestaurant(restaurantId: string): Promise<(CustomPrice & { product: Product; restaurant: User })[]> {
    const rows = await db.select().from(customPrices)
      .where(eq(customPrices.restaurantId, restaurantId));
    if (rows.length === 0) return [];
    const productIds = [...new Set(rows.map(r => r.productId))];
    const productList = await db.select().from(products).where(inArray(products.id, productIds));
    const productMap = Object.fromEntries(productList.map(p => [p.id, p]));
    const [restaurant] = await db.select().from(users).where(eq(users.id, restaurantId));
    return rows.map(r => ({ ...r, product: productMap[r.productId], restaurant }));
  }

  async getCustomPrice(productId: string, restaurantId: string): Promise<CustomPrice | undefined> {
    const [row] = await db.select().from(customPrices)
      .where(and(eq(customPrices.productId, productId), eq(customPrices.restaurantId, restaurantId)));
    return row;
  }

  async setCustomPrice(data: InsertCustomPrice): Promise<CustomPrice> {
    const existing = await this.getCustomPrice(data.productId, data.restaurantId);
    if (existing) {
      const [updated] = await db.update(customPrices)
        .set({ customPrice: data.customPrice })
        .where(eq(customPrices.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(customPrices).values(data).returning();
    return created;
  }

  async deleteCustomPrice(id: string): Promise<void> {
    await db.delete(customPrices).where(eq(customPrices.id, id));
  }

  // Stock Movements
  async getStockMovements(productId: string): Promise<StockMovement[]> {
    return db.select().from(stockMovements)
      .where(eq(stockMovements.productId, productId))
      .orderBy(desc(stockMovements.createdAt));
  }

  async getStockMovementsBySupplier(supplierId: string): Promise<StockMovementWithProduct[]> {
    const result = await db.select()
      .from(stockMovements)
      .leftJoin(products, eq(stockMovements.productId, products.id))
      .where(eq(stockMovements.supplierId, supplierId))
      .orderBy(desc(stockMovements.createdAt));
    return result.map(r => ({ ...r.stock_movements, product: r.products! }));
  }

  async getStockMovementsByOrder(orderId: string): Promise<StockMovement[]> {
    return db.select().from(stockMovements)
      .where(eq(stockMovements.orderId, orderId))
      .orderBy(desc(stockMovements.createdAt));
  }

  async addStockMovement(movement: InsertStockMovement): Promise<StockMovement> {
    const [created] = await db.insert(stockMovements).values(movement).returning();
    return created;
  }

  async updateProductStock(productId: string, newStock: number): Promise<Product | undefined> {
    const [updated] = await db.update(products)
      .set({ stockQuantity: newStock, inStock: newStock > 0 })
      .where(eq(products.id, productId))
      .returning();
    return updated;
  }

  async getLowStockProducts(supplierId: string): Promise<Product[]> {
    const allProducts = await db.select().from(products)
      .where(eq(products.supplierId, supplierId));
    return allProducts.filter(p => 
      p.lowStockThreshold != null && p.lowStockThreshold > 0 && 
      (p.stockQuantity ?? 0) <= p.lowStockThreshold
    );
  }

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  async savePushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    const existing = await db.select().from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, sub.endpoint));
    if (existing.length > 0) {
      const [updated] = await db.update(pushSubscriptions)
        .set({ userId: sub.userId, p256dh: sub.p256dh, auth: sub.auth })
        .where(eq(pushSubscriptions.endpoint, sub.endpoint))
        .returning();
      return updated;
    }
    const [created] = await db.insert(pushSubscriptions).values(sub).returning();
    return created;
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }
}

export const storage = new DatabaseStorage();
