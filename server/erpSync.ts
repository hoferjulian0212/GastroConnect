// Supplier ERP → GastroConnect catalog sync engine.
//
// Once a supplier's ERP connection is active and credentials are stored, this
// module pulls the supplier's ENTIRE catalog from the ERP and reconciles it
// against GastroConnect with the ERP as the source of truth:
//   - creates products that exist in the ERP but not in GastroConnect
//   - overwrites ERP-owned fields (name, description, unit, category, article
//     number, GTIN, base price, stock, default MOQ)
//   - logs every price/MOQ change to priceChangeLog (source="erp") and every
//     stock change to stockMovements (type="erp_sync"), all in one transaction
//   - soft-deactivates ERP-managed products missing from the latest feed
//
// GastroConnect-OWNED fields are NEVER touched by a sync: product images,
// lowStockThreshold, promotions, per-restaurant custom prices/MOQs. These are
// relationship/platform data, not ERP data.
//
// Two generic, runnable ingestion paths sit behind one interface:
//   1. a generic REST/JSON catalog fetch using the stored API key, and
//   2. an Excel/CSV file pulled from a configured IMAP mailbox.
// Named-vendor adapters (SAP, Dynamics, ...) stay stubs in erpProviders.ts and
// plug into the same NormalizedCatalogRow contract without touching this logic.

import { db } from "./db";
import { products, priceChangeLog, stockMovements, supplierErpConnections } from "@shared/schema";
import { and, eq, ne } from "drizzle-orm";
import { normalizeGtin, productMatchKey } from "@shared/productMatch";
import { storage } from "./storage";
import { sendPushNotification } from "./pushService";

// ===================== Normalized catalog contract =====================

export interface NormalizedCatalogRow {
  externalId: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  category: string | null;
  articleNumber: string | null;
  gtin: string | null;
  price: number | null;
  stockQuantity: number | null;
  minOrderQuantity: number | null;
}

export type SyncTrigger = "manual" | "scheduled";

// Minimal shape fetchErpCatalog needs to resolve credentials + the vendor
// adapter. The full connection row satisfies it.
export interface ErpConnectionRef {
  id: string;
  providerId: string;
}

// Options passed through the ingestion paths. `sample` asks adapters to fetch
// only a lightweight slice (first page) — used by the "Test connection" flow so
// suppliers can verify credentials without pulling the entire catalog.
export interface ErpFetchOptions {
  sample?: boolean;
}

export interface ErpTestResult {
  ok: boolean;
  sampleCount: number;
  sample: string[];
}

export interface SyncPreviewItem {
  action: "create" | "update" | "deactivate";
  name: string;
  changes: string[];
}

export interface SyncResult {
  dryRun: boolean;
  totalRows: number;
  created: number;
  updated: number;
  deactivated: number;
  reactivated: number;
  priceChanges: number;
  stockChanges: number;
  unchanged: number;
  errors: string[];
  preview: SyncPreviewItem[];
}

export class ErpSyncRunningError extends Error {
  constructor() {
    super("A sync is already running for this connection.");
    this.name = "ErpSyncRunningError";
  }
}

export class ErpSyncConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErpSyncConfigError";
  }
}

// ===================== Field coercion / normalization =====================

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

