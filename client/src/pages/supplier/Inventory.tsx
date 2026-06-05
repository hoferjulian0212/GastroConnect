import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeroPortal } from "@/context/HeroContext";
import { SectionTabs } from "@/components/SectionTabs";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Warehouse, Database, Clock, AlertCircle, Link2, RefreshCw, ShieldCheck, KeyRound } from "lucide-react";
import type { Product, SupplierErpConnection, ErpProvider, ErpCredentialPublicMeta, ErpCredentialType } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { InventoryView } from "./Products";
import { ConnectErpDialog } from "@/components/ConnectErpDialog";
import { ErpCredentialsDialog } from "@/components/ErpCredentialsDialog";

export default function SupplierInventory() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const [showErpDialog, setShowErpDialog] = useState(false);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);

  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: erpData } = useQuery<{
    connection: (SupplierErpConnection & { provider: ErpProvider | null }) | null;
    credentials: ErpCredentialPublicMeta | null;
  }>({
    queryKey: [`/api/supplier/erp/connection?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const erpConn = erpData?.connection ?? null;
  const erpCredentials = erpData?.credentials ?? null;
  const credentialDefaultType: ErpCredentialType =
    erpConn?.connectionMethod === "excel_email" ? "excel_email" : "api";
  const erpStatus = erpConn?.status;
  const erpActive = erpStatus === "active";
  const erpPending = erpStatus === "pending";
  const erpError = erpStatus === "error";
  const erpProviderName = erpConn?.provider?.name;

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
      className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0"
    >
      <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-4" data-testid="inventory-hero"><SectionTabs />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">{t("supplierProducts", "stockManagement")}</h1>
            <p className="text-sm text-white/50 mt-1">{t("supplierProducts", "manageStock")}</p>
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
      </div></HeroPortal>

      <div className="px-3 md:px-6 space-y-4 md:space-y-6">
        <Card data-testid="card-connect-erp">
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 md:p-6">
            <div className={`flex items-center justify-center w-12 h-12 rounded-full shrink-0 ${
              erpError
                ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                : erpPending
                ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                : erpActive
                ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
                : "bg-primary/10 text-primary"
            }`}>
              {erpError ? <AlertCircle className="w-6 h-6" /> : erpPending ? <Clock className="w-6 h-6" /> : <Database className="w-6 h-6" />}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-base md:text-lg font-bold" data-testid="text-erp-headline">
                {erpError
                  ? t("supplierErp", "erpErrorHeadline")
                  : erpPending
                  ? t("supplierErp", "erpPendingHeadline")
                  : erpActive
                  ? t("supplierErp", "erpActiveHeadline")
                  : t("supplierErp", "erpFirstHeadline")}
              </h2>
              <p className="text-muted-foreground text-sm mt-1" data-testid="text-erp-desc">
                {erpError
                  ? t("supplierErp", "erpErrorHeadlineDesc")
                  : erpPending
                  ? t("supplierErp", "erpPendingHeadlineDesc")
                  : erpActive
                  ? t("supplierErp", "erpActiveHeadlineDesc")
                  : t("supplierErp", "erpFirstDesc")}
              </p>

              {erpConn && (erpProviderName || erpConn.lastSyncAt) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-2">
                  {erpProviderName && (
                    <span className="flex items-center gap-1.5 font-medium" data-testid="text-erp-provider">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      {erpProviderName}
                    </span>
                  )}
                  {erpConn.lastSyncAt && (
                    <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="text-erp-last-sync">
                      <RefreshCw className="w-3.5 h-3.5" />
                      {t("supplierErp", "lastSync")}: {new Date(erpConn.lastSyncAt).toLocaleDateString(lang === "de" ? "de-DE" : "it-IT")}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 shrink-0">
              <Button
                onClick={() => setShowErpDialog(true)}
                disabled={erpActive}
                data-testid="button-connect-erp"
              >
                <Database className="w-4 h-4 mr-2" />
                {erpPending
                  ? t("supplierErp", "manageErp")
                  : erpActive
                  ? t("supplierErp", "erpStatusActive")
                  : t("supplierErp", "connectErp")}
              </Button>
              {erpConn && (erpPending || erpActive) && (
                <Button
                  variant={erpCredentials ? "outline" : "secondary"}
                  onClick={() => setShowCredentialsDialog(true)}
                  data-testid="button-erp-credentials"
                >
                  {erpCredentials ? (
                    <ShieldCheck className="w-4 h-4 mr-2 text-green-600 dark:text-green-400" />
                  ) : (
                    <KeyRound className="w-4 h-4 mr-2" />
                  )}
                  {erpCredentials
                    ? t("supplierErp", "erpCredentialsUpdate")
                    : t("supplierErp", "erpCredentialsButton")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

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

      {currentUser?.id && (
        <ConnectErpDialog
          open={showErpDialog}
          onOpenChange={setShowErpDialog}
          supplierId={currentUser.id}
        />
      )}

      {currentUser?.id && (
        <ErpCredentialsDialog
          open={showCredentialsDialog}
          onOpenChange={setShowCredentialsDialog}
          supplierId={currentUser.id}
          defaultType={credentialDefaultType}
          existingMeta={erpCredentials}
        />
      )}
    </PullToRefreshWrapper>
  );
}
