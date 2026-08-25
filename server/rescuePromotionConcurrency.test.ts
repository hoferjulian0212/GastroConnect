import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import {
  cartItems,
  inventoryRiskRecords,
  members,
  orderItems,
  orders,
  orderStatusHistory,
  products,
  promotionAllocations,
  promotions,
  stockMovements,
  users,
  type InsertOrder,
  type InsertOrderItem,
} from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";

test("concurrent Rescue checkouts cannot oversell one promotion and retries stay idempotent", async () => {
  const run = crypto.randomUUID();
  let supplierId = "";
  let productId = "";
  let riskId = "";
  let promotionId = "";
  let memberId = "";
  const restaurantIds: string[] = [];

  try {
    const [supplier] = await db.insert(users).values({
      email: `rescue-race-supplier-${run}@example.test`,
      passwordHash: "test-only",
      name: `Rescue race supplier ${run}`,
      role: "supplier",
      verificationStatus: "verified",
    }).returning();
    supplierId = supplier.id;

    const restaurants = await db.insert(users).values([
      {
        email: `rescue-race-a-${run}@example.test`,
        passwordHash: "test-only",
        name: `Rescue race restaurant A ${run}`,
        role: "restaurant",
        verificationStatus: "verified",
      },
      {
        email: `rescue-race-b-${run}@example.test`,
        passwordHash: "test-only",
        name: `Rescue race restaurant B ${run}`,
        role: "restaurant",
        verificationStatus: "verified",
      },
    ]).returning();
    restaurantIds.push(...restaurants.map((restaurant) => restaurant.id));

    const [supplierMember] = await db.insert(members).values({
      organizationId: supplierId,
      name: "Rescue race manager",
      email: `rescue-race-manager-${run}@example.test`,
      passwordHash: "test-only",
      role: "manager",
    }).returning();
    memberId = supplierMember.id;

    const [product] = await db.insert(products).values({
      supplierId,
      name: `Rescue race product ${run}`,
      price: "10.00",
      unit: "kg",
      stockQuantity: 20,
      reservedQuantity: 0,
      inStock: true,
    }).returning();
    productId = product.id;

    const [risk] = await db.insert(inventoryRiskRecords).values({
      supplierId,
      productId,
      flaggedQuantity: 5,
      qualityStatus: "OK",
      riskReason: "Near Expiry",
      status: "Open",
      priority: "normal",
      createdBy: memberId,
    }).returning();
    riskId = risk.id;

    const actioned = await storage.actionInventoryRiskRecord(riskId, supplierId, {
      discountPercent: 25,
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 86_400_000),
      isActive: true,
      name: `Rescue race offer ${run}`,
      description: null,
      groupId: null,
      targetRestaurantIds: null,
      quantityCap: 5,
    });
    promotionId = actioned.promotion.id;

    await db.insert(cartItems).values(restaurants.map((restaurant) => ({
      restaurantId: restaurant.id,
      supplierId,
      productId,
      quantity: 4,
    })));

    const entries = restaurants.map((restaurant, index) => {
      const idempotencyKey = `rescue-race-${run}-${index}`;
      const order: InsertOrder = {
        restaurantId: restaurant.id,
        supplierId,
        createdByUserId: restaurant.id,
        status: "pending",
        totalAmount: "30.00",
        idempotencyKey,
        idempotencyFingerprint: `race-${index}`,
      };
      const item: InsertOrderItem = {
        productId,
        promotionId,
        productName: product.name,
        quantity: 4,
        unitPrice: "7.50",
        totalPrice: "30.00",
      };
      return { restaurantId: restaurant.id, idempotencyKey, entry: { order, items: [item] } };
    });

    const outcomes = await Promise.allSettled(entries.map(({ restaurantId, entry }) =>
      storage.createOrdersAtomically([entry], restaurantId, supplierId),
    ));

    const winnerIndexes = outcomes.flatMap((outcome, index) =>
      outcome.status === "fulfilled" ? [index] : [],
    );
    const loserOutcomes = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(winnerIndexes.length, 1, "exactly one checkout must commit");
    assert.equal(loserOutcomes.length, 1, "exactly one checkout must lose the capacity race");
    assert.equal(
      (loserOutcomes[0] as PromiseRejectedResult).reason?.message,
      "rescue_capacity_unavailable",
    );

    const [promotionAfterRace] = await db.select().from(promotions).where(eq(promotions.id, promotionId));
    const allocationsAfterRace = await db.select().from(promotionAllocations)
      .where(eq(promotionAllocations.promotionId, promotionId));
    const ordersAfterRace = await db.select().from(orders)
      .where(and(
        inArray(orders.restaurantId, restaurantIds),
        eq(orders.supplierId, supplierId),
      ));

    assert.equal(ordersAfterRace.length, 1);
    assert.equal(allocationsAfterRace.length, 1);
    assert.equal(promotionAfterRace.rescueReservedQuantity, 4);
    assert.equal(promotionAfterRace.rescueSoldQuantity, 0);
    assert.equal(
      allocationsAfterRace.reduce((sum, allocation) => sum + allocation.reservedQuantity, 0),
      promotionAfterRace.rescueReservedQuantity,
    );
    assert.equal(
      allocationsAfterRace.reduce((sum, allocation) => sum + allocation.soldQuantity, 0),
      promotionAfterRace.rescueSoldQuantity,
    );

    const winner = entries[winnerIndexes[0]];
    await assert.rejects(
      storage.createOrdersAtomically([winner.entry], winner.restaurantId, supplierId),
      (error: any) => error?.code === "23505",
      "the same checkout key must be rejected by the database uniqueness boundary",
    );

    const replayedOrders = await storage.getOrdersByIdempotencyKey(
      winner.restaurantId,
      winner.idempotencyKey,
    );
    const allocationsAfterRetry = await db.select().from(promotionAllocations)
      .where(eq(promotionAllocations.promotionId, promotionId));
    const [promotionAfterRetry] = await db.select().from(promotions)
      .where(eq(promotions.id, promotionId));

    assert.equal(replayedOrders.length, 1);
    assert.equal(allocationsAfterRetry.length, 1);
    assert.equal(promotionAfterRetry.rescueReservedQuantity, 4);
    assert.equal(promotionAfterRetry.rescueSoldQuantity, 0);
  } finally {
    if (riskId) {
      await db.update(inventoryRiskRecords)
        .set({ linkedPromotionId: null })
        .where(eq(inventoryRiskRecords.id, riskId));
    }
    if (promotionId) {
      await db.delete(promotionAllocations)
        .where(eq(promotionAllocations.promotionId, promotionId));
    }
    if (restaurantIds.length) {
      const seededOrders = await db.select({ id: orders.id }).from(orders)
        .where(and(inArray(orders.restaurantId, restaurantIds), eq(orders.supplierId, supplierId)));
      const orderIds = seededOrders.map((order) => order.id);
      if (orderIds.length) {
        await db.delete(stockMovements).where(inArray(stockMovements.orderId, orderIds));
        await db.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, orderIds));
        await db.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
        await db.delete(orders).where(inArray(orders.id, orderIds));
      }
      await db.delete(cartItems).where(inArray(cartItems.restaurantId, restaurantIds));
    }
    if (promotionId) await db.delete(promotions).where(eq(promotions.id, promotionId));
    if (riskId) await db.delete(inventoryRiskRecords).where(eq(inventoryRiskRecords.id, riskId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (memberId) await db.delete(members).where(eq(members.id, memberId));
    if (restaurantIds.length) await db.delete(users).where(inArray(users.id, restaurantIds));
    if (supplierId) await db.delete(users).where(eq(users.id, supplierId));
  }
});