import { sql } from "drizzle-orm";
import { products, stockMovements } from "@shared/schema";
import { db } from "./db";

/**
 * Three-bucket warehouse model per product:
 *  - MAIN warehouse  = products.stock_quantity (available to sell)
 *  - ITI (temporary) = products.reserved_quantity (allocated to open orders)
 *  - Outbounded      = goods that left after delivery (tracked via movements only)
 *
 * Movements:
 *  - order_reserved   : order placed → MAIN -> ITI
 *  - order_returned   : order cancelled / qty reduced → ITI -> MAIN
 *  - order_outbounded : order delivered → ITI -> gone
 *
 * Products with stock_quantity = NULL are "untracked" and are skipped entirely.
 */
export type BucketMovementType = "order_reserved" | "order_returned" | "order_outbounded";

export class InsufficientStockError extends Error {
  productName: string;
  available: number;
  requested: number;
  constructor(productName: string, available: number, requested: number) {
    super(`Insufficient stock for ${productName}: requested ${requested}, available ${available}`);
    this.name = "InsufficientStockError";
    this.productName = productName;
    this.available = available;
    this.requested = requested;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

interface ApplyBucketOpts {
  orderId: string;
  supplierId: string;
  productId: string;
  productName: string;
  type: BucketMovementType;
  qty: number;
  actorId?: string | null;
  actorName?: string | null;
  note?: string;
  /** For reserve only: throw InsufficientStockError when tracked stock is too low (default true). */
  strict?: boolean;
}

/**
 * Apply a single bucket movement atomically inside the given transaction and
 * record a stock_movements row. Returns the qty actually applied (0 if the
 * product is untracked or nothing to move).
 */
export async function applyBucketMovement(tx: DbOrTx, opts: ApplyBucketOpts): Promise<number> {
  const { orderId, supplierId, productId, productName, type, actorId, actorName, note } = opts;
  let qty = Math.trunc(opts.qty);
  if (qty <= 0) return 0;
  const strict = opts.strict !== false;

  if (type === "order_reserved") {
    // Lock the row and read current MAIN stock to decide how much to reserve.
    const sel = await tx.execute(sql`SELECT stock_quantity FROM ${products} WHERE id = ${productId} FOR UPDATE`);
    const selRow: any = (sel as any).rows?.[0];
    if (!selRow) return 0; // product missing
    const available = selRow.stock_quantity;
    if (available === null || available === undefined) return 0; // untracked → skip
    const avail = Number(available);
    let applied: number;
    if (strict) {
      if (avail < qty) throw new InsufficientStockError(productName, avail, qty);
      applied = qty;
    } else {
      applied = Math.min(avail, qty); // lenient: never drive MAIN negative
    }
    if (applied <= 0) return 0;
    const res = await tx.execute(sql`
      UPDATE ${products}
        SET stock_quantity = stock_quantity - ${applied},
            reserved_quantity = reserved_quantity + ${applied},
            in_stock = (stock_quantity - ${applied}) > 0
      WHERE id = ${productId}
      RETURNING stock_quantity AS new_stock`);
    const row: any = (res as any).rows?.[0];
    const newStock = Number(row?.new_stock ?? 0);
    await tx.insert(stockMovements).values({
      productId, supplierId, orderId, userId: actorId ?? null, userName: actorName ?? null,
      type, quantity: applied, previousStock: newStock + applied, newStock, note: note ?? "",
    });
    return applied;
  }

  if (type === "order_returned") {
    // Lock the row and credit MAIN by exactly the amount we can release from ITI.
    // Crediting the full requested qty would inflate MAIN if reserved ever
    // undershoots (corrupted/edited state), so clamp the MAIN credit to the
    // actual reserved amount removed.
    const sel = await tx.execute(sql`SELECT stock_quantity, reserved_quantity FROM ${products} WHERE id = ${productId} FOR UPDATE`);
    const selRow: any = (sel as any).rows?.[0];
    if (!selRow) return 0; // product missing
    if (selRow.stock_quantity === null || selRow.stock_quantity === undefined) return 0; // untracked → skip
    const oldReserved = Number(selRow.reserved_quantity ?? 0);
    const released = Math.max(0, Math.min(oldReserved, qty)); // never credit MAIN more than was reserved
    if (released <= 0) return 0;
    const res = await tx.execute(sql`
      UPDATE ${products}
        SET reserved_quantity = reserved_quantity - ${released},
            stock_quantity = stock_quantity + ${released},
            in_stock = (stock_quantity + ${released}) > 0
      WHERE id = ${productId}
      RETURNING stock_quantity AS new_stock`);
    const row: any = (res as any).rows?.[0];
    if (!row) return 0;
    const newStock = Number(row.new_stock ?? 0);
    await tx.insert(stockMovements).values({
      productId, supplierId, orderId, userId: actorId ?? null, userName: actorName ?? null,
      type, quantity: released, previousStock: newStock - released, newStock, note: note ?? "",
    });
    return released;
  }

  // order_outbounded: leaves ITI, MAIN unchanged.
  const res = await tx.execute(sql`
    UPDATE ${products}
      SET reserved_quantity = GREATEST(0, reserved_quantity - ${qty})
    WHERE id = ${productId} AND stock_quantity IS NOT NULL
    RETURNING stock_quantity AS new_stock`);
  const row: any = (res as any).rows?.[0];
  if (!row) return 0; // untracked
  const newStock = Number(row.new_stock ?? 0);
  await tx.insert(stockMovements).values({
    productId, supplierId, orderId, userId: actorId ?? null, userName: actorName ?? null,
    type, quantity: qty, previousStock: newStock, newStock, note: note ?? "",
  });
  return qty;
}

/**
 * How much of each product is currently reserved (ITI) for a given order,
 * computed from this order's bucket movements. Used to return/outbound exactly
 * what is still reserved (idempotent: 0 remaining → no-op).
 */
export async function getReservedRemainingByProduct(tx: DbOrTx, orderId: string): Promise<Map<string, number>> {
  const rows = await tx
    .select({ productId: stockMovements.productId, type: stockMovements.type, quantity: stockMovements.quantity })
    .from(stockMovements)
    .where(sql`${stockMovements.orderId} = ${orderId}`);
  const m = new Map<string, number>();
  for (const r of rows as Array<{ productId: string; type: string; quantity: number }>) {
    const cur = m.get(r.productId) ?? 0;
    if (r.type === "order_reserved") m.set(r.productId, cur + r.quantity);
    else if (r.type === "order_returned" || r.type === "order_outbounded") m.set(r.productId, cur - r.quantity);
  }
  return m;
}
