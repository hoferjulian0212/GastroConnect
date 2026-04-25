import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProductWithSupplierAndPromotion } from "@shared/schema";

interface VolumeRow {
  productId: string;
  supplierId: string;
  totalQuantity: number;
  orderCount: number;
  lastOrderedAt: string | null;
}
interface OrderItemLite { productId: string; quantity: number; unitPrice: string; }
interface OrderLite { id: string; supplierId: string; status: string; createdAt: string; items?: OrderItemLite[]; }

interface SavingsResult {
  totalMonthlySaving: number;
  switchableCount: number;
  isLoading: boolean;
}

const DAYS_WINDOW = 90;

/**
 * Computes the total potential monthly savings if the restaurant switched
 * every product to its cheapest in-stock alternative. Mirrors the logic in
 * PriceComparison.tsx so the Home KPI tile and the detail page stay in sync.
 *
 * Query keys match PriceComparison so React Query caches are shared.
 */
export function useSavingsPotential(restaurantId: string | undefined): SavingsResult {
  const enabled = !!restaurantId;

  const { data: products, isLoading: productsLoading } = useQuery<ProductWithSupplierAndPromotion[]>({
    queryKey: [`/api/products?restaurantId=${restaurantId}`],
    enabled,
  });
  const { data: customPrices } = useQuery<Array<{ productId: string; supplierId: string; restaurantId: string; customPrice: string }>>({
    queryKey: [`/api/custom-prices?restaurantId=${restaurantId}`],
    enabled,
  });
  const { data: volumesResponse } = useQuery<{ days: number; volumes: VolumeRow[] }>({
    queryKey: [`/api/restaurant/product-volumes?restaurantId=${restaurantId}&days=${DAYS_WINDOW}`],
    enabled,
  });
  const { data: ordersHistory } = useQuery<OrderLite[]>({
    queryKey: [`/api/orders?restaurantId=${restaurantId}`],
    enabled,
  });

  return useMemo<SavingsResult>(() => {
    if (!products) return { totalMonthlySaving: 0, switchableCount: 0, isLoading: productsLoading };

    const customPriceMap = new Map<string, number>();
    customPrices?.forEach(cp => {
      if (cp.restaurantId === restaurantId) customPriceMap.set(cp.productId, parseFloat(cp.customPrice));
    });

    const volumeBySupplier = new Map<string, VolumeRow>();
    volumesResponse?.volumes.forEach(v => volumeBySupplier.set(`${v.productId}__${v.supplierId}`, v));

    const lastOrderedAt = new Map<string, number>();
    ordersHistory?.forEach(order => {
      const ts = new Date(order.createdAt).getTime();
      order.items?.forEach(item => {
        const prev = lastOrderedAt.get(item.productId) ?? 0;
        if (ts > prev) lastOrderedAt.set(item.productId, ts);
      });
    });

    interface Offer { productId: string; supplierId: string; effectivePrice: number; }
    const groups = new Map<string, Offer[]>();
    for (const product of products) {
      if (!product.inStock) continue;
      const key = `${product.name.trim().toLowerCase()}__${product.unit}`;
      const basePrice = parseFloat(product.price);
      const customPrice = customPriceMap.get(product.id);
      let effectivePrice = customPrice ?? basePrice;
      if (product.activePromotion) {
        effectivePrice = effectivePrice * (1 - product.activePromotion.discountPercent / 100);
      }
      const offer: Offer = {
        productId: product.id,
        supplierId: product.supplierId,
        effectivePrice: Math.round(effectivePrice * 100) / 100,
      };
      const arr = groups.get(key);
      if (arr) arr.push(offer);
      else groups.set(key, [offer]);
    }

    let totalMonthlySaving = 0;
    let switchableCount = 0;
    groups.forEach(offers => {
      if (offers.length < 2) return;
      offers.sort((a, b) => a.effectivePrice - b.effectivePrice);
      const cheapest = offers[0];

      let bestVolume = 0;
      let chosen: Offer | null = null;
      for (const o of offers) {
        const v = volumeBySupplier.get(`${o.productId}__${o.supplierId}`)?.totalQuantity ?? 0;
        if (v > bestVolume) { bestVolume = v; chosen = o; }
      }
      if (!chosen) {
        let bestTs = 0;
        for (const o of offers) {
          const ts = lastOrderedAt.get(o.productId) ?? 0;
          if (ts > bestTs) { bestTs = ts; chosen = o; }
        }
      }
      if (!chosen) return;
      if (chosen.productId === cheapest.productId) return;

      const total90d = offers.reduce((s, o) => s + (volumeBySupplier.get(`${o.productId}__${o.supplierId}`)?.totalQuantity ?? 0), 0);
      const monthlyVolume = Math.round((total90d / 3) * 10) / 10;
      if (monthlyVolume <= 0) return;

      const unitDiff = Math.round((chosen.effectivePrice - cheapest.effectivePrice) * 100) / 100;
      if (unitDiff <= 0) return;

      totalMonthlySaving += Math.round(unitDiff * monthlyVolume * 100) / 100;
      switchableCount += 1;
    });

    return {
      totalMonthlySaving: Math.round(totalMonthlySaving * 100) / 100,
      switchableCount,
      isLoading: false,
    };
  }, [products, customPrices, volumesResponse, ordersHistory, restaurantId, productsLoading]);
}
