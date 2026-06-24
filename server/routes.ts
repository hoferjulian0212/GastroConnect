import type { Express, Request } from "express";
import express from "express";
import { createServer, type Server } from "http";
import path from "path";
import { storage } from "./storage";
import { db } from "./db";
import { applyBucketMovement, getReservedRemainingByProduct, InsufficientStockError } from "./stockBuckets";
import { orders, messages, orderStatusHistory, complaints, orderItems, users, overnightStays, costSettings, minimumOrderValues, products, stockMovements, conversations, documents, promotions, priceChangeLog, formatOrderNumber, formatComplaintNumber } from "@shared/schema";
import { eq, and, desc, asc, sql, or, ilike, gte, lte, ne, inArray } from "drizzle-orm";
import { insertProductSchema as _insertProductSchema, insertCartItemSchema as _insertCartItemSchema, insertMessageSchema, insertComplaintSchema as _insertComplaintSchema, updateComplaintSchema as _updateComplaintSchema, insertComplaintCommentSchema as _insertComplaintCommentSchema, insertNotificationSchema as _insertNotificationSchema, insertPromotionSchema as _insertPromotionSchema, confirmOrderSchema, insertCustomMinOrderQuantitySchema as _insertCustomMinOrderQuantitySchema, insertCustomPriceSchema as _insertCustomPriceSchema, dashboardLayoutSchema, dashboardWidgetsSchema, dashboardTemplatesPayloadSchema, insertSupplierRatingSchema, updateSupplierRatingSchema, notificationPrefsSchema, DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs, insertMemberSchema, insertVertreterAssignmentSchema, MEMBER_ROLES, clientErrorReportSchema, insertInventoryRiskRecordSchema, INVENTORY_RISK_STATUSES, INVENTORY_RISK_QUALITY } from "@shared/schema";
import { can, type Capability } from "@shared/permissions";
import { sendPushNotification, VAPID_PUBLIC_KEY } from "./pushService";
import { generateAndStoreMonthlyReport, computeMonthlyReport } from "./monthlyReportService";
import { getPmsProviderAdapter } from "./pmsProviders";
import { getErpProviderAdapter } from "./erpProviders";
import { isErpCredentialsKeyConfigured, maskHint } from "./erpCrypto";
import { runSyncForConnection, startErpSyncScheduler, testErpConnection, ErpSyncRunningError, ErpSyncConfigError } from "./erpSync";
import { sendAdminEmail, isAdminEmailConfigured } from "./adminNotify";
import { sendEmail, renderNotificationEmail } from "./emailService";
import { registerAuthRoutes } from "./auth/routes";
import { registerAdminAuthRoutes, bootstrapPlatformAdmin, bootstrapDemoWarehouseMember } from "./auth/adminAuth";
import { geocodeAddress, backfillMissingCoordinates, isGeocodingConfigured } from "./geocoding";

// Sentinel used inside the atomic order-edit transaction to signal the order
// is no longer pending (detected after taking the row lock) so we can roll back
// and return a clean 400.
class OrderNotPendingError extends Error {
  constructor() {
    super("Order is not pending");
    this.name = "OrderNotPendingError";
  }
}

const insertProductSchema = _insertProductSchema.strict();
const insertCartItemSchema = _insertCartItemSchema.strict();
const insertComplaintSchema = _insertComplaintSchema.strict();
const updateComplaintSchema = _updateComplaintSchema.strict();
const insertComplaintCommentSchema = _insertComplaintCommentSchema.strict();
const insertNotificationSchema = _insertNotificationSchema.strict();
const insertPromotionSchema = _insertPromotionSchema.strict();
const insertCustomMinOrderQuantitySchema = _insertCustomMinOrderQuantitySchema.strict();
const insertCustomPriceSchema = _insertCustomPriceSchema.strict();
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerOcrImportRoutes } from "./ocrImport";
import { registerAiSearchRoutes } from "./aiSearch";
import { objectStorageClient, ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import PDFDocument from "pdfkit";
import { randomUUID, timingSafeEqual } from "crypto";
import { z } from "zod";

import type { InsertNotification, OrderWithDetails, Document } from "@shared/schema";

// Ensures a delivery note PDF exists for an order. Creates and uploads it if
// missing, otherwise returns the existing one. `created` signals whether a new
// note was generated so callers can avoid duplicate chat messages.
async function ensureDeliveryNoteForOrder(
  order: OrderWithDetails,
): Promise<{ document: Document; created: boolean }> {
  const existingDocs = await storage.getDocumentsByOrder(order.id);
  const existingNote = existingDocs.find((d) => d.type === "delivery_note" && !d.isUpload);
  if (existingNote) {
    return { document: existingNote, created: false };
  }

  const pdfBuffer = await generateDeliveryNotePDF(order);
  const objectService = new ObjectStorageService();
  const privateDir = objectService.getPrivateObjectDir();
  const fileId = randomUUID();
  const fullPath = `${privateDir}/documents/${fileId}.pdf`;
  const pathParts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
  const bucketName = pathParts[0];
  const objectName = pathParts.slice(1).join("/");
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(pdfBuffer, {
    contentType: "application/pdf",
    metadata: { contentType: "application/pdf" },
  });

  const objectPath = `/objects/documents/${fileId}.pdf`;
  try {
    const document = await storage.createDocument({
      orderId: order.id,
      type: "delivery_note",
      title: `Lieferschein (${formatOrderNumber(order)})`,
      fileUrl: objectPath,
      restaurantId: order.restaurantId,
      supplierId: order.supplierId,
    });
    return { document, created: true };
  } catch (err: any) {
    // Concurrent caller won the race: a unique constraint
    // (uq_documents_delivery_note_per_order) blocks the duplicate insert.
    // Re-fetch the existing note and report it as not newly created.
    if (err?.code === "23505") {
      const docs = await storage.getDocumentsByOrder(order.id);
      const note = docs.find((d) => d.type === "delivery_note" && !d.isUpload);
      if (note) return { document: note, created: false };
    }
    throw err;
  }
}

// Posts a delivery-note document card into the order's chat thread.
async function postDeliveryNoteChatMessage(
  order: OrderWithDetails,
  document: Document,
): Promise<void> {
  const conversation = await storage.getOrCreateConversation(order.restaurantId, order.supplierId);
  await storage.sendMessage({
    conversationId: conversation.id,
    senderId: order.supplierId,
    messageType: "document",
    content: JSON.stringify({
      documentId: document.id,
      title: document.title,
      type: "delivery_note",
      orderId: order.id,
      orderNumber: formatOrderNumber(order),
      fileUrl: document.fileUrl,
      supplierName: order.supplier?.companyName || order.supplier?.name || "",
      totalAmount: order.totalAmount,
      itemCount: order.items?.length ?? 0,
      deliveryDate: new Date(document.createdAt).toISOString().slice(0, 10),
    }),
    orderId: order.id,
    documentUrl: document.fileUrl,
  });
}

async function createNotificationWithPush(notification: InsertNotification, role?: string) {
  const created = await storage.createNotification(notification);
  const urlRole = role || "restaurant";
  let url = "/";
  switch (notification.type) {
    case "new_order":
    case "order_status":
      url = `/${urlRole}/orders?orderId=${notification.referenceId}`;
      break;
    case "new_message":
      url = `/${urlRole}/inbox?conversationId=${notification.referenceId}`;
      break;
    case "new_complaint":
    case "complaint_comment":
      url = `/${urlRole}/complaints?complaintId=${notification.referenceId}`;
      break;
    case "low_stock":
      url = `/${urlRole}/inventory`;
      break;
    case "monthly_report":
      url = `/restaurant/monthly-reports?reportId=${notification.referenceId}`;
      break;
    case "pms_request":
      url = `/${urlRole}/cost-analysis`;
      break;
    case "erp_request":
    case "erp_sync_failed":
      url = `/${urlRole}/inventory`;
      break;
    case "whatsapp_request":
      url = `/${urlRole}/inbox`;
      break;
  }
  // Load the recipient once and reuse for both channel gating + email address.
  let recipient: Awaited<ReturnType<typeof storage.getUser>> | undefined;
  try {
    recipient = await storage.getUser(notification.userId);
  } catch (err: any) {
    console.error("[notify] failed to load recipient", { userId: notification.userId, error: err?.message });
  }
  const prefs = (recipient?.notificationPrefs as NotificationPrefs | null | undefined) ?? DEFAULT_NOTIFICATION_PREFS;
  const prefKey = notificationPrefKey(notification.type);

  const pushAllowed = prefKey ? (prefs.push?.[prefKey] ?? DEFAULT_NOTIFICATION_PREFS.push[prefKey]) : true;
  if (pushAllowed) {
    sendPushNotification(notification.userId, {
      title: notification.title,
      message: notification.message,
      url,
      type: notification.type,
    }).catch((err) => {
      console.error("[push] createNotificationWithPush dispatch failed", {
        userId: notification.userId,
        type: notification.type,
        referenceId: notification.referenceId,
        error: err?.message ?? String(err),
      });
    });
  }

  const emailAllowed = prefKey ? (prefs.email?.[prefKey] ?? DEFAULT_NOTIFICATION_PREFS.email[prefKey]) : true;
  if (emailAllowed && recipient?.email) {
    sendEmail({
      to: recipient.email,
      subject: notification.title,
      html: renderNotificationEmail({
        title: notification.title,
        message: notification.message,
        linkPath: url,
      }),
    }).catch((err) => {
      console.error("[email] createNotificationWithPush dispatch failed", {
        userId: notification.userId,
        type: notification.type,
        referenceId: notification.referenceId,
        error: err?.message ?? String(err),
      });
    });
  }
  return created;
}

// Maps a notification type to the per-channel preference key it is gated by.
// Types not listed here are operational/important and are always delivered.
function notificationPrefKey(type: string): keyof NotificationPrefs["push"] | null {
  switch (type) {
    case "new_order":
      return "newOrder";
    case "order_status":
      return "orderStatus";
    case "new_message":
      return "newMessage";
    case "new_complaint":
    case "complaint_comment":
      return "complaint";
    default:
      return null;
  }
}

// ===== ORDER WORKFLOW HELPERS (Task #9) =====

/**
 * Returns true if the order has an unresolved (open) change request from the
 * restaurant that the supplier has not yet approved or denied. Counts
 * `change_request` messages and decrements on `change_request_response`.
 */
async function hasOpenChangeRequest(orderId: string): Promise<boolean> {
  const rows = await db
    .select({ content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.orderId, orderId), eq(messages.messageType, "order_change_request")))
    .orderBy(asc(messages.createdAt));
  let open = 0;
  for (const r of rows) {
    try {
      const c = JSON.parse(r.content);
      if (c?.type === "change_request") {
        open++;
      } else if (c?.type === "change_request_response") {
        // Clamp at 0: stray response messages without a preceding open request
        // must not push the counter negative (otherwise a later real request
        // would appear closed).
        if (open > 0) open--;
      }
    } catch {}
  }
  return open > 0;
}

type OrderForTransition = {
  id: string;
  supplierId: string;
  items: Array<{ id: string; productId: string; productName: string; quantity: number; confirmedQuantity?: number | null; unitPrice: string }>;
};

type StockMovementType = "order_reserved" | "order_returned" | "order_outbounded";

interface TransitionOpts {
  order: OrderForTransition;
  newStatus: string;
  previousStatus: string;
  changedBy?: string | null;
  changedByMemberId?: string | null;
  actorName?: string | null;
  /** When set, write stock movements + adjust product stock atomically with the status change. */
  movementType?: StockMovementType | null;
  noteFn?: (item: OrderForTransition["items"][number], qty: number) => string;
  /** Per-orderItemId confirmedQuantity overrides (partial confirmation). */
  confirmedQuantitiesByItemId?: Record<string, number>;
  totalAmountOverride?: string;
  requestedDeliveryDate?: string | null;
  deliveryNotes?: string | null;
  /**
   * Optional additional work to run inside the same DB transaction (e.g.
   * writing a chat message that must atomically accompany the status change).
   */
  txExtra?: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>;
}

/**
 * Atomically updates an order's status, history, optional per-item confirmed
 * quantities, optional totalAmount and the related stock movements & product
 * stock adjustments — all in a single DB transaction. Idempotent for stock:
 * skips stock writes when a movement of the same `movementType` already exists
 * for this order.
 */
class OrderTransitionConflictError extends Error {
  constructor(public actualStatus: string | null, public expectedStatus: string) {
    super(`Order status changed concurrently: expected ${expectedStatus}, found ${actualStatus}`);
    this.name = "OrderTransitionConflictError";
  }
}

async function transitionOrderWithStock(opts: TransitionOpts) {
  return await db.transaction(async (tx) => {
    // Lock the order row to serialize concurrent transitions on the same
    // order. Without this, two simultaneous confirms could both pass the
    // stock-movement gate and double-deduct inventory.
    const locked = await tx.execute<{ status: string | null }>(
      sql`SELECT status FROM ${orders} WHERE id = ${opts.order.id} FOR UPDATE`
    );
    const lockedRow = locked.rows[0];
    const actualStatus: string | null = lockedRow?.status ?? null;
    if (actualStatus !== opts.previousStatus) {
      throw new OrderTransitionConflictError(actualStatus, opts.previousStatus);
    }

    const setData: Partial<typeof orders.$inferInsert> = {
      status: opts.newStatus as typeof orders.$inferInsert.status,
      updatedAt: new Date(),
    };
    if (opts.requestedDeliveryDate !== undefined) setData.requestedDeliveryDate = opts.requestedDeliveryDate;
    if (opts.deliveryNotes !== undefined) setData.deliveryNotes = opts.deliveryNotes;
    if (opts.totalAmountOverride !== undefined) setData.totalAmount = opts.totalAmountOverride;

    const [updated] = await tx.update(orders).set(setData).where(eq(orders.id, opts.order.id)).returning();
    if (!updated) throw new Error("Order not found");

    await tx.insert(orderStatusHistory).values({
      orderId: opts.order.id,
      fromStatus: opts.previousStatus,
      toStatus: opts.newStatus,
      changedBy: opts.changedBy ?? null,
      changedByMemberId: opts.changedByMemberId ?? null,
    });

    if (opts.confirmedQuantitiesByItemId) {
      for (const [itemId, q] of Object.entries(opts.confirmedQuantitiesByItemId)) {
        const item = opts.order.items.find(i => i.id === itemId);
        const rejected = item ? Math.max(0, item.quantity - q) : 0;
        await tx.update(orderItems)
          .set({ confirmedQuantity: q, rejectedQuantity: rejected })
          .where(eq(orderItems.id, itemId));
      }
    }

    // Three-bucket stock movements (ITI model). order_returned / order_outbounded
    // release exactly what is still reserved (ITI) for this order, computed from
    // its own bucket movements. This is naturally idempotent: an already-released
    // order has 0 remaining and produces no further movement.
    if (opts.movementType === "order_returned" || opts.movementType === "order_outbounded") {
      const remaining = await getReservedRemainingByProduct(tx, opts.order.id);
      for (const [productId, qty] of remaining) {
        if (qty <= 0) continue;
        const item = opts.order.items.find(i => i.productId === productId);
        await applyBucketMovement(tx, {
          orderId: opts.order.id,
          supplierId: opts.order.supplierId,
          productId,
          productName: item?.productName ?? "",
          type: opts.movementType,
          qty,
          actorId: opts.changedBy ?? opts.order.supplierId,
          actorName: opts.actorName ?? null,
          note: item && opts.noteFn ? opts.noteFn(item, qty) : "",
        });
      }
    }

    if (opts.txExtra) {
      await opts.txExtra(tx);
    }

    return updated;
  });
}

const uuidField = z.string().min(1).max(100);
const safeString = z.string().max(5000);
const safeShortString = z.string().max(500);

const updateUserSchema = z.object({
  name: safeShortString.optional(),
  email: z.string().email().max(254).optional(),
  phone: safeShortString.optional().nullable(),
  address: safeShortString.optional().nullable(),
  city: safeShortString.optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  companyName: safeShortString.optional().nullable(),
  description: safeString.optional().nullable(),
  profileImageUrl: safeString.optional().nullable(),
  language: z.enum(["de", "it"]).optional(),
}).strict();

const updateProductSchema = z.object({
  articleNumber: safeShortString.optional().nullable(),
  gtin: safeShortString.optional().nullable(),
  name: safeShortString.optional(),
  description: safeString.optional().nullable(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  unit: safeShortString.optional(),
  category: safeShortString.optional().nullable(),
  inStock: z.boolean().optional(),
  // stockQuantity is intentionally NOT updatable here: stock changes must go
  // through the audited stock-movement path (POST /api/stock-movements) so the
  // history stays accurate. Initial stock is set at product creation only.
  lowStockThreshold: z.number().int().min(0).max(999999).optional(),
  minOrderQuantity: z.number().int().min(1).max(999999).optional(),
  imageUrl: safeString.optional().nullable(),
}).strict();

const stockMovementSchema = z.object({
  productId: uuidField,
  supplierId: uuidField,
  userId: uuidField.optional(),
  type: z.enum(["manual_in", "manual_out", "manual_set"]),
  quantity: z.number().int().min(0).max(999999),
  note: safeString.optional(),
}).strict();

const updatePromotionSchema = z.object({
  productId: uuidField.optional(),
  discountPercent: z.number().int().min(1).max(100).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isActive: z.boolean().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  groupId: z.string().optional(),
  targetRestaurantIds: z.array(z.string()).optional(),
});

const timeField = z.string().regex(/^\d{2}:\d{2}$/).optional().nullable();
const deliveryScheduleSchema = z.object({
  supplierId: uuidField,
  restaurantId: uuidField,
  days: z.array(z.object({
    day: z.number().int().min(0).max(6),
    timeFrom: timeField,
    timeTo: timeField,
  })).max(7),
}).strict();

const updateCartQuantitySchema = z.object({
  quantity: z.number().int().min(1).max(9999),
}).strict();

const createOrderSchema = z.object({
  restaurantId: uuidField,
  supplierId: uuidField.optional().nullable(),
  notes: safeString.optional().nullable(),
  requestedDeliveryDate: safeShortString.optional().nullable(),
  deliveryDates: z.record(z.string(), z.string().nullable()).optional().nullable(),
  perSupplierNotes: z.record(z.string(), safeString).optional().nullable(),
  createdByUserId: uuidField.optional().nullable(),
  actingMemberId: uuidField.optional().nullable(),
}).strict();

const directOrderItemSchema = z.object({
  productId: uuidField,
  quantity: z.number().int().min(1).max(9999),
});

const directOrderSchema = z.object({
  restaurantId: uuidField,
  supplierId: uuidField,
  items: z.array(directOrderItemSchema).min(1).max(200),
  notes: safeString.optional().nullable(),
  createdByUserId: uuidField.optional().nullable(),
  actingMemberId: uuidField.optional().nullable(),
}).strict();

const reorderSchema = z.object({
  restaurantId: uuidField,
}).strict();

const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"]),
  changedBy: uuidField.optional(),
  actingMemberId: uuidField.optional().nullable(),
  requestedDeliveryDate: safeShortString.optional().nullable(),
  deliveryNotes: safeString.optional().nullable(),
}).strict();

// Edit endpoint accepts a minimal payload: productId + quantity. The server
// recomputes productName and unitPrice from product master data + active
// promotions, so the legacy productName/unitPrice fields are accepted but
// ignored (kept optional for backward-compatibility with older clients).
const editOrderItemSchema = z.object({
  productId: uuidField,
  quantity: z.number().int().min(1).max(9999),
  productName: safeShortString.optional(),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
});

const editOrderItemsSchema = z.object({
  items: z.array(editOrderItemSchema).min(1).max(200),
  restaurantId: uuidField,
  requestedDeliveryDate: safeShortString.optional().nullable(),
}).strict();

const changeRequestSchema = z.object({
  restaurantId: uuidField,
  reason: safeString.optional(),
}).strict();

const changeRequestRespondSchema = z.object({
  supplierId: uuidField.optional(),
  approved: z.boolean(),
}).strict();

const sendMessageSchema = z.object({
  senderId: uuidField,
  senderMemberId: uuidField.optional().nullable(),
  content: z.string().min(0).max(50000),
  messageType: z.enum(["text", "order", "complaint", "confirmation", "delivery_status", "document", "attachment", "order_change_request", "voice"]).optional(),
  priority: z.enum(["standard", "important"]).optional(),
  audioUrl: z.string().max(2048).optional(),
  audioDurationMs: z.number().int().min(0).max(60 * 60 * 1000).optional(),
}).strict().refine(
  (d) => d.messageType !== "voice" || (!!d.audioUrl && d.audioUrl.length > 0),
  { message: "audioUrl is required for voice messages", path: ["audioUrl"] }
).refine(
  (d) => {
    const t = d.messageType ?? "text";
    if (t === "voice" || t === "attachment") return true;
    return d.content.trim().length > 0;
  },
  { message: "content must not be empty", path: ["content"] }
);

const markReadSchema = z.object({
  userId: uuidField,
}).strict();

const createConversationSchema = z.object({
  restaurantId: uuidField,
  supplierId: uuidField,
}).strict();

