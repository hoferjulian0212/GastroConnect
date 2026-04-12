import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import path from "path";
import { storage } from "./storage";
import { db } from "./db";
import { orders, messages, orderStatusHistory, complaints, orderItems, users, overnightStays, costSettings, minimumOrderValues } from "@shared/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { insertProductSchema as _insertProductSchema, insertCartItemSchema as _insertCartItemSchema, insertMessageSchema, insertComplaintSchema as _insertComplaintSchema, updateComplaintSchema as _updateComplaintSchema, insertComplaintCommentSchema as _insertComplaintCommentSchema, insertNotificationSchema as _insertNotificationSchema, insertPromotionSchema as _insertPromotionSchema, confirmOrderSchema } from "@shared/schema";
import { sendPushNotification, VAPID_PUBLIC_KEY } from "./pushService";

const insertProductSchema = _insertProductSchema.strict();
const insertCartItemSchema = _insertCartItemSchema.strict();
const insertComplaintSchema = _insertComplaintSchema.strict();
const updateComplaintSchema = _updateComplaintSchema.strict();
const insertComplaintCommentSchema = _insertComplaintCommentSchema.strict();
const insertNotificationSchema = _insertNotificationSchema.strict();
const insertPromotionSchema = _insertPromotionSchema.strict();
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { objectStorageClient, ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import PDFDocument from "pdfkit";
import { randomUUID } from "crypto";
import { z } from "zod";

import type { InsertNotification } from "@shared/schema";

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
  }
  sendPushNotification(notification.userId, {
    title: notification.title,
    message: notification.message,
    url,
    type: notification.type,
  }).catch(() => {});
  return created;
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
}).strict();

const updateProductSchema = z.object({
  name: safeShortString.optional(),
  description: safeString.optional().nullable(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  unit: safeShortString.optional(),
  category: safeShortString.optional().nullable(),
  inStock: z.boolean().optional(),
  stockQuantity: z.number().int().min(0).max(999999).optional(),
  lowStockThreshold: z.number().int().min(0).max(999999).optional(),
  minOrderQuantity: z.number().int().min(1).max(999999).optional(),
  imageUrl: safeString.optional().nullable(),
}).strict();

const stockMovementSchema = z.object({
  productId: uuidField,
  supplierId: uuidField,
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
}).strict();

const reorderSchema = z.object({
  restaurantId: uuidField,
}).strict();

const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"]),
  changedBy: uuidField.optional(),
  requestedDeliveryDate: safeShortString.optional().nullable(),
}).strict();

const editOrderItemSchema = z.object({
  productId: uuidField,
  productName: safeShortString,
  quantity: z.number().int().min(1).max(9999),
  unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
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
  supplierId: uuidField,
  approved: z.boolean(),
}).strict();

