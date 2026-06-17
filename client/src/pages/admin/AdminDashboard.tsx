import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdminLayout } from "./AdminLayout";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Euro, ShoppingCart, Building2, Users, TrendingUp, TrendingDown,
  AlertTriangle, Clock, ShieldAlert, PackageX, ArrowUpRight,
  UtensilsCrossed, Truck, FileWarning, ChevronRight, MessageSquare,
} from "lucide-react";

interface Overview {
  totalOrgs: number;
  restaurants: number;
  suppliers: number;
  verifiedOrgs: number;
  pendingOrgs: number;
  totalMembers: number;
  activeMembers: number;
  totalOrders: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  gmvTotal: number;
  gmvThisMonth: number;
  gmvLastMonth: number;
  openComplaints: number;
  pendingVerifications: number;
}

interface SeriesPoint { month: string; orders: number; gmv: number; newOrgs: number; }

interface Health {
  pendingVerifications: number;
  openComplaints: number;
  pendingAdmins: number;
  lowStockProducts: number;
  unreadMessages: number;
}

interface ActivityItem {
  type: "org" | "order" | "complaint";
  id: string;
  title: string;
  subtitle: string;
  role?: string;
  status?: string;
  createdAt: string;
  link: string;
}

interface TopOrgs {
  topSuppliers: { id: string; name: string; orders: number; revenue: number }[];
  topRestaurants: { id: string; name: string; orders: number; spend: number }[];
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}
function fmtNum(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n || 0);
}
function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return ((curr - prev) / prev) * 100;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "short" });
}