const attachmentRequestSchema = z.object({
  name: safeShortString.min(1),
  size: z.number().int().min(0).max(10 * 1024 * 1024).optional(),
  contentType: z.string().min(1).max(100),
  conversationId: uuidField,
  senderId: uuidField,
}).strict();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);
  // AI-powered OCR price-list import (supplier)
  registerOcrImportRoutes(app);
  registerAiSearchRoutes(app);
  // Authentication & onboarding endpoints (login/logout/me, password reset, invite/claim)
  registerAuthRoutes(app);
  // Platform admin panel (email + password auth + admin CRUD)
  registerAdminAuthRoutes(app);

  // Client-side error reporting. Public + write-rate-limited so the browser can
  // record frontend crashes for platform admins to inspect later. Best-effort:
  // never surfaces a hard failure to the client.
  app.post("/api/client-errors", async (req, res) => {
    try {
      const parsed = clientErrorReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_report" });
      }
      await storage.createErrorLog({
        level: "error",
        source: "client",
        message: parsed.data.message.slice(0, 2000),
        stack: parsed.data.stack ? parsed.data.stack.slice(0, 10000) : null,
        method: null,
        path: parsed.data.path ? parsed.data.path.slice(0, 500) : null,
        statusCode: null,
        userId: req.auth?.organizationId ?? null,
        memberId: req.auth?.memberId ?? null,
        userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
        context: parsed.data.context ?? null,
      });
      res.status(204).end();
    } catch {
      res.status(204).end();
    }
  });

  // Serve static images from client/public - ensures images work in both dev and production
  const clientPublicPath = path.resolve(process.cwd(), "client", "public");
  app.use("/images", express.static(path.join(clientPublicPath, "images"), {
    maxAge: "1d",
    immutable: true,
  }));
  app.use("/favicon.png", express.static(path.join(clientPublicPath, "favicon.png")));

  // Apply the email-verification schema + backfill (idempotent, always runs so
  // existing environments get the new column/table and existing accounts are
  // not locked out by the login email-gate).
  await storage.runEmailVerificationMigration();
  await storage.runAdminMigration();
  // Provision the owner platform-admin from PLATFORM_ADMIN_EMAIL/PASSWORD (idempotent)
  await bootstrapPlatformAdmin();
  // Seed data on startup
  await storage.seedData();
  // Ensure every organization has at least an Admin member (idempotent)
  await storage.backfillMembers();
  // Provision a working demo warehouse-worker login on Hans's supplier org (idempotent)
  await bootstrapDemoWarehouseMember();
  // Ensure the standard PMS providers exist (idempotent)
  await storage.ensurePmsProviders();
  // Ensure the standard ERP providers exist (idempotent)
  await storage.ensureErpProviders();
  // Start the automatic ERP catalog sync scheduler (1-minute tick).
  startErpSyncScheduler();
  // Backfill article numbers for any existing products that lack one
  try {
    const backfilled = await storage.backfillArticleNumbers();
    if (backfilled > 0) console.log(`Backfilled article numbers for ${backfilled} product(s).`);
  } catch (err) {
    console.error("Article number backfill failed:", err);
  }
  // Backfill order numbers (each order gets ONE unique business-facing number)
  try {
    const backfilledOrders = await storage.backfillOrderNumbers();
    if (backfilledOrders > 0) console.log(`Backfilled order numbers for ${backfilledOrders} order(s).`);
  } catch (err) {
    console.error("Order number backfill failed:", err);
  }
  // Backfill complaint numbers (each complaint gets ONE unique business-facing number)
  try {
    const backfilledComplaints = await storage.backfillComplaintNumbers();
    if (backfilledComplaints > 0) console.log(`Backfilled complaint numbers for ${backfilledComplaints} complaint(s).`);
  } catch (err) {
    console.error("Complaint number backfill failed:", err);
  }

  // ===== GLOBAL SEARCH (Task #36) =====
  app.get("/api/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const role = req.auth.org.role;
      const empty = { orders: [], products: [], partners: [], messages: [], complaints: [], documents: [] };
      if (role !== "restaurant" && role !== "supplier") return res.json(empty);
      if (q.length < 2) return res.json(empty);

      const safe = q.replace(/[\\%_]/g, (m) => "\\" + m);
      const pattern = `%${safe}%`;
      const PER = 5;

      const ownOrderCol = role === "restaurant" ? orders.restaurantId : orders.supplierId;
      const ownComplaintCol = role === "restaurant" ? complaints.restaurantId : complaints.supplierId;
      const ownDocCol = role === "restaurant" ? documents.restaurantId : documents.supplierId;
      const ownConvCol = role === "restaurant" ? conversations.restaurantId : conversations.supplierId;
      const partnerConvCol = role === "restaurant" ? conversations.supplierId : conversations.restaurantId;
      const partnerRole = role === "restaurant" ? "supplier" : "restaurant";

      const ordersSelect = {
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalAmount: orders.totalAmount,
        createdAt: orders.createdAt,
        notes: orders.notes,
      } as const;

      const [ordersByMeta, ordersByItem, productsList, partnersList, messagesList, complaintsList, documentsList] = await Promise.all([
        db.select(ordersSelect)
          .from(orders)
          .where(and(eq(ownOrderCol, userId), or(ilike(orders.orderNumber, pattern), ilike(orders.notes, pattern))))
          .orderBy(desc(orders.createdAt))
          .limit(PER),
        db.selectDistinct(ordersSelect)
          .from(orders)
          .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
          .where(and(eq(ownOrderCol, userId), ilike(orderItems.productName, pattern)))
          .orderBy(desc(orders.createdAt))
          .limit(PER),
        role === "restaurant"
          ? db.select({ id: products.id, name: products.name, articleNumber: products.articleNumber, supplierId: products.supplierId, category: products.category, price: products.price })
              .from(products)
              .where(or(ilike(products.name, pattern), ilike(products.articleNumber, pattern), ilike(products.category, pattern)))
              .orderBy(desc(products.createdAt))
              .limit(PER)
          : db.select({ id: products.id, name: products.name, articleNumber: products.articleNumber, supplierId: products.supplierId, category: products.category, price: products.price })
              .from(products)
              .where(and(eq(products.supplierId, userId), or(ilike(products.name, pattern), ilike(products.articleNumber, pattern), ilike(products.category, pattern))))
              .orderBy(desc(products.createdAt))
              .limit(PER),
        db.selectDistinct({ id: users.id, name: users.name, companyName: users.companyName, profileImageUrl: users.profileImageUrl })
          .from(users)
          .innerJoin(conversations, eq(partnerConvCol, users.id))
          .where(and(
            eq(users.role, partnerRole as any),
            eq(ownConvCol, userId),
            or(ilike(users.name, pattern), ilike(users.companyName, pattern)),
          ))
          .limit(PER),
        db.select({
          id: messages.id,
          conversationId: messages.conversationId,
          content: messages.content,
          createdAt: messages.createdAt,
          partnerId: users.id,
          partnerName: users.name,
          partnerCompany: users.companyName,
        })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .innerJoin(users, eq(users.id, partnerConvCol))
          .where(and(
            eq(ownConvCol, userId),
            eq(messages.messageType, "text"),
            ilike(messages.content, pattern),
          ))
          .orderBy(desc(messages.createdAt))
          .limit(PER),
        db.select({
          id: complaints.id,
          complaintNumber: complaints.complaintNumber,
          title: complaints.title,
          description: complaints.description,
          status: complaints.status,
          createdAt: complaints.createdAt,
        })
          .from(complaints)
          .where(and(
            eq(ownComplaintCol, userId),
            or(ilike(complaints.title, pattern), ilike(complaints.description, pattern), ilike(complaints.complaintNumber, pattern)),
          ))
          .orderBy(desc(complaints.createdAt))
          .limit(PER),
        db.select({
          id: documents.id,
          title: documents.title,
          type: documents.type,
          orderId: documents.orderId,
          fileUrl: documents.fileUrl,
          createdAt: documents.createdAt,
        })
          .from(documents)
          .where(and(eq(ownDocCol, userId), ilike(documents.title, pattern)))
          .orderBy(desc(documents.createdAt))
          .limit(PER),
      ]);

      const orderMap = new Map<string, typeof ordersByMeta[number]>();
      for (const o of [...ordersByMeta, ...ordersByItem]) orderMap.set(o.id, o);
      const ordersList = Array.from(orderMap.values())
        .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
        .slice(0, PER)
        .map((o) => ({
          id: o.id,
          orderNumber: formatOrderNumber(o),
          status: o.status,
          totalAmount: o.totalAmount,
          createdAt: o.createdAt,
          snippet: o.notes || null,
        }));

      res.json({
        orders: ordersList,
        products: productsList,
        partners: partnersList,
        messages: messagesList,
        complaints: complaintsList.map((c) => ({ ...c, complaintNumber: formatComplaintNumber(c) })),
        documents: documentsList,
      });
    } catch (error) {
      console.error("[search] failed:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // ===== USERS =====
  app.get("/api/users", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const role = req.query.role as "restaurant" | "supplier" | undefined;
      // Cross-org directory listing — expose business-card fields only, never
      // any organization's internal settings/targets.
      if (role) {
        const users = await storage.getUsersByRole(role);
        res.json(users.map(toPublicProfile));
      } else {
        const users = await storage.getUsers();
        res.json(users.map(toPublicProfile));
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/heartbeat", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      await storage.updateLastSeen(req.auth.organizationId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  });

  // ---- Organizations / Teams / Members / Vertreter ----
  const memberRoleSchema = z.enum(MEMBER_ROLES);

  // Security boundary: the acting identity now comes from the authenticated
  // session (req.auth), NOT from client-supplied ids. These helpers verify the
  // logged-in member belongs to the target org and holds the capability.
  // Returns null when allowed, or an {status, body} error to send.
  function checkActingCapability(
    req: Request,
    orgId: string,
    capability: Capability,
  ): { status: number; body: any } | null {
    if (!req.auth) {
      return { status: 401, body: { error: "unauthenticated", message: "Bitte melden Sie sich an." } };
    }
    if (req.auth.organizationId !== orgId) {
      return { status: 403, body: { error: "not_in_org", message: "Die handelnde Person gehört nicht zu dieser Organisation." } };
    }
    if (!can(req.auth.role, capability)) {
      return { status: 403, body: { error: "forbidden", message: "Keine Berechtigung für diese Aktion." } };
    }
    return null;
  }

  // Variant for routes touching two parties (orders/chat): the caller's org must
  // be one of the allowed orgs (e.g. the order's restaurant or supplier).
  function checkActingCapabilityIfProvided(
    req: Request,
    orgIds: string | string[],
    capability: Capability,
  ): { status: number; body: any } | null {
    if (!req.auth) {
      return { status: 401, body: { error: "unauthenticated", message: "Bitte melden Sie sich an." } };
    }
    const allowed = Array.isArray(orgIds) ? orgIds : [orgIds];
    if (!allowed.includes(req.auth.organizationId)) {
      return { status: 403, body: { error: "not_in_org", message: "Die handelnde Person gehört nicht zu dieser Organisation." } };
    }
    if (!can(req.auth.role, capability)) {
      return { status: 403, body: { error: "forbidden", message: "Keine Berechtigung für diese Aktion." } };
    }
    return null;
  }

  // Self-scope guard for per-account settings routes (/api/users/:id/...).
  // Identity = organization (the user account); the :id must be the caller's own.
  function checkSelf(
    req: Request,
    userId: string,
  ): { status: number; body: any } | null {
    if (!req.auth) {
      return { status: 401, body: { error: "unauthenticated", message: "Bitte melden Sie sich an." } };
    }
    if (req.auth.organizationId !== userId) {
      return { status: 403, body: { error: "forbidden", message: "Keine Berechtigung für diese Aktion." } };
    }
    return null;
  }

  // Shapes a `users` (organization) row down to fields that are safe to expose
  // to other organizations (business-card style public profile). Internal
  // settings — dashboard layouts/widgets/templates, notification prefs,
  // onboarding/help state, revenue targets, seat limits — are stripped so a
  // cross-org read cannot leak another organization's private configuration.
  const toPublicProfile = (user: any) => ({
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    whatsappNumber: user.whatsappNumber ?? null,
    address: user.address ?? null,
    city: user.city ?? null,
    postalCode: user.postalCode ?? null,
    latitude: user.latitude ?? null,
    longitude: user.longitude ?? null,
    companyName: user.companyName ?? null,
    description: user.description ?? null,
    profileImageUrl: user.profileImageUrl ?? null,
    lastSeenAt: user.lastSeenAt ?? null,
    language: user.language ?? null,
  });

  // Shapes a `members` row to the contact fields safe to return over the API.
  // Strips credential/auth columns (passwordHash, emailVerifiedAt, lastLoginAt)
  // so member listings (own-org Team and cross-org partner contact lists) never
  // leak password hashes or authentication state.
  const toSafeMember = (m: any) => ({
    id: m.id,
    organizationId: m.organizationId,
    name: m.name,
    email: m.email ?? null,
    phone: m.phone ?? null,
    profileImageUrl: m.profileImageUrl ?? null,
    role: m.role,
    createdAt: m.createdAt,
  });

  // Platform-operator guard for the cross-org back-office endpoints under
  // /api/admin/* (PMS/ERP/WhatsApp connection-request review). These are NOT
  // org-scoped — they expose every organization's requests — so they are gated
  // by an explicit platform-admin allowlist (PLATFORM_ADMIN_EMAILS, comma
  // separated). Fail-closed: with no allowlist configured there is no platform
  // admin, so every request is rejected.
  const requirePlatformAdmin = (req: express.Request, res: express.Response): boolean => {
    if (!req.auth) {
      res.status(401).json({ error: "unauthenticated", message: "Bitte melden Sie sich an." });
      return false;
    }
    const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = req.auth.member.email?.trim().toLowerCase();
    if (allowlist.length === 0 || !email || !allowlist.includes(email)) {
      res.status(403).json({ error: "forbidden", message: "Kein Plattform-Administrator." });
      return false;
    }
    return true;
  };

  app.patch("/api/orgs/:id", async (req, res) => {
    try {
      const schema = z.object({
        companyName: z.string().min(1).optional(),
        seatLimit: z.coerce.number().int().min(1).max(500).optional(),
        actingMemberId: z.string().optional(),
      }).strict();
      const { actingMemberId, ...data } = schema.parse(req.body);
      const denied = checkActingCapability(req, String(req.params.id), "org.edit");
      if (denied) return res.status(denied.status).json(denied.body);
      const updated = await storage.updateUser(req.params.id, data);
      if (!updated) return res.status(404).json({ error: "Organization not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      res.status(500).json({ error: "Failed to update organization" });
    }
  });

  app.get("/api/orgs/:id/members", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const requesterId = req.auth.organizationId;
      const targetId = req.params.id;
      const org = await storage.getUser(targetId);
      if (!org) return res.status(404).json({ error: "Organization not found" });
      const list = await storage.getMembers(targetId);
      // Strip credential/auth columns before returning.
      const safeMembers = list.map(toSafeMember);

      // The org may always see its own team (incl. seat usage). For another
      // organization, only expose the team contact list when an actual business
      // relationship exists (a shared conversation or order), and never the
      // internal seat metadata — this blocks authenticated enumeration of
      // arbitrary orgs' team directories.
      if (requesterId === targetId) {
        return res.json({ members: safeMembers, seatLimit: org.seatLimit ?? 5, seatsUsed: list.length });
      }

      const [conv] = await db.select({ id: conversations.id }).from(conversations).where(or(
        and(eq(conversations.restaurantId, requesterId), eq(conversations.supplierId, targetId)),
        and(eq(conversations.restaurantId, targetId), eq(conversations.supplierId, requesterId)),
      )).limit(1);
      let related = !!conv;
      if (!related) {
        const [ord] = await db.select({ id: orders.id }).from(orders).where(or(
          and(eq(orders.restaurantId, requesterId), eq(orders.supplierId, targetId)),
          and(eq(orders.restaurantId, targetId), eq(orders.supplierId, requesterId)),
        )).limit(1);
        related = !!ord;
      }
      if (!related) {
        return res.status(403).json({ error: "forbidden", message: "Keine Berechtigung für diese Organisation." });
      }
      res.json({ members: safeMembers });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  app.post("/api/orgs/:id/members", async (req, res) => {
    try {
      const org = await storage.getUser(req.params.id);
      if (!org) return res.status(404).json({ error: "Organization not found" });
      const denied = checkActingCapability(req, String(req.params.id), "team.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      const { actingMemberId: _amId, ...body } = req.body ?? {};
      const data = insertMemberSchema.parse({ ...body, organizationId: req.params.id });
      const existing = await storage.getMembers(req.params.id);
      const limit = org.seatLimit ?? 5;
      if (existing.length >= limit) {
        return res.status(409).json({ error: "seat_limit_reached", message: "Alle Sitzplätze sind belegt. Erhöhen Sie das Limit oder entfernen Sie ein Mitglied." });
      }
      const created = await storage.createMember(data);
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      res.status(500).json({ error: "Failed to create member" });
    }
  });

  app.patch("/api/members/:id", async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).optional(),
        email: z.string().email().optional().nullable(),
        phone: z.string().optional().nullable(),
        role: memberRoleSchema.optional(),
        profileImageUrl: z.string().optional().nullable(),
        actingMemberId: z.string().optional(),
      }).strict();
      const target = await storage.getMember(req.params.id);
      if (!target) return res.status(404).json({ error: "Member not found" });
      const { actingMemberId, ...data } = schema.parse(req.body);
      const denied = checkActingCapability(req, target.organizationId, "team.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      const updated = await storage.updateMember(req.params.id, data);
      if (!updated) return res.status(404).json({ error: "Member not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      res.status(500).json({ error: "Failed to update member" });
    }
  });

  app.delete("/api/members/:id", async (req, res) => {
    try {
      const member = await storage.getMember(req.params.id);
      if (!member) return res.status(404).json({ error: "Member not found" });
      const denied = checkActingCapability(req, member.organizationId, "team.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      const siblings = await storage.getMembers(member.organizationId);
      const admins = siblings.filter(m => m.role === "admin");
      if (member.role === "admin" && admins.length <= 1) {
        return res.status(409).json({ error: "last_admin", message: "Der letzte Administrator kann nicht entfernt werden." });
      }
      await storage.deleteMember(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete member" });
    }
  });

  app.get("/api/vertreter-assignments", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const memberId = req.query.memberId as string | undefined;
      if (memberId) {
        // A member may only view their own assignments (any role within the org
        // may view a colleague's, but never another org's).
        const target = await storage.getMember(memberId);
        if (!target || target.organizationId !== req.auth.organizationId) {
          return res.status(403).json({ error: "forbidden" });
        }
        return res.json(await storage.getVertreterAssignmentsForMember(memberId));
      }
      // Otherwise return the caller-supplier's own assignments.
      return res.json(await storage.getVertreterAssignments(req.auth.organizationId));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  app.get("/api/vertreter-assignments/responsible", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.query.supplierId as string | undefined;
      const restaurantId = req.query.restaurantId as string | undefined;
      if (!supplierId || !restaurantId) {
        return res.status(400).json({ error: "supplierId and restaurantId required" });
      }
      // The caller must be a party to the relationship being queried.
      if (req.auth.organizationId !== supplierId && req.auth.organizationId !== restaurantId) {
        return res.status(403).json({ error: "forbidden" });
      }
      const member = await storage.getResponsibleVertreter(supplierId, restaurantId);
      res.json({ member: member ?? null });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch responsible vertreter" });
    }
  });

  app.post("/api/vertreter-assignments", async (req, res) => {
    try {
      const data = insertVertreterAssignmentSchema.parse(req.body);
      const denied = checkActingCapability(req, data.supplierId, "vertreter.assign");
      if (denied) return res.status(denied.status).json(denied.body);
      const member = await storage.getMember(data.memberId);
      if (!member) return res.status(404).json({ error: "Member not found" });
      if (member.role !== "vertreter") {
        return res.status(400).json({ error: "not_vertreter", message: "Nur Mitglieder mit der Rolle Vertreter können zugewiesen werden." });
      }
      if (member.organizationId !== data.supplierId) {
        return res.status(400).json({ error: "member_org_mismatch", message: "Der Vertreter gehört nicht zu diesem Lieferanten." });
      }
      const created = await storage.createVertreterAssignment(data);
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      res.status(500).json({ error: "Failed to create assignment" });
    }
  });

  app.delete("/api/vertreter-assignments", async (req, res) => {
    try {
      const schema = z.object({ supplierId: uuidField, restaurantId: uuidField, actingMemberId: z.string().optional() }).strict();
      const { supplierId, restaurantId, actingMemberId } = schema.parse(req.body);
      const denied = checkActingCapability(req, supplierId, "vertreter.assign");
      if (denied) return res.status(denied.status).json(denied.body);
      await storage.deleteVertreterAssignment(supplierId, restaurantId);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.issues });
      }
      res.status(500).json({ error: "Failed to delete assignment" });
    }
  });

  app.get("/api/users/:id/dashboard-layout/:role", async (req, res) => {
    try {
      const role = req.params.role;
      if (role !== "restaurant" && role !== "supplier") {
        return res.status(400).json({ error: "Invalid role" });
      }
      const layout = await storage.getDashboardLayout(req.params.id, role);
      res.json({ layout });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard layout" });
    }
  });

  app.put("/api/users/:id/dashboard-layout/:role", async (req, res) => {
    try {
      const selfDenied = checkSelf(req, req.params.id);
      if (selfDenied) return res.status(selfDenied.status).json(selfDenied.body);
      const role = req.params.role;
      if (role !== "restaurant" && role !== "supplier") {
        return res.status(400).json({ error: "Invalid role" });
      }
      const parsed = dashboardLayoutSchema.parse(req.body?.layout ?? req.body);
      await storage.setDashboardLayout(req.params.id, role, parsed);
      res.json({ ok: true, layout: parsed });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid layout", details: error.issues });
      }
      res.status(500).json({ error: "Failed to save dashboard layout" });
    }
  });

  app.get("/api/users/:id/dashboard-widgets/:role", async (req, res) => {
    try {
      const role = req.params.role;
      if (role !== "restaurant" && role !== "supplier") {
        return res.status(400).json({ error: "Invalid role" });
      }
      const widgets = await storage.getDashboardWidgets(req.params.id, role);
      res.json({ widgets });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard widgets" });
    }
  });

  app.put("/api/users/:id/dashboard-widgets/:role", async (req, res) => {
    try {
      const selfDenied = checkSelf(req, req.params.id);
      if (selfDenied) return res.status(selfDenied.status).json(selfDenied.body);
      const role = req.params.role;
      if (role !== "restaurant" && role !== "supplier") {
        return res.status(400).json({ error: "Invalid role" });
      }
      const parsed = dashboardWidgetsSchema.parse(req.body?.widgets ?? req.body);
      await storage.setDashboardWidgets(req.params.id, role, parsed);
      res.json({ ok: true, widgets: parsed });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid widgets", details: error.issues });
      }
      res.status(500).json({ error: "Failed to save dashboard widgets" });
    }
  });

  app.get("/api/users/:id/dashboard-templates/:role", async (req, res) => {
    try {
      const role = req.params.role;
      if (role !== "restaurant" && role !== "supplier") {
        return res.status(400).json({ error: "Invalid role" });
      }
      const value = await storage.getDashboardTemplates(req.params.id, role);
      res.json(value ?? { templates: [], activeId: null });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard templates" });
    }
  });

  app.put("/api/users/:id/dashboard-templates/:role", async (req, res) => {
    try {
      const selfDenied = checkSelf(req, req.params.id);
      if (selfDenied) return res.status(selfDenied.status).json(selfDenied.body);
      const role = req.params.role;
      if (role !== "restaurant" && role !== "supplier") {
        return res.status(400).json({ error: "Invalid role" });
      }
      const parsed = dashboardTemplatesPayloadSchema.parse(req.body);
      await storage.setDashboardTemplates(req.params.id, role, parsed);
      res.json({ ok: true, ...parsed });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid templates", details: error.issues });
      }
      res.status(500).json({ error: "Failed to save dashboard templates" });
    }
  });

  // Promo performance: for each currently-active promotion, return units & revenue sold
  // since promo.startDate (status != cancelled). Sorted by revenue desc.
  app.get("/api/supplier/promo-performance", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const now = new Date();

      const active = await db
        .select()
        .from(promotions)
        .where(and(
          eq(promotions.supplierId, supplierId),
          eq(promotions.isActive, true),
          lte(promotions.startDate, now),
          gte(promotions.endDate, now),
        ))
        .orderBy(desc(promotions.startDate));

      if (active.length === 0) return res.json([]);

      const productIds = Array.from(new Set(active.map(p => p.productId)));
      const productRows = await db
        .select({ id: products.id, name: products.name, price: products.price, imageUrl: products.imageUrl, unit: products.unit })
        .from(products)
        .where(inArray(products.id, productIds));
      const productMap = new Map(productRows.map(p => [p.id, p]));

      const results = await Promise.all(active.map(async (promo) => {
        const rows = await db
          .select({
            qty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
            revenue: sql<number>`COALESCE(SUM(${orderItems.totalPrice}), 0)`,
            orderCount: sql<number>`COUNT(DISTINCT ${orders.id})`,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orderItems.orderId, orders.id))
          .where(and(
            eq(orders.supplierId, supplierId),
            eq(orderItems.productId, promo.productId),
            ne(orders.status, "cancelled"),
            gte(orders.createdAt, promo.startDate),
          ));
        const r = rows[0];
        const product = productMap.get(promo.productId);
        return {
          promotionId: promo.id,
          productId: promo.productId,
          productName: product?.name || "",
          productImageUrl: product?.imageUrl || null,
          unit: product?.unit || "",
          discountPercent: promo.discountPercent,
          startDate: promo.startDate,
          endDate: promo.endDate,
          unitsSold: Number(r?.qty) || 0,
          revenue: Number(r?.revenue) || 0,
          orderCount: Number(r?.orderCount) || 0,
        };
      }));

      results.sort((a, b) => b.revenue - a.revenue);
      res.json(results);
    } catch (error) {
      console.error("promo-performance error", error);
      res.status(500).json({ error: "Failed to fetch promo performance" });
    }
  });

  // Average supplier response time: avg seconds between a restaurant message
  // and the supplier's next reply, over the last 30 days.
  app.get("/api/supplier/response-time", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const convs = await db
        .select({ id: conversations.id, restaurantId: conversations.restaurantId })
        .from(conversations)
        .where(eq(conversations.supplierId, supplierId));

      if (convs.length === 0) {
        return res.json({ avgSeconds: null, sampleCount: 0, conversationCount: 0 });
      }

      const convIds = convs.map(c => c.id);
      const restaurantByConv = new Map(convs.map(c => [c.id, c.restaurantId]));

      const msgs = await db
        .select({
          conversationId: messages.conversationId,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(and(
          inArray(messages.conversationId, convIds),
          gte(messages.createdAt, since),
        ))
        .orderBy(asc(messages.conversationId), asc(messages.createdAt));

      let totalSeconds = 0;
      let sampleCount = 0;
      const respondingConvs = new Set<string>();

      const byConv = new Map<string, typeof msgs>();
      for (const m of msgs) {
        const arr = byConv.get(m.conversationId) || [];
        arr.push(m);
        byConv.set(m.conversationId, arr);
      }

      for (const [convId, arr] of byConv) {
        const restId = restaurantByConv.get(convId);
        if (!restId) continue;
        let pendingRestaurantAt: Date | null = null;
        for (const m of arr) {
          if (m.senderId === restId) {
            if (pendingRestaurantAt === null) pendingRestaurantAt = m.createdAt;
          } else if (pendingRestaurantAt !== null) {
            const diff = (m.createdAt.getTime() - pendingRestaurantAt.getTime()) / 1000;
            if (diff >= 0 && diff < 7 * 24 * 3600) {
              totalSeconds += diff;
              sampleCount += 1;
              respondingConvs.add(convId);
            }
            pendingRestaurantAt = null;
          }
        }
      }

      res.json({
        avgSeconds: sampleCount > 0 ? Math.round(totalSeconds / sampleCount) : null,
        sampleCount,
        conversationCount: respondingConvs.size,
      });
    } catch (error) {
      console.error("response-time error", error);
      res.status(500).json({ error: "Failed to compute response time" });
    }
  });

  app.get("/api/users/:id/status", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ lastSeenAt: user.lastSeenAt || null });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Self gets the full row (own settings); other orgs get a public profile
      // only, so internal config (dashboards, prefs, targets) never leaks.
      if (req.auth.organizationId === user.id) {
        return res.json(user);
      }
      res.json(toPublicProfile(user));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/users/:id/onboarding/complete", async (req, res) => {
    try {
      const selfDenied = checkSelf(req, req.params.id);
      if (selfDenied) return res.status(selfDenied.status).json(selfDenied.body);
      const updated = await storage.completeOnboarding(req.params.id);
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to complete onboarding" });
    }
  });

  app.post("/api/users/:id/onboarding/reset", async (req, res) => {
    try {
      const selfDenied = checkSelf(req, req.params.id);
      if (selfDenied) return res.status(selfDenied.status).json(selfDenied.body);
      const updated = await storage.resetOnboarding(req.params.id);
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reset onboarding" });
    }
  });

  app.post("/api/users/:id/help-topics/:topicId/dismiss", async (req, res) => {
    try {
      const selfDenied = checkSelf(req, req.params.id);
      if (selfDenied) return res.status(selfDenied.status).json(selfDenied.body);
      const topicId = String(req.params.topicId || "").slice(0, 100);
      if (!topicId) return res.status(400).json({ error: "topicId required" });
      const updated = await storage.dismissHelpTopic(req.params.id, topicId);
      res.json(updated || { ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to dismiss help topic" });
    }
  });

  app.post("/api/users/:id/page-intros/seen", async (req, res) => {
    try {
      const selfDenied = checkSelf(req, req.params.id);
      if (selfDenied) return res.status(selfDenied.status).json(selfDenied.body);
      const introId = String(req.body?.introId || "").slice(0, 100);
      if (!introId) return res.status(400).json({ error: "introId required" });
      const updated = await storage.markPageIntroSeen(req.params.id, introId);
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark page intro seen" });
    }
  });

  app.post("/api/users/:id/page-intros/skip-all", async (req, res) => {
    try {
      const selfDenied = checkSelf(req, req.params.id);
      if (selfDenied) return res.status(selfDenied.status).json(selfDenied.body);
      const value = req.body?.value === undefined ? true : req.body.value === true;
      const updated = await storage.setSkipAllPageIntros(req.params.id, value);
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update page intro preference" });
    }
  });

  app.post("/api/users/:id/page-intros/reset", async (req, res) => {
    try {
      const selfDenied = checkSelf(req, req.params.id);
      if (selfDenied) return res.status(selfDenied.status).json(selfDenied.body);
      const updated = await storage.resetPageIntros(req.params.id);
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reset page intros" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const { actingMemberId, ...rest } = (req.body ?? {}) as Record<string, unknown>;
      const validated = updateUserSchema.parse(rest);

      // Editing organization/business settings (name, company, address, profile
      // image, etc.) requires the org.edit capability. Lenient enforcement: only
      // applied when an acting member id is supplied, so language-only syncs and
      // legacy callers are unaffected. Language-only updates never require org.edit.
      const businessFields = Object.keys(validated).filter((k) => k !== "language");
      if (businessFields.length > 0) {
        const denied = checkActingCapabilityIfProvided(req, req.params.id, "org.edit");
        if (denied) return res.status(denied.status).json(denied.body);
      }

      // Re-geocode whenever any address component is part of this update, so the
      // map pin always reflects the latest stored address. Coordinates are
      // derived server-side and persisted (cached) — never supplied by the client.
      const touchesAddress =
        "address" in validated || "city" in validated || "postalCode" in validated;
      let coords: { latitude: string | null; longitude: string | null } | undefined;
      if (touchesAddress && isGeocodingConfigured()) {
        const existing = await storage.getUser(req.params.id);
        const merged = {
          address: "address" in validated ? validated.address : existing?.address,
          city: "city" in validated ? validated.city : existing?.city,
          postalCode: "postalCode" in validated ? validated.postalCode : existing?.postalCode,
        };
        const geo = await geocodeAddress(merged);
        coords = {
          latitude: geo ? String(geo.lat) : null,
          longitude: geo ? String(geo.lng) : null,
        };
      }

      const updated = await storage.updateUser(req.params.id, {
        ...validated,
        ...(coords ?? {}),
      });
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // ===== SUPPLIERS =====
  app.get("/api/suppliers", async (req, res) => {
    try {
      const suppliers = await storage.getUsersByRole("supplier");
      // Public catalog listing — expose business-card fields only, never each
      // supplier's internal settings/targets.
      res.json(suppliers.map(toPublicProfile));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  // ===== Supplier Ratings =====
  const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  // Summary for many suppliers at once (used in lists/PriceComparison)
  app.get("/api/supplier-ratings/summary", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const idsParam = (req.query.supplierIds as string) || "";
      const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean);
      const summaries = await storage.getSupplierRatingSummaries(ids);
      res.json(summaries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch summaries" });
    }
  });

  // Public list of a single supplier's ratings + summary
  app.get("/api/suppliers/:id/ratings", async (req, res) => {
    try {
      const supplierId = req.params.id;
      const limit = Math.min(parseInt((req.query.limit as string) || "20", 10) || 20, 100);
      const [summary, ratings] = await Promise.all([
        storage.getSupplierRatingSummary(supplierId),
        storage.getRatingsBySupplier(supplierId, limit),
      ]);
      res.json({
        ...summary,
        ratings: ratings.map(r => ({
          id: r.id,
          orderId: r.orderId,
          restaurantId: r.restaurantId,
          stars: r.stars,
          comment: r.comment,
          flaggedAt: r.flaggedAt,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          restaurant: r.restaurant ? {
            id: r.restaurant.id,
            name: r.restaurant.name,
            companyName: r.restaurant.companyName,
            profileImageUrl: r.restaurant.profileImageUrl,
          } : null,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ratings" });
    }
  });

  // Get the rating attached to a specific order (or null)
  app.get("/api/orders/:orderId/rating", async (req, res) => {
    try {
      const rating = await storage.getRatingByOrder(req.params.orderId);
      res.json(rating ?? null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch rating" });
    }
  });

  // Create rating — restaurant only, order must be delivered, owned by them
  app.post("/api/ratings", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const parsed = insertSupplierRatingSchema.parse({
        ...req.body,
        restaurantId: req.auth.organizationId,
      });
      const order = await storage.getOrder(parsed.orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.restaurantId !== req.auth.organizationId) {
        return res.status(403).json({ error: "Not your order" });
      }
      if (order.supplierId !== parsed.supplierId) {
        return res.status(400).json({ error: "Supplier mismatch" });
      }
      if (order.status !== "delivered") {
        return res.status(400).json({ error: "Order is not delivered" });
      }
      const existing = await storage.getRatingByOrder(parsed.orderId);
      if (existing) return res.status(409).json({ error: "Rating already exists", rating: existing });
      const rating = await storage.createRating({
        ...parsed,
        comment: parsed.comment?.trim() || null,
      });
      // Notify supplier
      try {
        await createNotificationWithPush({
          userId: order.supplierId,
          type: "new_message",
          title: "Neue Bewertung",
          message: `${rating.stars}/5 Sterne erhalten`,
          referenceId: rating.id,
        }, "supplier");
      } catch {}
      res.status(201).json(rating);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      console.error("createRating failed", error);
      res.status(500).json({ error: "Failed to create rating" });
    }
  });

  // Update rating — owner only, within 7 days
  app.patch("/api/ratings/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const existing = await storage.getRatingById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.restaurantId !== userId) return res.status(403).json({ error: "Not yours" });
      if (Date.now() - new Date(existing.createdAt).getTime() > EDIT_WINDOW_MS) {
        return res.status(403).json({ error: "Edit window closed" });
      }
      const parsed = updateSupplierRatingSchema.parse(req.body);
      const updated = await storage.updateRating(req.params.id, {
        ...parsed,
        ...(parsed.comment !== undefined ? { comment: parsed.comment?.trim() || null } : {}),
      });
      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update rating" });
    }
  });

  // Delete rating — owner only, within 7 days
  app.delete("/api/ratings/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const existing = await storage.getRatingById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.restaurantId !== userId) return res.status(403).json({ error: "Not yours" });
      if (Date.now() - new Date(existing.createdAt).getTime() > EDIT_WINDOW_MS) {
        return res.status(403).json({ error: "Edit window closed" });
      }
      await storage.deleteRating(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete rating" });
    }
  });

  // Flag rating — only the rated supplier
  app.post("/api/ratings/:id/flag", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const existing = await storage.getRatingById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.supplierId !== userId) return res.status(403).json({ error: "Not your rating" });
      const reason = typeof req.body?.reason === "string" ? String(req.body.reason).slice(0, 500) : undefined;
      const updated = await storage.flagRating(req.params.id, reason);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to flag rating" });
    }
  });

  // ===== PRODUCTS =====
  app.get("/api/products", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.query.supplierId as string;
      const restaurantId = req.auth.organizationId;
      if (supplierId) {
        const products = await storage.getProductsBySupplier(supplierId);
        return res.json(products);
      }
      const products = await storage.getProducts();
      const activePromotions = await storage.getActivePromotions();
      const promoMap = new Map<string, typeof activePromotions[0]>();
      for (const promo of activePromotions) {
        if (promo.targetRestaurantIds && promo.targetRestaurantIds.length > 0 && restaurantId) {
          if (!promo.targetRestaurantIds.includes(restaurantId)) continue;
        }
        const existing = promoMap.get(promo.productId);
        if (!existing || promo.discountPercent > existing.discountPercent) {
          promoMap.set(promo.productId, promo);
        }
      }
      let customMoqMap = new Map<string, number>();
      if (restaurantId) {
        const allCustomMoqs = await storage.getCustomMinOrderQuantitiesByRestaurant(restaurantId);
        for (const moq of allCustomMoqs) {
          customMoqMap.set(moq.productId, moq.minOrderQuantity);
        }
      }
      const productsWithPromotions = products.map(p => {
        const customMoq = customMoqMap.get(p.id);
        return {
          ...p,
          activePromotion: promoMap.get(p.id) || null,
          ...(customMoq !== undefined ? { minOrderQuantity: customMoq } : {}),
        };
      });
      productsWithPromotions.sort((a, b) => {
        if (a.activePromotion && !b.activePromotion) return -1;
        if (!a.activePromotion && b.activePromotion) return 1;
        return 0;
      });
      res.json(productsWithPromotions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/order-insights", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      if (!restaurantId) return res.json({});
      const WEEKS = 8;
      const insights = await storage.getProductOrderInsightsForRestaurant(restaurantId, WEEKS * 7);
      res.json(insights);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order insights" });
    }
  });

  app.get("/api/products/:productId/purchase-history", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const { productId } = req.params;
      const history = await storage.getProductPurchaseHistory(restaurantId, productId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch purchase history" });
    }
  });

  app.get("/api/supplier/products", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const products = await storage.getProductsBySupplier(supplierId);
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  // ===== BULK PRICE UPDATE (Task #42) =====
  // CSV column order — kept in sync between server export, server import and client UI.
  const BULK_CSV_HEADER = [
    "productId",
    "articleNumber",
    "name",
    "unit",
    "currentPrice",
    "newPrice",
    "currentMinOrderQuantity",
    "newMinOrderQuantity",
    "currentStockQuantity",
    "newStockQuantity",
  ];

  function csvCell(val: string | number | null | undefined): string {
    const s = val === null || val === undefined ? "" : String(val);
    if (/[;\n\r"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    if (/^[=+\-@]/.test(s)) return `'${s}`;
    return s;
  }

  function parseCsv(text: string, delim = ";"): string[][] {
    const rows: string[][] = [];
    let cur = "";
    let row: string[] = [];
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
        } else { cur += c; }
      } else {
        if (c === '"') inQ = true;
        else if (c === delim) { row.push(cur); cur = ""; }
        else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
        else if (c === "\r") { /* skip */ }
        else cur += c;
      }
    }
    if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
    return rows;
  }

  app.get("/api/supplier/products/csv-export", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const list = await storage.getProductsBySupplier(supplierId);
      const header = BULK_CSV_HEADER.join(";");
      const rows = list.map(p => [
        csvCell(p.id),
        csvCell(p.articleNumber || ""),
        csvCell(p.name),
        csvCell(p.unit),
        csvCell(p.price),
        "", // newPrice — leave empty for user to fill
        csvCell(p.minOrderQuantity ?? 1),
        "", // newMinOrderQuantity
        csvCell(p.stockQuantity ?? ""),
        "", // newStockQuantity
      ].join(";"));
      const csv = "\uFEFF" + header + "\n" + rows.join("\n") + "\n";
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="Produkte_Massen-Update_${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    } catch (e) {
      console.error("[csv-export] failed:", e);
      res.status(500).json({ error: "Export failed" });
    }
  });

  const bulkUpdateRowSchema = z.object({
    productId: uuidField,
    newPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
    newMinOrderQuantity: z.number().int().min(1).max(999999).optional().nullable(),
    newStockQuantity: z.number().int().min(0).max(999999).optional().nullable(),
  }).strict();

  const bulkUpdateSchema = z.object({
    supplierId: uuidField,
    userId: uuidField.optional(),
    rows: z.array(bulkUpdateRowSchema).min(1).max(2000).optional(),
    csv: z.string().min(1).max(2_000_000).optional(),
  }).strict().refine(d => !!d.rows || !!d.csv, { message: "rows or csv required" });

  function parseBulkCsv(text: string): { rows: z.infer<typeof bulkUpdateRowSchema>[]; errors: Array<{ rowIndex: number; field?: string; message: string; productId?: string }> } {
    const errors: Array<{ rowIndex: number; field?: string; message: string; productId?: string }> = [];
    const rows: z.infer<typeof bulkUpdateRowSchema>[] = [];
    const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const firstNl = stripped.indexOf("\n");
    const headerLine = firstNl === -1 ? stripped : stripped.slice(0, firstNl);
    const delim = [";", ",", "\t"].reduce((best, d) => headerLine.split(d).length > headerLine.split(best).length ? d : best, ";");
    const raw = parseCsv(stripped, delim).filter(r => r.some(c => c && c.trim() !== ""));
    if (raw.length === 0) { errors.push({ rowIndex: -1, message: "Keine Daten gefunden" }); return { rows, errors }; }
    const header = raw[0].map(h => h.trim());
    const required = ["productId", "newPrice", "newMinOrderQuantity", "newStockQuantity"];
    const missing = required.filter(h => !header.includes(h));
    if (missing.length > 0) { errors.push({ rowIndex: -1, message: `Fehlende Spalten: ${missing.join(", ")}` }); return { rows, errors }; }
    const idx = (k: string) => header.indexOf(k);
    const seen = new Set<string>();
    for (let i = 1; i < raw.length; i++) {
      const r = raw[i];
      const productId = (r[idx("productId")] || "").trim();
      const newPriceRaw = (r[idx("newPrice")] || "").trim().replace(",", ".");
      const newMoqRaw = (r[idx("newMinOrderQuantity")] || "").trim();
      const newStockRaw = (r[idx("newStockQuantity")] || "").trim();
      if (!productId) { errors.push({ rowIndex: i, field: "productId", message: "productId fehlt" }); continue; }
      if (seen.has(productId)) { errors.push({ rowIndex: i, productId, field: "productId", message: "Doppelte productId in CSV" }); continue; }
      seen.add(productId);
      let newPrice: string | null = null;
      let newMinOrderQuantity: number | null = null;
      let newStockQuantity: number | null = null;
      if (newPriceRaw) {
        if (!/^\d+(\.\d{1,2})?$/.test(newPriceRaw)) { errors.push({ rowIndex: i, productId, field: "newPrice", message: "Ungültiger Preis (z.B. 12.50)" }); continue; }
        newPrice = newPriceRaw;
      }
      if (newMoqRaw) {
        if (!/^\d+$/.test(newMoqRaw)) { errors.push({ rowIndex: i, productId, field: "newMinOrderQuantity", message: "Ganzzahl erforderlich" }); continue; }
        newMinOrderQuantity = Number(newMoqRaw);
        if (newMinOrderQuantity < 1) { errors.push({ rowIndex: i, productId, field: "newMinOrderQuantity", message: "Min. 1" }); continue; }
      }
      if (newStockRaw) {
        if (!/^\d+$/.test(newStockRaw)) { errors.push({ rowIndex: i, productId, field: "newStockQuantity", message: "Ganzzahl erforderlich" }); continue; }
        newStockQuantity = Number(newStockRaw);
      }
      rows.push({ productId, newPrice, newMinOrderQuantity, newStockQuantity });
    }
    return { rows, errors };
  }

  app.post("/api/supplier/products/csv-import", async (req, res) => {
    try {
      const parsed = bulkUpdateSchema.parse(req.body);
      const denied = checkActingCapability(req, parsed.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      const supplierId = req.auth!.organizationId;
      const userId = parsed.userId;
      const csv = parsed.csv;
      let rows = parsed.rows ?? [];
      if (csv) {
        const out = parseBulkCsv(csv);
        if (out.errors.length > 0) {
          return res.status(400).json({ error: "validation_failed", errors: out.errors, updated: 0 });
        }
        rows = out.rows;
        if (rows.length === 0) {
          return res.status(400).json({ error: "validation_failed", errors: [{ rowIndex: -1, message: "Keine Datenzeilen in CSV" }], updated: 0 });
        }
      }

      // Load supplier products to validate ownership & compute diffs.
      const productList = await storage.getProductsBySupplier(supplierId);
      const productMap = new Map(productList.map(p => [p.id, p]));

      let actor: { id: string; name?: string | null } | null = null;
      if (userId) {
        const u = await storage.getUser(userId);
        if (u) actor = { id: u.id, name: u.name };
      }

      const errors: Array<{ rowIndex: number; productId?: string; field?: string; message: string }> = [];
      const seenIds = new Set<string>();
      rows.forEach((r, idx) => {
        if (seenIds.has(r.productId)) {
          errors.push({ rowIndex: idx, productId: r.productId, field: "productId", message: "Doppelte productId" });
        }
        seenIds.add(r.productId);
      });
      const changes: Array<{
        rowIndex: number;
        product: typeof productList[number];
        priceChanged: boolean;
        moqChanged: boolean;
        stockChanged: boolean;
        newPrice?: string;
        newMinOrderQuantity?: number;
        newStockQuantity?: number;
      }> = [];

      rows.forEach((r, idx) => {
        const product = productMap.get(r.productId);
        if (!product) {
          errors.push({ rowIndex: idx, productId: r.productId, message: "Produkt nicht gefunden oder gehört nicht zu diesem Lieferanten" });
          return;
        }
        const newPrice = r.newPrice ? r.newPrice.trim() : "";
        const newMoq = r.newMinOrderQuantity ?? null;
        const newStock = r.newStockQuantity ?? null;

        const priceChanged = newPrice !== "" && Number(newPrice) !== Number(product.price);
        const moqChanged = newMoq !== null && newMoq !== (product.minOrderQuantity ?? 1);
        const stockChanged = newStock !== null && newStock !== (product.stockQuantity ?? 0);

        if (priceChanged && Number(newPrice) <= 0) {
          errors.push({ rowIndex: idx, productId: r.productId, field: "newPrice", message: "Preis muss größer als 0 sein" });
          return;
        }

        if (!priceChanged && !moqChanged && !stockChanged) return; // skip no-op rows

        changes.push({
          rowIndex: idx,
          product,
          priceChanged,
          moqChanged,
          stockChanged,
          newPrice: priceChanged ? newPrice : undefined,
          newMinOrderQuantity: moqChanged ? newMoq! : undefined,
          newStockQuantity: stockChanged ? newStock! : undefined,
        });
      });

      if (errors.length > 0) {
        return res.status(400).json({ error: "validation_failed", errors, updated: 0 });
      }

      if (changes.length === 0) {
        return res.json({ updated: 0, changes: [] });
      }

      const applied = await db.transaction(async (tx) => {
        const summary: Array<{ productId: string; name: string; priceChanged: boolean; moqChanged: boolean; stockChanged: boolean }> = [];
        for (const c of changes) {
          const setData: Partial<typeof products.$inferInsert> = {};
          if (c.priceChanged) setData.price = c.newPrice!;
          if (c.moqChanged) setData.minOrderQuantity = c.newMinOrderQuantity!;
          if (c.stockChanged) {
            setData.stockQuantity = c.newStockQuantity!;
            setData.inStock = c.newStockQuantity! > 0;
          }

          await tx.update(products).set(setData).where(and(eq(products.id, c.product.id), eq(products.supplierId, supplierId)));

          if (c.priceChanged || c.moqChanged) {
            await tx.insert(priceChangeLog).values({
              productId: c.product.id,
              supplierId,
              userId: actor?.id ?? null,
              userName: actor?.name ?? null,
              oldPrice: c.priceChanged ? c.product.price : null,
              newPrice: c.priceChanged ? c.newPrice! : null,
              oldMinOrderQuantity: c.moqChanged ? (c.product.minOrderQuantity ?? null) : null,
              newMinOrderQuantity: c.moqChanged ? c.newMinOrderQuantity! : null,
              source: "bulk_csv",
            });
          }

          if (c.stockChanged) {
            const previousStock = c.product.stockQuantity ?? 0;
            const newStock = c.newStockQuantity!;
            await tx.insert(stockMovements).values({
              productId: c.product.id,
              supplierId,
              orderId: null,
              userId: actor?.id ?? null,
              userName: actor?.name ?? null,
              type: "manual_set",
              quantity: Math.abs(newStock - previousStock),
              previousStock,
              newStock,
              note: "Massen-Update (CSV)",
            });
          }

          summary.push({
            productId: c.product.id,
            name: c.product.name,
            priceChanged: c.priceChanged,
            moqChanged: c.moqChanged,
            stockChanged: c.stockChanged,
          });
        }
        return summary;
      });

      return res.json({ updated: applied.length, changes: applied });
    } catch (error: any) {
      if (error?.issues) {
        return res.status(400).json({ error: "invalid_payload", details: error.issues });
      }
      console.error("[csv-import] failed:", error);
      res.status(500).json({ error: "Import failed" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const validated = insertProductSchema.parse(req.body);
      const denied = checkActingCapability(req, validated.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      const product = await storage.createProduct(validated);
      res.status(201).json(product);
    } catch (error: any) {
      if (error?.code === "23505" && typeof error?.constraint === "string" && error.constraint.includes("article")) {
        return res.status(409).json({ error: "Diese Artikelnummer ist bereits vergeben." });
      }
      res.status(400).json({ error: "Invalid product data" });
    }
  });

  app.patch("/api/products/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getProduct(req.params.id);
      if (!existing) return res.status(404).json({ error: "Product not found" });
      const denied = checkActingCapability(req, existing.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      const validated = updateProductSchema.parse(req.body);
      const updated = await storage.updateProduct(req.params.id, validated);
      if (!updated) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      if (error?.code === "23505" && typeof error?.constraint === "string" && error.constraint.includes("article")) {
        return res.status(409).json({ error: "Diese Artikelnummer ist bereits vergeben." });
      }
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getProduct(req.params.id);
      if (!existing) return res.status(404).json({ error: "Product not found" });
      const denied = checkActingCapability(req, existing.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      await storage.deleteProduct(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // ===== PROMOTIONS =====
  app.get("/api/promotions", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const promos = await storage.getPromotionsBySupplier(supplierId);
      res.json(promos);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch promotions" });
    }
  });

  app.post("/api/promotions", async (req, res) => {
    try {
      const startDate = new Date(req.body.startDate);
      const endDate = new Date(req.body.endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) {
        return res.status(400).json({ error: "Start date cannot be in the past" });
      }
      if (endDate < today) {
        return res.status(400).json({ error: "End date cannot be in the past" });
      }
      const validated = insertPromotionSchema.parse({
        ...req.body,
        startDate,
        endDate,
      });
      const denied = checkActingCapability(req, validated.supplierId, "promotions.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      const promo = await storage.createPromotion(validated);
      res.status(201).json(promo);
    } catch (error) {
      res.status(400).json({ error: "Invalid promotion data" });
    }
  });

  app.post("/api/promotions/bulk", async (req, res) => {
    try {
      const { productIds, supplierId, discountPercent, startDate: startStr, endDate: endStr, name, description, targetRestaurantIds } = req.body;
      const denied = checkActingCapability(req, supplierId, "promotions.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: "At least one product is required" });
      }
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) return res.status(400).json({ error: "Start date cannot be in the past" });
      if (endDate < today) return res.status(400).json({ error: "End date cannot be in the past" });
      if (endDate <= startDate) return res.status(400).json({ error: "End date must be after start date" });

      const groupId = randomUUID();
      const created = [];
      for (const productId of productIds) {
        const existingPromo = await storage.getActivePromotionForProduct(productId);
        if (existingPromo) {
          await storage.updatePromotion(existingPromo.id, { isActive: false });
        }
        const promo = await storage.createPromotion({
          productId,
          supplierId,
          discountPercent,
          startDate,
          endDate,
          isActive: true,
          name: name || null,
          description: description || null,
          groupId,
          targetRestaurantIds: targetRestaurantIds || null,
        });
        created.push(promo);
      }
      res.status(201).json({ groupId, promotions: created });
    } catch (error) {
      res.status(400).json({ error: "Invalid promotion data" });
    }
  });

  app.post("/api/promotions/notify", async (req, res) => {
    try {
      const { supplierId, restaurantIds, promotionData } = req.body;
      const denied = checkActingCapability(req, supplierId, "promotions.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      if (!supplierId || !restaurantIds || !Array.isArray(restaurantIds) || restaurantIds.length === 0 || !promotionData) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      for (const restaurantId of restaurantIds) {
        const conversation = await storage.getOrCreateConversation(restaurantId, supplierId);
        await storage.sendMessage({
          conversationId: conversation.id,
          senderId: supplierId,
          content: JSON.stringify(promotionData),
          messageType: "promotion",
        });
      }
      res.status(200).json({ sent: restaurantIds.length });
    } catch (error) {
      console.error("Failed to send promotions notify:", error);
      res.status(500).json({ error: "Failed to send notifications" });
    }
  });

  app.patch("/api/messages/:id/dismiss", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const { id } = req.params;
      const [msg] = await db.select().from(messages).where(eq(messages.id, id));
      if (!msg) return res.status(404).json({ error: "Message not found" });
      const conv = await storage.getConversation(msg.conversationId);
      if (!conv) return res.status(404).json({ error: "Conversation not found" });
      if (![conv.restaurantId, conv.supplierId].includes(req.auth.organizationId)) {
        return res.status(403).json({ error: "forbidden" });
      }
      await db.update(messages).set({ dismissed: true }).where(eq(messages.id, id));
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to dismiss message" });
    }
  });

  app.patch("/api/promotions/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getPromotion(req.params.id);
      if (!existing) return res.status(404).json({ error: "Promotion not found" });
      const denied = checkActingCapability(req, existing.supplierId, "promotions.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      const validated = updatePromotionSchema.parse(req.body);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (validated.startDate && new Date(validated.startDate) < today) {
        return res.status(400).json({ error: "Start date cannot be in the past" });
      }
      if (validated.endDate && new Date(validated.endDate) < today) {
        return res.status(400).json({ error: "End date cannot be in the past" });
      }
      const data: Record<string, unknown> = { ...validated };
      if (validated.startDate) data.startDate = new Date(validated.startDate);
      if (validated.endDate) data.endDate = new Date(validated.endDate);
      const updated = await storage.updatePromotion(req.params.id, data as any);
      if (!updated) {
        return res.status(404).json({ error: "Promotion not found" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update promotion" });
    }
  });

  app.delete("/api/promotions/group/:groupId", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const group = await storage.getPromotionsByGroup(req.params.groupId);
      if (group.length === 0) return res.status(404).json({ error: "Promotion group not found" });
      // Every promotion in the group must belong to the caller's org.
      if (group.some((p) => p.supplierId !== req.auth!.organizationId)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const denied = checkActingCapability(req, group[0].supplierId, "promotions.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      await storage.deletePromotionsByGroup(req.params.groupId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete promotion group" });
    }
  });

  app.delete("/api/promotions/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getPromotion(req.params.id);
      if (!existing) return res.status(404).json({ error: "Promotion not found" });
      const denied = checkActingCapability(req, existing.supplierId, "promotions.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      await storage.deletePromotion(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete promotion" });
    }
  });

  // ---- Inventory Risk Records (supplier-only) ----
  // Warehouse staff flag at-risk stock; Product Managers (admin/manager/
  // vertreter) act on flagged stock by turning it into a promotion. Identity is
  // resolved from req.auth — supplierId/createdBy are never trusted from client.
  app.get("/api/inventory-risks", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (!can(req.auth.role, "inventory_risk.create")) {
        return res.status(403).json({ error: "forbidden", message: "Keine Berechtigung für diese Aktion." });
      }
      const { status, qualityStatus, productId } = req.query as Record<string, string | undefined>;
      const filters: { status?: string; qualityStatus?: string; productId?: string } = {};
      if (status && (INVENTORY_RISK_STATUSES as readonly string[]).includes(status)) filters.status = status;
      if (qualityStatus && (INVENTORY_RISK_QUALITY as readonly string[]).includes(qualityStatus)) filters.qualityStatus = qualityStatus;
      if (productId) filters.productId = productId;
      const records = await storage.getInventoryRiskRecordsBySupplier(req.auth.organizationId, filters);
      res.json(records);
    } catch (error) {
      console.error("Failed to fetch inventory risks:", error);
      res.status(500).json({ error: "Failed to fetch inventory risks" });
    }
  });

  app.get("/api/inventory-risks/open-count", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (!can(req.auth.role, "inventory_risk.create")) {
        return res.status(403).json({ error: "forbidden", message: "Keine Berechtigung für diese Aktion." });
      }
      const count = await storage.getOpenInventoryRiskCount(req.auth.organizationId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch open inventory risk count" });
    }
  });

  app.get("/api/inventory-risks/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (!can(req.auth.role, "inventory_risk.create")) {
        return res.status(403).json({ error: "forbidden", message: "Keine Berechtigung für diese Aktion." });
      }
      const record = await storage.getInventoryRiskRecord(req.params.id);
      if (!record || record.supplierId !== req.auth.organizationId) {
        return res.status(404).json({ error: "Inventory risk record not found" });
      }
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inventory risk record" });
    }
  });

  app.post("/api/inventory-risks", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (!can(req.auth.role, "inventory_risk.create")) {
        return res.status(403).json({ error: "forbidden", message: "Keine Berechtigung für diese Aktion." });
      }
      const validated = insertInventoryRiskRecordSchema.parse(req.body);
      // Product must belong to the caller's organization.
      const product = await storage.getProduct(validated.productId);
      if (!product || product.supplierId !== req.auth.organizationId) {
        return res.status(400).json({ error: "Invalid product" });
      }
      const created = await storage.createInventoryRiskRecord({
        ...validated,
        supplierId: req.auth.organizationId,
        createdBy: req.auth.memberId,
      });
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(400).json({ error: "Invalid inventory risk data" });
    }
  });

  const updateInventoryRiskSchema = z.object({
    flaggedQuantity: z.number().int().positive().optional(),
    expiryDate: z.coerce.date().nullable().optional(),
    qualityStatus: z.enum(INVENTORY_RISK_QUALITY).optional(),
    note: z.string().nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    status: z.enum(INVENTORY_RISK_STATUSES).optional(),
  });

  app.patch("/api/inventory-risks/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (!can(req.auth.role, "inventory_risk.create")) {
        return res.status(403).json({ error: "forbidden", message: "Keine Berechtigung für diese Aktion." });
      }
      const existing = await storage.getInventoryRiskRecord(req.params.id);
      if (!existing || existing.supplierId !== req.auth.organizationId) {
        return res.status(404).json({ error: "Inventory risk record not found" });
      }
      const isManager = can(req.auth.role, "inventory_risk.manage");
      // Warehouse staff (no manage cap) may only edit their own records.
      if (!isManager && existing.createdBy !== req.auth.memberId) {
        return res.status(403).json({ error: "forbidden", message: "Sie können nur Ihre eigenen Meldungen bearbeiten." });
      }
      const validated = updateInventoryRiskSchema.parse(req.body);
      // Changing lifecycle status requires the manage capability; warehouse
      // staff may only edit their own record's details, not its status.
      if (!isManager && validated.status !== undefined) {
        return res.status(403).json({ error: "forbidden", message: "Statusänderungen erfordern die Berechtigung zur Verwaltung." });
      }
      const updated = await storage.updateInventoryRiskRecord(req.params.id, validated);
      if (!updated) return res.status(404).json({ error: "Inventory risk record not found" });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update inventory risk record" });
    }
  });

  // Turn a flagged record into a promotion. Requires inventory_risk.manage
  // (Product Manager). Creates a promotion, links it, and marks the record as
  // "Action Taken".
  const inventoryRiskActionSchema = z.object({
    discountPercent: z.number().int().min(1).max(100),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    name: z.string().optional(),
    description: z.string().optional(),
    targetRestaurantIds: z.array(z.string()).nullable().optional(),
  });

  app.post("/api/inventory-risks/:id/action", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getInventoryRiskRecord(req.params.id);
      if (!existing || existing.supplierId !== req.auth.organizationId) {
        return res.status(404).json({ error: "Inventory risk record not found" });
      }
      // Actioning a risk record creates a promotion, so it is gated by the
      // promotion capability (not inventory_risk.manage) to honour the
      // capability split between flagging risk and publishing promotions.
      const denied = checkActingCapability(req, existing.supplierId, "promotions.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      if (existing.status !== "Open") {
        return res.status(400).json({ error: "Only open records can be actioned" });
      }
      const { discountPercent, startDate, endDate, name, description, targetRestaurantIds } =
        inventoryRiskActionSchema.parse(req.body);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) return res.status(400).json({ error: "Start date cannot be in the past" });
      if (endDate <= startDate) return res.status(400).json({ error: "End date must be after start date" });

      // Create the promotion and flip the record atomically so a partial
      // failure can never leave a promotion without a linked record (or vice versa).
      const { record: updated, promotion: promo } = await storage.actionInventoryRiskRecord(
        existing.id,
        existing.productId,
        {
          productId: existing.productId,
          supplierId: existing.supplierId,
          discountPercent,
          startDate,
          endDate,
          isActive: true,
          name: name || null,
          description: description || null,
          groupId: randomUUID(),
          targetRestaurantIds: targetRestaurantIds || null,
        },
      );
      res.status(201).json({ record: updated, promotion: promo });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      console.error("Failed to action inventory risk:", error);
      res.status(500).json({ error: "Failed to action inventory risk record" });
    }
  });

  // ===== DELIVERY SCHEDULES =====
  app.get("/api/delivery-schedules", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const schedules = await storage.getDeliverySchedules(supplierId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch delivery schedules" });
    }
  });

  app.get("/api/delivery-schedules/restaurant", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.query.supplierId as string;
      const restaurantId = req.auth.organizationId;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
      const schedules = await storage.getDeliverySchedulesForRestaurant(supplierId, restaurantId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch delivery schedules" });
    }
  });

  app.put("/api/delivery-schedules", async (req, res) => {
    try {
      const validated = deliveryScheduleSchema.parse(req.body);
      // Supplier identity comes from the session, never the request body.
      const denied = checkActingCapability(req, validated.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      await storage.setDeliverySchedules(validated.supplierId, validated.restaurantId, validated.days);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update delivery schedules" });
    }
  });

  // ===== CUSTOM MIN ORDER QUANTITIES =====
  app.get("/api/custom-moq", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const moqs = await storage.getCustomMinOrderQuantities(supplierId);
      res.json(moqs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom MOQs" });
    }
  });

  app.get("/api/custom-moq/product", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const productId = req.query.productId as string;
      const restaurantId = req.auth.organizationId;
      if (!productId) {
        return res.status(400).json({ error: "Product ID required" });
      }
      const moq = await storage.getCustomMinOrderQuantity(productId, restaurantId);
      res.json(moq || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom MOQ" });
    }
  });

  app.put("/api/custom-moq", async (req, res) => {
    try {
      const validated = insertCustomMinOrderQuantitySchema.parse(req.body);
      const denied = checkActingCapability(req, validated.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      if (validated.minOrderQuantity < 1) {
        return res.status(400).json({ error: "minOrderQuantity must be >= 1" });
      }
      const moq = await storage.setCustomMinOrderQuantity(validated);
      res.json(moq);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to set custom MOQ" });
    }
  });

  app.delete("/api/custom-moq/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getCustomMinOrderQuantityById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });
      const denied = checkActingCapability(req, existing.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      await storage.deleteCustomMinOrderQuantity(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete custom MOQ" });
    }
  });

  // ===== CUSTOM PRICES =====
  app.get("/api/custom-prices", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const prices = req.auth.org.role === "supplier"
        ? await storage.getCustomPrices(req.auth.organizationId)
        : await storage.getCustomPricesByRestaurant(req.auth.organizationId);
      res.json(prices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom prices" });
    }
  });

  app.put("/api/custom-prices", async (req, res) => {
    try {
      const validated = insertCustomPriceSchema.parse(req.body);
      const denied = checkActingCapability(req, validated.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      if (parseFloat(validated.customPrice) <= 0) {
        return res.status(400).json({ error: "customPrice must be > 0" });
      }
      const price = await storage.setCustomPrice(validated);
      res.json(price);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to set custom price" });
    }
  });

  app.delete("/api/custom-prices/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getCustomPriceById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Not found" });
      const denied = checkActingCapability(req, existing.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      await storage.deleteCustomPrice(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete custom price" });
    }
  });

  // ===== SUPPLIER CUSTOMERS =====
  // Idempotently geocode any users that have an address but no coordinates yet.
  // Called lazily by the partner map so existing suppliers/restaurants show up
  // immediately without manual lat/lng entry. Safe to call repeatedly.
  app.post("/api/geocode/backfill", async (_req, res) => {
    try {
      if (!isGeocodingConfigured()) {
        return res.json({ configured: false, geocoded: 0, failed: 0, skipped: 0 });
      }
      const result = await backfillMissingCoordinates();
      res.json({ configured: true, ...result });
    } catch (error) {
      res.status(500).json({ error: "Failed to backfill coordinates" });
    }
  });

  app.get("/api/supplier/customers", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const restaurants = await storage.getRestaurantsForSupplier(supplierId);
      res.json(restaurants);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch supplier customers" });
    }
  });

  // ===== STOCK MOVEMENTS =====
  async function checkAndNotifyLowStock(productId: string, supplierId: string) {
    const product = await storage.getProduct(productId);
    if (!product) return;
    if (product.lowStockThreshold && product.lowStockThreshold > 0 && (product.stockQuantity ?? 0) <= product.lowStockThreshold) {
      await createNotificationWithPush({
        userId: supplierId,
        type: "low_stock",
        title: "Niedriger Lagerbestand",
        message: `${product.name}: Nur noch ${product.stockQuantity ?? 0} ${product.unit} auf Lager (Schwellenwert: ${product.lowStockThreshold})`,
        referenceId: product.id,
      }, "supplier");
    }
  }

  app.get("/api/stock-movements", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const productId = req.query.productId as string;
      if (productId) {
        // Ownership: a product's movements are only visible to its supplier.
        const product = await storage.getProduct(productId);
        if (!product || product.supplierId !== supplierId) {
          return res.status(403).json({ error: "forbidden" });
        }
        const movements = await storage.getStockMovements(productId);
        return res.json(movements);
      }
      const movements = await storage.getStockMovementsBySupplier(supplierId);
      return res.json(movements);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stock movements" });
    }
  });

  app.post("/api/stock-movements", async (req, res) => {
    try {
      const validated = stockMovementSchema.parse(req.body);
      const denied = checkActingCapability(req, validated.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      const product = await storage.getProduct(validated.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (product.supplierId !== req.auth!.organizationId) {
        return res.status(403).json({ error: "forbidden" });
      }
      const currentStock = product.stockQuantity ?? 0;
      let newStock: number;
      if (validated.type === "manual_set") {
        newStock = validated.quantity;
      } else if (validated.type === "manual_in") {
        newStock = currentStock + validated.quantity;
      } else {
        newStock = Math.max(0, currentStock - validated.quantity);
      }
      await storage.updateProductStock(validated.productId, newStock);
      const actingUserId = validated.userId ?? validated.supplierId;
      const actingUser = actingUserId ? await storage.getUser(actingUserId) : undefined;
      const movement = await storage.addStockMovement({
        productId: validated.productId,
        supplierId: validated.supplierId,
        userId: actingUserId,
        userName: actingUser?.name ?? null,
        type: validated.type,
        quantity: validated.quantity,
        previousStock: currentStock,
        newStock,
        note: validated.note || null,
      });
      if (validated.type === "manual_out" || validated.type === "manual_set") {
        await checkAndNotifyLowStock(validated.productId, validated.supplierId);
      }
      res.status(201).json(movement);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create stock movement" });
    }
  });

  app.get("/api/low-stock", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const lowStockProducts = await storage.getLowStockProducts(supplierId);
      res.json(lowStockProducts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch low stock products" });
    }
  });

  // ===== CART =====
  app.get("/api/cart", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const items = await storage.getCartItems(restaurantId);
      const activePromotions = await storage.getActivePromotions();
      const promoMap = new Map<string, typeof activePromotions[0]>();
      for (const promo of activePromotions) {
        const existing = promoMap.get(promo.productId);
        if (!existing || promo.discountPercent > existing.discountPercent) {
          promoMap.set(promo.productId, promo);
        }
      }
      const itemsWithPromo = items.map(item => ({
        ...item,
        activePromotion: promoMap.get(item.productId) || null,
      }));
      res.json(itemsWithPromo);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cart" });
    }
  });

  app.get("/api/cart/count", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const count = await storage.getCartCount(restaurantId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cart count" });
    }
  });

  app.post("/api/cart", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const { mode: modeParam, ...cartData } = req.body;
      const validated = insertCartItemSchema.parse({
        ...cartData,
        restaurantId: req.auth.organizationId,
      });
      const product = await storage.getProduct(validated.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      let minQty = product.minOrderQuantity || 1;
      const customMoq = await storage.getCustomMinOrderQuantity(validated.productId, validated.restaurantId);
      if (customMoq) {
        minQty = customMoq.minOrderQuantity;
      }
      if ((validated.quantity ?? 1) < minQty) {
        return res.status(400).json({ error: `Minimum order quantity is ${minQty}` });
      }
      const mode = modeParam === "set" ? "set" as const : "add" as const;
      const item = await storage.addToCart(validated, mode);
      res.status(201).json(item);
    } catch (error) {
      res.status(400).json({ error: "Invalid cart data" });
    }
  });

  app.patch("/api/cart/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const validated = updateCartQuantitySchema.parse(req.body);
      const cartItem = await storage.getCartItem(req.params.id);
      if (!cartItem) {
        return res.status(404).json({ error: "Cart item not found" });
      }
      if (cartItem.restaurantId !== req.auth.organizationId) {
        return res.status(403).json({ error: "forbidden" });
      }
      const product = await storage.getProduct(cartItem.productId);
      if (product) {
        let minQty = product.minOrderQuantity || 1;
        const customMoq = await storage.getCustomMinOrderQuantity(cartItem.productId, cartItem.restaurantId);
        if (customMoq) {
          minQty = customMoq.minOrderQuantity;
        }
        if (validated.quantity < minQty) {
          return res.status(400).json({ error: `Minimum order quantity is ${minQty}` });
        }
      }
      const updated = await storage.updateCartItem(req.params.id, validated.quantity);
      if (!updated) {
        return res.status(404).json({ error: "Cart item not found" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update cart item" });
    }
  });

  app.delete("/api/cart/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const cartItem = await storage.getCartItem(req.params.id);
      if (!cartItem) {
        return res.status(404).json({ error: "Cart item not found" });
      }
      if (cartItem.restaurantId !== req.auth.organizationId) {
        return res.status(403).json({ error: "forbidden" });
      }
      await storage.removeCartItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove cart item" });
    }
  });

  // ===== ORDERS =====
  app.get("/api/orders", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      // Self side is derived from the session; the counterparty id (if any) stays
      // a client-supplied filter.
      if (req.auth.org.role === "restaurant") {
        const restaurantId = req.auth.organizationId;
        const supplierId = req.query.supplierId as string;
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        return res.json(supplierId ? orders.filter(o => o.supplierId === supplierId) : orders);
      }
      const supplierId = req.auth.organizationId;
      const restaurantId = req.query.restaurantId as string;
      const orders = await storage.getOrdersBySupplier(supplierId);
      return res.json(restaurantId ? orders.filter(o => o.restaurantId === restaurantId) : orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/recent", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const orders = await storage.getRecentOrdersByRestaurant(restaurantId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent orders" });
    }
  });

  app.get("/api/orders/pending-count", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const count = await storage.getPendingOrderCount(supplierId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending count" });
    }
  });

  app.get("/api/orders/history", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const orders = await storage.getOrdersByRestaurant(restaurantId, { status: "delivered" });
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const denied = checkActingCapabilityIfProvided(req, [order.restaurantId, order.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const validated = createOrderSchema.parse(req.body);
      const { supplierId: targetSupplierId, notes, requestedDeliveryDate, deliveryDates, perSupplierNotes, createdByUserId } = validated;
      const restaurantId = req.auth.organizationId;
      const actingMemberId = req.auth.memberId;

      const orderDenied = checkActingCapability(req, restaurantId, "orders.create");
      if (orderDenied) {
        return res.status(orderDenied.status).json(orderDenied.body);
      }

      // Get cart items
      const allCartItems = await storage.getCartItems(restaurantId);
      if (allCartItems.length === 0) {
        return res.status(400).json({ error: "Cart is empty" });
      }

      // Filter to specific supplier if provided
      const cartItems = targetSupplierId
        ? allCartItems.filter(item => item.supplierId === targetSupplierId)
        : allCartItems;

      if (cartItems.length === 0) {
        return res.status(400).json({ error: "No items found for this supplier" });
      }

      // Group cart items by supplier
      const bySupplier = cartItems.reduce((acc, item) => {
        if (!acc[item.supplierId]) {
          acc[item.supplierId] = [];
        }
        acc[item.supplierId].push(item);
        return acc;
      }, {} as Record<string, typeof cartItems>);

      // Fetch active promotions for discounted pricing
      const activePromotions = await storage.getActivePromotions();
      const promoMap = new Map<string, typeof activePromotions[0]>();
      for (const promo of activePromotions) {
        const existing = promoMap.get(promo.productId);
        if (!existing || promo.discountPercent > existing.discountPercent) {
          promoMap.set(promo.productId, promo);
        }
      }

      // Enforce minimum order values
      const [restaurant] = await db.select().from(users).where(eq(users.id, restaurantId));
      const restaurantPostalCode = restaurant?.postalCode || "";
      const allMovs = await db.select().from(minimumOrderValues);
      const movMap: Record<string, number> = {};
      for (const mov of allMovs) {
        if (mov.zone && restaurantPostalCode && restaurantPostalCode.startsWith(mov.zone)) {
          movMap[mov.supplierId] = parseFloat(mov.minimumValue);
        } else if (!mov.zone && !(mov.supplierId in movMap)) {
          movMap[mov.supplierId] = parseFloat(mov.minimumValue);
        }
      }

      for (const [supplierId, items] of Object.entries(bySupplier)) {
        const movLimit = movMap[supplierId] || 0;
        if (movLimit > 0) {
          const supplierTotal = items.reduce((sum, item) => {
            const promo = promoMap.get(item.productId);
            const originalPrice = parseFloat(item.product.price);
            const effectivePrice = promo
              ? originalPrice * (1 - promo.discountPercent / 100)
              : originalPrice;
            return sum + effectivePrice * item.quantity;
          }, 0);
          if (supplierTotal < movLimit) {
            return res.status(400).json({ error: `Minimum order value of ${movLimit.toFixed(2)} EUR not reached for supplier` });
          }
        }
      }

      // Enforce stock availability at order placement to prevent overselling.
      // Mirror confirm-time semantics but stay lenient: only block on an explicit
      // out-of-stock flag, or when actively-tracked stock (>0) is exceeded.
      // Products with stockQuantity 0/null + inStock are treated as untracked and
      // allowed (stock is re-checked at supplier confirmation).
      const stockProblems: { name: string; requested: number; available: number }[] = [];
      for (const item of cartItems) {
        const p = item.product;
        if (!p) continue;
        if (p.inStock === false) {
          stockProblems.push({ name: p.name, requested: item.quantity, available: 0 });
        } else if (p.stockQuantity !== null && p.stockQuantity !== undefined && p.stockQuantity > 0 && item.quantity > p.stockQuantity) {
          stockProblems.push({ name: p.name, requested: item.quantity, available: p.stockQuantity });
        }
      }
      if (stockProblems.length > 0) {
        const detail = stockProblems
          .map(s => s.available > 0 ? `${s.name} (nur ${s.available} verfügbar)` : `${s.name} (nicht verfügbar)`)
          .join(", ");
        return res.status(400).json({
          error: "insufficient_stock",
          message: `Nicht genügend Lagerbestand: ${detail}.`,
          items: stockProblems,
        });
      }

      // Create orders for each supplier
      const createdOrders = [];
      for (const [supplierId, items] of Object.entries(bySupplier)) {
        const orderItems = items.map(item => {
          const promo = promoMap.get(item.productId);
          const originalPrice = parseFloat(item.product.price);
          const effectivePrice = promo
            ? originalPrice * (1 - promo.discountPercent / 100)
            : originalPrice;
          const unitPriceStr = effectivePrice.toFixed(2);
          return {
            productId: item.productId,
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: unitPriceStr,
            totalPrice: (effectivePrice * item.quantity).toFixed(2)
          };
        });

        const totalAmount = orderItems
          .reduce((sum, item) => sum + parseFloat(item.totalPrice), 0)
          .toFixed(2);

        const supplierDeliveryDate = deliveryDates?.[supplierId] || requestedDeliveryDate || null;
        const supplierNotes = perSupplierNotes?.[supplierId] || notes || null;
        const order = await storage.createOrder(
          { restaurantId, supplierId, totalAmount, status: "pending", notes: supplierNotes, requestedDeliveryDate: supplierDeliveryDate, createdByUserId: createdByUserId || restaurantId, createdByMemberId: actingMemberId || null },
          orderItems as any,
          { reserveStock: true, strictReserve: true }
        );
        createdOrders.push(order);
        // MAIN was debited (reserved) at placement; check low-stock now.
        for (const item of orderItems) {
          await checkAndNotifyLowStock(item.productId, supplierId);
        }
        
        await storage.addOrderStatusHistory(order.id, null, "pending", createdByUserId || restaurantId, actingMemberId || null);

        // Create order message in chat
        const conversation = await storage.getOrCreateConversation(restaurantId, supplierId);
        const orderContent = JSON.stringify({
          items: orderItems.map((item, idx) => ({
            name: item.productName,
            quantity: item.quantity,
            price: item.totalPrice,
            imageUrl: items[idx]?.product?.imageUrl || null
          })),
          total: totalAmount,
          orderId: order.id,
          orderNumber: formatOrderNumber(order),
        });
        await storage.sendMessage({
          conversationId: conversation.id,
          senderId: restaurantId,
          senderMemberId: actingMemberId || null,
          messageType: "order",
          content: orderContent,
          orderId: order.id,
        });
        
        const restaurant = await storage.getUser(restaurantId);
        await createNotificationWithPush({
          userId: supplierId,
          type: "new_order",
          title: `Neue Bestellung #${formatOrderNumber(order)}`,
          message: `${restaurant?.companyName || restaurant?.name || "Ein Betrieb"} hat eine neue Bestellung aufgegeben #${formatOrderNumber(order)} (€${totalAmount})`,
          referenceId: order.id
        }, "supplier");
      }

      // Clear cart - only for targeted supplier or all
      if (targetSupplierId) {
        await storage.clearCartBySupplier(restaurantId, targetSupplierId);
      } else {
        await storage.clearCart(restaurantId);
      }

      res.status(201).json(createdOrders);
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        return res.status(400).json({
          error: "insufficient_stock",
          message: `Nicht genügend Lagerbestand: ${error.productName} (nur ${error.available} verfügbar).`,
        });
      }
      console.error("Create order error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.post("/api/orders/direct", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const validated = directOrderSchema.parse(req.body);
      const { supplierId, items, notes, createdByUserId } = validated;
      const restaurantId = req.auth.organizationId;
      const actingMemberId = req.auth.memberId;

      const directDenied = checkActingCapability(req, restaurantId, "orders.create");
      if (directDenied) {
        return res.status(directDenied.status).json(directDenied.body);
      }

      const products = await storage.getProductsBySupplier(supplierId);
      const productMap = new Map(products.map(p => [p.id, p]));

      const activePromotions = await storage.getActivePromotions();
      const promoMap = new Map<string, typeof activePromotions[0]>();
      for (const promo of activePromotions) {
        const existing = promoMap.get(promo.productId);
        if (!existing || promo.discountPercent > existing.discountPercent) {
          promoMap.set(promo.productId, promo);
        }
      }

      const orderItems = [];
      const directStockProblems: { name: string; requested: number; available: number }[] = [];
      for (const item of items as { productId: string; quantity: number }[]) {
        const product = productMap.get(item.productId);
        if (!product) {
          return res.status(400).json({ error: `Product ${item.productId} not found` });
        }
        // Stock guard (mirrors POST /api/orders): block out-of-stock or
        // over-tracked-quantity; untracked stock (0/null + inStock) is allowed.
        if (product.inStock === false) {
          directStockProblems.push({ name: product.name, requested: item.quantity, available: 0 });
        } else if (product.stockQuantity !== null && product.stockQuantity !== undefined && product.stockQuantity > 0 && item.quantity > product.stockQuantity) {
          directStockProblems.push({ name: product.name, requested: item.quantity, available: product.stockQuantity });
        }
        const promo = promoMap.get(item.productId);
        const originalPrice = parseFloat(product.price);
        const effectivePrice = promo
          ? originalPrice * (1 - promo.discountPercent / 100)
          : originalPrice;
        orderItems.push({
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: effectivePrice.toFixed(2),
          totalPrice: (effectivePrice * item.quantity).toFixed(2)
        });
      }

      if (directStockProblems.length > 0) {
        const detail = directStockProblems
          .map(s => s.available > 0 ? `${s.name} (nur ${s.available} verfügbar)` : `${s.name} (nicht verfügbar)`)
          .join(", ");
        return res.status(400).json({
          error: "insufficient_stock",
          message: `Nicht genügend Lagerbestand: ${detail}.`,
          items: directStockProblems,
        });
      }

      const totalAmount = orderItems
        .reduce((sum: number, item) => sum + parseFloat(item.totalPrice), 0)
        .toFixed(2);

      const order = await storage.createOrder(
        { restaurantId, supplierId, totalAmount, status: "pending", notes: notes || "", createdByUserId: createdByUserId || restaurantId, createdByMemberId: actingMemberId || null },
        orderItems as any,
        { reserveStock: true, strictReserve: true }
      );
      // MAIN was debited (reserved) at placement; check low-stock now.
      for (const item of orderItems) {
        await checkAndNotifyLowStock(item.productId, supplierId);
      }
      
      await storage.addOrderStatusHistory(order.id, null, "pending", createdByUserId || restaurantId, actingMemberId || null);

      // Create order message in chat
      const conversation = await storage.getOrCreateConversation(restaurantId, supplierId);
      const productImages: Record<string, string | null> = {};
      for (const item of items) {
        const prod = productMap.get(item.productId);
        if (prod) productImages[item.productId] = prod.imageUrl || null;
      }
      const orderContent = JSON.stringify({
        items: orderItems.map(item => ({
          name: item.productName,
          quantity: item.quantity,
          price: item.totalPrice,
          imageUrl: productImages[item.productId] || null
        })),
        total: totalAmount,
        orderId: order.id,
        orderNumber: formatOrderNumber(order),
      });
      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: restaurantId,
        senderMemberId: actingMemberId || null,
        messageType: "order",
        content: orderContent,
        orderId: order.id,
      });

      res.status(201).json(order);
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        return res.status(400).json({
          error: "insufficient_stock",
          message: `Nicht genügend Lagerbestand: ${error.productName} (nur ${error.available} verfügbar).`,
        });
      }
      console.error("Direct order error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.post("/api/orders/:id/reorder", async (req, res) => {
    try {
      reorderSchema.parse(req.body);
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const denied = checkActingCapability(req, order.restaurantId, "orders.create");
      if (denied) return res.status(denied.status).json(denied.body);
      const restaurantId = order.restaurantId;
      if (order.status !== "delivered") {
        return res.status(400).json({ error: "Only delivered orders can be reordered" });
      }

      for (const item of order.items) {
        await storage.addToCart({
          restaurantId,
          productId: item.productId,
          supplierId: order.supplierId,
          quantity: item.quantity
        });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reorder" });
    }
  });

  app.post("/api/supplier/orders/batch-confirm", async (req, res) => {
    try {
      const parsed = z.object({ orderIds: z.array(z.string()) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request body" });
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      if (!can(req.auth.role, "orders.manage")) return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const { orderIds } = parsed.data;
      const results: { orderId: string; success: boolean; error?: string }[] = [];
      const actorUser = await storage.getUser(supplierId);
      const actorName = actorUser?.name ?? null;
      for (const orderId of orderIds) {
        try {
          const order = await storage.getOrder(orderId);
          if (!order || order.supplierId !== supplierId || order.status !== "pending") {
            results.push({ orderId, success: false, error: "Invalid order" });
            continue;
          }
          if (await hasOpenChangeRequest(order.id)) {
            results.push({ orderId, success: false, error: "Offene Änderungsanfrage – bitte zuerst beantworten." });
            continue;
          }
          // Stock was already reserved (MAIN -> ITI) at placement; confirming
          // does not move stock in the three-bucket model.
          await transitionOrderWithStock({
            order,
            newStatus: "confirmed",
            previousStatus: "pending",
            changedBy: supplierId,
            actorName,
            movementType: null,
            noteFn: () => `Batch: Bestellung #${formatOrderNumber(order)} bestätigt`,
          });
          results.push({ orderId, success: true });
        } catch (err: any) {
          console.error("Batch-confirm failed for order", orderId, err?.message);
          results.push({ orderId, success: false, error: "Processing failed" });
        }
      }
      res.json({ results, confirmed: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length });
    } catch (error) {
      res.status(500).json({ error: "Batch confirm failed" });
    }
  });

  app.post("/api/supplier/orders/batch-cancel", async (req, res) => {
    try {
      const parsed = z.object({ orderIds: z.array(z.string()) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request body" });
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      if (!can(req.auth.role, "orders.manage")) return res.status(403).json({ error: "forbidden" });
      // Supplier identity is the session org, never a client-supplied id.
      const supplierId = req.auth.organizationId;
      const { orderIds } = parsed.data;
      const results: { orderId: string; success: boolean; error?: string }[] = [];
      const actorUserCancel = await storage.getUser(supplierId);
      const actorNameCancel = actorUserCancel?.name ?? null;
      for (const orderId of orderIds) {
        try {
          const order = await storage.getOrder(orderId);
          if (!order || order.supplierId !== supplierId || order.status === "delivered" || order.status === "cancelled") {
            results.push({ orderId, success: false, error: "Invalid order" });
            continue;
          }
          if (await hasOpenChangeRequest(order.id)) {
            results.push({ orderId, success: false, error: "Offene Änderungsanfrage – bitte zuerst beantworten." });
            continue;
          }
          const previousStatus = order.status;
          // Any non-delivered order has its qty in ITI; cancelling returns it to MAIN.
          await transitionOrderWithStock({
            order,
            newStatus: "cancelled",
            previousStatus,
            changedBy: supplierId,
            actorName: actorNameCancel,
            movementType: "order_returned",
            noteFn: () => `Batch: Bestellung #${formatOrderNumber(order)} storniert – zurück ins Hauptlager`,
          });
          results.push({ orderId, success: true });
        } catch (err: any) {
          console.error("Batch-cancel failed for order", orderId, err?.message);
          results.push({ orderId, success: false, error: "Processing failed" });
        }
      }
      res.json({ results, cancelled: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length });
    } catch (error) {
      res.status(500).json({ error: "Batch cancel failed" });
    }
  });

  app.patch("/api/orders/:id/status", async (req, res) => {
    try {
      const { status, requestedDeliveryDate, deliveryNotes } = updateOrderStatusSchema.parse(req.body);
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const statusDenied = checkActingCapabilityIfProvided(
        req,
        [order.restaurantId, order.supplierId],
        "orders.manage",
      );
      if (statusDenied) {
        return res.status(statusDenied.status).json(statusDenied.body);
      }
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      // Actor attribution is derived from the session, never the request body,
      // so audit/history fields cannot be spoofed by the client.
      const changedBy = req.auth.organizationId;
      const actingMemberId = req.auth.memberId;
      const previousStatus = order.status;

      // Block status transitions while a change request is open. The supplier
      // (or anyone else) must respond approve/deny on the change request first.
      if (previousStatus !== status && await hasOpenChangeRequest(order.id)) {
        return res.status(409).json({
          error: "change_request_open",
          message: "Es liegt eine offene Änderungsanfrage für diese Bestellung vor. Bitte zuerst beantworten.",
        });
      }

      // Three-bucket stock model: qty was reserved (MAIN -> ITI) at placement.
      // Confirming does not move stock. Cancelling a non-delivered order returns
      // the reserved qty (ITI -> MAIN). Delivering outbounds it (ITI -> gone).
      let movementType: StockMovementType | null = null;
      let noteFn: TransitionOpts["noteFn"] | undefined;
      if (
        status === "cancelled" &&
        previousStatus !== "delivered" &&
        previousStatus !== "cancelled"
      ) {
        movementType = "order_returned";
        noteFn = () => `Bestellung #${formatOrderNumber(order)} storniert – zurück ins Hauptlager`;
      } else if (
        status === "delivered" &&
        (previousStatus === "in_delivery" || previousStatus === "confirmed" || previousStatus === "partially_confirmed")
      ) {
        movementType = "order_outbounded";
        noteFn = () => `Bestellung #${formatOrderNumber(order)} geliefert – aus Zwischenlager ausgebucht`;
      }

      const actorId = changedBy ?? order.supplierId;
      const actorUser = await storage.getUser(actorId);
      const actorName = actorUser?.name ?? null;

      const updated = await transitionOrderWithStock({
        order,
        newStatus: status,
        previousStatus,
        changedBy: changedBy ?? null,
        changedByMemberId: actingMemberId ?? null,
        actorName,
        movementType,
        noteFn,
        requestedDeliveryDate: requestedDeliveryDate ?? undefined,
        deliveryNotes: deliveryNotes ?? undefined,
      });

      // MAIN is debited at placement (reserve), so low-stock is checked there.
      // No low-stock notification is needed for confirm/cancel/deliver transitions.

      // Post a "delivery_status" chat message when supplier marks order as in_delivery,
      // so the restaurant sees the delivery date + optional supplier note in the chat thread.
      if (status === "in_delivery" && previousStatus !== "in_delivery") {
        try {
          const conversation = await storage.getOrCreateConversation(order.restaurantId, order.supplierId);
          await storage.sendMessage({
            conversationId: conversation.id,
            senderId: order.supplierId,
            messageType: "delivery_status",
            content: JSON.stringify({
              type: "in_delivery",
              orderId: order.id,
              orderNumber: formatOrderNumber(order),
              requestedDeliveryDate: requestedDeliveryDate ?? updated.requestedDeliveryDate ?? null,
              deliveryNotes: deliveryNotes ?? null,
            }),
            orderId: order.id,
          });
        } catch (err) {
          console.error("Failed to post delivery_status message:", err);
        }
      }

      // Auto-generate the delivery note as soon as shipping starts (in_delivery)
      // or, as a fallback, when the order is delivered without having passed
      // through in_delivery (e.g. confirmed -> delivered). The note is created
      // once; the document chat card is only posted when it's newly generated to
      // avoid duplicate messages across the in_delivery -> delivered transition.
      const shouldEnsureDeliveryNote =
        (status === "in_delivery" && previousStatus !== "in_delivery") ||
        (status === "delivered" &&
          (previousStatus === "in_delivery" ||
            previousStatus === "confirmed" ||
            previousStatus === "partially_confirmed"));
      if (shouldEnsureDeliveryNote) {
        try {
          const { document, created } = await ensureDeliveryNoteForOrder(order);
          if (created) {
            await postDeliveryNoteChatMessage(order, document);
          }
        } catch (err) {
          console.error("Failed to auto-generate delivery note:", err);
        }
      }

      res.json(updated);
    } catch (error: any) {
      if (error instanceof OrderTransitionConflictError) {
        return res.status(409).json({
          error: "status_conflict",
          message: "Der Status der Bestellung wurde inzwischen geändert. Bitte Seite aktualisieren und erneut versuchen.",
        });
      }
      if (error instanceof InsufficientStockError) {
        return res.status(409).json({
          error: "insufficient_stock",
          message: `Nicht genug Lagerbestand für ${error.productName} (benötigt: ${error.requested}).`,
        });
      }
      if (error?.message === "Order not found") {
        return res.status(404).json({ error: "Order not found" });
      }
      console.error("Update order status error:", error);
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  // ===== PARTIAL CONFIRMATION =====
  app.post("/api/orders/:id/confirm", async (req, res) => {
    try {
      const validated = confirmOrderSchema.parse(req.body);
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const denied = checkActingCapability(req, order.supplierId, "orders.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      if (order.status !== "pending") {
        return res.status(400).json({ error: "Only pending orders can be confirmed" });
      }

      const orderItemIds = new Set(order.items.map(i => i.id));
      const submittedIds = new Set(validated.items.map(i => i.orderItemId));
      if (submittedIds.size !== validated.items.length) {
        return res.status(400).json({ error: "Duplicate order item IDs in confirmation" });
      }
      if (submittedIds.size !== orderItemIds.size || [...submittedIds].some(id => !orderItemIds.has(id))) {
        return res.status(400).json({ error: "All order items must be included in confirmation, and no extra items" });
      }
      for (const item of validated.items) {
        const orderItem = order.items.find(i => i.id === item.orderItemId);
        if (orderItem && item.confirmedQuantity > orderItem.quantity) {
          return res.status(400).json({ error: `Confirmed quantity cannot exceed ordered quantity for ${orderItem.productName}` });
        }
      }

      // No stock pre-check needed: the full ordered qty was already reserved
      // (MAIN -> ITI) at placement. Confirming keeps the confirmed qty reserved
      // and returns the rejected portion (ITI -> MAIN) via txExtra below.
      let totalConfirmedAmount = 0;
      let allFullyConfirmed = true;
      let allRejected = true;
      const confirmationDetails: { name: string; ordered: number; confirmed: number; rejected: number; price: string }[] = [];
      const confirmedQuantitiesByItemId: Record<string, number> = {};

      for (const confirmItem of validated.items) {
        const orderItem = order.items.find(i => i.id === confirmItem.orderItemId)!;
        const rejectedQty = orderItem.quantity - confirmItem.confirmedQuantity;
        confirmedQuantitiesByItemId[confirmItem.orderItemId] = confirmItem.confirmedQuantity;

        const itemTotal = confirmItem.confirmedQuantity * Number(orderItem.unitPrice);
        totalConfirmedAmount += itemTotal;

        if (confirmItem.confirmedQuantity < orderItem.quantity) allFullyConfirmed = false;
        if (confirmItem.confirmedQuantity > 0) allRejected = false;

        confirmationDetails.push({
          name: orderItem.productName,
          ordered: orderItem.quantity,
          confirmed: confirmItem.confirmedQuantity,
          rejected: rejectedQty,
          price: itemTotal.toFixed(2),
        });
      }

      let newStatus: string;
      if (allRejected) {
        newStatus = "cancelled";
      } else if (allFullyConfirmed) {
        newStatus = "confirmed";
      } else {
        newStatus = "partially_confirmed";
      }

      const actorIdPC = validated.changedBy ?? order.supplierId;
      const actorUserPC = await storage.getUser(actorIdPC);
      const actorNamePC = actorUserPC?.name ?? null;
      const finalStatus = newStatus;

      const updated = await transitionOrderWithStock({
        order,
        newStatus: finalStatus,
        previousStatus: "pending",
        changedBy: validated.changedBy ?? null,
        actorName: actorNamePC,
        movementType: null,
        confirmedQuantitiesByItemId,
        totalAmountOverride: totalConfirmedAmount.toFixed(2),
        // Keep the confirmed qty reserved (ITI) and return the rejected portion
        // (reserved - confirmed) back to MAIN. Clamped against the actually
        // reserved remaining so under-reserved (lenient) orders never over-return.
        txExtra: async (tx) => {
          const remaining = await getReservedRemainingByProduct(tx, order.id);
          const confirmedByProduct = new Map<string, number>();
          const nameByProduct = new Map<string, string>();
          for (const ci of validated.items) {
            const oi = order.items.find(i => i.id === ci.orderItemId)!;
            confirmedByProduct.set(oi.productId, (confirmedByProduct.get(oi.productId) ?? 0) + ci.confirmedQuantity);
            nameByProduct.set(oi.productId, oi.productName);
          }
          for (const [productId, reservedQty] of remaining) {
            const keep = confirmedByProduct.get(productId) ?? 0;
            const toReturn = reservedQty - keep;
            if (toReturn > 0) {
              await applyBucketMovement(tx, {
                orderId: order.id,
                supplierId: order.supplierId,
                productId,
                productName: nameByProduct.get(productId) ?? "",
                type: "order_returned",
                qty: toReturn,
                actorId: actorIdPC,
                actorName: actorNamePC,
                note: `Bestellung #${formatOrderNumber(order)}: ${toReturn} abgelehnt – zurück ins Hauptlager`,
              });
            }
          }
        },
        noteFn: (item, qty) => {
          const orig = order.items.find(i => i.id === item.id)?.quantity ?? qty;
          return finalStatus === "partially_confirmed"
            ? `Bestellung #${formatOrderNumber(order)} teilbestätigt (${qty} von ${orig})`
            : `Bestellung #${formatOrderNumber(order)} bestätigt`;
        },
      });
      if (!updated) {
        return res.status(500).json({ error: "Failed to update order status" });
      }

      // Send notification to restaurant
      const supplier = await storage.getUser(order.supplierId);
      const isPartial = newStatus === "partially_confirmed";
      await createNotificationWithPush({
        userId: order.restaurantId,
        type: "order_status",
        title: isPartial
          ? `Bestellung teilbestätigt #${formatOrderNumber(order)}`
          : allRejected
            ? `Bestellung storniert #${formatOrderNumber(order)}`
            : `Bestellung bestätigt #${formatOrderNumber(order)}`,
        message: isPartial
          ? `${supplier?.companyName || supplier?.name || "Händler"} hat deine Bestellung bearbeitet. Einige Mengen wurden angepasst.`
          : allRejected
            ? `${supplier?.companyName || supplier?.name || "Händler"} hat die Bestellung storniert.`
            : `${supplier?.companyName || supplier?.name || "Händler"} hat deine Bestellung bestätigt.`,
        referenceId: order.id,
      }, "restaurant");

      // Send auto chat message
      const conversation = await storage.getOrCreateConversation(order.restaurantId, order.supplierId);
      const chatContent = JSON.stringify({
        type: "partial_confirmation",
        orderId: order.id,
        orderNumber: formatOrderNumber(order),
        status: newStatus,
        message: isPartial
          ? `Bestellung #${formatOrderNumber(order)} wurde bearbeitet. Einige Mengen wurden angepasst.`
          : allRejected
            ? `Bestellung #${formatOrderNumber(order)} wurde vollständig abgelehnt.`
            : `Bestellung #${formatOrderNumber(order)} wurde bestätigt.`,
        items: confirmationDetails,
        total: totalConfirmedAmount.toFixed(2),
        originalTotal: order.totalAmount,
      });

      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: order.supplierId,
        messageType: "order_change_request",
        content: chatContent,
        orderId: order.id,
        dismissed: false,
      });

      const updatedOrder = await storage.getOrder(req.params.id);
      res.json(updatedOrder);
    } catch (error: any) {
      if (error instanceof OrderTransitionConflictError) {
        return res.status(409).json({
          error: "status_conflict",
          message: "Der Status der Bestellung wurde inzwischen geändert. Bitte Seite aktualisieren und erneut versuchen.",
        });
      }
      if (error instanceof InsufficientStockError) {
        return res.status(409).json({
          error: "insufficient_stock",
          message: `Nicht genug Lagerbestand für ${error.productName} (benötigt: ${error.requested}).`,
        });
      }
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to confirm order" });
    }
  });

  app.patch("/api/orders/:id/reschedule", async (req, res) => {
    try {
      const { requestedDeliveryDate } = z.object({ requestedDeliveryDate: z.string() }).parse(req.body);
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      const denied = checkActingCapabilityIfProvided(req, [order.restaurantId, order.supplierId], "orders.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      if (order.status === "delivered" || order.status === "cancelled") {
        return res.status(400).json({ error: "Can only set delivery date for active orders" });
      }
      if (order.requestedDeliveryDate) {
        const dd = new Date(order.requestedDeliveryDate + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dd >= today) {
          return res.status(400).json({ error: "Can only reschedule overdue orders" });
        }
      }
      const setData: any = {
        requestedDeliveryDate,
        updatedAt: new Date(),
      };
      if (!order.originalDeliveryDate && order.requestedDeliveryDate) {
        setData.originalDeliveryDate = order.requestedDeliveryDate;
      }
      const [updated] = await db.update(orders).set(setData).where(eq(orders.id, req.params.id)).returning();
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reschedule order" });
    }
  });

  // ===== ORDER EDITING (pending only) =====
  app.patch("/api/orders/:id/items", async (req, res) => {
    try {
      const validated = editOrderItemsSchema.parse(req.body);
      const { items, requestedDeliveryDate } = validated;
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const denied = checkActingCapability(req, order.restaurantId, "orders.create");
      if (denied) return res.status(denied.status).json(denied.body);
      const restaurantId = order.restaurantId;
      if (order.status !== "pending") {
        return res.status(400).json({ error: "Only pending orders can be edited" });
      }

      // Server-side recomputation of unit prices from product master data
      // and currently-active promotions. The client-supplied unitPrice is
      // ignored to prevent tampering and to keep promo pricing consistent.
      const productIds = Array.from(new Set(items.map(i => i.productId)));
      const productRows = productIds.length > 0
        ? await db.select().from(products).where(
            productIds.length === 1
              ? eq(products.id, productIds[0])
              : sql`${products.id} = ANY(${productIds})`
          )
        : [];
      const productMap = new Map(productRows.map(p => [p.id, p]));

      // Mirrors POST /api/orders promotion selection (no targetRestaurantIds
      // filtering) so that editing a pending order yields the same prices it
      // would have at order-creation time.
      const activePromotions = await storage.getActivePromotions();
      const promoMap = new Map<string, typeof activePromotions[0]>();
      for (const promo of activePromotions) {
        const existing = promoMap.get(promo.productId);
        if (!existing || promo.discountPercent > existing.discountPercent) {
          promoMap.set(promo.productId, promo);
        }
      }

      // Validate all products before mapping so we can return precise 4xx
      // errors instead of falling through to a generic 500.
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) {
          return res.status(404).json({
            error: "product_not_found",
            productId: item.productId,
            message: `Produkt nicht gefunden (${item.productId}).`,
          });
        }
        if (product.supplierId !== order.supplierId) {
          return res.status(400).json({
            error: "product_wrong_supplier",
            productId: item.productId,
            message: `Produkt "${product.name}" gehört nicht zum Händler dieser Bestellung.`,
          });
        }
      }

      // Price lock: the unit price is snapshotted at order creation. When a
      // restaurant edits a pending order, products already on the order keep
      // their original unit price even if the supplier changed master/promo
      // pricing in the meantime. Only genuinely new line items are priced at
      // the current master+promo (recomputed server-side to prevent tampering).
      const existingUnitPriceByProduct = new Map<string, string>();
      for (const existing of order.items) {
        existingUnitPriceByProduct.set(existing.productId, existing.unitPrice);
      }

      const orderItems = items.map((item) => {
        const product = productMap.get(item.productId)!;
        const lockedUnitPrice = existingUnitPriceByProduct.get(item.productId);
        let unitPriceStr: string;
        if (lockedUnitPrice !== undefined) {
          unitPriceStr = lockedUnitPrice;
        } else {
          const promo = promoMap.get(item.productId);
          const originalPrice = parseFloat(product.price);
          const effectivePrice = promo
            ? originalPrice * (1 - promo.discountPercent / 100)
            : originalPrice;
          unitPriceStr = effectivePrice.toFixed(2);
        }
        const unitPriceNum = parseFloat(unitPriceStr);
        return {
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: unitPriceStr,
          totalPrice: (unitPriceNum * item.quantity).toFixed(2)
        };
      });

      const totalAmount = orderItems
        .reduce((sum: number, item: any) => sum + parseFloat(item.totalPrice), 0)
        .toFixed(2);

      // Three-bucket reservation diff: the pending order already has its qty
      // reserved (MAIN -> ITI). Compute per-product change between the currently
      // reserved amount and the new desired quantity, then move stock to match.
      // Everything below runs in ONE transaction that first locks the order row
      // and re-checks status, so a concurrent cancel/deliver cannot race between
      // the diff computation and applying the item update + stock movements.
      const newQtyByProduct = new Map<string, { qty: number; name: string }>();
      for (const oi of orderItems) {
        const cur = newQtyByProduct.get(oi.productId);
        if (cur) cur.qty += oi.quantity;
        else newQtyByProduct.set(oi.productId, { qty: oi.quantity, name: oi.productName });
      }

      let updated: Awaited<ReturnType<typeof storage.updateOrderItems>>;
      try {
        updated = await db.transaction(async (tx) => {
          // Lock the order row and re-verify it is still pending inside the tx.
          const lockRes: any = await tx.execute(sql`SELECT status FROM orders WHERE id = ${req.params.id} FOR UPDATE`);
          const lockRow = lockRes.rows?.[0];
          if (!lockRow || lockRow.status !== "pending") {
            throw new OrderNotPendingError();
          }

          const reservedRemaining = await getReservedRemainingByProduct(tx, order.id);
          const affectedProductIds = new Set<string>([
            ...reservedRemaining.keys(),
            ...newQtyByProduct.keys(),
          ]);

          for (const pid of affectedProductIds) {
            const oldQty = reservedRemaining.get(pid) ?? 0;
            const newInfo = newQtyByProduct.get(pid);
            const newQty = newInfo?.qty ?? 0;
            const name = newInfo?.name ?? order.items.find(i => i.productId === pid)?.productName ?? "";
            const diff = newQty - oldQty;
            if (diff > 0) {
              // strict (default): throws InsufficientStockError if MAIN is too
              // low at apply time, rolling back the whole edit.
              await applyBucketMovement(tx, {
                orderId: order.id,
                supplierId: order.supplierId,
                productId: pid,
                productName: name,
                type: "order_reserved",
                qty: diff,
                actorId: order.restaurantId,
                note: `Bestellung #${formatOrderNumber(order)} angepasst – ${diff} zusätzlich reserviert`,
              });
            } else if (diff < 0) {
              await applyBucketMovement(tx, {
                orderId: order.id,
                supplierId: order.supplierId,
                productId: pid,
                productName: name,
                type: "order_returned",
                qty: -diff,
                actorId: order.restaurantId,
                note: `Bestellung #${formatOrderNumber(order)} angepasst – ${-diff} zurück ins Hauptlager`,
              });
            }
          }

          // Apply the item/total update inside the same transaction.
          return await storage.updateOrderItems(req.params.id, orderItems as any, totalAmount, requestedDeliveryDate, tx);
        });
      } catch (txErr) {
        if (txErr instanceof OrderNotPendingError) {
          return res.status(400).json({ error: "Only pending orders can be edited" });
        }
        if (txErr instanceof InsufficientStockError) {
          return res.status(400).json({
            error: "insufficient_stock",
            productName: txErr.productName,
            message: `Nicht genügend Lagerbestand: ${txErr.productName} (nur ${txErr.available} verfügbar).`,
          });
        }
        throw txErr;
      }

      const conversation = await storage.getOrCreateConversation(order.restaurantId, order.supplierId);
      const restaurant = await storage.getUser(order.restaurantId);
      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: order.restaurantId,
        messageType: "order_change_request",
        content: JSON.stringify({
          type: "order_edited",
          orderId: order.id,
          orderNumber: formatOrderNumber(order),
          message: `Bestellung #${formatOrderNumber(order)} wurde angepasst`,
          items: orderItems.map((i: any) => ({ name: i.productName, quantity: i.quantity, price: i.totalPrice })),
          total: totalAmount
        }),
        orderId: order.id,
      });

      await createNotificationWithPush({
        userId: order.supplierId,
        type: "order_status",
        title: `Bestellung angepasst #${formatOrderNumber(order)}`,
        message: `${restaurant?.companyName || restaurant?.name || "Ein Betrieb"} hat Bestellung #${formatOrderNumber(order)} angepasst`,
        referenceId: order.id
      }, "supplier");

      res.json(updated);
    } catch (error) {
      console.error("Update order items error:", error);
      res.status(500).json({ error: "Failed to update order items" });
    }
  });

  // ===== ORDER CHANGE REQUEST (for confirmed+ orders) =====
  app.post("/api/orders/:id/change-request", async (req, res) => {
    try {
      const { reason } = changeRequestSchema.parse(req.body);
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const denied = checkActingCapability(req, order.restaurantId, "orders.create");
      if (denied) return res.status(denied.status).json(denied.body);
      if (order.status === "pending" || order.status === "delivered" || order.status === "cancelled") {
        return res.status(400).json({ error: "Change request not applicable for this status" });
      }

      // Reject duplicate change requests — exactly one open request at a time.
      if (await hasOpenChangeRequest(order.id)) {
        return res.status(409).json({
          error: "change_request_already_open",
          message: "Es liegt bereits eine offene Änderungsanfrage für diese Bestellung vor.",
        });
      }

      const conversation = await storage.getOrCreateConversation(order.restaurantId, order.supplierId);
      const restaurant = await storage.getUser(order.restaurantId);

      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: order.restaurantId,
        messageType: "order_change_request",
        content: JSON.stringify({
          type: "change_request",
          orderId: order.id,
          orderNumber: formatOrderNumber(order),
          status: "pending",
          reason: reason || "",
          message: `Änderungsanfrage für Bestellung #${formatOrderNumber(order)}`
        }),
        orderId: order.id,
      });

      await createNotificationWithPush({
        userId: order.supplierId,
        type: "order_status",
        title: `Änderungsanfrage #${formatOrderNumber(order)}`,
        message: `${restaurant?.companyName || restaurant?.name || "Ein Betrieb"} möchte Bestellung #${formatOrderNumber(order)} ändern`,
        referenceId: order.id
      }, "supplier");

      res.json({ success: true });
    } catch (error) {
      console.error("Change request error:", error);
      res.status(500).json({ error: "Failed to send change request" });
    }
  });

  app.post("/api/orders/:id/change-request/respond", async (req, res) => {
    try {
      const { approved } = changeRequestRespondSchema.parse(req.body);
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const authErr = checkActingCapability(req, order.supplierId, "orders.manage");
      if (authErr) return res.status(authErr.status).json(authErr.body);
      const supplierId = order.supplierId;
      if (order.status === "delivered" || order.status === "cancelled" || order.status === "pending") {
        return res.status(400).json({ error: "Cannot respond to change request for this order status" });
      }

      // Must actually have an open change request to respond to. Without this
      // check, repeated responses would push the open-counter negative and
      // mask future real requests.
      if (!(await hasOpenChangeRequest(order.id))) {
        return res.status(409).json({
          error: "no_open_change_request",
          message: "Es gibt keine offene Änderungsanfrage für diese Bestellung.",
        });
      }

      const conversation = await storage.getOrCreateConversation(order.restaurantId, order.supplierId);
      const supplier = await storage.getUser(order.supplierId);

      if (approved) {
        const previousStatus = order.status;
        // Three-bucket model: the order's qty stays reserved (ITI) while it goes
        // back to pending for editing. No stock movement on approval.

        // Status transition + response chat message must be atomic. Otherwise
        // a failed message insert would leave the order in `pending` while
        // hasOpenChangeRequest() still reports an open request, deadlocking
        // the workflow (no further /respond and no /status transitions).
        const responseContent = JSON.stringify({
          type: "change_request_response",
          orderId: order.id,
          orderNumber: formatOrderNumber(order),
          approved: true,
          message: `Änderungsanfrage für Bestellung #${formatOrderNumber(order)} genehmigt – Bestellung ist wieder offen zur Bearbeitung`
        });

        await transitionOrderWithStock({
          order,
          newStatus: "pending",
          previousStatus,
          changedBy: supplierId,
          actorName: supplier?.name ?? null,
          movementType: null,
          noteFn: () => `Bestellung #${formatOrderNumber(order)} zurück auf ausstehend (Änderungsanfrage genehmigt)`,
          txExtra: async (tx) => {
            await tx.insert(messages).values({
              conversationId: conversation.id,
              senderId: order.supplierId,
              messageType: "order_change_request",
              content: responseContent,
              orderId: order.id,
            });
            // Mirror storage.sendMessage's side effect so inbox ordering by
            // lastMessageAt stays correct after the approval response.
            await tx
              .update(conversations)
              .set({ lastMessageAt: new Date() })
              .where(eq(conversations.id, conversation.id));
          },
        });

        await createNotificationWithPush({
          userId: order.restaurantId,
          type: "order_status",
          title: `Änderung genehmigt #${formatOrderNumber(order)}`,
          message: `${supplier?.companyName || supplier?.name || "Händler"} hat die Änderungsanfrage für Bestellung #${formatOrderNumber(order)} genehmigt`,
          referenceId: order.id
        }, "restaurant");
      } else {
        await storage.sendMessage({
          conversationId: conversation.id,
          senderId: order.supplierId,
          messageType: "order_change_request",
          content: JSON.stringify({
            type: "change_request_response",
            orderId: order.id,
            orderNumber: formatOrderNumber(order),
            approved: false,
            message: `Änderungsanfrage für Bestellung #${formatOrderNumber(order)} abgelehnt`
          }),
          orderId: order.id,
        });

        await createNotificationWithPush({
          userId: order.restaurantId,
          type: "order_status",
          title: `Änderung abgelehnt #${formatOrderNumber(order)}`,
          message: `${supplier?.companyName || supplier?.name || "Händler"} hat die Änderungsanfrage für Bestellung #${formatOrderNumber(order)} abgelehnt`,
          referenceId: order.id
        }, "restaurant");
      }

      res.json({ success: true, approved });
    } catch (error) {
      if (error instanceof OrderTransitionConflictError) {
        return res.status(409).json({
          error: "status_conflict",
          message: "Der Status der Bestellung wurde inzwischen geändert. Bitte Seite aktualisieren und erneut versuchen.",
        });
      }
      console.error("Change request respond error:", error);
      res.status(500).json({ error: "Failed to respond to change request" });
    }
  });

  // ===== SUPPLIER ORDERS =====
  app.get("/api/supplier/orders", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const orders = await storage.getOrdersBySupplier(supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/supplier/upcoming-deliveries", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const inDeliveryOrders = await storage.getOrdersBySupplier(supplierId, { status: "in_delivery" });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfTomorrow = new Date(today);
      endOfTomorrow.setDate(endOfTomorrow.getDate() + 2);

      const relevant = inDeliveryOrders.filter(o => {
        if (!o.requestedDeliveryDate) return true;
        const dd = new Date(o.requestedDeliveryDate + "T00:00:00");
        return dd >= today && dd < endOfTomorrow;
      });

      relevant.sort((a, b) => {
        const dateA = a.requestedDeliveryDate ? new Date(a.requestedDeliveryDate + "T00:00:00").getTime() : Infinity;
        const dateB = b.requestedDeliveryDate ? new Date(b.requestedDeliveryDate + "T00:00:00").getTime() : Infinity;
        return dateA - dateB;
      });

      res.json(relevant);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch upcoming deliveries" });
    }
  });

  app.get("/api/supplier/orders/recent", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const orders = await storage.getRecentOrdersBySupplier(supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent orders" });
    }
  });

  app.get("/api/supplier/action-required", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const staleOrders = await db
        .select()
        .from(orders)
        .where(and(
          eq(orders.supplierId, supplierId),
          eq(orders.status, "pending"),
          sql`${orders.createdAt} < ${twentyFourHoursAgo}`
        ))
        .orderBy(asc(orders.createdAt));

      const staleOrdersWithDetails: any[] = [];
      for (const order of staleOrders) {
        const hasStatusChange = await db.select({ id: orderStatusHistory.id })
          .from(orderStatusHistory)
          .where(and(
            eq(orderStatusHistory.orderId, order.id),
            sql`${orderStatusHistory.fromStatus} IS NOT NULL`
          ))
          .limit(1);

        const hasMessages = await db.select({ id: messages.id })
          .from(messages)
          .where(and(
            eq(messages.orderId, order.id),
            sql`${messages.messageType} != 'order'`
          ))
          .limit(1);

        const hasComplaint = await db.select({ id: complaints.id })
          .from(complaints)
          .where(eq(complaints.orderId, order.id))
          .limit(1);

        if (hasStatusChange.length === 0 && hasMessages.length === 0 && hasComplaint.length === 0) {
          const fullOrder = await storage.getOrder(order.id);
          if (fullOrder) staleOrdersWithDetails.push(fullOrder);
        }
      }

      const openComplaints = await db
        .select()
        .from(complaints)
        .where(and(
          eq(complaints.supplierId, supplierId),
          sql`${complaints.status} != 'closed'`
        ))
        .orderBy(desc(complaints.createdAt));

      const complaintsWithDetails = [];
      for (const complaint of openComplaints) {
        const [order] = await db.select().from(orders).where(eq(orders.id, complaint.orderId));
        const [restaurant] = await db.select().from(users).where(eq(users.id, complaint.restaurantId));
        const [supplier] = await db.select().from(users).where(eq(users.id, complaint.supplierId));
        complaintsWithDetails.push({ ...complaint, order, restaurant, supplier });
      }

      res.json({ staleOrders: staleOrdersWithDetails, openComplaints: complaintsWithDetails });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch action required data" });
    }
  });

  app.get("/api/supplier/orders/history", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const orders = await storage.getOrdersBySupplier(supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  // ===== CONVERSATIONS =====
  app.get("/api/conversations", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const conversations = await storage.getConversations(userId, req.auth.org.role as "restaurant" | "supplier");
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/unread", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const count = await storage.getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      const denied = checkActingCapabilityIfProvided(req, [conversation.restaurantId, conversation.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      const messages = await storage.getMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/conversations/:id/statuses", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      const denied = checkActingCapabilityIfProvided(req, [conversation.restaurantId, conversation.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      const statuses = await storage.getConversationStatuses(req.params.id);
      res.json(statuses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statuses" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const validated = sendMessageSchema.parse(req.body);
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) return res.status(404).json({ error: "Conversation not found" });
      const messageDenied = checkActingCapabilityIfProvided(req, [conversation.restaurantId, conversation.supplierId], "chat");
      if (messageDenied) {
        return res.status(messageDenied.status).json(messageDenied.body);
      }
      // Sender identity comes from the session, never the client body.
      const senderId = req.auth.organizationId;
      const message = await storage.sendMessage({
        conversationId: req.params.id,
        senderId,
        senderMemberId: req.auth.memberId,
        messageType: validated.messageType || "text",
        content: validated.content,
        priority: validated.priority || "standard",
        audioUrl: validated.audioUrl,
        audioDurationMs: validated.audioDurationMs,
      });
      
      {
        // Determine recipient: if sender is restaurant, recipient is supplier, and vice versa
        const recipientId = conversation.restaurantId === senderId 
          ? conversation.supplierId 
          : conversation.restaurantId;
        
        const sender = await storage.getUser(senderId);
        const recipientRole = recipientId === conversation.restaurantId ? "restaurant" : "supplier";
        await createNotificationWithPush({
          userId: recipientId,
          type: "new_message",
          title: "Neue Nachricht",
          message: `${sender?.companyName || sender?.name || "Jemand"} hat Ihnen eine Nachricht gesendet`,
          referenceId: req.params.id
        }, recipientRole);
      }
      
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/conversations/:id/read", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const conv = await storage.getConversation(req.params.id);
      if (!conv) return res.status(404).json({ error: "Conversation not found" });
      const userId = req.auth.organizationId;
      if (![conv.restaurantId, conv.supplierId].includes(userId)) {
        return res.status(403).json({ error: "Not a participant" });
      }
      await storage.markMessagesAsRead(req.params.id, userId);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  app.patch("/api/conversations/:id/pin", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const schema = z.object({ isPinned: z.boolean() }).strict();
      const { isPinned } = schema.parse(req.body);
      const userId = req.auth.organizationId;
      const conv = await storage.getConversation(req.params.id);
      if (!conv) return res.status(404).json({ error: "Conversation not found" });
      let role: "restaurant" | "supplier" | null = null;
      if (conv.restaurantId === userId) role = "restaurant";
      else if (conv.supplierId === userId) role = "supplier";
      if (!role) return res.status(403).json({ error: "Not a participant" });
      await storage.setConversationPinned(req.params.id, role, isPinned);
      res.json({ success: true, isPinned });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update pin" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const validated = createConversationSchema.parse(req.body);
      const orgId = req.auth.organizationId;
      if (![validated.restaurantId, validated.supplierId].includes(orgId)) {
        return res.status(403).json({ error: "Not a participant" });
      }
      const conversation = await storage.getOrCreateConversation(validated.restaurantId, validated.supplierId);
      res.json(conversation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.post("/api/send-referenced-message", async (req, res) => {
    try {
      const schema = z.object({
        senderId: uuidField,
        restaurantId: uuidField,
        supplierId: uuidField,
        message: z.string().min(1).max(5000),
        referenceType: z.enum(["order", "complaint"]),
        referenceId: uuidField,
        referenceLabel: z.string().max(200),
      }).strict();
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const validated = schema.parse(req.body);
      const senderId = req.auth.organizationId;
      const refDenied = checkActingCapabilityIfProvided(req, [validated.restaurantId, validated.supplierId], "chat");
      if (refDenied) return res.status(refDenied.status).json(refDenied.body);
      const conversation = await storage.getOrCreateConversation(validated.restaurantId, validated.supplierId);
      const content = JSON.stringify({
        refType: validated.referenceType,
        refId: validated.referenceId,
        refLabel: validated.referenceLabel,
        text: validated.message,
      });
      const message = await storage.sendMessage({
        conversationId: conversation.id,
        senderId,
        senderMemberId: req.auth.memberId,
        messageType: "text",
        content,
      });
      const sender = await storage.getUser(senderId);
      const recipientId = conversation.restaurantId === senderId
        ? conversation.supplierId
        : conversation.restaurantId;
      const recipientRole2 = recipientId === conversation.restaurantId ? "restaurant" : "supplier";
      await createNotificationWithPush({
        userId: recipientId,
        type: "new_message",
        title: "Neue Nachricht",
        message: `${sender?.companyName || sender?.name || "Jemand"} hat Ihnen eine Nachricht gesendet`,
        referenceId: conversation.id
      }, recipientRole2);
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // ===== ORDER TEMPLATES =====
  app.get("/api/order-templates", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const templates = await storage.getOrderTemplates(restaurantId);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/order-templates/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const template = await storage.getOrderTemplate(req.params.id);
      if (!template) return res.status(404).json({ error: "Template not found" });
      const denied = checkActingCapability(req, template.restaurantId, "orders.create");
      if (denied) return res.status(denied.status).json(denied.body);
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  app.post("/api/order-templates", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const denied = checkActingCapability(req, restaurantId, "orders.create");
      if (denied) return res.status(denied.status).json(denied.body);
      const { name, items } = req.body;
      if (!name || !items?.length) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const template = await storage.createOrderTemplate(
        { restaurantId, name },
        items.map((i: { productId: string; quantity: number }) => ({ templateId: "", productId: i.productId, quantity: i.quantity }))
      );
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  app.patch("/api/order-templates/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getOrderTemplate(req.params.id);
      if (!existing) return res.status(404).json({ error: "Template not found" });
      const denied = checkActingCapability(req, existing.restaurantId, "orders.create");
      if (denied) return res.status(denied.status).json(denied.body);
      const { name, items } = req.body;
      if (!name || !items?.length) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const template = await storage.updateOrderTemplate(
        req.params.id,
        name,
        items.map((i: { productId: string; quantity: number }) => ({ templateId: req.params.id, productId: i.productId, quantity: i.quantity }))
      );
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  app.patch("/api/order-templates/:id/favorite", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getOrderTemplate(req.params.id);
      if (!existing) return res.status(404).json({ error: "Template not found" });
      const denied = checkActingCapability(req, existing.restaurantId, "orders.create");
      if (denied) return res.status(denied.status).json(denied.body);
      const { isFavorite } = req.body;
      if (typeof isFavorite !== "boolean") {
        return res.status(400).json({ error: "isFavorite must be a boolean" });
      }
      try {
        const updated = await storage.setOrderTemplateFavorite(req.params.id, isFavorite);
        if (!updated) return res.status(404).json({ error: "Template not found" });
        res.json(updated);
      } catch (e: any) {
        if (e?.message === "MAX_FAVORITES") {
          return res.status(400).json({ error: "MAX_FAVORITES" });
        }
        throw e;
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to update favorite" });
    }
  });

  app.delete("/api/order-templates/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getOrderTemplate(req.params.id);
      if (!existing) return res.status(404).json({ error: "Template not found" });
      const denied = checkActingCapability(req, existing.restaurantId, "orders.create");
      if (denied) return res.status(denied.status).json(denied.body);
      await storage.deleteOrderTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // ===== STATS =====
  app.get("/api/restaurant/upcoming-deliveries", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const relevantOrders = await storage.getOrdersByRestaurant(restaurantId, { status: ["confirmed", "in_delivery", "delivered"] });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const relevant = relevantOrders.filter(o => {
        if (o.status === "delivered") {
          const updatedAt = o.updatedAt ? new Date(o.updatedAt) : null;
          if (!updatedAt) return false;
          return updatedAt >= today && updatedAt < tomorrow;
        }
        if (o.status === "confirmed" || o.status === "in_delivery") {
          return !!o.requestedDeliveryDate;
        }
        return false;
      });

      relevant.sort((a, b) => {
        if (a.status === "delivered" && b.status !== "delivered") return 1;
        if (a.status !== "delivered" && b.status === "delivered") return -1;
        const dateA = a.requestedDeliveryDate ? new Date(a.requestedDeliveryDate + "T00:00:00").getTime() : 0;
        const dateB = b.requestedDeliveryDate ? new Date(b.requestedDeliveryDate + "T00:00:00").getTime() : 0;
        return dateA - dateB;
      });

      res.json(relevant.slice(0, 10));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch upcoming deliveries" });
    }
  });

  // ===== DELIVERY CALENDAR (Task #37) =====
  // Returns orders with a delivery date in [from, to], rolespecific.
  // Used by the calendar month/week views.
  app.get("/api/calendar/deliveries", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const role = req.auth.org.role;
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRe.test(from) || !dateRe.test(to)) return res.json([]);

      const all = role === "restaurant"
        ? await storage.getOrdersByRestaurant(userId, { status: ["confirmed", "partially_confirmed", "in_delivery", "delivered"] })
        : await storage.getOrdersBySupplier(userId, { status: ["confirmed", "partially_confirmed", "in_delivery", "delivered"] });

      const result = all.filter(o => {
        if (!o.requestedDeliveryDate) return false;
        return o.requestedDeliveryDate >= from && o.requestedDeliveryDate <= to;
      });
      res.json(result);
    } catch (error) {
      console.error("calendar deliveries error", error);
      res.status(500).json({ error: "Failed to fetch calendar deliveries" });
    }
  });

  // ICS export of the next 60 days of deliveries.
  app.get("/api/calendar/deliveries.ics", async (req, res) => {
    try {
      // .ics has no token-based access in this app, so it requires the session
      // cookie like every other endpoint.
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const role = req.auth.org.role;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(today);
      end.setDate(end.getDate() + 60);
      const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const fromStr = fmtDate(today);
      const toStr = fmtDate(end);

      const all = role === "restaurant"
        ? await storage.getOrdersByRestaurant(userId, { status: ["confirmed", "partially_confirmed", "in_delivery", "delivered"] })
        : await storage.getOrdersBySupplier(userId, { status: ["confirmed", "partially_confirmed", "in_delivery", "delivered"] });

      const relevant = all.filter(o => o.requestedDeliveryDate && o.requestedDeliveryDate >= fromStr && o.requestedDeliveryDate <= toStr);

      const dtNow = new Date();
      const dtstamp = `${dtNow.getUTCFullYear()}${String(dtNow.getUTCMonth()+1).padStart(2,"0")}${String(dtNow.getUTCDate()).padStart(2,"0")}T${String(dtNow.getUTCHours()).padStart(2,"0")}${String(dtNow.getUTCMinutes()).padStart(2,"0")}${String(dtNow.getUTCSeconds()).padStart(2,"0")}Z`;

      const escapeIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

      const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//GastroConnect//Deliveries//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${role === "restaurant" ? "GastroConnect Lieferungen" : "GastroConnect Auslieferungen"}`,
      ];

      for (const o of relevant) {
        if (!o.requestedDeliveryDate) continue;
        const dateCompact = o.requestedDeliveryDate.replace(/-/g, "");
        const nextDate = new Date(o.requestedDeliveryDate + "T00:00:00");
        nextDate.setDate(nextDate.getDate() + 1);
        const endCompact = `${nextDate.getFullYear()}${String(nextDate.getMonth()+1).padStart(2,"0")}${String(nextDate.getDate()).padStart(2,"0")}`;
        const counterparty = role === "restaurant" ? (o.supplier?.companyName || o.supplier?.name || "") : (o.restaurant?.companyName || o.restaurant?.name || "");
        const orderNo = formatOrderNumber({ orderNumber: o.orderNumber, id: o.id });
        const summary = `${role === "restaurant" ? "Lieferung von" : "Lieferung an"} ${counterparty} (#${orderNo})`;
        const itemsList = (o.items || []).map(i => `- ${i.quantity}x ${i.productName}`).join("\n");
        const description = [
          `Status: ${o.status}`,
          `Bestellung: #${orderNo}`,
          itemsList ? `\nArtikel:\n${itemsList}` : "",
          o.notes ? `\nNotizen: ${o.notes}` : "",
        ].filter(Boolean).join("\n");
        lines.push(
          "BEGIN:VEVENT",
          `UID:gastroconnect-order-${o.id}@gastroconnect`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${dateCompact}`,
          `DTEND;VALUE=DATE:${endCompact}`,
          `SUMMARY:${escapeIcs(summary)}`,
          `DESCRIPTION:${escapeIcs(description)}`,
          `STATUS:CONFIRMED`,
          "END:VEVENT",
        );
      }
      lines.push("END:VCALENDAR");

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="gastroconnect-${role}-deliveries.ics"`);
      res.send(lines.join("\r\n"));
    } catch (error) {
      console.error("calendar ics error", error);
      res.status(500).send("Failed to generate calendar");
    }
  });

  app.get("/api/restaurant/stats", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const stats = await storage.getRestaurantStats(restaurantId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/supplier/stats", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const stats = await storage.getSupplierStats(supplierId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/supplier/detailed-stats", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const periodRaw = (req.query.period as string) || "6m";
      const period: "7d" | "30d" | "6m" | "12m" =
        periodRaw === "7d" || periodRaw === "30d" || periodRaw === "12m" ? periodRaw : "6m";
      const stats = await storage.getSupplierDetailedStats(supplierId, period);
      res.json(stats);
    } catch (error) {
      console.error("detailed-stats error", error);
      res.status(500).json({ error: "Failed to fetch detailed stats" });
    }
  });

  app.get("/api/supplier/insights", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const insights = await storage.getSupplierInsights(supplierId);
      res.json(insights);
    } catch (error) {
      console.error("supplier insights error", error);
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  app.get("/api/supplier/inactive-restaurants", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const result = await storage.getInactiveRestaurants(supplierId);
      res.json(result);
    } catch (error) {
      console.error("inactive restaurants error", error);
      res.status(500).json({ error: "Failed to fetch inactive restaurants" });
    }
  });

  app.get("/api/restaurant/detailed-stats", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const stats = await storage.getRestaurantDetailedStats(restaurantId);
      res.json(stats);
    } catch (error) {
      console.error("restaurant detailed-stats error", error);
      res.status(500).json({ error: "Failed to fetch detailed stats" });
    }
  });

  app.get("/api/supplier/settings/revenue-target", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const user = await storage.getUser(supplierId);
      if (!user || user.role !== "supplier") {
        return res.status(404).json({ error: "Supplier not found" });
      }
      const value = user.monthlyRevenueTarget ? Number(user.monthlyRevenueTarget) : null;
      res.json({ monthlyRevenueTarget: value });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch revenue target" });
    }
  });

  app.patch("/api/supplier/settings/revenue-target", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const schema = z.object({
        supplierId: uuidField.optional(),
        monthlyRevenueTarget: z.number().min(0).max(99999999).nullable(),
      }).strict();
      const { monthlyRevenueTarget } = schema.parse(req.body);
      const supplierId = req.auth.organizationId;
      const existing = await storage.getUser(supplierId);
      if (!existing || existing.role !== "supplier") {
        return res.status(404).json({ error: "Supplier not found" });
      }
      const updated = await storage.updateUser(supplierId, {
        monthlyRevenueTarget: monthlyRevenueTarget === null ? null : monthlyRevenueTarget.toFixed(2),
      });
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({ monthlyRevenueTarget: updated.monthlyRevenueTarget ? Number(updated.monthlyRevenueTarget) : null });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update revenue target" });
    }
  });

  app.get("/api/supplier/restaurants", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const restaurants = await storage.getRestaurantsForSupplier(supplierId);
      res.json(restaurants);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch restaurants" });
    }
  });

  // ===== COMPLAINTS =====
  async function sendComplaintStatusMessage(
    complaintId: string,
    fromStatus: string | null,
    toStatus: string,
    actorRole: "restaurant" | "supplier" | "system",
    extra?: { rejectionReason?: string; closeNote?: string }
  ) {
    const complaint = await storage.getComplaint(complaintId);
    if (!complaint) return;
    const conversation = await storage.getOrCreateConversation(complaint.restaurantId, complaint.supplierId);
    const senderId = actorRole === "supplier" ? complaint.supplierId : complaint.restaurantId;
    const content = JSON.stringify({
      type: "complaint_status_change",
      complaintId,
      complaintNumber: formatComplaintNumber(complaint),
      title: complaint.title,
      fromStatus,
      toStatus,
      reason: complaint.reason || null,
      rejectionReason: extra?.rejectionReason || null,
      closeNote: extra?.closeNote || null,
      actorRole,
    });
    await storage.sendMessage({
      conversationId: conversation.id,
      senderId,
      messageType: "complaint",
      content,
      orderId: complaint.orderId,
      priority: toStatus === "rejected" ? "important" : "standard",
    });

    const notifyUserId = actorRole === "supplier" ? complaint.restaurantId : complaint.supplierId;
    const recipientRole: "restaurant" | "supplier" = notifyUserId === complaint.restaurantId ? "restaurant" : "supplier";
    const statusLabels: Record<string, string> = {
      open: "Offen",
      in_progress: "In Bearbeitung",
      resolved: "Gelöst",
      closed: "Geschlossen",
      rejected: "Abgelehnt",
      partially_resolved: "Teilweise gelöst",
    };
    await createNotificationWithPush({
      userId: notifyUserId,
      type: "complaint_comment",
      title: `Reklamation #${formatComplaintNumber(complaint)} – ${statusLabels[toStatus] || toStatus}`,
      message: extra?.rejectionReason
        ? `Status: ${statusLabels[toStatus] || toStatus}. Grund: ${extra.rejectionReason.slice(0, 80)}`
        : `Status geändert: ${statusLabels[toStatus] || toStatus}`,
      referenceId: complaintId,
    }, recipientRole);
  }

  async function supplierHasReacted(complaint: any): Promise<boolean> {
    if (complaint.status !== "open") return true;
    try {
      const history = await storage.getComplaintStatusHistory(complaint.id);
      if (history.some((h: any) => h.changedBy && h.changedBy === complaint.supplierId)) return true;
    } catch {}
    try {
      const comments = await storage.getComplaintComments(complaint.id);
      if (comments.some((cm: any) => cm.userId === complaint.supplierId)) return true;
    } catch {}
    return false;
  }

  async function maybeSendComplaintReminders(complaintList: any[]) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    for (const c of complaintList) {
      if (c.status !== "open") continue;
      const ageMs = now - new Date(c.createdAt).getTime();
      if (ageMs < dayMs) continue;
      if (c.lastReminderAt) continue;
      if (await supplierHasReacted(c)) continue;
      try {
        await storage.updateComplaint(c.id, { lastReminderAt: new Date() });
        await createNotificationWithPush({
          userId: c.supplierId,
          type: "new_complaint",
          title: `Erinnerung: Reklamation #${formatComplaintNumber(c)} ist >24h ohne Reaktion`,
          message: c.title,
          referenceId: c.id,
        }, "supplier");
      } catch (err) {
        console.error("Reminder send failed:", err);
      }
    }
  }

  app.get("/api/complaints/kpis", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const list = req.auth.org.role === "restaurant"
        ? await storage.getComplaintsByRestaurant(req.auth.organizationId)
        : await storage.getComplaintsBySupplier(req.auth.organizationId);
      const openCount = list.filter(c => c.status === "open" || c.status === "in_progress").length;
      const resolved = list.filter(c => c.status === "resolved" || c.status === "closed" || c.status === "partially_resolved");
      const avgHours = resolved.length > 0
        ? resolved.reduce((sum, c) => sum + ((new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60)), 0) / resolved.length
        : 0;
      const avgDays = Math.round((avgHours / 24) * 10) / 10;
      const reasonCounts: Record<string, number> = {};
      for (const c of list) {
        if (c.reason) reasonCounts[c.reason] = (reasonCounts[c.reason] || 0) + 1;
      }
      const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      res.json({ openCount, avgDays, topReason, total: list.length, rejectedCount: list.filter(c => c.status === "rejected").length });
    } catch (e) {
      console.error("Complaint KPI error:", e);
      res.status(500).json({ error: "Failed to compute KPIs" });
    }
  });

  app.get("/api/complaints", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const complaints = req.auth.org.role === "restaurant"
        ? await storage.getComplaintsByRestaurant(req.auth.organizationId)
        : await storage.getComplaintsBySupplier(req.auth.organizationId);
      maybeSendComplaintReminders(complaints).catch(() => {});
      return res.json(complaints);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  });

  app.post("/api/complaints", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const { priorityImmediate, affectedItems, ...complaintData } = req.body;
      const hasAffectedItems = Array.isArray(affectedItems) && affectedItems.length > 0;
      const validated = insertComplaintSchema.parse({
        ...complaintData,
        restaurantId: req.auth.organizationId,
        priority: (priorityImmediate || hasAffectedItems) ? "urgent" : "standard",
        affectedItems: hasAffectedItems ? JSON.stringify(affectedItems) : null,
      });
      if (req.auth.org.role !== "restaurant") {
        return res.status(403).json({ error: "forbidden" });
      }
      const complaint = await storage.createComplaint(validated);
      
      await storage.addComplaintStatusHistory(complaint.id, null, "open", validated.restaurantId);
      
      // Create complaint message in chat
      const conversation = await storage.getOrCreateConversation(validated.restaurantId, validated.supplierId);
      const orderForComplaint = await storage.getOrder(validated.orderId);
      const complaintContent = JSON.stringify({
        title: validated.title,
        description: validated.description,
        orderId: validated.orderId,
        orderNumber: orderForComplaint ? formatOrderNumber(orderForComplaint) : undefined,
        complaintId: complaint.id,
        complaintNumber: formatComplaintNumber(complaint),
        reason: complaint.reason || null,
        affectedItems: hasAffectedItems ? affectedItems : undefined,
        mediaUrls: Array.isArray(validated.mediaUrls) && validated.mediaUrls.length > 0 ? validated.mediaUrls : undefined,
      });
      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: validated.restaurantId,
        messageType: "complaint",
        content: complaintContent,
        orderId: validated.orderId,
        priority: priorityImmediate ? "important" : "standard",
      });
      
      const restaurant = await storage.getUser(validated.restaurantId);
      await createNotificationWithPush({
        userId: validated.supplierId,
        type: "new_complaint",
        title: `Neue Reklamation #${formatComplaintNumber(complaint)}`,
        message: `${restaurant?.companyName || restaurant?.name || "Ein Betrieb"} hat eine Reklamation eingereicht #${formatComplaintNumber(complaint)}: ${validated.title}`,
        referenceId: complaint.id
      }, "supplier");
      
      res.status(201).json(complaint);
    } catch (error) {
      console.error("Create complaint error:", error);
      res.status(400).json({ error: "Invalid complaint data" });
    }
  });

  app.get("/api/suppliers/:supplierId/avg-delivery-time", async (req, res) => {
    try {
      const { supplierId } = req.params;
      const deliveredOrders = await db
        .select({
          orderId: orders.id,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
        })
        .from(orders)
        .where(and(eq(orders.supplierId, supplierId), eq(orders.status, "delivered")))
        .orderBy(desc(orders.updatedAt))
        .limit(5);

      if (deliveredOrders.length === 0) {
        return res.json({ avgHours: null, avgDays: null, sampleSize: 0 });
      }

      const durations = deliveredOrders.map(o => {
        const created = new Date(o.createdAt).getTime();
        const updated = new Date(o.updatedAt).getTime();
        return (updated - created) / (1000 * 60 * 60);
      });

      const avgHours = durations.reduce((a, b) => a + b, 0) / durations.length;
      const avgDays = Math.round(avgHours / 24 * 10) / 10;

      res.json({ avgHours: Math.round(avgHours), avgDays, sampleSize: deliveredOrders.length });
    } catch (error) {
      console.error("Failed to calculate avg delivery time:", error);
      res.status(500).json({ error: "Failed to calculate delivery time" });
    }
  });

  app.get("/api/orders/:id/status-history", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const order = await storage.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      const denied = checkActingCapabilityIfProvided(req, [order.restaurantId, order.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      const history = await storage.getOrderStatusHistory(req.params.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch status history" });
    }
  });

  app.get("/api/complaints/:id/status-history", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) return res.status(404).json({ error: "Complaint not found" });
      const denied = checkActingCapabilityIfProvided(req, [complaint.restaurantId, complaint.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      const history = await storage.getComplaintStatusHistory(req.params.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch status history" });
    }
  });

  app.get("/api/complaints/by-order/:orderId", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const complaint = await storage.getComplaintByOrderId(req.params.orderId);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      const denied = checkActingCapabilityIfProvided(req, [complaint.restaurantId, complaint.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      res.json(complaint);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch complaint" });
    }
  });

  app.get("/api/complaints/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      const denied = checkActingCapabilityIfProvided(req, [complaint.restaurantId, complaint.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      res.json(complaint);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch complaint" });
    }
  });

  app.patch("/api/complaints/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      if (
        req.auth.organizationId !== complaint.restaurantId &&
        req.auth.organizationId !== complaint.supplierId
      ) {
        return res.status(403).json({ error: "forbidden" });
      }
      
      const { changedBy: rawChangedBy, actorRole: rawActorRole, closeNote: rawCloseNote, ...complaintBody } = req.body;
      const changedBy = typeof rawChangedBy === "string" ? rawChangedBy.slice(0, 100) : undefined;
      const actorRole: "restaurant" | "supplier" | "system" =
        rawActorRole === "supplier" ? "supplier" : rawActorRole === "restaurant" ? "restaurant" : "system";
      const closeNote = typeof rawCloseNote === "string" ? rawCloseNote.slice(0, 500) : undefined;
      const validated = updateComplaintSchema.parse(complaintBody);
      const isContentEdit = validated.title !== undefined || validated.description !== undefined || validated.mediaUrls !== undefined;
      
      if (isContentEdit && complaint.status !== "open") {
        return res.status(400).json({ error: "Reklamationen können nur bearbeitet werden, wenn der Status 'Offen' ist." });
      }

      if (validated.status === "rejected" && !validated.rejectionReason && !complaint.rejectionReason) {
        return res.status(400).json({ error: "Ein Ablehnungsgrund ist erforderlich." });
      }
      if (
        validated.status === "closed" &&
        complaint.status !== "closed" &&
        actorRole === "restaurant" &&
        (!closeNote || !closeNote.trim())
      ) {
        return res.status(400).json({ error: "Bitte begründen Sie das Schließen der Reklamation." });
      }
      
      const previousStatus = complaint.status;
      const updated = await storage.updateComplaint(req.params.id, validated);
      
      if (validated.status && validated.status !== previousStatus) {
        await storage.addComplaintStatusHistory(req.params.id, previousStatus, validated.status, changedBy);
        await sendComplaintStatusMessage(req.params.id, previousStatus, validated.status, actorRole, {
          rejectionReason: validated.rejectionReason || undefined,
          closeNote,
        });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Update complaint error:", error);
      res.status(400).json({ error: "Invalid complaint data" });
    }
  });

  app.get("/api/complaints/:id/comments", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) return res.status(404).json({ error: "Complaint not found" });
      const denied = checkActingCapabilityIfProvided(req, [complaint.restaurantId, complaint.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      const comments = await storage.getComplaintComments(req.params.id);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/complaints/:id/follow-up-order", async (req, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      const denied = checkActingCapability(req, complaint.supplierId, "orders.manage");
      if (denied) return res.status(denied.status).json(denied.body);

      const { items, deliveryDate: deliveryDateRaw, notes, supplierId } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Items are required" });
      }

      const effectiveSupplierId = complaint.supplierId;

      let deliveryDate: string | undefined = deliveryDateRaw;
      if (!deliveryDate) {
        const schedules = await storage.getDeliverySchedulesForRestaurant(effectiveSupplierId, complaint.restaurantId);
        const days = new Set(schedules.map((s) => s.dayOfWeek));
        if (days.size > 0) {
          const next = new Date();
          for (let i = 1; i <= 14; i++) {
            const d = new Date(next.getFullYear(), next.getMonth(), next.getDate() + i);
            if (days.has(d.getDay())) {
              deliveryDate = d.toISOString().split("T")[0];
              break;
            }
          }
        }
        if (!deliveryDate) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          deliveryDate = tomorrow.toISOString().split("T")[0];
        }
      }
      if (supplierId && supplierId !== effectiveSupplierId) {
        return res.status(403).json({ error: "Unauthorized: supplier does not match complaint" });
      }

      if (complaint.status === "closed" || complaint.status === "resolved") {
        return res.status(400).json({ error: "Cannot create follow-up for closed/resolved complaints" });
      }
      const products = await storage.getProductsBySupplier(effectiveSupplierId);
      const productMap = new Map(products.map(p => [p.id, p]));

      const orderItems = [];
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product) continue;
        const unitPrice = parseFloat(item.unitPrice || product.price);
        orderItems.push({
          productId: item.productId,
          productName: item.productName || product.name,
          quantity: Math.max(1, Math.round(Number(item.quantity))),
          unitPrice: unitPrice.toFixed(2),
          totalPrice: (unitPrice * Math.max(1, Math.round(Number(item.quantity)))).toFixed(2)
        });
      }

      if (orderItems.length === 0) {
        return res.status(400).json({ error: "No valid items found" });
      }

      const totalAmount = orderItems
        .reduce((sum: number, item) => sum + parseFloat(item.totalPrice), 0)
        .toFixed(2);

      const orderNotes = notes || `Nachlieferung zu Reklamation #${formatComplaintNumber(complaint)}`;
      const order = await storage.createOrder(
        {
          restaurantId: complaint.restaurantId,
          supplierId: effectiveSupplierId,
          totalAmount,
          status: "confirmed",
          notes: orderNotes,
          requestedDeliveryDate: deliveryDate,
          createdByUserId: effectiveSupplierId
        },
        orderItems as any,
        { reserveStock: true, strictReserve: false }
      );

      await storage.addOrderStatusHistory(order.id, null, "pending", effectiveSupplierId);
      await storage.addOrderStatusHistory(order.id, "pending", "confirmed", effectiveSupplierId);

      const conversation = await storage.getOrCreateConversation(complaint.restaurantId, effectiveSupplierId);
      const followUpImages: Record<string, string | null> = {};
      for (const item of orderItems) {
        const prod = await storage.getProduct(item.productId);
        if (prod) followUpImages[item.productId] = prod.imageUrl || null;
      }
      const orderContent = JSON.stringify({
        items: orderItems.map(item => ({
          name: item.productName,
          quantity: item.quantity,
          price: item.totalPrice,
          imageUrl: followUpImages[item.productId] || null
        })),
        total: totalAmount,
        isFollowUp: true,
        complaintId: complaint.id,
        complaintNumber: formatComplaintNumber(complaint),
        orderId: order.id,
        orderNumber: formatOrderNumber(order),
      });
      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: effectiveSupplierId,
        messageType: "order",
        content: orderContent,
        orderId: order.id,
      });

      const previousStatus = complaint.status;
      if (previousStatus !== "in_progress") {
        await storage.updateComplaint(req.params.id, { status: "in_progress" });
        await storage.addComplaintStatusHistory(req.params.id, previousStatus, "in_progress", effectiveSupplierId);
        await sendComplaintStatusMessage(req.params.id, previousStatus, "in_progress", "supplier");
      }

      const supplier = await storage.getUser(effectiveSupplierId);
      await createNotificationWithPush({
        userId: complaint.restaurantId,
        type: "new_order",
        title: `Nachlieferung #${formatOrderNumber(order)}`,
        message: `${supplier?.companyName || supplier?.name || "Ihr Händler"} hat eine Nachlieferung zu Ihrer Reklamation #${formatComplaintNumber(complaint)} erstellt (€${totalAmount})`,
        referenceId: order.id
      }, "restaurant");

      res.status(201).json(order);
    } catch (error) {
      console.error("Follow-up order error:", error);
      res.status(500).json({ error: "Failed to create follow-up order" });
    }
  });

  app.post("/api/complaints/:id/comments", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      // Only a party to the complaint may comment, and the author is always the
      // session org — never a client-supplied userId.
      if (
        req.auth.organizationId !== complaint.restaurantId &&
        req.auth.organizationId !== complaint.supplierId
      ) {
        return res.status(403).json({ error: "forbidden" });
      }
      const validated = insertComplaintCommentSchema.parse({
        ...req.body,
        userId: req.auth.organizationId,
        complaintId: req.params.id
      });
      const comment = await storage.addComplaintComment(validated);
      
      const notifyUserId = validated.userId === complaint.restaurantId 
        ? complaint.supplierId 
        : complaint.restaurantId;
      const commenter = await storage.getUser(validated.userId);
      const commentRecipientRole = notifyUserId === complaint.restaurantId ? "restaurant" : "supplier";
      
      await createNotificationWithPush({
        userId: notifyUserId,
        type: "complaint_comment",
        title: `Neuer Kommentar #${formatComplaintNumber(complaint)}`,
        message: `${commenter?.companyName || commenter?.name || "Jemand"} hat einen Kommentar zur Reklamation #${formatComplaintNumber(complaint)} hinzugefügt: "${validated.content.substring(0, 50)}${validated.content.length > 50 ? '...' : ''}"`,
        referenceId: complaint.id
      }, commentRecipientRole);
      
      res.status(201).json(comment);
    } catch (error) {
      console.error("Create comment error:", error);
      res.status(400).json({ error: "Invalid comment data" });
    }
  });

  app.get("/api/suppliers-with-orders", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const suppliers = await storage.getSuppliersWithOrders(restaurantId);
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  app.get("/api/orders-by-supplier", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.json([]);
      }
      const orders = await storage.getOrdersByRestaurantAndSupplier(restaurantId, supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // ===== NOTIFICATIONS =====
  app.get("/api/notifications", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const notificationsList = await storage.getNotifications(userId);
      res.json(notificationsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/count", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notification count" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const validated = insertNotificationSchema.parse(req.body);
      // Callers may only create notifications addressed to their own org. This
      // endpoint is not a broadcast channel; cross-org notifications are issued
      // server-side via internal flows.
      if (validated.userId !== req.auth.organizationId) {
        return res.status(403).json({ error: "forbidden" });
      }
      const notification = await createNotificationWithPush(validated, req.auth.org.role);
      res.status(201).json(notification);
    } catch (error) {
      res.status(500).json({ error: "Failed to create notification" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const existing = await storage.getNotification(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Notification not found" });
      }
      if (existing.userId !== req.auth.organizationId) {
        return res.status(403).json({ error: "forbidden" });
      }
      const updated = await storage.markNotificationAsRead(req.params.id);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-by-reference", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const referenceId = req.query.referenceId as string;
      const type = req.query.type as string | undefined;
      if (!referenceId) {
        return res.status(400).json({ error: "referenceId required" });
      }
      await storage.markNotificationsByReferenceAsRead(userId, referenceId, type);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // ===== PUSH NOTIFICATIONS =====
  app.get("/api/push/vapid-key", (_req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  });

  const pushSubscribeSchema = z.object({
    subscription: z.object({
      endpoint: z.string().url().max(2000),
      keys: z.object({
        p256dh: z.string().min(1).max(500),
        auth: z.string().min(1).max(500),
      }),
    }),
  });

  const pushUnsubscribeSchema = z.object({
    endpoint: z.string().url().max(2000),
  });

  app.post("/api/push/subscribe", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const { subscription } = pushSubscribeSchema.parse(req.body);
      await storage.savePushSubscription({
        userId: req.auth.organizationId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      });
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid subscription data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to save push subscription" });
    }
  });

  app.post("/api/push/unsubscribe", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const { endpoint } = pushUnsubscribeSchema.parse(req.body);
      await storage.deletePushSubscription(endpoint);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to remove push subscription" });
    }
  });

  app.post("/api/push/test", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      // Target is always the caller's own org; client-supplied userId is ignored.
      const userId = req.auth.organizationId;
      const subscriptions = await storage.getPushSubscriptions(userId);
      if (subscriptions.length === 0) {
        return res.json({ sent: 0 });
      }
      const outcome = await sendPushNotification(userId, {
        title: "GastroConnect",
        message: "🔔 Test – Benachrichtigungen funktionieren!",
        url: "/",
        type: "general",
      });
      res.json({ sent: outcome.succeeded });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to send test notification" });
    }
  });

  app.get("/api/restaurant/supplier-order-stats/batch", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const allOrders = await db.select().from(orders)
        .where(eq(orders.restaurantId, restaurantId));
      const delivered = allOrders.filter(o => o.status === "delivered" || o.status === "confirmed" || o.status === "in_delivery" || o.status === "partially_confirmed");

      const now = new Date();
      const monthKeys: { key: string; label: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthKeys.push({
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
          label: d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" }),
        });
      }

      // Initialize zeroed entries for every supplier the restaurant has ever
      // interacted with (any status) so the response shape matches the legacy
      // per-supplier endpoint even when no qualifying orders exist.
      type MonthBucket = { month: string; total: number; count: number };
      type SupplierStatsEntry = {
        totalOrders: number;
        totalSpent: string;
        avgOrderValue: string;
        monthlyBreakdown: MonthBucket[];
        _spentNumeric: number;
      };
      const result: Record<string, SupplierStatsEntry> = {};
      const ensureEntry = (supplierId: string): SupplierStatsEntry => {
        if (!result[supplierId]) {
          result[supplierId] = {
            totalOrders: 0,
            totalSpent: "0.00",
            avgOrderValue: "0.00",
            monthlyBreakdown: monthKeys.map(({ label }) => ({ month: label, total: 0, count: 0 })),
            _spentNumeric: 0,
          };
        }
        return result[supplierId];
      };

      for (const o of allOrders) ensureEntry(o.supplierId);

      for (const o of delivered) {
        const entry = ensureEntry(o.supplierId);
        const amount = Number(o.totalAmount || 0);
        entry.totalOrders += 1;
        entry._spentNumeric += amount;
        const d = new Date(o.createdAt);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const idx = monthKeys.findIndex(m => m.key === k);
        if (idx >= 0) {
          entry.monthlyBreakdown[idx].total += amount;
          entry.monthlyBreakdown[idx].count += 1;
        }
      }

      const response: Record<string, Omit<SupplierStatsEntry, "_spentNumeric">> = {};
      for (const supplierId of Object.keys(result)) {
        const entry = result[supplierId];
        const { _spentNumeric, ...rest } = entry;
        response[supplierId] = {
          ...rest,
          totalSpent: _spentNumeric.toFixed(2),
          avgOrderValue: (entry.totalOrders > 0 ? _spentNumeric / entry.totalOrders : 0).toFixed(2),
        };
      }
      res.json(response);
    } catch (error) {
      console.error("Error fetching batched supplier stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/restaurant/supplier-order-stats", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "supplierId required" });
      }
      const allOrders = await db.select().from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.supplierId, supplierId)));

      const deliveredOrders = allOrders.filter(o => o.status === "delivered" || o.status === "confirmed" || o.status === "in_delivery" || o.status === "partially_confirmed");
      const totalOrders = deliveredOrders.length;
      const totalSpent = deliveredOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
      const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

      const now = new Date();
      const monthlyBreakdown: Record<string, { month: string; total: number; count: number }> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthLabel = d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
        monthlyBreakdown[key] = { month: monthLabel, total: 0, count: 0 };
      }
      for (const o of deliveredOrders) {
        const d = new Date(o.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (monthlyBreakdown[key]) {
          monthlyBreakdown[key].total += Number(o.totalAmount || 0);
          monthlyBreakdown[key].count += 1;
        }
      }

      res.json({
        totalOrders,
        totalSpent: totalSpent.toFixed(2),
        avgOrderValue: avgOrderValue.toFixed(2),
        monthlyBreakdown: Object.values(monthlyBreakdown),
      });
    } catch (error) {
      console.error("Error fetching supplier order stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/restaurant/monthly-invoice", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const supplierId = req.query.supplierId as string;
      const month = req.query.month as string;
      if (!supplierId || !month) {
        return res.status(400).json({ error: "supplierId and month required" });
      }
      const [year, mon] = month.split("-").map(Number);
      const startDate = new Date(year, mon - 1, 1);
      const endDate = new Date(year, mon, 1);

      const monthOrders = await db.select().from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.supplierId, supplierId)));
      const filteredOrders = monthOrders.filter(o => {
        const d = new Date(o.createdAt);
        return d >= startDate && d < endDate && (o.status === "delivered" || o.status === "confirmed" || o.status === "in_delivery" || o.status === "partially_confirmed");
      });

      if (filteredOrders.length === 0) {
        return res.status(404).json({ error: "No orders for this month" });
      }

      const [restaurant] = await db.select().from(users).where(eq(users.id, restaurantId));
      const [supplier] = await db.select().from(users).where(eq(users.id, supplierId));
      if (!restaurant || !supplier) {
        return res.status(404).json({ error: "User not found" });
      }

      const invoiceItems: Array<{ date: string; orderId: string; amount: string }> = [];
      let grandTotal = 0;
      for (const o of filteredOrders) {
        const amount = Number(o.totalAmount || 0);
        grandTotal += amount;
        invoiceItems.push({
          date: new Date(o.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
          orderId: formatOrderNumber(o),
          amount: amount.toFixed(2),
        });
      }

      const monthLabel = startDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
      const supplierName = supplier.companyName || supplier.name;
      const restaurantName = restaurant.companyName || restaurant.name;
      const invoiceNr = `RE-${month.replace("-", "")}-${supplierId.slice(0, 6).toUpperCase()}`;

      const pdfBuffer = await generateMonthlyInvoicePDF({
        invoiceNr, monthLabel, supplierName, restaurantName,
        supplier, restaurant,
        items: invoiceItems, grandTotal: grandTotal.toFixed(2),
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Rechnung_${month}_${supplierName.replace(/\s/g, "_")}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating monthly invoice:", error);
      res.status(500).json({ error: "Failed to generate invoice" });
    }
  });

  // ===== DOCUMENTS =====
  app.get("/api/documents", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const role = req.auth.org.role;
      const docs = await storage.getDocumentsByUser(userId, role);
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/eligible-orders", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const role = req.auth.org.role;
      const orders = role === "restaurant"
        ? await storage.getOrdersByRestaurant(userId, { status: ["in_delivery", "delivered"] })
        : await storage.getOrdersBySupplier(userId, { status: ["in_delivery", "delivered"] });

      const eligible = [];
      for (const order of orders) {
        const docs = await storage.getDocumentsByOrder(order.id);
        if (!docs.some(d => d.type === "delivery_note" && !d.isUpload)) {
          eligible.push(order);
        }
      }
      res.json(eligible);
    } catch (error) {
      console.error("Failed to fetch eligible orders:", error);
      res.status(500).json({ error: "Failed to fetch eligible orders" });
    }
  });

  // Orders + complaints a user can attach an uploaded document to.
  app.get("/api/documents/assignable", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const role = req.auth.org.role;
      const orders = role === "restaurant"
        ? await storage.getOrdersByRestaurant(userId, { limit: 50 })
        : await storage.getOrdersBySupplier(userId, { limit: 50 });
      const complaints = role === "restaurant"
        ? await storage.getComplaintsByRestaurant(userId)
        : await storage.getComplaintsBySupplier(userId);
      res.json({ orders, complaints });
    } catch (error) {
      console.error("Failed to fetch assignable targets:", error);
      res.status(500).json({ error: "Failed to fetch assignable targets" });
    }
  });

  // Upload a document (photo / PDF / image) and attach it to an order or complaint.
  app.post("/api/documents/upload", express.json({ limit: "25mb" }), async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const { fileData, fileName, mimeType, type, title, orderId, complaintId } = req.body ?? {};
      if (!fileData || !mimeType) {
        return res.status(400).json({ error: "fileData and mimeType required" });
      }
      if (!orderId && !complaintId) {
        return res.status(400).json({ error: "orderId or complaintId required" });
      }
      if (orderId && complaintId) {
        return res.status(400).json({ error: "Provide either orderId or complaintId, not both" });
      }

      const ALLOWED: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "application/pdf": "pdf",
      };
      const ext = ALLOWED[mimeType];
      if (!ext) {
        return res.status(400).json({ error: "Unsupported file type" });
      }

      const docType = ["delivery_note", "invoice", "other"].includes(type) ? type : "other";

      let resolvedOrderId = orderId as string | undefined;
      const resolvedComplaintId = (complaintId as string | undefined) || null;
      let restaurantId: string;
      let supplierId: string;

      if (resolvedComplaintId) {
        const complaint = await storage.getComplaint(resolvedComplaintId);
        if (!complaint) {
          return res.status(404).json({ error: "Complaint not found" });
        }
        resolvedOrderId = complaint.orderId;
        restaurantId = complaint.restaurantId;
        supplierId = complaint.supplierId;
      } else {
        const order = await storage.getOrder(resolvedOrderId!);
        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }
        restaurantId = order.restaurantId;
        supplierId = order.supplierId;
      }

      // The caller must be a party to the resolved order/complaint.
      if (req.auth.organizationId !== restaurantId && req.auth.organizationId !== supplierId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const raw = String(fileData);
      const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) {
        return res.status(400).json({ error: "Empty file" });
      }
      if (buffer.length > 15 * 1024 * 1024) {
        return res.status(400).json({ error: "File too large (max 15MB)" });
      }

      const objectService = new ObjectStorageService();
      const privateDir = objectService.getPrivateObjectDir();
      const fileId = randomUUID();
      const fullPath = `${privateDir}/documents/${fileId}.${ext}`;
      const pathParts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
      const bucketName = pathParts[0];
      const objectName = pathParts.slice(1).join("/");
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(buffer, {
        contentType: mimeType,
        metadata: { contentType: mimeType },
      });

      const objectPath = `/objects/documents/${fileId}.${ext}`;
      const cleanTitle =
        typeof title === "string" && title.trim()
          ? title.trim().slice(0, 200)
          : fileName
            ? String(fileName).slice(0, 200)
            : "Dokument";

      const document = await storage.createDocument({
        orderId: resolvedOrderId!,
        complaintId: resolvedComplaintId,
        type: docType as "delivery_note" | "invoice" | "other",
        title: cleanTitle,
        fileUrl: objectPath,
        isUpload: true,
        restaurantId,
        supplierId,
      });
      res.json(document);
    } catch (error) {
      console.error("Failed to upload document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  app.get("/api/complaints/:id/documents", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) return res.status(404).json({ error: "Complaint not found" });
      const denied = checkActingCapabilityIfProvided(req, [complaint.restaurantId, complaint.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      const docs = await storage.getDocumentsByComplaint(req.params.id);
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch complaint documents" });
    }
  });

  app.get("/api/orders/:id/documents", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.restaurantId !== userId && order.supplierId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const docs = await storage.getDocumentsByOrder(req.params.id);
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order documents" });
    }
  });

  app.get("/api/orders/:id/delivery-note/download", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const denied = checkActingCapabilityIfProvided(req, [order.restaurantId, order.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      const inline = req.query.inline === "1" || req.query.disposition === "inline";
      const disposition = inline ? "inline" : "attachment";
      const docs = await storage.getDocumentsByOrder(order.id);
      const deliveryNote = docs.find(d => d.type === "delivery_note" && !d.isUpload);
      if (deliveryNote) {
        try {
          const objectService = new ObjectStorageService();
          const objectFile = await objectService.getObjectEntityFile(deliveryNote.fileUrl);
          res.setHeader("Content-Disposition", `${disposition}; filename="Lieferschein_${formatOrderNumber(order)}.pdf"`);
          await objectService.downloadObject(objectFile, res);
          return;
        } catch (objErr) {
          // Stored object missing (e.g. demo/seed data) — fall back to regeneration.
          if (res.headersSent) throw objErr;
        }
      }
      const pdfBuffer = await generateDeliveryNotePDF(order);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${disposition}; filename="Lieferschein_${formatOrderNumber(order)}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Failed to download delivery note:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to download delivery note" });
      }
    }
  });

  app.post("/api/orders/:id/delivery-note", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const denied = checkActingCapability(req, order.supplierId, "orders.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      if (order.status !== "in_delivery" && order.status !== "delivered") {
        return res.status(400).json({ error: "Order must be in delivery or delivered status" });
      }

      const existingDocs = await storage.getDocumentsByOrder(order.id);
      const hasDeliveryNote = existingDocs.some(d => d.type === "delivery_note" && !d.isUpload);
      if (hasDeliveryNote) {
        return res.status(400).json({ error: "Delivery note already exists", document: existingDocs.find(d => d.type === "delivery_note") });
      }

      const { document, created } = await ensureDeliveryNoteForOrder(order);
      if (created) {
        await postDeliveryNoteChatMessage(order, document);
      }

      res.json(document);
    } catch (error) {
      console.error("Failed to generate delivery note:", error);
      res.status(500).json({ error: "Failed to generate delivery note" });
    }
  });

  app.get("/api/orders/:id/delivery-note/preview", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const denied = checkActingCapabilityIfProvided(req, [order.restaurantId, order.supplierId], "chat");
      if (denied) return res.status(denied.status).json(denied.body);
      const deliveryDate = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
      const orderDate = new Date(order.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
      res.json({
        orderId: order.id,
        supplierName: order.supplier?.companyName || order.supplier?.name || "",
        supplierAddress: order.supplier?.address || "",
        supplierCity: `${order.supplier?.postalCode || ""} ${order.supplier?.city || ""}`.trim(),
        supplierPhone: order.supplier?.phone || "",
        supplierEmail: order.supplier?.email || "",
        restaurantName: order.restaurant?.companyName || order.restaurant?.name || "",
        restaurantAddress: order.restaurant?.address || "",
        restaurantCity: `${order.restaurant?.postalCode || ""} ${order.restaurant?.city || ""}`.trim(),
        orderDate,
        deliveryDate,
        items: order.items?.map(item => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })) || [],
        totalAmount: order.totalAmount,
        notes: order.notes || "",
      });
    } catch (error) {
      console.error("Failed to get delivery note preview:", error);
      res.status(500).json({ error: "Failed to get delivery note preview" });
    }
  });

  app.post("/api/orders/:id/delivery-note/regenerate", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const denied = checkActingCapability(req, order.supplierId, "orders.manage");
      if (denied) return res.status(denied.status).json(denied.body);

      const editedData = req.body;
      if (editedData.items && Array.isArray(editedData.items)) {
        editedData.items = editedData.items.filter((item: any) => item.productName && Number(item.quantity) > 0 && Number(item.unitPrice) >= 0);
        editedData.items.forEach((item: any) => {
          item.quantity = Math.max(1, Math.round(Number(item.quantity)));
          item.unitPrice = Math.max(0, Number(item.unitPrice)).toFixed(2);
          item.totalPrice = (item.quantity * Number(item.unitPrice)).toFixed(2);
        });
        editedData.totalAmount = editedData.items.reduce((sum: number, item: any) => sum + Number(item.totalPrice), 0).toFixed(2);
      }

      const pdfOrder = {
        id: order.id,
        restaurant: {
          name: editedData.restaurantName || order.restaurant?.name || "",
          companyName: editedData.restaurantName || order.restaurant?.companyName || null,
          address: editedData.restaurantAddress || order.restaurant?.address || null,
          city: editedData.restaurantCity?.split(" ").slice(1).join(" ") || order.restaurant?.city || null,
          postalCode: editedData.restaurantCity?.split(" ")[0] || order.restaurant?.postalCode || null,
        },
        supplier: {
          name: editedData.supplierName || order.supplier?.name || "",
          companyName: editedData.supplierName || order.supplier?.companyName || null,
          address: editedData.supplierAddress || order.supplier?.address || null,
          city: editedData.supplierCity?.split(" ").slice(1).join(" ") || order.supplier?.city || null,
          postalCode: editedData.supplierCity?.split(" ")[0] || order.supplier?.postalCode || null,
          phone: editedData.supplierPhone || order.supplier?.phone || null,
          email: editedData.supplierEmail || order.supplier?.email || "",
        },
        items: (editedData.items || order.items || []).map((item: any) => ({
          productName: item.productName,
          quantity: Number(item.quantity),
          unitPrice: String(item.unitPrice),
          totalPrice: String(item.totalPrice),
        })),
        totalAmount: editedData.totalAmount || order.totalAmount,
        createdAt: order.createdAt,
        notes: editedData.notes ?? order.notes,
      };

      const pdfBuffer = await generateDeliveryNotePDF(pdfOrder);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Lieferschein_${formatOrderNumber(order)}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Failed to regenerate delivery note:", error);
      res.status(500).json({ error: "Failed to regenerate delivery note" });
    }
  });

  // ===== CHAT ATTACHMENTS =====
  const ALLOWED_ATTACHMENT_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

  app.post("/api/attachments/request-url", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const validated = attachmentRequestSchema.parse(req.body);
      const { name, size, contentType, conversationId } = validated;
      const senderId = req.auth.organizationId;
      if (!ALLOWED_ATTACHMENT_TYPES.includes(contentType)) {
        return res.status(400).json({ error: "Dateityp nicht erlaubt. Erlaubt: PDF, JPG, PNG, WEBP, DOCX" });
      }
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (senderId !== conversation.restaurantId && senderId !== conversation.supplierId) {
        return res.status(403).json({ error: "Not authorized for this conversation" });
      }

      const objectService = new ObjectStorageService();
      const privateDir = objectService.getPrivateObjectDir();
      const fileId = randomUUID();
      const ext = name.split(".").pop() || "bin";
      const fullPath = `${privateDir}/attachments/${fileId}.${ext}`;
      const pathParts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
      const bucketName = pathParts[0];
      const objectName = pathParts.slice(1).join("/");

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [uploadURL] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType,
      });

      const entityDir = privateDir.endsWith("/") ? privateDir : `${privateDir}/`;
      const relativePath = `attachments/${fileId}.${ext}`;
      const objectPath = `/objects/${relativePath}`;

      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      console.error("Error generating attachment upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.get("/api/conversations/:id/documents", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const conversationId = req.params.id;
      const userId = req.auth.organizationId;
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (userId !== conversation.restaurantId && userId !== conversation.supplierId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      const supplierDocs = await storage.getDocumentsByUser(conversation.supplierId, "supplier");
      const filteredDocs = supplierDocs.filter(
        d => d.restaurantId === conversation.restaurantId && d.supplierId === conversation.supplierId
      );
      res.json(filteredDocs);
    } catch (error) {
      console.error("Error fetching conversation documents:", error);
      res.status(500).json({ error: "Failed to fetch conversation documents" });
    }
  });

  app.get("/api/attachments/download", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const fileUrl = req.query.fileUrl as string;
      const userId = req.auth.organizationId;
      const conversationId = req.query.conversationId as string;

      if (!fileUrl) {
        return res.status(400).json({ error: "fileUrl is required" });
      }

      if (conversationId) {
        const conversation = await storage.getConversation(conversationId);
        if (!conversation) {
          return res.status(404).json({ error: "Conversation not found" });
        }
        if (userId !== conversation.restaurantId && userId !== conversation.supplierId) {
          return res.status(403).json({ error: "Not authorized" });
        }
      }

      const objectService = new ObjectStorageService();
      const objectFile = await objectService.getObjectEntityFile(fileUrl);

      const fileName = fileUrl.split("/").pop() || "attachment";
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      await objectService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error downloading attachment:", error);
      res.status(500).json({ error: "Failed to download attachment" });
    }
  });

  // ===== MINIMUM ORDER VALUES =====

  const movBodySchema = z.object({
    supplierId: z.string().min(1),
    zone: z.string().nullable().optional(),
    minimumValue: z.number().min(0),
  });

  app.get("/api/minimum-order-values", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const results = await db.select().from(minimumOrderValues)
        .where(eq(minimumOrderValues.supplierId, supplierId))
        .orderBy(asc(minimumOrderValues.zone));
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch minimum order values" });
    }
  });

  app.post("/api/minimum-order-values", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const parsed = movBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { zone, minimumValue } = parsed.data;
      const supplierId = req.auth.organizationId;
      const zoneVal = zone || null;
      const [existing] = await db.select().from(minimumOrderValues)
        .where(and(
          eq(minimumOrderValues.supplierId, supplierId),
          zoneVal ? eq(minimumOrderValues.zone, zoneVal) : sql`${minimumOrderValues.zone} IS NULL`
        ));
      if (existing) {
        const [updated] = await db.update(minimumOrderValues)
          .set({ minimumValue: String(minimumValue), updatedAt: new Date() })
          .where(eq(minimumOrderValues.id, existing.id))
          .returning();
        return res.json(updated);
      }
      const [created] = await db.insert(minimumOrderValues).values({
        supplierId,
        zone: zoneVal,
        minimumValue: String(minimumValue),
      }).returning();
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Failed to save minimum order value" });
    }
  });

  app.delete("/api/minimum-order-values/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const supplierId = req.auth.organizationId;
      const [record] = await db.select().from(minimumOrderValues).where(eq(minimumOrderValues.id, req.params.id));
      if (!record) return res.status(404).json({ error: "Not found" });
      if (record.supplierId !== supplierId) return res.status(403).json({ error: "Forbidden" });
      await db.delete(minimumOrderValues).where(eq(minimumOrderValues.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete minimum order value" });
    }
  });

  app.get("/api/minimum-order-values/for-restaurant", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const [restaurant] = await db.select().from(users).where(eq(users.id, restaurantId));
      if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
      const restaurantPostalCode = restaurant.postalCode || "";

      const allMovs = await db.select().from(minimumOrderValues);
      const result: Record<string, { minimumValue: string; zone: string | null }> = {};
      for (const mov of allMovs) {
        const existing = result[mov.supplierId];
        if (mov.zone && restaurantPostalCode && restaurantPostalCode.startsWith(mov.zone)) {
          result[mov.supplierId] = { minimumValue: mov.minimumValue, zone: mov.zone };
        } else if (!mov.zone && !existing) {
          result[mov.supplierId] = { minimumValue: mov.minimumValue, zone: null };
        }
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch minimum order values" });
    }
  });

  // ===== COST ANALYSIS / OVERNIGHT STAYS =====

  const costSettingsBodySchema = z.object({
    restaurantId: z.string().min(1),
    targetCostPerGuest: z.number().min(0),
  });

  const overnightStaysBodySchema = z.object({
    restaurantId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    overnightStays: z.number().int().min(0),
  });

  const monthParamSchema = z.string().regex(/^\d{4}-\d{2}$/);

  function getOrderMonth(createdAt: Date | string): string {
    const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  app.get("/api/restaurant/cost-settings", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const [settings] = await db.select().from(costSettings).where(eq(costSettings.restaurantId, restaurantId));
      res.json(settings || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cost settings" });
    }
  });

  app.post("/api/restaurant/cost-settings", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const parsed = costSettingsBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { targetCostPerGuest } = parsed.data;
      const restaurantId = req.auth.organizationId;
      const [existing] = await db.select().from(costSettings).where(eq(costSettings.restaurantId, restaurantId));
      if (existing) {
        const [updated] = await db.update(costSettings)
          .set({ targetCostPerGuest: String(targetCostPerGuest), updatedAt: new Date() })
          .where(eq(costSettings.id, existing.id))
          .returning();
        return res.json(updated);
      }
      const [created] = await db.insert(costSettings).values({
        restaurantId,
        targetCostPerGuest: String(targetCostPerGuest),
      }).returning();
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Failed to save cost settings" });
    }
  });

  app.get("/api/restaurant/overnight-stays", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const month = req.query.month as string;
      if (month && !monthParamSchema.safeParse(month).success) return res.status(400).json({ error: "Invalid month format" });
      const results = await db.select().from(overnightStays)
        .where(eq(overnightStays.restaurantId, restaurantId))
        .orderBy(desc(overnightStays.date));
      if (month) {
        return res.json(results.filter(r => r.date.startsWith(month)));
      }
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch overnight stays" });
    }
  });

  app.post("/api/restaurant/overnight-stays", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const parsed = overnightStaysBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { date, overnightStays: stays } = parsed.data;
      const restaurantId = req.auth.organizationId;
      const [existing] = await db.select().from(overnightStays)
        .where(and(eq(overnightStays.restaurantId, restaurantId), eq(overnightStays.date, date)));
      if (existing) {
        const [updated] = await db.update(overnightStays)
          .set({ overnightStays: stays, updatedAt: new Date() })
          .where(eq(overnightStays.id, existing.id))
          .returning();
        return res.json(updated);
      }
      const [created] = await db.insert(overnightStays).values({
        restaurantId,
        date,
        overnightStays: stays,
      }).returning();
      res.json(created);
    } catch (error) {
      res.status(500).json({ error: "Failed to save overnight stays" });
    }
  });

  app.delete("/api/restaurant/overnight-stays/:id", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const [record] = await db.select().from(overnightStays).where(eq(overnightStays.id, req.params.id));
      if (!record) return res.status(404).json({ error: "Not found" });
      if (record.restaurantId !== restaurantId) return res.status(403).json({ error: "Forbidden" });
      await db.delete(overnightStays).where(eq(overnightStays.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete overnight stay" });
    }
  });

  app.get("/api/restaurant/product-volumes", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const daysParam = parseInt((req.query.days as string) || "90", 10);
      const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? daysParam : 90;
      const volumes = await storage.getProductVolumesForRestaurant(restaurantId, days);
      res.json({ days, volumes });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product volumes" });
    }
  });

  app.get("/api/restaurant/reorder-suggestions", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const suggestions = await storage.getReorderSuggestions(restaurantId);
      res.json(suggestions);
    } catch (error) {
      console.error("Reorder suggestions error:", error);
      res.status(500).json({ error: "Failed to fetch reorder suggestions" });
    }
  });

  app.get("/api/restaurant/cost-analysis", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const month = req.query.month as string;
      if (!month || !monthParamSchema.safeParse(month).success) return res.status(400).json({ error: "Valid month (YYYY-MM) required" });

      // Guest counts are sourced PMS-first: imported PMS/API counts override
      // manual entries per date (see getEffectiveGuestCountsByDate). The cost
      // math below is unchanged — only the per-date guest count sourcing differs.
      const effectiveCounts = await storage.getEffectiveGuestCountsByDate(restaurantId);
      let totalOvernights = 0;
      let daysWithData = 0;
      for (const [date, count] of effectiveCounts) {
        if (date.startsWith(month + "-")) {
          totalOvernights += count;
          daysWithData += 1;
        }
      }

      const [ordersAgg] = await db.select({
        totalCosts: sql<number>`COALESCE(SUM(${orders.totalAmount}::numeric), 0)`,
        orderCount: sql<number>`COUNT(*)`,
      }).from(orders).where(and(
        eq(orders.restaurantId, restaurantId),
        eq(orders.status, "delivered"),
        sql`to_char(${orders.createdAt}, 'YYYY-MM') = ${month}`
      ));
      const totalCosts = Number(ordersAgg.totalCosts);
      const orderCount = Number(ordersAgg.orderCount);

      const costPerGuest = totalOvernights > 0 ? totalCosts / totalOvernights : 0;

      const [settings] = await db.select().from(costSettings).where(eq(costSettings.restaurantId, restaurantId));
      const targetCost = settings ? Number(settings.targetCostPerGuest) : 0;
      const difference = costPerGuest - targetCost;
      const percentageDeviation = targetCost > 0 ? ((costPerGuest - targetCost) / targetCost) * 100 : 0;

      res.json({
        month,
        totalOvernights,
        totalCosts: totalCosts.toFixed(2),
        costPerGuest: costPerGuest.toFixed(2),
        targetCost: targetCost.toFixed(2),
        difference: difference.toFixed(2),
        percentageDeviation: percentageDeviation.toFixed(1),
        orderCount,
        daysWithData,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to calculate cost analysis" });
    }
  });

  app.get("/api/restaurant/cost-analysis/history", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;

      // PMS-first guest counts: imported counts override manual per date, then
      // aggregated by month exactly as before.
      const effectiveCounts = await storage.getEffectiveGuestCountsByDate(restaurantId);
      const staysMonthMap = new Map<string, number>();
      for (const [date, count] of effectiveCounts) {
        const m = date.slice(0, 7);
        staysMonthMap.set(m, (staysMonthMap.get(m) ?? 0) + count);
      }
      const staysByMonth = Array.from(staysMonthMap.entries()).map(([month, overnights]) => ({ month, overnights }));

      const ordersByMonth = await db.select({
        month: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM')`,
        costs: sql<number>`SUM(${orders.totalAmount}::numeric)`,
      }).from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "delivered")))
        .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`);

      const [settings] = await db.select().from(costSettings).where(eq(costSettings.restaurantId, restaurantId));
      const targetCost = settings ? Number(settings.targetCostPerGuest) : 0;

      const months: Record<string, { overnights: number; costs: number }> = {};
      for (const s of staysByMonth) {
        months[s.month] = { overnights: Number(s.overnights), costs: 0 };
      }
      for (const o of ordersByMonth) {
        if (!months[o.month]) months[o.month] = { overnights: 0, costs: 0 };
        months[o.month].costs = Number(o.costs);
      }

      const history = Object.entries(months)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, data]) => ({
          month,
          costPerGuest: data.overnights > 0 ? Number((data.costs / data.overnights).toFixed(2)) : 0,
          totalOvernights: data.overnights,
          totalCosts: Number(data.costs.toFixed(2)),
          targetCost,
        }));

      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cost analysis history" });
    }
  });

  // ===== PMS INTEGRATION (Task #83) =====

  app.get("/api/pms/providers", async (_req, res) => {
    try {
      const providers = await storage.getPmsProviders();
      res.json(providers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch PMS providers" });
    }
  });

  app.get("/api/restaurant/pms/connection", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "restaurant") return res.status(403).json({ error: "forbidden" });
      const restaurantId = req.auth.organizationId;
      const connection = await storage.getHotelConnection(restaurantId);
      const imports = await storage.getGuestCountImports(restaurantId);
      res.json({
        connection: connection ?? null,
        importedDays: imports.length,
        lastImport: imports[0] ?? null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch PMS connection" });
    }
  });

  const pmsRequestBodySchema = z.object({
    restaurantId: z.string().min(1),
    providerId: z.string().min(1).optional(),
    pmsName: z.string().min(1),
    hotelName: z.string().min(1),
    contactName: z.string().min(1),
    contactEmail: z.string().email(),
    contactPhone: z.string().optional(),
    roomCount: z.number().int().min(0).optional(),
    requestedFeatures: z.array(z.enum(["guests", "occupancy", "forecast"])).optional(),
    message: z.string().optional(),
  });

  app.post("/api/pms/connection-requests", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const parsed = pmsRequestBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const data = parsed.data;
      // The requesting restaurant is the authenticated org, never the body value.
      data.restaurantId = req.auth.organizationId;

      const features = data.requestedFeatures ?? ["guests"];
      let providerName = data.pmsName;
      let providerMessage: string | undefined;
      // Provider used for the pending connection placeholder. For the
      // "Other / not listed" flow there is no providerId, so map to the
      // generic "other" provider row so a pending connection can still be
      // created and surfaced as "pending" in the UI.
      let connectionProviderId: string | null = data.providerId ?? null;
      if (data.providerId) {
        const provider = await storage.getPmsProvider(data.providerId);
        if (!provider) return res.status(400).json({ error: "Unknown PMS provider" });
        providerName = provider.name;
        // Provider service layer: stub adapters return a "manual setup" message.
        const adapter = getPmsProviderAdapter(provider.slug);
        const result = await adapter.connect({ externalHotelId: null });
        providerMessage = result.message;
      } else {
        const providers = await storage.getPmsProviders();
        connectionProviderId = providers.find((p) => p.slug === "other")?.id ?? null;
      }

      const request = await storage.createPmsConnectionRequest({
        restaurantId: data.restaurantId,
        providerId: data.providerId ?? null,
        pmsName: data.pmsName,
        hotelName: data.hotelName,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone ?? null,
        roomCount: data.roomCount ?? null,
        requestedFeatures: features,
        message: data.message ?? null,
      });

      // Always create a pending connection placeholder so EVERY submission
      // (including "Other / not listed") reflects a "pending" status.
      if (connectionProviderId) {
        const existing = await storage.getHotelConnection(data.restaurantId);
        if (!existing) {
          await storage.createHotelConnection({
            restaurantId: data.restaurantId,
            providerId: connectionProviderId,
            status: "pending",
            syncGuests: features.includes("guests"),
            syncOccupancy: features.includes("occupancy"),
            syncForecast: features.includes("forecast"),
          });
        }
      }

      // Confirm to the requesting restaurant that their request was received.
      await createNotificationWithPush({
        userId: data.restaurantId,
        type: "pms_request",
        title: "PMS-Anfrage gesendet",
        message: `Ihre Anfrage zur Verbindung von ${providerName} wurde übermittelt. Unser Team meldet sich in Kürze.`,
        referenceId: request.id,
      }, "restaurant");

      // Notify the admin/operator: email if configured, otherwise an in-app
      // notification to the configured operator account (ADMIN_USER_ID). This
      // is a separate operator channel — never the requesting restaurant. If no
      // channel is configured the request is still persisted and visible at
      // /admin, so the submission never silently fails.
      let emailSent = false;
      if (isAdminEmailConfigured()) {
        emailSent = await sendAdminEmail({
          subject: `New PMS connection request: ${providerName} (${data.hotelName})`,
          text: [
            `Hotel: ${data.hotelName}`,
            `PMS: ${providerName}`,
            `Contact: ${data.contactName} <${data.contactEmail}>`,
            data.contactPhone ? `Phone: ${data.contactPhone}` : null,
            data.roomCount != null ? `Rooms: ${data.roomCount}` : null,
            `Features: ${features.join(", ")}`,
            data.message ? `Message: ${data.message}` : null,
            `Request ID: ${request.id}`,
          ].filter(Boolean).join("\n"),
        });
      }

      let adminInApp = false;
      if (!emailSent) {
        const adminUserId = process.env.ADMIN_USER_ID;
        if (adminUserId) {
          await createNotificationWithPush({
            userId: adminUserId,
            type: "pms_request",
            title: "Neue PMS-Anfrage",
            message: `${providerName} – ${data.hotelName} (${data.contactName})`,
            referenceId: request.id,
          }, "restaurant");
          adminInApp = true;
        } else {
          console.warn(
            "[pms] No admin notification channel configured (set SENDGRID_API_KEY+ADMIN_EMAIL or ADMIN_USER_ID). Request visible at /admin:",
            request.id,
          );
        }
      }

      res.status(201).json({ request, emailSent, adminNotified: emailSent || adminInApp, providerMessage });
    } catch (error) {
      console.error("PMS connection request error:", error);
      res.status(500).json({ error: "Failed to submit PMS connection request" });
    }
  });

  // Webhook: PMS pushes guest counts → stored as the primary guest source.
  const guestCountWebhookSchema = z.object({
    restaurantId: z.string().min(1),
    providerId: z.string().optional(),
    counts: z.array(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      guestCount: z.number().int().min(0),
      externalRef: z.string().optional(),
    })).min(1),
  });

  // External PMS providers POST to these webhooks with no user session, so they
  // are gated by a shared secret instead of the session. Fail-closed: if the
  // secret is unset there is no legitimate caller, so reject every request.
  const verifyPmsWebhookSecret = (req: express.Request, res: express.Response): boolean => {
    const expected = process.env.PMS_WEBHOOK_SECRET;
    if (!expected) {
      res.status(503).json({ error: "PMS webhooks are not configured.", code: "PMS_WEBHOOK_SECRET_MISSING" });
      return false;
    }
    const provided = req.get("x-webhook-secret") ?? "";
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      res.status(401).json({ error: "Invalid webhook secret" });
      return false;
    }
    return true;
  };

  app.post("/api/pms/webhooks/guest-count", async (req, res) => {
    try {
      if (!verifyPmsWebhookSecret(req, res)) return;
      const parsed = guestCountWebhookSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
      const { restaurantId, providerId, counts } = parsed.data;

      let imported = 0;
      for (const c of counts) {
        await storage.upsertGuestCountImport({
          restaurantId,
          date: c.date,
          guestCount: c.guestCount,
          source: "pms",
          providerId: providerId ?? null,
          externalRef: c.externalRef ?? null,
        });
        imported += 1;
      }

      const connection = await storage.getHotelConnection(restaurantId);
      if (connection) {
        await storage.updateHotelConnection(connection.id, {
          status: "active",
          lastSyncAt: new Date(),
          guestsImported: (connection.guestsImported ?? 0) + imported,
        });
      }

      res.json({ ok: true, imported });
    } catch (error) {
      console.error("PMS guest-count webhook error:", error);
      res.status(500).json({ error: "Failed to import guest counts" });
    }
  });

  // Webhook: occupancy data. Accepted + acknowledged for future use; no
  // dashboards are built on it (out of scope for cost-per-guest).
  const occupancyWebhookSchema = z.object({
    restaurantId: z.string().min(1),
    entries: z.array(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      roomsOccupied: z.number().int().min(0),
      roomsAvailable: z.number().int().min(0),
    })).min(1),
  });

  app.post("/api/pms/webhooks/occupancy", async (req, res) => {
    try {
      if (!verifyPmsWebhookSecret(req, res)) return;
      const parsed = occupancyWebhookSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
      const { restaurantId, entries } = parsed.data;
      const connection = await storage.getHotelConnection(restaurantId);
      if (connection) {
        await storage.updateHotelConnection(connection.id, { lastSyncAt: new Date() });
      }
      res.json({ ok: true, received: entries.length });
    } catch (error) {
      console.error("PMS occupancy webhook error:", error);
      res.status(500).json({ error: "Failed to receive occupancy data" });
    }
  });

  // ===== ADMIN: PMS connection requests =====
  app.get("/api/admin/pms/requests", async (req, res) => {
    try {
      if (!requirePlatformAdmin(req, res)) return;
      const requests = await storage.getPmsConnectionRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch PMS requests" });
    }
  });

  const updatePmsRequestSchema = z.object({
    status: z.enum(["pending", "in_progress", "approved", "rejected", "completed"]).optional(),
    adminNotes: z.string().optional(),
  });

  app.patch("/api/admin/pms/requests/:id", async (req, res) => {
    try {
      if (!requirePlatformAdmin(req, res)) return;
      const parsed = updatePmsRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
      const existing = await storage.getPmsConnectionRequest(req.params.id);
      if (!existing) return res.status(404).json({ error: "Request not found" });
      const updated = await storage.updatePmsConnectionRequest(req.params.id, parsed.data);

      // Reflect approved/completed/rejected status onto the hotel connection.
      if (parsed.data.status) {
        const conn = await storage.getHotelConnection(existing.restaurantId);
        if (conn) {
          let connStatus: "active" | "disconnected" | undefined;
          if (parsed.data.status === "approved" || parsed.data.status === "completed") connStatus = "active";
          else if (parsed.data.status === "rejected") connStatus = "disconnected";
          if (connStatus) await storage.updateHotelConnection(conn.id, { status: connStatus });
        }
      }
      res.json(updated);
    } catch (error) {
      console.error("Update PMS request error:", error);
      res.status(500).json({ error: "Failed to update PMS request" });
    }
  });

  // ===== ERP INTEGRATION (supplier stock) =====

  app.get("/api/erp/providers", async (_req, res) => {
    try {
      const providers = await storage.getErpProviders();
      res.json(providers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ERP providers" });
    }
  });

  app.get("/api/supplier/erp/connection", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const connection = await storage.getSupplierErpConnection(supplierId);
      let credentials = null;
      if (connection) {
        const meta = await storage.getErpCredentialMeta(connection.id);
        // Expose ONLY non-sensitive metadata, never the secret values.
        credentials = meta ?? null;
      }
      res.json({ connection: connection ?? null, credentials });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ERP connection" });
    }
  });

  // Read-only credential STATUS for the supplier (presence + masked hint).
  // Secret values are never returned by any endpoint.
  app.get("/api/supplier/erp/credentials", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.org.role !== "supplier") return res.status(403).json({ error: "forbidden" });
      const supplierId = req.auth.organizationId;
      const connection = await storage.getSupplierErpConnection(supplierId);
      if (!connection) return res.json({ credentials: null });
      const meta = await storage.getErpCredentialMeta(connection.id);
      res.json({ credentials: meta ?? null });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ERP credentials" });
    }
  });

  // Write-only credential capture. The supplier submits the actual API key or
  // mailbox login; it is encrypted at rest and the response echoes back only
  // non-sensitive metadata (which fields are set + a masked hint).
  const erpCredentialsBodySchema = z.object({
    supplierId: z.string().min(1),
    credentialType: z.enum(["api", "excel_email"]),
    // Generic REST/JSON.
    apiKey: z.string().trim().min(1).optional(),
    apiBaseUrl: z.string().trim().min(1).optional(),
    externalSupplierId: z.string().trim().min(1).optional(),
    // Vendor-specific (Dynamics 365 / DATEV OAuth2, SAP B1 Service Layer, ...).
    tenantId: z.string().trim().min(1).optional(),
    clientId: z.string().trim().min(1).optional(),
    clientSecret: z.string().trim().min(1).optional(),
    environment: z.string().trim().min(1).optional(),
    companyId: z.string().trim().min(1).optional(),
    tokenUrl: z.string().trim().min(1).optional(),
    scope: z.string().trim().min(1).optional(),
    serviceLayerUrl: z.string().trim().min(1).optional(),
    companyDb: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    password: z.string().trim().min(1).optional(),
    // Excel-via-email (IMAP).
    mailboxHost: z.string().trim().min(1).optional(),
    mailboxPort: z.string().trim().min(1).optional(),
    mailboxUser: z.string().trim().min(1).optional(),
    mailboxPassword: z.string().trim().min(1).optional(),
  });

  // Secret keys accepted for the "api" method. Any provided ones are stored;
  // the named-vendor adapter validates the specific subset it needs at sync time.
  const ERP_API_SECRET_KEYS = [
    "apiKey", "apiBaseUrl", "externalSupplierId",
    "tenantId", "clientId", "clientSecret", "environment", "companyId",
    "tokenUrl", "scope", "serviceLayerUrl", "companyDb", "username", "password",
  ] as const;

  app.put("/api/supplier/erp/credentials", async (req, res) => {
    try {
      if (!isErpCredentialsKeyConfigured()) {
        return res.status(503).json({
          error: "Credential storage is not configured. Set the ERP_CREDENTIALS_KEY secret to enable encrypted credential storage.",
          code: "ERP_CREDENTIALS_KEY_MISSING",
        });
      }
      const parsed = erpCredentialsBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const data = parsed.data;
      const denied = checkActingCapability(req, data.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);

      const connection = await storage.getSupplierErpConnection(data.supplierId);
      if (!connection) return res.status(404).json({ error: "No ERP connection found. Request a connection first." });

      // Build the secret bundle for the chosen method. Require at least the
      // primary secret so we never store an empty credential.
      const secrets: Record<string, string> = {};
      let primary: string | undefined;
      if (data.credentialType === "api") {
        // Collect every provided API/vendor secret field. The named-vendor
        // adapter validates the specific subset it needs at sync time.
        for (const key of ERP_API_SECRET_KEYS) {
          const value = (data as Record<string, unknown>)[key];
          if (typeof value === "string" && value.trim()) secrets[key] = value.trim();
        }
        if (Object.keys(secrets).length === 0) {
          return res.status(400).json({ error: "Provide at least one credential field for the API method" });
        }
        primary = data.apiKey ?? data.clientSecret ?? data.password ?? Object.values(secrets)[0];
      } else {
        if (!data.mailboxHost || !data.mailboxUser || !data.mailboxPassword) {
          return res.status(400).json({ error: "mailboxHost, mailboxUser and mailboxPassword are required for the email method" });
        }
        secrets.mailboxHost = data.mailboxHost;
        if (data.mailboxPort) secrets.mailboxPort = data.mailboxPort;
        secrets.mailboxUser = data.mailboxUser;
        secrets.mailboxPassword = data.mailboxPassword;
        primary = data.mailboxPassword;
      }

      const meta = await storage.upsertErpCredentials({
        connectionId: connection.id,
        supplierId: data.supplierId,
        credentialType: data.credentialType,
        secrets,
        hint: primary ? maskHint(primary) : null,
      });

      // Keep the connection's recorded method in sync with the supplied
      // credentials so the admin view stays consistent.
      if (connection.connectionMethod !== data.credentialType) {
        await storage.updateSupplierErpConnection(connection.id, { connectionMethod: data.credentialType });
      }

      res.status(200).json({ ok: true, credentials: meta });
    } catch (error) {
      console.error("ERP credentials save error:", error);
      res.status(500).json({ error: "Failed to save ERP credentials" });
    }
  });

  // ===== ERP CATALOG SYNC (manual / dry-run + schedule config) =====

  const erpSyncBodySchema = z.object({
    supplierId: z.string().min(1),
    dryRun: z.boolean().optional(),
    userId: z.string().optional(),
    userName: z.string().optional(),
  });

  // Run a sync now. dryRun=true previews the changes without writing anything
  // (used before the first overwrite). A real run is overlap-safe via the
  // connection's syncStatus lock.
  app.post("/api/supplier/erp/sync", async (req, res) => {
    try {
      const parsed = erpSyncBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const { supplierId, dryRun, userId, userName } = parsed.data;
      const denied = checkActingCapability(req, supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);

      if (!isErpCredentialsKeyConfigured()) {
        return res.status(503).json({
          error: "Credential storage is not configured. Set the ERP_CREDENTIALS_KEY secret first.",
          code: "ERP_CREDENTIALS_KEY_MISSING",
        });
      }

      const connection = await storage.getSupplierErpConnection(supplierId);
      if (!connection) return res.status(404).json({ error: "No ERP connection found." });
      if (connection.status !== "active") {
        return res.status(409).json({ error: "The ERP connection is not active yet." });
      }

      const result = await runSyncForConnection(connection, {
        dryRun: !!dryRun,
        trigger: "manual",
        userId: userId ?? null,
        userName: userName ?? "ERP-Sync",
      });
      res.json(result);
    } catch (error) {
      if (error instanceof ErpSyncRunningError) {
        return res.status(409).json({ error: "A sync is already running for this connection.", code: "ERP_SYNC_RUNNING" });
      }
      if (error instanceof ErpSyncConfigError) {
        return res.status(400).json({ error: error.message, code: "ERP_SYNC_CONFIG" });
      }
      console.error("ERP sync error:", error);
      res.status(500).json({ error: "ERP sync failed" });
    }
  });

  // Test the stored ERP credentials before the first sync. Authenticates with
  // the vendor adapter and pulls a small sample (first page) so wrong tenant
  // IDs, expired secrets or bad URLs surface immediately. Never writes anything.
  const erpTestBodySchema = z.object({
    supplierId: z.string().min(1),
  });

  app.post("/api/supplier/erp/test", async (req, res) => {
    try {
      const parsed = erpTestBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const { supplierId } = parsed.data;
      const denied = checkActingCapability(req, supplierId, "products.manage");
      if (denied) return res.status(denied.status).json({ ok: false, ...denied.body });

      if (!isErpCredentialsKeyConfigured()) {
        return res.status(503).json({
          ok: false,
          error: "Credential storage is not configured. Set the ERP_CREDENTIALS_KEY secret first.",
          code: "ERP_CREDENTIALS_KEY_MISSING",
        });
      }

      const connection = await storage.getSupplierErpConnection(supplierId);
      if (!connection) return res.status(404).json({ ok: false, error: "No ERP connection found." });

      const result = await testErpConnection(connection);
      res.json(result);
    } catch (error) {
      if (error instanceof ErpSyncConfigError) {
        return res.status(400).json({ ok: false, error: error.message, code: "ERP_SYNC_CONFIG" });
      }
      console.error("ERP test error:", error);
      res.status(500).json({ ok: false, error: "ERP connection test failed" });
    }
  });

  // Update the scheduled-sync configuration (enable/disable + preferred time).
  const erpSyncConfigSchema = z.object({
    supplierId: z.string().min(1),
    syncEnabled: z.boolean().optional(),
    preferredSyncTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  });

  app.patch("/api/supplier/erp/sync-config", async (req, res) => {
    try {
      const parsed = erpSyncConfigSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const { supplierId, syncEnabled, preferredSyncTime } = parsed.data;
      const denied = checkActingCapability(req, supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);
      const connection = await storage.getSupplierErpConnection(supplierId);
      if (!connection) return res.status(404).json({ error: "No ERP connection found." });

      const patch: Partial<{ syncEnabled: boolean; preferredSyncTime: string }> = {};
      if (syncEnabled !== undefined) patch.syncEnabled = syncEnabled;
      if (preferredSyncTime !== undefined) patch.preferredSyncTime = preferredSyncTime;
      const updated = await storage.updateSupplierErpConnection(connection.id, patch);
      res.json({ ok: true, connection: updated });
    } catch (error) {
      console.error("ERP sync config error:", error);
      res.status(500).json({ error: "Failed to update sync configuration" });
    }
  });

  const erpRequestBodySchema = z.object({
    supplierId: z.string().min(1),
    providerId: z.string().min(1).optional(),
    erpName: z.string().min(1),
    companyName: z.string().min(1),
    contactName: z.string().min(1),
    contactEmail: z.string().email(),
    contactPhone: z.string().optional(),
    productCount: z.number().int().min(0).optional(),
    connectionMethod: z.enum(["api", "excel_email", "unsure"]).optional(),
    preferredSyncTime: z.string().optional(),
    message: z.string().optional(),
  });

  app.post("/api/erp/connection-requests", async (req, res) => {
    try {
      const parsed = erpRequestBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const data = parsed.data;
      const denied = checkActingCapability(req, data.supplierId, "products.manage");
      if (denied) return res.status(denied.status).json(denied.body);

      // Block duplicate open requests. Check BOTH the connection placeholder
      // (pending/active) AND any unresolved request row (pending/in_progress)
      // so a second submission is refused even if the two ever drift out of
      // sync, keeping admins from handling duplicates.
      const existingConn = await storage.getSupplierErpConnection(data.supplierId);
      if (existingConn && (existingConn.status === "pending" || existingConn.status === "active")) {
        return res.status(409).json({ error: "An ERP connection request is already open or active." });
      }
      const openRequest = await storage.getOpenErpConnectionRequest(data.supplierId);
      if (openRequest) {
        return res.status(409).json({ error: "An ERP connection request is already open or active." });
      }

      const connectionMethod = data.connectionMethod ?? "unsure";
      const preferredSyncTime = data.preferredSyncTime?.trim() || null;
      let providerName = data.erpName;
      let providerMessage: string | undefined;
      // Provider used for the pending connection placeholder. For the
      // "Other / not listed" flow there is no providerId, so map to the
      // generic "other" provider row so a pending connection can still be
      // created and surfaced as "pending" in the UI.
      let connectionProviderId: string | null = data.providerId ?? null;
      if (data.providerId) {
        const provider = await storage.getErpProvider(data.providerId);
        if (!provider) return res.status(400).json({ error: "Unknown ERP provider" });
        providerName = provider.name;
        const adapter = getErpProviderAdapter(provider.slug);
        const result = await adapter.connect({ externalSupplierId: null });
        providerMessage = result.message;
      } else {
        const providers = await storage.getErpProviders();
        connectionProviderId = providers.find((p) => p.slug === "other")?.id ?? null;
      }

      const request = await storage.createErpConnectionRequest({
        supplierId: data.supplierId,
        providerId: data.providerId ?? null,
        erpName: data.erpName,
        companyName: data.companyName,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone ?? null,
        productCount: data.productCount ?? null,
        connectionMethod,
        preferredSyncTime,
        message: data.message ?? null,
      });

      // Always create a pending connection placeholder so EVERY submission
      // (including "Other / not listed") reflects a "pending" status.
      if (connectionProviderId) {
        await storage.createSupplierErpConnection({
          supplierId: data.supplierId,
          providerId: connectionProviderId,
          status: "pending",
          connectionMethod,
          preferredSyncTime,
        });
      }

      // Confirm to the requesting supplier that their request was received.
      await createNotificationWithPush({
        userId: data.supplierId,
        type: "erp_request",
        title: "ERP-Anfrage gesendet",
        message: `Ihre Anfrage zur Verbindung von ${providerName} wurde übermittelt. Unser Team meldet sich in Kürze.`,
        referenceId: request.id,
      }, "supplier");

      // Notify the admin/operator: email if configured, otherwise an in-app
      // notification to the configured operator account (ADMIN_USER_ID).
      let emailSent = false;
      if (isAdminEmailConfigured()) {
        emailSent = await sendAdminEmail({
          subject: `New ERP connection request: ${providerName} (${data.companyName})`,
          text: [
            `Company: ${data.companyName}`,
            `ERP: ${providerName}`,
            `Contact: ${data.contactName} <${data.contactEmail}>`,
            data.contactPhone ? `Phone: ${data.contactPhone}` : null,
            data.productCount != null ? `Products/SKUs: ${data.productCount}` : null,
            `Connection method: ${connectionMethod}`,
            preferredSyncTime ? `Preferred sync time: ${preferredSyncTime}` : null,
            data.message ? `Message: ${data.message}` : null,
            `Request ID: ${request.id}`,
          ].filter(Boolean).join("\n"),
        });
      }

      let adminInApp = false;
      if (!emailSent) {
        const adminUserId = process.env.ADMIN_USER_ID;
        if (adminUserId) {
          await createNotificationWithPush({
            userId: adminUserId,
            type: "erp_request",
            title: "Neue ERP-Anfrage",
            message: `${providerName} – ${data.companyName} (${data.contactName})`,
            referenceId: request.id,
          }, "supplier");
          adminInApp = true;
        } else {
          console.warn(
            "[erp] No admin notification channel configured (set SENDGRID_API_KEY+ADMIN_EMAIL or ADMIN_USER_ID). Request visible at /admin:",
            request.id,
          );
        }
      }

      res.status(201).json({ request, emailSent, adminNotified: emailSent || adminInApp, providerMessage });
    } catch (error) {
      console.error("ERP connection request error:", error);
      res.status(500).json({ error: "Failed to submit ERP connection request" });
    }
  });

  // ===== ADMIN: ERP connection requests =====
  app.get("/api/admin/erp/requests", async (req, res) => {
    try {
      if (!requirePlatformAdmin(req, res)) return;
      const requests = await storage.getErpConnectionRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ERP requests" });
    }
  });

  const updateErpRequestSchema = z.object({
    status: z.enum(["pending", "in_progress", "approved", "rejected", "completed"]).optional(),
    adminNotes: z.string().optional(),
  });

  app.patch("/api/admin/erp/requests/:id", async (req, res) => {
    try {
      if (!requirePlatformAdmin(req, res)) return;
      const parsed = updateErpRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
      const existing = await storage.getErpConnectionRequest(req.params.id);
      if (!existing) return res.status(404).json({ error: "Request not found" });
      const updated = await storage.updateErpConnectionRequest(req.params.id, parsed.data);

      // Reflect approved/completed/rejected status onto the supplier connection.
      if (parsed.data.status) {
        const conn = await storage.getSupplierErpConnection(existing.supplierId);
        if (conn) {
          let connStatus: "active" | "disconnected" | undefined;
          if (parsed.data.status === "approved" || parsed.data.status === "completed") connStatus = "active";
          else if (parsed.data.status === "rejected") connStatus = "disconnected";
          if (connStatus) await storage.updateSupplierErpConnection(conn.id, { status: connStatus });
        }
      }
      res.json(updated);
    } catch (error) {
      console.error("Update ERP request error:", error);
      res.status(500).json({ error: "Failed to update ERP request" });
    }
  });

  // ===== WhatsApp Inbox connection (connect + request flow) =====
  // Mirrors the ERP request flow: a supplier OR restaurant requests to connect
  // their WhatsApp Business number to the Inbox; an admin reviews and approves.
  // Single provider, so no providers catalog and no encrypted credentials.
  app.get("/api/whatsapp/connection", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const userId = req.auth.organizationId;
      const connection = await storage.getWhatsappConnection(userId);
      const user = await storage.getUser(userId);
      res.json({ connection: connection ?? null, whatsappNumber: user?.whatsappNumber ?? null });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch WhatsApp connection" });
    }
  });

  const whatsappRequestBodySchema = z.object({
    whatsappNumber: z.string().trim().min(5).regex(/^\+?[0-9\s().-]{5,}$/, "Invalid phone number"),
    companyName: z.string().min(1),
    contactName: z.string().min(1),
    contactEmail: z.string().email(),
    contactPhone: z.string().optional(),
    usagePreference: z.enum(["alongside", "whatsapp_only"]).optional(),
    message: z.string().optional(),
  });

  app.post("/api/whatsapp/connection-requests", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const parsed = whatsappRequestBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      const data = { ...parsed.data, userId: req.auth.organizationId };

      const user = await storage.getUser(data.userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      const role = user.role === "restaurant" ? "restaurant" : "supplier";

      // Block duplicate open requests. Check BOTH the connection placeholder
      // (pending/active) AND any unresolved request row (pending/in_progress).
      const existingConn = await storage.getWhatsappConnection(data.userId);
      if (existingConn && (existingConn.status === "pending" || existingConn.status === "active")) {
        return res.status(409).json({ error: "A WhatsApp connection request is already open or active." });
      }
      const openRequest = await storage.getOpenWhatsappConnectionRequest(data.userId);
      if (openRequest) {
        return res.status(409).json({ error: "A WhatsApp connection request is already open or active." });
      }

      const usagePreference = data.usagePreference ?? "alongside";

      // Persist the WhatsApp number on the user account server-side. It is not
      // client-writable via the generic user-update route.
      await storage.setUserWhatsappNumber(data.userId, data.whatsappNumber);

      const request = await storage.createWhatsappConnectionRequest({
        userId: data.userId,
        whatsappNumber: data.whatsappNumber,
        companyName: data.companyName,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone ?? null,
        usagePreference,
        message: data.message ?? null,
      });

      // Always create a pending connection placeholder so the UI reflects "pending".
      await storage.createWhatsappConnection({
        userId: data.userId,
        status: "pending",
        usagePreference,
      });

      // Confirm to the requesting user that their request was received.
      await createNotificationWithPush({
        userId: data.userId,
        type: "whatsapp_request",
        title: "WhatsApp-Anfrage gesendet",
        message: `Ihre Anfrage zur Verbindung von WhatsApp wurde übermittelt. Unser Team meldet sich in Kürze.`,
        referenceId: request.id,
      }, role);

      // Notify the admin/operator: email if configured, otherwise in-app.
      let emailSent = false;
      if (isAdminEmailConfigured()) {
        emailSent = await sendAdminEmail({
          subject: `New WhatsApp connection request: ${data.companyName}`,
          text: [
            `Company: ${data.companyName}`,
            `WhatsApp: ${data.whatsappNumber}`,
            `Contact: ${data.contactName} <${data.contactEmail}>`,
            data.contactPhone ? `Phone: ${data.contactPhone}` : null,
            `Usage preference: ${usagePreference}`,
            data.message ? `Message: ${data.message}` : null,
            `Request ID: ${request.id}`,
          ].filter(Boolean).join("\n"),
        });
      }

      let adminInApp = false;
      if (!emailSent) {
        const adminUserId = process.env.ADMIN_USER_ID;
        if (adminUserId) {
          await createNotificationWithPush({
            userId: adminUserId,
            type: "whatsapp_request",
            title: "Neue WhatsApp-Anfrage",
            message: `${data.companyName} (${data.contactName})`,
            referenceId: request.id,
          }, role);
          adminInApp = true;
        } else {
          console.warn(
            "[whatsapp] No admin notification channel configured (set SENDGRID_API_KEY+ADMIN_EMAIL or ADMIN_USER_ID). Request visible at /admin:",
            request.id,
          );
        }
      }

      res.status(201).json({ request, emailSent, adminNotified: emailSent || adminInApp });
    } catch (error) {
      console.error("WhatsApp connection request error:", error);
      res.status(500).json({ error: "Failed to submit WhatsApp connection request" });
    }
  });

  // ===== ADMIN: WhatsApp connection requests =====
  app.get("/api/admin/whatsapp/requests", async (req, res) => {
    try {
      if (!requirePlatformAdmin(req, res)) return;
      const requests = await storage.getWhatsappConnectionRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch WhatsApp requests" });
    }
  });

  const updateWhatsappRequestSchema = z.object({
    status: z.enum(["pending", "in_progress", "approved", "rejected", "completed"]).optional(),
    adminNotes: z.string().optional(),
  });

  app.patch("/api/admin/whatsapp/requests/:id", async (req, res) => {
    try {
      if (!requirePlatformAdmin(req, res)) return;
      const parsed = updateWhatsappRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
      const existing = await storage.getWhatsappConnectionRequest(req.params.id);
      if (!existing) return res.status(404).json({ error: "Request not found" });
      const updated = await storage.updateWhatsappConnectionRequest(req.params.id, parsed.data);

      // Reflect approved/completed/rejected status onto the user's connection.
      if (parsed.data.status) {
        const conn = await storage.getWhatsappConnection(existing.userId);
        if (conn) {
          let connStatus: "active" | "disconnected" | undefined;
          if (parsed.data.status === "approved" || parsed.data.status === "completed") connStatus = "active";
          else if (parsed.data.status === "rejected") connStatus = "disconnected";
          if (connStatus) {
            await storage.updateWhatsappConnection(conn.id, {
              status: connStatus,
              ...(connStatus === "active" ? { lastSyncAt: new Date() } : {}),
            });
          }
        }
      }
      res.json(updated);
    } catch (error) {
      console.error("Update WhatsApp request error:", error);
      res.status(500).json({ error: "Failed to update WhatsApp request" });
    }
  });

  app.get("/api/orders/export", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const { format, dateFrom, dateTo, supplierId, restaurantId } = req.query as Record<string, string>;
      const userId = req.auth.organizationId;
      const role = req.auth.org.role;
      if (!format) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const allOrders = role === "restaurant"
        ? await storage.getOrdersByRestaurant(userId, { status: ["delivered", "confirmed", "in_delivery", "partially_confirmed", "cancelled"] })
        : await storage.getOrdersBySupplier(userId, { status: ["delivered", "confirmed", "in_delivery", "partially_confirmed", "cancelled"] });

      let filtered = allOrders;

      if (dateFrom) {
        const from = new Date(dateFrom);
        filtered = filtered.filter(o => new Date(o.createdAt) >= from);
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        filtered = filtered.filter(o => new Date(o.createdAt) <= to);
      }
      if (supplierId && role === "restaurant") {
        filtered = filtered.filter(o => o.supplierId === supplierId);
      }
      if (restaurantId && role === "supplier") {
        filtered = filtered.filter(o => o.restaurantId === restaurantId);
      }

      const escapeCsv = (val: string) => {
        if (/[;\n\r"]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
        if (/^[=+\-@]/.test(val)) return `'${val}`;
        return val;
      };

      const ordersWithItems = filtered.map(order => {
        const partner = role === "restaurant"
          ? (order.supplier?.companyName || order.supplier?.name || "Unbekannt")
          : (order.restaurant?.companyName || order.restaurant?.name || "Unbekannt");
        return { ...order, partnerName: partner };
      });

      const statusLabels: Record<string, string> = {
        pending: "Ausstehend",
        confirmed: "Bestätigt",
        partially_confirmed: "Teilbestätigt",
        in_delivery: "In Lieferung",
        delivered: "Geliefert",
        cancelled: "Storniert",
      };

      if (format === "csv") {
        const partnerLabel = role === "restaurant" ? "Lieferant" : "Restaurant";
        const header = `Bestell-Nr;${partnerLabel};Status;Datum;Lieferdatum;Artikel;Menge;Einzelpreis;Gesamt;Bestellsumme;Notizen`;
        const rows: string[] = [];

        for (const order of ordersWithItems) {
          const dateStr = new Date(order.createdAt).toLocaleDateString("de-DE");
          const deliveryDate = order.requestedDeliveryDate || "-";
          const orderItems = order.items || [];
          if (orderItems.length === 0) {
            rows.push([formatOrderNumber(order), escapeCsv(order.partnerName), statusLabels[order.status] || order.status, dateStr, deliveryDate, "-", "-", "-", "-", `${order.totalAmount}€`, escapeCsv(order.notes || "")].join(";"));
          } else {
            orderItems.forEach((item: any, idx: number) => {
              rows.push([
                idx === 0 ? formatOrderNumber(order) : "",
                idx === 0 ? escapeCsv(order.partnerName) : "",
                idx === 0 ? (statusLabels[order.status] || order.status) : "",
                idx === 0 ? dateStr : "",
                idx === 0 ? deliveryDate : "",
                escapeCsv(item.productName || item.product?.name || ""),
                String(item.quantity),
                `${item.unitPrice}€`,
                `${item.totalPrice}€`,
                idx === 0 ? `${order.totalAmount}€` : "",
                idx === 0 ? escapeCsv(order.notes || "") : ""
              ].join(";"));
            });
          }
        }

        const csvContent = "\uFEFF" + header + "\n" + rows.join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="Bestellungen_Export_${new Date().toISOString().slice(0, 10)}.csv"`);
        return res.send(csvContent);
      }

      if (format === "pdf") {
        const pdfBuffer = await generateOrdersExportPDF(ordersWithItems, role, statusLabels);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="Bestellungen_Export_${new Date().toISOString().slice(0, 10)}.pdf"`);
        return res.send(pdfBuffer);
      }

      res.status(400).json({ error: "Unsupported format" });
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Export failed" });
    }
  });

  // ===== MONTHLY COMPARISON REPORTS (Task #45) =====
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

  // Guard: caller must be the authenticated restaurant they target, derived
  // from the session — never from client-supplied identity.
  function assertRestaurantOwnership(req: any, targetRestaurantId: string): string | null {
    if (!req.auth) return "Unauthorized";
    if (req.auth.organizationId !== targetRestaurantId) return "Forbidden";
    return null;
  }

  app.get("/api/restaurant/monthly-reports", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const reports = await storage.getMonthlyReportsByRestaurant(restaurantId);
      res.json(reports);
    } catch (error) {
      console.error("Failed to list monthly reports:", error);
      res.status(500).json({ error: "Failed to list monthly reports" });
    }
  });

  app.get("/api/restaurant/monthly-reports/:id", async (req, res) => {
    try {
      const report = await storage.getMonthlyReport(req.params.id);
      if (!report) return res.status(404).json({ error: "Report not found" });
      const denied = assertRestaurantOwnership(req, report.restaurantId);
      if (denied) return res.status(403).json({ error: denied });
      res.json(report);
    } catch (error) {
      console.error("Failed to fetch monthly report:", error);
      res.status(500).json({ error: "Failed to fetch monthly report" });
    }
  });

  app.post("/api/restaurant/monthly-reports/generate", async (req, res) => {
    try {
      const { restaurantId, month } = req.body ?? {};
      if (!restaurantId || typeof restaurantId !== "string") {
        return res.status(400).json({ error: "restaurantId required" });
      }
      if (!month || typeof month !== "string" || !MONTH_RE.test(month)) {
        return res.status(400).json({ error: "month must be YYYY-MM" });
      }
      const denied = assertRestaurantOwnership(req, restaurantId);
      if (denied) return res.status(403).json({ error: denied });
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      if (month >= currentMonth) {
        return res.status(400).json({ error: "Berichte können nur für abgeschlossene Monate erstellt werden" });
      }
      const restaurant = await storage.getUser(restaurantId);
      if (!restaurant || restaurant.role !== "restaurant") {
        return res.status(404).json({ error: "Restaurant not found" });
      }
      const { report } = await generateAndStoreMonthlyReport(restaurantId, month);
      res.json(report);
    } catch (error) {
      console.error("Failed to generate monthly report:", error);
      res.status(500).json({ error: "Failed to generate monthly report" });
    }
  });

  app.get("/api/restaurant/monthly-reports/:id/download", async (req, res) => {
    try {
      const report = await storage.getMonthlyReport(req.params.id);
      if (!report) return res.status(404).json({ error: "Report not found" });
      const denied = assertRestaurantOwnership(req, report.restaurantId);
      if (denied) return res.status(403).json({ error: denied });
      if (!report.fileUrl) return res.status(409).json({ error: "PDF nicht verfügbar — bitte Bericht neu erstellen." });
      const objectService = new ObjectStorageService();
      const file = await objectService.getObjectEntityFile(report.fileUrl);
      const inline = req.query.inline === "1";
      const disposition = inline ? "inline" : "attachment";
      res.setHeader("Content-Disposition", `${disposition}; filename="Monatsbericht_${report.month}.pdf"`);
      await objectService.downloadObject(file, res);
    } catch (error) {
      console.error("Failed to download monthly report:", error);
      res.status(500).json({ error: "Failed to download monthly report" });
    }
  });

  app.get("/api/restaurant/monthly-reports/preview/:month", async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      const restaurantId = req.auth.organizationId;
      const month = req.params.month;
      if (!MONTH_RE.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });
      const payload = await computeMonthlyReport(restaurantId, month);
      res.json(payload);
    } catch (error) {
      console.error("Failed to preview monthly report:", error);
      res.status(500).json({ error: "Failed to preview monthly report" });
    }
  });

  app.patch("/api/users/:id/monthly-report-opt-out", async (req, res) => {
    try {
      const { optOut } = req.body ?? {};
      if (typeof optOut !== "boolean") return res.status(400).json({ error: "optOut must be boolean" });
      // Self-update only: the authenticated org must match the target user.
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.organizationId !== req.params.id) return res.status(403).json({ error: "Forbidden" });
      const updated = await storage.updateUser(req.params.id, { monthlyReportOptOut: optOut } as any);
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({ monthlyReportOptOut: updated.monthlyReportOptOut });
    } catch (error) {
      console.error("Failed to update opt-out:", error);
      res.status(500).json({ error: "Failed to update opt-out" });
    }
  });

  app.patch("/api/users/:id/notification-prefs", async (req, res) => {
    try {
      const parsed = notificationPrefsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid notification preferences" });
      // Self-update only: the authenticated org must match the target user.
      if (!req.auth) return res.status(401).json({ error: "unauthenticated" });
      if (req.auth.organizationId !== req.params.id) return res.status(403).json({ error: "Forbidden" });
      const updated = await storage.updateUser(req.params.id, { notificationPrefs: parsed.data } as any);
      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json({ notificationPrefs: updated.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS });
    } catch (error) {
      console.error("Failed to update notification prefs:", error);
      res.status(500).json({ error: "Failed to update notification prefs" });
    }
  });

  return httpServer;
}

