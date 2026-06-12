import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { TrendingUp, Package, Building2, Tag, MessageCircle, AlertCircle, ClipboardList, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useT } from "@/lib/translations";
import type { OrderWithDetails, ConversationWithUser, ComplaintWithDetails } from "@shared/schema";

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

type DetailedStats = {
  monthlyRevenue: { month: string; revenue: number }[];
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  topSuppliers: { supplierId: string; name: string; orders: number; revenue: number }[];
  promoSavings: number;
  ordersByStatus: { status: string; count: number }[];
};

const MONTH_NAMES: Record<"de" | "it", string[]> = {
  de: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
  it: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"],
};

function formatMonthLabel(month: string, lang: "de" | "it"): string {
  const parts = month.split("-");
  const idx = parseInt(parts[1] ?? "1", 10) - 1;
  return MONTH_NAMES[lang][idx] ?? month;
}

const ORDER_STATUSES = ["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"] as const;
const COMPLAINT_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  partially_confirmed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  in_delivery: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

const COMPLAINT_STATUS_COLORS: Record<string, string> = {
  open: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  closed: "bg-muted text-muted-foreground",
};

function eur(value: number, lang: "de" | "it"): string {
  return `${Math.round(value).toLocaleString(lang === "de" ? "de-DE" : "it-IT")}€`;
}