const sendMessageSchema = z.object({
  senderId: uuidField,
  content: z.string().min(1).max(50000),
  messageType: z.enum(["text", "order", "complaint", "confirmation", "delivery_status", "document", "attachment", "order_change_request"]).optional(),
  priority: z.enum(["standard", "important"]).optional(),
}).strict();

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

  // Serve static images from client/public - ensures images work in both dev and production
  const clientPublicPath = path.resolve(process.cwd(), "client", "public");
  app.use("/images", express.static(path.join(clientPublicPath, "images"), {
    maxAge: "1d",
    immutable: true,
  }));
  app.use("/favicon.png", express.static(path.join(clientPublicPath, "favicon.png")));

  // Seed data on startup
  await storage.seedData();

  // ===== USERS =====
  app.get("/api/users", async (req, res) => {
    try {
      const role = req.query.role as "restaurant" | "supplier" | undefined;
      if (role) {
        const users = await storage.getUsersByRole(role);
        res.json(users);
      } else {
        const users = await storage.getUsers();
        res.json(users);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/heartbeat", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: "userId required" });
      await storage.updateLastSeen(userId);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update heartbeat" });
    }
  });

  app.get("/api/users/:id/status", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ lastSeenAt: user.lastSeenAt || null });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const validated = updateUserSchema.parse(req.body);
      const updated = await storage.updateUser(req.params.id, validated);
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
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  // ===== PRODUCTS =====
  app.get("/api/products", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      const restaurantId = req.query.restaurantId as string;
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

  app.get("/api/supplier/products", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
      const products = await storage.getProductsBySupplier(supplierId);
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const validated = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(validated);
      res.status(201).json(product);
    } catch (error) {
      res.status(400).json({ error: "Invalid product data" });
    }
  });

  app.patch("/api/products/:id", async (req, res) => {
    try {
      const validated = updateProductSchema.parse(req.body);
      const updated = await storage.updateProduct(req.params.id, validated);
      if (!updated) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      await storage.deleteProduct(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // ===== PROMOTIONS =====
  app.get("/api/promotions", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
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
      const promo = await storage.createPromotion(validated);
      res.status(201).json(promo);
    } catch (error) {
      res.status(400).json({ error: "Invalid promotion data" });
    }
  });

  app.post("/api/promotions/bulk", async (req, res) => {
    try {
      const { productIds, supplierId, discountPercent, startDate: startStr, endDate: endStr, name, description, targetRestaurantIds } = req.body;
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
      const { id } = req.params;
      await db.update(messages).set({ dismissed: true }).where(eq(messages.id, id));
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to dismiss message" });
    }
  });

  app.patch("/api/promotions/:id", async (req, res) => {
    try {
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
      await storage.deletePromotionsByGroup(req.params.groupId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete promotion group" });
    }
  });

  app.delete("/api/promotions/:id", async (req, res) => {
    try {
      await storage.deletePromotion(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete promotion" });
    }
  });

  // ===== DELIVERY SCHEDULES =====
  app.get("/api/delivery-schedules", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
      const schedules = await storage.getDeliverySchedules(supplierId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch delivery schedules" });
    }
  });

  app.get("/api/delivery-schedules/restaurant", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      const restaurantId = req.query.restaurantId as string;
      if (!supplierId || !restaurantId) {
        return res.status(400).json({ error: "Supplier ID and Restaurant ID required" });
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
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
      const moqs = await storage.getCustomMinOrderQuantities(supplierId);
      res.json(moqs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom MOQs" });
    }
  });

  app.get("/api/custom-moq/product", async (req, res) => {
    try {
      const productId = req.query.productId as string;
      const restaurantId = req.query.restaurantId as string;
      if (!productId || !restaurantId) {
        return res.status(400).json({ error: "Product ID and Restaurant ID required" });
      }
      const moq = await storage.getCustomMinOrderQuantity(productId, restaurantId);
      res.json(moq || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom MOQ" });
    }
  });

  app.put("/api/custom-moq", async (req, res) => {
    try {
      const { productId, supplierId, restaurantId, minOrderQuantity } = req.body;
      if (!productId || !supplierId || !restaurantId || !minOrderQuantity || minOrderQuantity < 1) {
        return res.status(400).json({ error: "Invalid data" });
      }
      const moq = await storage.setCustomMinOrderQuantity({ productId, supplierId, restaurantId, minOrderQuantity });
      res.json(moq);
    } catch (error) {
      res.status(500).json({ error: "Failed to set custom MOQ" });
    }
  });

  app.delete("/api/custom-moq/:id", async (req, res) => {
    try {
      await storage.deleteCustomMinOrderQuantity(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete custom MOQ" });
    }
  });

  // ===== CUSTOM PRICES =====
  app.get("/api/custom-prices", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
      const prices = await storage.getCustomPrices(supplierId);
      res.json(prices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom prices" });
    }
  });

  app.put("/api/custom-prices", async (req, res) => {
    try {
      const { productId, supplierId, restaurantId, customPrice } = req.body;
      if (!productId || !supplierId || !restaurantId || !customPrice || parseFloat(customPrice) <= 0) {
        return res.status(400).json({ error: "Invalid data" });
      }
      const price = await storage.setCustomPrice({ productId, supplierId, restaurantId, customPrice });
      res.json(price);
    } catch (error) {
      res.status(500).json({ error: "Failed to set custom price" });
    }
  });

  app.delete("/api/custom-prices/:id", async (req, res) => {
    try {
      await storage.deleteCustomPrice(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete custom price" });
    }
  });

  // ===== SUPPLIER CUSTOMERS =====
  app.get("/api/supplier/customers", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
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
      const productId = req.query.productId as string;
      const supplierId = req.query.supplierId as string;
      if (productId) {
        const movements = await storage.getStockMovements(productId);
        return res.json(movements);
      }
      if (supplierId) {
        const movements = await storage.getStockMovementsBySupplier(supplierId);
        return res.json(movements);
      }
      return res.status(400).json({ error: "productId or supplierId required" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stock movements" });
    }
  });

  app.post("/api/stock-movements", async (req, res) => {
    try {
      const validated = stockMovementSchema.parse(req.body);
      const product = await storage.getProduct(validated.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
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
      const movement = await storage.addStockMovement({
        productId: validated.productId,
        supplierId: validated.supplierId,
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
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
      const lowStockProducts = await storage.getLowStockProducts(supplierId);
      res.json(lowStockProducts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch low stock products" });
    }
  });

  // ===== CART =====
  app.get("/api/cart", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.status(400).json({ error: "Restaurant ID required" });
      }
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
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.json({ count: 0 });
      }
      const count = await storage.getCartCount(restaurantId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cart count" });
    }
  });

  app.post("/api/cart", async (req, res) => {
    try {
      const { mode: modeParam, ...cartData } = req.body;
      const validated = insertCartItemSchema.parse(cartData);
      const product = await storage.getProduct(validated.productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      let minQty = product.minOrderQuantity || 1;
      const customMoq = await storage.getCustomMinOrderQuantity(validated.productId, validated.restaurantId);
      if (customMoq) {
        minQty = customMoq.minOrderQuantity;
      }
      if (validated.quantity < minQty) {
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
      const validated = updateCartQuantitySchema.parse(req.body);
      const cartItem = await storage.getCartItem(req.params.id);
      if (!cartItem) {
        return res.status(404).json({ error: "Cart item not found" });
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
      await storage.removeCartItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove cart item" });
    }
  });

  // ===== ORDERS =====
  app.get("/api/orders", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      const supplierId = req.query.supplierId as string;
      if (restaurantId && supplierId) {
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        const filtered = orders.filter(o => o.supplierId === supplierId);
        return res.json(filtered);
      }
      if (restaurantId) {
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        return res.json(orders);
      }
      if (supplierId) {
        const orders = await storage.getOrdersBySupplier(supplierId);
        return res.json(orders);
      }
      return res.status(400).json({ error: "restaurantId or supplierId required" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/recent", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.json([]);
      }
      const orders = await storage.getRecentOrdersByRestaurant(restaurantId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent orders" });
    }
  });

  app.get("/api/orders/pending-count", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.json({ count: 0 });
      }
      const count = await storage.getPendingOrderCount(supplierId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending count" });
    }
  });

  app.get("/api/orders/history", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.json([]);
      }
      const orders = await storage.getOrdersByRestaurant(restaurantId, { status: "delivered" });
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const validated = createOrderSchema.parse(req.body);
      const { restaurantId, supplierId: targetSupplierId, notes, requestedDeliveryDate, deliveryDates, perSupplierNotes, createdByUserId } = validated;

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
          { restaurantId, supplierId, totalAmount, status: "pending", notes: supplierNotes, requestedDeliveryDate: supplierDeliveryDate, createdByUserId: createdByUserId || restaurantId },
          orderItems as any
        );
        createdOrders.push(order);
        
        await storage.addOrderStatusHistory(order.id, null, "pending", createdByUserId || restaurantId);

        // Create order message in chat
        const conversation = await storage.getOrCreateConversation(restaurantId, supplierId);
        const orderContent = JSON.stringify({
          items: orderItems.map((item, idx) => ({
            name: item.productName,
            quantity: item.quantity,
            price: item.totalPrice,
            imageUrl: items[idx]?.product?.imageUrl || null
          })),
          total: totalAmount
        });
        await storage.sendMessage({
          conversationId: conversation.id,
          senderId: restaurantId,
          messageType: "order",
          content: orderContent,
          orderId: order.id,
        });
        
        const restaurant = await storage.getUser(restaurantId);
        await createNotificationWithPush({
          userId: supplierId,
          type: "new_order",
          title: `Neue Bestellung #${order.id.slice(0, 8)}`,
          message: `${restaurant?.companyName || restaurant?.name || "Ein Betrieb"} hat eine neue Bestellung aufgegeben #${order.id.slice(0, 8)} (€${totalAmount})`,
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
      console.error("Create order error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.post("/api/orders/direct", async (req, res) => {
    try {
      const validated = directOrderSchema.parse(req.body);
      const { restaurantId, supplierId, items, notes, createdByUserId } = validated;

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
      for (const item of items as { productId: string; quantity: number }[]) {
        const product = productMap.get(item.productId);
        if (!product) {
          return res.status(400).json({ error: `Product ${item.productId} not found` });
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

      const totalAmount = orderItems
        .reduce((sum: number, item) => sum + parseFloat(item.totalPrice), 0)
        .toFixed(2);

      const order = await storage.createOrder(
        { restaurantId, supplierId, totalAmount, status: "pending", notes: notes || "", createdByUserId: createdByUserId || restaurantId },
        orderItems as any
      );
      
      await storage.addOrderStatusHistory(order.id, null, "pending", createdByUserId || restaurantId);

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
        total: totalAmount
      });
      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: restaurantId,
        messageType: "order",
        content: orderContent,
        orderId: order.id,
      });

      res.status(201).json(order);
    } catch (error) {
      console.error("Direct order error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.post("/api/orders/:id/reorder", async (req, res) => {
    try {
      const { restaurantId } = reorderSchema.parse(req.body);
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.restaurantId !== restaurantId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
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
      const parsed = z.object({ orderIds: z.array(z.string()), supplierId: z.string() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request body" });
      const { orderIds, supplierId } = parsed.data;
      const results: { orderId: string; success: boolean; error?: string }[] = [];
      for (const orderId of orderIds) {
        try {
          const order = await storage.getOrder(orderId);
          if (!order || order.supplierId !== supplierId || order.status !== "pending") {
            results.push({ orderId, success: false, error: "Invalid order" });
            continue;
          }
          const stockErrors: string[] = [];
          for (const item of order.items) {
            const product = await storage.getProduct(item.productId);
            if (product && product.stockQuantity !== null && product.stockQuantity !== undefined) {
              const qty = item.confirmedQuantity ?? item.quantity;
              if (qty > product.stockQuantity) {
                stockErrors.push(`${item.productName}: ${qty} > ${product.stockQuantity}`);
              }
            }
          }
          if (stockErrors.length > 0) {
            results.push({ orderId, success: false, error: `Insufficient stock: ${stockErrors.join(", ")}` });
            continue;
          }
          await storage.updateOrderStatus(orderId, "confirmed");
          await storage.addOrderStatusHistory(orderId, "pending", "confirmed", supplierId);
          const existingMovements = await storage.getStockMovementsByOrder(orderId);
          const alreadyConfirmed = existingMovements.some((m: any) => m.type === "order_confirmed");
          if (!alreadyConfirmed) {
            for (const item of order.items) {
              const product = await storage.getProduct(item.productId);
              if (product) {
                const qty = item.confirmedQuantity ?? item.quantity;
                const currentStock = product.stockQuantity ?? 0;
                const newStock = Math.max(0, currentStock - qty);
                await storage.updateProductStock(item.productId, newStock);
                await storage.addStockMovement({
                  productId: item.productId,
                  supplierId: order.supplierId,
                  orderId: order.id,
                  type: "order_confirmed",
                  quantity: qty,
                  previousStock: currentStock,
                  newStock,
                  note: `Batch: Bestellung #${order.id.slice(0, 8)} bestätigt`,
                });
              }
            }
          }
          results.push({ orderId, success: true });
        } catch {
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
      const parsed = z.object({ orderIds: z.array(z.string()), supplierId: z.string() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request body" });
      const { orderIds, supplierId } = parsed.data;
      const results: { orderId: string; success: boolean; error?: string }[] = [];
      for (const orderId of orderIds) {
        try {
          const order = await storage.getOrder(orderId);
          if (!order || order.supplierId !== supplierId || order.status === "delivered" || order.status === "cancelled") {
            results.push({ orderId, success: false, error: "Invalid order" });
            continue;
          }
          const previousStatus = order.status;
          await storage.updateOrderStatus(orderId, "cancelled");
          await storage.addOrderStatusHistory(orderId, previousStatus, "cancelled", supplierId);
          results.push({ orderId, success: true });
        } catch {
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
      const { status, changedBy, requestedDeliveryDate } = updateOrderStatusSchema.parse(req.body);
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const previousStatus = order.status;

      // Stock check before confirming via legacy flow
      if (status === "confirmed" && previousStatus === "pending") {
        const stockErrors: string[] = [];
        for (const item of order.items) {
          const product = await storage.getProduct(item.productId);
          if (product && product.stockQuantity !== null && product.stockQuantity !== undefined) {
            const qty = item.confirmedQuantity ?? item.quantity;
            if (qty > product.stockQuantity) {
              stockErrors.push(`${item.productName}: ${qty} bestätigt, aber nur ${product.stockQuantity} auf Lager`);
            }
          }
        }
        if (stockErrors.length > 0) {
          return res.status(400).json({ error: "insufficient_stock", details: stockErrors });
        }
      }

      const updated = await storage.updateOrderStatus(req.params.id, status, requestedDeliveryDate ?? undefined);
      if (!updated) {
        return res.status(404).json({ error: "Order not found" });
      }
      await storage.addOrderStatusHistory(req.params.id, previousStatus, status, changedBy || undefined);

      // Stock management: deduct stock when order is confirmed via legacy flow (idempotent)
      if (status === "confirmed" && previousStatus === "pending") {
        const existingMovements = await storage.getStockMovementsByOrder(order.id);
        const alreadyConfirmed = existingMovements.some(m => m.type === "order_confirmed");
        if (!alreadyConfirmed) {
          for (const item of order.items) {
            const product = await storage.getProduct(item.productId);
            if (product) {
              const qty = item.confirmedQuantity ?? item.quantity;
              const currentStock = product.stockQuantity ?? 0;
              const newStock = Math.max(0, currentStock - qty);
              await storage.updateProductStock(item.productId, newStock);
              await storage.addStockMovement({
                productId: item.productId,
                supplierId: order.supplierId,
                orderId: order.id,
                type: "order_confirmed",
                quantity: qty,
                previousStock: currentStock,
                newStock,
                note: `Bestellung #${order.id.slice(0, 8)} bestätigt`,
              });
              await checkAndNotifyLowStock(item.productId, order.supplierId);
            }
          }
        }
      }

      // Auto-generate delivery note and send chat message when order is delivered
      if (status === "delivered" && (previousStatus === "in_delivery" || previousStatus === "confirmed" || previousStatus === "partially_confirmed")) {
        try {
          const existingDocs = await storage.getDocumentsByOrder(order.id);
          const hasDeliveryNote = existingDocs.some(d => d.type === "delivery_note");
          if (!hasDeliveryNote) {
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
            const relativePath = `documents/${fileId}.pdf`;
            const objectPath = `/objects/${relativePath}`;
            const document = await storage.createDocument({
              orderId: order.id,
              type: "delivery_note",
              title: `Lieferschein (${order.id.slice(0, 8)})`,
              fileUrl: objectPath,
              restaurantId: order.restaurantId,
              supplierId: order.supplierId,
            });
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
                fileUrl: objectPath,
              }),
              orderId: order.id,
              documentUrl: objectPath,
            });
          } else {
            const conversation = await storage.getOrCreateConversation(order.restaurantId, order.supplierId);
            const existingNote = existingDocs.find(d => d.type === "delivery_note")!;
            await storage.sendMessage({
              conversationId: conversation.id,
              senderId: order.supplierId,
              messageType: "document",
              content: JSON.stringify({
                documentId: existingNote.id,
                title: existingNote.title,
                type: "delivery_note",
                orderId: order.id,
                fileUrl: existingNote.fileUrl,
              }),
              orderId: order.id,
              documentUrl: existingNote.fileUrl,
            });
          }
        } catch (err) {
          console.error("Failed to auto-generate delivery note on delivered:", err);
        }
      }

      // Stock management: reverse stock when order is cancelled (idempotent)
      if (status === "cancelled" && (previousStatus === "confirmed" || previousStatus === "partially_confirmed" || previousStatus === "in_delivery")) {
        const existingMovements = await storage.getStockMovementsByOrder(order.id);
        const alreadyCancelled = existingMovements.some(m => m.type === "order_cancelled");
        if (!alreadyCancelled) {
          for (const item of order.items) {
            const product = await storage.getProduct(item.productId);
            if (product) {
              const qty = item.confirmedQuantity ?? item.quantity;
              const currentStock = product.stockQuantity ?? 0;
              const newStock = currentStock + qty;
              await storage.updateProductStock(item.productId, newStock);
              await storage.addStockMovement({
                productId: item.productId,
                supplierId: order.supplierId,
                orderId: order.id,
                type: "order_cancelled",
                quantity: qty,
                previousStock: currentStock,
                newStock,
                note: `Bestellung #${order.id.slice(0, 8)} storniert`,
              });
            }
          }
        }
      }

      res.json(updated);
    } catch (error) {
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

      // Check stock availability before confirming
      const stockErrors: string[] = [];
      for (const confirmItem of validated.items) {
        if (confirmItem.confirmedQuantity > 0) {
          const orderItem = order.items.find(i => i.id === confirmItem.orderItemId)!;
          const product = await storage.getProduct(orderItem.productId);
          if (product && product.stockQuantity !== null && product.stockQuantity !== undefined) {
            const available = product.stockQuantity;
            if (confirmItem.confirmedQuantity > available) {
              stockErrors.push(`${orderItem.productName}: ${confirmItem.confirmedQuantity} bestätigt, aber nur ${available} auf Lager`);
            }
          }
        }
      }
      if (stockErrors.length > 0) {
        return res.status(400).json({ error: "insufficient_stock", details: stockErrors });
      }

      let totalConfirmedAmount = 0;
      let allFullyConfirmed = true;
      let allRejected = true;
      const confirmationDetails: { name: string; ordered: number; confirmed: number; rejected: number; price: string }[] = [];

      for (const confirmItem of validated.items) {
        const orderItem = order.items.find(i => i.id === confirmItem.orderItemId)!;
        const rejectedQty = orderItem.quantity - confirmItem.confirmedQuantity;
        await storage.updateOrderItemConfirmation(confirmItem.orderItemId, confirmItem.confirmedQuantity, rejectedQty);

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

      const updated = await storage.updateOrderStatus(req.params.id, newStatus);
      if (!updated) {
        return res.status(500).json({ error: "Failed to update order status" });
      }

      await db.update(orders).set({ totalAmount: totalConfirmedAmount.toFixed(2), updatedAt: new Date() }).where(eq(orders.id, req.params.id));

      await storage.addOrderStatusHistory(req.params.id, "pending", newStatus, validated.changedBy || undefined);

      // Stock management: deduct confirmed quantities
      const existingMovements = await storage.getStockMovementsByOrder(order.id);
      const alreadyConfirmed = existingMovements.some(m => m.type === "order_confirmed");
      if (!alreadyConfirmed) {
        for (const confirmItem of validated.items) {
          if (confirmItem.confirmedQuantity > 0) {
            const orderItem = order.items.find(i => i.id === confirmItem.orderItemId)!;
            const product = await storage.getProduct(orderItem.productId);
            if (product) {
              const currentStock = product.stockQuantity ?? 0;
              const newStock = Math.max(0, currentStock - confirmItem.confirmedQuantity);
              await storage.updateProductStock(orderItem.productId, newStock);
              await storage.addStockMovement({
                productId: orderItem.productId,
                supplierId: order.supplierId,
                orderId: order.id,
                type: "order_confirmed",
                quantity: confirmItem.confirmedQuantity,
                previousStock: currentStock,
                newStock,
                note: newStatus === "partially_confirmed"
                  ? `Bestellung #${order.id.slice(0, 8)} teilbestätigt (${confirmItem.confirmedQuantity} von ${order.items.find(i => i.id === confirmItem.orderItemId)!.quantity})`
                  : `Bestellung #${order.id.slice(0, 8)} bestätigt`,
              });
              await checkAndNotifyLowStock(orderItem.productId, order.supplierId);
            }
          }
        }
      }

      // Send notification to restaurant
      const supplier = await storage.getUser(order.supplierId);
      const isPartial = newStatus === "partially_confirmed";
      await createNotificationWithPush({
        userId: order.restaurantId,
        type: "order_status",
        title: isPartial
          ? `Bestellung teilbestätigt #${order.id.slice(0, 8)}`
          : allRejected
            ? `Bestellung storniert #${order.id.slice(0, 8)}`
            : `Bestellung bestätigt #${order.id.slice(0, 8)}`,
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
        status: newStatus,
        message: isPartial
          ? `Bestellung #${order.id.slice(0, 8)} wurde bearbeitet. Einige Mengen wurden angepasst.`
          : allRejected
            ? `Bestellung #${order.id.slice(0, 8)} wurde vollständig abgelehnt.`
            : `Bestellung #${order.id.slice(0, 8)} wurde bestätigt.`,
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
      const { items, restaurantId, requestedDeliveryDate } = validated;
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.status !== "pending") {
        return res.status(400).json({ error: "Only pending orders can be edited" });
      }
      if (order.restaurantId !== restaurantId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const orderItems = items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: (parseFloat(item.unitPrice) * item.quantity).toFixed(2)
      }));

      const totalAmount = orderItems
        .reduce((sum: number, item: any) => sum + parseFloat(item.totalPrice), 0)
        .toFixed(2);

      const updated = await storage.updateOrderItems(req.params.id, orderItems as any, totalAmount, requestedDeliveryDate);

      const conversation = await storage.getOrCreateConversation(order.restaurantId, order.supplierId);
      const restaurant = await storage.getUser(order.restaurantId);
      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: order.restaurantId,
        messageType: "order_change_request",
        content: JSON.stringify({
          type: "order_edited",
          orderId: order.id,
          message: `Bestellung #${order.id.slice(0, 8)} wurde angepasst`,
          items: orderItems.map((i: any) => ({ name: i.productName, quantity: i.quantity, price: i.totalPrice })),
          total: totalAmount
        }),
        orderId: order.id,
      });

      await createNotificationWithPush({
        userId: order.supplierId,
        type: "order_status",
        title: `Bestellung angepasst #${order.id.slice(0, 8)}`,
        message: `${restaurant?.companyName || restaurant?.name || "Ein Betrieb"} hat Bestellung #${order.id.slice(0, 8)} angepasst`,
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
      const { restaurantId, reason } = changeRequestSchema.parse(req.body);
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.status === "pending" || order.status === "delivered" || order.status === "cancelled") {
        return res.status(400).json({ error: "Change request not applicable for this status" });
      }
      if (order.restaurantId !== restaurantId) {
        return res.status(403).json({ error: "Not authorized" });
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
          status: "pending",
          reason: reason || "",
          message: `Änderungsanfrage für Bestellung #${order.id.slice(0, 8)}`
        }),
        orderId: order.id,
      });

      await createNotificationWithPush({
        userId: order.supplierId,
        type: "order_status",
        title: `Änderungsanfrage #${order.id.slice(0, 8)}`,
        message: `${restaurant?.companyName || restaurant?.name || "Ein Betrieb"} möchte Bestellung #${order.id.slice(0, 8)} ändern`,
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
      const { supplierId, approved } = changeRequestRespondSchema.parse(req.body);
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.supplierId !== supplierId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      if (order.status === "delivered" || order.status === "cancelled" || order.status === "pending") {
        return res.status(400).json({ error: "Cannot respond to change request for this order status" });
      }

      const conversation = await storage.getOrCreateConversation(order.restaurantId, order.supplierId);
      const supplier = await storage.getUser(order.supplierId);

      if (approved) {
        const previousStatus = order.status;
        await storage.updateOrderStatus(req.params.id, "pending");
        await storage.addOrderStatusHistory(req.params.id, previousStatus, "pending", supplierId);

        // Reverse stock deductions since order goes back to pending (idempotent)
        if (previousStatus === "confirmed" || previousStatus === "partially_confirmed" || previousStatus === "in_delivery") {
          const existingMovements = await storage.getStockMovementsByOrder(order.id);
          const alreadyReversed = existingMovements.some(m => m.type === "order_reversed");
          if (!alreadyReversed) {
            for (const item of order.items) {
              const product = await storage.getProduct(item.productId);
              if (product) {
                const qty = item.confirmedQuantity ?? item.quantity;
                const currentStock = product.stockQuantity ?? 0;
                const newStock = currentStock + qty;
                await storage.updateProductStock(item.productId, newStock);
                await storage.addStockMovement({
                  productId: item.productId,
                  supplierId: order.supplierId,
                  orderId: order.id,
                  type: "order_reversed",
                  quantity: qty,
                  previousStock: currentStock,
                  newStock,
                  note: `Bestellung #${order.id.slice(0, 8)} zurück auf ausstehend (Änderungsanfrage genehmigt)`,
                });
              }
            }
          }
        }

        await storage.sendMessage({
          conversationId: conversation.id,
          senderId: order.supplierId,
          messageType: "order_change_request",
          content: JSON.stringify({
            type: "change_request_response",
            orderId: order.id,
            approved: true,
            message: `Änderungsanfrage für Bestellung #${order.id.slice(0, 8)} genehmigt – Bestellung ist wieder offen zur Bearbeitung`
          }),
          orderId: order.id,
        });

        await createNotificationWithPush({
          userId: order.restaurantId,
          type: "order_status",
          title: `Änderung genehmigt #${order.id.slice(0, 8)}`,
          message: `${supplier?.companyName || supplier?.name || "Händler"} hat die Änderungsanfrage für Bestellung #${order.id.slice(0, 8)} genehmigt`,
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
            approved: false,
            message: `Änderungsanfrage für Bestellung #${order.id.slice(0, 8)} abgelehnt`
          }),
          orderId: order.id,
        });

        await createNotificationWithPush({
          userId: order.restaurantId,
          type: "order_status",
          title: `Änderung abgelehnt #${order.id.slice(0, 8)}`,
          message: `${supplier?.companyName || supplier?.name || "Händler"} hat die Änderungsanfrage für Bestellung #${order.id.slice(0, 8)} abgelehnt`,
          referenceId: order.id
        }, "restaurant");
      }

      res.json({ success: true, approved });
    } catch (error) {
      console.error("Change request respond error:", error);
      res.status(500).json({ error: "Failed to respond to change request" });
    }
  });

  // ===== SUPPLIER ORDERS =====
  app.get("/api/supplier/orders", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
      const orders = await storage.getOrdersBySupplier(supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/supplier/upcoming-deliveries", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) return res.json([]);
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
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.json([]);
      }
      const orders = await storage.getRecentOrdersBySupplier(supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent orders" });
    }
  });

  app.get("/api/supplier/action-required", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) return res.json({ staleOrders: [], openComplaints: [] });

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
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.json([]);
      }
      const orders = await storage.getOrdersBySupplier(supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  // ===== CONVERSATIONS =====
  app.get("/api/conversations", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const role = req.query.role as "restaurant" | "supplier";
      
      if (!userId) {
        return res.json([]);
      }

      // Determine role from user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.json([]);
      }

      const conversations = await storage.getConversations(userId, user.role as "restaurant" | "supplier");
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/unread", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.json({ count: 0 });
      }
      const count = await storage.getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/conversations/:id/statuses", async (req, res) => {
    try {
      const statuses = await storage.getConversationStatuses(req.params.id);
      res.json(statuses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statuses" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const validated = sendMessageSchema.parse(req.body);
      const message = await storage.sendMessage({
        conversationId: req.params.id,
        senderId: validated.senderId,
        messageType: validated.messageType || "text",
        content: validated.content,
        priority: validated.priority || "standard",
      });
      
      const conversation = await storage.getConversation(req.params.id);
      if (conversation) {
        const senderId = validated.senderId;
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
      const { userId } = markReadSchema.parse(req.body);
      await storage.markMessagesAsRead(req.params.id, userId);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const validated = createConversationSchema.parse(req.body);
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
      const validated = schema.parse(req.body);
      const conversation = await storage.getOrCreateConversation(validated.restaurantId, validated.supplierId);
      const content = JSON.stringify({
        refType: validated.referenceType,
        refId: validated.referenceId,
        refLabel: validated.referenceLabel,
        text: validated.message,
      });
      const message = await storage.sendMessage({
        conversationId: conversation.id,
        senderId: validated.senderId,
        messageType: "text",
        content,
      });
      const sender = await storage.getUser(validated.senderId);
      const recipientId = conversation.restaurantId === validated.senderId
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
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) return res.json([]);
      const templates = await storage.getOrderTemplates(restaurantId);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/order-templates/:id", async (req, res) => {
    try {
      const template = await storage.getOrderTemplate(req.params.id);
      if (!template) return res.status(404).json({ error: "Template not found" });
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  app.post("/api/order-templates", async (req, res) => {
    try {
      const { restaurantId, name, items } = req.body;
      if (!restaurantId || !name || !items?.length) {
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

  app.delete("/api/order-templates/:id", async (req, res) => {
    try {
      await storage.deleteOrderTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // ===== STATS =====
  app.get("/api/restaurant/upcoming-deliveries", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) return res.json([]);
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

  app.get("/api/restaurant/stats", async (req, res) => {
    try {
      const restaurantId = (req.query.restaurantId || req.query.userId) as string;
      if (!restaurantId) {
        return res.json({ pendingOrders: 0, unreadMessages: 0, totalSuppliers: 0 });
      }
      const stats = await storage.getRestaurantStats(restaurantId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/supplier/stats", async (req, res) => {
    try {
      const supplierId = (req.query.supplierId || req.query.userId) as string;
      if (!supplierId) {
        return res.json({ newOrders: 0, unreadMessages: 0, totalProducts: 0, monthlyRevenue: 0 });
      }
      const stats = await storage.getSupplierStats(supplierId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/supplier/detailed-stats", async (req, res) => {
    try {
      const supplierId = (req.query.supplierId || req.query.userId) as string;
      if (!supplierId) {
        return res.json({ monthlyRevenue: [], topProducts: [], ordersByStatus: [], totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 });
      }
      const stats = await storage.getSupplierDetailedStats(supplierId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch detailed stats" });
    }
  });

  app.get("/api/supplier/restaurants", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.json([]);
      }
      const restaurants = await storage.getRestaurantsForSupplier(supplierId);
      res.json(restaurants);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch restaurants" });
    }
  });

  // ===== COMPLAINTS =====
  app.get("/api/complaints", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      const supplierId = req.query.supplierId as string;
      if (restaurantId) {
        const complaints = await storage.getComplaintsByRestaurant(restaurantId);
        return res.json(complaints);
      }
      if (supplierId) {
        const complaints = await storage.getComplaintsBySupplier(supplierId);
        return res.json(complaints);
      }
      return res.status(400).json({ error: "restaurantId or supplierId required" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  });

  app.post("/api/complaints", async (req, res) => {
    try {
      const { priorityImmediate, affectedItems, ...complaintData } = req.body;
      const hasAffectedItems = Array.isArray(affectedItems) && affectedItems.length > 0;
      const validated = insertComplaintSchema.parse({
        ...complaintData,
        priority: (priorityImmediate || hasAffectedItems) ? "urgent" : "standard",
        affectedItems: hasAffectedItems ? JSON.stringify(affectedItems) : null,
      });
      const complaint = await storage.createComplaint(validated);
      
      await storage.addComplaintStatusHistory(complaint.id, null, "open", validated.restaurantId);
      
      // Create complaint message in chat
      const conversation = await storage.getOrCreateConversation(validated.restaurantId, validated.supplierId);
      const complaintContent = JSON.stringify({
        title: validated.title,
        description: validated.description,
        orderId: validated.orderId,
        complaintId: complaint.id,
        affectedItems: hasAffectedItems ? affectedItems : undefined,
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
        title: `Neue Reklamation #${complaint.id.slice(0, 8)}`,
        message: `${restaurant?.companyName || restaurant?.name || "Ein Betrieb"} hat eine Reklamation eingereicht #${complaint.id.slice(0, 8)}: ${validated.title}`,
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
      const history = await storage.getOrderStatusHistory(req.params.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch status history" });
    }
  });

  app.get("/api/complaints/:id/status-history", async (req, res) => {
    try {
      const history = await storage.getComplaintStatusHistory(req.params.id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch status history" });
    }
  });

  app.get("/api/complaints/by-order/:orderId", async (req, res) => {
    try {
      const complaint = await storage.getComplaintByOrderId(req.params.orderId);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      res.json(complaint);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch complaint" });
    }
  });

  app.get("/api/complaints/:id", async (req, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      res.json(complaint);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch complaint" });
    }
  });

  app.patch("/api/complaints/:id", async (req, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      
      const { changedBy: rawChangedBy, ...complaintBody } = req.body;
      const changedBy = typeof rawChangedBy === "string" ? rawChangedBy.slice(0, 100) : undefined;
      const validated = updateComplaintSchema.parse(complaintBody);
      const isContentEdit = validated.title !== undefined || validated.description !== undefined || validated.mediaUrls !== undefined;
      
      if (isContentEdit && complaint.status !== "open") {
        return res.status(400).json({ error: "Reklamationen können nur bearbeitet werden, wenn der Status 'Offen' ist." });
      }
      
      const previousStatus = complaint.status;
      const updated = await storage.updateComplaint(req.params.id, validated);
      
      if (validated.status && validated.status !== previousStatus) {
        await storage.addComplaintStatusHistory(req.params.id, previousStatus, validated.status, changedBy);
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Update complaint error:", error);
      res.status(400).json({ error: "Invalid complaint data" });
    }
  });

  app.get("/api/complaints/:id/comments", async (req, res) => {
    try {
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

      const { items, deliveryDate, notes, supplierId } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Items are required" });
      }
      if (!deliveryDate) {
        return res.status(400).json({ error: "Delivery date is required" });
      }

      const effectiveSupplierId = complaint.supplierId;
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

      const orderNotes = notes || `Nachlieferung zu Reklamation #${complaint.id.slice(0, 8)}`;
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
        orderItems as any
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
        complaintId: complaint.id
      });
      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: effectiveSupplierId,
        messageType: "order",
        content: orderContent,
        orderId: order.id,
      });

      await storage.updateComplaint(req.params.id, { status: "in_progress" });
      const previousStatus = complaint.status;
      if (previousStatus !== "in_progress") {
        await storage.addComplaintStatusHistory(req.params.id, previousStatus, "in_progress", effectiveSupplierId);
      }

      const supplier = await storage.getUser(effectiveSupplierId);
      await createNotificationWithPush({
        userId: complaint.restaurantId,
        type: "new_order",
        title: `Nachlieferung #${order.id.slice(0, 8)}`,
        message: `${supplier?.companyName || supplier?.name || "Ihr Händler"} hat eine Nachlieferung zu Ihrer Reklamation #${complaint.id.slice(0, 8)} erstellt (€${totalAmount})`,
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
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      
      const validated = insertComplaintCommentSchema.parse({
        ...req.body,
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
        title: `Neuer Kommentar #${complaint.id.slice(0, 8)}`,
        message: `${commenter?.companyName || commenter?.name || "Jemand"} hat einen Kommentar zur Reklamation #${complaint.id.slice(0, 8)} hinzugefügt: "${validated.content.substring(0, 50)}${validated.content.length > 50 ? '...' : ''}"`,
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
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.json([]);
      }
      const suppliers = await storage.getSuppliersWithOrders(restaurantId);
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  app.get("/api/orders-by-supplier", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      const supplierId = req.query.supplierId as string;
      if (!restaurantId || !supplierId) {
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
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }
      const notificationsList = await storage.getNotifications(userId);
      res.json(notificationsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/count", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notification count" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const validated = insertNotificationSchema.parse(req.body);
      const user = await storage.getUser(validated.userId);
      const notification = await createNotificationWithPush(validated, user?.role || "restaurant");
      res.status(201).json(notification);
    } catch (error) {
      res.status(500).json({ error: "Failed to create notification" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const updated = await storage.markNotificationAsRead(req.params.id);
      if (!updated) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-by-reference", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const referenceId = req.query.referenceId as string;
      const type = req.query.type as string | undefined;
      if (!userId || !referenceId) {
        return res.status(400).json({ error: "userId and referenceId required" });
      }
      await storage.markNotificationsByReferenceAsRead(userId, referenceId, type);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }
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
    userId: uuidField,
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
      const { userId, subscription } = pushSubscribeSchema.parse(req.body);
      await storage.savePushSubscription({
        userId,
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

  app.get("/api/restaurant/supplier-order-stats", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      const supplierId = req.query.supplierId as string;
      if (!restaurantId || !supplierId) {
        return res.status(400).json({ error: "restaurantId and supplierId required" });
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
      const restaurantId = req.query.restaurantId as string;
      const supplierId = req.query.supplierId as string;
      const month = req.query.month as string;
      if (!restaurantId || !supplierId || !month) {
        return res.status(400).json({ error: "restaurantId, supplierId and month required" });
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
          orderId: o.id.slice(0, 8).toUpperCase(),
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
      const userId = req.query.userId as string;
      const role = req.query.role as "restaurant" | "supplier";
      if (!userId || !role) {
        return res.status(400).json({ error: "userId and role required" });
      }
      const docs = await storage.getDocumentsByUser(userId, role);
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/orders/:id/delivery-note/download", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const docs = await storage.getDocumentsByOrder(order.id);
      const deliveryNote = docs.find(d => d.type === "delivery_note");
      if (deliveryNote) {
        const objectService = new ObjectStorageService();
        const objectFile = await objectService.getObjectEntityFile(deliveryNote.fileUrl);
        res.setHeader("Content-Disposition", `attachment; filename="Lieferschein_${order.id.slice(0, 8)}.pdf"`);
        await objectService.downloadObject(objectFile, res);
      } else {
        const pdfBuffer = await generateDeliveryNotePDF(order);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="Lieferschein_${order.id.slice(0, 8)}.pdf"`);
        res.send(pdfBuffer);
      }
    } catch (error) {
      console.error("Failed to download delivery note:", error);
      res.status(500).json({ error: "Failed to download delivery note" });
    }
  });

  app.post("/api/orders/:id/delivery-note", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.status !== "in_delivery") {
        return res.status(400).json({ error: "Order must be in delivery status" });
      }

      const existingDocs = await storage.getDocumentsByOrder(order.id);
      const hasDeliveryNote = existingDocs.some(d => d.type === "delivery_note");
      if (hasDeliveryNote) {
        return res.status(400).json({ error: "Delivery note already exists", document: existingDocs.find(d => d.type === "delivery_note") });
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
        metadata: {
          contentType: "application/pdf",
        },
      });

      const entityDir = privateDir.endsWith("/") ? privateDir : `${privateDir}/`;
      const relativePath = `documents/${fileId}.pdf`;
      const objectPath = `/objects/${relativePath}`;

      const document = await storage.createDocument({
        orderId: order.id,
        type: "delivery_note",
        title: `Lieferschein (${order.id.slice(0, 8)})`,
        fileUrl: objectPath,
        restaurantId: order.restaurantId,
        supplierId: order.supplierId,
      });

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
          fileUrl: objectPath,
        }),
        orderId: order.id,
        documentUrl: objectPath,
      });

      res.json(document);
    } catch (error) {
      console.error("Failed to generate delivery note:", error);
      res.status(500).json({ error: "Failed to generate delivery note" });
    }
  });

  app.get("/api/orders/:id/delivery-note/preview", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
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
      res.setHeader("Content-Disposition", `attachment; filename="Lieferschein_${order.id.slice(0, 8)}.pdf"`);
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
      const validated = attachmentRequestSchema.parse(req.body);
      const { name, size, contentType, conversationId, senderId } = validated;
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
      const conversationId = req.params.id;
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }
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
      const fileUrl = req.query.fileUrl as string;
      const userId = req.query.userId as string;
      const conversationId = req.query.conversationId as string;

      if (!fileUrl || !userId) {
        return res.status(400).json({ error: "fileUrl and userId are required" });
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
      const supplierId = req.query.supplierId as string;
      if (!supplierId) return res.status(400).json({ error: "supplierId required" });
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
      const parsed = movBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { supplierId, zone, minimumValue } = parsed.data;
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
      const supplierId = req.query.supplierId as string;
      if (!supplierId) return res.status(400).json({ error: "supplierId required" });
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
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) return res.status(400).json({ error: "restaurantId required" });
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
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) return res.status(400).json({ error: "restaurantId required" });
      const [settings] = await db.select().from(costSettings).where(eq(costSettings.restaurantId, restaurantId));
      res.json(settings || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cost settings" });
    }
  });

  app.post("/api/restaurant/cost-settings", async (req, res) => {
    try {
      const parsed = costSettingsBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { restaurantId, targetCostPerGuest } = parsed.data;
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
      const restaurantId = req.query.restaurantId as string;
      const month = req.query.month as string;
      if (!restaurantId) return res.status(400).json({ error: "restaurantId required" });
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
      const parsed = overnightStaysBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const { restaurantId, date, overnightStays: stays } = parsed.data;
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
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) return res.status(400).json({ error: "restaurantId required" });
      const [record] = await db.select().from(overnightStays).where(eq(overnightStays.id, req.params.id));
      if (!record) return res.status(404).json({ error: "Not found" });
      if (record.restaurantId !== restaurantId) return res.status(403).json({ error: "Forbidden" });
      await db.delete(overnightStays).where(eq(overnightStays.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete overnight stay" });
    }
  });

  app.get("/api/restaurant/cost-analysis", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      const month = req.query.month as string;
      if (!restaurantId) return res.status(400).json({ error: "restaurantId required" });
      if (!month || !monthParamSchema.safeParse(month).success) return res.status(400).json({ error: "Valid month (YYYY-MM) required" });

      const monthPrefix = month + "%";
      const [staysAgg] = await db.select({
        totalOvernights: sql<number>`COALESCE(SUM(${overnightStays.overnightStays}), 0)`,
        daysWithData: sql<number>`COUNT(*)`,
      }).from(overnightStays).where(and(
        eq(overnightStays.restaurantId, restaurantId),
        sql`${overnightStays.date} LIKE ${monthPrefix}`
      ));
      const totalOvernights = Number(staysAgg.totalOvernights);
      const daysWithData = Number(staysAgg.daysWithData);

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
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) return res.status(400).json({ error: "restaurantId required" });

      const staysByMonth = await db.select({
        month: sql<string>`SUBSTRING(${overnightStays.date}, 1, 7)`,
        overnights: sql<number>`SUM(${overnightStays.overnightStays})`,
      }).from(overnightStays)
        .where(eq(overnightStays.restaurantId, restaurantId))
        .groupBy(sql`SUBSTRING(${overnightStays.date}, 1, 7)`);

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

  app.get("/api/orders/export", async (req, res) => {
    try {
      const { userId, role, format, dateFrom, dateTo, supplierId, restaurantId } = req.query as Record<string, string>;
      if (!userId || !role || !format) {
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
            rows.push([order.id.slice(0, 8), escapeCsv(order.partnerName), statusLabels[order.status] || order.status, dateStr, deliveryDate, "-", "-", "-", "-", `${order.totalAmount}€`, escapeCsv(order.notes || "")].join(";"));
          } else {
            orderItems.forEach((item: any, idx: number) => {
              rows.push([
                idx === 0 ? order.id.slice(0, 8) : "",
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
      doc.text(`#${order.id.slice(0, 8)}`, 40, y);
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
      .text(`Lieferschein-Nr: LS-${order.id.slice(0, 8).toUpperCase()}`, { align: "center" });
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
    doc.text(`Bestellnummer: #${order.id.slice(0, 8).toUpperCase()}`, 50);
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