async function generateOrdersExportPDF(
  orders: Array<{
    id: string;
    status: string;
    totalAmount: string;
    notes: string | null;
    createdAt: string | Date;
    requestedDeliveryDate: string | null;
    partnerName: string;
    items: Array<{ productName?: string; product?: { name: string }; quantity: number; unitPrice: string; totalPrice: string }>;
  }>,
  role: string,
  statusLabels: Record<string, string>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const partnerLabel = role === "restaurant" ? "Lieferant" : "Restaurant";
    const today = new Date().toLocaleDateString("de-DE");

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#161921");
    doc.text("GastroConnect", 40, 40);
    doc.font("Helvetica").fontSize(10).fillColor("#666666");
    doc.text(`Bestellübersicht | Erstellt am ${today}`, 40, 62);
    doc.text(`${orders.length} Bestellung${orders.length !== 1 ? "en" : ""}`, 40, 76);

    doc.moveTo(40, 95).lineTo(555, 95).strokeColor("#e0e0e0").lineWidth(1).stroke();

    let y = 110;
    const pageBottom = 780;

    for (const order of orders) {
      const blockHeight = 60 + order.items.length * 16;
      if (y + blockHeight > pageBottom) {
        doc.addPage();
        y = 40;
      }

      doc.font("Helvetica-Bold").fontSize(10).fillColor("#161921");
      doc.text(`#${formatOrderNumber(order)}`, 40, y);
      doc.font("Helvetica").fontSize(9).fillColor("#666666");
      doc.text(order.partnerName, 120, y);
      doc.text(statusLabels[order.status] || order.status, 300, y);
      doc.text(new Date(order.createdAt).toLocaleDateString("de-DE"), 420, y);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#161921");
      doc.text(`${order.totalAmount}€`, 500, y, { width: 55, align: "right" });

      y += 18;

      if (order.items.length > 0) {
        doc.font("Helvetica").fontSize(8).fillColor("#999999");
        doc.text("Artikel", 55, y);
        doc.text("Menge", 300, y);
        doc.text("Preis", 370, y);
        doc.text("Gesamt", 500, y, { width: 55, align: "right" });
        y += 14;

        for (const item of order.items) {
          if (y + 14 > pageBottom) {
            doc.addPage();
            y = 40;
          }
          doc.font("Helvetica").fontSize(8).fillColor("#333333");
          doc.text(item.productName || item.product?.name || "", 55, y, { width: 240 });
          doc.text(String(item.quantity), 300, y);
          doc.text(`${item.unitPrice}€`, 370, y);
          doc.text(`${item.totalPrice}€`, 500, y, { width: 55, align: "right" });
          y += 14;
        }
      }

      y += 6;
      doc.moveTo(40, y).lineTo(555, y).strokeColor("#f0f0f0").lineWidth(0.5).stroke();
      y += 10;
    }

    const totalSum = orders.reduce((sum, o) => sum + parseFloat(o.totalAmount || "0"), 0);
    if (y + 30 > pageBottom) {
      doc.addPage();
      y = 40;
    }
    y += 10;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#161921");
    doc.text(`Gesamtsumme: ${totalSum.toFixed(2)}€`, 40, y, { width: 515, align: "right" });

    doc.end();
  });
}