function coerceInt(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.,-]/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function coerceStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// Map an arbitrary header/key to a canonical token (lowercase, alnum only).
function canonKey(k: string): string {
  return (k || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

// Aliases (already canonicalized) → normalized field. First match wins. Besides
// German/Italian column names this also covers named-vendor field quirks (e.g.
// Dynamics 365 `displayName`/`number`/`inventory`, SAP B1 `ItemCode`/`ItemName`/
// `QuantityOnStock`) so the generic normalizer stays robust even if an adapter
// passes through vendor-native keys.
const FIELD_ALIASES: Record<string, string[]> = {
  externalId: ["externalid", "erpid", "productid", "itemid", "id", "artikelid"],
  name: ["name", "productname", "product", "bezeichnung", "artikelbezeichnung", "artikel", "descrizione", "nome", "titel", "title", "displayname", "itemname", "artikelname"],
  description: ["description", "beschreibung", "langtext", "notes", "note", "hinweis", "descrizioneestesa"],
  unit: ["unit", "einheit", "uom", "mengeneinheit", "me", "unita", "verkaufseinheit", "unitname", "baseunitofmeasure", "baseunitofmeasurecode", "salesunit"],
  category: ["category", "kategorie", "warengruppe", "categoria", "gruppe", "productgroup", "itemcategorycode", "itemgroup"],
  articleNumber: ["articlenumber", "artikelnummer", "artikelnr", "artnr", "sku", "itemno", "itemnumber", "codice", "codicearticolo", "articleno", "nummer", "number", "itemcode"],
  gtin: ["gtin", "ean", "ean13", "barcode", "code", "eancode", "eannummer"],
  price: ["price", "preis", "unitprice", "vk", "vkpreis", "listenpreis", "verkaufspreis", "prezzo", "netprice", "nettopreis", "baseprice", "salesprice", "listprice", "netunitprice"],
  stockQuantity: ["stock", "stockquantity", "bestand", "lagerbestand", "menge", "qty", "quantity", "available", "verfuegbar", "giacenza", "onhand", "inventory", "quantityonstock", "onhandquantity"],
  minOrderQuantity: ["moq", "minorderquantity", "mindestmenge", "minbestellmenge", "mindestbestellmenge", "minquantity", "minimo", "minimoordine", "minorder"],
};

// Turn one raw record (from JSON / spreadsheet) into a NormalizedCatalogRow
// using the alias map. Records without a usable name are dropped by the caller.
function normalizeRecord(raw: Record<string, unknown>): NormalizedCatalogRow | null {
  // Build a canonical-key → value lookup once per record.
  const byCanon = new Map<string, unknown>();
  for (const [k, v] of Object.entries(raw)) {
    const ck = canonKey(k);
    if (ck && !byCanon.has(ck)) byCanon.set(ck, v);
  }
  const pick = (field: string): unknown => {
    for (const alias of FIELD_ALIASES[field] ?? []) {
      if (byCanon.has(alias)) return byCanon.get(alias);
    }
    return undefined;
  };

  const name = coerceStr(pick("name"));
  if (!name) return null;

  return {
    externalId: coerceStr(pick("externalId")),
    name,
    description: coerceStr(pick("description")),
    unit: coerceStr(pick("unit")),
    category: coerceStr(pick("category")),
    articleNumber: coerceStr(pick("articleNumber")),
    gtin: normalizeGtin(coerceStr(pick("gtin"))),
    price: coercePrice(pick("price")),
    stockQuantity: coerceInt(pick("stockQuantity")),
    minOrderQuantity: coerceInt(pick("minOrderQuantity")),
  };
}

export function normalizeRecords(records: unknown): NormalizedCatalogRow[] {
  let list: unknown[] = [];
  if (Array.isArray(records)) list = records;
  else if (records && typeof records === "object") {
    const obj = records as Record<string, unknown>;
    for (const key of ["products", "items", "data", "catalog", "rows", "results"]) {
      if (Array.isArray(obj[key])) {
        list = obj[key] as unknown[];
        break;
      }
    }
  }
  const out: NormalizedCatalogRow[] = [];
  for (const item of list) {
    if (item && typeof item === "object") {
      const row = normalizeRecord(item as Record<string, unknown>);
      if (row) out.push(row);
    }
  }
  return out;
}

// ===================== CSV / XLSX parsing =====================

// Minimal RFC-4180-ish CSV parser with delimiter auto-detection (',' or ';').
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      record.push(field); field = "";
    } else if (c === "\n") {
      record.push(field); field = "";
      rows.push(record); record = [];
    } else if (c === "\r") {
      // ignore; handled by \n
    } else field += c;
  }
  if (field.length || record.length) { record.push(field); rows.push(record); }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim().length));
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
}

async function parseSpreadsheetBuffer(buffer: Buffer, filename: string): Promise<NormalizedCatalogRow[]> {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return normalizeRecords(parseCsv(buffer.toString("utf8")));
  }
  // xlsx / xls
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return normalizeRecords(json);
}

