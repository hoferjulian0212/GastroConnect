import { db } from "./db";
import { eq, and, gte, lt, inArray } from "drizzle-orm";
import { orders, orderItems, products, promotions, users } from "@shared/schema";
import type {
  MonthlyReportPayload,
  MonthlyReportProductRow,
  MonthlyReportSwitchRecommendation,
  MonthlyReportMissedPromotion,
} from "@shared/schema";
import { storage } from "./storage";
import { objectStorageClient, ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import { randomUUID } from "crypto";
import PDFDocument from "pdfkit";
import { summarizeLocalImpact } from "@shared/localImpact";
import { calculateLocalImpact } from "./localImpact";

const COUNTABLE_STATUSES = ["confirmed", "scheduled", "in_delivery", "delivered"] as const;

export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { start, end };
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function productKey(name: string, unit: string): string {
  return `${name.trim().toLowerCase()}__${unit}`;
}

async function sumOrdersTotal(restaurantId: string, month: string): Promise<{ total: number; orderCount: number }> {
  const { start, end } = monthRange(month);
  const rows = await db.select({
    id: orders.id,
    total: orders.totalAmount,
  })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      gte(orders.createdAt, start),
      lt(orders.createdAt, end),
      inArray(orders.status, [...COUNTABLE_STATUSES]),
    ));
  let total = 0;
  for (const r of rows) total += Number(r.total) || 0;
  return { total: Math.round(total * 100) / 100, orderCount: rows.length };
}

