import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import { products, priceChangeLog } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { normalizeGtin, productMatchKey } from "@shared/productMatch";

export interface ParsedPriceListItem {
  name: string;
  price: number | null;
  unit: string | null;
  articleNumber: string | null;
  gtin: string | null;
}

const EXTRACTION_PROMPT = `You are a data-extraction assistant for a B2B food-supply platform.
You will receive a supplier price list as an image or PDF (often in German or Italian).
Extract every distinct product line item you can read.

For each product return:
- "name": product name (string, required)
- "price": unit price as a number (use a dot as decimal separator, no currency symbol). If missing, use null.
- "unit": the selling unit exactly as written (e.g. "kg", "Stück", "Karton", "Liter", "pz"). If missing, use null.
- "articleNumber": the supplier article/SKU number if present, otherwise null.
- "gtin": the EAN/GTIN barcode digits if present (8-14 digits), otherwise null.

Rules:
- Do NOT invent products, prices, or barcodes. Only extract what is clearly readable.
- Ignore headers, totals, page numbers, addresses and other non-product text.
- Return ONLY valid JSON, no markdown, in this exact shape:
{"products":[{"name":"...","price":0.0,"unit":"...","articleNumber":null,"gtin":null}]}`;

function stripJson(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return t;
}

function coercePrice(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeParsed(raw: any): ParsedPriceListItem[] {
  const list: any[] = Array.isArray(raw?.products) ? raw.products : Array.isArray(raw) ? raw : [];
  const out: ParsedPriceListItem[] = [];
  for (const item of list) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      price: coercePrice(item?.price),
      unit: typeof item?.unit === "string" && item.unit.trim() ? item.unit.trim() : null,
      articleNumber: typeof item?.articleNumber === "string" && item.articleNumber.trim() ? item.articleNumber.trim() : null,
      gtin: normalizeGtin(typeof item?.gtin === "string" ? item.gtin : item?.gtin != null ? String(item.gtin) : null),
    });
  }
  return out;
}

