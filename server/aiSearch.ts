import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import {
  orders, orderItems, users, formatOrderNumber,
  aiChats, aiChatMessages,
  complaints, conversations, messages, promotions, products,
} from "@shared/schema";
import { and, eq, desc, ilike, or, inArray, ne, gte, lte, sql } from "drizzle-orm";
import { storage } from "./storage";

type Role = "restaurant" | "supplier";

interface AiActionRaw {
  kind: "open_inbox" | "open_order";
  orderId?: string;
  suggestedMessage?: string;
  label?: string;
}

interface AiAction {
  kind: "open_inbox" | "open_order";
  label: string;
  href: string;
  orderId?: string;
  orderNumber?: string;
  partnerId?: string;
  suggestedMessage?: string;
}

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function likePattern(raw: string): string {
  const safe = String(raw || "").replace(/[\\%_]/g, (m) => "\\" + m);
  return `%${safe}%`;
}

// Read-only, role-scoped data lookups the model can call. Every query is filtered
// by the trusted userId/role so the assistant can never read another tenant's data.
function buildTools(userId: string, role: Role) {
  const ownOrderCol = role === "restaurant" ? orders.restaurantId : orders.supplierId;
  const partnerCol = role === "restaurant" ? orders.supplierId : orders.restaurantId;
  const partnerRoleLabel = role === "restaurant" ? "supplier" : "customer";

  async function find_recent_order_with_product(args: { productName?: string }) {
    const name = String(args?.productName || "").trim();
    if (!name) return { error: "productName is required" };
    const rows = await db
      .selectDistinct({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        lineTotal: orderItems.totalPrice,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(eq(ownOrderCol, userId), ilike(orderItems.productName, likePattern(name))))
      .orderBy(desc(orders.createdAt))
      .limit(5);
    return {
      matches: rows.map((r) => ({
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: r.requestedDeliveryDate || null,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
        product: { name: r.productName, quantity: r.quantity, unitPrice: r.unitPrice, lineTotal: r.lineTotal },
      })),
    };
  }

  async function find_orders_by_partner(args: { partnerName?: string; status?: string }) {
    const name = String(args?.partnerName || "").trim();
    if (!name) return { error: "partnerName is required" };
    const pat = likePattern(name);
    const conds = [
      eq(ownOrderCol, userId),
      or(ilike(users.companyName, pat), ilike(users.name, pat)),
    ];
    const status = String(args?.status || "").trim();
    const validStatuses = ["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"];
    if (status && validStatuses.includes(status)) conds.push(eq(orders.status, status as any));
    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(...conds))
      .orderBy(desc(orders.createdAt))
      .limit(10);
    return {
      orders: rows.map((r) => ({
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: r.requestedDeliveryDate || null,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
      })),
    };
  }

  async function get_order_status(args: { orderNumber?: string }) {
    const q = String(args?.orderNumber || "").trim();
    if (!q) return { error: "orderNumber is required" };
    const digits = q.replace(/[^0-9a-zA-Z]/g, "");
    const conds = [eq(ownOrderCol, userId)];
    const orFilters = [ilike(orders.orderNumber, likePattern(q))];
    if (digits) orFilters.push(ilike(orders.orderNumber, likePattern(digits)));
    orFilters.push(eq(orders.id, q));
    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        originalDeliveryDate: orders.originalDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(conds[0], or(...orFilters)))
      .orderBy(desc(orders.createdAt))
      .limit(5);
    return {
      matches: rows.map((r) => ({
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: r.requestedDeliveryDate || null,
        originalDeliveryDate: r.originalDeliveryDate || null,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
      })),
    };
  }

  // List the user's active (committed) deliveries and flag which are overdue. This
  // answers questions like "is there an overdue delivery?", "what is being delivered
  // this week?" or "are any orders late?" WITHOUT needing a partner or order number.
  async function list_deliveries(args: { onlyOverdue?: boolean }) {
    const onlyOverdue = !!args?.onlyOverdue;
    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        originalDeliveryDate: orders.originalDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(
        and(
          eq(ownOrderCol, userId),
          inArray(orders.status, ["confirmed", "partially_confirmed", "in_delivery"] as any),
        ),
      )
      .orderBy(orders.requestedDeliveryDate);

    // Delivery dates are stored as "YYYY-MM-DD" strings, so lexical comparison
    // against today is correct. A delivery is overdue when its date is in the past.
    // Use the LOCAL date (not UTC) to match the home page's overdue logic, which
    // compares against local midnight — otherwise deliveries can be mis-flagged by a
    // day around midnight in non-UTC timezones (the app runs in CET/CEST).
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const overdue: any[] = [];
    const upcoming: any[] = [];
    for (const r of rows) {
      const dd = r.requestedDeliveryDate || null;
      if (!dd) continue;
      const item = {
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: dd,
        originalDeliveryDate: r.originalDeliveryDate || null,
        wasRescheduled: !!r.originalDeliveryDate,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
      };
      if (dd < today) overdue.push({ ...item, daysOverdue: Math.round((Date.parse(today) - Date.parse(dd)) / 86400000) });
      else upcoming.push(item);
    }

    return {
      today,
      overdueCount: overdue.length,
      overdue,
      ...(onlyOverdue ? {} : { upcomingCount: upcoming.length, upcoming: upcoming.slice(0, 10) }),
    };
  }

  // ── New tools ──────────────────────────────────────────────────────────────

  async function list_complaints(args: { status?: string }) {
    const ownCol = role === "restaurant" ? complaints.restaurantId : complaints.supplierId;
    const partnerCol = role === "restaurant" ? complaints.supplierId : complaints.restaurantId;
    const validStatuses = ["open", "in_progress", "resolved", "closed", "rejected"];
    const status = String(args?.status || "").trim();
    const conds: any[] = [eq(ownCol, userId)];
    if (status && validStatuses.includes(status)) conds.push(eq(complaints.status, status as any));
    const rows = await db
      .select({
        complaintId: complaints.id,
        complaintNumber: complaints.complaintNumber,
        title: complaints.title,
        status: complaints.status,
        priority: complaints.priority,
        reason: complaints.reason,
        createdAt: complaints.createdAt,
        updatedAt: complaints.updatedAt,
        orderId: complaints.orderId,
        partnerName: users.companyName,
        partnerId: users.id,
      })
      .from(complaints)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(...conds))
      .orderBy(desc(complaints.updatedAt))
      .limit(10);
    return {
      total: rows.length,
      complaints: rows.map((r) => ({
        complaintId: r.complaintId,
        complaintNumber: r.complaintNumber || r.complaintId.slice(0, 8),
        title: r.title,
        status: r.status,
        priority: r.priority,
        reason: r.reason || null,
        createdAt: fmtDate(r.createdAt),
        updatedAt: fmtDate(r.updatedAt),
        orderId: r.orderId,
        [`${role === "restaurant" ? "supplier" : "restaurant"}Name`]: r.partnerName,
        [`${role === "restaurant" ? "supplier" : "restaurant"}Id`]: r.partnerId,
      })),
    };
  }

  async function get_spending_summary(args: { period?: string }) {
    if (role !== "restaurant") return { error: "only_for_restaurants" };
    const period = String(args?.period || "30d").trim();
    const now = new Date();
    let fromDate: Date;
    if (period === "this_month") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "last_month") {
      fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      now.setDate(0); // last day of previous month
    } else if (period === "90d") {
      fromDate = new Date(Date.now() - 90 * 86400000);
    } else {
      fromDate = new Date(Date.now() - 30 * 86400000);
    }
    const rows = await db
      .select({
        totalAmount: orders.totalAmount,
        supplierId: orders.supplierId,
        supplierName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.supplierId))
      .where(
        and(
          eq(orders.restaurantId, userId),
          eq(orders.status, "delivered" as any),
          gte(orders.createdAt, fromDate),
        ),
      );
    const total = rows.reduce((s, r) => s + parseFloat(r.totalAmount || "0"), 0);
    const bySupplier: Record<string, { name: string; amount: number; count: number }> = {};
    for (const r of rows) {
      if (!bySupplier[r.supplierId]) bySupplier[r.supplierId] = { name: r.supplierName || "", amount: 0, count: 0 };
      bySupplier[r.supplierId].amount += parseFloat(r.totalAmount || "0");
      bySupplier[r.supplierId].count++;
    }
    return {
      period,
      from: fromDate.toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
      totalAmount: Math.round(total * 100) / 100,
      orderCount: rows.length,
      bySupplier: Object.entries(bySupplier)
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 8)
        .map(([id, v]) => ({ supplierId: id, supplierName: v.name, amount: Math.round(v.amount * 100) / 100, orderCount: v.count })),
    };
  }

  async function get_unread_messages(_args: any) {
    const ownConvCol = role === "restaurant" ? conversations.restaurantId : conversations.supplierId;
    const partnerConvCol = role === "restaurant" ? conversations.supplierId : conversations.restaurantId;
    const convRows = await db
      .select({ convId: conversations.id, partnerId: partnerConvCol, partnerName: users.companyName, lastMessageAt: conversations.lastMessageAt })
      .from(conversations)
      .innerJoin(users, eq(users.id, partnerConvCol))
      .where(eq(ownConvCol, userId));
    if (convRows.length === 0) return { totalUnread: 0, conversations: [] };
    const convIds = convRows.map((c) => c.convId);
    const unreadRows = await db
      .select({ conversationId: messages.conversationId, msgId: messages.id })
      .from(messages)
      .where(and(inArray(messages.conversationId, convIds), eq(messages.isRead, false), ne(messages.senderId, userId)));
    const countByConv: Record<string, number> = {};
    for (const m of unreadRows) countByConv[m.conversationId] = (countByConv[m.conversationId] || 0) + 1;
    const totalUnread = unreadRows.length;
    const withUnread = convRows
      .map((c) => ({ ...c, unreadCount: countByConv[c.convId] || 0 }))
      .filter((c) => c.unreadCount > 0)
      .sort((a, b) => b.unreadCount - a.unreadCount)
      .slice(0, 8);
    return {
      totalUnread,
      conversations: withUnread.map((c) => ({
        conversationId: c.convId,
        [`${role === "restaurant" ? "supplier" : "restaurant"}Name`]: c.partnerName,
        [`${role === "restaurant" ? "supplier" : "restaurant"}Id`]: c.partnerId,
        unreadCount: c.unreadCount,
        lastMessageAt: c.lastMessageAt ? fmtDate(c.lastMessageAt) : null,
      })),
    };
  }

  async function get_promotions(_args: any) {
    const now = new Date();
    if (role === "supplier") {
      const rows = await db
        .select({ promoId: promotions.id, discountPercent: promotions.discountPercent, endDate: promotions.endDate, startDate: promotions.startDate, name: promotions.name, productName: products.name, unit: products.unit, price: products.price })
        .from(promotions)
        .innerJoin(products, eq(products.id, promotions.productId))
        .where(and(eq(promotions.supplierId, userId), eq(promotions.isActive, true), gte(promotions.endDate, now)))
        .orderBy(promotions.endDate)
        .limit(10);
      return {
        count: rows.length,
        promotions: rows.map((r) => ({
          promoId: r.promoId,
          name: r.name || r.productName,
          productName: r.productName,
          unit: r.unit,
          basePrice: r.price,
          discountPercent: r.discountPercent,
          discountedPrice: Math.round(parseFloat(r.price) * (1 - r.discountPercent / 100) * 100) / 100,
          startDate: fmtDate(r.startDate),
          endDate: fmtDate(r.endDate),
        })),
      };
    } else {
      // Restaurant: show active promos from suppliers they've ordered from in the last 6 months
      const since = new Date(Date.now() - 180 * 86400000);
      const supplierIds = await db
        .selectDistinct({ supplierId: orders.supplierId })
        .from(orders)
        .where(and(eq(orders.restaurantId, userId), gte(orders.createdAt, since)));
      if (supplierIds.length === 0) return { count: 0, promotions: [] };
      const sIds = supplierIds.map((r) => r.supplierId);
      const rows = await db
        .select({ promoId: promotions.id, supplierId: promotions.supplierId, supplierName: users.companyName, discountPercent: promotions.discountPercent, endDate: promotions.endDate, name: promotions.name, productName: products.name, unit: products.unit, price: products.price })
        .from(promotions)
        .innerJoin(products, eq(products.id, promotions.productId))
        .innerJoin(users, eq(users.id, promotions.supplierId))
        .where(and(inArray(promotions.supplierId, sIds), eq(promotions.isActive, true), gte(promotions.endDate, now)))
        .orderBy(desc(promotions.discountPercent))
        .limit(15);
      return {
        count: rows.length,
        promotions: rows.map((r) => ({
          promoId: r.promoId,
          name: r.name || r.productName,
          productName: r.productName,
          supplierName: r.supplierName,
          unit: r.unit,
          basePrice: r.price,
          discountPercent: r.discountPercent,
          discountedPrice: Math.round(parseFloat(r.price) * (1 - r.discountPercent / 100) * 100) / 100,
          endDate: fmtDate(r.endDate),
        })),
      };
    }
  }

  async function get_low_stock(_args: any) {
    if (role !== "supplier") return { error: "only_for_suppliers" };
    const rows = await db
      .select({ productId: products.id, name: products.name, unit: products.unit, stockQuantity: products.stockQuantity, lowStockThreshold: products.lowStockThreshold, inStock: products.inStock, category: products.category })
      .from(products)
      .where(
        and(
          eq(products.supplierId, userId),
          eq(products.discontinued, false),
          sql`${products.lowStockThreshold} > 0`,
          sql`${products.stockQuantity} <= ${products.lowStockThreshold}`,
        ),
      )
      .orderBy(products.stockQuantity)
      .limit(15);
    return {
      count: rows.length,
      lowStockProducts: rows.map((r) => ({
        productId: r.productId,
        name: r.name,
        unit: r.unit,
        stockQuantity: r.stockQuantity ?? 0,
        lowStockThreshold: r.lowStockThreshold ?? 0,
        inStock: r.inStock,
        category: r.category || null,
      })),
    };
  }

  async function search_products(args: { query?: string; category?: string }) {
    const query = String(args?.query || "").trim();
    const category = String(args?.category || "").trim();
    if (!query && !category) return { error: "query_or_category_required" };
    const conds: any[] = [eq(products.discontinued, false)];
    if (role === "supplier") {
      conds.push(eq(products.supplierId, userId));
    }
    if (query) conds.push(ilike(products.name, likePattern(query)));
    if (category) conds.push(ilike(products.category, likePattern(category)));
    const rows = await db
      .select({ productId: products.id, name: products.name, unit: products.unit, price: products.price, category: products.category, inStock: products.inStock, stockQuantity: products.stockQuantity, supplierId: products.supplierId, supplierName: users.companyName })
      .from(products)
      .innerJoin(users, eq(users.id, products.supplierId))
      .where(and(...conds))
      .orderBy(products.name)
      .limit(10);
    return {
      count: rows.length,
      products: rows.map((r) => ({
        productId: r.productId,
        name: r.name,
        unit: r.unit,
        price: r.price,
        category: r.category || null,
        inStock: r.inStock,
        ...(role === "supplier" ? { stockQuantity: r.stockQuantity ?? 0 } : { supplierName: r.supplierName, supplierId: r.supplierId }),
      })),
    };
  }

  // ── Handlers & definitions ────────────────────────────────────────────────

  const handlers: Record<string, (args: any) => Promise<any>> = {
    find_recent_order_with_product,
    find_orders_by_partner,
    get_order_status,
    list_deliveries,
    list_complaints,
    get_spending_summary,
    get_unread_messages,
    get_promotions,
    get_low_stock,
    search_products,
  };

  const definitions = [
    {
      type: "function" as const,
      function: {
        name: "find_recent_order_with_product",
        description:
          "Find the most recent orders that contain a product whose name matches the query. Use this for questions like 'when did I last order tomatoes', 'how many crates of milk did I order last time', or to find an order by the product it contained. Returns the order date, delivery date, status, the matched line item (quantity, unit price) and the trading partner.",
        parameters: {
          type: "object",
          properties: {
            productName: { type: "string", description: "Product name or part of it, e.g. 'tomato', 'Milch'." },
          },
          required: ["productName"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "find_orders_by_partner",
        description:
          role === "restaurant"
            ? "List recent orders placed with a specific supplier, matched by supplier/company name. Use for questions like 'what is the status of my orders from Müller GmbH' or 'when will my order from X arrive'. Optionally filter by status."
            : "List recent orders received from a specific customer (restaurant), matched by company name. Optionally filter by status.",
        parameters: {
          type: "object",
          properties: {
            partnerName: { type: "string", description: "Name of the supplier/customer or part of it." },
            status: {
              type: "string",
              description: "Optional status filter.",
              enum: ["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"],
            },
          },
          required: ["partnerName"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_order_status",
        description:
          "Look up a specific order by its order number (e.g. '#000123' or '123') and return its status, order date and delivery date.",
        parameters: {
          type: "object",
          properties: {
            orderNumber: { type: "string", description: "The order number the user referenced." },
          },
          required: ["orderNumber"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_deliveries",
        description:
          role === "restaurant"
            ? "List the user's active (confirmed / partially confirmed / in delivery) incoming deliveries and report which are OVERDUE (delivery date in the past). Use this for ANY question about overdue, late, delayed, pending, upcoming or scheduled deliveries when the user does NOT give a specific supplier or order number — e.g. 'is there an overdue delivery?', 'are any deliveries late?', 'what is arriving this week?'. Returns each order's delivery date, how many days overdue it is, status, supplier and total. No parameters are required."
            : "List the user's active (confirmed / partially confirmed / in delivery) outgoing deliveries to customers and report which are OVERDUE (delivery date in the past). Use this for ANY question about overdue, late, delayed, upcoming or scheduled deliveries when the user does NOT give a specific customer or order number. Returns each order's delivery date, how many days overdue it is, status, customer and total. No parameters are required.",
        parameters: {
          type: "object",
          properties: {
            onlyOverdue: {
              type: "boolean",
              description: "Set true to return only overdue deliveries (omit upcoming ones). Default false.",
            },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_complaints",
        description:
          role === "restaurant"
            ? "List the restaurant's complaints (Reklamationen). Use for any question about complaints, issues with deliveries, or claim status — e.g. 'do I have open complaints?', 'what happened with my complaint about the tomatoes?'. Returns title, status, priority, reason, partner and linked order."
            : "List complaints received from customers. Use for questions like 'which complaints are still open?', 'are there any new complaints?'. Returns title, status, priority, reason, restaurant name and linked order.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Optional filter by complaint status.",
              enum: ["open", "in_progress", "resolved", "closed", "rejected"],
            },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_spending_summary",
        description:
          role === "restaurant"
            ? "Summarise the restaurant's total spending on delivered orders for a given period, broken down by supplier. Use for questions like 'how much have I spent this month?', 'what are my biggest suppliers by spend?', 'how much did I spend in the last 30 days?'."
            : "Not applicable for suppliers.",
        parameters: {
          type: "object",
          properties: {
            period: {
              type: "string",
              description: "Time window for the summary. Default '30d'.",
              enum: ["30d", "90d", "this_month", "last_month"],
            },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_unread_messages",
        description:
          role === "restaurant"
            ? "Return the count of unread messages per supplier conversation. Use for any question about unread messages, new messages, or whether there are messages waiting — e.g. 'do I have unread messages?', 'which suppliers have sent me messages?'."
            : "Return the count of unread messages per restaurant conversation. Use for questions like 'do I have unread messages?', 'which customers have sent me messages?'.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_promotions",
        description:
          role === "supplier"
            ? "List the supplier's currently active promotions (discounts). Use for questions like 'which of my products are on promotion?', 'what promotions do I have running?', 'when do my promotions expire?'."
            : "List currently active promotions from suppliers the restaurant has recently ordered from. Use for questions like 'are there any promotions available?', 'which products are discounted?', 'can I save money on anything right now?'.",
        parameters: { type: "object", properties: {} },
      },
    },
    ...(role === "supplier"
      ? [
          {
            type: "function" as const,
            function: {
              name: "get_low_stock",
              description:
                "List products whose stock quantity is at or below their low-stock threshold. Use for questions like 'what is running low?', 'which products are almost out of stock?', 'do I need to restock anything?'.",
              parameters: { type: "object", properties: {} },
            },
          },
        ]
      : []),
    {
      type: "function" as const,
      function: {
        name: "search_products",
        description:
          role === "restaurant"
            ? "Search for products available from suppliers by name or category. Use for questions like 'how much does olive oil cost?', 'which suppliers offer sparkling water?', 'what is the price of Grappa?'."
            : "Search through your own product catalog by name or category. Use for questions like 'what is the price of Grappa Riserva?', 'do I sell any dairy products?', 'show me my beverages'.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Product name or keyword to search for." },
            category: { type: "string", description: "Optional product category to filter by." },
          },
        },
      },
    },
  ];

  return { handlers, definitions };
}

const RESPOND_TOOL = {
  type: "function" as const,
  function: {
    name: "respond",
    description:
      "Provide the final answer to the user. Call this exactly once when you have gathered enough information (or determined that you cannot answer). Include action buttons only when they are clearly useful.",
    parameters: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          description:
            "A concise, friendly natural-language answer in the SAME language as the user's question. Reference concrete facts (dates, quantities, amounts) from the tool results. If no data was found, say so plainly.",
        },
        actions: {
          type: "array",
          description:
            "Optional deep-link actions. Use 'open_inbox' to start a chat about an order (e.g. when there is NO delivery date and the user should ask the partner for an update) and always provide a helpful 'suggestedMessage' to pre-fill. Use 'open_order' to open an order's detail page. Only reference orderId values returned by the data tools.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["open_inbox", "open_order"] },
              orderId: { type: "string", description: "An orderId returned by a data tool." },
              suggestedMessage: {
                type: "string",
                description: "For open_inbox: a polite pre-filled message in the user's language, e.g. asking for a delivery date.",
              },
              label: { type: "string", description: "Short button label in the user's language." },
            },
            required: ["kind", "label"],
          },
        },
      },
      required: ["answer"],
    },
  },
};