export default function AdminDashboard() {
  const { data: overview, isLoading: ovLoading } = useQuery<Overview>({
    queryKey: ["/api/admin/stats/overview"],
    staleTime: 30000,
  });
  const { data: series = [] } = useQuery<SeriesPoint[]>({
    queryKey: ["/api/admin/stats/timeseries"],
    staleTime: 30000,
  });
  const { data: health } = useQuery<Health>({
    queryKey: ["/api/admin/stats/health"],
    staleTime: 30000,
  });
  const { data: activity = [] } = useQuery<ActivityItem[]>({
    queryKey: ["/api/admin/stats/activity"],
    staleTime: 30000,
  });
  const { data: topOrgs } = useQuery<TopOrgs>({
    queryKey: ["/api/admin/stats/top-orgs"],
    staleTime: 30000,
  });

  const chartData = series.map(s => ({ ...s, label: monthLabel(s.month) }));

  const gmvChange = overview ? pctChange(overview.gmvThisMonth, overview.gmvLastMonth) : null;
  const orderChange = overview ? pctChange(overview.ordersThisMonth, overview.ordersLastMonth) : null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">Übersicht über die gesamte GastroConnect-Plattform</p>
        </div>

        {/* KPI cards */}
        {ovLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={Euro}
              label="Umsatz gesamt"
              value={fmtEur(overview?.gmvTotal ?? 0)}
              sub={`${fmtEur(overview?.gmvThisMonth ?? 0)} diesen Monat`}
              change={gmvChange}
              accent="text-emerald-400"
              testId="kpi-gmv"
            />
            <KpiCard
              icon={ShoppingCart}
              label="Bestellungen"
              value={fmtNum(overview?.totalOrders ?? 0)}
              sub={`${fmtNum(overview?.ordersThisMonth ?? 0)} diesen Monat`}
              change={orderChange}
              accent="text-blue-400"
              testId="kpi-orders"
            />
            <KpiCard
              icon={Building2}
              label="Organisationen"
              value={fmtNum(overview?.totalOrgs ?? 0)}
              sub={`${fmtNum(overview?.restaurants ?? 0)} Restaurants · ${fmtNum(overview?.suppliers ?? 0)} Lieferanten`}
              accent="text-purple-400"
              testId="kpi-orgs"
            />
            <KpiCard
              icon={Users}
              label="Mitglieder"
              value={fmtNum(overview?.totalMembers ?? 0)}
              sub={`${fmtNum(overview?.activeMembers ?? 0)} aktiv (30 Tage)`}
              accent="text-amber-400"
              testId="kpi-members"
            />
            <KpiCard
              icon={ShoppingCart}
              label="Bestellungen diesen Monat"
              value={fmtNum(overview?.ordersThisMonth ?? 0)}
              sub={`${fmtNum(overview?.ordersLastMonth ?? 0)} im Vormonat`}
              change={orderChange}
              accent="text-cyan-400"
              testId="kpi-orders-month"
            />
            <KpiCard
              icon={FileWarning}
              label="Offene Reklamationen"
              value={fmtNum(overview?.openComplaints ?? 0)}
              sub="Ungelöste Fälle"
              accent="text-red-400"
              testId="kpi-open-complaints"
            />
            <KpiCard
              icon={Clock}
              label="Freigaben ausstehend"
              value={fmtNum(overview?.pendingVerifications ?? 0)}
              sub="Neue Organisationen"
              accent="text-orange-400"
              testId="kpi-pending-verifications"
            />
          </div>
        )}

        {/* Health / action items */}
        <div>
          <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Aktionen erforderlich
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <HealthCard
              icon={Clock}
              label="Freigaben ausstehend"
              value={health?.pendingVerifications ?? 0}
              href="/admin/orgs?filter=pending"
              color="amber"
              testId="health-pending-verifications"
            />
            <HealthCard
              icon={FileWarning}
              label="Offene Reklamationen"
              value={health?.openComplaints ?? 0}
              href="/admin/complaints"
              color="red"
              testId="health-open-complaints"
            />
            <HealthCard
              icon={ShieldAlert}
              label="Admin-Anträge"
              value={health?.pendingAdmins ?? 0}
              href="/admin/admins"
              color="blue"
              testId="health-pending-admins"
            />
            <HealthCard
              icon={PackageX}
              label="Niedriger Bestand"
              value={health?.lowStockProducts ?? 0}
              href="/admin/low-stock"
              color="orange"
              testId="health-low-stock"
            />
            <HealthCard
              icon={MessageSquare}
              label="Ungelesene Nachrichten"
              value={health?.unreadMessages ?? 0}
              color="blue"
              testId="health-unread-messages"
            />
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Umsatz (6 Monate)">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip content={<DarkTooltip valueFormatter={fmtEur} />} />
                <Area type="monotone" dataKey="gmv" name="Umsatz" stroke="#34d399" strokeWidth={2} fill="url(#gmvGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Bestellungen & neue Organisationen">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<DarkTooltip valueFormatter={fmtNum} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="orders" name="Bestellungen" fill="#60a5fa" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="newOrgs" name="Neue Orgs" fill="#a78bfa" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Top organizations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopList
            title="Top Lieferanten"
            icon={Truck}
            empty="Noch keine Daten"
            items={(topOrgs?.topSuppliers ?? []).map(s => ({
              id: s.id, name: s.name, primary: fmtEur(s.revenue), secondary: `${fmtNum(s.orders)} Bestellungen`,
            }))}
          />
          <TopList
            title="Top Restaurants"
            icon={UtensilsCrossed}
            empty="Noch keine Daten"
            items={(topOrgs?.topRestaurants ?? []).map(r => ({
              id: r.id, name: r.name, primary: fmtEur(r.spend), secondary: `${fmtNum(r.orders)} Bestellungen`,
            }))}
          />
        </div>

        {/* Recent activity */}
        <div>
          <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Letzte Aktivität
          </h2>
          <div className="bg-[#161921] border border-white/10 rounded-2xl divide-y divide-white/5">
            {activity.length === 0 && (
              <p className="text-white/30 text-sm py-8 text-center">Keine Aktivität</p>
            )}
            {activity.map(item => (
              <ActivityRow key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, change, accent, testId,
}: {
  icon: typeof Euro;
  label: string;
  value: string;
  sub?: string;
  change?: number | null;
  accent: string;
  testId: string;
}) {
  return (
    <div className="bg-[#161921] border border-white/10 rounded-2xl p-4" data-testid={testId}>
      <div className="flex items-center justify-between">
        <div className={`h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center ${accent}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        {change !== undefined && change !== null && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(change).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white mt-3" data-testid={`${testId}-value`}>{value}</p>
      <p className="text-xs text-white/40 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-white/30 mt-1.5">{sub}</p>}
    </div>
  );
}

const HEALTH_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  amber: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  red: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  orange: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
};

function HealthCard({
  icon: Icon, label, value, href, color, testId,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  href?: string;
  color: keyof typeof HEALTH_COLORS;
  testId: string;
}) {
  const c = HEALTH_COLORS[color];
  const active = value > 0;
  const inner = (
    <div
      className={`rounded-2xl p-4 border transition-colors ${
        active ? `${c.bg} ${c.border}` : "bg-[#161921] border-white/10"
      } ${href && active ? "hover:brightness-125 cursor-pointer" : ""}`}
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <Icon className={`h-4.5 w-4.5 ${active ? c.text : "text-white/30"}`} />
        {href && active && <ArrowUpRight className={`h-3.5 w-3.5 ${c.text}`} />}
      </div>
      <p className={`text-2xl font-bold mt-2 ${active ? "text-white" : "text-white/40"}`} data-testid={`${testId}-value`}>
        {value}
      </p>
      <p className="text-[11px] text-white/40 mt-0.5 leading-tight">{label}</p>
    </div>
  );
  if (href && active) return <Link href={href}>{inner}</Link>;
  return inner;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#161921] border border-white/10 rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-white/70 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function DarkTooltip({ active, payload, label, valueFormatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0e1117] border border-white/15 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-white/50 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs text-white flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-semibold">{valueFormatter ? valueFormatter(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

function TopList({
  title, icon: Icon, items, empty,
}: {
  title: string;
  icon: typeof Truck;
  items: { id: string; name: string; primary: string; secondary: string }[];
  empty: string;
}) {
  return (
    <div className="bg-[#161921] border border-white/10 rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-white/40" />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-white/30 text-sm py-6 text-center">{empty}</p>
      ) : (
        <div className="space-y-1">
          {items.map((item, i) => (
            <Link key={item.id} href={`/admin/orgs/${item.id}`}>
              <div
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                data-testid={`top-org-${item.id}`}
              >
                <span className="h-6 w-6 rounded-md bg-white/5 flex items-center justify-center text-xs font-bold text-white/50 shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0 text-sm text-white truncate">{item.name}</span>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-white">{item.primary}</p>
                  <p className="text-[11px] text-white/40">{item.secondary}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const ACTIVITY_ICON: Record<string, { icon: typeof Building2; color: string }> = {
  org: { icon: Building2, color: "text-purple-400" },
  order: { icon: ShoppingCart, color: "text-blue-400" },
  complaint: { icon: FileWarning, color: "text-red-400" },
};

function ActivityRow({ item }: { item: ActivityItem }) {
  const cfg = ACTIVITY_ICON[item.type];
  const Icon = cfg.icon;
  const when = new Date(item.createdAt);
  const timeStr = when.toLocaleDateString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <Link href={item.link}>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
        data-testid={`activity-${item.type}-${item.id}`}
      >
        <div className={`h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${cfg.color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{item.title}</p>
          <p className="text-xs text-white/40 truncate">{item.subtitle}</p>
        </div>
        <span className="text-[11px] text-white/30 shrink-0 hidden sm:block">{timeStr}</span>
        <ChevronRight className="h-4 w-4 text-white/20 shrink-0" />
      </div>
    </Link>
  );
}