// ===================== Ingestion adapters =====================

// (1) Generic REST/JSON catalog fetch using the stored API key. Sends the key
// both as a Bearer token and an X-API-Key header for broad compatibility.
async function fetchCatalogViaApi(secrets: Record<string, string>): Promise<NormalizedCatalogRow[]> {
  const apiKey = secrets.apiKey;
  const baseUrl = secrets.apiBaseUrl;
  if (!baseUrl) throw new ErpSyncConfigError("No API base URL configured. Add the API address in the ERP credentials.");
  if (!apiKey) throw new ErpSyncConfigError("No API key configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(baseUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ErpSyncConfigError(`ERP API responded with HTTP ${res.status}.`);
    }
    const data = await res.json();
    return normalizeRecords(data);
  } catch (e: any) {
    if (e instanceof ErpSyncConfigError) throw e;
    if (e?.name === "AbortError") throw new ErpSyncConfigError("The ERP API request timed out.");
    throw new ErpSyncConfigError(`Could not reach the ERP API: ${e?.message || e}`);
  } finally {
    clearTimeout(timeout);
  }
}

// (2) Excel/CSV file pulled from a configured IMAP mailbox. Scans the most
// recent messages for a spreadsheet attachment and parses the newest one.
async function fetchCatalogViaEmail(secrets: Record<string, string>): Promise<NormalizedCatalogRow[]> {
  const host = secrets.mailboxHost;
  const user = secrets.mailboxUser;
  const pass = secrets.mailboxPassword;
  if (!host || !user || !pass) throw new ErpSyncConfigError("Incomplete mailbox credentials.");
  const port = secrets.mailboxPort ? parseInt(secrets.mailboxPort, 10) : 993;

  const { ImapFlow } = await import("imapflow");
  // mailparser ships no type declarations; load it untyped.
  // @ts-ignore -- no types for mailparser
  const mailparser: any = await import("mailparser");
  const simpleParser = mailparser.simpleParser;

  const client = new ImapFlow({
    host,
    port: Number.isFinite(port) ? port : 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
  } catch (e: any) {
    throw new ErpSyncConfigError(`Could not connect to the mailbox: ${e?.message || e}`);
  }

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const collected: { uid: number; date: number }[] = [];
      for await (const msg of client.fetch("1:*", { uid: true, internalDate: true })) {
        collected.push({ uid: msg.uid, date: msg.internalDate ? new Date(msg.internalDate).getTime() : 0 });
      }
      collected.sort((a, b) => b.date - a.date);

      for (const { uid } of collected.slice(0, 25)) {
        const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!full || !full.source) continue;
        const parsed = await simpleParser(full.source as Buffer);
        const att = (parsed.attachments || []).find((a: any) =>
          /\.(csv|xlsx|xls|txt)$/i.test(a.filename || ""),
        );
        if (att && att.content) {
          return await parseSpreadsheetBuffer(att.content as Buffer, att.filename || "catalog.csv");
        }
      }
      throw new ErpSyncConfigError("No spreadsheet attachment (CSV/XLSX) found in the recent mailbox messages.");
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

// Dispatch to the right ingestion path. Order of resolution:
//   1. Excel-via-email (mailbox credentials present) — vendor-independent.
//   2. A named-vendor adapter (DATEV, Lexware, Dynamics, SAP, ...) when the
//      connection's provider implements a real fetchCatalog.
//   3. The generic REST/JSON fetch using a stored apiKey + apiBaseUrl.
export async function fetchErpCatalog(
  connection: ErpConnectionRef,
  opts: ErpFetchOptions = {},
): Promise<NormalizedCatalogRow[]> {
  const secrets = await storage.getErpCredentialSecrets(connection.id);
  if (!secrets) {
    throw new ErpSyncConfigError("No ERP credentials stored. Add API or mailbox credentials first.");
  }

  // (1) Excel-via-email is chosen explicitly regardless of provider. (The email
  // path fetches a single spreadsheet, so it is already lightweight.)
  if (secrets.mailboxHost) return fetchCatalogViaEmail(secrets);

  // (2) Vendor-specific adapter (lazy import to keep the module graph acyclic).
  const provider = await storage.getErpProvider(connection.providerId);
  if (provider) {
    const { getErpProviderAdapter } = await import("./erpProviders");
    const adapter = getErpProviderAdapter(provider.slug);
    if (typeof adapter.fetchCatalog === "function") {
      return adapter.fetchCatalog(secrets, opts);
    }
  }

  // (3) Generic REST/JSON fetch (a single GET, already lightweight).
  if (secrets.apiKey) return fetchCatalogViaApi(secrets);
  throw new ErpSyncConfigError("Stored credentials do not match a supported ingestion method.");
}

/**
 * Authenticate against the vendor and pull a small sample (first page only) so a
 * supplier can verify their stored credentials before the first full sync. Never
 * writes anything. Throws ErpSyncConfigError with a supplier-facing message on
 * bad credentials, wrong URLs, expired secrets, etc.
 */
export async function testErpConnection(connection: ErpConnectionRef): Promise<ErpTestResult> {
  const rows = await fetchErpCatalog(connection, { sample: true });
  return {
    ok: true,
    sampleCount: rows.length,
    sample: rows.slice(0, 5).map((r) => r.name),
  };
}

// ===================== Reconciliation + overwrite engine =====================

type ProductRow = typeof products.$inferSelect;

// Build the priority match maps once for a supplier's existing catalog.
function buildMatchMaps(existing: ProductRow[]) {
  const byExternal = new Map<string, ProductRow>();
  const byGtin = new Map<string, ProductRow>();
  const byArticle = new Map<string, ProductRow>();
  const byNameUnit = new Map<string, ProductRow>();
  const register = (p: ProductRow) => {
    if (p.erpExternalId) byExternal.set(p.erpExternalId, p);
    const g = normalizeGtin(p.gtin);
    if (g) byGtin.set(g, p);
    if (p.articleNumber) byArticle.set(p.articleNumber.trim().toLowerCase(), p);
    byNameUnit.set(productMatchKey({ name: p.name, unit: p.unit, gtin: null }), p);
  };
  existing.forEach(register);
  return { byExternal, byGtin, byArticle, byNameUnit, register };
}

function findMatch(
  row: NormalizedCatalogRow,
  maps: ReturnType<typeof buildMatchMaps>,
): ProductRow | undefined {
  if (row.externalId && maps.byExternal.has(row.externalId)) return maps.byExternal.get(row.externalId);
  if (row.gtin && maps.byGtin.has(row.gtin)) return maps.byGtin.get(row.gtin);
  if (row.articleNumber && maps.byArticle.has(row.articleNumber.trim().toLowerCase())) {
    return maps.byArticle.get(row.articleNumber.trim().toLowerCase());
  }
  return maps.byNameUnit.get(productMatchKey({ name: row.name, unit: row.unit ?? "piece", gtin: null }));
}

/**
 * Reconcile a normalized ERP catalog against the supplier's GastroConnect
 * products. With dryRun=true nothing is written and the result carries a
 * per-product preview. ERP-owned fields are overwritten; GastroConnect-owned
 * fields (image, lowStockThreshold, promotions, custom prices/MOQ) are never
 * touched.
 */
export async function reconcileCatalog(
  supplierId: string,
  rows: NormalizedCatalogRow[],
  opts: { dryRun: boolean; userId?: string | null; userName?: string | null },
): Promise<SyncResult> {
  const result: SyncResult = {
    dryRun: opts.dryRun,
    totalRows: rows.length,
    created: 0,
    updated: 0,
    deactivated: 0,
    reactivated: 0,
    priceChanges: 0,
    stockChanges: 0,
    unchanged: 0,
    errors: [],
    preview: [],
  };

  const existing = await db.select().from(products).where(eq(products.supplierId, supplierId));
  const maps = buildMatchMaps(existing);
  const seenIds = new Set<string>();
  const PREVIEW_CAP = 200;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const name = row.name.trim();
      if (!name) continue;
      const price = row.price != null && row.price > 0 ? row.price : null;
      const unit = (row.unit || "").trim() || "piece";
      const match = findMatch(row, maps);

      if (match) {
        if (seenIds.has(match.id)) continue; // a duplicate feed row for the same product
        seenIds.add(match.id);

        const changes: string[] = [];
        const setData: Partial<typeof products.$inferInsert> = {};

        // ERP-owned text fields.
        if (name !== match.name) { setData.name = name; changes.push("name"); }
        if (row.description != null && row.description !== (match.description ?? null)) { setData.description = row.description; changes.push("description"); }
        if (row.unit && unit !== match.unit) { setData.unit = unit; changes.push("unit"); }
        if (row.category != null && row.category !== (match.category ?? null)) { setData.category = row.category; changes.push("category"); }
        if (row.articleNumber != null && row.articleNumber !== (match.articleNumber ?? null)) { setData.articleNumber = row.articleNumber; changes.push("articleNumber"); }
        if (row.gtin && row.gtin !== normalizeGtin(match.gtin)) { setData.gtin = row.gtin; changes.push("gtin"); }
        if (row.externalId && row.externalId !== (match.erpExternalId ?? null)) setData.erpExternalId = row.externalId;

        // Base price (logged).
        let priceChanged = false;
        let newPriceStr: string | null = null;
        if (price != null) {
          newPriceStr = price.toFixed(2);
          if (Number(newPriceStr) !== Number(match.price)) { setData.price = newPriceStr; priceChanged = true; changes.push("price"); }
        }

        // Default MOQ (logged via the same change log).
        let moqChanged = false;
        if (row.minOrderQuantity != null && row.minOrderQuantity >= 1 && row.minOrderQuantity !== match.minOrderQuantity) {
          setData.minOrderQuantity = row.minOrderQuantity; moqChanged = true; changes.push("minOrderQuantity");
        }

        // Stock (logged as a stock movement).
        let stockChanged = false;
        const prevStock = match.stockQuantity ?? 0;
        if (row.stockQuantity != null && row.stockQuantity !== prevStock) {
          setData.stockQuantity = row.stockQuantity;
          setData.inStock = row.stockQuantity > 0;
          stockChanged = true;
          changes.push("stock");
        }

        // Reactivate a previously-discontinued product that reappeared.
        let reactivated = false;
        if (match.discontinued) { setData.discontinued = false; reactivated = true; changes.push("reactivated"); }

        // Always (re)mark as ERP-managed.
        if (!match.erpManaged) setData.erpManaged = true;

        const hasChanges = changes.length > 0;
        if (!opts.dryRun) {
          setData.lastErpSyncAt = new Date();
          await tx.update(products).set(setData).where(and(eq(products.id, match.id), eq(products.supplierId, supplierId)));
          if (priceChanged || moqChanged) {
            await tx.insert(priceChangeLog).values({
              productId: match.id,
              supplierId,
              userId: opts.userId ?? null,
              userName: opts.userName ?? "ERP-Sync",
              oldPrice: priceChanged ? match.price : null,
              newPrice: priceChanged ? newPriceStr : null,
              oldMinOrderQuantity: moqChanged ? match.minOrderQuantity : null,
              newMinOrderQuantity: moqChanged && row.minOrderQuantity != null ? row.minOrderQuantity : null,
              source: "erp",
            });
          }
          if (stockChanged && row.stockQuantity != null) {
            await tx.insert(stockMovements).values({
              productId: match.id,
              supplierId,
              userId: opts.userId ?? null,
              userName: opts.userName ?? "ERP-Sync",
              type: "erp_sync",
              quantity: row.stockQuantity - prevStock,
              previousStock: prevStock,
              newStock: row.stockQuantity,
              note: "ERP-Sync",
            });
          }
        }

        if (priceChanged) result.priceChanges++;
        if (stockChanged) result.stockChanges++;
        if (reactivated) result.reactivated++;
        if (hasChanges) {
          result.updated++;
          if (result.preview.length < PREVIEW_CAP) result.preview.push({ action: "update", name, changes });
        } else {
          result.unchanged++;
        }
      } else {
        // New product from the ERP feed.
        result.created++;
        const changes = ["name", price != null ? "price" : null, row.stockQuantity != null ? "stock" : null].filter(Boolean) as string[];
        if (result.preview.length < PREVIEW_CAP) result.preview.push({ action: "create", name, changes });

        if (!opts.dryRun) {
          const [inserted] = await tx.insert(products).values({
            supplierId,
            name,
            description: row.description ?? undefined,
            price: (price ?? 0).toFixed(2),
            unit,
            category: row.category ?? undefined,
            articleNumber: row.articleNumber ?? undefined,
            gtin: row.gtin ?? undefined,
            stockQuantity: row.stockQuantity ?? 0,
            inStock: row.stockQuantity != null ? row.stockQuantity > 0 : true,
            minOrderQuantity: row.minOrderQuantity != null && row.minOrderQuantity >= 1 ? row.minOrderQuantity : 1,
            erpManaged: true,
            erpExternalId: row.externalId ?? undefined,
            lastErpSyncAt: new Date(),
          }).returning();
          maps.register(inserted);
          seenIds.add(inserted.id);
          if (row.stockQuantity != null && row.stockQuantity !== 0) {
            await tx.insert(stockMovements).values({
              productId: inserted.id,
              supplierId,
              userId: opts.userId ?? null,
              userName: opts.userName ?? "ERP-Sync",
              type: "erp_sync",
              quantity: row.stockQuantity,
              previousStock: 0,
              newStock: row.stockQuantity,
              note: "ERP-Sync (neu)",
            });
          }
        }
      }
    }

    // Deactivate ERP-managed products that vanished from the feed. Manual
    // GastroConnect-only products are left alone.
    for (const p of existing) {
      if (!p.erpManaged) continue;
      if (seenIds.has(p.id)) continue;
      if (p.discontinued) continue;
      result.deactivated++;
      if (result.preview.length < PREVIEW_CAP) result.preview.push({ action: "deactivate", name: p.name, changes: ["discontinued"] });
      if (!opts.dryRun) {
        await tx.update(products)
          .set({ discontinued: true, inStock: false, lastErpSyncAt: new Date() })
          .where(and(eq(products.id, p.id), eq(products.supplierId, supplierId)));
      }
    }
  });

  return result;
}