export async function computeMonthlyReport(restaurantId: string, month: string): Promise<MonthlyReportPayload> {
  const restaurant = await storage.getUser(restaurantId);
  if (!restaurant) throw new Error("Restaurant not found");

  const { start, end } = monthRange(month);

  // Orders + items for the month
  const orderRows = await db.select({
    orderId: orders.id,
    supplierId: orders.supplierId,
    status: orders.status,
  })
    .from(orders)
    .where(and(
      eq(orders.restaurantId, restaurantId),
      gte(orders.createdAt, start),
      lt(orders.createdAt, end),
      inArray(orders.status, [...COUNTABLE_STATUSES]),
    ));
  const orderCount = orderRows.length;
  const orderIds = orderRows.map(r => r.orderId);
  const orderToSupplier = new Map(orderRows.map(r => [r.orderId, r.supplierId] as const));

  let itemRows: Array<{
    orderId: string; productId: string; productName: string;
    quantity: number; confirmedQuantity: number | null;
    unitPrice: string; totalPrice: string;
    localImpactSnapshot: ReturnType<typeof calculateLocalImpact> | null;
  }> = [];
  if (orderIds.length > 0) {
    itemRows = await db.select({
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      confirmedQuantity: orderItems.confirmedQuantity,
      unitPrice: orderItems.unitPrice,
      totalPrice: orderItems.totalPrice,
      localImpactSnapshot: orderItems.localImpactSnapshot,
    })
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));
  }

  // Get all products for matching (by name + unit) across all suppliers
  const productIds = Array.from(new Set(itemRows.map(r => r.productId)));
  const orderedProducts = productIds.length > 0
    ? await db.select().from(products).where(inArray(products.id, productIds))
    : [];
  const productById = new Map(orderedProducts.map(p => [p.id, p] as const));

  // For each (name+unit) used, find ALL current product offers across suppliers
  const usedKeys = new Set<string>();
  for (const p of orderedProducts) usedKeys.add(productKey(p.name, p.unit));

  const allCurrentProducts = await db.select().from(products);
  // Group available offers by name+unit (only in-stock products with valid suppliers)
  const offersByKey = new Map<string, Array<{ supplierId: string; price: number; productId: string; category: string | null; unit: string; name: string }>>();
  for (const p of allCurrentProducts) {
    if (!p.inStock) continue;
    const k = productKey(p.name, p.unit);
    if (!usedKeys.has(k)) continue;
    const arr = offersByKey.get(k) ?? [];
    arr.push({
      supplierId: p.supplierId,
      price: Number(p.price),
      productId: p.id,
      category: p.category ?? null,
      unit: p.unit,
      name: p.name,
    });
    offersByKey.set(k, arr);
  }

  // Supplier name lookup
  const supplierIds = new Set<string>();
  orderRows.forEach(r => supplierIds.add(r.supplierId));
  offersByKey.forEach(offers => offers.forEach(o => supplierIds.add(o.supplierId)));
  const supplierRows = supplierIds.size > 0
    ? await db.select().from(users).where(inArray(users.id, Array.from(supplierIds)))
    : [];
  const supplierNameById = new Map(supplierRows.map(s => [s.id, s.companyName || s.name] as const));

  // Aggregate per (productKey, supplierUsed) — current spend
  type RowAcc = {
    key: string; name: string; unit: string; category: string | null;
    currentSupplierId: string; totalQuantity: number; totalSpent: number;
    unitPriceWeighted: number; // sum(price * qty) / qty
    unitPriceTotalWeight: number;
  };
  const acc = new Map<string, RowAcc>(); // key = productKey + "@@" + supplierId

  for (const it of itemRows) {
    const p = productById.get(it.productId);
    if (!p) continue;
    const supplierId = orderToSupplier.get(it.orderId);
    if (!supplierId) continue;
    const k = productKey(p.name, p.unit);
    const compoundKey = `${k}@@${supplierId}`;
    const qty = it.confirmedQuantity ?? it.quantity;
    const unitPrice = Number(it.unitPrice) || 0;
    // Derive line spend from confirmed quantity to keep partial confirmations accurate.
    const spent = unitPrice * qty;
    let row = acc.get(compoundKey);
    if (!row) {
      row = {
        key: k, name: p.name, unit: p.unit, category: p.category ?? null,
        currentSupplierId: supplierId, totalQuantity: 0, totalSpent: 0,
        unitPriceWeighted: 0, unitPriceTotalWeight: 0,
      };
      acc.set(compoundKey, row);
    }
    row.totalQuantity += qty;
    row.totalSpent += spent;
    row.unitPriceWeighted += unitPrice * qty;
    row.unitPriceTotalWeight += qty;
  }

  const productRows: MonthlyReportProductRow[] = [];
  for (const row of acc.values()) {
    const offers = offersByKey.get(row.key) ?? [];
    let cheapest: { supplierId: string; price: number } | null = null;
    for (const o of offers) {
      if (!cheapest || o.price < cheapest.price) cheapest = { supplierId: o.supplierId, price: o.price };
    }
    const currentUnitPrice = row.unitPriceTotalWeight > 0
      ? row.unitPriceWeighted / row.unitPriceTotalWeight
      : 0;
    const cheapestUnitPrice = cheapest?.price ?? null;
    let potentialSaving = 0;
    if (cheapestUnitPrice !== null && cheapestUnitPrice < currentUnitPrice) {
      potentialSaving = (currentUnitPrice - cheapestUnitPrice) * row.totalQuantity;
    }
    productRows.push({
      productKey: row.key,
      name: row.name,
      unit: row.unit,
      category: row.category,
      currentSupplierId: row.currentSupplierId,
      currentSupplierName: supplierNameById.get(row.currentSupplierId) ?? "—",
      currentUnitPrice: Math.round(currentUnitPrice * 100) / 100,
      totalQuantity: Math.round(row.totalQuantity * 100) / 100,
      totalSpent: Math.round(row.totalSpent * 100) / 100,
      cheapestSupplierId: cheapest?.supplierId ?? null,
      cheapestSupplierName: cheapest ? (supplierNameById.get(cheapest.supplierId) ?? "—") : null,
      cheapestUnitPrice: cheapestUnitPrice !== null ? Math.round(cheapestUnitPrice * 100) / 100 : null,
      potentialSaving: Math.round(potentialSaving * 100) / 100,
    });
  }

  const totalSpent = Math.round(productRows.reduce((s, r) => s + r.totalSpent, 0) * 100) / 100;
  const totalSavingPotential = Math.round(productRows.reduce((s, r) => s + r.potentialSaving, 0) * 100) / 100;

  // Top 5 by spend — deduped by (name+unit) so a product bought from multiple
  // suppliers appears only once. Supplier label = best-spend supplier (or
  // "mehrere Lieferanten" if split across more than one).
  type TopAgg = { name: string; unit: string; totalSpent: number; totalQuantity: number; bySupplier: Map<string, number> };
  const topAgg = new Map<string, TopAgg>();
  for (const r of productRows) {
    const k = r.productKey;
    let t = topAgg.get(k);
    if (!t) { t = { name: r.name, unit: r.unit, totalSpent: 0, totalQuantity: 0, bySupplier: new Map() }; topAgg.set(k, t); }
    t.totalSpent += r.totalSpent;
    t.totalQuantity += r.totalQuantity;
    t.bySupplier.set(r.currentSupplierName, (t.bySupplier.get(r.currentSupplierName) ?? 0) + r.totalSpent);
  }
  const topProducts = Array.from(topAgg.values())
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 5)
    .map(t => {
      const entries = Array.from(t.bySupplier.entries()).sort((a, b) => b[1] - a[1]);
      const supplierName = entries.length > 1 ? `${entries[0][0]} +${entries.length - 1}` : (entries[0]?.[0] ?? "—");
      return {
        name: t.name,
        unit: t.unit,
        totalSpent: Math.round(t.totalSpent * 100) / 100,
        totalQuantity: Math.round(t.totalQuantity * 100) / 100,
        supplierName,
      };
    });

  // Top 3 recommended switches: group savings by (from→to)
  type SwitchAcc = {
    fromSupplierId: string; toSupplierId: string;
    products: Array<{ name: string; unit: string; saving: number }>;
    expectedMonthlySaving: number;
  };
  const switchMap = new Map<string, SwitchAcc>();
  for (const r of productRows) {
    if (!r.cheapestSupplierId || r.cheapestSupplierId === r.currentSupplierId || r.potentialSaving <= 0) continue;
    const k = `${r.currentSupplierId}->${r.cheapestSupplierId}`;
    let sw = switchMap.get(k);
    if (!sw) {
      sw = { fromSupplierId: r.currentSupplierId, toSupplierId: r.cheapestSupplierId, products: [], expectedMonthlySaving: 0 };
      switchMap.set(k, sw);
    }
    sw.products.push({ name: r.name, unit: r.unit, saving: r.potentialSaving });
    sw.expectedMonthlySaving += r.potentialSaving;
  }
  const recommendedSwitches: MonthlyReportSwitchRecommendation[] = Array.from(switchMap.values())
    .sort((a, b) => b.expectedMonthlySaving - a.expectedMonthlySaving)
    .slice(0, 3)
    .map(sw => ({
      fromSupplierId: sw.fromSupplierId,
      fromSupplierName: supplierNameById.get(sw.fromSupplierId) ?? "—",
      toSupplierId: sw.toSupplierId,
      toSupplierName: supplierNameById.get(sw.toSupplierId) ?? "—",
      productCount: sw.products.length,
      expectedMonthlySaving: Math.round(sw.expectedMonthlySaving * 100) / 100,
      products: sw.products
        .sort((a, b) => b.saving - a.saving)
        .slice(0, 8)
        .map(p => ({ ...p, saving: Math.round(p.saving * 100) / 100 })),
    }));

  // Missed promotions: promotions active during the month, on products the
  // restaurant bought from a DIFFERENT supplier (or did not get the promo price).
  // Historical overlap: include promos that were running during the target
  // month even if later deactivated/expired (do NOT filter by isActive).
  const monthPromos = await db.select().from(promotions)
    .where(and(
      lt(promotions.startDate, end),
      gte(promotions.endDate, start),
    ));
  const orderedKeysByOtherSupplier = new Map<string, RowAcc[]>(); // productKey → rows where current supplier != promo supplier
  for (const row of acc.values()) {
    const arr = orderedKeysByOtherSupplier.get(row.key) ?? [];
    arr.push(row);
    orderedKeysByOtherSupplier.set(row.key, arr);
  }
  const missedPromotions: MonthlyReportMissedPromotion[] = [];
  for (const promo of monthPromos) {
    const product = allCurrentProducts.find(p => p.id === promo.productId);
    if (!product) continue;
    const k = productKey(product.name, product.unit);
    const rowsUsingDifferentSupplier = (orderedKeysByOtherSupplier.get(k) ?? [])
      .filter(r => r.currentSupplierId !== promo.supplierId);
    if (rowsUsingDifferentSupplier.length === 0) continue;
    const promoPrice = Number(product.price) * (1 - promo.discountPercent / 100);
    let estimatedMissed = 0;
    for (const r of rowsUsingDifferentSupplier) {
      const cur = r.unitPriceTotalWeight > 0 ? r.unitPriceWeighted / r.unitPriceTotalWeight : 0;
      if (promoPrice < cur) estimatedMissed += (cur - promoPrice) * r.totalQuantity;
    }
    if (estimatedMissed <= 0) continue;
    missedPromotions.push({
      promotionId: promo.id,
      productName: product.name,
      unit: product.unit,
      supplierName: supplierNameById.get(promo.supplierId) ?? "—",
      discountPercent: promo.discountPercent,
      startDate: promo.startDate.toISOString().slice(0, 10),
      endDate: promo.endDate.toISOString().slice(0, 10),
      estimatedMissedSaving: Math.round(estimatedMissed * 100) / 100,
    });
  }
  missedPromotions.sort((a, b) => b.estimatedMissedSaving - a.estimatedMissedSaving);

  const { total: prevMonthTotal } = await sumOrdersTotal(restaurantId, previousMonth(month));
  const trendPercent = prevMonthTotal > 0
    ? Math.round(((totalSpent - prevMonthTotal) / prevMonthTotal) * 1000) / 10
    : 0;
  const localImpact = summarizeLocalImpact(itemRows.map((item) => ({
    impact: item.localImpactSnapshot ?? calculateLocalImpact({}),
    quantity: item.confirmedQuantity ?? item.quantity,
  })));

  return {
    month,
    generatedAt: new Date().toISOString(),
    restaurantName: restaurant.companyName || restaurant.name,
    totalSpent,
    prevMonthTotal,
    trendPercent,
    orderCount,
    topProducts,
    productRows: productRows.sort((a, b) => b.totalSpent - a.totalSpent),
    totalSavingPotential,
    recommendedSwitches,
    missedPromotions: missedPromotions.slice(0, 10),
    localImpact,
    language: restaurant.language === "it" ? "it" : "de",
  };
}

