import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { roleLabel } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle, Package, ArrowRight } from "lucide-react";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { OffeneRisikenWidget } from "@/components/SupplierDashboardWidgets";
import { InventoryRiskFormDialog } from "@/components/InventoryRiskFormDialog";
import { queryClient } from "@/lib/queryClient";
import type { Product } from "@shared/schema";

export default function WarehouseHome() {
  const { currentUser, currentMember } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [formOpen, setFormOpen] = useState(false);

  const { data: products } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/inventory-risks"] });
  };

  const greeting = currentUser?.companyName || "";
  const roleName = currentMember ? roleLabel(currentMember.role, lang) : "";

  return (
    <PullToRefreshWrapper onRefresh={refresh}>
      <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
        <HeroPortal>
          <div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-5 md:pb-7 space-y-4" data-testid="warehouse-home-hero">
            <div className="space-y-1">
              {roleName && (
                <p className="text-xs md:text-sm font-medium text-white/50" data-testid="text-warehouse-role">
                  {roleName}
                </p>
              )}
              <h1 className="text-2xl md:text-4xl font-bold text-white truncate" data-testid="text-page-title">
                {greeting}
              </h1>
              <p className="text-sm text-white/60">
                {lang === "de"
                  ? "Erfassen Sie gefährdeten Bestand, damit er rechtzeitig vermarktet werden kann."
                  : "Registra le scorte a rischio per commercializzarle in tempo."}
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => setFormOpen(true)}
              className="w-full md:w-auto h-14 text-base font-semibold bg-white text-black hover:bg-white/90 shadow-sm"
              data-testid="button-report-risk"
            >
              <Plus className="h-5 w-5 mr-2" />
              {t("inventoryRisk", "reportRisk")}
            </Button>
          </div>
        </HeroPortal>

        <div className="px-3 md:px-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/supplier/inventory-risk" data-testid="link-warehouse-risks">
              <div className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all active:scale-[0.99]">
                <div className="h-11 w-11 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{t("inventoryRisk", "navLabel")}</p>
                  <p className="text-xs text-muted-foreground truncate">{t("inventoryRisk", "title")}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
            <Link href="/supplier/inventory" data-testid="link-warehouse-stock">
              <div className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all active:scale-[0.99]">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{lang === "de" ? "Bestand" : "Magazzino"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {lang === "de" ? "Produkte ansehen & melden" : "Visualizza prodotti e segnala"}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          </div>

          {currentUser?.id && (
            <div className="max-w-2xl">
              <OffeneRisikenWidget supplierId={currentUser.id} lang={lang} />
            </div>
          )}
        </div>
      </div>

      <InventoryRiskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        products={products ?? []}
      />
    </PullToRefreshWrapper>
  );
}