// ───────────────────────── Ausgaben-Trend ─────────────────────────
export function AusgabenTrendWidget({ restaurantId, lang }: { restaurantId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const { data, isLoading } = useQuery<DetailedStats>({
    queryKey: [`/api/restaurant/detailed-stats?restaurantId=${restaurantId}`],
    enabled: !!restaurantId,
  });
  const monthly = data?.monthlyRevenue || [];
  const chartData = monthly.map(m => ({ label: formatMonthLabel(m.month, lang), revenue: m.revenue }));
  const allZero = chartData.length === 0 || chartData.every(d => !d.revenue);
  return (
    <div className={CARD_BASE} data-testid="widget-ausgaben-trend">
      <div className={HEADER}>
        <WidgetTitle
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          title={t("restaurantHome", "widgetSpendingTrend")}
          desc={t("restaurantHome", "widgetSpendingTrendDesc")}
          testId="text-widget-ausgaben-trend-title"
        />
      </div>
      <div className={BODY}>
        {isLoading ? (
          <Skeleton className="h-44 w-full rounded-xl" />
        ) : allZero ? (
          <EmptyState icon={<TrendingUp className="h-6 w-6 text-muted-foreground/40" />} label={t("restaurantHome", "noDataYet")} />
        ) : (
          <div className="h-44 md:h-52" data-testid="chart-ausgaben-trend">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44}
                  tickFormatter={(v) => v >= 1_000 ? `${(v / 1_000).toFixed(0)}k€` : `${v}€`} />
                <Tooltip
                  cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  isAnimationActive={false}
                  formatter={(v: any) => [eur(Number(v), lang), t("restaurantHome", "widgetSpendingTrend")]}
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

// ───────────────────────── Meistbestellt ─────────────────────────
export function MeistBestelltWidget({ restaurantId, lang }: { restaurantId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const { data, isLoading } = useQuery<DetailedStats>({
    queryKey: [`/api/restaurant/detailed-stats?restaurantId=${restaurantId}`],
    enabled: !!restaurantId,
  });
  const products = (data?.topProducts || []).slice(0, 5);
  const unitLabel = lang === "de" ? "Stk" : "pz";
  return (
    <div className={CARD_BASE} data-testid="widget-meist-bestellt">
      <div className={HEADER}>
        <WidgetTitle
          icon={<Package className="h-4 w-4 text-primary" />}
          title={t("restaurantHome", "widgetMostOrdered")}
          desc={t("restaurantHome", "widgetMostOrderedDesc")}
          testId="text-widget-meist-bestellt-title"
        />
        <Link href="/restaurant/catalog" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-meist-bestellt-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}</div>
        ) : products.length === 0 ? (
          <EmptyState icon={<Package className="h-6 w-6 text-muted-foreground/40" />} label={t("restaurantHome", "noDataYet")} />
        ) : (
          <div className="space-y-1.5">
            {products.map((p, i) => (
              <div
                key={p.productId}
                className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-muted/40 transition-all"
                data-testid={`widget-product-row-${p.productId}`}
              >
                <div className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-xs font-semibold shrink-0">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">{p.quantity} {unitLabel}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{eur(p.revenue, lang)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Top-Lieferanten ─────────────────────────
export function TopLieferantenWidget({ restaurantId, lang }: { restaurantId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<DetailedStats>({
    queryKey: [`/api/restaurant/detailed-stats?restaurantId=${restaurantId}`],
    enabled: !!restaurantId,
  });
  const suppliers = (data?.topSuppliers || []).slice(0, 5);
  return (
    <div className={CARD_BASE} data-testid="widget-top-lieferanten">
      <div className={HEADER}>
        <WidgetTitle
          icon={<Building2 className="h-4 w-4 text-amber-500" />}
          title={t("restaurantHome", "widgetTopSuppliers")}
          desc={t("restaurantHome", "widgetTopSuppliersDesc")}
          testId="text-widget-top-lieferanten-title"
        />
        <Link href="/restaurant/suppliers" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-top-lieferanten-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}</div>
        ) : suppliers.length === 0 ? (
          <EmptyState icon={<Building2 className="h-6 w-6 text-muted-foreground/40" />} label={t("restaurantHome", "noDataYet")} />
        ) : (
          <div className="space-y-1.5">
            {suppliers.map((s, i) => (
              <div
                key={s.supplierId}
                onClick={() => navigate("/restaurant/suppliers")}
                className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-muted/40 cursor-pointer transition-all"
                data-testid={`widget-supplier-row-${s.supplierId}`}
              >
                <div className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-xs font-semibold shrink-0">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-[11px] text-muted-foreground">{s.orders} {t("restaurantHome", "orderCount")}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">{eur(s.revenue, lang)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Aktions-Ersparnis ─────────────────────────
export function AktionsErsparnisWidget({ restaurantId, lang }: { restaurantId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const { data, isLoading } = useQuery<DetailedStats>({
    queryKey: [`/api/restaurant/detailed-stats?restaurantId=${restaurantId}`],
    enabled: !!restaurantId,
  });
  const savings = data?.promoSavings ?? 0;
  return (
    <div className={CARD_BASE} data-testid="widget-aktions-ersparnis">
      <div className={HEADER}>
        <WidgetTitle
          icon={<Tag className="h-4 w-4 text-rose-500" />}
          title={t("restaurantHome", "widgetPromoSavings")}
          desc={t("restaurantHome", "widgetPromoSavingsDesc")}
          testId="text-widget-aktions-ersparnis-title"
        />
      </div>
      <div className={BODY}>
        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : savings <= 0 ? (
          <EmptyState icon={<Tag className="h-6 w-6 text-muted-foreground/40" />} label={t("restaurantHome", "noSavingsYet")} />
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <p className="text-3xl md:text-4xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="text-promo-savings">{eur(savings, lang)}</p>
            <p className="text-[11px] text-muted-foreground mt-2">{t("restaurantHome", "widgetPromoSavingsCaption")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Offene Unterhaltungen ─────────────────────────
export function OffeneUnterhaltungenWidget({ restaurantId, lang }: { restaurantId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<ConversationWithUser[]>({
    queryKey: [`/api/conversations?userId=${restaurantId}`],
    enabled: !!restaurantId,
  });
  const unread = (data || []).filter(c => (c.unreadCount || 0) > 0).slice(0, 5);
  return (
    <div className={CARD_BASE} data-testid="widget-offene-unterhaltungen">
      <div className={HEADER}>
        <WidgetTitle
          icon={<MessageCircle className="h-4 w-4 text-primary" />}
          title={t("restaurantHome", "widgetOpenConversations")}
          desc={t("restaurantHome", "widgetOpenConversationsDesc")}
          testId="text-widget-offene-unterhaltungen-title"
        />
        <Link href="/restaurant/inbox" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-offene-unterhaltungen-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : unread.length === 0 ? (
          <EmptyState icon={<MessageCircle className="h-6 w-6 text-muted-foreground/40" />} label={t("restaurantHome", "noUnreadConversations")} />
        ) : (
          <div className="space-y-2">
            {unread.map(c => {
              const name = c.otherUser?.companyName || c.otherUser?.name || "—";
              return (
                <div
                  key={c.id}
                  onClick={() => navigate("/restaurant/inbox")}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all active:scale-[0.99]"
                  data-testid={`widget-conversation-row-${c.id}`}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={c.otherUser?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-[10px] font-semibold">{name.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.lastMessage?.content || ""}</p>
                  </div>
                  <Badge variant="outline" className="bg-primary/10 text-primary text-[11px] tabular-nums shrink-0" data-testid={`badge-unread-${c.id}`}>
                    {c.unreadCount}
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

// ───────────────────────── Reklamationen-Status ─────────────────────────
export function ReklamationenStatusWidget({ restaurantId, lang }: { restaurantId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const { data, isLoading } = useQuery<ComplaintWithDetails[]>({
    queryKey: [`/api/complaints?restaurantId=${restaurantId}`],
    enabled: !!restaurantId,
  });
  const complaints = data || [];
  const counts: Record<string, number> = {};
  for (const c of complaints) counts[c.status] = (counts[c.status] || 0) + 1;
  const rows = COMPLAINT_STATUSES.filter(s => (counts[s] || 0) > 0);
  return (
    <div className={CARD_BASE} data-testid="widget-reklamationen-status">
      <div className={HEADER}>
        <WidgetTitle
          icon={<AlertCircle className="h-4 w-4 text-rose-500" />}
          title={t("restaurantHome", "widgetComplaintsStatus")}
          desc={t("restaurantHome", "widgetComplaintsStatusDesc")}
          testId="text-widget-reklamationen-status-title"
        />
        <Link href="/restaurant/complaints" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-reklamationen-status-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<AlertCircle className="h-6 w-6 text-muted-foreground/40" />} label={t("restaurantHome", "noComplaints")} />
        ) : (
          <div className="space-y-1.5">
            {rows.map(s => (
              <div
                key={s}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border bg-card"
                data-testid={`widget-complaint-status-${s}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center justify-center h-2.5 w-2.5 rounded-full ${COMPLAINT_STATUS_COLORS[s]}`} />
                  <span className="text-sm font-medium truncate">{t("restaurantHome", `complaintStatus_${s}`)}</span>
                </div>
                <Badge variant="outline" className={`${COMPLAINT_STATUS_COLORS[s]} text-[11px] tabular-nums shrink-0`}>{counts[s]}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Letzte Reklamationen ─────────────────────────
export function LetzteReklamationenWidget({ restaurantId, lang }: { restaurantId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<ComplaintWithDetails[]>({
    queryKey: [`/api/complaints?restaurantId=${restaurantId}`],
    enabled: !!restaurantId,
  });
  const complaints = [...(data || [])]
    .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
    .slice(0, 3);
  return (
    <div className={CARD_BASE} data-testid="widget-letzte-reklamationen">
      <div className={HEADER}>
        <WidgetTitle
          icon={<AlertCircle className="h-4 w-4 text-rose-500" />}
          title={t("restaurantHome", "widgetRecentComplaints")}
          desc={t("restaurantHome", "widgetRecentComplaintsDesc")}
          testId="text-widget-letzte-reklamationen-title"
        />
        <Link href="/restaurant/complaints" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-letzte-reklamationen-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : complaints.length === 0 ? (
          <EmptyState icon={<AlertCircle className="h-6 w-6 text-muted-foreground/40" />} label={t("restaurantHome", "noComplaints")} />
        ) : (
          <div className="space-y-2">
            {complaints.map(c => {
              const supName = c.supplier?.companyName || c.supplier?.name || "—";
              const colorClass = COMPLAINT_STATUS_COLORS[c.status] || "bg-muted text-muted-foreground";
              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/restaurant/complaints/${c.id}`)}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all active:scale-[0.99]"
                  data-testid={`widget-recent-complaint-row-${c.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{supName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.title || c.description || ""}</p>
                  </div>
                  <Badge variant="outline" className={`${colorClass} text-[10px] shrink-0`}>
                    {t("restaurantHome", `complaintStatus_${c.status}` as `complaintStatus_${typeof COMPLAINT_STATUSES[number]}`)}
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

// ───────────────────────── Bestellungen-Status ─────────────────────────
export function BestellungenStatusWidget({ restaurantId, lang }: { restaurantId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const { data, isLoading } = useQuery<DetailedStats>({
    queryKey: [`/api/restaurant/detailed-stats?restaurantId=${restaurantId}`],
    enabled: !!restaurantId,
  });
  const counts: Record<string, number> = {};
  for (const o of data?.ordersByStatus || []) counts[o.status] = (counts[o.status] || 0) + o.count;
  const rows = ORDER_STATUSES.filter(s => (counts[s] || 0) > 0);
  return (
    <div className={CARD_BASE} data-testid="widget-bestellungen-status">
      <div className={HEADER}>
        <WidgetTitle
          icon={<ClipboardList className="h-4 w-4 text-primary" />}
          title={t("restaurantHome", "widgetOrdersStatus")}
          desc={t("restaurantHome", "widgetOrdersStatusDesc")}
          testId="text-widget-bestellungen-status-title"
        />
        <Link href="/restaurant/orders" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-bestellungen-status-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-6 w-6 text-muted-foreground/40" />} label={t("restaurantHome", "noOrders")} />
        ) : (
          <div className="space-y-1.5">
            {rows.map(s => (
              <div
                key={s}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border bg-card"
                data-testid={`widget-order-status-${s}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center justify-center h-2.5 w-2.5 rounded-full ${ORDER_STATUS_COLORS[s]}`} />
                  <span className="text-sm font-medium truncate">{t("restaurantHome", `orderStatus_${s}`)}</span>
                </div>
                <Badge variant="outline" className={`${ORDER_STATUS_COLORS[s]} text-[11px] tabular-nums shrink-0`}>{counts[s]}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Letzte Bestellungen ─────────────────────────
export function LetzteBestellungenWidget({ restaurantId, lang }: { restaurantId: string; lang: "de" | "it" }) {
  const t = useT(lang);
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/orders?restaurantId=${restaurantId}`],
    enabled: !!restaurantId,
  });
  const orders = [...(data || [])]
    .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
    .slice(0, 5);
  return (
    <div className={CARD_BASE} data-testid="widget-letzte-bestellungen">
      <div className={HEADER}>
        <WidgetTitle
          icon={<Package className="h-4 w-4 text-primary" />}
          title={t("restaurantHome", "widgetRecentOrders")}
          desc={t("restaurantHome", "widgetRecentOrdersDesc")}
          testId="text-widget-letzte-bestellungen-title"
        />
        <Link href="/restaurant/orders" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0" data-testid="link-widget-letzte-bestellungen-all">
          {t("common", "all")}<ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={BODY}>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        ) : orders.length === 0 ? (
          <EmptyState icon={<Package className="h-6 w-6 text-muted-foreground/40" />} label={t("restaurantHome", "noOrders")} />
        ) : (
          <div className="space-y-2">
            {orders.map(o => {
              const supName = o.supplier?.companyName || o.supplier?.name || "—";
              const colorClass = ORDER_STATUS_COLORS[o.status] || "bg-muted text-muted-foreground";
              return (
                <div
                  key={o.id}
                  onClick={() => navigate(`/restaurant/orders/${o.id}`)}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-card hover:bg-muted/40 cursor-pointer transition-all active:scale-[0.99]"
                  data-testid={`widget-recent-order-row-${o.id}`}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={o.supplier?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-[10px] font-semibold">{supName.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{supName}</p>
                    <p className="text-[11px] text-muted-foreground">{o.items?.length || 0} {lang === "de" ? "Artikel" : "articoli"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-semibold tabular-nums">{parseFloat(o.totalAmount as any).toFixed(2)}€</span>
                    <Badge variant="outline" className={`${colorClass} text-[10px]`}>
                      {t("restaurantHome", `orderStatus_${o.status}`)}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