function fmtEuro(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function formatMonthLabelDE(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export async function generateMonthlyReportPDF(payload: MonthlyReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const monthLabel = formatMonthLabelDE(payload.month);

    // Header
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#161921")
      .text("Monatlicher Vergleichsbericht", 50, 50);
    doc.font("Helvetica").fontSize(11).fillColor("#666666")
      .text(monthLabel, 50, 76);
    doc.fontSize(10).fillColor("#888888")
      .text(payload.restaurantName, 50, 92);
    doc.text(`Erstellt am ${new Date(payload.generatedAt).toLocaleDateString("de-DE")}`, 50, 106);

    doc.moveTo(50, 128).lineTo(545, 128).strokeColor("#e0e0e0").lineWidth(1).stroke();

    // Summary cards row
    let y = 145;
    const trendArrow = payload.trendPercent > 0 ? "↑" : payload.trendPercent < 0 ? "↓" : "→";
    const trendColor = payload.trendPercent > 0 ? "#dc2626" : payload.trendPercent < 0 ? "#16a34a" : "#666666";

    doc.font("Helvetica").fontSize(9).fillColor("#888888")
      .text("GESAMTAUSGABEN", 50, y);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#161921")
      .text(fmtEuro(payload.totalSpent), 50, y + 12);
    doc.font("Helvetica").fontSize(9).fillColor("#666666")
      .text(`${payload.orderCount} Bestellungen`, 50, y + 36);

    doc.font("Helvetica").fontSize(9).fillColor("#888888")
      .text("VORMONAT", 220, y);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#161921")
      .text(fmtEuro(payload.prevMonthTotal), 220, y + 12);
    doc.font("Helvetica").fontSize(9).fillColor(trendColor)
      .text(`${trendArrow} ${payload.trendPercent > 0 ? "+" : ""}${payload.trendPercent}%`, 220, y + 36);

    doc.font("Helvetica").fontSize(9).fillColor("#888888")
      .text("EINSPARPOTENZIAL", 390, y);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#16a34a")
      .text(fmtEuro(payload.totalSavingPotential), 390, y + 12);
    doc.font("Helvetica").fontSize(9).fillColor("#666666")
      .text("bei optimalen Lieferanten", 390, y + 36);

    y += 70;

    if (payload.localImpact) {
      const impact = payload.localImpact;
      const isItalian = payload.language === "it";
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#161921")
        .text(isItalian ? "Locale e impatto degli ordini" : "Local & Bestellwirkung", 50, y);
      y += 18;
      doc.font("Helvetica").fontSize(9).fillColor("#333333")
        .text(`${isItalian ? "Punteggio" : "Score"}: ${impact.score ?? (isItalian ? "non disponibile" : "nicht verfügbar")}  ·  Local: ${impact.localItemCount ?? "—"}  ·  ${isItalian ? "Stagionale" : "Saisonal"}: ${impact.seasonalItemCount ?? "—"}  ·  Low Waste: ${impact.lowWasteItemCount ?? "—"}`, 50, y);
      y += 14;
      doc.fontSize(8).fillColor("#777777")
        .text(`${impact.calculationVersion} · ${isItalian ? "Copertura" : "Abdeckung"} ${Math.round(impact.coverage * 100)}% · ${isItalian ? "i dati mancanti non vengono trattati come zero" : "fehlende Angaben werden nicht als Null gewertet"}`, 50, y);
      y += 24;
    }

    // Top-5 products
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#161921")
      .text("Top 5 Produkte nach Ausgabe", 50, y);
    y += 22;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#666666");
    doc.text("Produkt", 50, y);
    doc.text("Menge", 280, y, { width: 60, align: "right" });
    doc.text("Lieferant", 350, y);
    doc.text("Ausgabe", 480, y, { width: 65, align: "right" });
    y += 14;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 4;
    doc.font("Helvetica").fontSize(9).fillColor("#333333");
    if (payload.topProducts.length === 0) {
      doc.fillColor("#999999").text("Keine Bestellungen in diesem Monat.", 50, y + 4);
      y += 20;
    } else {
      payload.topProducts.forEach((p, i) => {
        if (i % 2 === 1) {
          doc.fillColor("#fafafa").rect(50, y, 495, 16).fill();
          doc.fillColor("#333333");
        }
        doc.text(p.name, 50, y + 4, { width: 220, ellipsis: true });
        doc.text(`${p.totalQuantity} ${p.unit}`, 280, y + 4, { width: 60, align: "right" });
        doc.text(p.supplierName, 350, y + 4, { width: 120, ellipsis: true });
        doc.font("Helvetica-Bold").text(fmtEuro(p.totalSpent), 480, y + 4, { width: 65, align: "right" });
        doc.font("Helvetica");
        y += 16;
      });
    }
    y += 12;

    // Recommended switches
    if (y > 600) { doc.addPage(); y = 50; }
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#161921")
      .text("Empfohlene Lieferantenwechsel (Top 3)", 50, y);
    y += 22;
    if (payload.recommendedSwitches.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#999999")
        .text("Keine besseren Lieferanten für deine bestellten Produkte gefunden.", 50, y);
      y += 20;
    } else {
      for (const sw of payload.recommendedSwitches) {
        if (y > 720) { doc.addPage(); y = 50; }
        doc.fillColor("#f0fdf4").rect(50, y, 495, 22).fill();
        doc.fillColor("#15803d").font("Helvetica-Bold").fontSize(10);
        doc.text(`${sw.fromSupplierName}  →  ${sw.toSupplierName}`, 56, y + 6);
        doc.text(`Spare ~ ${fmtEuro(sw.expectedMonthlySaving)} / Monat`, 56, y + 6, { width: 489, align: "right" });
        y += 28;
        doc.font("Helvetica").fontSize(9).fillColor("#444444");
        for (const p of sw.products.slice(0, 5)) {
          if (y > 770) { doc.addPage(); y = 50; }
          doc.text(`• ${p.name} (${p.unit})`, 60, y, { width: 380, ellipsis: true });
          doc.text(`+${fmtEuro(p.saving)}`, 460, y, { width: 85, align: "right" });
          y += 13;
        }
        y += 10;
      }
    }

    // Missed promotions
    if (y > 650) { doc.addPage(); y = 50; }
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#161921")
      .text("Verpasste Aktionen", 50, y);
    y += 22;
    if (payload.missedPromotions.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#999999")
        .text("Du hast keine relevanten Aktionen verpasst.", 50, y);
      y += 20;
    } else {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#666666");
      doc.text("Produkt", 50, y);
      doc.text("Lieferant", 230, y);
      doc.text("Rabatt", 380, y, { width: 55, align: "right" });
      doc.text("Hätte gespart", 440, y, { width: 105, align: "right" });
      y += 14;
      doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
      y += 4;
      doc.font("Helvetica").fontSize(9).fillColor("#333333");
      payload.missedPromotions.forEach((p, i) => {
        if (y > 770) { doc.addPage(); y = 50; }
        if (i % 2 === 1) {
          doc.fillColor("#fafafa").rect(50, y, 495, 16).fill();
          doc.fillColor("#333333");
        }
        doc.text(`${p.productName} (${p.unit})`, 50, y + 4, { width: 175, ellipsis: true });
        doc.text(p.supplierName, 230, y + 4, { width: 145, ellipsis: true });
        doc.text(`-${p.discountPercent}%`, 380, y + 4, { width: 55, align: "right" });
        doc.font("Helvetica-Bold").fillColor("#16a34a").text(fmtEuro(p.estimatedMissedSaving), 440, y + 4, { width: 105, align: "right" });
        doc.font("Helvetica").fillColor("#333333");
        y += 16;
      });
    }

    // Detailed savings table
    doc.addPage();
    y = 50;
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#161921")
      .text("Ersparnis-Potenzial pro Produkt", 50, y);
    y += 22;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#666666");
    doc.text("Produkt", 50, y);
    doc.text("Aktuell", 220, y);
    doc.text("Günstigster", 330, y);
    doc.text("Du sparst", 460, y, { width: 85, align: "right" });
    y += 14;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
    y += 4;
    doc.font("Helvetica").fontSize(9).fillColor("#333333");
    const savingsRows = payload.productRows.filter(r => r.potentialSaving > 0);
    if (savingsRows.length === 0) {
      doc.fillColor("#999999").text("Du bestellst bereits beim günstigsten Anbieter — gut gemacht!", 50, y + 4);
    } else {
      savingsRows.forEach((r, i) => {
        if (y > 770) { doc.addPage(); y = 50; }
        if (i % 2 === 1) {
          doc.fillColor("#fafafa").rect(50, y, 495, 16).fill();
          doc.fillColor("#333333");
        }
        doc.text(`${r.name} (${r.unit})`, 50, y + 4, { width: 165, ellipsis: true });
        doc.text(`${r.currentSupplierName} · ${fmtEuro(r.currentUnitPrice)}`, 220, y + 4, { width: 105, ellipsis: true });
        doc.text(`${r.cheapestSupplierName ?? "—"} · ${r.cheapestUnitPrice !== null ? fmtEuro(r.cheapestUnitPrice) : "—"}`, 330, y + 4, { width: 125, ellipsis: true });
        doc.font("Helvetica-Bold").fillColor("#16a34a").text(fmtEuro(r.potentialSaving), 460, y + 4, { width: 85, align: "right" });
        doc.font("Helvetica").fillColor("#333333");
        y += 16;
      });
    }

    // Footer on every page
    const range = (doc as any).bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8).fillColor("#999999")
        .text(`GastroConnect · Monatlicher Vergleichsbericht · Seite ${i + 1} von ${range.count}`, 50, 810, { width: 495, align: "center" });
    }

    doc.end();
  });
}