async function generateDeliveryNotePDF(order: {
  id: string;
  restaurant: { name: string; companyName: string | null; address: string | null; city: string | null; postalCode: string | null };
  supplier: { name: string; companyName: string | null; address: string | null; city: string | null; postalCode: string | null; phone: string | null; email: string };
  items: Array<{ productName: string; quantity: number; unitPrice: string; totalPrice: string }>;
  totalAmount: string;
  createdAt: Date;
  notes: string | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const supplierName = order.supplier.companyName || order.supplier.name;
    const restaurantName = order.restaurant.companyName || order.restaurant.name;
    const deliveryDate = new Date().toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    const orderDate = new Date(order.createdAt).toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });

    doc.fontSize(22).font("Helvetica-Bold").text("LIEFERSCHEIN", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").fillColor("#666666")
      .text(`Lieferschein-Nr: LS-${formatOrderNumber(order)}`, { align: "center" });
    doc.text(`Datum: ${deliveryDate}`, { align: "center" });

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(1);

    const topY = doc.y;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#333333").text("Händler:", 50, topY);
    doc.font("Helvetica").fontSize(10).fillColor("#333333");
    doc.text(supplierName, 50, topY + 16);
    if (order.supplier.address) doc.text(order.supplier.address);
    if (order.supplier.postalCode || order.supplier.city) {
      doc.text(`${order.supplier.postalCode || ""} ${order.supplier.city || ""}`.trim());
    }
    if (order.supplier.phone) doc.text(`Tel: ${order.supplier.phone}`);
    doc.text(order.supplier.email);

    doc.fontSize(10).font("Helvetica-Bold").text("Empfänger:", 300, topY);
    doc.font("Helvetica").fontSize(10);
    doc.text(restaurantName, 300, topY + 16);
    if (order.restaurant.address) doc.text(order.restaurant.address, 300);
    if (order.restaurant.postalCode || order.restaurant.city) {
      doc.text(`${order.restaurant.postalCode || ""} ${order.restaurant.city || ""}`.trim(), 300);
    }

    const afterAddresses = Math.max(doc.y, topY + 80);
    doc.y = afterAddresses;
    doc.moveDown(1);

    doc.fontSize(10).font("Helvetica").fillColor("#666666");
    doc.text(`Bestellnummer: #${formatOrderNumber(order)}`, 50);
    doc.text(`Bestelldatum: ${orderDate}`, 50);
    doc.text(`Lieferdatum: ${deliveryDate}`, 50);

    doc.moveDown(1);

    const tableTop = doc.y;
    doc.fillColor("#f5f5f5").rect(50, tableTop, 495, 22).fill();
    doc.fillColor("#333333").font("Helvetica-Bold").fontSize(10);
    doc.text("Pos.", 55, tableTop + 6, { width: 35 });
    doc.text("Produkt", 95, tableTop + 6, { width: 250 });
    doc.text("Menge", 350, tableTop + 6, { width: 60, align: "right" });
    doc.text("Einzelpreis", 415, tableTop + 6, { width: 60, align: "right" });
    doc.text("Gesamt", 480, tableTop + 6, { width: 60, align: "right" });

    let rowY = tableTop + 28;
    doc.font("Helvetica").fontSize(10).fillColor("#333333");

    order.items.forEach((item, index) => {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
      }
      if (index % 2 === 1) {
        doc.fillColor("#fafafa").rect(50, rowY - 4, 495, 20).fill();
        doc.fillColor("#333333");
      }
      doc.text(`${index + 1}`, 55, rowY, { width: 35 });
      doc.text(item.productName, 95, rowY, { width: 250 });
      doc.text(`${item.quantity}`, 350, rowY, { width: 60, align: "right" });
      doc.text(`${item.unitPrice} €`, 415, rowY, { width: 60, align: "right" });
      doc.text(`${item.totalPrice} €`, 480, rowY, { width: 60, align: "right" });
      rowY += 22;
    });

    doc.moveDown(0.5);
    doc.y = rowY + 5;
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#333333");
    doc.text(`Gesamtbetrag: ${order.totalAmount} €`, 350, doc.y, { width: 195, align: "right" });

    if (order.notes) {
      doc.moveDown(1.5);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333").text("Anmerkungen:", 50);
      doc.font("Helvetica").fontSize(10).text(order.notes, 50);
    }

    const signatureY = Math.max(doc.y + 60, 650);
    if (signatureY < 750) {
      doc.y = signatureY;
      doc.moveTo(50, doc.y).lineTo(230, doc.y).strokeColor("#999999").lineWidth(0.5).stroke();
      doc.moveTo(320, doc.y).lineTo(500, doc.y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#666666").font("Helvetica");
      doc.text("Unterschrift Händler", 50, doc.y, { width: 180, align: "center" });
      doc.text("Unterschrift Empfänger", 320, doc.y - doc.currentLineHeight(), { width: 180, align: "center" });
    }

    doc.fontSize(8).fillColor("#999999").font("Helvetica");
    doc.text(
      `Erstellt am ${deliveryDate} | ${supplierName} | GastroConnect`,
      50, 780, { width: 495, align: "center" }
    );

    doc.end();
  });
}