function systemPrompt(role: Role, lang: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const partner = role === "restaurant" ? "suppliers" : "customers (restaurants)";
  const roleSpecific =
    role === "restaurant"
      ? [
          `You can also help with: complaints (list_complaints), spending analysis (get_spending_summary — summarises spend per supplier for a given period), unread messages (get_unread_messages), available promotions from their suppliers (get_promotions), and product/price lookups (search_products).`,
          `For spending questions, default to the last 30 days unless the user specifies otherwise.`,
        ]
      : [
          `You can also help with: complaints received from restaurants (list_complaints), unread messages (get_unread_messages), own active promotions (get_promotions), low-stock products (get_low_stock), and product catalog lookups (search_products).`,
          `When the user asks about stock or inventory, always call get_low_stock proactively.`,
        ];
  return [
    `You are the in-app data assistant for GastroConnect, a B2B ordering platform for restaurants and suppliers.`,
    `The current user is a ${role}. Today's date is ${today}.`,
    `Answer ONLY using the provided data tools — never invent orders, dates, quantities or prices.`,
    `All tools are already scoped to this user's own data and their ${partner}; you cannot access anyone else's data.`,
    `Reply in the same language as the user's question (German or Italian are most common; default to German if unclear).`,
    `Be proactive: when a question can be answered by looking at the user's own data, call the relevant tool yourself without first asking the user for extra details. For deliveries: call list_deliveries; for complaints: call list_complaints; for messages: call get_unread_messages; for promotions: call get_promotions.`,
    ...roleSpecific,
    `When reporting overdue deliveries, mention the order number, the partner and how many days overdue each one is, and offer an 'open_order' or 'open_inbox' action for the most relevant order.`,
    `Keep answers short and concrete. Use bullet points when listing more than two items. When an order has no delivery date, offer an 'open_inbox' action with a polite suggestedMessage.`,
    `Always finish by calling the "respond" tool with your final answer.`,
  ].join(" ");
}