export function registerOcrImportRoutes(app: Express) {
  const bigJson = express.json({ limit: "25mb" });

  // Each parse call hits a paid AI vision model, so it gets a tighter limit than
  // the global API limiter to guard against cost-amplification / abuse.
  const parseLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Zu viele Importe. Bitte versuchen Sie es in ein paar Minuten erneut." },
    validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
  });

  // Parse an uploaded price list (image or PDF) into structured product rows via AI vision.
  app.post("/api/supplier/price-list/parse", parseLimiter, bigJson, async (req: Request, res: Response) => {
    try {
      const { fileData, mimeType } = req.body as { fileData?: string; mimeType?: string };
      if (!fileData || typeof fileData !== "string") {
        return res.status(400).json({ error: "fileData (data URI) erforderlich" });
      }
      if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
        return res.status(503).json({ error: "ai_not_configured", message: "KI-Integration ist noch nicht eingerichtet." });
      }

      const dataUri = fileData.startsWith("data:")
        ? fileData
        : `data:${mimeType || "image/png"};base64,${fileData}`;
      const isPdf = dataUri.startsWith("data:application/pdf") || (mimeType || "").includes("pdf");

      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const fileContent = isPdf
        ? { type: "input_file" as const, filename: "price-list.pdf", file_data: dataUri }
        : { type: "input_image" as const, image_url: dataUri, detail: "high" as const };

      const response = await openai.responses.create({
        model: "gpt-5.4",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text" as const, text: EXTRACTION_PROMPT },
              fileContent as any,
            ],
          },
        ],
        max_output_tokens: 8192,
      });

      const text = (response as any).output_text || "";
      let parsed: ParsedPriceListItem[] = [];
      try {
        parsed = normalizeParsed(JSON.parse(stripJson(text)));
      } catch {
        return res.status(422).json({ error: "parse_failed", message: "Die Preisliste konnte nicht gelesen werden. Bitte ein klareres Bild verwenden." });
      }

      return res.json({ products: parsed });
    } catch (error: any) {
      console.error("[price-list/parse] failed:", error?.message || error);
      return res.status(500).json({ error: "Verarbeitung fehlgeschlagen" });
    }
  });

  // Bulk create/update products from reviewed rows. Matches existing products by
  // gtin → articleNumber → normalized name+unit, and logs price changes (source="ocr").
  app.post("/api/supplier/price-list/import", async (req: Request, res: Response) => {
    try {
      const supplierId = typeof req.body?.supplierId === "string" ? req.body.supplierId : "";
      const userId = typeof req.body?.userId === "string" ? req.body.userId : null;
      const userName = typeof req.body?.userName === "string" ? req.body.userName : null;
      const rows: ParsedPriceListItem[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (!supplierId) return res.status(400).json({ error: "supplierId erforderlich" });
      if (rows.length === 0) return res.status(400).json({ error: "Keine Produkte zum Importieren" });

      const existing = await db.select().from(products).where(eq(products.supplierId, supplierId));
      type ProductRow = typeof existing[number];
      const byGtin = new Map<string, ProductRow>();
      const byArticle = new Map<string, ProductRow>();
      // Name+unit key only (gtin deliberately omitted) so a row can match a
      // counterpart that has no barcode — and vice versa — under partial GTIN
      // coverage. GTIN is still tried first below as the authoritative key.
      const byNameUnit = new Map<string, ProductRow>();
      const register = (p: ProductRow) => {
        const g = normalizeGtin(p.gtin);
        if (g) byGtin.set(g, p);
        if (p.articleNumber) byArticle.set(p.articleNumber.trim().toLowerCase(), p);
        byNameUnit.set(productMatchKey({ name: p.name, unit: p.unit, gtin: null }), p);
      };
      for (const p of existing) register(p);

      let created = 0;
      let updated = 0;
      const result = await db.transaction(async (tx) => {
        const touched = new Set<string>();
        for (const r of rows) {
          const name = (r.name || "").trim();
          if (!name) continue;
          const price = coercePrice(r.price);
          if (price == null || price <= 0) continue; // require a valid price to import
          const unit = (r.unit || "").trim() || "piece";
          const gtin = normalizeGtin(r.gtin);
          const articleNumber = r.articleNumber?.trim() || null;
          const nameUnitKey = productMatchKey({ name, unit, gtin: null });

          let match: ProductRow | undefined;
          if (gtin) match = byGtin.get(gtin);
          if (!match && articleNumber) match = byArticle.get(articleNumber.toLowerCase());
          if (!match) match = byNameUnit.get(nameUnitKey);

          if (match) {
            const newPriceStr = price.toFixed(2);
            const priceChanged = Number(newPriceStr) !== Number(match.price);
            const setData: Partial<typeof products.$inferInsert> = { price: newPriceStr };
            if (gtin && !normalizeGtin(match.gtin)) setData.gtin = gtin;
            await tx.update(products).set(setData).where(and(eq(products.id, match.id), eq(products.supplierId, supplierId)));
            if (priceChanged) {
              await tx.insert(priceChangeLog).values({
                productId: match.id,
                supplierId,
                userId,
                userName,
                oldPrice: match.price,
                newPrice: newPriceStr,
                source: "ocr",
              });
            }
            // Keep in-memory state current so duplicate rows within this same
            // import update the row instead of creating a second copy.
            match.price = newPriceStr;
            if (setData.gtin) {
              match.gtin = gtin;
              byGtin.set(gtin!, match);
            }
            if (!touched.has(match.id)) {
              updated++;
              touched.add(match.id);
            }
          } else {
            const [inserted] = await tx.insert(products).values({
              supplierId,
              name,
              price: price.toFixed(2),
              unit,
              gtin: gtin ?? undefined,
              articleNumber: articleNumber ?? undefined,
            }).returning();
            register(inserted);
            touched.add(inserted.id);
            created++;
          }
        }
        return { created, updated };
      });

      return res.json(result);
    } catch (error: any) {
      console.error("[price-list/import] failed:", error?.message || error);
      return res.status(500).json({ error: "Import fehlgeschlagen" });
    }
  });
}