async function generateMonthlyInvoicePDF(data: {
  invoiceNr: string;
  monthLabel: string;
  supplierName: string;
  restaurantName: string;
  supplier: { address: string | null; city: string | null; postalCode: string | null; phone: string | null; email: string };
  restaurant: { address: string | null; city: string | null; postalCode: string | null };
  items: Array<{ date: string; orderId: string; amount: string }>;
  grandTotal: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const today = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

    doc.fontSize(22).font("Helvetica-Bold").text("MONATSRECHNUNG", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").fillColor("#666666")
      .text(`Rechnungs-Nr: ${data.invoiceNr}`, { align: "center" });
    doc.text(`Zeitraum: ${data.monthLabel}`, { align: "center" });
    doc.text(`Datum: ${today}`, { align: "center" });

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(1);

    const topY = doc.y;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#333333").text("Von:", 50, topY);
    doc.font("Helvetica").fontSize(10);
    doc.text(data.supplierName, 50, topY + 16);
    if (data.supplier.address) doc.text(data.supplier.address);
    if (data.supplier.postalCode || data.supplier.city)
      doc.text(`${data.supplier.postalCode || ""} ${data.supplier.city || ""}`.trim());
    if (data.supplier.phone) doc.text(`Tel: ${data.supplier.phone}`);
    doc.text(data.supplier.email);

    doc.fontSize(10).font("Helvetica-Bold").text("An:", 300, topY);
    doc.font("Helvetica").fontSize(10);
    doc.text(data.restaurantName, 300, topY + 16);
    if (data.restaurant.address) doc.text(data.restaurant.address, 300);
    if (data.restaurant.postalCode || data.restaurant.city)
      doc.text(`${data.restaurant.postalCode || ""} ${data.restaurant.city || ""}`.trim(), 300);

    const afterAddresses = Math.max(doc.y, topY + 80);
    doc.y = afterAddresses;
    doc.moveDown(1.5);

    const tableTop = doc.y;
    doc.fillColor("#f5f5f5").rect(50, tableTop, 495, 22).fill();
    doc.fillColor("#333333").font("Helvetica-Bold").fontSize(10);
    doc.text("Nr.", 55, tableTop + 6, { width: 35 });
    doc.text("Datum", 95, tableTop + 6, { width: 120 });
    doc.text("Bestell-Nr.", 220, tableTop + 6, { width: 150 });
    doc.text("Betrag", 420, tableTop + 6, { width: 120, align: "right" });

    let rowY = tableTop + 28;
    doc.font("Helvetica").fontSize(10).fillColor("#333333");

    data.items.forEach((item, index) => {
      if (rowY > 700) { doc.addPage(); rowY = 50; }
      if (index % 2 === 1) {
        doc.fillColor("#fafafa").rect(50, rowY - 4, 495, 20).fill();
        doc.fillColor("#333333");
      }
      doc.text(`${index + 1}`, 55, rowY, { width: 35 });
      doc.text(item.date, 95, rowY, { width: 120 });
      doc.text(`#${item.orderId}`, 220, rowY, { width: 150 });
      doc.text(`${item.amount} EUR`, 420, rowY, { width: 120, align: "right" });
      rowY += 22;
    });

    doc.y = rowY + 5;
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#333333");
    doc.text(`Gesamtbetrag: ${data.grandTotal} EUR`, 300, doc.y, { width: 245, align: "right" });

    doc.moveDown(2);
    doc.font("Helvetica").fontSize(9).fillColor("#666666");
    doc.text("Diese Rechnung wurde automatisch erstellt und ist ohne Unterschrift gueltig.", 50);

    doc.fontSize(8).fillColor("#999999").font("Helvetica");
    doc.text(
      `Erstellt am ${today} | ${data.supplierName} | GastroConnect`,
      50, 780, { width: 495, align: "center" }
    );

    doc.end();
  });
}
