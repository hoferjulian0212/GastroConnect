import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { roleLabel } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, AlertTriangle, Package, ArrowRight, Send, Boxes, CheckCircle2,
} from "lucide-react";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { OffeneRisikenWidget } from "@/components/SupplierDashboardWidgets";
import { InventoryRiskWizard } from "@/components/InventoryRiskWizard";
import { queryClient } from "@/lib/queryClient";
import type { Product } from "@shared/schema";

export default function WarehouseHome() {
  const { currentUser, currentMember } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [formOpen, setFormOpen] = useState(false);

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: openCount, isLoading: countLoading } = useQuery<{ count: number }>({
    queryKey: ["/api/inventory-risks/open-count"],
    queryFn: async () => {
      const r = await fetch("/api/inventory-risks/open-count");
      if (!r.ok) throw new Error("fail");
      return r.json();
    },
    enabled: !!currentUser?.id,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-risks"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-risks/open-count"] }),
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`] }),
    ]);
  };

  const greeting = currentUser?.companyName || "";
  const roleName = currentMember ? roleLabel(currentMember.role, lang) : "";
  const productCount = products?.length ?? 0;
  const risksOpen = openCount?.count ?? 0;

  const stats: Array<{
    key: string;
    label: string;
    value: number;
    loading: boolean;
    icon: typeof Package;
    href: string;
    tone: string;
    iconTone: string;
  }> = [
    {
      key: "open-risks",
      label: lang === "de" ? "Offene Risiken" : "Rischi aperti",
      value: risksOpen,
      loading: countLoading,
      icon: AlertTriangle,
      href: "/supplier/inventory-risk",
      tone: "bg-amber-100 dark:bg-amber-900/30",
      iconTone: "text-amber-600 dark:text-amber-400",
    },
    {
      key: "products",
      label: lang === "de" ? "Produkte im Bestand" : "Prodotti a magazzino",
      value: productCount,
      loading: productsLoading,
      icon: Boxes,
      href: "/supplier/inventory",
      tone: "bg-primary/10",
      iconTone: "text-primary",
    },
  ];

  const quickLinks = [
    {
      key: "risks",
      title: t("inventoryRisk", "navLabel"),
      desc: t("inventoryRisk", "title"),
      href: "/supplier/inventory-risk",
      icon: AlertTriangle,
      tone: "bg-amber-100 dark:bg-amber-900/30",
      iconTone: "text-amber-600 dark:text-amber-400",
      testId: "link-warehouse-risks",
    },
    {
      key: "stock",
      title: lang === "de" ? "Bestand" : "Magazzino",
      desc: lang === "de" ? "Produkte ansehen & melden" : "Visualizza prodotti e segnala",
      href: "/supplier/inventory",
      icon: Package,
      tone: "bg-primary/10",
      iconTone: "text-primary",
      testId: "link-warehouse-stock",
    },
    {
      key: "team-chat",
      title: lang === "de" ? "Interner Chat" : "Chat interno",
      desc: lang === "de" ? "Büro & Fahrer erreichen" : "Contatta ufficio e autisti",
      href: "/supplier/team-chat",
      icon: Send,
      tone: "bg-sky-100 dark:bg-sky-900/30",
      iconTone: "text-sky-600 dark:text-sky-400",
      testId: "link-warehouse-team-chat",
    },
  ];

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
              className="w-full md:w-auto h-14 text-base font-semibold border-0 bg-white text-black hover:bg-white/90 dark:bg-white dark:text-black dark:hover:bg-white/90 shadow-sm"
              data-testid="button-report-risk"
            >
              <Plus className="h-5 w-5 mr-2" />
              {t("inventoryRisk", "reportRisk")}
            </Button>
          </div>
        </HeroPortal>

        <div className="px-3 md:px-6 space-y-4 md:space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 max-w-2xl" data-testid="warehouse-kpi-row">
            {stats.map((s) => (
              <Link key={s.key} href={s.href} data-testid={`kpi-${s.key}`}>
                <div className="p-4 rounded-2xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all active:scale-[0.99] space-y-2">
                  <div className={`h-9 w-9 rounded-xl ${s.tone} flex items-center justify-center`}>
                    <s.icon className={`h-4.5 w-4.5 h-5 w-5 ${s.iconTone}`} />
                  </div>
                  {s.loading ? (
                    <Skeleton className="h-7 w-12 rounded-md" />
                  ) : (
                    <p className="text-2xl font-bold tabular-nums leading-none" data-testid={`kpi-${s.key}-value`}>
                      {s.value}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* All-clear banner when nothing is at risk */}
          {!countLoading && risksOpen === 0 && (
            <div
              className="flex items-center gap-3 p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 max-w-2xl"
              data-testid="warehouse-all-clear"
            >
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                {lang === "de"
                  ? "Aktuell keine offenen Bestandsrisiken – alles im grünen Bereich."
                  : "Nessun rischio di magazzino aperto al momento: tutto in ordine."}
              </p>
            </div>
          )}

          {/* Quick links */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
            {quickLinks.map((q) => (
              <Link key={q.key} href={q.href} data-testid={q.testId}>
                <div className="flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all active:scale-[0.99]">
                  <div className={`h-11 w-11 rounded-xl ${q.tone} flex items-center justify-center shrink-0`}>
                    <q.icon className={`h-5 w-5 ${q.iconTone}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{q.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{q.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}
          </div>

          {currentUser?.id && (
            <div className="max-w-2xl">
              <OffeneRisikenWidget supplierId={currentUser.id} lang={lang} />
            </div>
          )}
        </div>
      </div>

      <InventoryRiskWizard
        open={formOpen}
        onOpenChange={setFormOpen}
        products={products ?? []}
      />
    </PullToRefreshWrapper>
  );
}
