import { db } from "./db";
import { applyBucketMovement } from "./stockBuckets";
import { getRescueAllocationTarget, getRescuePromotionState } from "./rescuePromotion";
import { calculateLocalImpact } from "./localImpact";
import { eq, and, desc, or, sql, ne, inArray, notInArray, gt, gte, lte, isNull, isNotNull } from "drizzle-orm";
import {
  users, products, orders, orderItems, cartItems, conversations, messages, complaints, notifications, orderNotificationRetries, deliveryNotificationRetries, complaintComments, documents,
  orderStatusHistory, complaintStatusHistory, promotions, deliverySchedules, customMinOrderQuantities, customPrices, stockMovements,
  orderTemplates, orderTemplateItems, costSettings, overnightStays, minimumOrderValues, supplierRatings, monthlyReports, priceChangeLog,
  platformAdmins, type PlatformAdmin, type InsertPlatformAdmin,
  type User, type InsertUser, type Product, type InsertProduct,
  type Order, type InsertOrder, type OrderItem, type InsertOrderItem,
  type CartItem, type InsertCartItem, type Conversation, type InsertConversation,
  type Message, type InsertMessage, type MessageWithOrderNumber, type ProductWithSupplier, type OrderWithDetails,
  type ProductPurchaseHistoryEntry,
  type ConversationWithUser, type CartItemWithProduct, type Complaint, type InsertComplaint,
  type ComplaintWithDetails, type Notification, type InsertNotification, type UpdateComplaint,
  type ComplaintComment, type InsertComplaintComment, type ComplaintCommentWithUser,
  type InsertOrderNotificationRetry, type OrderNotificationRetry, type InsertDeliveryNotificationRetry, type DeliveryNotificationRetry,
  type Document, type InsertDocument, type DocumentWithDetails,
  type OrderStatusHistory, type OrderStatusHistoryWithUser,
  type ComplaintStatusHistory, type ComplaintStatusHistoryWithUser,
  type Promotion, type InsertPromotion, type PromotionWithProduct, type PromotionWithRescueState,
  inventoryRiskRecords, promotionAllocations,
  type InventoryRiskRecord, type InsertInventoryRiskRecord, type InventoryRiskRecordWithDetails,
  type DeliverySchedule, type InsertDeliverySchedule,
  type CustomMinOrderQuantity, type InsertCustomMinOrderQuantity,
  type CustomPrice, type InsertCustomPrice,
  type StockMovement, type InsertStockMovement, type StockMovementWithProduct,
  type OrderTemplate, type InsertOrderTemplate, type InsertOrderTemplateItem, type OrderTemplateWithItems,
  pushSubscriptions, type InsertPushSubscription, type PushSubscription,
  type SupplierRating, type InsertSupplierRating, type UpdateSupplierRating,
  type MonthlyReport, type InsertMonthlyReport,
  pmsProviders, hotelPmsConnections, pmsConnectionRequests, guestCountImports,
  type PmsProvider, type InsertPmsProvider,
  type HotelPmsConnection, type InsertHotelPmsConnection,
  type PmsConnectionRequest, type InsertPmsConnectionRequest,
  type GuestCountImport, type InsertGuestCountImport,
  erpProviders, supplierErpConnections, erpConnectionRequests, supplierErpCredentials,
  type ErpProvider,
  type SupplierErpConnection, type InsertSupplierErpConnection,
  type ErpConnectionRequest, type InsertErpConnectionRequest,
  type ErpCredentialType, type ErpCredentialPublicMeta,
  whatsappConnections, whatsappConnectionRequests,
  type WhatsappConnection, type InsertWhatsappConnection,
  type WhatsappConnectionRequest, type InsertWhatsappConnectionRequest,
  aiChats, aiChatMessages,
  type AiChat, type InsertAiChat, type AiChatMessage, type InsertAiChatMessage,
  members, vertreterAssignments, errorLogs, orgNotes,
  type Member, type InsertMember, type VertreterAssignment, type InsertVertreterAssignment,
  type ErrorLog, type InsertErrorLog, type OrgNote, type InsertOrgNote,
  invitations, passwordResets, oauthAccounts, emailVerifications,
  type Invitation, type InsertInvitation, type PasswordReset, type InsertPasswordReset,
  type EmailVerification, type InsertEmailVerification,
  type OauthAccount, type InsertOauthAccount, type OauthProvider,
  deliveryAssignments, driverLocations, internalMessages, internalChatReads, driverRoutes,
  type DeliveryAssignment, type InsertDeliveryAssignment, type DeliveryAssignmentWithDetails,
  type DriverLocation, type InsertDriverLocation, type DriverLocationWithDriver,
  type InternalMessage, type InsertInternalMessage, type InternalMessageWithSender,
  type InternalThread, type SafeMember, type OrderItemWithProduct, type DriverRoute,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { encryptJson, decryptJson } from "./erpCrypto";

// Platform GMV excludes scheduled orders: they can still be changed or
// cancelled before goods are in transit. Keep every admin rollup consistent.
const PLATFORM_GMV_STATUSES = sql`('delivered','confirmed','in_delivery')`;

export interface ReorderSuggestion {
  productId: string;
  productName: string;
  unit: string;
  price: string;
  imageUrl: string | null;
  inStock: boolean;
  supplierId: string;
  supplierName: string;
  timesOrdered: number;
  avgIntervalDays: number;
  daysSinceLast: number;
  dueInDays: number; // negative => overdue
  dueRatio: number; // daysSinceLast / avgIntervalDays
  suggestedQuantity: number;
  lastOrderedAt: Date;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByRole(role: "restaurant" | "supplier"): Promise<User[]>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  updateLastSeen(userId: string): Promise<void>;
  getDashboardLayout(userId: string, role: string): Promise<Array<{ id: string; size: "full" | "half" }> | null>;
  setDashboardLayout(userId: string, role: string, layout: Array<{ id: string; size: "full" | "half" }>): Promise<void>;
  getDashboardWidgets(userId: string, role: string): Promise<string[] | null>;
  setDashboardWidgets(userId: string, role: string, widgets: string[]): Promise<void>;
  getDashboardTemplates(userId: string, role: string): Promise<{ templates: Array<{ id: string; name: string; layout: Array<{ id: string; size: "full" | "half" }>; widgets: string[] }>; activeId: string | null } | null>;
  setDashboardTemplates(userId: string, role: string, value: { templates: Array<{ id: string; name: string; layout: Array<{ id: string; size: "full" | "half" }>; widgets: string[] }>; activeId: string | null }): Promise<void>;
  completeOnboarding(userId: string): Promise<User | undefined>;
  resetOnboarding(userId: string): Promise<User | undefined>;
  dismissHelpTopic(userId: string, topicId: string): Promise<User | undefined>;
  markPageIntroSeen(userId: string, introId: string): Promise<User | undefined>;
  setSkipAllPageIntros(userId: string, value: boolean): Promise<User | undefined>;
  resetPageIntros(userId: string): Promise<User | undefined>;

  // Products
  getProducts(): Promise<ProductWithSupplier[]>;
  getProductsBySupplier(supplierId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;

  // Orders
  getProductPurchaseHistory(restaurantId: string, productId: string): Promise<ProductPurchaseHistoryEntry[]>;
  getOrdersByRestaurant(restaurantId: string, opts?: { status?: string | string[]; limit?: number }): Promise<OrderWithDetails[]>;
  getOrdersBySupplier(supplierId: string, opts?: { status?: string | string[]; limit?: number }): Promise<OrderWithDetails[]>;
  getRecentOrdersByRestaurant(restaurantId: string): Promise<OrderWithDetails[]>;
  getRecentOrdersBySupplier(supplierId: string): Promise<OrderWithDetails[]>;
  getOrder(id: string): Promise<OrderWithDetails | undefined>;
  getOrdersByIdempotencyKey(restaurantId: string, idempotencyKey: string): Promise<OrderWithDetails[]>;
  createOrder(order: InsertOrder, items: InsertOrderItem[], opts?: { reserveStock?: boolean; strictReserve?: boolean; initialStatusHistory?: boolean; queueNotification?: boolean }): Promise<Order>;
  createOrdersAtomically(
    entries: { order: InsertOrder; items: InsertOrderItem[] }[],
    restaurantId: string,
    supplierId?: string,
    opts?: { queueNotifications?: boolean },
  ): Promise<Order[]>;
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
  setConversationPinned(conversationId: string, role: "restaurant" | "supplier", isPinned: boolean): Promise<void>;
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

  // Catalog indicators: per-product "previously ordered" count (last N days) +
  // which products currently have an open/on-the-way order for this restaurant.
  getProductOrderInsightsForRestaurant(restaurantId: string, days: number): Promise<Record<string, { timesOrdered: number; onTheWay: boolean }>>;

  // Auto-reorder prediction (recurring products that are due to be reordered)
  getReorderSuggestions(restaurantId: string): Promise<ReorderSuggestion[]>;

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
  getRestaurantDetailedStats(restaurantId: string): Promise<{
    monthlyRevenue: { month: string; revenue: number }[];
    topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
    topSuppliers: { supplierId: string; name: string; orders: number; revenue: number }[];
    promoSavings: number;
    ordersByStatus: { status: string; count: number }[];
  }>;
  getInactiveRestaurants(supplierId: string): Promise<Array<{
    restaurantId: string;
    name: string;
    profileImageUrl: string | null;
    lastOrderAt: string | null;
    daysSince: number;
  }>>;
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
  createNotificationOnce(notification: InsertNotification & { referenceId: string; deliveryDedupKey: string }): Promise<{ notification: Notification; created: boolean }>;
  createNewOrderNotificationOnce(notification: InsertNotification): Promise<{ notification: Notification; created: boolean }>;
  enqueueOrderNotificationRetry(retry: InsertOrderNotificationRetry): Promise<OrderNotificationRetry>;
  getPendingOrderNotificationRetries(limit?: number): Promise<OrderNotificationRetry[]>;
  claimOrderNotificationRetry(orderId: string, supplierId: string): Promise<string | undefined>;
  markOrderNotificationRetryCompleted(id: string, leaseToken: string): Promise<void>;
  markOrderNotificationRetryCompletedForOrder(orderId: string, supplierId: string, leaseToken: string): Promise<void>;
  markOrderNotificationRetryFailed(id: string, leaseToken: string, error: string): Promise<void>;
  markOrderNotificationRetryFailedForOrder(orderId: string, supplierId: string, leaseToken: string, error: string): Promise<void>;
  hasOrderMessage(orderId: string): Promise<boolean>;
  hasNotification(userId: string, type: string, referenceId: string): Promise<boolean>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  markNotificationsByReferenceAsRead(userId: string, referenceId: string, type?: string): Promise<void>;

  // Documents
  getDocumentsByOrder(orderId: string): Promise<Document[]>;
  getDocumentsByComplaint(complaintId: string): Promise<Document[]>;
  getDocumentsByUser(userId: string, role: "restaurant" | "supplier"): Promise<DocumentWithDetails[]>;
  createDocument(doc: InsertDocument): Promise<Document>;

  // Monthly reports (Task #45)
  getMonthlyReportsByRestaurant(restaurantId: string): Promise<MonthlyReport[]>;
  getMonthlyReportByMonth(restaurantId: string, month: string): Promise<MonthlyReport | undefined>;
  getMonthlyReport(id: string): Promise<MonthlyReport | undefined>;
  upsertMonthlyReport(report: InsertMonthlyReport): Promise<MonthlyReport>;
  deleteMonthlyReport(id: string): Promise<void>;

  // Status History
  getOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryWithUser[]>;
  addOrderStatusHistory(orderId: string, fromStatus: string | null, toStatus: string, changedBy?: string, changedByMemberId?: string | null): Promise<OrderStatusHistory>;
  getComplaintStatusHistory(complaintId: string): Promise<ComplaintStatusHistoryWithUser[]>;
  addComplaintStatusHistory(complaintId: string, fromStatus: string | null, toStatus: string, changedBy?: string, changedByMemberId?: string | null): Promise<ComplaintStatusHistory>;

  // Organizations / Team members & Vertreter assignments
  getMembers(organizationId: string): Promise<Member[]>;
  getMember(id: string): Promise<Member | undefined>;
  createMember(data: InsertMember): Promise<Member>;
  updateMember(id: string, data: Partial<InsertMember>): Promise<Member | undefined>;
  deleteMember(id: string): Promise<void>;
  getVertreterAssignments(supplierId: string): Promise<VertreterAssignment[]>;
  getVertreterAssignmentsForMember(memberId: string): Promise<VertreterAssignment[]>;
  createVertreterAssignment(data: InsertVertreterAssignment): Promise<VertreterAssignment>;
  deleteVertreterAssignment(supplierId: string, restaurantId: string): Promise<void>;
  getResponsibleVertreter(supplierId: string, restaurantId: string): Promise<Member | undefined>;
  backfillMembers(): Promise<number>;
  runEmailVerificationMigration(): Promise<void>;

  // Authentication: member credentials, invitations, resets & linked OAuth
  getMemberByEmail(email: string): Promise<Member | undefined>;
  updateMemberAuth(id: string, data: { passwordHash?: string | null; emailVerifiedAt?: Date | null; lastLoginAt?: Date | null }): Promise<Member | undefined>;
  createInvitation(data: InsertInvitation): Promise<Invitation>;
  getInvitationByTokenHash(tokenHash: string): Promise<Invitation | undefined>;
  getPendingInvitationByMemberId(memberId: string): Promise<Invitation | undefined>;
  getAcceptedInvitationByMemberId(memberId: string): Promise<Invitation | undefined>;
  markInvitationAccepted(id: string): Promise<void>;
  deleteInvitationsForMember(memberId: string): Promise<void>;
  createPasswordReset(data: InsertPasswordReset): Promise<PasswordReset>;
  getPasswordResetByTokenHash(tokenHash: string): Promise<PasswordReset | undefined>;
  markPasswordResetUsed(id: string): Promise<void>;
  deletePasswordResetsForMember(memberId: string): Promise<void>;
  createEmailVerification(data: InsertEmailVerification): Promise<EmailVerification>;
  getEmailVerificationByTokenHash(tokenHash: string): Promise<EmailVerification | undefined>;
  markEmailVerificationUsed(id: string): Promise<void>;
  deleteEmailVerificationsForMember(memberId: string): Promise<void>;
  markOrganizationVerified(id: string): Promise<void>;
  rejectOrganization(id: string): Promise<void>;
  // Self-signup: create a pending organization + its first admin member in one
  // transaction. The org starts unverified (verifiedAt null) and the admin has
  // a password but no emailVerifiedAt until the email link is confirmed.
  createBusinessSignup(data: { org: InsertUser; admin: Omit<InsertMember, "organizationId"> & { passwordHash: string } }): Promise<{ org: User; member: Member }>;
  createBusinessWithAdmin(data: { org: InsertUser; admin: Omit<InsertMember, "organizationId"> }): Promise<{ org: User; member: Member }>;
  getOauthAccount(provider: OauthProvider, providerUserId: string): Promise<OauthAccount | undefined>;
  getOauthAccountsForMember(memberId: string): Promise<OauthAccount[]>;
  createOauthAccount(data: InsertOauthAccount): Promise<OauthAccount>;

  // Driver module: delivery assignments, live locations, internal company chat
  runDriverMigration(): Promise<void>;
  runDeliveryConstraintsMigration(): Promise<void>;
  createDeliveryAssignment(data: InsertDeliveryAssignment): Promise<DeliveryAssignment>;
  getDeliveryAssignment(id: string): Promise<DeliveryAssignment | undefined>;
  getDeliveryAssignmentByOrder(orderId: string): Promise<DeliveryAssignment | undefined>;
  getDeliveriesForDriver(driverMemberId: string, deliveryDate?: string): Promise<DeliveryAssignmentWithDetails[]>;
  getDriverDeliveryHistory(driverMemberId: string, limit?: number): Promise<DeliveryAssignmentWithDetails[]>;
  getDeliveriesForSupplier(supplierId: string, deliveryDate?: string): Promise<DeliveryAssignmentWithDetails[]>;
  updateDeliveryAssignment(id: string, data: Partial<DeliveryAssignment>): Promise<DeliveryAssignment | undefined>;
  updateDeliveryAssignmentIfStatus(id: string, expectedStatus: string, data: Partial<DeliveryAssignment>): Promise<DeliveryAssignment | undefined>;
  updateDeliveryAssignmentIfUnresolvedProblem(id: string, data: Partial<DeliveryAssignment>): Promise<DeliveryAssignment | undefined>;
  deleteDeliveryAssignment(id: string): Promise<void>;
  reorderDeliveryStops(driverMemberId: string, deliveryDate: string, orderedIds: string[]): Promise<void>;
  applyRouteDelay(driverMemberId: string, deliveryDate: string, fromStopSequence: number, delayMinutes: number, requestKey?: string): Promise<DeliveryAssignment[]>;
  syncDraftDriverRoute(driverMemberId: string, supplierId: string, deliveryDate: string): Promise<DriverRoute | undefined>;
  upsertDriverLocation(data: InsertDriverLocation): Promise<DriverLocation>;
  getDriverLocation(driverMemberId: string): Promise<DriverLocation | undefined>;
  getDriverLocationsForSupplier(supplierId: string): Promise<DriverLocationWithDriver[]>;
  getDriverRoute(driverMemberId: string, deliveryDate: string): Promise<DriverRoute | undefined>;
  upsertDriverRoute(driverMemberId: string, supplierId: string, deliveryDate: string, orderedStopIds: string[]): Promise<DriverRoute>;
  confirmDriverRoute(driverMemberId: string, deliveryDate: string): Promise<DriverRoute | undefined>;
  startDriverRoute(driverMemberId: string, deliveryDate: string): Promise<{ route: DriverRoute; activeStopId: string } | undefined>;
  advanceDriverRoute(driverMemberId: string, deliveryDate: string, completedStopId: string): Promise<{ route: DriverRoute; activeStopId: string | null } | undefined>;
  getInternalMessages(orgId: string, memberId: string, otherMemberId: string, limit?: number): Promise<InternalMessageWithSender[]>;
  getInternalThreads(orgId: string, memberId: string): Promise<InternalThread[]>;
  createInternalMessage(data: InsertInternalMessage): Promise<InternalMessage>;
  markInternalChatRead(orgId: string, memberId: string, otherMemberId: string): Promise<void>;
  getInternalUnreadCount(orgId: string, memberId: string): Promise<number>;

  // Platform admins (GastroConnect system owners — separate from org-level roles)
  runAdminMigration(): Promise<void>;
  getPlatformAdmin(id: string): Promise<PlatformAdmin | undefined>;
  getPlatformAdminByReplitUserId(replitUserId: string): Promise<PlatformAdmin | undefined>;
  getPlatformAdminByEmail(email: string): Promise<PlatformAdmin | undefined>;
  getPlatformAdmins(): Promise<PlatformAdmin[]>;
  getApprovedPlatformAdmins(): Promise<PlatformAdmin[]>;
  getPendingOrgCount(): Promise<number>;
  createPlatformAdmin(data: InsertPlatformAdmin): Promise<PlatformAdmin>;
  updatePlatformAdmin(id: string, data: Partial<InsertPlatformAdmin>): Promise<PlatformAdmin | undefined>;
  deleteOrganizationAndMembers(orgId: string): Promise<void>;
  getAllOrgsWithMemberCount(): Promise<Array<User & { memberCount: number }>>;
  getAllOrgsWithStats(): Promise<Array<User & { memberCount: number; orderCount: number; gmv: number; lastActivityAt: string | null }>>;
  getPlatformOverview(): Promise<{
    totalOrgs: number;
    restaurants: number;
    suppliers: number;
    verifiedOrgs: number;
    pendingOrgs: number;
    totalMembers: number;
    totalOrders: number;
    ordersThisMonth: number;
    ordersLastMonth: number;
    gmvTotal: number;
    gmvThisMonth: number;
    gmvLastMonth: number;
    openComplaints: number;
  }>;
  getPlatformTimeSeries(): Promise<{ month: string; orders: number; gmv: number; newOrgs: number }[]>;
  getPlatformHealth(): Promise<{
    pendingVerifications: number;
    openComplaints: number;
    pendingAdmins: number;
    lowStockProducts: number;
    unreadMessages: number;
    failedOrderNotifications: number;
  }>;
  getPlatformRecentActivity(limit?: number): Promise<Array<{
    type: "org" | "order" | "complaint";
    id: string;
    title: string;
    subtitle: string;
    role?: string;
    status?: string;
    createdAt: string;
    link: string;
  }>>;
  getTopOrganizations(): Promise<{
    topSuppliers: { id: string; name: string; orders: number; revenue: number }[];
    topRestaurants: { id: string; name: string; orders: number; spend: number }[];
  }>;
  getAdminOpenComplaints(): Promise<Array<{
    id: string;
    complaintNumber: string | null;
    title: string;
    status: string;
    priority: string;
    reason: string | null;
    createdAt: string;
    restaurantId: string;
    restaurantName: string;
    supplierId: string;
    supplierName: string;
    orderId: string;
    orderNumber: string | null;
  }>>;
  getAdminLowStockProducts(): Promise<Array<{
    id: string;
    name: string;
    unit: string;
    category: string | null;
    stockQuantity: number;
    lowStockThreshold: number;
    supplierId: string;
    supplierName: string;
  }>>;
  getAdminOrgStats(orgId: string): Promise<{
    role: "restaurant" | "supplier";
    totalOrders: number;
    gmv: number;
    avgOrderValue: number;
    activePartners: number;
    openComplaints: number;
    productCount: number;
    lowStockCount: number;
    monthly: { month: string; orders: number; gmv: number }[];
    ordersByStatus: { status: string; count: number }[];
    topPartners: { id: string; name: string; orders: number; amount: number }[];
  } | null>;

  // Error logs
  createErrorLog(entry: InsertErrorLog): Promise<void>;
  getErrorLogs(filter?: { level?: string; source?: string; status?: string; limit?: number }): Promise<ErrorLog[]>;
  updateErrorLogStatus(id: string, status: string): Promise<void>;
  closeAllErrorLogs(): Promise<number>;
  clearErrorLogs(): Promise<void>;

  // Org notes
  getOrgNotes(organizationId: string): Promise<OrgNote[]>;
  createOrgNote(note: InsertOrgNote): Promise<OrgNote>;
  deleteOrgNote(id: string, organizationId: string): Promise<void>;

  // Member verification (admin)
  setMemberVerified(memberId: string, organizationId: string, verified: boolean): Promise<Member | null>;

  // Delivery Schedules
  getDeliverySchedules(supplierId: string): Promise<(DeliverySchedule & { restaurant: User })[]>;
  getDeliverySchedulesForRestaurant(supplierId: string, restaurantId: string): Promise<DeliverySchedule[]>;
  setDeliverySchedules(supplierId: string, restaurantId: string, days: { day: number; timeFrom?: string | null; timeTo?: string | null }[]): Promise<void>;

  // Promotions
  getPromotion(id: string): Promise<Promotion | undefined>;
  getPromotionsByGroup(groupId: string): Promise<Promotion[]>;
  getPromotionsBySupplier(supplierId: string): Promise<PromotionWithProduct[]>;
  getActivePromotionForProduct(productId: string, executor?: any, restaurantId?: string): Promise<PromotionWithRescueState | undefined>;
  getActivePromotions(restaurantId?: string, executor?: any): Promise<PromotionWithRescueState[]>;
  createPromotion(promotion: InsertPromotion, executor?: any): Promise<Promotion>;
  updatePromotion(id: string, data: Partial<InsertPromotion>, executor?: any): Promise<Promotion | undefined>;
  deletePromotion(id: string): Promise<void>;
  deletePromotionsByGroup(groupId: string): Promise<void>;

  // Inventory Risk Records
  getInventoryRiskRecordsBySupplier(
    supplierId: string,
    filters?: { status?: string; qualityStatus?: string; productId?: string },
  ): Promise<InventoryRiskRecordWithDetails[]>;
  getInventoryRiskRecord(id: string): Promise<InventoryRiskRecordWithDetails | undefined>;
  createInventoryRiskRecord(
    data: InsertInventoryRiskRecord & { supplierId: string; createdBy: string },
  ): Promise<InventoryRiskRecord>;
  updateInventoryRiskRecord(
    id: string,
    data: Partial<Omit<InventoryRiskRecord, "id" | "createdAt">>,
  ): Promise<InventoryRiskRecord | undefined>;
  actionInventoryRiskRecord(
    recordId: string,
    supplierId: string,
    input: Pick<InsertPromotion, "discountPercent" | "startDate" | "endDate" | "isActive" | "name" | "description" | "groupId" | "targetRestaurantIds"> & { quantityCap: number },
  ): Promise<{ record: InventoryRiskRecord; promotion: Promotion }>;
  reconcileRescueAllocations(orderId: string, status: string, previousStatus: string, confirmedQuantitiesByItemId: Record<string, number> | undefined, executor: any): Promise<void>;
  getOpenInventoryRiskCount(supplierId: string): Promise<number>;

  // Custom Min Order Quantities
  getCustomMinOrderQuantities(supplierId: string): Promise<(CustomMinOrderQuantity & { product: Product; restaurant: User })[]>;
  getCustomMinOrderQuantitiesByRestaurant(restaurantId: string): Promise<CustomMinOrderQuantity[]>;
  getCustomMinOrderQuantity(productId: string, restaurantId: string): Promise<CustomMinOrderQuantity | undefined>;
  getCustomMinOrderQuantityById(id: string): Promise<CustomMinOrderQuantity | undefined>;
  setCustomMinOrderQuantity(data: InsertCustomMinOrderQuantity): Promise<CustomMinOrderQuantity>;
  deleteCustomMinOrderQuantity(id: string): Promise<void>;

  // Custom Prices
  getCustomPrices(supplierId: string): Promise<(CustomPrice & { product: Product; restaurant: User })[]>;
  getCustomPricesByRestaurant(restaurantId: string): Promise<(CustomPrice & { product: Product; restaurant: User })[]>;
  getCustomPrice(productId: string, restaurantId: string): Promise<CustomPrice | undefined>;
  getCustomPriceById(id: string): Promise<CustomPrice | undefined>;
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
  setOrderTemplateFavorite(id: string, isFavorite: boolean): Promise<OrderTemplate | undefined>;
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

  // PMS Integration
  ensurePmsProviders(): Promise<void>;
  getPmsProviders(): Promise<PmsProvider[]>;
  getPmsProvider(id: string): Promise<PmsProvider | undefined>;
  getHotelConnection(restaurantId: string): Promise<(HotelPmsConnection & { provider: PmsProvider | null }) | undefined>;
  createHotelConnection(data: InsertHotelPmsConnection): Promise<HotelPmsConnection>;
  updateHotelConnection(id: string, data: Partial<InsertHotelPmsConnection>): Promise<HotelPmsConnection | undefined>;
  createPmsConnectionRequest(data: InsertPmsConnectionRequest): Promise<PmsConnectionRequest>;
  getPmsConnectionRequests(): Promise<(PmsConnectionRequest & { restaurant: User | null; provider: PmsProvider | null })[]>;
  getPmsConnectionRequest(id: string): Promise<PmsConnectionRequest | undefined>;
  updatePmsConnectionRequest(id: string, data: { status?: string; adminNotes?: string }): Promise<PmsConnectionRequest | undefined>;
  upsertGuestCountImport(data: InsertGuestCountImport): Promise<GuestCountImport>;
  getGuestCountImports(restaurantId: string): Promise<GuestCountImport[]>;
  getEffectiveGuestCountsByDate(restaurantId: string): Promise<Map<string, number>>;

  // ERP Integration (supplier stock)
  ensureErpProviders(): Promise<void>;
  getErpProviders(): Promise<ErpProvider[]>;
  getErpProvider(id: string): Promise<ErpProvider | undefined>;
  getSupplierErpConnection(supplierId: string): Promise<(SupplierErpConnection & { provider: ErpProvider | null }) | undefined>;
  createSupplierErpConnection(data: InsertSupplierErpConnection): Promise<SupplierErpConnection>;
  updateSupplierErpConnection(id: string, data: Partial<InsertSupplierErpConnection>): Promise<SupplierErpConnection | undefined>;
  createErpConnectionRequest(data: InsertErpConnectionRequest): Promise<ErpConnectionRequest>;
  getOpenErpConnectionRequest(supplierId: string): Promise<ErpConnectionRequest | undefined>;
  getErpConnectionRequests(): Promise<(ErpConnectionRequest & { supplier: User | null; provider: ErpProvider | null; hasCredentials: boolean; credentialMeta: ErpCredentialPublicMeta | null })[]>;
  getErpConnectionRequest(id: string): Promise<ErpConnectionRequest | undefined>;
  updateErpConnectionRequest(id: string, data: { status?: string; adminNotes?: string }): Promise<ErpConnectionRequest | undefined>;
  // ERP credentials (encrypted at rest; secret values never returned to clients)
  upsertErpCredentials(input: {
    connectionId: string;
    supplierId: string;
    credentialType: ErpCredentialType;
    secrets: Record<string, string>;
    hint?: string | null;
  }): Promise<ErpCredentialPublicMeta>;
  getErpCredentialMeta(connectionId: string): Promise<ErpCredentialPublicMeta | undefined>;
  getErpCredentialMetaForSupplier(supplierId: string): Promise<ErpCredentialPublicMeta | undefined>;
  getErpCredentialMetaForSuppliers(supplierIds: string[]): Promise<Map<string, ErpCredentialPublicMeta>>;
  getErpCredentialSecrets(connectionId: string): Promise<Record<string, string> | undefined>;
  deleteErpCredentials(connectionId: string): Promise<void>;

  // WhatsApp Inbox connection
  getWhatsappConnection(userId: string): Promise<WhatsappConnection | undefined>;
  createWhatsappConnection(data: InsertWhatsappConnection): Promise<WhatsappConnection>;
  updateWhatsappConnection(id: string, data: Partial<InsertWhatsappConnection>): Promise<WhatsappConnection | undefined>;
  createWhatsappConnectionRequest(data: InsertWhatsappConnectionRequest): Promise<WhatsappConnectionRequest>;
  getOpenWhatsappConnectionRequest(userId: string): Promise<WhatsappConnectionRequest | undefined>;
  getWhatsappConnectionRequests(): Promise<(WhatsappConnectionRequest & { user: User | null })[]>;
  getWhatsappConnectionRequest(id: string): Promise<WhatsappConnectionRequest | undefined>;
  updateWhatsappConnectionRequest(id: string, data: { status?: string; adminNotes?: string }): Promise<WhatsappConnectionRequest | undefined>;
  setUserWhatsappNumber(userId: string, whatsappNumber: string): Promise<void>;

  // AI Assistant chat history
  createAiChat(data: InsertAiChat): Promise<AiChat>;
  getAiChats(userId: string, role: string): Promise<AiChat[]>;
  getAiChat(id: string): Promise<AiChat | undefined>;
  getAiChatMessages(chatId: string): Promise<AiChatMessage[]>;
  appendAiChatMessage(data: InsertAiChatMessage): Promise<AiChatMessage>;
  deleteAiChat(id: string, userId: string): Promise<void>;

  // Seed
  seedData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return undefined;
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${normalized}`).limit(1);
    return user;
  }

  async getUsersByRole(role: "restaurant" | "supplier"): Promise<User[]> {
    // Public directory listings only ever surface activated organizations.
    // Self-signed-up businesses that have not yet confirmed their email
    // (verifiedAt null) stay hidden until confirmation.
    return db.select().from(users).where(and(eq(users.role, role), isNotNull(users.verifiedAt)));
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async createUser(user: InsertUser): Promise<User> {
    // Orgs created through this path (demo seed, admin tooling) are active
    // immediately. Self-signups deliberately bypass this method via
    // createBusinessSignup so they stay pending (verifiedAt null) until the
    // owner confirms their email.
    const [created] = await db
      .insert(users)
      .values({ ...user, verifiedAt: user.verifiedAt ?? new Date() })
      .returning();
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

  async getDashboardWidgets(userId: string, role: string): Promise<string[] | null> {
    const [u] = await db.select({ dashboardWidgets: users.dashboardWidgets }).from(users).where(eq(users.id, userId));
    if (!u) return null;
    const widgets = u.dashboardWidgets || {};
    return widgets[role] ?? null;
  }

  async setDashboardWidgets(userId: string, role: string, widgets: string[]): Promise<void> {
    const [u] = await db.select({ dashboardWidgets: users.dashboardWidgets }).from(users).where(eq(users.id, userId));
    if (!u) return;
    const existing = u.dashboardWidgets || {};
    const next = { ...existing, [role]: widgets };
    await db.update(users).set({ dashboardWidgets: next }).where(eq(users.id, userId));
  }

  async getDashboardTemplates(userId: string, role: string): Promise<{ templates: Array<{ id: string; name: string; layout: Array<{ id: string; size: "full" | "half" }>; widgets: string[] }>; activeId: string | null } | null> {
    const [u] = await db.select({ dashboardTemplates: users.dashboardTemplates }).from(users).where(eq(users.id, userId));
    if (!u) return null;
    const all = u.dashboardTemplates || {};
    return all[role] ?? null;
  }

  async setDashboardTemplates(userId: string, role: string, value: { templates: Array<{ id: string; name: string; layout: Array<{ id: string; size: "full" | "half" }>; widgets: string[] }>; activeId: string | null }): Promise<void> {
    const [u] = await db.select({ dashboardTemplates: users.dashboardTemplates }).from(users).where(eq(users.id, userId));
    if (!u) return;
    const existing = u.dashboardTemplates || {};
    const next = { ...existing, [role]: value };
    await db.update(users).set({ dashboardTemplates: next }).where(eq(users.id, userId));
  }

  async completeOnboarding(userId: string): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ onboardingCompletedAt: new Date() }).where(eq(users.id, userId)).returning();
    return updated;
  }

  async resetOnboarding(userId: string): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ onboardingCompletedAt: null }).where(eq(users.id, userId)).returning();
    return updated;
  }

  async dismissHelpTopic(userId: string, topicId: string): Promise<User | undefined> {
    const [u] = await db.select({ dismissedHelpTopics: users.dismissedHelpTopics }).from(users).where(eq(users.id, userId));
    if (!u) return undefined;
    const existing = u.dismissedHelpTopics || [];
    if (existing.includes(topicId)) return undefined;
    const next = [...existing, topicId];
    const [updated] = await db.update(users).set({ dismissedHelpTopics: next }).where(eq(users.id, userId)).returning();
    return updated;
  }

  async markPageIntroSeen(userId: string, introId: string): Promise<User | undefined> {
    const [u] = await db.select({ seenPageIntros: users.seenPageIntros }).from(users).where(eq(users.id, userId));
    if (!u) return undefined;
    const existing = u.seenPageIntros || [];
    if (existing.includes(introId)) {
      const [current] = await db.select().from(users).where(eq(users.id, userId));
      return current;
    }
    const next = [...existing, introId];
    const [updated] = await db.update(users).set({ seenPageIntros: next }).where(eq(users.id, userId)).returning();
    return updated;
  }

  async setSkipAllPageIntros(userId: string, value: boolean): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ skipAllPageIntros: value }).where(eq(users.id, userId)).returning();
    return updated;
  }

  async resetPageIntros(userId: string): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ seenPageIntros: [], skipAllPageIntros: false }).where(eq(users.id, userId)).returning();
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
    let createdByMember: Member | null = null;
    if (order.createdByMemberId) {
      const [m] = await db.select().from(members).where(eq(members.id, order.createdByMemberId));
      createdByMember = m || null;
    }
    return { ...order, items, restaurant, supplier, createdByUser, createdByMember };
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

  async getProductPurchaseHistory(restaurantId: string, productId: string): Promise<ProductPurchaseHistoryEntry[]> {
    const product = await db.select({ unit: products.unit }).from(products).where(eq(products.id, productId)).limit(1);
    const unit = product[0]?.unit ?? "";
    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        quantity: sql<number>`COALESCE(${orderItems.confirmedQuantity}, ${orderItems.quantity})::int`,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(orders.restaurantId, restaurantId),
        eq(orderItems.productId, productId),
        ne(orders.status, "cancelled"),
      ))
      .orderBy(orders.createdAt);
    return rows.map(r => ({
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      status: r.status,
      createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
      quantity: Number(r.quantity) || 0,
      unit,
      unitPrice: parseFloat(r.unitPrice) || 0,
      totalPrice: parseFloat(r.totalPrice) || 0,
    }));
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

  async getProductOrderInsightsForRestaurant(restaurantId: string, days: number): Promise<Record<string, { timesOrdered: number; onTheWay: boolean }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // (1) How many times each product was ordered in the window (excludes cancelled).
    const countRows = await db
      .select({
        productId: orderItems.productId,
        orderCount: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(orders.restaurantId, restaurantId),
        gte(orders.createdAt, since),
        ne(orders.status, "cancelled"),
      ))
      .groupBy(orderItems.productId);

    // (2) Which products are in a currently-open order (placed but not yet delivered/cancelled).
    const openRows = await db
      .select({ productId: orderItems.productId })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(orders.restaurantId, restaurantId),
        inArray(orders.status, ["pending", "confirmed", "scheduled", "in_delivery"] as any),
      ))
      .groupBy(orderItems.productId);

    const result: Record<string, { timesOrdered: number; onTheWay: boolean }> = {};
    for (const r of countRows) {
      if (!r.productId) continue;
      result[r.productId] = { timesOrdered: Number(r.orderCount) || 0, onTheWay: false };
    }
    for (const r of openRows) {
      if (!r.productId) continue;
      if (result[r.productId]) result[r.productId].onTheWay = true;
      else result[r.productId] = { timesOrdered: 0, onTheWay: true };
    }
    return result;
  }

  async getReorderSuggestions(restaurantId: string): Promise<ReorderSuggestion[]> {
    const DAYS_WINDOW = 180;
    const MIN_ORDERS = 3; // need a few data points to detect a cadence
    const DUE_RATIO_THRESHOLD = 0.6; // surface items at 60%+ of their usual interval
    const since = new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000);

    // One row per (order, product) for non-cancelled orders in the window.
    const rows = await db
      .select({
        productId: orderItems.productId,
        supplierId: orders.supplierId,
        orderId: orders.id,
        createdAt: orders.createdAt,
        quantity: sql<number>`COALESCE(${orderItems.confirmedQuantity}, ${orderItems.quantity})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(
        eq(orders.restaurantId, restaurantId),
        gte(orders.createdAt, since),
        ne(orders.status, "cancelled"),
      ));

    type Acc = { supplierId: string; dates: number[]; quantities: number[] };
    const byProduct = new Map<string, Acc>();
    for (const r of rows) {
      if (!r.createdAt) continue;
      const acc = byProduct.get(r.productId) ?? { supplierId: r.supplierId, dates: [], quantities: [] };
      acc.dates.push(new Date(r.createdAt).getTime());
      acc.quantities.push(Number(r.quantity) || 0);
      acc.supplierId = r.supplierId;
      byProduct.set(r.productId, acc);
    }

    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const median = (nums: number[]): number => {
      if (nums.length === 0) return 0;
      const s = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
    };

    const prelim: Array<{
      productId: string; supplierId: string; timesOrdered: number;
      avgIntervalDays: number; daysSinceLast: number; dueRatio: number;
      suggestedQuantity: number; lastOrderedAt: Date;
    }> = [];

    const entries: Array<[string, Acc]> = Array.from(byProduct.entries());
    for (const [productId, acc] of entries) {
      // Collapse to distinct order days (sorted) to derive a reorder cadence.
      const dayBuckets: number[] = acc.dates.map((d: number) => Math.floor(d / DAY));
      const uniqueDays: number[] = Array.from(new Set<number>(dayBuckets)).sort((a, b) => a - b);
      const timesOrdered = uniqueDays.length;
      if (timesOrdered < MIN_ORDERS) continue;

      let intervalSum = 0;
      for (let i = 1; i < uniqueDays.length; i++) intervalSum += uniqueDays[i] - uniqueDays[i - 1];
      const avgIntervalDays = intervalSum / (uniqueDays.length - 1);
      if (!Number.isFinite(avgIntervalDays) || avgIntervalDays <= 0) continue;

      const lastDayMs = Math.max(...acc.dates);
      const daysSinceLast = (now - lastDayMs) / DAY;
      const dueRatio = daysSinceLast / avgIntervalDays;
      if (dueRatio < DUE_RATIO_THRESHOLD) continue;

      prelim.push({
        productId,
        supplierId: acc.supplierId,
        timesOrdered,
        avgIntervalDays: Math.round(avgIntervalDays * 10) / 10,
        daysSinceLast: Math.round(daysSinceLast),
        dueRatio: Math.round(dueRatio * 100) / 100,
        suggestedQuantity: Math.max(1, median(acc.quantities)),
        lastOrderedAt: new Date(lastDayMs),
      });
    }

    if (prelim.length === 0) return [];

    // Attach current product + supplier details (skip deleted products).
    const productIds = prelim.map(p => p.productId);
    const supplierIds = Array.from(new Set(prelim.map(p => p.supplierId)));
    const productRows = await db
      .select({ id: products.id, name: products.name, unit: products.unit, price: products.price, imageUrl: products.imageUrl, inStock: products.inStock })
      .from(products)
      .where(inArray(products.id, productIds));
    const supplierRows = await db
      .select({ id: users.id, name: users.name, companyName: users.companyName })
      .from(users)
      .where(inArray(users.id, supplierIds));
    const productMap = new Map(productRows.map(p => [p.id, p]));
    const supplierMap = new Map(supplierRows.map(s => [s.id, s]));

    const suggestions: ReorderSuggestion[] = [];
    for (const p of prelim) {
      const prod = productMap.get(p.productId);
      if (!prod) continue;
      const supp = supplierMap.get(p.supplierId);
      suggestions.push({
        productId: p.productId,
        productName: prod.name,
        unit: prod.unit,
        price: prod.price,
        imageUrl: prod.imageUrl,
        inStock: prod.inStock,
        supplierId: p.supplierId,
        supplierName: supp?.companyName || supp?.name || "",
        timesOrdered: p.timesOrdered,
        avgIntervalDays: p.avgIntervalDays,
        daysSinceLast: p.daysSinceLast,
        dueInDays: Math.round(p.avgIntervalDays - p.daysSinceLast),
        dueRatio: p.dueRatio,
        suggestedQuantity: p.suggestedQuantity,
        lastOrderedAt: p.lastOrderedAt,
      });
    }

    suggestions.sort((a, b) => b.dueRatio - a.dueRatio);
    return suggestions;
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

  async getOrdersByIdempotencyKey(restaurantId: string, idempotencyKey: string): Promise<OrderWithDetails[]> {
    const matching = await db.select().from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), eq(orders.idempotencyKey, idempotencyKey)))
      .orderBy(orders.createdAt, orders.id);
    return Promise.all(matching.map(order => this.enrichOrderWithDetails(order)));
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

  private async buildLocalImpactSnapshot(
    executor: any,
    restaurantId: string,
    productId: string,
    asOf: Date,
  ) {
    const [[product], [restaurant]] = await Promise.all([
      executor.select().from(products).where(eq(products.id, productId)).limit(1),
      executor.select().from(users).where(eq(users.id, restaurantId)).limit(1),
    ]);
    return product && restaurant
      ? calculateLocalImpact(product, restaurant, asOf)
      : calculateLocalImpact({});
  }

  async createOrder(
    order: InsertOrder,
    items: InsertOrderItem[],
    opts?: { reserveStock?: boolean; strictReserve?: boolean; initialStatusHistory?: boolean; queueNotification?: boolean },
  ): Promise<Order> {
    const orderNumber = await this.generateUniqueOrderNumber();
    const reserveStock = opts?.reserveStock ?? false;
    const strict = opts?.strictReserve ?? true;

    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(orders).values({ ...order, orderNumber }).returning();

      const insertedItems = [] as InsertOrderItem[];
      for (const item of items) {
        const localImpactSnapshot = await this.buildLocalImpactSnapshot(tx, created.restaurantId, item.productId, created.createdAt);
        await tx.insert(orderItems).values({ ...item, orderId: created.id, localImpactSnapshot });
        insertedItems.push(item);
      }

      // Three-bucket warehouse: reserve ordered qty MAIN -> ITI at placement.
      if (reserveStock) {
        const reserveByProduct = new Map<string, { qty: number; name: string }>();
        for (const item of insertedItems) {
          const pid = (item as any).productId as string;
          const qty = Number((item as any).quantity) || 0;
          const name = (item as any).productName as string;
          if (!pid || qty <= 0) continue;
          const cur = reserveByProduct.get(pid);
          if (cur) cur.qty += qty;
          else reserveByProduct.set(pid, { qty, name });
        }
        for (const [productId, { qty, name }] of reserveByProduct) {
          await applyBucketMovement(tx, {
            orderId: created.id,
            supplierId: order.supplierId,
            productId,
            productName: name,
            type: "order_reserved",
            qty,
            actorId: order.createdByUserId ?? order.restaurantId,
            note: `Bestellung #${orderNumber} aufgegeben – ins Zwischenlager reserviert`,
            strict,
          });
        }
      }
      if (opts?.initialStatusHistory) {
        await tx.insert(orderStatusHistory).values({
          orderId: created.id,
          fromStatus: null,
          toStatus: created.status,
          changedBy: order.createdByUserId ?? order.restaurantId,
          changedByMemberId: order.createdByMemberId ?? null,
        });
      }
      if (opts?.queueNotification) {
        await tx.insert(orderNotificationRetries).values({
          orderId: created.id,
          restaurantId: order.restaurantId,
          supplierId: order.supplierId,
          payload: {
            orderContent: JSON.stringify({ items, total: order.totalAmount, orderId: created.id, orderNumber }),
            title: `Neue Bestellung #${orderNumber}`,
            message: `Neue Bestellung #${orderNumber} (€${order.totalAmount})`,
            titleIt: `Nuovo ordine #${orderNumber}`,
            messageIt: `Nuovo ordine #${orderNumber} (€${order.totalAmount})`,
          },
        });
      }

      return created;
    });
  }

  async createOrdersAtomically(
    entries: { order: InsertOrder; items: InsertOrderItem[] }[],
    restaurantId: string,
    supplierId?: string,
    opts?: { queueNotifications?: boolean },
  ): Promise<Order[]> {
    return await db.transaction(async (tx) => {
      // Lock referenced promotion rows before inserting order_items. The FK
      // insert takes a key-share lock on promotions; doing that first in two
      // concurrent Rescue checkouts and then upgrading both rows FOR UPDATE can
      // deadlock. A stable pre-lock order makes contenders serialize here and
      // lets the loser receive rescue_capacity_unavailable deterministically.
      const promotionIds = Array.from(new Set(
        entries.flatMap((entry) => entry.items.flatMap((item) => item.promotionId ? [item.promotionId] : [])),
      )).sort();
      for (const promotionId of promotionIds) {
        await tx.execute(sql`SELECT id FROM ${promotions} WHERE id = ${promotionId} FOR UPDATE`);
      }

      const created: Order[] = [];
      for (const entry of entries) {
        const orderNumber = await this.generateUniqueOrderNumber();
        const [order] = await tx.insert(orders).values({ ...entry.order, orderNumber }).returning();
        for (const item of entry.items) {
          const localImpactSnapshot = await this.buildLocalImpactSnapshot(tx, order.restaurantId, item.productId, order.createdAt);
          const [insertedItem] = await tx.insert(orderItems).values({ ...item, orderId: order.id, localImpactSnapshot }).returning();
          if (insertedItem.promotionId) {
            await this.reserveRescueAllocation(tx, insertedItem.id, insertedItem.promotionId, insertedItem.productId, entry.order.supplierId, entry.order.restaurantId, insertedItem.quantity);
          }
        }

        const reserveByProduct = new Map<string, { qty: number; name: string }>();
        for (const item of entry.items) {
          const productId = item.productId;
          const qty = Number(item.quantity) || 0;
          if (!productId || qty <= 0) continue;
          const existing = reserveByProduct.get(productId);
          if (existing) existing.qty += qty;
          else reserveByProduct.set(productId, { qty, name: item.productName });
        }
        for (const [productId, reservation] of reserveByProduct) {
          await applyBucketMovement(tx, {
            orderId: order.id,
            supplierId: entry.order.supplierId,
            productId,
            productName: reservation.name,
            type: "order_reserved",
            qty: reservation.qty,
            actorId: entry.order.createdByUserId ?? entry.order.restaurantId,
            note: `Bestellung #${orderNumber} aufgegeben – ins Zwischenlager reserviert`,
            strict: true,
          });
        }
        await tx.insert(orderStatusHistory).values({
          orderId: order.id,
          fromStatus: null,
          toStatus: "pending",
          changedBy: entry.order.createdByUserId ?? entry.order.restaurantId,
          changedByMemberId: entry.order.createdByMemberId ?? null,
        });
        if (opts?.queueNotifications) {
          await tx.insert(orderNotificationRetries).values({
            orderId: order.id,
            restaurantId: entry.order.restaurantId,
            supplierId: entry.order.supplierId,
            payload: {
              orderContent: JSON.stringify({ items: entry.items, total: entry.order.totalAmount, orderId: order.id, orderNumber }),
              title: `Neue Bestellung #${orderNumber}`,
              message: `Neue Bestellung #${orderNumber} (€${entry.order.totalAmount})`,
              titleIt: `Nuovo ordine #${orderNumber}`,
              messageIt: `Nuovo ordine #${orderNumber} (€${entry.order.totalAmount})`,
            },
          });
        }
        created.push(order);
      }

      if (supplierId) {
        await tx.delete(cartItems).where(and(eq(cartItems.restaurantId, restaurantId), eq(cartItems.supplierId, supplierId)));
      } else {
        await tx.delete(cartItems).where(eq(cartItems.restaurantId, restaurantId));
      }
      return created;
    });
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

  async updateOrderItems(id: string, items: InsertOrderItem[], totalAmount: string, requestedDeliveryDate?: string | null, executor?: any): Promise<Order | undefined> {
    const run = async (tx: any) => {
      const [existingOrder] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!existingOrder) return undefined;
      const existingItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
      const snapshotsByProduct = new Map<string, Array<typeof existingItems[number]["localImpactSnapshot"]>>();
      for (const existingItem of existingItems) {
        const snapshots = snapshotsByProduct.get(existingItem.productId) ?? [];
        snapshots.push(existingItem.localImpactSnapshot);
        snapshotsByProduct.set(existingItem.productId, snapshots);
      }
      await tx.delete(orderItems).where(eq(orderItems.orderId, id));
      if (items.length > 0) {
        const snapshottedItems = await Promise.all(items.map(async (item) => {
          const existingSnapshots = snapshotsByProduct.get(item.productId);
          const hasExistingSnapshot = !!existingSnapshots?.length;
          const localImpactSnapshot = hasExistingSnapshot
            ? existingSnapshots!.shift()!
            : await this.buildLocalImpactSnapshot(tx, existingOrder.restaurantId, item.productId, new Date());
          return { ...item, orderId: id, localImpactSnapshot };
        }));
        await tx.insert(orderItems).values(snapshottedItems);
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
    };
    // When an executor (an in-progress tx) is supplied, run inline so the
    // caller can keep item updates and stock movements in one atomic unit.
    return executor ? run(executor) : await db.transaction(run);
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
      .orderBy(
        desc(role === "restaurant" ? conversations.pinnedByRestaurant : conversations.pinnedBySupplier),
        desc(conversations.lastMessageAt)
      );

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

  async setConversationPinned(conversationId: string, role: "restaurant" | "supplier", isPinned: boolean): Promise<void> {
    await db
      .update(conversations)
      .set(role === "restaurant" ? { pinnedByRestaurant: isPinned } : { pinnedBySupplier: isPinned })
      .where(eq(conversations.id, conversationId));
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
    const memberIds = [...new Set(rows.map(r => r.message.senderMemberId).filter((x): x is string => !!x))];
    const memberMap = new Map<string, Member>();
    if (memberIds.length > 0) {
      const memberRows = await db.select().from(members).where(inArray(members.id, memberIds));
      for (const m of memberRows) memberMap.set(m.id, m);
    }
    return rows.map(r => ({
      ...r.message,
      orderNumber: r.orderNumber,
      senderMember: r.message.senderMemberId ? memberMap.get(r.message.senderMemberId) || null : null,
    }));
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
    const [created] = await db.insert(messages).values(message)
      .onConflictDoNothing()
      .returning();
    if (!created && message.messageType === "order" && message.orderId) {
      const [existing] = await db.select().from(messages)
        .where(and(eq(messages.orderId, message.orderId), eq(messages.messageType, "order")))
        .limit(1);
      if (existing) return existing;
    }
    if (!created) throw new Error("Message could not be created");
    
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
        or(eq(orders.status, "pending"), eq(orders.status, "confirmed"), eq(orders.status, "scheduled"), eq(orders.status, "in_delivery"))
      ));

    const supplierResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, "supplier"));
    const unreadMessages = await this.getUnreadCount(restaurantId);

    return {
      pendingOrders: Number(pendingResult[0]?.count) || 0,
      unreadMessages: Number(unreadMessages) || 0,
      totalSuppliers: Number(supplierResult[0]?.count) || 0
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
        AND status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
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
        AND status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
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
        AND status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
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
        AND status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
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
        AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
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
          AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
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
        AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
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
        AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
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
        AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
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
        AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
          AND o.created_at >= (NOW() - INTERVAL '30 days')
        GROUP BY oi.product_id
      ),
      prev AS (
        SELECT oi.product_id, SUM(oi.quantity) AS qty
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.supplier_id = ${supplierId}
        AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
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

  async getRestaurantDetailedStats(restaurantId: string): Promise<{
    monthlyRevenue: { month: string; revenue: number }[];
    topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
    topSuppliers: { supplierId: string; name: string; orders: number; revenue: number }[];
    promoSavings: number;
    ordersByStatus: { status: string; count: number }[];
  }> {
    const now = new Date();
    const currentFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
    const VALID = sql`('delivered', 'confirmed', 'in_delivery', 'scheduled')`;

    // Monthly spending (6 months, zero-filled)
    const seriesResult = await db.execute(sql`
      SELECT TO_CHAR(created_at, 'YYYY-MM') as month,
        COALESCE(SUM(CAST(total_amount AS DECIMAL)), 0) as revenue
      FROM orders
      WHERE restaurant_id = ${restaurantId}
        AND status IN ${VALID}
        AND created_at >= ${currentFrom}
      GROUP BY 1 ORDER BY 1 ASC
    `);
    const seriesMap = new Map<string, number>();
    for (const r of (seriesResult.rows || [])) {
      seriesMap.set(String((r as any).month), Number((r as any).revenue) || 0);
    }
    const monthlyRevenue: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue.push({ month: key, revenue: seriesMap.get(key) || 0 });
    }

    // Most-ordered products (6 months)
    const topProductsResult = await db.execute(sql`
      SELECT oi.product_id, MAX(oi.product_name) as name,
        SUM(oi.quantity) as quantity,
        COALESCE(SUM(CAST(oi.total_price AS DECIMAL)), 0) as revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.restaurant_id = ${restaurantId}
        AND o.status IN ${VALID}
        AND o.created_at >= ${currentFrom}
      GROUP BY oi.product_id
      ORDER BY quantity DESC
      LIMIT 5
    `);

    // Top suppliers by spending (6 months)
    const topSuppliersResult = await db.execute(sql`
      SELECT o.supplier_id,
        MAX(COALESCE(u.company_name, u.name)) as name,
        COUNT(*) as orders,
        COALESCE(SUM(CAST(o.total_amount AS DECIMAL)), 0) as revenue
      FROM orders o
      LEFT JOIN users u ON u.id = o.supplier_id
      WHERE o.restaurant_id = ${restaurantId}
        AND o.status IN ${VALID}
        AND o.created_at >= ${currentFrom}
      GROUP BY o.supplier_id
      ORDER BY revenue DESC
      LIMIT 5
    `);

    // Promotion savings: paid unit_price below the product's base price (6 months)
    const savingsResult = await db.execute(sql`
      SELECT COALESCE(SUM((CAST(p.price AS DECIMAL) - CAST(oi.unit_price AS DECIMAL)) * oi.quantity), 0) as savings
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.restaurant_id = ${restaurantId}
        AND o.status IN ${VALID}
        AND o.created_at >= ${currentFrom}
        AND CAST(oi.unit_price AS DECIMAL) < CAST(p.price AS DECIMAL)
    `);

    // Orders by status (6 months)
    const ordersByStatusResult = await db.execute(sql`
      SELECT status, COUNT(*) as count
      FROM orders
      WHERE restaurant_id = ${restaurantId}
        AND created_at >= ${currentFrom}
      GROUP BY status
    `);

    return {
      monthlyRevenue,
      topProducts: (topProductsResult.rows || []).map((r: any) => ({
        productId: r.product_id,
        name: r.name || "—",
        quantity: Number(r.quantity) || 0,
        revenue: Number(r.revenue) || 0,
      })),
      topSuppliers: (topSuppliersResult.rows || []).map((r: any) => ({
        supplierId: r.supplier_id,
        name: r.name || "—",
        orders: Number(r.orders) || 0,
        revenue: Number(r.revenue) || 0,
      })),
      promoSavings: Math.round((Number(savingsResult.rows?.[0]?.savings) || 0) * 100) / 100,
      ordersByStatus: (ordersByStatusResult.rows || []).map((r: any) => ({
        status: r.status,
        count: Number(r.count) || 0,
      })),
    };
  }

  async getInactiveRestaurants(supplierId: string): Promise<Array<{
    restaurantId: string;
    name: string;
    profileImageUrl: string | null;
    lastOrderAt: string | null;
    daysSince: number;
  }>> {
    const result = await db.execute(sql`
      SELECT sub.restaurant_id,
        COALESCE(u.company_name, u.name) as name,
        u.profile_image_url,
        sub.last_order,
        EXTRACT(DAY FROM (NOW() - sub.last_order))::int as days_since
      FROM (
        SELECT o.restaurant_id,
          MAX(o.created_at) AS last_order,
          COUNT(*) FILTER (WHERE o.created_at < (NOW() - INTERVAL '30 days') AND o.created_at >= (NOW() - INTERVAL '120 days')) AS prior_count
        FROM orders o
        WHERE o.supplier_id = ${supplierId}
        AND o.status IN ('delivered', 'confirmed', 'in_delivery', 'scheduled')
        GROUP BY o.restaurant_id
        HAVING MAX(o.created_at) < (NOW() - INTERVAL '30 days')
          AND COUNT(*) FILTER (WHERE o.created_at < (NOW() - INTERVAL '30 days') AND o.created_at >= (NOW() - INTERVAL '120 days')) >= 2
      ) sub
      LEFT JOIN users u ON u.id = sub.restaurant_id
      ORDER BY sub.last_order ASC
      LIMIT 10
    `);
    return (result.rows || []).map((r: any) => ({
      restaurantId: r.restaurant_id,
      name: r.name || "—",
      profileImageUrl: r.profile_image_url ?? null,
      lastOrderAt: r.last_order ? new Date(r.last_order).toISOString() : null,
      daysSince: Number(r.days_since) || 0,
    }));
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
    const memberMap = await this.resolveMembersFor(result.map(r => r.order_status_history.changedByMemberId));
    return result.map(r => ({
      ...r.order_status_history,
      changedByUser: r.users || undefined,
      changedByMember: r.order_status_history.changedByMemberId ? memberMap.get(r.order_status_history.changedByMemberId) || null : null,
    }));
  }

  async addOrderStatusHistory(orderId: string, fromStatus: string | null, toStatus: string, changedBy?: string, changedByMemberId?: string | null): Promise<OrderStatusHistory> {
    const [entry] = await db
      .insert(orderStatusHistory)
      .values({ orderId, fromStatus, toStatus, changedBy: changedBy || null, changedByMemberId: changedByMemberId || null })
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
    const memberMap = await this.resolveMembersFor(result.map(r => r.complaint_status_history.changedByMemberId));
    return result.map(r => ({
      ...r.complaint_status_history,
      changedByUser: r.users || undefined,
      changedByMember: r.complaint_status_history.changedByMemberId ? memberMap.get(r.complaint_status_history.changedByMemberId) || null : null,
    }));
  }

  async addComplaintStatusHistory(complaintId: string, fromStatus: string | null, toStatus: string, changedBy?: string, changedByMemberId?: string | null): Promise<ComplaintStatusHistory> {
    const [entry] = await db
      .insert(complaintStatusHistory)
      .values({ complaintId, fromStatus, toStatus, changedBy: changedBy || null, changedByMemberId: changedByMemberId || null })
      .returning();
    return entry;
  }

  // ─── Organizations / Team members ────────────────────────────────────────
  private async resolveMembersFor(ids: (string | null | undefined)[]): Promise<Map<string, Member>> {
    const memberIds = [...new Set(ids.filter((x): x is string => !!x))];
    const map = new Map<string, Member>();
    if (memberIds.length === 0) return map;
    const rows = await db.select().from(members).where(inArray(members.id, memberIds));
    for (const m of rows) map.set(m.id, m);
    return map;
  }

  async getMembers(organizationId: string): Promise<Member[]> {
    return db.select().from(members).where(eq(members.organizationId, organizationId)).orderBy(members.createdAt);
  }

  async getMember(id: string): Promise<Member | undefined> {
    const [m] = await db.select().from(members).where(eq(members.id, id));
    return m;
  }

  async createMember(data: InsertMember): Promise<Member> {
    const [created] = await db.insert(members).values(data).returning();
    return created;
  }

  async updateMember(id: string, data: Partial<InsertMember>): Promise<Member | undefined> {
    const [updated] = await db.update(members).set(data).where(eq(members.id, id)).returning();
    return updated;
  }

  async deleteMember(id: string): Promise<void> {
    // members.id is an FK target for attribution columns. Null those references
    // first so removing a member who has historical activity doesn't violate the
    // foreign keys (attribution gracefully falls back to the org user).
    await db.update(orders).set({ createdByMemberId: null }).where(eq(orders.createdByMemberId, id));
    await db.update(messages).set({ senderMemberId: null }).where(eq(messages.senderMemberId, id));
    await db.update(orderStatusHistory).set({ changedByMemberId: null }).where(eq(orderStatusHistory.changedByMemberId, id));
    await db.update(complaintStatusHistory).set({ changedByMemberId: null }).where(eq(complaintStatusHistory.changedByMemberId, id));
    await db.delete(vertreterAssignments).where(eq(vertreterAssignments.memberId, id));
    await db.delete(members).where(eq(members.id, id));
  }

  // ── Authentication storage ────────────────────────────────────────────────
  async getMemberByEmail(email: string): Promise<Member | undefined> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return undefined;
    const [m] = await db.select().from(members).where(sql`lower(${members.email}) = ${normalized}`).limit(1);
    return m;
  }

  async updateMemberAuth(
    id: string,
    data: { passwordHash?: string | null; emailVerifiedAt?: Date | null; lastLoginAt?: Date | null },
  ): Promise<Member | undefined> {
    const [updated] = await db.update(members).set(data).where(eq(members.id, id)).returning();
    return updated;
  }

  async createInvitation(data: InsertInvitation): Promise<Invitation> {
    const [created] = await db.insert(invitations).values(data).returning();
    return created;
  }

  async getInvitationByTokenHash(tokenHash: string): Promise<Invitation | undefined> {
    const [row] = await db.select().from(invitations).where(eq(invitations.tokenHash, tokenHash)).limit(1);
    return row;
  }

  async getPendingInvitationByMemberId(memberId: string): Promise<Invitation | undefined> {
    const now = new Date();
    const [row] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.memberId, memberId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .orderBy(desc(invitations.createdAt))
      .limit(1);
    return row;
  }

  async getAcceptedInvitationByMemberId(memberId: string): Promise<Invitation | undefined> {
    const [row] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.memberId, memberId), isNotNull(invitations.acceptedAt)))
      .orderBy(desc(invitations.acceptedAt))
      .limit(1);
    return row;
  }

  async markInvitationAccepted(id: string): Promise<void> {
    await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, id));
  }

  async deleteInvitationsForMember(memberId: string): Promise<void> {
    await db.delete(invitations).where(eq(invitations.memberId, memberId));
  }

  async createPasswordReset(data: InsertPasswordReset): Promise<PasswordReset> {
    const [created] = await db.insert(passwordResets).values(data).returning();
    return created;
  }

  async getPasswordResetByTokenHash(tokenHash: string): Promise<PasswordReset | undefined> {
    const [row] = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, tokenHash)).limit(1);
    return row;
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, id));
  }

  async deletePasswordResetsForMember(memberId: string): Promise<void> {
    await db.delete(passwordResets).where(eq(passwordResets.memberId, memberId));
  }

  async createEmailVerification(data: InsertEmailVerification): Promise<EmailVerification> {
    const [created] = await db.insert(emailVerifications).values(data).returning();
    return created;
  }

  async getEmailVerificationByTokenHash(tokenHash: string): Promise<EmailVerification | undefined> {
    const [row] = await db.select().from(emailVerifications).where(eq(emailVerifications.tokenHash, tokenHash)).limit(1);
    return row;
  }

  async markEmailVerificationUsed(id: string): Promise<void> {
    await db.update(emailVerifications).set({ usedAt: new Date() }).where(eq(emailVerifications.id, id));
  }

  async deleteEmailVerificationsForMember(memberId: string): Promise<void> {
    await db.delete(emailVerifications).where(eq(emailVerifications.memberId, memberId));
  }

  async markOrganizationVerified(id: string): Promise<void> {
    await db.update(users).set({ verifiedAt: new Date(), approvalStatus: "approved" }).where(eq(users.id, id));
  }

  async rejectOrganization(id: string): Promise<void> {
    await db.update(users).set({ approvalStatus: "denied" }).where(eq(users.id, id));
  }

  async deleteOrganizationAndMembers(orgId: string): Promise<void> {
    // Clean up in dependency order: verifications → members → org.
    const orgMembers = await db.select({ id: members.id }).from(members).where(eq(members.organizationId, orgId));
    for (const m of orgMembers) {
      await db.delete(emailVerifications).where(eq(emailVerifications.memberId, m.id));
    }
    await db.delete(members).where(eq(members.organizationId, orgId));
    await db.delete(users).where(eq(users.id, orgId));
  }

  async createBusinessSignup(data: { org: InsertUser; admin: Omit<InsertMember, "organizationId"> & { passwordHash?: string | null; emailVerifiedAt?: Date | null } }): Promise<{ org: User; member: Member }> {
    return await db.transaction(async (tx) => {
      const [org] = await tx.insert(users).values(data.org).returning();
      const { passwordHash, ...adminRest } = data.admin;
      const [member] = await tx.insert(members).values({
        ...adminRest,
        organizationId: org.id,
        ...(passwordHash ? { passwordHash } : {}),
      }).returning();
      return { org, member };
    });
  }

  // Invite-only onboarding: the platform admin creates a pending organization +
  // its first admin member (no password yet). The admin claims the account via
  // an emailed invite link, which sets the password and verifies the org.
  async createBusinessWithAdmin(data: { org: InsertUser; admin: Omit<InsertMember, "organizationId"> }): Promise<{ org: User; member: Member }> {
    return await db.transaction(async (tx) => {
      const [org] = await tx.insert(users).values(data.org).returning();
      const [member] = await tx.insert(members).values({
        ...data.admin,
        organizationId: org.id,
      }).returning();
      return { org, member };
    });
  }

  async getOauthAccount(provider: OauthProvider, providerUserId: string): Promise<OauthAccount | undefined> {
    const [row] = await db.select().from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, providerUserId)))
      .limit(1);
    return row;
  }

  async getOauthAccountsForMember(memberId: string): Promise<OauthAccount[]> {
    return db.select().from(oauthAccounts).where(eq(oauthAccounts.memberId, memberId));
  }

  async createOauthAccount(data: InsertOauthAccount): Promise<OauthAccount> {
    const [created] = await db.insert(oauthAccounts).values(data).returning();
    return created;
  }

  async getVertreterAssignments(supplierId: string): Promise<VertreterAssignment[]> {
    return db.select().from(vertreterAssignments).where(eq(vertreterAssignments.supplierId, supplierId));
  }

  async getVertreterAssignmentsForMember(memberId: string): Promise<VertreterAssignment[]> {
    return db.select().from(vertreterAssignments).where(eq(vertreterAssignments.memberId, memberId));
  }

  async createVertreterAssignment(data: InsertVertreterAssignment): Promise<VertreterAssignment> {
    // One Vertreter responsible per (supplier, restaurant): replace any existing.
    await db.delete(vertreterAssignments).where(and(
      eq(vertreterAssignments.supplierId, data.supplierId),
      eq(vertreterAssignments.restaurantId, data.restaurantId),
    ));
    const [created] = await db.insert(vertreterAssignments).values(data).returning();
    return created;
  }

  async deleteVertreterAssignment(supplierId: string, restaurantId: string): Promise<void> {
    await db.delete(vertreterAssignments).where(and(
      eq(vertreterAssignments.supplierId, supplierId),
      eq(vertreterAssignments.restaurantId, restaurantId),
    ));
  }

  async getResponsibleVertreter(supplierId: string, restaurantId: string): Promise<Member | undefined> {
    const [row] = await db
      .select({ member: members })
      .from(vertreterAssignments)
      .innerJoin(members, eq(vertreterAssignments.memberId, members.id))
      .where(and(
        eq(vertreterAssignments.supplierId, supplierId),
        eq(vertreterAssignments.restaurantId, restaurantId),
      ))
      .limit(1);
    return row?.member;
  }

  async backfillMembers(): Promise<number> {
    const allUsers = await db.select().from(users);
    const existing = await db.select({ organizationId: members.organizationId }).from(members);
    const orgsWithMembers = new Set(existing.map(e => e.organizationId));
    let created = 0;
    for (const u of allUsers) {
      if (orgsWithMembers.has(u.id)) continue;
      await db.insert(members).values({
        organizationId: u.id,
        name: u.name,
        email: u.email,
        profileImageUrl: u.profileImageUrl,
        role: "admin",
      });
      created++;
    }

    // Backfill historical attribution: legacy rows have a *MemberId of NULL.
    // Map each row to the earliest admin member of the org identified by its
    // legacy user-id column. Idempotent — only touches rows still NULL.
    await db.execute(sql`
      UPDATE ${orders} o SET created_by_member_id = (
        SELECT m.id FROM ${members} m
        WHERE m.organization_id = o.created_by_user_id AND m.role = 'admin'
        ORDER BY m.created_at ASC, m.id ASC LIMIT 1
      )
      WHERE o.created_by_member_id IS NULL AND o.created_by_user_id IS NOT NULL
    `);
    await db.execute(sql`
      UPDATE ${messages} ms SET sender_member_id = (
        SELECT m.id FROM ${members} m
        WHERE m.organization_id = ms.sender_id AND m.role = 'admin'
        ORDER BY m.created_at ASC, m.id ASC LIMIT 1
      )
      WHERE ms.sender_member_id IS NULL AND ms.sender_id IS NOT NULL
    `);
    await db.execute(sql`
      UPDATE ${orderStatusHistory} h SET changed_by_member_id = (
        SELECT m.id FROM ${members} m
        WHERE m.organization_id = h.changed_by AND m.role = 'admin'
        ORDER BY m.created_at ASC, m.id ASC LIMIT 1
      )
      WHERE h.changed_by_member_id IS NULL AND h.changed_by IS NOT NULL
    `);
    await db.execute(sql`
      UPDATE ${complaintStatusHistory} h SET changed_by_member_id = (
        SELECT m.id FROM ${members} m
        WHERE m.organization_id = h.changed_by AND m.role = 'admin'
        ORDER BY m.created_at ASC, m.id ASC LIMIT 1
      )
      WHERE h.changed_by_member_id IS NULL AND h.changed_by IS NOT NULL
    `);

    return created;
  }

  // Schema + data migration for the email-verification / self-signup feature.
  // DDL is idempotent and runs on every boot (guarantees the column/table exist
  // in every environment). The data backfill runs exactly ONCE (rollout) and is
  // tracked in app_migrations so restarts never re-verify pending accounts.
  async runEmailVerificationMigration(): Promise<void> {
    // --- Idempotent DDL — safe to run on every boot. ---
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at timestamp`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id varchar(36) NOT NULL REFERENCES members(id),
        token_hash text NOT NULL,
        expires_at timestamp NOT NULL,
        used_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_verifications_token_hash ON email_verifications (token_hash)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_email_verifications_member_id ON email_verifications (member_id)`);

    // --- ONE-TIME data backfill of pre-feature (legacy) rows. ---
    // This MUST run exactly once during rollout, never on subsequent boots:
    // re-running it would auto-verify still-pending self-signups and silently
    // bypass the login email-verification gate. A flag table records that the
    // rollout backfill already happened. (drizzle push may create the column
    // before the server boots, so column-existence is NOT a reliable signal —
    // hence an explicit applied-migrations marker.)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS app_migrations (
        name text PRIMARY KEY,
        applied_at timestamp NOT NULL DEFAULT now()
      )
    `);
    const MIGRATION = "email_verification_backfill_v1";
    const applied = await db.execute(sql`SELECT 1 FROM app_migrations WHERE name = ${MIGRATION}`);
    if ((applied.rows || []).length > 0) return;

    // Existing/legacy organizations are treated as already-activated so they
    // stay visible in public directory listings (getUsersByRole filters on
    // verifiedAt). Only self-signed-up businesses await email confirmation.
    await db.update(users).set({ verifiedAt: new Date() }).where(isNull(users.verifiedAt));

    // Existing password members are treated as already email-verified so the new
    // login gate never locks them out. Only self-signup owners created after
    // this point (password set, email not yet confirmed) stay gated.
    await db
      .update(members)
      .set({ emailVerifiedAt: new Date() })
      .where(and(isNotNull(members.passwordHash), isNull(members.emailVerifiedAt)));

    await db.execute(sql`INSERT INTO app_migrations (name) VALUES (${MIGRATION}) ON CONFLICT DO NOTHING`);
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

  async setOrderTemplateFavorite(id: string, isFavorite: boolean): Promise<OrderTemplate | undefined> {
    const [template] = await db.select().from(orderTemplates).where(eq(orderTemplates.id, id));
    if (!template) return undefined;
    if (isFavorite && !template.isFavorite) {
      const favorites = await db.select().from(orderTemplates)
        .where(and(eq(orderTemplates.restaurantId, template.restaurantId), eq(orderTemplates.isFavorite, true)));
      if (favorites.length >= 3) {
        throw new Error("MAX_FAVORITES");
      }
    }
    const [updated] = await db.update(orderTemplates)
      .set({ isFavorite })
      .where(eq(orderTemplates.id, id))
      .returning();
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
    const DEMO_VERSION = "demo-v12";
    const sentinelEmail = `${DEMO_VERSION}@gastroconnect.dev`;
    const existing = await db.select().from(users).where(eq(users.email, sentinelEmail));
    if (existing.length > 0) {
      console.log(`Demo data ${DEMO_VERSION} already present, skipping seed.`);
      return;
    }

    console.log(`Wiping existing data and seeding ${DEMO_VERSION}...`);
    // Wipe in FK-safe reverse order
    await db.delete(vertreterAssignments);
    await db.delete(supplierRatings);
    await db.delete(priceChangeLog);
    await db.delete(monthlyReports);
    await db.delete(aiChatMessages);
    await db.delete(aiChats);
    await db.delete(whatsappConnectionRequests);
    await db.delete(whatsappConnections);
    await db.delete(supplierErpCredentials);
    await db.delete(erpConnectionRequests);
    await db.delete(supplierErpConnections);
    await db.delete(guestCountImports);
    await db.delete(pmsConnectionRequests);
    await db.delete(hotelPmsConnections);
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
    await db.delete(emailVerifications);
    await db.delete(members);
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

    // ===== TEAM MEMBERS (people inside each organization) =====
    // Each org gets an Admin member representing the owner, plus extra teammates.
    const mkMember = (organizationId: string, name: string, email: string, role: "admin" | "manager" | "staff" | "vertreter", img: number) =>
      this.createMember({ organizationId, name, email, role, profileImageUrl: avatar(img) });

    // Restaurant 1 (Biergarten München) — owner + manager + staff
    await mkMember(restaurant1.id, "Thomas Weber", "thomas@biergarten-muenchen.de", "admin", 12);
    await mkMember(restaurant1.id, "Lena Hofer", "lena@biergarten-muenchen.de", "manager", 32);
    await mkMember(restaurant1.id, "Jonas Berger", "jonas@biergarten-muenchen.de", "staff", 15);

    // Restaurant 2 (Pizzeria Bella) — owner (admin) + chef who orders (manager) + staff
    await mkMember(restaurant2.id, "Maria Schmidt", "maria@pizzeria-bella.de", "admin", 45);
    await mkMember(restaurant2.id, "Giulia Ricci", "giulia@pizzeria-bella.de", "manager", 38);
    await mkMember(restaurant2.id, "Paolo Conti", "paolo@pizzeria-bella.de", "staff", 51);

    // Restaurant 3 (Gasthof Alpenblick) — owner (admin) + chef who orders (manager) + staff
    await mkMember(restaurant3.id, "Klaus Fischer", "klaus@gasthof-alpenblick.de", "admin", 53);
    await mkMember(restaurant3.id, "Sepp Huber", "sepp@gasthof-alpenblick.de", "manager", 27);
    await mkMember(restaurant3.id, "Anita Gruber", "anita@gasthof-alpenblick.de", "staff", 19);

    // Restaurant 4 (Trattoria Roma) — owner (admin) + chef who orders (manager) + staff
    await mkMember(restaurant4.id, "Marco Bianchi", "marco@trattoria-roma.de", "admin", 33);
    await mkMember(restaurant4.id, "Giovanni Russo", "giovanni@trattoria-roma.de", "manager", 41);
    await mkMember(restaurant4.id, "Elena Costa", "elena@trattoria-roma.de", "staff", 9);

    // Restaurant 5 (Bistro Paris) — owner (admin) + chef who orders (manager) + staff
    await mkMember(restaurant5.id, "Sophie Laurent", "sophie@bistro-paris.de", "admin", 47);
    await mkMember(restaurant5.id, "Pierre Dubois", "pierre@bistro-paris.de", "manager", 22);
    await mkMember(restaurant5.id, "Camille Moreau", "camille@bistro-paris.de", "staff", 35);

    // Supplier 1 (Frische Produkte) — owner + manager + two Vertreter (field reps)
    await mkMember(supplier1.id, "Hans Müller", "hans@frische-produkte.de", "admin", 13);
    await mkMember(supplier1.id, "Sabine Vogel", "sabine@frische-produkte.de", "manager", 24);
    const s1_vertreter1 = await mkMember(supplier1.id, "Markus Wolf", "markus@frische-produkte.de", "vertreter", 56);
    const s1_vertreter2 = await mkMember(supplier1.id, "Nadia Köhler", "nadia@frische-produkte.de", "vertreter", 26);

    // Supplier 2 (Metzgerei Bauer) — owner + one Vertreter
    await mkMember(supplier2.id, "Anna Bauer", "anna@metzgerei-bauer.de", "admin", 20);
    const s2_vertreter1 = await mkMember(supplier2.id, "Tobias Frank", "tobias@metzgerei-bauer.de", "vertreter", 59);

    // Supplier 3 (Getränke Klein) — owner + manager + Vertreter
    await mkMember(supplier3.id, "Peter Klein", "peter@getraenke-klein.de", "admin", 60);
    await mkMember(supplier3.id, "Claudia Mayer", "claudia@getraenke-klein.de", "manager", 49);
    const s3_vertreter1 = await mkMember(supplier3.id, "Stefan Huber", "stefan@getraenke-klein.de", "vertreter", 58);

    // Supplier 4 (Italia Import) — owner + Vertreter
    await mkMember(supplier4.id, "Julia Romano", "julia@italia-import.de", "admin", 44);
    const s4_vertreter1 = await mkMember(supplier4.id, "Luca Ferrari", "luca@italia-import.de", "vertreter", 68);

    // Supplier 5 (Nordsee Fisch) — owner + Vertreter
    await mkMember(supplier5.id, "Erik Andersen", "erik@nordsee-fisch.de", "admin", 11);
    const s5_vertreter1 = await mkMember(supplier5.id, "Lars Petersen", "lars@nordsee-fisch.de", "vertreter", 50);

    // ===== VERTRETER ASSIGNMENTS (which field rep handles which restaurant) =====
    // Each supplier has at least one Vertreter; the unique (supplier, restaurant)
    // constraint means exactly one rep per restaurant per supplier.
    // Supplier 1 — two reps split the restaurants
    await this.createVertreterAssignment({ memberId: s1_vertreter1.id, supplierId: supplier1.id, restaurantId: restaurant1.id });
    await this.createVertreterAssignment({ memberId: s1_vertreter1.id, supplierId: supplier1.id, restaurantId: restaurant3.id });
    await this.createVertreterAssignment({ memberId: s1_vertreter1.id, supplierId: supplier1.id, restaurantId: restaurant4.id });
    await this.createVertreterAssignment({ memberId: s1_vertreter2.id, supplierId: supplier1.id, restaurantId: restaurant2.id });
    await this.createVertreterAssignment({ memberId: s1_vertreter2.id, supplierId: supplier1.id, restaurantId: restaurant5.id });
    // Supplier 2 — one rep covers all restaurants
    for (const r of [restaurant1, restaurant2, restaurant3, restaurant4, restaurant5]) {
      await this.createVertreterAssignment({ memberId: s2_vertreter1.id, supplierId: supplier2.id, restaurantId: r.id });
    }
    // Supplier 3
    for (const r of [restaurant1, restaurant2, restaurant3, restaurant4, restaurant5]) {
      await this.createVertreterAssignment({ memberId: s3_vertreter1.id, supplierId: supplier3.id, restaurantId: r.id });
    }
    // Supplier 4
    for (const r of [restaurant1, restaurant2, restaurant3, restaurant4, restaurant5]) {
      await this.createVertreterAssignment({ memberId: s4_vertreter1.id, supplierId: supplier4.id, restaurantId: r.id });
    }
    // Supplier 5
    for (const r of [restaurant1, restaurant2, restaurant3, restaurant4, restaurant5]) {
      await this.createVertreterAssignment({ memberId: s5_vertreter1.id, supplierId: supplier5.id, restaurantId: r.id });
    }

    // ===== PRODUCTS =====
    // Supplier 1 (Frische Produkte) — local images for the originals
    const p_tomaten = await this.createProduct({ supplierId: supplier1.id, name: "Bio Tomaten", description: "Frische Bio-Tomaten aus regionalem Anbau", ingredients: "100% Bio-Tomaten aus kontrolliert biologischem Anbau", allergens: [], nutrition: { energyKcal: 18, fat: 0.2, saturatedFat: 0, carbs: 3.9, sugar: 2.6, protein: 0.9, salt: 0.01 }, price: "3.99", unit: "kg", category: "Gemüse", inStock: true, stockQuantity: 100, lowStockThreshold: 20, imageUrl: "/images/products/bio-tomaten.png" });
    const p_salat = await this.createProduct({ supplierId: supplier1.id, name: "Eisbergsalat", description: "Knackiger Eisbergsalat", ingredients: "Eisbergsalat", allergens: [], nutrition: { energyKcal: 13, fat: 0.2, saturatedFat: 0, carbs: 2, sugar: 1.5, protein: 0.9, salt: 0.01 }, price: "1.49", unit: "Stück", category: "Gemüse", inStock: true, stockQuantity: 50, lowStockThreshold: 10, imageUrl: "/images/products/eisbergsalat.png" });
    const p_karotten = await this.createProduct({ supplierId: supplier1.id, name: "Karotten", description: "Frische Karotten im Bund", ingredients: "Karotten", allergens: [], nutrition: { energyKcal: 41, fat: 0.2, saturatedFat: 0, carbs: 7, sugar: 4.7, protein: 0.9, salt: 0.07 }, price: "2.29", unit: "kg", category: "Gemüse", inStock: true, stockQuantity: 80, lowStockThreshold: 15, imageUrl: "/images/products/karotten.png" });
    const p_aepfel = await this.createProduct({ supplierId: supplier1.id, name: "Bio Äpfel", description: "Knackige Bio-Äpfel, Sorte Elstar", ingredients: "Bio-Äpfel, Sorte Elstar", allergens: [], nutrition: { energyKcal: 52, fat: 0.2, saturatedFat: 0, carbs: 14, sugar: 10, protein: 0.3, salt: 0 }, price: "4.49", unit: "kg", category: "Obst", inStock: true, stockQuantity: 60, lowStockThreshold: 12, imageUrl: "/images/products/bio-aepfel.png" });
    const p_zitronen = await this.createProduct({ supplierId: supplier1.id, name: "Zitronen", description: "Frische Zitronen aus Sizilien", ingredients: "Zitronen (unbehandelte Schale)", allergens: [], nutrition: { energyKcal: 29, fat: 0.3, saturatedFat: 0, carbs: 9.3, sugar: 2.5, protein: 1.1, salt: 0 }, price: "3.29", unit: "kg", category: "Obst", inStock: true, stockQuantity: 40, lowStockThreshold: 8, imageUrl: "/images/products/zitronen.png" });
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
    const p_bratwurst = await this.createProduct({ supplierId: supplier2.id, name: "Bratwurst", description: "Original Nürnberger Bratwurst", ingredients: "Schweinefleisch (95%), Speck, Salz, Gewürze (u.a. Majoran), Muskat", allergens: [], nutrition: { energyKcal: 290, fat: 25, saturatedFat: 9.5, carbs: 1, sugar: 0.5, protein: 15, salt: 1.8 }, price: "8.99", unit: "kg", category: "Fleisch", inStock: true, stockQuantity: 50, lowStockThreshold: 15, imageUrl: "/images/products/bratwurst.png" });
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
    const p_pasta = await this.createProduct({ supplierId: supplier4.id, name: "Spaghetti N°5", description: "Bronze gezogene Spaghetti, 12x500g", ingredients: "Hartweizengrieß (Gluten), Wasser", allergens: ["Gluten"], nutrition: { energyKcal: 358, fat: 1.5, saturatedFat: 0.3, carbs: 71, sugar: 3.5, protein: 13, salt: 0.01 }, price: "23.40", unit: "Karton", category: "Pasta", inStock: true, stockQuantity: 80, lowStockThreshold: 20, imageUrl: "/images/products/spaghetti.png" });
    const p_mozzarella = await this.createProduct({ supplierId: supplier4.id, name: "Mozzarella di Bufala", description: "Büffelmozzarella DOP, 125g Beutel", ingredients: "Büffelmilch (Milch), Salz, Lab, Milchsäurekulturen", allergens: ["Milch"], nutrition: { energyKcal: 288, fat: 24, saturatedFat: 16, carbs: 0.4, sugar: 0.4, protein: 17, salt: 0.5 }, price: "3.50", unit: "Stück", category: "Käse", inStock: true, stockQuantity: 120, lowStockThreshold: 30, imageUrl: "/images/products/mozzarella.png" });
    const p_parmesan = await this.createProduct({ supplierId: supplier4.id, name: "Parmigiano Reggiano", description: "24 Monate gereift, am Stück", ingredients: "Milch, Salz, Lab", allergens: ["Milch"], nutrition: { energyKcal: 392, fat: 29, saturatedFat: 19, carbs: 0, sugar: 0, protein: 33, salt: 1.6 }, price: "32.90", unit: "kg", category: "Käse", inStock: true, stockQuantity: 28, lowStockThreshold: 8, imageUrl: "/images/products/parmigiano.png" });
    await this.createProduct({ supplierId: supplier4.id, name: "Prosciutto di Parma", description: "Parmaschinken DOP 18 Monate, am Stück", price: "39.90", unit: "kg", category: "Wurst", inStock: true, stockQuantity: 16, lowStockThreshold: 5, imageUrl: "/images/products/prosciutto.png" });
    await this.createProduct({ supplierId: supplier4.id, name: "Tomaten passata", description: "San Marzano Tomaten, 12x680g", price: "27.60", unit: "Karton", category: "Konserven", inStock: true, stockQuantity: 95, lowStockThreshold: 20, imageUrl: "/images/products/tomaten-passata.png" });
    await this.createProduct({ supplierId: supplier4.id, name: "Pesto Genovese", description: "Original Pesto, 200g Glas", price: "5.90", unit: "Glas", category: "Saucen", inStock: true, stockQuantity: 60, lowStockThreshold: 15, imageUrl: "/images/products/pesto.png" });
    await this.createProduct({ supplierId: supplier4.id, name: "Balsamico Tradizionale", description: "12 Jahre gereift, 250ml", price: "29.90", unit: "Flasche", category: "Öl & Essig", inStock: true, stockQuantity: 35, lowStockThreshold: 10, imageUrl: "/images/products/balsamico.png" });

    // Supplier 5 (Nordsee Fisch)
    const p_lachs = await this.createProduct({ supplierId: supplier5.id, name: "Lachsfilet", description: "Norwegischer Lachs, Aquakultur, ohne Haut", ingredients: "Lachs (Fisch)", allergens: ["Fisch"], nutrition: { energyKcal: 208, fat: 13, saturatedFat: 3.1, carbs: 0, sugar: 0, protein: 20, salt: 0.2 }, price: "24.90", unit: "kg", category: "Fisch", inStock: true, stockQuantity: 22, lowStockThreshold: 6, imageUrl: "/images/products/lachsfilet.png" });
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
    const o7 = await createOrderWithDate({ restaurantId: restaurant1.id, supplierId: supplier2.id, status: "confirmed", totalAmount: sumOf(o7items), requestedDeliveryDate: futureDate(1) }, o7items, 0);

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

    // --- MASSIVE EXPANSION (demo-v4) ---
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
      { status: "confirmed", weight: 2, daysAgoMin: 0, daysAgoMax: 2, futureDays: 1 },
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
            const confirmedQty = chosen.status === "confirmed" ? Math.max(1, qty - randInt(1, 3)) : null;
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

    // --- PIRI'S JAGDHOF — vollständiger Test-Betrieb ---
    const piri = await this.createUser({
      role: "restaurant", name: "Pirmin Hofer", email: "piri@jagdhof.de",
      phone: "+49 8022 887766", companyName: "Piri's Jagdhof",
      address: "Wildbachweg 7", city: "Tegernsee", postalCode: "83684",
      description: "Traditioneller Jagdhof mit Wildküche, Hotel mit 28 Zimmern und Restaurant für 90 Gäste",
      profileImageUrl: avatar(67),
    });

    // Team for Piri's Jagdhof — owner (admin) + chef who orders (manager) + staff
    await mkMember(piri.id, "Pirmin Hofer", "piri@jagdhof.de", "admin", 67);
    await mkMember(piri.id, "Florian Wimmer", "florian@jagdhof.de", "manager", 30);
    await mkMember(piri.id, "Theresa Brandl", "theresa@jagdhof.de", "staff", 8);

    const piriSuppliers = [supplier1, supplier2, supplier3, supplier4, supplier5];

    // ----- Vertreter-Zuordnungen für Piri's Jagdhof (ein Rep je Lieferant) -----
    await this.createVertreterAssignment({ memberId: s1_vertreter1.id, supplierId: supplier1.id, restaurantId: piri.id });
    await this.createVertreterAssignment({ memberId: s2_vertreter1.id, supplierId: supplier2.id, restaurantId: piri.id });
    await this.createVertreterAssignment({ memberId: s3_vertreter1.id, supplierId: supplier3.id, restaurantId: piri.id });
    await this.createVertreterAssignment({ memberId: s4_vertreter1.id, supplierId: supplier4.id, restaurantId: piri.id });
    await this.createVertreterAssignment({ memberId: s5_vertreter1.id, supplierId: supplier5.id, restaurantId: piri.id });

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
    piriOrderSpecs.push({ supplier: supplier4, daysAgo: 1, status: "confirmed", items: 4, futureDays: 1, notes: "Trüffelöl evtl. nicht verfügbar" });
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
        const confirmedQty = spec.status === "confirmed" ? Math.max(1, qty - prandInt(1, 3)) : null;
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

    // --- RATINGS & DOCUMENTS (across all delivered orders) ---
    const orderNum = (o: any) => o.orderNumber && o.orderNumber.length > 0 ? o.orderNumber : "B-" + o.id.slice(0, 6).toUpperCase();
    const ratingPool = [...generatedOrders.filter(o => o.status === "delivered"), ...piriDeliveredOrders];

    // ----- Lieferantenbewertungen -----
    const ratingComments: Array<string | null> = [
      "Top Qualität, pünktliche Lieferung — sehr empfehlenswert!",
      "Alles frisch und vollständig. Gerne wieder.",
      "Gute Ware, freundlicher Fahrer.",
      "Lieferung war etwas spät, Qualität aber einwandfrei.",
      "Sehr zuverlässig und faire Preise.",
      "Kleinere Abweichung bei der Menge, sonst alles bestens.",
      "Hervorragende Frische, immer eine Freude.",
      "Schnelle Abwicklung, kompetenter Vertreter.",
      null, null,
    ];
    const ratingRows: any[] = [];
    const ratedOrderIds = new Set<string>();
    const sampledForRatings = [...ratingPool].sort(() => rand() - 0.5).slice(0, 60);
    for (const o of sampledForRatings) {
      if (ratedOrderIds.has(o.id)) continue;
      ratedOrderIds.add(o.id);
      const stars = rand() > 0.22 ? randInt(4, 5) : randInt(2, 3);
      ratingRows.push({
        orderId: o.id, restaurantId: o.restaurantId, supplierId: o.supplierId,
        stars, comment: pick(ratingComments),
      });
    }
    if (ratingRows.length) {
      for (let i = 0; i < ratingRows.length; i += 200) {
        await db.insert(supplierRatings).values(ratingRows.slice(i, i + 200));
      }
    }

    // ----- Dokumente: Lieferscheine für gelieferte Bestellungen -----
    // fileUrl zeigt auf einen virtuellen Objektpfad; der Download-Endpoint
    // erzeugt das PDF bei fehlendem Objekt zur Laufzeit neu (siehe routes.ts).
    const docRows: any[] = [];
    const docOrderIds = new Set<string>();
    const sampledForDocs = [...ratingPool].sort(() => rand() - 0.5).slice(0, 70);
    for (const o of sampledForDocs) {
      if (docOrderIds.has(o.id)) continue;
      docOrderIds.add(o.id);
      docRows.push({
        orderId: o.id, restaurantId: o.restaurantId, supplierId: o.supplierId,
        type: "delivery_note" as any,
        title: `Lieferschein ${orderNum(o)}`,
        fileUrl: `/objects/documents/seed-${o.id}.pdf`,
      });
    }
    if (docRows.length) {
      for (let i = 0; i < docRows.length; i += 200) {
        await db.insert(documents).values(docRows.slice(i, i + 200));
      }
    }
    console.log(`Ratings: ${ratingRows.length}, Documents: ${docRows.length} seeded.`);

    console.log(`Demo data ${DEMO_VERSION} seeded successfully!`);
  }

  // Notifications
  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notification;
  }

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
    const [created] = await db.insert(notifications).values(notification)
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    if (notification.referenceId) {
      const [existing] = await db.select().from(notifications)
        .where(and(
          eq(notifications.userId, notification.userId),
          eq(notifications.type, notification.type),
          eq(notifications.referenceId, notification.referenceId),
        ))
        .limit(1);
      if (existing) return existing;
    }
    throw new Error("Notification could not be created");
  }

  async createNotificationOnce(
    notification: InsertNotification & { referenceId: string; deliveryDedupKey: string },
  ): Promise<{ notification: Notification; created: boolean }> {
    const [created] = await db.insert(notifications).values(notification)
      .onConflictDoNothing()
      .returning();
    if (created) return { notification: created, created: true };

    const [existing] = await db.select().from(notifications)
      .where(and(
        eq(notifications.userId, notification.userId),
        eq(notifications.referenceId, notification.referenceId),
        eq(notifications.deliveryDedupKey, notification.deliveryDedupKey),
      ))
      .limit(1);
    if (existing) return { notification: existing, created: false };
    throw new Error("Idempotent notification could not be created");
  }

  async createNewOrderNotificationOnce(notification: InsertNotification): Promise<{ notification: Notification; created: boolean }> {
    const checkoutNotification = { ...notification, deliveryDedupKey: "checkout_v1" };
    const [created] = await db.insert(notifications).values(checkoutNotification)
      .onConflictDoNothing()
      .returning();
    if (created) return { notification: created, created: true };
    const [existing] = await db.select().from(notifications)
      .where(and(
        eq(notifications.userId, notification.userId),
        eq(notifications.type, "new_order"),
        eq(notifications.referenceId, notification.referenceId!),
        eq(notifications.deliveryDedupKey, "checkout_v1"),
      ))
      .limit(1);
    if (existing) return { notification: existing, created: false };
    throw new Error("New order notification could not be created");
  }

  async enqueueOrderNotificationRetry(retry: InsertOrderNotificationRetry): Promise<OrderNotificationRetry> {
    const [created] = await db.insert(orderNotificationRetries)
      .values(retry)
      .onConflictDoUpdate({
        target: [orderNotificationRetries.orderId, orderNotificationRetries.supplierId],
        set: { completedAt: null, failedAt: null, nextAttemptAt: new Date(), lastError: null, leaseToken: null },
      })
      .returning();
    return created;
  }

  async getPendingOrderNotificationRetries(limit = 25): Promise<OrderNotificationRetry[]> {
    return db.select().from(orderNotificationRetries)
      .where(and(
        isNull(orderNotificationRetries.completedAt),
        isNull(orderNotificationRetries.failedAt),
        lte(orderNotificationRetries.nextAttemptAt, new Date()),
      ))
      .orderBy(orderNotificationRetries.createdAt)
      .limit(limit);
  }

  async claimOrderNotificationRetry(orderId: string, supplierId: string): Promise<string | undefined> {
    const leaseUntil = new Date(Date.now() + 5 * 60 * 1000);
    const leaseToken = randomUUID();
    const [claimed] = await db.update(orderNotificationRetries)
      .set({ nextAttemptAt: leaseUntil, leaseToken })
      .where(and(
        eq(orderNotificationRetries.orderId, orderId),
        eq(orderNotificationRetries.supplierId, supplierId),
        isNull(orderNotificationRetries.completedAt),
        isNull(orderNotificationRetries.failedAt),
        lte(orderNotificationRetries.nextAttemptAt, new Date()),
      ))
      .returning({ id: orderNotificationRetries.id });
    return claimed ? leaseToken : undefined;
  }

  async markOrderNotificationRetryCompleted(id: string, leaseToken: string): Promise<void> {
    await db.update(orderNotificationRetries)
      .set({ completedAt: new Date(), failedAt: null, lastError: null, leaseToken: null })
      .where(and(eq(orderNotificationRetries.id, id), eq(orderNotificationRetries.leaseToken, leaseToken)));
  }

  async markOrderNotificationRetryCompletedForOrder(orderId: string, supplierId: string, leaseToken: string): Promise<void> {
    await db.update(orderNotificationRetries)
      .set({ completedAt: new Date(), failedAt: null, lastError: null, leaseToken: null })
      .where(and(eq(orderNotificationRetries.orderId, orderId), eq(orderNotificationRetries.supplierId, supplierId), eq(orderNotificationRetries.leaseToken, leaseToken)));
  }

  async markOrderNotificationRetryFailed(id: string, leaseToken: string, error: string): Promise<void> {
    const [updated] = await db.update(orderNotificationRetries)
      .set({
        attempts: sql`${orderNotificationRetries.attempts} + 1`,
        nextAttemptAt: sql`CASE WHEN ${orderNotificationRetries.attempts} + 1 >= 10 THEN now() ELSE now() + LEAST((2 ^ LEAST(${orderNotificationRetries.attempts} + 1, 6)) * interval '30 seconds', interval '30 minutes') END`,
        lastError: error.slice(0, 1000),
        failedAt: sql`CASE WHEN ${orderNotificationRetries.attempts} + 1 >= 10 THEN now() ELSE NULL END`,
        leaseToken: null,
      })
      .where(and(eq(orderNotificationRetries.id, id), eq(orderNotificationRetries.leaseToken, leaseToken)))
      .returning({ orderId: orderNotificationRetries.orderId, attempts: orderNotificationRetries.attempts, failedAt: orderNotificationRetries.failedAt });
    if (updated?.failedAt) {
      console.error(`[order-notify] terminal delivery failure for order ${updated.orderId} after ${updated.attempts} attempts`);
    }
  }

  async markOrderNotificationRetryFailedForOrder(orderId: string, supplierId: string, leaseToken: string, error: string): Promise<void> {
    const [updated] = await db.update(orderNotificationRetries)
      .set({
        attempts: sql`${orderNotificationRetries.attempts} + 1`,
        nextAttemptAt: sql`CASE WHEN ${orderNotificationRetries.attempts} + 1 >= 10 THEN now() ELSE now() + LEAST((2 ^ LEAST(${orderNotificationRetries.attempts} + 1, 6)) * interval '30 seconds', interval '30 minutes') END`,
        lastError: error.slice(0, 1000),
        failedAt: sql`CASE WHEN ${orderNotificationRetries.attempts} + 1 >= 10 THEN now() ELSE NULL END`,
        leaseToken: null,
      })
      .where(and(
        eq(orderNotificationRetries.orderId, orderId),
        eq(orderNotificationRetries.supplierId, supplierId),
        eq(orderNotificationRetries.leaseToken, leaseToken),
      ))
      .returning({ orderId: orderNotificationRetries.orderId, attempts: orderNotificationRetries.attempts, failedAt: orderNotificationRetries.failedAt });
    if (updated?.failedAt) {
      console.error(`[order-notify] terminal delivery failure for order ${updated.orderId} after ${updated.attempts} attempts`);
    }
  }

  async enqueueDeliveryNotificationRetry(retry: InsertDeliveryNotificationRetry): Promise<DeliveryNotificationRetry> {
    const [created] = await db.insert(deliveryNotificationRetries)
      .values(retry)
      .onConflictDoUpdate({
        target: [deliveryNotificationRetries.orderId, deliveryNotificationRetries.eventKey],
        set: { payload: retry.payload, completedAt: null, failedAt: null, nextAttemptAt: new Date(), lastError: null, leaseToken: null },
      })
      .returning();
    return created;
  }

  async getPendingDeliveryNotificationRetries(limit = 25): Promise<DeliveryNotificationRetry[]> {
    return db.select().from(deliveryNotificationRetries)
      .where(and(isNull(deliveryNotificationRetries.completedAt), isNull(deliveryNotificationRetries.failedAt), lte(deliveryNotificationRetries.nextAttemptAt, new Date())))
      .orderBy(deliveryNotificationRetries.createdAt)
      .limit(limit);
  }

  async claimDeliveryNotificationRetry(id: string): Promise<string | undefined> {
    const leaseToken = randomUUID();
    const [claimed] = await db.update(deliveryNotificationRetries)
      .set({ nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000), leaseToken })
      .where(and(eq(deliveryNotificationRetries.id, id), isNull(deliveryNotificationRetries.completedAt), isNull(deliveryNotificationRetries.failedAt), lte(deliveryNotificationRetries.nextAttemptAt, new Date())))
      .returning({ id: deliveryNotificationRetries.id });
    return claimed ? leaseToken : undefined;
  }

  async markDeliveryNotificationRetryCompleted(id: string, leaseToken: string, payload: DeliveryNotificationRetry["payload"]): Promise<void> {
    await db.update(deliveryNotificationRetries)
      .set({ payload, completedAt: new Date(), failedAt: null, lastError: null, leaseToken: null })
      .where(and(eq(deliveryNotificationRetries.id, id), eq(deliveryNotificationRetries.leaseToken, leaseToken)));
  }

  async markDeliveryNotificationRetryFailed(id: string, leaseToken: string, error: string, payload?: DeliveryNotificationRetry["payload"]): Promise<void> {
    const [updated] = await db.update(deliveryNotificationRetries)
      .set({
        ...(payload ? { payload } : {}),
        attempts: sql`${deliveryNotificationRetries.attempts} + 1`,
        nextAttemptAt: sql`CASE WHEN ${deliveryNotificationRetries.attempts} + 1 >= 10 THEN now() ELSE now() + LEAST((2 ^ LEAST(${deliveryNotificationRetries.attempts} + 1, 6)) * interval '30 seconds', interval '30 minutes') END`,
        lastError: error.slice(0, 1000),
        failedAt: sql`CASE WHEN ${deliveryNotificationRetries.attempts} + 1 >= 10 THEN now() ELSE NULL END`,
        leaseToken: null,
      })
      .where(and(eq(deliveryNotificationRetries.id, id), eq(deliveryNotificationRetries.leaseToken, leaseToken)))
      .returning({ orderId: deliveryNotificationRetries.orderId, attempts: deliveryNotificationRetries.attempts, failedAt: deliveryNotificationRetries.failedAt });
    if (updated?.failedAt) console.error(`[delivery-notify] terminal failure for order ${updated.orderId} after ${updated.attempts} attempts`);
  }

  async hasOrderMessage(orderId: string): Promise<boolean> {
    const [row] = await db.select({ id: messages.id }).from(messages)
      .where(and(eq(messages.orderId, orderId), eq(messages.messageType, "order")))
      .limit(1);
    return !!row;
  }

  async hasNotification(userId: string, type: string, referenceId: string): Promise<boolean> {
    const [row] = await db.select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, type as any), eq(notifications.referenceId, referenceId)))
      .limit(1);
    return !!row;
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

  async getDocumentsByComplaint(complaintId: string): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.complaintId, complaintId)).orderBy(desc(documents.createdAt));
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

  // ─── Monthly reports (Task #45) ────────────────────────────────────────
  async getMonthlyReportsByRestaurant(restaurantId: string): Promise<MonthlyReport[]> {
    return db.select().from(monthlyReports)
      .where(eq(monthlyReports.restaurantId, restaurantId))
      .orderBy(desc(monthlyReports.month));
  }

  async getMonthlyReportByMonth(restaurantId: string, month: string): Promise<MonthlyReport | undefined> {
    const [row] = await db.select().from(monthlyReports)
      .where(and(eq(monthlyReports.restaurantId, restaurantId), eq(monthlyReports.month, month)));
    return row;
  }

  async getMonthlyReport(id: string): Promise<MonthlyReport | undefined> {
    const [row] = await db.select().from(monthlyReports).where(eq(monthlyReports.id, id));
    return row;
  }

  async upsertMonthlyReport(report: InsertMonthlyReport): Promise<MonthlyReport> {
    const existing = await this.getMonthlyReportByMonth(report.restaurantId, report.month);
    if (existing) {
      const [updated] = await db.update(monthlyReports)
        .set({
          fileUrl: report.fileUrl,
          totalSpent: report.totalSpent,
          prevMonthTotal: report.prevMonthTotal,
          savingsPotential: report.savingsPotential,
          payload: report.payload,
        })
        .where(eq(monthlyReports.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(monthlyReports).values(report).returning();
    return created;
  }

  async deleteMonthlyReport(id: string): Promise<void> {
    await db.delete(monthlyReports).where(eq(monthlyReports.id, id));
  }

  // Promotions
  async getPromotion(id: string): Promise<Promotion | undefined> {
    const [promo] = await db.select().from(promotions).where(eq(promotions.id, id));
    return promo;
  }

  async getPromotionsByGroup(groupId: string): Promise<Promotion[]> {
    return db.select().from(promotions).where(eq(promotions.groupId, groupId));
  }

  async getPromotionsBySupplier(supplierId: string): Promise<PromotionWithProduct[]> {
    const promos = await db.select().from(promotions)
      .where(eq(promotions.supplierId, supplierId))
      .orderBy(desc(promotions.createdAt));
    const result: PromotionWithProduct[] = [];
    for (const promo of promos) {
      const [product] = await db.select().from(products).where(eq(products.id, promo.productId));
      if (product) {
        result.push({ ...this.withRescueState(promo), product });
      }
    }
    return result;
  }

  private withRescueState(promo: Promotion): PromotionWithRescueState {
    const state = getRescuePromotionState(promo);
    return {
      ...promo,
      rescueAvailableQuantity: state.availableQuantity,
      rescueLifecycle: state.lifecycle,
    };
  }

  async getActivePromotionForProduct(productId: string, executor: any = db, restaurantId?: string): Promise<PromotionWithRescueState | undefined> {
    const conditions: any[] = [
      eq(promotions.productId, productId),
      eq(promotions.isActive, true),
      sql`${promotions.startDate} <= NOW()`,
      sql`${promotions.endDate} >= NOW()`,
      sql`(${promotions.promotionType} = 'generic' OR ${promotions.rescueReservedQuantity} + ${promotions.rescueSoldQuantity} < ${promotions.quantityCap})`,
    ];
    if (restaurantId) {
      conditions.push(sql`(${promotions.targetRestaurantIds} IS NULL OR cardinality(${promotions.targetRestaurantIds}) = 0 OR ${restaurantId} = ANY(${promotions.targetRestaurantIds}))`);
    }
    const [promo] = await executor.select().from(promotions)
      .where(and(
        ...conditions
      ))
      .orderBy(
        sql`CASE WHEN ${promotions.promotionType} = 'rescue' THEN 1 ELSE 0 END DESC`,
        desc(promotions.discountPercent),
      )
      .limit(1);
    return promo ? this.withRescueState(promo) : undefined;
  }

  async getActivePromotions(restaurantId?: string, executor: any = db): Promise<PromotionWithRescueState[]> {
    const conditions: any[] = [
      eq(promotions.isActive, true),
      sql`${promotions.startDate} <= NOW()`,
      sql`${promotions.endDate} >= NOW()`,
      sql`(${promotions.promotionType} = 'generic' OR ${promotions.rescueReservedQuantity} + ${promotions.rescueSoldQuantity} < ${promotions.quantityCap})`,
    ];
    if (restaurantId) {
      conditions.push(sql`(${promotions.targetRestaurantIds} IS NULL OR cardinality(${promotions.targetRestaurantIds}) = 0 OR ${restaurantId} = ANY(${promotions.targetRestaurantIds}))`);
    }
    const rows = await executor.select().from(promotions)
      .where(and(
        ...conditions
      ));
    return rows.map((promo: Promotion) => this.withRescueState(promo));
  }

  async createPromotion(promotion: InsertPromotion, executor: any = db): Promise<Promotion> {
    const [created] = await executor.insert(promotions).values(promotion).returning();
    return created;
  }

  async updatePromotion(id: string, data: Partial<InsertPromotion>, executor: any = db): Promise<Promotion | undefined> {
    const [updated] = await executor.update(promotions).set(data).where(eq(promotions.id, id)).returning();
    return updated;
  }

  async deletePromotion(id: string): Promise<void> {
    const [promo] = await db.select().from(promotions).where(eq(promotions.id, id));
    if (promo?.promotionType === "rescue") {
      await db.update(promotions).set({ isActive: false }).where(eq(promotions.id, id));
      return;
    }
    await db.delete(promotions).where(eq(promotions.id, id));
  }

  async deletePromotionsByGroup(groupId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(promotions).set({ isActive: false }).where(and(
        eq(promotions.groupId, groupId),
        eq(promotions.promotionType, "rescue"),
      ));
      await tx.delete(promotions).where(and(
        eq(promotions.groupId, groupId),
        eq(promotions.promotionType, "generic"),
      ));
    });
  }

  // Inventory Risk Records
  async getInventoryRiskRecordsBySupplier(
    supplierId: string,
    filters?: { status?: string; qualityStatus?: string; productId?: string },
  ): Promise<InventoryRiskRecordWithDetails[]> {
    const conditions = [eq(inventoryRiskRecords.supplierId, supplierId)];
    if (filters?.status) conditions.push(eq(inventoryRiskRecords.status, filters.status));
    if (filters?.qualityStatus) conditions.push(eq(inventoryRiskRecords.qualityStatus, filters.qualityStatus));
    if (filters?.productId) conditions.push(eq(inventoryRiskRecords.productId, filters.productId));
    const records = await db.select().from(inventoryRiskRecords)
      .where(and(...conditions))
      .orderBy(desc(inventoryRiskRecords.createdAt));
    return Promise.all(records.map((r) => this.hydrateInventoryRiskRecord(r)));
  }

  async getInventoryRiskRecord(id: string): Promise<InventoryRiskRecordWithDetails | undefined> {
    const [record] = await db.select().from(inventoryRiskRecords).where(eq(inventoryRiskRecords.id, id));
    if (!record) return undefined;
    return this.hydrateInventoryRiskRecord(record);
  }

  private async hydrateInventoryRiskRecord(record: InventoryRiskRecord): Promise<InventoryRiskRecordWithDetails> {
    const [product] = await db.select().from(products).where(eq(products.id, record.productId));
    // createdBy is a members.id (the reporting team member), not a users.id.
    const [creator] = await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.id, record.createdBy));
    let linkedPromotion: Promotion | null = null;
    if (record.linkedPromotionId) {
      const [promo] = await db.select().from(promotions).where(eq(promotions.id, record.linkedPromotionId));
      linkedPromotion = promo ?? null;
    }
    return { ...record, product, creator: creator ?? null, linkedPromotion };
  }

  async createInventoryRiskRecord(
    data: InsertInventoryRiskRecord & { supplierId: string; createdBy: string },
  ): Promise<InventoryRiskRecord> {
    const [created] = await db.insert(inventoryRiskRecords).values(data).returning();
    return created;
  }

  async updateInventoryRiskRecord(
    id: string,
    data: Partial<Omit<InventoryRiskRecord, "id" | "createdAt">>,
  ): Promise<InventoryRiskRecord | undefined> {
    const [updated] = await db.update(inventoryRiskRecords)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(inventoryRiskRecords.id, id))
      .returning();
    return updated;
  }

  async actionInventoryRiskRecord(
    recordId: string,
    supplierId: string,
    input: Pick<InsertPromotion, "discountPercent" | "startDate" | "endDate" | "isActive" | "name" | "description" | "groupId" | "targetRestaurantIds"> & { quantityCap: number },
  ): Promise<{ record: InventoryRiskRecord; promotion: Promotion }> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM ${inventoryRiskRecords} WHERE id = ${recordId} FOR UPDATE`);
      const [risk] = await tx.select().from(inventoryRiskRecords).where(eq(inventoryRiskRecords.id, recordId));
      if (!risk || risk.supplierId !== supplierId) throw new Error("Inventory risk record not found");
      if (risk.linkedPromotionId) {
        const [existing] = await tx.select().from(promotions).where(eq(promotions.id, risk.linkedPromotionId));
        if (existing) return { record: risk, promotion: existing };
      }
      if (risk.status !== "Open") throw new Error("Only open records can be actioned");
      if (!Number.isInteger(input.quantityCap) || input.quantityCap <= 0 || input.quantityCap > risk.flaggedQuantity) {
        throw new Error("Invalid Rescue quantity");
      }
      const [createdPromo] = await tx.insert(promotions).values({
        ...input,
        productId: risk.productId,
        supplierId: risk.supplierId,
        promotionType: "rescue",
        sourceRiskId: risk.id,
        quantityCap: input.quantityCap,
        rescueQuality: risk.qualityStatus,
      }).returning();
      const [updatedRecord] = await tx.update(inventoryRiskRecords)
        .set({ status: "Action Taken", linkedPromotionId: createdPromo.id, updatedAt: new Date() })
        .where(eq(inventoryRiskRecords.id, recordId))
        .returning();
      return { record: updatedRecord, promotion: createdPromo };
    });
  }

  private async reserveRescueAllocation(tx: any, orderItemId: string, promotionId: string, productId: string, supplierId: string, restaurantId: string, quantity: number): Promise<void> {
    await tx.execute(sql`SELECT id FROM ${promotions} WHERE id = ${promotionId} FOR UPDATE`);
    const [promo] = await tx.select().from(promotions).where(eq(promotions.id, promotionId));
    if (!promo || promo.promotionType !== "rescue") return;
    const now = new Date();
    const targeted = !promo.targetRestaurantIds?.length || promo.targetRestaurantIds.includes(restaurantId);
    const available = (promo.quantityCap ?? 0) - promo.rescueReservedQuantity - promo.rescueSoldQuantity;
    if (!promo.isActive || promo.startDate > now || promo.endDate < now || promo.productId !== productId || promo.supplierId !== supplierId || !targeted || quantity > available) {
      throw new Error("rescue_capacity_unavailable");
    }
    await tx.update(promotions).set({ rescueReservedQuantity: promo.rescueReservedQuantity + quantity }).where(eq(promotions.id, promotionId));
    await tx.insert(promotionAllocations).values({ promotionId, orderItemId, reservedQuantity: quantity });
  }

  async reconcileRescueAllocations(orderId: string, status: string, previousStatus: string, confirmedQuantitiesByItemId: Record<string, number> | undefined, tx: any): Promise<void> {
    const rows = await tx.select({ allocation: promotionAllocations, item: orderItems })
      .from(promotionAllocations)
      .innerJoin(orderItems, eq(promotionAllocations.orderItemId, orderItems.id))
      .where(eq(orderItems.orderId, orderId));
    rows.sort((left: any, right: any) =>
      String(left.allocation.promotionId).localeCompare(String(right.allocation.promotionId))
      || String(left.allocation.id).localeCompare(String(right.allocation.id)));
    for (const row of rows) {
      const a = row.allocation;
      const target = getRescueAllocationTarget({
        status,
        previousStatus,
        itemQuantity: row.item.quantity,
        confirmedQuantity: confirmedQuantitiesByItemId?.[a.orderItemId]
          ?? row.item.confirmedQuantity
          ?? undefined,
        currentReserved: a.reservedQuantity,
        currentSold: a.soldQuantity,
      });
      if (!target) continue;
      const targetReserved = target.reserved;
      const targetSold = target.sold;
      const reservedDelta = targetReserved - a.reservedQuantity;
      const soldDelta = targetSold - a.soldQuantity;
      if (reservedDelta === 0 && soldDelta === 0) continue;
      await tx.execute(sql`SELECT id FROM ${promotions} WHERE id = ${a.promotionId} FOR UPDATE`);
      const [p] = await tx.select().from(promotions).where(eq(promotions.id, a.promotionId));
      if (!p) continue;
      const nextReserved = p.rescueReservedQuantity + reservedDelta;
      const nextSold = p.rescueSoldQuantity + soldDelta;
      await tx.update(promotions).set({
        rescueReservedQuantity: nextReserved,
        rescueSoldQuantity: nextSold,
      }).where(eq(promotions.id, a.promotionId));
      await tx.update(promotionAllocations).set({
        reservedQuantity: targetReserved,
        soldQuantity: targetSold,
        releasedQuantity: a.releasedQuantity - reservedDelta - soldDelta,
        updatedAt: new Date(),
      }).where(eq(promotionAllocations.id, a.id));
      if (p.sourceRiskId && p.quantityCap !== null) {
        if (nextReserved + nextSold >= p.quantityCap) {
          await tx.update(inventoryRiskRecords)
            .set({ status: "Sold", updatedAt: new Date() })
            .where(and(
              eq(inventoryRiskRecords.id, p.sourceRiskId),
              sql`${inventoryRiskRecords.status} NOT IN ('Expired', 'Dismissed')`,
            ));
        } else if (status === "cancelled" && previousStatus !== "delivered") {
          await tx.update(inventoryRiskRecords)
            .set({ status: "Action Taken", updatedAt: new Date() })
            .where(and(
              eq(inventoryRiskRecords.id, p.sourceRiskId),
              eq(inventoryRiskRecords.status, "Sold"),
            ));
        }
      }
    }
  }

  async getOpenInventoryRiskCount(supplierId: string): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(inventoryRiskRecords)
      .where(and(eq(inventoryRiskRecords.supplierId, supplierId), eq(inventoryRiskRecords.status, "Open")));
    return row?.count ?? 0;
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

  async getCustomMinOrderQuantityById(id: string): Promise<CustomMinOrderQuantity | undefined> {
    const [row] = await db.select().from(customMinOrderQuantities).where(eq(customMinOrderQuantities.id, id));
    return row;
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

  async getCustomPriceById(id: string): Promise<CustomPrice | undefined> {
    const [row] = await db.select().from(customPrices).where(eq(customPrices.id, id));
    return row;
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

  // ===== PMS Integration =====
  async ensurePmsProviders(): Promise<void> {
    const seed = [
      { slug: "asa", name: "ASA Hotel" },
      { slug: "mews", name: "Mews" },
      { slug: "apaleo", name: "Apaleo" },
      { slug: "opera", name: "Oracle Opera" },
      { slug: "protel", name: "Protel" },
      { slug: "cloudbeds", name: "Cloudbeds" },
      { slug: "other", name: "Other / Not listed" },
    ];
    for (const p of seed) {
      const [existing] = await db.select().from(pmsProviders).where(eq(pmsProviders.slug, p.slug));
      if (!existing) await db.insert(pmsProviders).values(p);
    }
  }

  async getPmsProviders(): Promise<PmsProvider[]> {
    return db.select().from(pmsProviders).where(eq(pmsProviders.isActive, true)).orderBy(pmsProviders.name);
  }

  async getPmsProvider(id: string): Promise<PmsProvider | undefined> {
    const [provider] = await db.select().from(pmsProviders).where(eq(pmsProviders.id, id));
    return provider;
  }

  async getHotelConnection(restaurantId: string): Promise<(HotelPmsConnection & { provider: PmsProvider | null }) | undefined> {
    const [conn] = await db.select().from(hotelPmsConnections)
      .where(eq(hotelPmsConnections.restaurantId, restaurantId))
      .orderBy(desc(hotelPmsConnections.createdAt))
      .limit(1);
    if (!conn) return undefined;
    const provider = conn.providerId ? await this.getPmsProvider(conn.providerId) : undefined;
    return { ...conn, provider: provider ?? null };
  }

  async createHotelConnection(data: InsertHotelPmsConnection): Promise<HotelPmsConnection> {
    const [created] = await db.insert(hotelPmsConnections).values(data).returning();
    return created;
  }

  async updateHotelConnection(id: string, data: Partial<InsertHotelPmsConnection>): Promise<HotelPmsConnection | undefined> {
    const [updated] = await db.update(hotelPmsConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(hotelPmsConnections.id, id))
      .returning();
    return updated;
  }

  async createPmsConnectionRequest(data: InsertPmsConnectionRequest): Promise<PmsConnectionRequest> {
    const [created] = await db.insert(pmsConnectionRequests).values(data).returning();
    return created;
  }

  async getPmsConnectionRequests(): Promise<(PmsConnectionRequest & { restaurant: User | null; provider: PmsProvider | null })[]> {
    const reqs = await db.select().from(pmsConnectionRequests).orderBy(desc(pmsConnectionRequests.createdAt));
    if (reqs.length === 0) return [];
    const userIds = [...new Set(reqs.map(r => r.restaurantId))];
    const providerIds = [...new Set(reqs.map(r => r.providerId).filter((p): p is string => !!p))];
    const usersList = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
    const providersList = providerIds.length ? await db.select().from(pmsProviders).where(inArray(pmsProviders.id, providerIds)) : [];
    const uMap = new Map(usersList.map(u => [u.id, u]));
    const pMap = new Map(providersList.map(p => [p.id, p]));
    return reqs.map(r => ({
      ...r,
      restaurant: uMap.get(r.restaurantId) ?? null,
      provider: r.providerId ? pMap.get(r.providerId) ?? null : null,
    }));
  }

  async getPmsConnectionRequest(id: string): Promise<PmsConnectionRequest | undefined> {
    const [req] = await db.select().from(pmsConnectionRequests).where(eq(pmsConnectionRequests.id, id));
    return req;
  }

  async updatePmsConnectionRequest(id: string, data: { status?: string; adminNotes?: string }): Promise<PmsConnectionRequest | undefined> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status !== undefined) patch.status = data.status;
    if (data.adminNotes !== undefined) patch.adminNotes = data.adminNotes;
    const [updated] = await db.update(pmsConnectionRequests)
      .set(patch)
      .where(eq(pmsConnectionRequests.id, id))
      .returning();
    return updated;
  }

  async upsertGuestCountImport(data: InsertGuestCountImport): Promise<GuestCountImport> {
    const [existing] = await db.select().from(guestCountImports)
      .where(and(eq(guestCountImports.restaurantId, data.restaurantId), eq(guestCountImports.date, data.date)));
    if (existing) {
      const [updated] = await db.update(guestCountImports)
        .set({
          guestCount: data.guestCount,
          source: data.source ?? "pms",
          providerId: data.providerId ?? null,
          externalRef: data.externalRef ?? null,
          updatedAt: new Date(),
        })
        .where(eq(guestCountImports.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(guestCountImports).values(data).returning();
    return created;
  }

  async getGuestCountImports(restaurantId: string): Promise<GuestCountImport[]> {
    return db.select().from(guestCountImports)
      .where(eq(guestCountImports.restaurantId, restaurantId))
      .orderBy(desc(guestCountImports.date));
  }

  async getEffectiveGuestCountsByDate(restaurantId: string): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const stays = await db.select().from(overnightStays).where(eq(overnightStays.restaurantId, restaurantId));
    for (const s of stays) map.set(s.date, s.overnightStays);
    const imports = await db.select().from(guestCountImports).where(eq(guestCountImports.restaurantId, restaurantId));
    for (const i of imports) map.set(i.date, i.guestCount);
    return map;
  }

  // ===== ERP Integration (supplier stock) =====
  async ensureErpProviders(): Promise<void> {
    const seed = [
      { slug: "sap-b1", name: "SAP Business One" },
      { slug: "dynamics365", name: "Microsoft Dynamics 365" },
      { slug: "xentral", name: "Xentral" },
      { slug: "weclapp", name: "weclapp" },
      { slug: "lexware", name: "Lexware" },
      { slug: "datev", name: "DATEV" },
      { slug: "sage", name: "Sage" },
      { slug: "other", name: "Other / Not listed" },
    ];
    for (const p of seed) {
      const [existing] = await db.select().from(erpProviders).where(eq(erpProviders.slug, p.slug));
      if (!existing) await db.insert(erpProviders).values(p);
    }
  }

  async getErpProviders(): Promise<ErpProvider[]> {
    return db.select().from(erpProviders).where(eq(erpProviders.isActive, true)).orderBy(erpProviders.name);
  }

  async getErpProvider(id: string): Promise<ErpProvider | undefined> {
    const [provider] = await db.select().from(erpProviders).where(eq(erpProviders.id, id));
    return provider;
  }

  async getSupplierErpConnection(supplierId: string): Promise<(SupplierErpConnection & { provider: ErpProvider | null }) | undefined> {
    const [conn] = await db.select().from(supplierErpConnections)
      .where(eq(supplierErpConnections.supplierId, supplierId))
      .orderBy(desc(supplierErpConnections.createdAt))
      .limit(1);
    if (!conn) return undefined;
    const provider = conn.providerId ? await this.getErpProvider(conn.providerId) : undefined;
    return { ...conn, provider: provider ?? null };
  }

  async createSupplierErpConnection(data: InsertSupplierErpConnection): Promise<SupplierErpConnection> {
    const [created] = await db.insert(supplierErpConnections).values(data).returning();
    return created;
  }

  async updateSupplierErpConnection(id: string, data: Partial<InsertSupplierErpConnection>): Promise<SupplierErpConnection | undefined> {
    const [updated] = await db.update(supplierErpConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supplierErpConnections.id, id))
      .returning();
    return updated;
  }

  async createErpConnectionRequest(data: InsertErpConnectionRequest): Promise<ErpConnectionRequest> {
    const [created] = await db.insert(erpConnectionRequests).values(data).returning();
    return created;
  }

  async getErpConnectionRequests(): Promise<(ErpConnectionRequest & { supplier: User | null; provider: ErpProvider | null; hasCredentials: boolean; credentialMeta: ErpCredentialPublicMeta | null })[]> {
    const reqs = await db.select().from(erpConnectionRequests).orderBy(desc(erpConnectionRequests.createdAt));
    if (reqs.length === 0) return [];
    const userIds = [...new Set(reqs.map(r => r.supplierId))];
    const providerIds = [...new Set(reqs.map(r => r.providerId).filter((p): p is string => !!p))];
    const usersList = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
    const providersList = providerIds.length ? await db.select().from(erpProviders).where(inArray(erpProviders.id, providerIds)) : [];
    const credMap = await this.getErpCredentialMetaForSuppliers(userIds);
    const uMap = new Map(usersList.map(u => [u.id, u]));
    const pMap = new Map(providersList.map(p => [p.id, p]));
    return reqs.map(r => {
      const credentialMeta = credMap.get(r.supplierId) ?? null;
      return {
        ...r,
        supplier: uMap.get(r.supplierId) ?? null,
        provider: r.providerId ? pMap.get(r.providerId) ?? null : null,
        // Admin visibility: credentials EXIST (+ masked hint) without values.
        hasCredentials: !!credentialMeta,
        credentialMeta,
      };
    });
  }

  async getOpenErpConnectionRequest(supplierId: string): Promise<ErpConnectionRequest | undefined> {
    const [req] = await db.select().from(erpConnectionRequests)
      .where(and(
        eq(erpConnectionRequests.supplierId, supplierId),
        inArray(erpConnectionRequests.status, ["pending", "in_progress"]),
      ))
      .orderBy(desc(erpConnectionRequests.createdAt))
      .limit(1);
    return req;
  }

  async getErpConnectionRequest(id: string): Promise<ErpConnectionRequest | undefined> {
    const [req] = await db.select().from(erpConnectionRequests).where(eq(erpConnectionRequests.id, id));
    return req;
  }

  async updateErpConnectionRequest(id: string, data: { status?: string; adminNotes?: string }): Promise<ErpConnectionRequest | undefined> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status !== undefined) patch.status = data.status;
    if (data.adminNotes !== undefined) patch.adminNotes = data.adminNotes;
    const [updated] = await db.update(erpConnectionRequests)
      .set(patch)
      .where(eq(erpConnectionRequests.id, id))
      .returning();
    return updated;
  }

  // ----- WhatsApp Inbox connection -----
  async getWhatsappConnection(userId: string): Promise<WhatsappConnection | undefined> {
    const [conn] = await db.select().from(whatsappConnections)
      .where(eq(whatsappConnections.userId, userId))
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1);
    return conn;
  }

  async createWhatsappConnection(data: InsertWhatsappConnection): Promise<WhatsappConnection> {
    const [created] = await db.insert(whatsappConnections).values(data).returning();
    return created;
  }

  async updateWhatsappConnection(id: string, data: Partial<InsertWhatsappConnection>): Promise<WhatsappConnection | undefined> {
    const [updated] = await db.update(whatsappConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(whatsappConnections.id, id))
      .returning();
    return updated;
  }

  async createWhatsappConnectionRequest(data: InsertWhatsappConnectionRequest): Promise<WhatsappConnectionRequest> {
    const [created] = await db.insert(whatsappConnectionRequests).values(data).returning();
    return created;
  }

  async getOpenWhatsappConnectionRequest(userId: string): Promise<WhatsappConnectionRequest | undefined> {
    const [req] = await db.select().from(whatsappConnectionRequests)
      .where(and(
        eq(whatsappConnectionRequests.userId, userId),
        inArray(whatsappConnectionRequests.status, ["pending", "in_progress"]),
      ))
      .orderBy(desc(whatsappConnectionRequests.createdAt))
      .limit(1);
    return req;
  }

  async getWhatsappConnectionRequests(): Promise<(WhatsappConnectionRequest & { user: User | null })[]> {
    const reqs = await db.select().from(whatsappConnectionRequests).orderBy(desc(whatsappConnectionRequests.createdAt));
    if (reqs.length === 0) return [];
    const userIds = [...new Set(reqs.map(r => r.userId))];
    const usersList = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
    const uMap = new Map(usersList.map(u => [u.id, u]));
    return reqs.map(r => ({ ...r, user: uMap.get(r.userId) ?? null }));
  }

  async getWhatsappConnectionRequest(id: string): Promise<WhatsappConnectionRequest | undefined> {
    const [req] = await db.select().from(whatsappConnectionRequests).where(eq(whatsappConnectionRequests.id, id));
    return req;
  }

  async updateWhatsappConnectionRequest(id: string, data: { status?: string; adminNotes?: string }): Promise<WhatsappConnectionRequest | undefined> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status !== undefined) patch.status = data.status;
    if (data.adminNotes !== undefined) patch.adminNotes = data.adminNotes;
    const [updated] = await db.update(whatsappConnectionRequests)
      .set(patch)
      .where(eq(whatsappConnectionRequests.id, id))
      .returning();
    return updated;
  }

  async setUserWhatsappNumber(userId: string, whatsappNumber: string): Promise<void> {
    await db.update(users).set({ whatsappNumber }).where(eq(users.id, userId));
  }

  // ----- ERP credentials (encrypted at rest) -----
  private toErpCredentialMeta(row: typeof supplierErpCredentials.$inferSelect): ErpCredentialPublicMeta {
    return {
      id: row.id,
      connectionId: row.connectionId,
      supplierId: row.supplierId,
      credentialType: row.credentialType as ErpCredentialType,
      fieldsSet: row.fieldsSet ?? [],
      hint: row.hint ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async upsertErpCredentials(input: {
    connectionId: string;
    supplierId: string;
    credentialType: ErpCredentialType;
    secrets: Record<string, string>;
    hint?: string | null;
  }): Promise<ErpCredentialPublicMeta> {
    const encrypted = encryptJson(input.secrets);
    const fieldsSet = Object.keys(input.secrets);
    const now = new Date();
    const [row] = await db.insert(supplierErpCredentials)
      .values({
        connectionId: input.connectionId,
        supplierId: input.supplierId,
        credentialType: input.credentialType,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        fieldsSet,
        hint: input.hint ?? null,
      })
      .onConflictDoUpdate({
        target: supplierErpCredentials.connectionId,
        set: {
          supplierId: input.supplierId,
          credentialType: input.credentialType,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          fieldsSet,
          hint: input.hint ?? null,
          updatedAt: now,
        },
      })
      .returning();
    return this.toErpCredentialMeta(row);
  }

  async getErpCredentialMeta(connectionId: string): Promise<ErpCredentialPublicMeta | undefined> {
    const [row] = await db.select().from(supplierErpCredentials)
      .where(eq(supplierErpCredentials.connectionId, connectionId))
      .limit(1);
    return row ? this.toErpCredentialMeta(row) : undefined;
  }

  async getErpCredentialMetaForSupplier(supplierId: string): Promise<ErpCredentialPublicMeta | undefined> {
    const [row] = await db.select().from(supplierErpCredentials)
      .where(eq(supplierErpCredentials.supplierId, supplierId))
      .orderBy(desc(supplierErpCredentials.updatedAt))
      .limit(1);
    return row ? this.toErpCredentialMeta(row) : undefined;
  }

  async getErpCredentialMetaForSuppliers(supplierIds: string[]): Promise<Map<string, ErpCredentialPublicMeta>> {
    const map = new Map<string, ErpCredentialPublicMeta>();
    if (supplierIds.length === 0) return map;
    const rows = await db.select().from(supplierErpCredentials)
      .where(inArray(supplierErpCredentials.supplierId, supplierIds))
      .orderBy(desc(supplierErpCredentials.updatedAt));
    // First (most recent) row per supplier wins.
    for (const row of rows) {
      if (!map.has(row.supplierId)) map.set(row.supplierId, this.toErpCredentialMeta(row));
    }
    return map;
  }

  // Server-internal ONLY: decrypts and returns the secret values. Must never be
  // wired into a client-facing response.
  async getErpCredentialSecrets(connectionId: string): Promise<Record<string, string> | undefined> {
    const [row] = await db.select().from(supplierErpCredentials)
      .where(eq(supplierErpCredentials.connectionId, connectionId))
      .limit(1);
    if (!row) return undefined;
    return decryptJson<Record<string, string>>({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
    });
  }

  async deleteErpCredentials(connectionId: string): Promise<void> {
    await db.delete(supplierErpCredentials)
      .where(eq(supplierErpCredentials.connectionId, connectionId));
  }

  // ===== AI Assistant chat history =====
  async createAiChat(data: InsertAiChat): Promise<AiChat> {
    const [chat] = await db.insert(aiChats).values(data).returning();
    return chat;
  }

  async getAiChats(userId: string, role: string): Promise<AiChat[]> {
    return db
      .select()
      .from(aiChats)
      .where(and(eq(aiChats.userId, userId), eq(aiChats.role, role as any)))
      .orderBy(desc(aiChats.updatedAt));
  }

  async getAiChat(id: string): Promise<AiChat | undefined> {
    const [chat] = await db.select().from(aiChats).where(eq(aiChats.id, id)).limit(1);
    return chat;
  }

  async getAiChatMessages(chatId: string): Promise<AiChatMessage[]> {
    return db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.chatId, chatId))
      .orderBy(aiChatMessages.createdAt);
  }

  async appendAiChatMessage(data: InsertAiChatMessage): Promise<AiChatMessage> {
    const [msg] = await db.insert(aiChatMessages).values(data).returning();
    await db
      .update(aiChats)
      .set({ updatedAt: new Date() })
      .where(eq(aiChats.id, data.chatId));
    return msg;
  }

  async deleteAiChat(id: string, userId: string): Promise<void> {
    // Owner-scoped delete; messages cascade via FK onDelete.
    await db.delete(aiChats).where(and(eq(aiChats.id, id), eq(aiChats.userId, userId)));
  }

  // ===== Platform Admins =====

  // ─── Driver module (Task #173) ──────────────────────────────────────────
  // Idempotent startup DDL — NEVER a blind drizzle push (it can drop
  // user_sessions). Every statement is safe to re-run on every boot.
  async runDriverMigration(): Promise<void> {
    await db.execute(sql`ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'driver'`);
    await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'delivery_assigned'`);
    await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'delivery_update'`);
    await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'delivery_problem'`);
    await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'internal_message'`);
    // Two self-contained test servers can bootstrap simultaneously. PostgreSQL
    // reports a unique catalog violation (rather than duplicate_object) when
    // both sessions pass the existence check in the same instant.
    try {
      await db.execute(sql`
        DO $$ BEGIN
          CREATE TYPE route_status AS ENUM ('draft', 'confirmed', 'active', 'completed');
        EXCEPTION WHEN duplicate_object THEN null; END $$
      `);
    } catch (error: any) {
      const dbError = error?.cause ?? error;
      if (dbError?.code !== "23505") throw error;
    }
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS driver_routes (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_member_id varchar(36) NOT NULL REFERENCES members(id),
        supplier_id varchar(36) NOT NULL REFERENCES users(id),
        delivery_date varchar(10) NOT NULL,
        status route_status NOT NULL DEFAULT 'draft',
        ordered_stop_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        active_stop_id varchar(36),
        started_at timestamp,
        confirmed_at timestamp,
        completed_at timestamp,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_driver_routes_driver_date ON driver_routes (driver_member_id, delivery_date)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_driver_routes_supplier_date ON driver_routes (supplier_id, delivery_date)`);
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE delivery_status AS ENUM ('assigned', 'picked_up', 'en_route', 'arriving', 'delivered', 'problem');
      EXCEPTION WHEN duplicate_object THEN null; END $$
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS delivery_assignments (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id varchar(36) NOT NULL REFERENCES orders(id),
        supplier_id varchar(36) NOT NULL REFERENCES users(id),
        restaurant_id varchar(36) NOT NULL REFERENCES users(id),
        driver_member_id varchar(36) NOT NULL REFERENCES members(id),
        assigned_by_member_id varchar(36) REFERENCES members(id),
        delivery_date varchar(10) NOT NULL,
        stop_sequence integer NOT NULL DEFAULT 0,
        status delivery_status NOT NULL DEFAULT 'assigned',
        time_window text,
        priority varchar(10) NOT NULL DEFAULT 'normal',
        packages integer,
        notes text,
        assigned_at timestamp NOT NULL DEFAULT now(),
        en_route_at timestamp,
        arriving_at timestamp,
        delivered_at timestamp,
        pod_note text,
        pod_photo_url text,
        pod_recipient text,
        problem_type text,
        problem_note text,
        problem_reported_at timestamp,
        eta_minutes integer,
        distance_km numeric(8,2),
        route_polyline text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS route_polyline text`);
    await db.execute(sql`ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS delay_request_key varchar(128)`);
    await db.execute(sql`ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS exception_resolution text`);
    await db.execute(sql`ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS exception_resolution_note text`);
    await db.execute(sql`ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS exception_resume_status text`);
    await db.execute(sql`ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS exception_resolved_at timestamp`);
    await db.execute(sql`ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS exception_resolved_by_member_id varchar(36) REFERENCES members(id)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery_assignments_order ON delivery_assignments (order_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_delivery_assignments_driver_date ON delivery_assignments (driver_member_id, delivery_date)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_delivery_assignments_supplier_date ON delivery_assignments (supplier_id, delivery_date)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_delivery_assignments_restaurant ON delivery_assignments (restaurant_id)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS driver_locations (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_member_id varchar(36) NOT NULL REFERENCES members(id),
        supplier_id varchar(36) NOT NULL REFERENCES users(id),
        latitude numeric(10,7) NOT NULL,
        longitude numeric(10,7) NOT NULL,
        heading integer,
        speed_kmh integer,
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_driver_locations_member ON driver_locations (driver_member_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_driver_locations_supplier ON driver_locations (supplier_id)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS internal_messages (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id varchar(36) NOT NULL REFERENCES users(id),
        sender_member_id varchar(36) NOT NULL REFERENCES members(id),
        content text NOT NULL DEFAULT '',
        message_type varchar(20) NOT NULL DEFAULT 'text',
        attachment_url text,
        attachment_name text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_internal_messages_supplier_created ON internal_messages (supplier_id, created_at)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS internal_chat_reads (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id varchar(36) NOT NULL REFERENCES users(id),
        member_id varchar(36) NOT NULL REFERENCES members(id),
        last_read_at timestamp NOT NULL DEFAULT now()
      )
    `);
    // ── Internal chat: group channel → 1:1 direct messages ─────────────────
    // recipient_member_id NULL marks legacy group-channel rows (hidden in UI).
    await db.execute(sql`ALTER TABLE internal_messages ADD COLUMN IF NOT EXISTS recipient_member_id varchar(36) REFERENCES members(id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_internal_messages_recipient ON internal_messages (supplier_id, recipient_member_id, created_at)`);
    // Read cursors become per member-pair; legacy per-member cursors are dropped.
    await db.execute(sql`ALTER TABLE internal_chat_reads ADD COLUMN IF NOT EXISTS other_member_id varchar(36) REFERENCES members(id)`);
    await db.execute(sql`DELETE FROM internal_chat_reads WHERE other_member_id IS NULL`);
    await db.execute(sql`ALTER TABLE internal_chat_reads ALTER COLUMN other_member_id SET NOT NULL`);
    await db.execute(sql`DROP INDEX IF EXISTS uniq_internal_chat_reads_member`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_internal_chat_reads_pair ON internal_chat_reads (supplier_id, member_id, other_member_id)`);
    console.log("[driver] delivery tables ready");
  }

  // Constraint tables use idempotent DDL because older deployments do not have
  // a dependable Drizzle migration baseline.
  async runDeliveryConstraintsMigration(): Promise<void> {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS time_zone varchar(64) NOT NULL DEFAULT 'Europe/Rome'`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS restaurant_availability (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        opens_at varchar(5) NOT NULL,
        closes_at varchar(5) NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_restaurant_availability_restaurant_day ON restaurant_availability (restaurant_id, day_of_week)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS restaurant_availability_exceptions (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date varchar(10) NOT NULL,
        is_closed boolean NOT NULL DEFAULT true,
        opens_at varchar(5),
        closes_at varchar(5),
        note text,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT uniq_restaurant_availability_exception_date UNIQUE (restaurant_id, date)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS supplier_delivery_zones (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        postal_code_prefix varchar(12) NOT NULL,
        label text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT uniq_supplier_delivery_zone_prefix UNIQUE (supplier_id, postal_code_prefix)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_supplier_delivery_zones_supplier ON supplier_delivery_zones (supplier_id, is_active)`);
  }

  // Batch-hydrates assignments with order (incl. items+products), restaurant
  // org and driver member — avoids N+1 queries on list endpoints.
  private async hydrateDeliveryAssignments(rows: DeliveryAssignment[]): Promise<DeliveryAssignmentWithDetails[]> {
    if (rows.length === 0) return [];
    const orderIds = Array.from(new Set(rows.map((r) => r.orderId)));
    const restaurantIds = Array.from(new Set(rows.map((r) => r.restaurantId)));
    const driverIds = Array.from(new Set(rows.map((r) => r.driverMemberId)));
    const [orderRows, itemRows, restaurantRows, driverRows] = await Promise.all([
      db.select().from(orders).where(inArray(orders.id, orderIds)),
      db.select({ item: orderItems, product: products })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(inArray(orderItems.orderId, orderIds)),
      db.select().from(users).where(inArray(users.id, restaurantIds)),
      db.select().from(members).where(inArray(members.id, driverIds)),
    ]);
    const orderMap = new Map(orderRows.map((o) => [o.id, o]));
    const itemsByOrder = new Map<string, OrderItemWithProduct[]>();
    for (const { item, product } of itemRows) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push({ ...item, productImageUrl: product?.imageUrl ?? null, productUnit: product?.unit ?? null });
      itemsByOrder.set(item.orderId, list);
    }
    const restaurantMap = new Map(restaurantRows.map((u) => [u.id, u]));
    // Strip credential/auth columns so delivery payloads never leak them.
    const driverMap = new Map(driverRows.map((m) => {
      const { passwordHash: _ph, emailVerifiedAt: _ev, lastLoginAt: _ll, ...safe } = m;
      return [m.id, safe] as const;
    }));
    return rows
      .filter((r) => orderMap.has(r.orderId) && restaurantMap.has(r.restaurantId) && driverMap.has(r.driverMemberId))
      .map((r) => ({
        ...r,
        order: { ...orderMap.get(r.orderId)!, items: itemsByOrder.get(r.orderId) ?? [] },
        restaurant: restaurantMap.get(r.restaurantId)!,
        driver: driverMap.get(r.driverMemberId)!,
      }));
  }

  async createDeliveryAssignment(data: InsertDeliveryAssignment): Promise<DeliveryAssignment> {
    const [row] = await db.insert(deliveryAssignments).values(data).returning();
    return row;
  }

  async getDeliveryAssignment(id: string): Promise<DeliveryAssignment | undefined> {
    const [row] = await db.select().from(deliveryAssignments).where(eq(deliveryAssignments.id, id)).limit(1);
    return row;
  }

  async getDeliveryAssignmentByOrder(orderId: string): Promise<DeliveryAssignment | undefined> {
    const [row] = await db.select().from(deliveryAssignments).where(eq(deliveryAssignments.orderId, orderId)).limit(1);
    return row;
  }

  async getDeliveriesForDriver(driverMemberId: string, deliveryDate?: string): Promise<DeliveryAssignmentWithDetails[]> {
    const conditions = [eq(deliveryAssignments.driverMemberId, driverMemberId)];
    if (deliveryDate) conditions.push(eq(deliveryAssignments.deliveryDate, deliveryDate));
    const rows = await db.select().from(deliveryAssignments)
      .where(and(...conditions))
      .orderBy(deliveryAssignments.stopSequence, deliveryAssignments.assignedAt);
    return this.hydrateDeliveryAssignments(rows);
  }

  async getDriverDeliveryHistory(driverMemberId: string, limit = 100): Promise<DeliveryAssignmentWithDetails[]> {
    const rows = await db.select().from(deliveryAssignments)
      .where(and(
        eq(deliveryAssignments.driverMemberId, driverMemberId),
        inArray(deliveryAssignments.status, ["delivered", "problem", "rejected"]),
      ))
      .orderBy(desc(deliveryAssignments.updatedAt))
      .limit(limit);
    return this.hydrateDeliveryAssignments(rows);
  }

  async getDeliveriesForSupplier(supplierId: string, deliveryDate?: string): Promise<DeliveryAssignmentWithDetails[]> {
    const conditions = [eq(deliveryAssignments.supplierId, supplierId)];
    if (deliveryDate) conditions.push(eq(deliveryAssignments.deliveryDate, deliveryDate));
    const rows = await db.select().from(deliveryAssignments)
      .where(and(...conditions))
      .orderBy(deliveryAssignments.stopSequence, desc(deliveryAssignments.assignedAt));
    return this.hydrateDeliveryAssignments(rows);
  }

  async updateDeliveryAssignment(id: string, data: Partial<DeliveryAssignment>): Promise<DeliveryAssignment | undefined> {
    const [row] = await db.update(deliveryAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(deliveryAssignments.id, id))
      .returning();
    return row;
  }

  async updateDeliveryAssignmentIfStatus(id: string, expectedStatus: string, data: Partial<DeliveryAssignment>): Promise<DeliveryAssignment | undefined> {
    const [row] = await db.update(deliveryAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(deliveryAssignments.id, id), eq(deliveryAssignments.status, expectedStatus as any)))
      .returning();
    return row;
  }

  async updateDeliveryAssignmentIfUnresolvedProblem(id: string, data: Partial<DeliveryAssignment>): Promise<DeliveryAssignment | undefined> {
    const [row] = await db.update(deliveryAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(deliveryAssignments.id, id),
        eq(deliveryAssignments.status, "problem"),
        isNull(deliveryAssignments.exceptionResolvedAt),
      ))
      .returning();
    return row;
  }

  async deleteDeliveryAssignment(id: string): Promise<void> {
    await db.delete(deliveryAssignments).where(eq(deliveryAssignments.id, id));
  }

  async reorderDeliveryStops(driverMemberId: string, deliveryDate: string, orderedIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      const [route] = await tx.select().from(driverRoutes).where(and(
        eq(driverRoutes.driverMemberId, driverMemberId), eq(driverRoutes.deliveryDate, deliveryDate),
      )).limit(1).for("update");
      if (route && route.status !== "draft") throw new Error("route_locked");
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.update(deliveryAssignments)
          .set({ stopSequence: i, updatedAt: new Date() })
          .where(and(
            eq(deliveryAssignments.id, orderedIds[i]),
            eq(deliveryAssignments.driverMemberId, driverMemberId),
            eq(deliveryAssignments.deliveryDate, deliveryDate),
          ));
      }
      if (route) {
        await tx.update(driverRoutes).set({ orderedStopIds: orderedIds, updatedAt: new Date() }).where(eq(driverRoutes.id, route.id));
      }
    });
  }

  // Shift the ETA of every still-open stop at or after the given stop of the
  // driver's day route by delayMinutes. Returns the affected rows (post-update).
  async applyRouteDelay(driverMemberId: string, deliveryDate: string, fromStopSequence: number, delayMinutes: number, requestKey?: string): Promise<DeliveryAssignment[]> {
    return db.transaction(async (tx) => {
      const [trigger] = await tx.select().from(deliveryAssignments).where(and(
        eq(deliveryAssignments.driverMemberId, driverMemberId),
        eq(deliveryAssignments.deliveryDate, deliveryDate),
        eq(deliveryAssignments.stopSequence, fromStopSequence),
      )).limit(1).for("update");
      if (trigger && requestKey && trigger.delayRequestKey === requestKey) return [];
      const rows = await tx.update(deliveryAssignments)
        .set({
          etaMinutes: sql`COALESCE(${deliveryAssignments.etaMinutes}, 0) + ${delayMinutes}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(deliveryAssignments.driverMemberId, driverMemberId),
          eq(deliveryAssignments.deliveryDate, deliveryDate),
          gte(deliveryAssignments.stopSequence, fromStopSequence),
          notInArray(deliveryAssignments.status, ["delivered", "rejected"]),
        ))
        .returning();
      if (trigger) {
        await tx.update(deliveryAssignments).set({
          delayMinutes: sql`COALESCE(${deliveryAssignments.delayMinutes}, 0) + ${delayMinutes}`,
          ...(requestKey ? { delayRequestKey: requestKey } : {}),
          updatedAt: new Date(),
        }).where(eq(deliveryAssignments.id, trigger.id));
      }
      return rows;
    });
  }

  async syncDraftDriverRoute(driverMemberId: string, supplierId: string, deliveryDate: string): Promise<DriverRoute | undefined> {
    return db.transaction(async (tx) => {
      const [route] = await tx.select().from(driverRoutes).where(and(
        eq(driverRoutes.driverMemberId, driverMemberId), eq(driverRoutes.deliveryDate, deliveryDate),
      )).limit(1).for("update");
      const assignments = await tx.select({ id: deliveryAssignments.id }).from(deliveryAssignments)
        .where(and(eq(deliveryAssignments.driverMemberId, driverMemberId), eq(deliveryAssignments.deliveryDate, deliveryDate)))
        .orderBy(deliveryAssignments.stopSequence, deliveryAssignments.assignedAt);
      const ids = assignments.map((a) => a.id);
      if (!route) {
        const [created] = await tx.insert(driverRoutes).values({ driverMemberId, supplierId, deliveryDate, orderedStopIds: ids }).returning();
        return created;
      }
      if (route.status !== "draft") return route;
      const valid = new Set(ids);
      const ordered = (route.orderedStopIds ?? []).filter((id) => valid.has(id));
      ordered.push(...ids.filter((id) => !ordered.includes(id)));
      const [updated] = await tx.update(driverRoutes).set({ orderedStopIds: ordered, updatedAt: new Date() })
        .where(eq(driverRoutes.id, route.id)).returning();
      return updated;
    });
  }

  async upsertDriverLocation(data: InsertDriverLocation): Promise<DriverLocation> {
    const [row] = await db.insert(driverLocations)
      .values(data)
      .onConflictDoUpdate({
        target: driverLocations.driverMemberId,
        set: {
          latitude: data.latitude,
          longitude: data.longitude,
          heading: data.heading ?? null,
          speedKmh: data.speedKmh ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async getDriverLocation(driverMemberId: string): Promise<DriverLocation | undefined> {
    const [row] = await db.select().from(driverLocations).where(eq(driverLocations.driverMemberId, driverMemberId)).limit(1);
    return row;
  }

  async getDriverLocationsForSupplier(supplierId: string): Promise<DriverLocationWithDriver[]> {
    const rows = await db.select({ location: driverLocations, driver: members })
      .from(driverLocations)
      .innerJoin(members, eq(driverLocations.driverMemberId, members.id))
      .where(eq(driverLocations.supplierId, supplierId));
    // Strip credential/auth columns so location payloads never leak them.
    return rows.map((r) => {
      const { passwordHash: _ph, emailVerifiedAt: _ev, lastLoginAt: _ll, ...safeDriver } = r.driver;
      return { ...r.location, driver: safeDriver };
    });
  }

  async getDriverRoute(driverMemberId: string, deliveryDate: string): Promise<DriverRoute | undefined> {
    const [row] = await db.select().from(driverRoutes).where(and(
      eq(driverRoutes.driverMemberId, driverMemberId),
      eq(driverRoutes.deliveryDate, deliveryDate),
    )).limit(1);
    return row;
  }

  async upsertDriverRoute(driverMemberId: string, supplierId: string, deliveryDate: string, orderedStopIds: string[]): Promise<DriverRoute> {
    const [row] = await db.insert(driverRoutes).values({
      driverMemberId, supplierId, deliveryDate, orderedStopIds,
    }).onConflictDoUpdate({
      target: [driverRoutes.driverMemberId, driverRoutes.deliveryDate],
      set: { orderedStopIds, updatedAt: new Date() },
    }).returning();
    return row;
  }

  async confirmDriverRoute(driverMemberId: string, deliveryDate: string): Promise<DriverRoute | undefined> {
    const [row] = await db.update(driverRoutes).set({
      status: "confirmed", confirmedAt: new Date(), updatedAt: new Date(),
    }).where(and(
      eq(driverRoutes.driverMemberId, driverMemberId),
      eq(driverRoutes.deliveryDate, deliveryDate),
      eq(driverRoutes.status, "draft"),
    )).returning();
    return row;
  }

  async startDriverRoute(driverMemberId: string, deliveryDate: string): Promise<{ route: DriverRoute; activeStopId: string } | undefined> {
    return db.transaction(async (tx) => {
      const [route] = await tx.select().from(driverRoutes).where(and(
        eq(driverRoutes.driverMemberId, driverMemberId), eq(driverRoutes.deliveryDate, deliveryDate),
      )).limit(1).for("update");
      // Starting is idempotent: a retried request observes the already active
      // route and does not create a second departure event.
      if (route?.status === "active" && route.activeStopId) {
        return { route, activeStopId: route.activeStopId };
      }
      if (!route || route.status !== "confirmed") return undefined;
      const [next] = await tx.select({ id: deliveryAssignments.id }).from(deliveryAssignments).where(and(
        eq(deliveryAssignments.driverMemberId, driverMemberId),
        eq(deliveryAssignments.deliveryDate, deliveryDate),
        inArray(deliveryAssignments.id, route.orderedStopIds),
        notInArray(deliveryAssignments.status, ["delivered", "problem", "rejected"]),
      )).orderBy(deliveryAssignments.stopSequence).limit(1);
      if (!next) return undefined;
      const [updated] = await tx.update(driverRoutes).set({
        status: "active", activeStopId: next.id, startedAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(driverRoutes.id, route.id), eq(driverRoutes.status, "confirmed"))).returning();
      if (!updated) return undefined;
      return { route: updated, activeStopId: next.id };
    });
  }

  async advanceDriverRoute(driverMemberId: string, deliveryDate: string, completedStopId: string): Promise<{ route: DriverRoute; activeStopId: string | null } | undefined> {
    return db.transaction(async (tx) => {
      const [route] = await tx.select().from(driverRoutes).where(and(
        eq(driverRoutes.driverMemberId, driverMemberId), eq(driverRoutes.deliveryDate, deliveryDate),
      )).limit(1).for("update");
      if (!route || route.status !== "active" || route.activeStopId !== completedStopId) return undefined;
      const [next] = await tx.select({ id: deliveryAssignments.id }).from(deliveryAssignments).where(and(
        eq(deliveryAssignments.driverMemberId, driverMemberId),
        eq(deliveryAssignments.deliveryDate, deliveryDate),
        inArray(deliveryAssignments.id, route.orderedStopIds),
        notInArray(deliveryAssignments.status, ["delivered", "problem", "rejected"]),
      )).orderBy(deliveryAssignments.stopSequence).limit(1);
      const [updated] = await tx.update(driverRoutes).set({
        activeStopId: next?.id ?? null,
        status: next ? "active" : "completed",
        completedAt: next ? null : new Date(),
        updatedAt: new Date(),
      }).where(and(eq(driverRoutes.id, route.id), eq(driverRoutes.status, "active"), eq(driverRoutes.activeStopId, completedStopId))).returning();
      if (!updated) return undefined;
      return { route: updated, activeStopId: next?.id ?? null };
    });
  }

  private sanitizeMember(m: Member): SafeMember {
    const { passwordHash: _ph, emailVerifiedAt: _ev, lastLoginAt: _ll, ...safe } = m;
    return safe;
  }

  // Messages of ONE direct thread (me ↔ other), oldest first. Read receipt per
  // message: the partner's read cursor for this pair has passed the message.
  async getInternalMessages(orgId: string, memberId: string, otherMemberId: string, limit = 300): Promise<InternalMessageWithSender[]> {
    const rows = await db.select({ message: internalMessages, sender: members })
      .from(internalMessages)
      .leftJoin(members, eq(internalMessages.senderMemberId, members.id))
      .where(and(
        eq(internalMessages.supplierId, orgId),
        or(
          and(eq(internalMessages.senderMemberId, memberId), eq(internalMessages.recipientMemberId, otherMemberId)),
          and(eq(internalMessages.senderMemberId, otherMemberId), eq(internalMessages.recipientMemberId, memberId)),
        ),
      ))
      .orderBy(desc(internalMessages.createdAt))
      .limit(limit);
    rows.reverse();
    const [partnerCursor] = await db.select().from(internalChatReads)
      .where(and(
        eq(internalChatReads.supplierId, orgId),
        eq(internalChatReads.memberId, otherMemberId),
        eq(internalChatReads.otherMemberId, memberId),
      ))
      .limit(1);
    return rows.map((r) => ({
      ...r.message,
      sender: r.sender ? this.sanitizeMember(r.sender) : null,
      readByPartner:
        r.message.senderMemberId === memberId &&
        !!partnerCursor && partnerCursor.lastReadAt >= r.message.createdAt,
    }));
  }

  // Thread list for the internal inbox: one entry per member the caller has a
  // DM history with — last message plus per-thread unread count. Fully
  // SQL-aggregated so counts stay exact regardless of message volume.
  async getInternalThreads(orgId: string, memberId: string): Promise<InternalThread[]> {
    // Latest message per partner (DISTINCT ON keeps the newest row per pair).
    const lastRes = await db.execute(sql`
      SELECT DISTINCT ON (partner_id)
        t.partner_id, t.id, t.supplier_id, t.sender_member_id, t.recipient_member_id,
        t.content, t.message_type, t.attachment_url, t.attachment_name, t.created_at
      FROM (
        SELECT m.*,
          CASE WHEN m.sender_member_id = ${memberId}
               THEN m.recipient_member_id ELSE m.sender_member_id END AS partner_id
        FROM internal_messages m
        WHERE m.supplier_id = ${orgId}
          AND m.recipient_member_id IS NOT NULL
          AND (m.sender_member_id = ${memberId} OR m.recipient_member_id = ${memberId})
      ) t
      ORDER BY partner_id, created_at DESC
    `);
    if (lastRes.rows.length === 0) return [];

    // Unread messages addressed to me, grouped by sender (= partner).
    const unreadRes = await db.execute(sql`
      SELECT m.sender_member_id AS partner_id, count(*)::int AS unread
      FROM internal_messages m
      LEFT JOIN internal_chat_reads r
        ON r.supplier_id = m.supplier_id
       AND r.member_id = ${memberId}
       AND r.other_member_id = m.sender_member_id
      WHERE m.supplier_id = ${orgId}
        AND m.recipient_member_id = ${memberId}
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
      GROUP BY m.sender_member_id
    `);
    const unreadByPartner = new Map(
      unreadRes.rows.map((r: any) => [String(r.partner_id), Number(r.unread)]));

    const partnerIds = lastRes.rows.map((r: any) => String(r.partner_id));
    const partnerRows = await db.select().from(members).where(inArray(members.id, partnerIds));
    const memberById = new Map(partnerRows.map((m) => [m.id, m]));

    const threads: InternalThread[] = [];
    for (const r of lastRes.rows as any[]) {
      const partner = memberById.get(String(r.partner_id));
      if (!partner) continue;
      threads.push({
        partner: this.sanitizeMember(partner),
        lastMessage: {
          id: r.id,
          supplierId: r.supplier_id,
          senderMemberId: r.sender_member_id,
          recipientMemberId: r.recipient_member_id,
          content: r.content,
          messageType: r.message_type,
          attachmentUrl: r.attachment_url,
          attachmentName: r.attachment_name,
          createdAt: new Date(r.created_at),
        },
        unreadCount: unreadByPartner.get(String(r.partner_id)) ?? 0,
      });
    }
    threads.sort((a, b) =>
      (b.lastMessage?.createdAt.getTime() ?? 0) - (a.lastMessage?.createdAt.getTime() ?? 0));
    return threads;
  }

  async createInternalMessage(data: InsertInternalMessage): Promise<InternalMessage> {
    const [row] = await db.insert(internalMessages).values(data).returning();
    return row;
  }

  async markInternalChatRead(orgId: string, memberId: string, otherMemberId: string): Promise<void> {
    await db.insert(internalChatReads)
      .values({ supplierId: orgId, memberId, otherMemberId, lastReadAt: new Date() })
      .onConflictDoUpdate({
        target: [internalChatReads.supplierId, internalChatReads.memberId, internalChatReads.otherMemberId],
        set: { lastReadAt: new Date() },
      });
  }

  // Total unread DMs addressed to the member (nav badge).
  async getInternalUnreadCount(orgId: string, memberId: string): Promise<number> {
    const res = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM internal_messages m
      LEFT JOIN internal_chat_reads r
        ON r.supplier_id = m.supplier_id
       AND r.member_id = ${memberId}
       AND r.other_member_id = m.sender_member_id
      WHERE m.supplier_id = ${orgId}
        AND m.recipient_member_id = ${memberId}
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    `);
    return (res.rows[0] as any)?.count ?? 0;
  }

  async runAdminMigration(): Promise<void> {
    // Normalize the historical order enum before the application schema is
    // reduced to the seven canonical commercial statuses. This is deliberately
    // idempotent and runs before any schema push can remove legacy values.
    await db.execute(sql`
      DO $$
      DECLARE old_count integer;
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'order_status' AND e.enumlabel = 'partially_confirmed'
        ) THEN
          CREATE TYPE order_status_migrating AS ENUM (
            'pending', 'confirmed', 'partially_confirmed', 'scheduled',
            'in_delivery', 'delivered', 'cancelled', 'to_review',
            'not_deliverable'
          );
          ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
          ALTER TABLE orders ALTER COLUMN status TYPE order_status_migrating
            USING status::text::order_status_migrating;
          DROP TYPE order_status;
          ALTER TYPE order_status_migrating RENAME TO order_status;
          UPDATE orders SET status = 'confirmed' WHERE status::text = 'partially_confirmed';
          UPDATE orders SET status = 'not_deliverable' WHERE status::text = 'to_review';
        END IF;

        UPDATE order_status_history SET
          from_status = CASE from_status
            WHEN 'partially_confirmed' THEN 'confirmed'
            WHEN 'to_review' THEN 'not_deliverable'
            ELSE from_status
          END,
          to_status = CASE to_status
            WHEN 'partially_confirmed' THEN 'confirmed'
            WHEN 'to_review' THEN 'not_deliverable'
            ELSE to_status
          END
        WHERE from_status IN ('partially_confirmed', 'to_review')
           OR to_status IN ('partially_confirmed', 'to_review');

        SELECT count(*) INTO old_count FROM orders
        WHERE status::text IN ('partially_confirmed', 'to_review');
        IF old_count > 0 THEN
          RAISE EXCEPTION 'Order status migration left % legacy orders', old_count;
        END IF;
        SELECT count(*) INTO old_count FROM order_status_history
        WHERE from_status IN ('partially_confirmed', 'to_review')
           OR to_status IN ('partially_confirmed', 'to_review');
        IF old_count > 0 THEN
          RAISE EXCEPTION 'Order status migration left % legacy history rows', old_count;
        END IF;

        IF EXISTS (
          SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'order_status' AND e.enumlabel = 'partially_confirmed'
        ) THEN
          CREATE TYPE order_status_final AS ENUM (
            'pending', 'confirmed', 'scheduled', 'in_delivery',
            'delivered', 'cancelled', 'not_deliverable'
          );
          ALTER TABLE orders ALTER COLUMN status TYPE order_status_final
            USING status::text::order_status_final;
          DROP TYPE order_status;
          ALTER TYPE order_status_final RENAME TO order_status;
        END IF;
        ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';
      END $$;
    `);
    // Immutable Local-impact snapshots are additive and remain independent of
    // the canonical product sustainability migration.
    await db.execute(sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS local_impact_snapshot jsonb`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_admins (
        id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
        replit_user_id text NOT NULL,
        replit_username text NOT NULL,
        name text NOT NULL,
        email text,
        status varchar(20) NOT NULL DEFAULT 'pending',
        approved_by text,
        approved_at timestamp,
        last_login_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    // Migrate to email + password auth: add the new credential columns and make
    // the legacy Replit OIDC columns optional. All idempotent.
    await db.execute(sql`ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS password_hash text`);
    await db.execute(sql`ALTER TABLE platform_admins ALTER COLUMN replit_user_id DROP NOT NULL`);
    await db.execute(sql`ALTER TABLE platform_admins ALTER COLUMN replit_username DROP NOT NULL`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_admins_replit_user_id ON platform_admins (replit_user_id)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_admins_email ON platform_admins (lower(email))`);
    console.log("[admin] platform_admins table ready");

    // Error-log status workflow (new | in_progress | closed). Idempotent DDL so
    // the column/index exist in every environment without a drizzle push.
    await db.execute(sql`ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS status varchar(12) NOT NULL DEFAULT 'new'`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_error_logs_status ON error_logs (status)`);

    // Inventory risk: capture WHY stock is at risk (warehouse step-by-step wizard).
    // Nullable text token; idempotent so it exists in every env without a drizzle push.
    await db.execute(sql`ALTER TABLE inventory_risk_records ADD COLUMN IF NOT EXISTS risk_reason text`);
    // Urgency level set by warehouse worker: 'normal' (default) or 'urgent' (red/important).
    await db.execute(sql`ALTER TABLE inventory_risk_records ADD COLUMN IF NOT EXISTS priority varchar(10) NOT NULL DEFAULT 'normal'`);

    // Member self-profile completion (first-login step). Idempotent.
    await db.execute(sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS profile_completed_at timestamp`);

    // Supplier changed the delivery date (confirm/reschedule) — mandatory reason.
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date_change_reason text`);
    // New order status "scheduled" (Geplant): driver assigned but not yet en route.
    await db.execute(sql`ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'scheduled' BEFORE 'in_delivery'`);

    // Driver reject flow: delivery status "rejected", plus rejection timestamp
    // and info-only delay minutes.
    await db.execute(sql`ALTER TYPE delivery_status ADD VALUE IF NOT EXISTS 'rejected'`);
    await db.execute(sql`ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS rejected_at timestamp`);
    await db.execute(sql`ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS delay_minutes integer`);

    // Fix wrong FK: created_by stores the reporting MEMBER id (members.id), but the
    // table was created with a FK to users(id), so every insert failed. Idempotent:
    // drop the wrong constraint if present and add the correct one once.
    await db.execute(sql`ALTER TABLE inventory_risk_records DROP CONSTRAINT IF EXISTS inventory_risk_records_created_by_fkey`);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'inventory_risk_records_created_by_members_fkey'
        ) THEN
          ALTER TABLE inventory_risk_records
            ADD CONSTRAINT inventory_risk_records_created_by_members_fkey
            FOREIGN KEY (created_by) REFERENCES members(id);
        END IF;
      END $$;
    `);

    // ONE-TIME backfill: every log that existed before this feature shipped is
    // treated as already handled (closed). Tracked in app_migrations so later
    // boots never mass-close newly arrived logs.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS app_migrations (
        name text PRIMARY KEY,
        applied_at timestamp NOT NULL DEFAULT now()
      )
    `);
    const ERROR_LOG_CLOSE_MIGRATION = "error_logs_close_existing_v1";
    const closeApplied = await db.execute(sql`SELECT 1 FROM app_migrations WHERE name = ${ERROR_LOG_CLOSE_MIGRATION}`);
    if ((closeApplied.rows || []).length === 0) {
      await db.update(errorLogs).set({ status: "closed" }).where(ne(errorLogs.status, "closed"));
      await db.execute(sql`INSERT INTO app_migrations (name) VALUES (${ERROR_LOG_CLOSE_MIGRATION}) ON CONFLICT DO NOTHING`);
    }
  }

  async getPlatformAdmin(id: string): Promise<PlatformAdmin | undefined> {
    const [row] = await db.select().from(platformAdmins).where(eq(platformAdmins.id, id)).limit(1);
    return row;
  }

  async getPlatformAdminByReplitUserId(replitUserId: string): Promise<PlatformAdmin | undefined> {
    const [row] = await db.select().from(platformAdmins).where(eq(platformAdmins.replitUserId, replitUserId)).limit(1);
    return row;
  }

  async getPlatformAdminByEmail(email: string): Promise<PlatformAdmin | undefined> {
    const [row] = await db.select().from(platformAdmins)
      .where(sql`lower(${platformAdmins.email}) = ${email.toLowerCase()}`)
      .limit(1);
    return row;
  }

  async getPlatformAdmins(): Promise<PlatformAdmin[]> {
    return db.select().from(platformAdmins).orderBy(desc(platformAdmins.createdAt));
  }

  async getApprovedPlatformAdmins(): Promise<PlatformAdmin[]> {
    return db.select().from(platformAdmins)
      .where(eq(platformAdmins.status, "approved"))
      .orderBy(desc(platformAdmins.createdAt));
  }

  async getPendingOrgCount(): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.approvalStatus, "pending"));
    return row?.count ?? 0;
  }

  async createPlatformAdmin(data: InsertPlatformAdmin): Promise<PlatformAdmin> {
    const [created] = await db.insert(platformAdmins).values(data).returning();
    return created;
  }

  async updatePlatformAdmin(id: string, data: Partial<InsertPlatformAdmin>): Promise<PlatformAdmin | undefined> {
    const [updated] = await db.update(platformAdmins).set(data).where(eq(platformAdmins.id, id)).returning();
    return updated;
  }

  async getAllOrgsWithMemberCount(): Promise<Array<User & { memberCount: number }>> {
    const allUsers = await db.select().from(users).orderBy(users.name);
    const allMembers = await db.select({ organizationId: members.organizationId }).from(members);
    const countMap = new Map<string, number>();
    for (const m of allMembers) {
      countMap.set(m.organizationId, (countMap.get(m.organizationId) ?? 0) + 1);
    }
    return allUsers.map(u => ({ ...u, memberCount: countMap.get(u.id) ?? 0 }));
  }

  async getAllOrgsWithStats(): Promise<Array<User & { memberCount: number; orderCount: number; gmv: number; lastActivityAt: string | null }>> {
    const [allUsers, allMembers, orderStats] = await Promise.all([
      db.select().from(users).orderBy(users.name),
      db.select({ organizationId: members.organizationId }).from(members),
      db.execute(sql`
        SELECT org_id,
          COUNT(*) as order_count,
          COALESCE(SUM(CAST(total_amount AS DECIMAL)) FILTER (WHERE status IN ${PLATFORM_GMV_STATUSES}), 0) as gmv,
          MAX(created_at) as last_activity_at
        FROM (
          SELECT restaurant_id as org_id, status, total_amount, created_at FROM orders
          UNION ALL
          SELECT supplier_id as org_id, status, total_amount, created_at FROM orders
        ) t
        GROUP BY org_id
      `),
    ]);

    const countMap = new Map<string, number>();
    for (const m of allMembers) {
      countMap.set(m.organizationId, (countMap.get(m.organizationId) ?? 0) + 1);
    }
    const statMap = new Map<string, { orderCount: number; gmv: number; lastActivityAt: string | null }>();
    for (const r of (orderStats.rows || [])) {
      const row = r as any;
      statMap.set(String(row.org_id), {
        orderCount: Number(row.order_count) || 0,
        gmv: Number(row.gmv) || 0,
        lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null,
      });
    }
    return allUsers.map(u => ({
      ...u,
      memberCount: countMap.get(u.id) ?? 0,
      orderCount: statMap.get(u.id)?.orderCount ?? 0,
      gmv: statMap.get(u.id)?.gmv ?? 0,
      lastActivityAt: statMap.get(u.id)?.lastActivityAt ?? null,
    }));
  }

  async getPlatformOverview(): Promise<{
    totalOrgs: number;
    restaurants: number;
    suppliers: number;
    verifiedOrgs: number;
    pendingOrgs: number;
    totalMembers: number;
    activeMembers: number;
    totalOrders: number;
    ordersThisMonth: number;
    ordersLastMonth: number;
    gmvTotal: number;
    gmvThisMonth: number;
    gmvLastMonth: number;
    openComplaints: number;
    pendingVerifications: number;
  }> {
    const now = new Date();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const activeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [orgRes, memberRes, orderRes, complaintRes] = await Promise.all([
      db.execute(sql`
        SELECT role,
          COUNT(*) as cnt,
          COUNT(*) FILTER (WHERE verified_at IS NOT NULL) as verified
        FROM users GROUP BY role
      `),
      db.execute(sql`
        SELECT COUNT(*) as cnt,
          COUNT(*) FILTER (WHERE last_login_at >= ${activeSince}) as active
        FROM members
      `),
      db.execute(sql`
        SELECT
          COUNT(*) as total_orders,
          COUNT(*) FILTER (WHERE created_at >= ${startThisMonth}) as orders_this_month,
          COUNT(*) FILTER (WHERE created_at >= ${startLastMonth} AND created_at < ${startThisMonth}) as orders_last_month,
          COALESCE(SUM(CAST(total_amount AS DECIMAL)) FILTER (WHERE status IN ${PLATFORM_GMV_STATUSES}), 0) as gmv_total,
          COALESCE(SUM(CAST(total_amount AS DECIMAL)) FILTER (WHERE status IN ${PLATFORM_GMV_STATUSES} AND created_at >= ${startThisMonth}), 0) as gmv_this_month,
          COALESCE(SUM(CAST(total_amount AS DECIMAL)) FILTER (WHERE status IN ${PLATFORM_GMV_STATUSES} AND created_at >= ${startLastMonth} AND created_at < ${startThisMonth}), 0) as gmv_last_month
        FROM orders
      `),
      db.execute(sql`SELECT COUNT(*) as cnt FROM complaints WHERE status IN ('open','in_progress','partially_resolved')`),
    ]);

    let restaurants = 0, suppliers = 0, verifiedOrgs = 0;
    for (const r of (orgRes.rows || [])) {
      const row = r as any;
      const cnt = Number(row.cnt) || 0;
      verifiedOrgs += Number(row.verified) || 0;
      if (row.role === "restaurant") restaurants = cnt;
      else if (row.role === "supplier") suppliers = cnt;
    }
    const totalOrgs = restaurants + suppliers;
    const o = (orderRes.rows?.[0] || {}) as any;

    return {
      totalOrgs,
      restaurants,
      suppliers,
      verifiedOrgs,
      pendingOrgs: totalOrgs - verifiedOrgs,
      pendingVerifications: totalOrgs - verifiedOrgs,
      totalMembers: Number((memberRes.rows?.[0] as any)?.cnt) || 0,
      activeMembers: Number((memberRes.rows?.[0] as any)?.active) || 0,
      totalOrders: Number(o.total_orders) || 0,
      ordersThisMonth: Number(o.orders_this_month) || 0,
      ordersLastMonth: Number(o.orders_last_month) || 0,
      gmvTotal: Number(o.gmv_total) || 0,
      gmvThisMonth: Number(o.gmv_this_month) || 0,
      gmvLastMonth: Number(o.gmv_last_month) || 0,
      openComplaints: Number((complaintRes.rows?.[0] as any)?.cnt) || 0,
    };
  }

  async getPlatformTimeSeries(): Promise<{ month: string; orders: number; gmv: number; newOrgs: number }[]> {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);

    const [orderRes, orgRes] = await Promise.all([
      db.execute(sql`
        SELECT TO_CHAR(created_at, 'YYYY-MM') as month,
          COUNT(*) as orders,
          COALESCE(SUM(CAST(total_amount AS DECIMAL)) FILTER (WHERE status IN ${PLATFORM_GMV_STATUSES}), 0) as gmv
        FROM orders WHERE created_at >= ${from}
        GROUP BY 1
      `),
      db.execute(sql`
        SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as new_orgs
        FROM users WHERE created_at >= ${from}
        GROUP BY 1
      `),
    ]);
    const orderMap = new Map<string, { orders: number; gmv: number }>();
    for (const r of (orderRes.rows || [])) {
      const row = r as any;
      orderMap.set(String(row.month), { orders: Number(row.orders) || 0, gmv: Number(row.gmv) || 0 });
    }
    const orgMap = new Map<string, number>();
    for (const r of (orgRes.rows || [])) {
      const row = r as any;
      orgMap.set(String(row.month), Number(row.new_orgs) || 0);
    }
    const out: { month: string; orders: number; gmv: number; newOrgs: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({
        month: key,
        orders: orderMap.get(key)?.orders ?? 0,
        gmv: orderMap.get(key)?.gmv ?? 0,
        newOrgs: orgMap.get(key) ?? 0,
      });
    }
    return out;
  }

  async getPlatformHealth(): Promise<{
    pendingVerifications: number;
    openComplaints: number;
    pendingAdmins: number;
    lowStockProducts: number;
    unreadMessages: number;
    failedOrderNotifications: number;
  }> {
    const [pendingVerifications, complaintRes, adminRes, lowStockRes, unreadRes] = await Promise.all([
      this.getPendingOrgCount(),
      db.execute(sql`SELECT COUNT(*) as cnt FROM complaints WHERE status IN ('open','in_progress','partially_resolved')`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM platform_admins WHERE status = 'pending'`),
      db.execute(sql`
        SELECT COUNT(*) as cnt FROM products
        WHERE low_stock_threshold > 0 AND COALESCE(stock_quantity, 0) <= low_stock_threshold
      `),
      db.execute(sql`
        SELECT COUNT(*) as cnt FROM messages
        WHERE is_read = false AND dismissed = false
      `),
    ]);
    let failedOrderNotifications = 0;
    try {
      const failedOutboxRes = await db.execute(sql`SELECT COUNT(*) as cnt FROM order_notification_retries WHERE failed_at IS NOT NULL`);
      failedOrderNotifications = Number((failedOutboxRes.rows?.[0] as any)?.cnt) || 0;
    } catch (error: any) {
      // The admin health endpoint remains available during a rolling deployment
      // before the new outbox migration has reached this database.
      if (error?.code !== "42703" && error?.code !== "42P01") throw error;
    }
    return {
      pendingVerifications,
      openComplaints: Number((complaintRes.rows?.[0] as any)?.cnt) || 0,
      pendingAdmins: Number((adminRes.rows?.[0] as any)?.cnt) || 0,
      lowStockProducts: Number((lowStockRes.rows?.[0] as any)?.cnt) || 0,
      unreadMessages: Number((unreadRes.rows?.[0] as any)?.cnt) || 0,
      failedOrderNotifications,
    };
  }

  async getAdminOpenComplaints(): Promise<Array<{
    id: string;
    complaintNumber: string | null;
    title: string;
    status: string;
    priority: string;
    reason: string | null;
    createdAt: string;
    restaurantId: string;
    restaurantName: string;
    supplierId: string;
    supplierName: string;
    orderId: string;
    orderNumber: string | null;
  }>> {
    const result = await db.execute(sql`
      SELECT c.id, c.complaint_number, c.title, c.status, c.priority, c.reason,
        c.created_at, c.order_id, o.order_number,
        c.restaurant_id, COALESCE(r.company_name, r.name) as restaurant_name,
        c.supplier_id, COALESCE(s.company_name, s.name) as supplier_name
      FROM complaints c
      LEFT JOIN users r ON r.id = c.restaurant_id
      LEFT JOIN users s ON s.id = c.supplier_id
      LEFT JOIN orders o ON o.id = c.order_id
      WHERE c.status IN ('open','in_progress','partially_resolved')
      ORDER BY
        CASE WHEN c.priority = 'high' THEN 0 ELSE 1 END,
        c.created_at DESC
    `);
    return (result.rows || []).map((r) => {
      const row = r as any;
      return {
        id: String(row.id),
        complaintNumber: row.complaint_number ?? null,
        title: String(row.title),
        status: String(row.status),
        priority: String(row.priority),
        reason: row.reason ?? null,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        restaurantId: String(row.restaurant_id),
        restaurantName: row.restaurant_name ?? "—",
        supplierId: String(row.supplier_id),
        supplierName: row.supplier_name ?? "—",
        orderId: String(row.order_id),
        orderNumber: row.order_number ?? null,
      };
    });
  }

  async getAdminLowStockProducts(): Promise<Array<{
    id: string;
    name: string;
    unit: string;
    category: string | null;
    stockQuantity: number;
    lowStockThreshold: number;
    supplierId: string;
    supplierName: string;
  }>> {
    const result = await db.execute(sql`
      SELECT p.id, p.name, p.unit, p.category,
        COALESCE(p.stock_quantity, 0) as stock_quantity, p.low_stock_threshold,
        p.supplier_id, COALESCE(s.company_name, s.name) as supplier_name
      FROM products p
      LEFT JOIN users s ON s.id = p.supplier_id
      WHERE p.low_stock_threshold > 0
        AND COALESCE(p.stock_quantity, 0) <= p.low_stock_threshold
      ORDER BY (COALESCE(p.stock_quantity, 0) - p.low_stock_threshold) ASC, p.name ASC
    `);
    return (result.rows || []).map((r) => {
      const row = r as any;
      return {
        id: String(row.id),
        name: String(row.name),
        unit: String(row.unit),
        category: row.category ?? null,
        stockQuantity: Number(row.stock_quantity) || 0,
        lowStockThreshold: Number(row.low_stock_threshold) || 0,
        supplierId: String(row.supplier_id),
        supplierName: row.supplier_name ?? "—",
      };
    });
  }

  async createErrorLog(entry: InsertErrorLog): Promise<void> {
    await db.insert(errorLogs).values(entry);
  }

  async getErrorLogs(filter?: { level?: string; source?: string; status?: string; limit?: number }): Promise<ErrorLog[]> {
    const conditions = [];
    if (filter?.level) conditions.push(eq(errorLogs.level, filter.level));
    if (filter?.source) conditions.push(eq(errorLogs.source, filter.source));
    if (filter?.status) conditions.push(eq(errorLogs.status, filter.status));
    const limit = Math.min(Math.max(filter?.limit ?? 200, 1), 500);
    const query = db.select().from(errorLogs);
    const rows = conditions.length
      ? await query.where(and(...conditions)).orderBy(desc(errorLogs.createdAt)).limit(limit)
      : await query.orderBy(desc(errorLogs.createdAt)).limit(limit);
    return rows;
  }

  async updateErrorLogStatus(id: string, status: string): Promise<void> {
    await db.update(errorLogs).set({ status }).where(eq(errorLogs.id, id));
  }

  async closeAllErrorLogs(): Promise<number> {
    const rows = await db
      .update(errorLogs)
      .set({ status: "closed" })
      .where(ne(errorLogs.status, "closed"))
      .returning({ id: errorLogs.id });
    return rows.length;
  }

  async clearErrorLogs(): Promise<void> {
    await db.delete(errorLogs);
  }

  async getOrgNotes(organizationId: string): Promise<OrgNote[]> {
    return await db
      .select()
      .from(orgNotes)
      .where(eq(orgNotes.organizationId, organizationId))
      .orderBy(desc(orgNotes.createdAt));
  }

  async createOrgNote(note: InsertOrgNote): Promise<OrgNote> {
    const [created] = await db.insert(orgNotes).values(note).returning();
    return created;
  }

  async deleteOrgNote(id: string, organizationId: string): Promise<void> {
    await db.delete(orgNotes).where(and(eq(orgNotes.id, id), eq(orgNotes.organizationId, organizationId)));
  }

  async setMemberVerified(memberId: string, organizationId: string, verified: boolean): Promise<Member | null> {
    const [updated] = await db
      .update(members)
      .set({ emailVerifiedAt: verified ? new Date() : null })
      .where(and(eq(members.id, memberId), eq(members.organizationId, organizationId)))
      .returning();
    return updated ?? null;
  }

  async getPlatformRecentActivity(limit = 12): Promise<Array<{
    type: "org" | "order" | "complaint";
    id: string;
    title: string;
    subtitle: string;
    role?: string;
    status?: string;
    createdAt: string;
    link: string;
  }>> {
    const [orgRes, orderRes, complaintRes] = await Promise.all([
      db.execute(sql`
        SELECT id, COALESCE(company_name, name) as name, role, created_at
        FROM users ORDER BY created_at DESC LIMIT ${limit}
      `),
      db.execute(sql`
        SELECT o.id, o.order_number, o.status, o.total_amount, o.created_at,
          o.restaurant_id, o.supplier_id,
          COALESCE(r.company_name, r.name) as restaurant_name,
          COALESCE(s.company_name, s.name) as supplier_name
        FROM orders o
        LEFT JOIN users r ON r.id = o.restaurant_id
        LEFT JOIN users s ON s.id = o.supplier_id
        ORDER BY o.created_at DESC LIMIT ${limit}
      `),
      db.execute(sql`
        SELECT c.id, c.complaint_number, c.title, c.status, c.created_at,
          c.restaurant_id,
          COALESCE(r.company_name, r.name) as restaurant_name
        FROM complaints c
        LEFT JOIN users r ON r.id = c.restaurant_id
        ORDER BY c.created_at DESC LIMIT ${limit}
      `),
    ]);

    const items: Array<{
      type: "org" | "order" | "complaint";
      id: string;
      title: string;
      subtitle: string;
      role?: string;
      status?: string;
      createdAt: string;
      link: string;
    }> = [];

    for (const r of (orgRes.rows || [])) {
      const row = r as any;
      items.push({
        type: "org",
        id: String(row.id),
        title: String(row.name),
        subtitle: row.role === "restaurant" ? "Neues Restaurant" : "Neuer Lieferant",
        role: row.role,
        createdAt: new Date(row.created_at).toISOString(),
        link: `/admin/orgs/${row.id}`,
      });
    }
    for (const r of (orderRes.rows || [])) {
      const row = r as any;
      items.push({
        type: "order",
        id: String(row.id),
        title: `Bestellung ${row.order_number ? `#${row.order_number}` : ""}`.trim(),
        subtitle: `${row.restaurant_name ?? "?"} → ${row.supplier_name ?? "?"} · ${Number(row.total_amount).toFixed(2)} €`,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        link: `/admin/orgs/${row.restaurant_id ?? row.supplier_id ?? row.id}`,
      });
    }
    for (const r of (complaintRes.rows || [])) {
      const row = r as any;
      items.push({
        type: "complaint",
        id: String(row.id),
        title: `Reklamation ${row.complaint_number ? `#${row.complaint_number}` : ""}`.trim(),
        subtitle: `${row.restaurant_name ?? "?"} · ${row.title ?? ""}`,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        link: `/admin/orgs/${row.restaurant_id ?? row.id}`,
      });
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items.slice(0, limit);
  }

  async getTopOrganizations(): Promise<{
    topSuppliers: { id: string; name: string; orders: number; revenue: number }[];
    topRestaurants: { id: string; name: string; orders: number; spend: number }[];
  }> {
    const [supRes, restRes] = await Promise.all([
      db.execute(sql`
        SELECT o.supplier_id as id,
          MAX(COALESCE(u.company_name, u.name)) as name,
          COUNT(*) as orders,
          COALESCE(SUM(CAST(o.total_amount AS DECIMAL)), 0) as revenue
        FROM orders o
        LEFT JOIN users u ON u.id = o.supplier_id
        WHERE o.status IN ${PLATFORM_GMV_STATUSES}
        GROUP BY o.supplier_id
        ORDER BY revenue DESC LIMIT 5
      `),
      db.execute(sql`
        SELECT o.restaurant_id as id,
          MAX(COALESCE(u.company_name, u.name)) as name,
          COUNT(*) as orders,
          COALESCE(SUM(CAST(o.total_amount AS DECIMAL)), 0) as spend
        FROM orders o
        LEFT JOIN users u ON u.id = o.restaurant_id
        WHERE o.status IN ${PLATFORM_GMV_STATUSES}
        GROUP BY o.restaurant_id
        ORDER BY spend DESC LIMIT 5
      `),
    ]);
    return {
      topSuppliers: (supRes.rows || []).map((r: any) => ({
        id: String(r.id), name: String(r.name ?? "?"), orders: Number(r.orders) || 0, revenue: Number(r.revenue) || 0,
      })),
      topRestaurants: (restRes.rows || []).map((r: any) => ({
        id: String(r.id), name: String(r.name ?? "?"), orders: Number(r.orders) || 0, spend: Number(r.spend) || 0,
      })),
    };
  }

  async getAdminOrgStats(orgId: string): Promise<{
    role: "restaurant" | "supplier";
    totalOrders: number;
    gmv: number;
    avgOrderValue: number;
    activePartners: number;
    openComplaints: number;
    productCount: number;
    lowStockCount: number;
    ratingAvg: number | null;
    ratingCount: number;
    lastOrderAt: string | null;
    monthly: { month: string; orders: number; gmv: number }[];
    ordersByStatus: { status: string; count: number }[];
    topPartners: { id: string; name: string; orders: number; amount: number }[];
  } | null> {
    const org = await this.getUser(orgId);
    if (!org) return null;
    const isSupplier = org.role === "supplier";
    const selfCol = isSupplier ? sql`supplier_id` : sql`restaurant_id`;
    const partnerCol = isSupplier ? sql`restaurant_id` : sql`supplier_id`;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);

    const [aggRes, monthlyRes, statusRes, partnerRes, productRes] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*) as total_orders,
          COALESCE(SUM(CAST(total_amount AS DECIMAL)) FILTER (WHERE status IN ${PLATFORM_GMV_STATUSES}), 0) as gmv,
          COUNT(DISTINCT ${partnerCol}) FILTER (WHERE status IN ${PLATFORM_GMV_STATUSES}) as active_partners
        FROM orders WHERE ${selfCol} = ${orgId}
      `),
      db.execute(sql`
        SELECT TO_CHAR(created_at, 'YYYY-MM') as month,
          COUNT(*) as orders,
          COALESCE(SUM(CAST(total_amount AS DECIMAL)) FILTER (WHERE status IN ${PLATFORM_GMV_STATUSES}), 0) as gmv
        FROM orders WHERE ${selfCol} = ${orgId} AND created_at >= ${from}
        GROUP BY 1
      `),
      db.execute(sql`
        SELECT status, COUNT(*) as count
        FROM orders WHERE ${selfCol} = ${orgId}
        GROUP BY status
      `),
      db.execute(sql`
        SELECT o.${partnerCol} as id,
          MAX(COALESCE(u.company_name, u.name)) as name,
          COUNT(*) as orders,
          COALESCE(SUM(CAST(o.total_amount AS DECIMAL)), 0) as amount
        FROM orders o
        LEFT JOIN users u ON u.id = o.${partnerCol}
        WHERE o.${selfCol} = ${orgId} AND o.status IN ${PLATFORM_GMV_STATUSES}
        GROUP BY o.${partnerCol}
        ORDER BY amount DESC LIMIT 5
      `),
      isSupplier
        ? db.execute(sql`
            SELECT COUNT(*) as product_count,
              COUNT(*) FILTER (WHERE low_stock_threshold > 0 AND COALESCE(stock_quantity, 0) <= low_stock_threshold) as low_stock_count
            FROM products WHERE supplier_id = ${orgId}
          `)
        : Promise.resolve({ rows: [{ product_count: 0, low_stock_count: 0 }] } as any),
    ]);

    const [complaintRes, ratingRes, lastOrderRes] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) as cnt FROM complaints
        WHERE ${selfCol} = ${orgId} AND status IN ('open','in_progress','partially_resolved')
      `),
      isSupplier
        ? db.execute(sql`
            SELECT AVG(stars) as avg_stars, COUNT(*) as cnt
            FROM supplier_ratings WHERE supplier_id = ${orgId}
          `)
        : Promise.resolve({ rows: [{ avg_stars: null, cnt: 0 }] } as any),
      db.execute(sql`
        SELECT MAX(created_at) as last_order_at FROM orders WHERE ${selfCol} = ${orgId}
      `),
    ]);

    const agg = (aggRes.rows?.[0] || {}) as any;
    const totalOrders = Number(agg.total_orders) || 0;
    const gmv = Number(agg.gmv) || 0;
    const validOrderCount = (statusRes.rows || []).reduce((sum, r: any) => {
      const valid = ["delivered", "confirmed", "in_delivery"];
      return valid.includes(String(r.status)) ? sum + (Number(r.count) || 0) : sum;
    }, 0);

    const monthlyMap = new Map<string, { orders: number; gmv: number }>();
    for (const r of (monthlyRes.rows || [])) {
      const row = r as any;
      monthlyMap.set(String(row.month), { orders: Number(row.orders) || 0, gmv: Number(row.gmv) || 0 });
    }
    const monthly: { month: string; orders: number; gmv: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly.push({ month: key, orders: monthlyMap.get(key)?.orders ?? 0, gmv: monthlyMap.get(key)?.gmv ?? 0 });
    }

    const prod = (productRes.rows?.[0] || {}) as any;

    return {
      role: org.role,
      totalOrders,
      gmv,
      avgOrderValue: validOrderCount > 0 ? gmv / validOrderCount : 0,
      activePartners: Number(agg.active_partners) || 0,
      openComplaints: Number((complaintRes.rows?.[0] as any)?.cnt) || 0,
      productCount: Number(prod.product_count) || 0,
      lowStockCount: Number(prod.low_stock_count) || 0,
      ratingAvg: (ratingRes.rows?.[0] as any)?.avg_stars != null ? Number((ratingRes.rows?.[0] as any).avg_stars) : null,
      ratingCount: Number((ratingRes.rows?.[0] as any)?.cnt) || 0,
      lastOrderAt: (lastOrderRes.rows?.[0] as any)?.last_order_at ? new Date((lastOrderRes.rows?.[0] as any).last_order_at).toISOString() : null,
      monthly,
      ordersByStatus: (statusRes.rows || []).map((r: any) => ({ status: String(r.status), count: Number(r.count) || 0 })),
      topPartners: (partnerRes.rows || []).map((r: any) => ({
        id: String(r.id), name: String(r.name ?? "?"), orders: Number(r.orders) || 0, amount: Number(r.amount) || 0,
      })),
    };
  }
}

export const storage = new DatabaseStorage();
