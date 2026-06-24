import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search as SearchIcon, AlertTriangle, Package } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { InventoryRiskFormDialog } from "@/components/InventoryRiskFormDialog";
import { queryClient } from "@/lib/queryClient";
import type { Product } from "@shared/schema";

export default function WarehouseStock() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [search, setSearch] = useState("");
  const [flagProductId, setFlagProductId] = useState<string | null>(null);

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = [...(products ?? [])];
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (!term) return list;
    return list.filter((p) => p.name.toLowerCase().includes(term));
  }, [products, search]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`] });
  };

  const isLow = (p: Product) =>
    (p.stockQuantity ?? 0) <= (p.lowStockThreshold ?? 0) && (p.lowStockThreshold ?? 0) > 0;

  return (
    <PullToRefreshWrapper onRefresh={refresh}>
      <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
        <HeroPortal>
          <div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-5 md:pb-7 space-y-4" data-testid="warehouse-stock-hero">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">
                {lang === "de" ? "Bestand" : "Magazzino"}
              </h1>
              <p className="text-sm text-white/60 hidden md:block">
                {lang === "de" ? "Produkte ansehen und gefährdeten Bestand melden" : "Visualizza i prodotti e segnala le scorte a rischio"}
              </p>
            </div>
          </div>
        </HeroPortal>

        <div className="px-3 md:px-6 space-y-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("inventoryRisk", "searchProduct")}
              className="pl-9"
              data-testid="input-search-stock"
            />
          </div>

          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 md:p-14">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                  <Package className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="font-semibold" data-testid="text-no-products">
                  {lang === "de" ? "Keine Produkte gefunden" : "Nessun prodotto trovato"}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2" data-testid="list-warehouse-stock">
              {visible.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-border bg-card"
                  data-testid={`card-stock-${p.id}`}
                >
                  <ProductImage src={p.imageUrl} className="h-12 w-12 rounded-xl shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate" data-testid={`text-product-name-${p.id}`}>{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm text-muted-foreground tabular-nums" data-testid={`text-stock-${p.id}`}>
                        {p.stockQuantity ?? 0} {p.unit}
                      </span>
                      {isLow(p) && (
                        <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[11px]">
                          {lang === "de" ? "Niedrig" : "Basso"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setFlagProductId(p.id)}
                    className="shrink-0 bg-white text-black hover:bg-white/90 border border-black/10 shadow-sm"
                    data-testid={`button-flag-${p.id}`}
                  >
                    <AlertTriangle className="h-4 w-4 mr-1.5" />
                    {t("inventoryRisk", "reportRisk")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <InventoryRiskFormDialog
        open={!!flagProductId}
        onOpenChange={(open) => { if (!open) setFlagProductId(null); }}
        products={products ?? []}
        defaultProductId={flagProductId ?? undefined}
      />
    </PullToRefreshWrapper>
  );
}