// ===================== Orchestration (lock, run, record) =====================

type ConnectionRow = typeof supplierErpConnections.$inferSelect;

async function tryAcquireLock(connectionId: string): Promise<boolean> {
  const locked = await db.update(supplierErpConnections)
    .set({ syncStatus: "running", syncStartedAt: new Date(), lastSyncError: null, updatedAt: new Date() })
    .where(and(eq(supplierErpConnections.id, connectionId), ne(supplierErpConnections.syncStatus, "running")))
    .returning();
  return locked.length > 0;
}

/**
 * Run a sync for one connection. dryRun never writes and never takes the lock
 * (so a preview can't block a real run). A real run is overlap-safe: if another
 * run holds the lock it throws ErpSyncRunningError.
 */
export async function runSyncForConnection(
  connection: ConnectionRow,
  opts: { dryRun: boolean; trigger: SyncTrigger; userId?: string | null; userName?: string | null },
): Promise<SyncResult> {
  if (connection.status !== "active") {
    throw new ErpSyncConfigError("The ERP connection is not active yet.");
  }

  if (opts.dryRun) {
    const rows = await fetchErpCatalog(connection);
    return reconcileCatalog(connection.supplierId, rows, { dryRun: true, userId: opts.userId, userName: opts.userName });
  }

  const acquired = await tryAcquireLock(connection.id);
  if (!acquired) throw new ErpSyncRunningError();

  try {
    const rows = await fetchErpCatalog(connection);
    const result = await reconcileCatalog(connection.supplierId, rows, { dryRun: false, userId: opts.userId, userName: opts.userName });
    await db.update(supplierErpConnections)
      .set({
        syncStatus: "success",
        lastSyncAt: new Date(),
        lastSyncError: null,
        lastSyncCreated: result.created,
        lastSyncUpdated: result.updated,
        lastSyncDeactivated: result.deactivated,
        firstSyncConfirmed: true,
        updatedAt: new Date(),
      })
      .where(eq(supplierErpConnections.id, connection.id));
    return result;
  } catch (e: any) {
    const message = e?.message ? String(e.message).slice(0, 500) : "Sync failed";
    await db.update(supplierErpConnections)
      .set({ syncStatus: "error", lastSyncError: message, updatedAt: new Date() })
      .where(eq(supplierErpConnections.id, connection.id));

    // Notify the supplier when an automatic (scheduled) sync fails so a silent
    // nightly failure doesn't leave the catalog stale for days. Only fire on a
    // transition INTO the error state — if the previous run already failed
    // (syncStatus was "error") we stay quiet to avoid notification spam on
    // repeated consecutive failures. Manual "Sync now" runs surface the error
    // in the UI directly, so they never notify here.
    if (opts.trigger === "scheduled" && connection.syncStatus !== "error") {
      await notifySupplierSyncFailed(connection, message).catch((err) => {
        console.error(`[erp-sync] failed to notify supplier ${connection.supplierId} of sync failure:`, err?.message || err);
      });
    }

    throw e;
  }
}