export async function uploadMonthlyReportPDF(pdfBuffer: Buffer): Promise<string> {
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
    resumable: false,
  });
  return `/objects/documents/${fileId}.pdf`;
}

export async function generateAndStoreMonthlyReport(
  restaurantId: string,
  month: string,
  opts?: { notify?: boolean },
) {
  const payload = await computeMonthlyReport(restaurantId, month);
  let fileUrl: string | null = null;
  try {
    const pdfBuffer = await generateMonthlyReportPDF(payload);
    fileUrl = await uploadMonthlyReportPDF(pdfBuffer);
  } catch (err) {
    // PDF/Upload failure must not block the web report — log and continue.
    console.error(`[monthly-report] PDF upload failed for ${restaurantId} ${month}:`, (err as Error)?.message);
  }
  const report = await storage.upsertMonthlyReport({
    restaurantId,
    month,
    fileUrl,
    totalSpent: payload.totalSpent.toFixed(2),
    prevMonthTotal: payload.prevMonthTotal.toFixed(2),
    savingsPotential: payload.totalSavingPotential.toFixed(2),
    payload,
  });
  return { report, payload };
}

/** Monthly cron — run for previous month, for every opted-in restaurant. */
export async function runMonthlyReportsForAll(month?: string): Promise<{ generated: number; skipped: number; failed: number }> {
  const now = new Date();
  const targetMonth = month ?? (() => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const restaurants = await storage.getUsersByRole("restaurant");
  let generated = 0, skipped = 0, failed = 0;
  for (const r of restaurants) {
    if (r.monthlyReportOptOut) { skipped++; continue; }
    try {
      const existing = await storage.getMonthlyReportByMonth(r.id, targetMonth);
      if (existing) { skipped++; continue; }
      const { report, payload } = await generateAndStoreMonthlyReport(r.id, targetMonth);
      const rLang: "de" | "it" = r.language === "it" ? "it" : "de";
      const monthLabel = rLang === "it"
        ? new Date(parseInt(targetMonth.split("-")[0]), parseInt(targetMonth.split("-")[1]) - 1, 1)
            .toLocaleDateString("it-IT", { month: "long", year: "numeric" })
        : formatMonthLabelDE(targetMonth);
      await storage.createNotification({
        userId: r.id,
        type: "monthly_report",
        title: rLang === "it" ? "Il tuo rapporto mensile è pronto" : "Dein Monatsbericht ist da",
        message: rLang === "it"
          ? `Rapporto comparativo per ${monthLabel} – Potenziale di risparmio: ${fmtEuro(payload.totalSavingPotential)}`
          : `Vergleichsbericht für ${monthLabel} – Einsparpotenzial: ${fmtEuro(payload.totalSavingPotential)}`,
        referenceId: report.id,
      });
      generated++;
    } catch (err) {
      console.error(`[monthly-report] failed for restaurant ${r.id}:`, err);
      failed++;
    }
  }
  return { generated, skipped, failed };
}