async function resolveAction(raw: AiActionRaw, userId: string, role: Role): Promise<AiAction | null> {
  if (!raw || (raw.kind !== "open_inbox" && raw.kind !== "open_order")) return null;
  const label = String(raw.label || "").trim();
  if (!label) return null;

  // Deep links that reference an order must be validated server-side so the model
  // can never produce a link to an order the user does not own.
  if (!raw.orderId) {
    if (raw.kind === "open_order") return null;
    return { kind: "open_inbox", label, href: `/${role}/inbox`, suggestedMessage: raw.suggestedMessage };
  }

  const ownOrderCol = role === "restaurant" ? orders.restaurantId : orders.supplierId;
  const partnerCol = role === "restaurant" ? orders.supplierId : orders.restaurantId;
  const [row] = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      partnerId: partnerCol,
    })
    .from(orders)
    .where(and(eq(orders.id, raw.orderId), eq(ownOrderCol, userId)))
    .limit(1);
  if (!row) return null;

  const orderNumber = formatOrderNumber({ orderNumber: row.orderNumber, id: row.orderId });

  if (raw.kind === "open_order") {
    return { kind: "open_order", label, href: `/${role}/orders/${row.orderId}`, orderId: row.orderId, orderNumber, partnerId: row.partnerId };
  }

  const params = new URLSearchParams({ to: row.partnerId, orderRefId: row.orderId, orderNumber });
  const suggestedMessage = (raw.suggestedMessage || "").trim();
  if (suggestedMessage) params.set("prefill", suggestedMessage);
  return {
    kind: "open_inbox",
    label,
    href: `/${role}/inbox?${params.toString()}`,
    orderId: row.orderId,
    orderNumber,
    partnerId: row.partnerId,
    suggestedMessage: suggestedMessage || undefined,
  };
}