// Create an in-app notification (plus push, if subscribed) telling the supplier
// their automatic catalog sync failed. Deep-links to the Inventory ERP card.
async function notifySupplierSyncFailed(connection: ConnectionRow, errorMessage: string): Promise<void> {
  await storage.createNotification({
    userId: connection.supplierId,
    type: "erp_sync_failed",
    title: "ERP-Sync fehlgeschlagen",
    message: `Die automatische Synchronisierung Ihres Katalogs ist fehlgeschlagen: ${errorMessage} Bitte überprüfen Sie Ihre ERP-Verbindung.`,
    referenceId: connection.id,
  });
  sendPushNotification(connection.supplierId, {
    title: "ERP-Sync fehlgeschlagen",
    message: "Die automatische Synchronisierung Ihres Katalogs ist fehlgeschlagen. Bitte überprüfen Sie Ihre ERP-Verbindung.",
    url: "/supplier/inventory",
    type: "erp_sync_failed",
  }).catch((err) => {
    console.error(`[erp-sync] push dispatch failed for supplier ${connection.supplierId}:`, err?.message || err);
  });
}

// ===================== Scheduler =====================

let schedulerTimer: NodeJS.Timeout | null = null;
// Guard so a connection is only auto-run once within its scheduled minute even
// if the tick fires more than once.
const lastScheduledRun = new Map<string, string>();

