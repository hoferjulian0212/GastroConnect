import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AlertCircle, Truck, Users, Tag, Clock, ArrowRight, TrendingUp, ClipboardList, UserX, AlertTriangle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ProductImage } from "@/components/ProductImage";
import { useT } from "@/lib/translations";
import type { ComplaintWithDetails, OrderWithDetails, InventoryRiskRecordWithDetails } from "@shared/schema";

const CARD_BASE = "h-full md:rounded-xl md:border md:border-border md:bg-card md:shadow-[0_1px_2px_rgba(15,23,42,0.03),0_6px_16px_-8px_rgba(15,23,42,0.08),0_16px_28px_-20px_rgba(15,23,42,0.10)]";
const HEADER = "flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4";
const BODY = "md:px-5 md:pb-5";

function WidgetTitle({ icon, title, desc, testId }: { icon: React.ReactNode; title: string; desc?: string; testId: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted/60 shrink-0">{icon}</div>
      <div className="min-w-0">
        <h2 className="text-base md:text-lg font-bold leading-tight truncate" data-testid={testId}>{title}</h2>
        {desc ? <p className="text-xs text-muted-foreground hidden md:block truncate">{desc}</p> : null}
      </div>
    </div>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">{icon}</div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

// ───────────────────────── Offene Reklamationen ─────────────────────────
export function OffeneReklamationenWidget({ supplierId, lang }: { supplierId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<{ openComplaints: ComplaintWithDetails[] }>({
    queryKey: ['/api/supplier/action-required', supplierId],
    queryFn: async () => {
      const r = await fetch(`/api/supplier/action-required?supplierId=${supplierId}`);
      if (!r.ok) throw new Error("fail");
      return r.json();
    },
    enabled: !!supplierId,
  });
  const allOpen = data?.openComplaints || [];
  const complaints = allOpen.slice(0, 3);
  const totalOpen = allOpen.length;
  return (
    <div className={CARD_BASE} data-testid="widget-offene-reklamationen">
      <div className={HEADER}>
        <WidgetTitle
          icon={<AlertCircle className="h-4 w-4 text-rose-500" />}
          title={t("supplierHome", "widgetOpenComplaints")}
          desc={t("supplierHome", "widgetOpenComplaintsDesc")}
          testId="text-widget-offene-reklamationen-title"
        />
        <div className="flex items-center gap-2 shrink-0">
          {totalOpen > 0 && (
            <Badge variant="outline" className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 text-[11px] tabular-nums" data-testid="badge-open-complaints-count">
              {totalOpen}
            </Badge>
          )}
          <Link href="/supplier/complaints" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" data-testid="link-widget-complaints-all">
            {t("common", "all")}<ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : complaints.length === 0 ? (
          <EmptyState icon={<AlertCircle className="h-6 w-6 text-muted-foreground/40" />} label={t("supplierHome", "noOpenComplaints")} />
        ) : (
          <div className="space-y-2">
            {complaints.map((c: any) => {
              const restName = c.restaurant?.companyName || c.restaurant?.name || "—";
              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/supplier/complaints/${c.id}`)}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20 cursor-pointer transition-all active:scale-[0.99]"
                  data-testid={`widget-complaint-row-${c.id}`}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={c.restaurant?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-[10px] font-semibold">{restName.substring(0,2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{restName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.title || c.description || ""}</p>
                  </div>
                  <Badge variant="outline" className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 text-[10px] shrink-0 capitalize">
                    {c.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Heute zu liefern ─────────────────────────
export function HeuteZuLiefernWidget({ supplierId, lang }: { supplierId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/supplier/upcoming-deliveries', supplierId],
    queryFn: async () => {
      const r = await fetch(`/api/supplier/upcoming-deliveries?supplierId=${supplierId}`);
      if (!r.ok) throw new Error("fail");
      return r.json();
    },
    enabled: !!supplierId,
  });
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const today = (data || []).filter(o => o.requestedDeliveryDate === todayStr).slice(0, 5);
  return (
    <div className={CARD_BASE} data-testid="widget-heute-zu-liefern">
      <div className={HEADER}>
        <WidgetTitle
          icon={<Truck className="h-4 w-4 text-purple-500" />}
          title={t("supplierHome", "widgetTodayDeliveries")}
          desc={t("supplierHome", "widgetTodayDeliveriesDesc")}
          testId="text-widget-heute-zu-liefern-title"
        />
        <Link href="/supplier/orders?status=in_delivery" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-today-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        ) : today.length === 0 ? (
          <EmptyState icon={<Truck className="h-6 w-6 text-muted-foreground/40" />} label={t("supplierHome", "noTodayDeliveries")} />
        ) : (
          <div className="space-y-2">
            {today.map(o => {
              const restName = o.restaurant?.companyName || o.restaurant?.name || "—";
              return (
                <div
                  key={o.id}
                  onClick={() => navigate(`/supplier/orders/${o.id}`)}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all active:scale-[0.99]"
                  data-testid={`widget-today-row-${o.id}`}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={o.restaurant?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-[10px] font-semibold">{restName.substring(0,2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{restName}</p>
                    <p className="text-[11px] text-muted-foreground">{o.items?.length || 0} {lang === "de" ? "Artikel" : "articoli"}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0">{parseFloat(o.totalAmount as any).toFixed(2)}€</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Top-Kunden (30d) ─────────────────────────
export function TopKunden30dWidget({ supplierId, lang }: { supplierId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<{ topCustomers: { restaurantId: string; name: string; orders: number; revenue: number }[] }>({
    queryKey: [`/api/supplier/detailed-stats?supplierId=${supplierId}&period=30d`],
    enabled: !!supplierId,
  });
  const customers = (data?.topCustomers || []).slice(0, 5);
  return (
    <div className={CARD_BASE} data-testid="widget-top-kunden">
      <div className={HEADER}>
        <WidgetTitle
          icon={<Users className="h-4 w-4 text-emerald-500" />}
          title={t("supplierHome", "widgetTopCustomers")}
          desc={t("supplierHome", "widgetTopCustomersDesc")}
          testId="text-widget-top-kunden-title"
        />
        <Link href="/supplier/restaurants" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-customers-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}</div>
        ) : customers.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6 text-muted-foreground/40" />} label={t("supplierHome", "noStatsYet")} />
        ) : (
          <div className="space-y-1.5">
            {customers.map((c, i) => (
              <div
                key={c.restaurantId}
                onClick={() => navigate(`/supplier/restaurants`)}
                className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-muted/40 cursor-pointer transition-all"
                data-testid={`widget-customer-row-${c.restaurantId}`}
              >
                <div className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-xs font-semibold shrink-0">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.orders} {t("supplierHome", "orderCount")}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{Math.round(Number(c.revenue)).toLocaleString(lang === "de" ? "de-DE" : "it-IT")}€</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Promo-Performance ─────────────────────────
type PromoPerf = {
  promotionId: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  unit: string;
  discountPercent: number;
  unitsSold: number;
  revenue: number;
  orderCount: number;
};
export function PromoPerformanceWidget({ supplierId, lang }: { supplierId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<PromoPerf[]>({
    queryKey: ['/api/supplier/promo-performance', supplierId],
    queryFn: async () => {
      const r = await fetch(`/api/supplier/promo-performance?supplierId=${supplierId}`);
      if (!r.ok) throw new Error("fail");
      return r.json();
    },
    enabled: !!supplierId,
  });
  const promos = (data || []).slice(0, 4);
  return (
    <div className={CARD_BASE} data-testid="widget-promo-performance">
      <div className={HEADER}>
        <WidgetTitle
          icon={<Tag className="h-4 w-4 text-amber-500" />}
          title={t("supplierHome", "widgetPromoPerformance")}
          desc={t("supplierHome", "widgetPromoPerformanceDesc")}
          testId="text-widget-promo-performance-title"
        />
        <Link href="/supplier/promotions" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-promo-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        ) : promos.length === 0 ? (
          <EmptyState icon={<Tag className="h-6 w-6 text-muted-foreground/40" />} label={t("supplierHome", "noActivePromos")} />
        ) : (
          <div className="space-y-2">
            {promos.map(p => (
              <div
                key={p.promotionId}
                onClick={() => navigate("/supplier/promotions")}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20 cursor-pointer transition-all active:scale-[0.99]"
                data-testid={`widget-promo-row-${p.promotionId}`}
              >
                <ProductImage src={p.productImageUrl} className="h-9 w-9 rounded-lg" iconClassName="h-4 w-4" fallbackBg="bg-amber-100 dark:bg-amber-900/30" fallbackIconColor="text-amber-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-medium truncate">{p.productName}</p>
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[9px] px-1 shrink-0">-{p.discountPercent}%</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{p.unitsSold} {p.unit} · {p.orderCount} {t("supplierHome", "orderCount")}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{Math.round(p.revenue).toLocaleString(lang === "de" ? "de-DE" : "it-IT")}€</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Antwortzeit ─────────────────────────
function formatDuration(seconds: number, lang: "de" | "it") {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} ${lang === "de" ? "Min" : "min"}`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}${lang === "de" ? "h" : "h"} ${m}${lang === "de" ? "m" : "m"}` : `${h}${lang === "de" ? "h" : "h"}`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.round((seconds % 86400) / 3600);
  return h > 0 ? `${d}${lang === "de" ? "d" : "g"} ${h}h` : `${d}${lang === "de" ? "d" : "g"}`;
}
export function AntwortzeitWidget({ supplierId, lang }: { supplierId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const { data, isLoading } = useQuery<{ avgSeconds: number | null; sampleCount: number; conversationCount: number }>({
    queryKey: ['/api/supplier/response-time', supplierId],
    queryFn: async () => {
      const r = await fetch(`/api/supplier/response-time?supplierId=${supplierId}`);
      if (!r.ok) throw new Error("fail");
      return r.json();
    },
    enabled: !!supplierId,
  });
  const sample = data?.sampleCount ?? 0;
  const avg = data?.avgSeconds;
  return (
    <div className={CARD_BASE} data-testid="widget-antwortzeit">
      <div className={HEADER}>
        <WidgetTitle
          icon={<Clock className="h-4 w-4 text-primary" />}
          title={t("supplierHome", "widgetResponseTime")}
          desc={t("supplierHome", "widgetResponseTimeDesc")}
          testId="text-widget-antwortzeit-title"
        />
        <Link href="/supplier/inbox" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-antwortzeit-inbox">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : avg === null || avg === undefined ? (
          <EmptyState icon={<Clock className="h-6 w-6 text-muted-foreground/40" />} label={t("supplierHome", "noResponseDataYet")} />
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{t("supplierHome", "avgResponse")}</p>
            <p className="text-3xl md:text-4xl font-bold tabular-nums mt-1" data-testid="text-avg-response-time">{formatDuration(avg, lang)}</p>
            <p className="text-[11px] text-muted-foreground mt-2">{t("supplierHome", "basedOnReplies").replace("{n}", String(sample))}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── shared helpers (revenue trend / status rows) ─────────────────────────
const MONTH_NAMES_S: Record<"de" | "it", string[]> = {
  de: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
  it: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"],
};
function formatMonthLabelS(month: string, lang: "de" | "it"): string {
  const parts = month.split("-");
  const idx = parseInt(parts[1] ?? "1", 10) - 1;
  return MONTH_NAMES_S[lang][idx] ?? month;
}
function eurS(value: number, lang: "de" | "it"): string {
  return `${Math.round(value).toLocaleString(lang === "de" ? "de-DE" : "it-IT")}€`;
}
const SUPPLIER_ORDER_STATUSES = ["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"] as const;
const SUPPLIER_ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  partially_confirmed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  in_delivery: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

type SupplierDetailedStats = {
  monthlyRevenue: { month: string; revenue: number }[];
  topProducts: { productId: string; name: string; quantity: number; revenue: number; previousQuantity: number }[];
  ordersByStatus: { status: string; count: number }[];
};

// ───────────────────────── Steigende Nachfrage ─────────────────────────
export function SteigendeNachfrageWidget({ supplierId, lang }: { supplierId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const { data, isLoading } = useQuery<SupplierDetailedStats>({
    queryKey: [`/api/supplier/detailed-stats?supplierId=${supplierId}&period=6m`],
    enabled: !!supplierId,
  });
  const rising = (data?.topProducts || [])
    .filter(p => p.quantity > (p.previousQuantity ?? 0))
    .sort((a, b) => (b.quantity - (b.previousQuantity ?? 0)) - (a.quantity - (a.previousQuantity ?? 0)))
    .slice(0, 5);
  return (
    <div className={CARD_BASE} data-testid="widget-steigende-nachfrage">
      <div className={HEADER}>
        <WidgetTitle
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          title={t("supplierHome", "widgetRisingDemand")}
          desc={t("supplierHome", "widgetRisingDemandDesc")}
          testId="text-widget-steigende-nachfrage-title"
        />
        <Link href="/supplier/products" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-steigende-nachfrage-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}</div>
        ) : rising.length === 0 ? (
          <EmptyState icon={<TrendingUp className="h-6 w-6 text-muted-foreground/40" />} label={t("supplierHome", "noStatsYet")} />
        ) : (
          <div className="space-y-1.5">
            {rising.map(p => {
              const prev = p.previousQuantity ?? 0;
              const delta = p.quantity - prev;
              const pct = prev > 0 ? Math.round((delta / prev) * 100) : null;
              const deltaLabel = pct !== null ? `+${pct}%` : `+${delta}`;
              return (
                <div
                  key={p.productId}
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-muted/40 transition-all"
                  data-testid={`widget-rising-row-${p.productId}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">{p.quantity} {lang === "de" ? "Stk" : "pz"}</p>
                  </div>
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[11px] tabular-nums shrink-0">{deltaLabel}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Inaktive Restaurants ─────────────────────────
type InactiveRestaurant = { restaurantId: string; name: string; profileImageUrl: string | null; lastOrderAt: string | null; daysSince: number };
export function InaktiveRestaurantsWidget({ supplierId, lang }: { supplierId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<InactiveRestaurant[]>({
    queryKey: [`/api/supplier/inactive-restaurants?supplierId=${supplierId}`],
    enabled: !!supplierId,
  });
  const items = (data || []).slice(0, 5);
  return (
    <div className={CARD_BASE} data-testid="widget-inaktive-restaurants">
      <div className={HEADER}>
        <WidgetTitle
          icon={<UserX className="h-4 w-4 text-amber-500" />}
          title={t("supplierHome", "widgetInactiveRestaurants")}
          desc={t("supplierHome", "widgetInactiveRestaurantsDesc")}
          testId="text-widget-inaktive-restaurants-title"
        />
        <Link href="/supplier/restaurants" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-inaktive-restaurants-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState icon={<UserX className="h-6 w-6 text-muted-foreground/40" />} label={t("supplierHome", "widgetNoInactiveRestaurants")} />
        ) : (
          <div className="space-y-2">
            {items.map(r => (
              <div
                key={r.restaurantId}
                onClick={() => navigate("/supplier/restaurants")}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all active:scale-[0.99]"
                data-testid={`widget-inactive-row-${r.restaurantId}`}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={r.profileImageUrl || undefined} />
                  <AvatarFallback className="text-[10px] font-semibold">{(r.name || "—").substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">{lang === "de" ? `vor ${r.daysSince} Tagen` : `${r.daysSince} giorni fa`}</p>
                </div>
                <Clock className="h-4 w-4 text-amber-500 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Umsatz-Trend ─────────────────────────
export function UmsatzTrendWidget({ supplierId, lang }: { supplierId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const { data, isLoading } = useQuery<SupplierDetailedStats>({
    queryKey: [`/api/supplier/detailed-stats?supplierId=${supplierId}&period=6m`],
    enabled: !!supplierId,
  });
  const monthly = data?.monthlyRevenue || [];
  const chartData = monthly.map(m => ({ label: formatMonthLabelS(m.month, lang), revenue: m.revenue }));
  const allZero = chartData.length === 0 || chartData.every(d => !d.revenue);
  return (
    <div className={CARD_BASE} data-testid="widget-umsatz-trend">
      <div className={HEADER}>
        <WidgetTitle
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          title={t("supplierHome", "widgetRevenueTrend")}
          desc={t("supplierHome", "widgetRevenueTrendDesc")}
          testId="text-widget-umsatz-trend-title"
        />
      </div>
      <div className={BODY}>
        {isLoading ? (
          <Skeleton className="h-44 w-full rounded-xl" />
        ) : allZero ? (
          <EmptyState icon={<TrendingUp className="h-6 w-6 text-muted-foreground/40" />} label={t("supplierHome", "noStatsYet")} />
        ) : (
          <div className="h-44 md:h-52" data-testid="chart-umsatz-trend">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44}
                  tickFormatter={(v) => v >= 1_000 ? `${(v / 1_000).toFixed(0)}k€` : `${v}€`} />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  isAnimationActive={false}
                  formatter={(v: any) => [eurS(Number(v), lang), t("supplierHome", "widgetRevenueTrend")]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Bestellungen-Status (Supplier) ─────────────────────────
export function SBestellungenStatusWidget({ supplierId, lang }: { supplierId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const { data, isLoading } = useQuery<SupplierDetailedStats>({
    queryKey: [`/api/supplier/detailed-stats?supplierId=${supplierId}&period=6m`],
    enabled: !!supplierId,
  });
  const counts: Record<string, number> = {};
  for (const o of data?.ordersByStatus || []) counts[o.status] = (counts[o.status] || 0) + o.count;
  const rows = SUPPLIER_ORDER_STATUSES.filter(s => (counts[s] || 0) > 0);
  return (
    <div className={CARD_BASE} data-testid="widget-s-bestellungen-status">
      <div className={HEADER}>
        <WidgetTitle
          icon={<ClipboardList className="h-4 w-4 text-primary" />}
          title={t("supplierHome", "widgetOrdersStatus")}
          desc={t("supplierHome", "widgetOrdersStatusDesc")}
          testId="text-widget-s-bestellungen-status-title"
        />
        <Link href="/supplier/orders" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-s-bestellungen-status-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-6 w-6 text-muted-foreground/40" />} label={t("supplierHome", "noStatsYet")} />
        ) : (
          <div className="space-y-1.5">
            {rows.map(s => (
              <div
                key={s}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border bg-card"
                data-testid={`widget-s-order-status-${s}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center justify-center h-2.5 w-2.5 rounded-full ${SUPPLIER_ORDER_STATUS_COLORS[s]}`} />
                  <span className="text-sm font-medium truncate">{t("supplierHome", `orderStatus_${s}`)}</span>
                </div>
                <Badge variant="outline" className={`${SUPPLIER_ORDER_STATUS_COLORS[s]} text-[11px] tabular-nums shrink-0`}>{counts[s]}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function OffeneRisikenWidget({ supplierId, lang }: { supplierId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<InventoryRiskRecordWithDetails[]>({
    queryKey: ["/api/inventory-risks", "status=Open"],
    queryFn: async () => {
      const r = await fetch("/api/inventory-risks?status=Open");
      if (!r.ok) throw new Error("fail");
      return r.json();
    },
    enabled: !!supplierId,
  });
  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/inventory-risks/open-count"],
    queryFn: async () => {
      const r = await fetch("/api/inventory-risks/open-count");
      if (!r.ok) throw new Error("fail");
      return r.json();
    },
    enabled: !!supplierId,
  });
  const all = data || [];
  const records = all.slice(0, 3);
  const total = countData?.count ?? all.length;
  return (
    <div className={CARD_BASE} data-testid="widget-offene-risiken">
      <div className={HEADER}>
        <WidgetTitle
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          title={t("supplierHome", "widgetOpenRisks")}
          desc={t("supplierHome", "widgetOpenRisksDesc")}
          testId="text-widget-offene-risiken-title"
        />
        <div className="flex items-center gap-2 shrink-0">
          {total > 0 && (
            <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[11px] tabular-nums" data-testid="badge-open-risks-count">
              {total}
            </Badge>
          )}
          <Link href="/supplier/inventory-risk" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" data-testid="link-widget-risks-all">
            {t("common", "all")}<ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : records.length === 0 ? (
          <EmptyState icon={<AlertTriangle className="h-6 w-6 text-muted-foreground/40" />} label={t("inventoryRisk", "noRisks")} />
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <div
                key={r.id}
                onClick={() => navigate("/supplier/inventory-risk")}
                className="flex items-center gap-2.5 p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20 cursor-pointer transition-all active:scale-[0.99]"
                data-testid={`widget-risk-row-${r.id}`}
              >
                <ProductImage src={r.photoUrl || r.product?.imageUrl} className="h-9 w-9 rounded-lg shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.product?.name ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.flaggedQuantity} {r.product?.unit ?? ""} · {t("inventoryRisk", `quality_${r.qualityStatus}` as any)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
