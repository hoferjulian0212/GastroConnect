import type { Promotion, RescuePromotionLifecycle } from "@shared/schema";

export function getRescuePromotionState(
  promo: Promotion,
  now = new Date(),
): { availableQuantity: number | null; lifecycle: RescuePromotionLifecycle | null } {
  if (promo.promotionType !== "rescue") {
    return { availableQuantity: null, lifecycle: null };
  }

  const availableQuantity = Math.max(
    0,
    (promo.quantityCap ?? 0) - promo.rescueReservedQuantity - promo.rescueSoldQuantity,
  );
  const lifecycle: RescuePromotionLifecycle = !promo.isActive
    ? "deactivated"
    : promo.endDate.getTime() < now.getTime()
      ? "expired"
      : promo.startDate.getTime() > now.getTime()
        ? "scheduled"
        : availableQuantity <= 0
          ? "sold_out"
          : "active";

  return { availableQuantity, lifecycle };
}

export function getRescueAllocationTarget(input: {
  status: string;
  previousStatus: string;
  itemQuantity: number;
  confirmedQuantity?: number;
  currentReserved: number;
  currentSold: number;
}): { reserved: number; sold: number } | null {
  if (input.status === "confirmed" || input.status === "partially_confirmed") {
    const sold = input.confirmedQuantity ?? input.itemQuantity;
    return {
      reserved: 0,
      sold: Math.max(0, Math.min(input.itemQuantity, sold)),
    };
  }

  if (input.status === "cancelled" && input.previousStatus !== "delivered") {
    return { reserved: 0, sold: 0 };
  }

  return null;
}

export function wouldIntroduceRescuePromotion(
  existingProductIds: Iterable<string>,
  requestedProductIds: Iterable<string>,
  promotionTypesByProduct: ReadonlyMap<string, string>,
): boolean {
  const existing = new Set(existingProductIds);
  for (const productId of requestedProductIds) {
    if (!existing.has(productId) && promotionTypesByProduct.get(productId) === "rescue") {
      return true;
    }
  }
  return false;
}