function aiConfigured(): boolean {
  return !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
}

function makeTitle(question: string): string {
  const clean = String(question || "").replace(/\s+/g, " ").trim();
  if (!clean) return "Chat";
  return clean.length > 60 ? clean.slice(0, 57) + "…" : clean;
}

// Runs the tool-calling assistant loop for a single new user question, given the
// prior conversation turns as context. Assumes the AI integration is configured.
async function runAssistant(opts: {
  userId: string;
  role: Role;
  lang: string;
  priorTurns: { role: "user" | "assistant"; content: string }[];
  question: string;
}): Promise<{ answer: string; actions: AiAction[] }> {
  const { userId, role, lang, priorTurns, question } = opts;
  const { handlers, definitions } = buildTools(userId, role);
  const tools = [...definitions, RESPOND_TOOL];

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const messages: any[] = [{ role: "system", content: systemPrompt(role, lang) }];
  for (const turn of priorTurns) {
    if (turn.content) messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: question });

  let answer = "";
  let rawActions: AiActionRaw[] = [];
  const MAX_TURNS = 6;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      messages,
      tools,
      tool_choice: turn === MAX_TURNS - 1 ? { type: "function", function: { name: "respond" } } : "auto",
    });

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      answer = (msg.content || "").trim();
      break;
    }

    messages.push(msg);

    let responded = false;
    for (const call of toolCalls) {
      const fn = (call as any).function;
      const fnName: string = fn?.name || "";
      let parsedArgs: any = {};
      try {
        parsedArgs = JSON.parse(fn?.arguments || "{}");
      } catch {
        parsedArgs = {};
      }

      if (fnName === "respond") {
        answer = String(parsedArgs?.answer || "").trim();
        rawActions = Array.isArray(parsedArgs?.actions) ? parsedArgs.actions : [];
        responded = true;
        messages.push({ role: "tool", tool_call_id: call.id, content: "ok" });
        continue;
      }

      const handler = handlers[fnName];
      let result: any;
      try {
        result = handler ? await handler(parsedArgs) : { error: `unknown tool ${fnName}` };
      } catch (e: any) {
        result = { error: "tool_failed", message: e?.message || String(e) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }

    if (responded) break;
  }

  if (!answer) {
    answer =
      lang === "it"
        ? "Non sono riuscito a trovare una risposta a questa domanda."
        : "Ich konnte dazu leider keine Antwort finden.";
  }

  const actions: AiAction[] = [];
  for (const raw of rawActions.slice(0, 4)) {
    const resolved = await resolveAction(raw, userId, role);
    if (resolved) actions.push(resolved);
  }

  return { answer, actions };
}

