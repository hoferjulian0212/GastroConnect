import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Warehouse } from "lucide-react";
import type { Product } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { InventoryView } from "./Products";

export default function SupplierInventory() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const lowStockCount = (products ?? []).filter(p => p.lowStockThreshold && p.lowStockThreshold > 0 && (p.stockQuantity ?? 0) <= p.lowStockThreshold && (p.stockQuantity ?? 0) > 0).length;
  const outOfStockCount = (products ?? []).filter(p => (p.stockQuantity ?? 0) === 0).length;

  return (
    <PullToRefreshWrapper
      onRefresh={async () => {
        await queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === "string" && (key.startsWith("/api/supplier/products") || key.startsWith("/api/low-stock") || key.startsWith("/api/stock-movements"));
          },
        });
      }}
      className="space-y-4 md:space-y-6"
    >
      <div className="dark bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 rounded-b-3xl space-y-4" data-testid="inventory-hero">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">{t("supplierProducts", "stockManagement")}</h1>
            <p className="hidden md:block text-sm text-white/50 mt-1">{t("supplierProducts", "manageStock")}</p>
          </div>
        </div>

        <div className="grid gap-2 md:gap-3 grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.07] p-2.5 md:p-3">
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold text-white" data-testid="text-total-products">{products?.length ?? 0}</div>
              <p className="text-[10px] md:text-xs text-white/50">{lang === "de" ? "Produkte" : "Prodotti"}</p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] p-2.5 md:p-3">
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold text-orange-400" data-testid="text-low-stock">{lowStockCount}</div>
              <p className="text-[10px] md:text-xs text-white/50">{lang === "de" ? "Niedrig" : "Scorta bassa"}</p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] p-2.5 md:p-3">
            <div className="text-center">
              <div className="text-xl md:text-2xl font-bold text-red-400" data-testid="text-out-of-stock">{outOfStockCount}</div>
              <p className="text-[10px] md:text-xs text-white/50">{lang === "de" ? "Ausverkauft" : "Esaurito"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 md:px-6">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : products && products.length > 0 ? (
          <InventoryView products={products} lang={lang} t={t} />
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Warehouse className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("supplierProducts", "noProducts")}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </PullToRefreshWrapper>
  );
}