function currentHHMM(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function schedulerTick(): Promise<void> {
  const now = new Date();
  const hhmm = currentHHMM(now);
  const dayKey = `${now.toISOString().slice(0, 10)}T${hhmm}`;
  let due: ConnectionRow[] = [];
  try {
    due = await db.select().from(supplierErpConnections).where(and(
      eq(supplierErpConnections.status, "active"),
      eq(supplierErpConnections.syncEnabled, true),
      eq(supplierErpConnections.firstSyncConfirmed, true),
    ));
  } catch (e: any) {
    console.error("[erp-sync] scheduler query failed:", e?.message || e);
    return;
  }

  for (const conn of due) {
    const target = (conn.preferredSyncTime || "06:00").trim().slice(0, 5);
    if (target !== hhmm) continue;
    if (lastScheduledRun.get(conn.id) === dayKey) continue;
    lastScheduledRun.set(conn.id, dayKey);
    try {
      const result = await runSyncForConnection(conn, { dryRun: false, trigger: "scheduled", userName: "ERP-Sync" });
      console.log(`[erp-sync] scheduled sync ${conn.id}: +${result.created} ~${result.updated} -${result.deactivated}`);
    } catch (e: any) {
      if (e instanceof ErpSyncRunningError) continue;
      console.error(`[erp-sync] scheduled sync ${conn.id} failed:`, e?.message || e);
    }
  }
}

export function startErpSyncScheduler(): void {
  if (schedulerTimer) return;
  // Check every minute; each connection runs at most once per scheduled minute.
  schedulerTimer = setInterval(() => { void schedulerTick(); }, 60_000);
  console.log("[erp-sync] scheduler started (1-minute tick)");
}