export function registerAiSearchRoutes(app: Express) {
  const jsonBody = express.json({ limit: "32kb" });

  // Each call hits a paid AI model with tool-calling, so it gets a tight limit to
  // guard against cost-amplification / abuse (mirrors the price-list parser).
  const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Zu viele Anfragen. Bitte versuchen Sie es in ein paar Minuten erneut." },
    validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
  });

  // Legacy one-shot endpoint (kept for backward-compat). The in-app UI now uses
  // the conversational /api/ai/chat endpoints below.
  app.post("/api/search/ai", aiLimiter, jsonBody, async (req: Request, res: Response) => {
    try {
      const question = String(req.body?.question || "").trim();
      const userId = String(req.body?.userId || "").trim();
      const role = String(req.body?.role || "").trim() as Role;
      const lang = String(req.body?.lang || "de").trim();

      if (!question) return res.status(400).json({ error: "question_required" });
      if (question.length > 500) return res.status(400).json({ error: "question_too_long" });
      if (!userId || (role !== "restaurant" && role !== "supplier")) {
        return res.status(400).json({ error: "invalid_user" });
      }
      if (!aiConfigured()) {
        return res.status(503).json({ error: "ai_not_configured", message: "KI-Integration ist noch nicht eingerichtet." });
      }

      const { answer, actions } = await runAssistant({ userId, role, lang, priorTurns: [], question });
      return res.json({ answer, actions });
    } catch (error: any) {
      console.error("[search/ai] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed", message: "Die Anfrage konnte nicht verarbeitet werden." });
    }
  });

  // List the current user's AI conversations (newest first).
  app.get("/api/ai/chats", async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || "").trim();
      const role = String(req.query.role || "").trim() as Role;
      if (!userId || (role !== "restaurant" && role !== "supplier")) {
        return res.status(400).json({ error: "invalid_user" });
      }
      const chats = await storage.getAiChats(userId, role);
      return res.json(
        chats.map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt })),
      );
    } catch (error: any) {
      console.error("[ai/chats] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed" });
    }
  });

  // Fetch a single conversation with all of its messages.
  app.get("/api/ai/chats/:id", async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || "").trim();
      const role = String(req.query.role || "").trim();
      const id = String(req.params.id || "").trim();
      if (!userId) return res.status(400).json({ error: "invalid_user" });
      const chat = await storage.getAiChat(id);
      if (!chat || chat.userId !== userId || (role && chat.role !== role)) {
        return res.status(404).json({ error: "chat_not_found" });
      }
      const messages = await storage.getAiChatMessages(id);
      return res.json({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          actions: m.actions || [],
          createdAt: m.createdAt,
        })),
      });
    } catch (error: any) {
      console.error("[ai/chats/:id] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed" });
    }
  });

  // Delete a conversation (and its messages via cascade).
  app.delete("/api/ai/chats/:id", async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || "").trim();
      const role = String(req.query.role || "").trim();
      const id = String(req.params.id || "").trim();
      if (!userId) return res.status(400).json({ error: "invalid_user" });
      // When a role is supplied, only delete if it matches (prevents cross-role
      // deletion for a shared userId); falls back to owner-only scoping otherwise.
      if (role) {
        const chat = await storage.getAiChat(id);
        if (chat && (chat.userId !== userId || chat.role !== role)) {
          return res.status(404).json({ error: "chat_not_found" });
        }
      }
      await storage.deleteAiChat(id, userId);
      return res.json({ ok: true });
    } catch (error: any) {
      console.error("[ai/chats delete] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed" });
    }
  });

  // Return up to 3 suggested questions for the empty-state chips.
  // Draws from the user's own recent AI chat messages (deduplicated), then fills
  // remaining slots with role/language-aware defaults.
  app.get("/api/ai/suggestions", async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || "").trim();
      const role = String(req.query.role || "").trim() as Role;
      const lang = String(req.query.lang || "de").trim();
      if (!userId || (role !== "restaurant" && role !== "supplier")) {
        return res.status(400).json({ error: "invalid_user" });
      }

      const rows = await db
        .select({ content: aiChatMessages.content })
        .from(aiChatMessages)
        .innerJoin(aiChats, eq(aiChatMessages.chatId, aiChats.id))
        .where(
          and(
            eq(aiChats.userId, userId),
            eq(aiChats.role, role as any),
            eq(aiChatMessages.role, "user"),
          ),
        )
        .orderBy(desc(aiChatMessages.createdAt))
        .limit(30);

      const seen = new Set<string>();
      const unique: string[] = [];
      for (const r of rows) {
        const text = r.content.trim();
        const key = text.toLowerCase();
        if (text && !seen.has(key)) {
          seen.add(key);
          unique.push(text);
          if (unique.length >= 3) break;
        }
      }

      const isIt = lang === "it";
      // Pick 3 defaults that showcase different capabilities. Rotate based on
      // day-of-week so users see variety across sessions when they have no history.
      const allDefaults =
        role === "restaurant"
          ? isIt
            ? [
                "Ci sono consegne in ritardo?",
                "Ho messaggi non letti?",
                "Quanto ho speso questo mese?",
                "Quali promozioni sono disponibili ora?",
                "Quando ho ordinato i pomodori l'ultima volta?",
                "Ho reclami aperti?",
              ]
            : [
                "Gibt es überfällige Lieferungen?",
                "Habe ich ungelesene Nachrichten?",
                "Wie viel habe ich diesen Monat ausgegeben?",
                "Welche Aktionen sind gerade verfügbar?",
                "Wann habe ich zuletzt Tomaten bestellt?",
                "Habe ich offene Reklamationen?",
              ]
          : isIt
            ? [
                "Quali ordini sono ancora aperti?",
                "Ho messaggi non letti?",
                "Quali prodotti sono quasi esauriti?",
                "Ci sono consegne in ritardo?",
                "Ho reclami aperti dai ristoranti?",
                "Quali promozioni ho attive?",
              ]
            : [
                "Welche Bestellungen sind noch offen?",
                "Habe ich ungelesene Nachrichten?",
                "Welche Produkte haben niedrigen Lagerbestand?",
                "Gibt es überfällige Lieferungen?",
                "Gibt es offene Reklamationen von Kunden?",
                "Welche Aktionen laufen gerade?",
              ];
      const dayOffset = new Date().getDay();
      const rotated = [...allDefaults.slice(dayOffset % allDefaults.length), ...allDefaults.slice(0, dayOffset % allDefaults.length)];
      const defaults = rotated.slice(0, 3);

      for (const d of defaults) {
        if (unique.length >= 3) break;
        if (!seen.has(d.toLowerCase())) unique.push(d);
      }

      return res.json({ suggestions: unique.slice(0, 3) });
    } catch (error: any) {
      console.error("[ai/suggestions] failed:", error?.message || error);
      return res.status(500).json({ suggestions: [] });
    }
  });

  // Send a message in a conversation (create a new one when no chatId is given).
  // Persists the user turn + assistant reply and feeds prior turns back as context.
  app.post("/api/ai/chat", aiLimiter, jsonBody, async (req: Request, res: Response) => {
    try {
      const question = String(req.body?.question || "").trim();
      const userId = String(req.body?.userId || "").trim();
      const role = String(req.body?.role || "").trim() as Role;
      const lang = String(req.body?.lang || "de").trim();
      const chatIdRaw = req.body?.chatId ? String(req.body.chatId).trim() : "";

      if (!question) return res.status(400).json({ error: "question_required" });
      if (question.length > 500) return res.status(400).json({ error: "question_too_long" });
      if (!userId || (role !== "restaurant" && role !== "supplier")) {
        return res.status(400).json({ error: "invalid_user" });
      }
      if (!aiConfigured()) {
        return res.status(503).json({ error: "ai_not_configured", message: "KI-Integration ist noch nicht eingerichtet." });
      }

      // Resolve or create the conversation, scoped to this user + role.
      let chat = chatIdRaw ? await storage.getAiChat(chatIdRaw) : undefined;
      if (chatIdRaw) {
        if (!chat || chat.userId !== userId || chat.role !== role) {
          return res.status(404).json({ error: "chat_not_found" });
        }
      }
      if (!chat) {
        chat = await storage.createAiChat({ userId, role, title: makeTitle(question) });
      }

      // Use recent stored turns as context (cap to keep token cost bounded).
      const stored = await storage.getAiChatMessages(chat.id);
      const priorTurns = stored.slice(-10).map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

      await storage.appendAiChatMessage({ chatId: chat.id, role: "user", content: question });

      const { answer, actions } = await runAssistant({ userId, role, lang, priorTurns, question });

      const assistantMsg = await storage.appendAiChatMessage({
        chatId: chat.id,
        role: "assistant",
        content: answer,
        actions: actions.length ? actions : null,
      });

      return res.json({
        chatId: chat.id,
        title: chat.title,
        messageId: assistantMsg.id,
        answer,
        actions,
      });
    } catch (error: any) {
      console.error("[ai/chat] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed", message: "Die Anfrage konnte nicht verarbeitet werden." });
    }
  });
}
