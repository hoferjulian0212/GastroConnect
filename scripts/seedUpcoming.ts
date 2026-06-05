import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";

const { users, products, orders, orderItems, promotions } = schema;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const DAY = 24 * 60 * 60 * 1000;
const futureDate = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]) => arr[rand(0, arr.length - 1)];
const sample = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(rand(0, copy.length - 1), 1)[0]);
  return out;
};

type Product = typeof products.$inferSelect;

const itemFor = (p: Product, qty: number, confirmedQty?: number | null) => ({
  productId: p.id,
  productName: p.name,
  quantity: qty,
  confirmedQuantity: confirmedQty ?? null,
  unitPrice: p.price,
  totalPrice: (parseFloat(p.price) * qty).toFixed(2),
});
const sumOf = (items: { totalPrice: string }[]) =>
  items.reduce((s, i) => s + parseFloat(i.totalPrice), 0).toFixed(2);

async function createOrder(
  data: {
    restaurantId: string;
    supplierId: string;
    status: any;
    requestedDeliveryDate?: string;
    notes?: string | null;
    createdDaysAgo: number;
  },
  items: ReturnType<typeof itemFor>[],
) {
  const ts = new Date(Date.now() - data.createdDaysAgo * DAY);
  const [order] = await db
    .insert(orders)
    .values({
      restaurantId: data.restaurantId,
      supplierId: data.supplierId,
      createdByUserId: data.restaurantId,
      status: data.status,
      totalAmount: sumOf(items),
      notes: data.notes ?? null,
      requestedDeliveryDate: data.requestedDeliveryDate,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning();
  for (const item of items) {
    await db.insert(orderItems).values({ ...item, orderId: order.id });
  }
  return order;
}

const NOTES = [
  null,
  null,
  "Bitte vor 10 Uhr liefern",
  "Lieferung an die Hintertür",
  "Wochenend-Vorbereitung — danke!",
  "Bitte gekühlt anliefern",
  "Anruf vor Lieferung erwünscht",
];

const PROMO_NAMES = [
  "Wochenangebot",
  "Frühlingsaktion",
  "Mengenrabatt",
  "Stammkunden-Special",
  "Saisonale Aktion",
  "Top-Deal der Woche",
];

async function main() {
  const allUsers = await db.select().from(users);
  const restaurants = allUsers.filter((u) => u.role === "restaurant");
  const suppliers = allUsers.filter(
    (u) => u.role === "supplier" && !/(demo|intern)/i.test(`${u.name} ${u.companyName ?? ""}`),
  );

  const productsBySupplier = new Map<string, Product[]>();
  for (const s of suppliers) {
    const ps = await db.select().from(products).where(eq(products.supplierId, s.id));
    productsBySupplier.set(s.id, ps.filter((p) => p.inStock !== false));
  }

  let createdOrders = 0;
  let createdPromos = 0;

  // ---- UPCOMING ORDERS: every restaurant x every supplier ----
  for (const r of restaurants) {
    for (const s of suppliers) {
      const sp = productsBySupplier.get(s.id) ?? [];
      if (sp.length === 0) continue;

      // 1 confirmed order spread across the next ~2 weeks
      const c1items = sample(sp, rand(2, 4)).map((p) => itemFor(p, rand(3, 18), null));
      c1items.forEach((it) => (it.confirmedQuantity = it.quantity));
      await createOrder(
        {
          restaurantId: r.id,
          supplierId: s.id,
          status: "confirmed",
          requestedDeliveryDate: futureDate(rand(1, 12)),
          notes: pick(NOTES),
          createdDaysAgo: rand(1, 6),
        },
        c1items,
      );
      createdOrders++;

      // ~40% chance of an additional pending order soon
      if (Math.random() < 0.4) {
        const pitems = sample(sp, rand(1, 3)).map((p) => itemFor(p, rand(2, 12)));
        await createOrder(
          {
            restaurantId: r.id,
            supplierId: s.id,
            status: "pending",
            requestedDeliveryDate: futureDate(rand(1, 5)),
            notes: pick(NOTES),
            createdDaysAgo: rand(0, 2),
          },
          pitems,
        );
        createdOrders++;
      }
    }
  }

  // ---- IN-DELIVERY today/tomorrow so supplier home widgets populate ----
  for (const s of suppliers) {
    const sp = productsBySupplier.get(s.id) ?? [];
    if (sp.length === 0) continue;
    const twoRestaurants = sample(restaurants, 2);
    for (let i = 0; i < twoRestaurants.length; i++) {
      const r = twoRestaurants[i];
      const items = sample(sp, rand(2, 4)).map((p) => itemFor(p, rand(4, 16)));
      items.forEach((it) => (it.confirmedQuantity = it.quantity));
      await createOrder(
        {
          restaurantId: r.id,
          supplierId: s.id,
          status: "in_delivery",
          requestedDeliveryDate: futureDate(i),
          notes: pick(NOTES),
          createdDaysAgo: rand(1, 3),
        },
        items,
      );
      createdOrders++;
    }
  }

  // ---- A few partially_confirmed for variety ----
  for (const r of sample(restaurants, 3)) {
    const s = pick(suppliers);
    const sp = productsBySupplier.get(s.id) ?? [];
    if (sp.length < 2) continue;
    const chosen = sample(sp, 3);
    const items = chosen.map((p, idx) =>
      idx === 0 ? itemFor(p, 10, 6) : itemFor(p, rand(3, 8), rand(3, 8)),
    );
    await createOrder(
      {
        restaurantId: r.id,
        supplierId: s.id,
        status: "partially_confirmed",
        requestedDeliveryDate: futureDate(rand(1, 4)),
        notes: pick(NOTES),
        createdDaysAgo: rand(0, 2),
      },
      items,
    );
    createdOrders++;
  }

  // ---- ACTIVE PROMOTIONS: every supplier ----
  for (const s of suppliers) {
    const sp = productsBySupplier.get(s.id) ?? [];
    if (sp.length === 0) continue;
    const promoCount = Math.min(rand(3, 4), sp.length);
    const chosen = sample(sp, promoCount);
    for (const p of chosen) {
      const discount = rand(10, 25);
      const start = new Date(Date.now() - rand(2, 7) * DAY);
      const end = new Date(Date.now() + rand(7, 21) * DAY);
      await db.insert(promotions).values({
        productId: p.id,
        supplierId: s.id,
        discountPercent: discount,
        startDate: start,
        endDate: end,
        isActive: true,
        name: pick(PROMO_NAMES),
        description: `${discount}% Rabatt auf ${p.name}`,
        createdAt: start,
      });
      createdPromos++;
    }
  }

  console.log(`Created ${createdOrders} upcoming/active orders and ${createdPromos} active promotions.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
