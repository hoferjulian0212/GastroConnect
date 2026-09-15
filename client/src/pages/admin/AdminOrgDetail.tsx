import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout, AdminBreadcrumb } from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  Building2, Mail, Phone, MapPin, CheckCircle2, Clock,
  Users, UserCheck, ShieldCheck, Trash2, AlertTriangle,
  Euro, ShoppingCart, TrendingUp, FileWarning, Package, PackageX, Handshake,
  Star, CalendarClock, StickyNote, Plus, XCircle,
} from "lucide-react";

interface OrgMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  profileImageUrl: string | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
}

interface OrgDetailResponse {
  org: {
    id: string;
    name: string;
    companyName: string | null;
    role: "restaurant" | "supplier";
    email: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    postalCode: string | null;
    verifiedAt: string | null;
    approvalStatus?: "pending" | "approved" | "denied";
    createdAt: string;
  };
  members: OrgMember[];
}

interface OrgStats {
  role: "restaurant" | "supplier";
  totalOrders: number;
  gmv: number;
  avgOrderValue: number;
  activePartners: number;
  openComplaints: number;
  productCount: number;
  lowStockCount: number;
  ratingAvg: number | null;
  ratingCount: number;
  lastOrderAt: string | null;
  monthly: { month: string; orders: number; gmv: number }[];
  ordersByStatus: { status: string; count: number }[];
  topPartners: { id: string; name: string; orders: number; amount: number }[];
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}
function fmtNum(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n || 0);
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("de-DE", { month: "short" });
}

interface OrgNote {
  id: string;
  organizationId: string;
  authorAdminId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Neu",
  confirmed: "Bestätigt",
  not_deliverable: "Nicht zustellbar",
  in_delivery: "In Lieferung",
  delivered: "Geliefert",
  cancelled: "Storniert",
  declined: "Abgelehnt",
};

export default function AdminOrgDetail({ params }: { params: { id: string } }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const { data, isLoading, isError } = useQuery<OrgDetailResponse>({
    queryKey: ["/api/admin/orgs", params.id, "members"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/orgs/${params.id}/members`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<OrgDetailResponse>;
    },
    retry: false,
  });

  const { data: stats } = useQuery<OrgStats>({
    queryKey: ["/api/admin/orgs", params.id, "stats"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/orgs/${params.id}/stats`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<OrgStats>;
    },
    retry: false,
    staleTime: 30000,
  });

  const impersonateMutation = useMutation({
    mutationFn: (memberId: string) =>
      apiRequest("POST", `/api/admin/impersonate/${memberId}`).then(r => r.json()),
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation-status"] });
      // Refetch /api/auth/me so UserContext sees the impersonated member as
      // authenticated before we navigate — otherwise the route guard fires
      // with stale unauthenticated state and redirects to /login.
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Impersonierung gestartet", description: "Sie agieren jetzt als dieses Mitglied." });
      const orgRole = result?.orgRole as string | undefined;
      setLocation(orgRole === "supplier" ? "/supplier" : "/restaurant");
    },
    onError: () => {
      toast({ title: "Fehler", description: "Impersonierung fehlgeschlagen.", variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/orgs/${params.id}/verify`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs", params.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs/pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs"] });
      toast({ title: "Organisation freigegeben", description: "Die Organisation und ihre Mitglieder wurden verifiziert." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Freigabe fehlgeschlagen.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/admin/orgs/${params.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs/pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs"] });
      toast({ title: "Organisation gelöscht", description: "Die Organisation wurde entfernt." });
      setLocation("/admin/orgs");
    },
    onError: () => {
      toast({ title: "Fehler", description: "Löschen fehlgeschlagen.", variant: "destructive" });
    },
  });

  const memberVerifyMutation = useMutation({
    mutationFn: ({ memberId, verified }: { memberId: string; verified: boolean }) =>
      apiRequest("PATCH", `/api/admin/orgs/${params.id}/members/${memberId}/verify`, { verified }),
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs", params.id, "members"] });
      toast({
        title: vars.verified ? "Mitglied verifiziert" : "Verifizierung entfernt",
        description: vars.verified
          ? "Das Mitglied wurde als verifiziert markiert."
          : "Das Mitglied gilt nun als unverifiziert.",
      });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Aktion fehlgeschlagen.", variant: "destructive" });
    },
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery<OrgNote[]>({
    queryKey: ["/api/admin/orgs", params.id, "notes"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/orgs/${params.id}/notes`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<OrgNote[]>;
    },
    staleTime: 30000,
  });

  const addNoteMutation = useMutation({
    mutationFn: (body: string) => apiRequest("POST", `/api/admin/orgs/${params.id}/notes`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs", params.id, "notes"] });
      setNoteDraft("");
      toast({ title: "Notiz gespeichert" });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Notiz konnte nicht gespeichert werden.", variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => apiRequest("DELETE", `/api/admin/orgs/${params.id}/notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs", params.id, "notes"] });
      toast({ title: "Notiz gelöscht" });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Notiz konnte nicht gelöscht werden.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
          <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
          <div className="h-48 rounded-xl bg-white/5 animate-pulse" />
        </div>
      </AdminLayout>
    );
  }

  if (isError || !data?.org) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <AdminBreadcrumb items={[{ label: "Organisationen", href: "/admin/orgs" }, { label: "Nicht gefunden" }]} />
          <p className="text-white/50">Organisation nicht gefunden oder Sie haben keinen Zugriff.</p>
        </div>
      </AdminLayout>
    );
  }

  const { org, members } = data;
  const displayName = org.companyName || org.name;
  const isPending = (org.approvalStatus ?? (org.verifiedAt ? "approved" : "pending")) === "pending";

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[
        { label: "Organisationen", href: "/admin/orgs" },
        { label: displayName },
      ]} />

      <div className="space-y-6">
        {/* Pending action banner */}
        {isPending && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">Warten auf Freigabe</p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  Diese Organisation hat sich selbst registriert und wartet auf manuelle Überprüfung.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Wirklich löschen?
                  </span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => { deleteMutation.mutate(); setConfirmDelete(false); }}
                    disabled={deleteMutation.isPending}
                    className="h-8 px-3 text-xs"
                    data-testid="button-confirm-delete-org"
                  >
                    Ja, löschen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                    className="h-8 px-3 text-xs text-white/50 hover:text-white hover:bg-white/5"
                    data-testid="button-cancel-delete-org"
                  >
                    Abbrechen
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(true)}
                    disabled={verifyMutation.isPending}
                    className="h-8 px-3 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20"
                    data-testid="button-reject-org"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Ablehnen
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => verifyMutation.mutate()}
                    disabled={verifyMutation.isPending}
                    className="h-8 px-4 text-xs bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                    data-testid="button-approve-org"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                    {verifyMutation.isPending ? "Freigeben…" : "Freigeben"}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Org info card */}
        <div className="bg-[#111116] border border-white/8 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
              <Building2 className="h-6 w-6 text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-white">{displayName}</h1>
                {(org.approvalStatus ?? (org.verifiedAt ? "approved" : "pending")) === "approved" ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verifiziert
                  </span>
                ) : org.approvalStatus === "denied" ? (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <Clock className="h-3.5 w-3.5" />
                    Abgelehnt
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <Clock className="h-3.5 w-3.5" />
                    Ausstehend
                  </span>
                )}
                <Badge
                  variant="outline"
                  className={`text-xs px-2 py-0 border ${
                    org.role === "restaurant"
                      ? "border-indigo-500/40 text-indigo-400"
                      : "border-emerald-500/40 text-emerald-400"
                  }`}
                >
                  {org.role === "restaurant" ? "Restaurant" : "Lieferant"}
                </Badge>
              </div>
              <div className="mt-2 space-y-1">
                <p className="flex items-center gap-1.5 text-sm text-white/50">
                  <Mail className="h-3.5 w-3.5" />{org.email}
                </p>
                {org.phone && (
                  <p className="flex items-center gap-1.5 text-sm text-white/50">
                    <Phone className="h-3.5 w-3.5" />{org.phone}
                  </p>
                )}
                {(org.address || org.city) && (
                  <p className="flex items-center gap-1.5 text-sm text-white/50">
                    <MapPin className="h-3.5 w-3.5" />
                    {[org.address, org.postalCode, org.city].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Statistics */}
        {stats && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Statistik
            </h2>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard icon={Euro} label="Umsatz gesamt" value={fmtEur(stats.gmv)} accent="text-indigo-400" testId="stat-gmv" />
              <StatCard icon={ShoppingCart} label="Bestellungen" value={fmtNum(stats.totalOrders)} accent="text-indigo-400" testId="stat-orders" />
              <StatCard icon={TrendingUp} label="Ø Bestellwert" value={fmtEur(stats.avgOrderValue)} accent="text-indigo-400" testId="stat-aov" />
              {stats.role === "supplier" ? (
                <StatCard icon={Package} label="Produkte" value={fmtNum(stats.productCount)} accent="text-indigo-400" testId="stat-products" />
              ) : (
                <StatCard icon={Handshake} label="Aktive Lieferanten" value={fmtNum(stats.activePartners)} accent="text-indigo-400" testId="stat-partners" />
              )}
              {stats.role === "supplier" ? (
                <StatCard
                  icon={Star}
                  label="Bewertung"
                  value={stats.ratingAvg != null ? `${stats.ratingAvg.toFixed(1)} ★` : "—"}
                  sub={stats.ratingCount > 0 ? `${fmtNum(stats.ratingCount)} Bewertungen` : "Keine Bewertungen"}
                  accent="text-amber-400"
                  testId="stat-rating"
                />
              ) : (
                <StatCard
                  icon={FileWarning}
                  label="Offene Reklamationen"
                  value={fmtNum(stats.openComplaints)}
                  accent="text-red-400"
                  testId="stat-restaurant-complaints"
                />
              )}
              <StatCard
                icon={CalendarClock}
                label="Letzte Bestellung"
                value={stats.lastOrderAt ? new Date(stats.lastOrderAt).toLocaleDateString("de-DE") : "—"}
                accent="text-indigo-400"
                testId="stat-last-order"
              />
            </div>

            {(stats.openComplaints > 0 || (stats.role === "supplier" && stats.lowStockCount > 0)) && (
              <div className="grid grid-cols-2 gap-3">
                {stats.openComplaints > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4" data-testid="stat-complaints">
                    <FileWarning className="h-4 w-4 text-red-400" />
                    <p className="text-2xl font-bold text-white mt-2">{stats.openComplaints}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">Offene Reklamationen</p>
                  </div>
                )}
                {stats.role === "supplier" && stats.lowStockCount > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4" data-testid="stat-low-stock">
                    <PackageX className="h-4 w-4 text-amber-400" />
                    <p className="text-2xl font-bold text-white mt-2">{stats.lowStockCount}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">Produkte mit niedrigem Bestand</p>
                  </div>
                )}
              </div>
            )}

            {stats.monthly.some(m => m.orders > 0 || m.gmv > 0) && (
              <div className="bg-[#111116] border border-white/8 rounded-2xl p-4">
                <h3 className="text-sm font-semibold text-white/70 mb-3">Umsatz (6 Monate)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={stats.monthly.map(m => ({ ...m, label: monthLabel(m.month) }))} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="orgGmvGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip content={<OrgTooltip />} />
                    <Area type="monotone" dataKey="gmv" name="Umsatz" stroke="#818cf8" strokeWidth={2} fill="url(#orgGmvGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {stats.ordersByStatus.length > 0 && (
                <div className="bg-[#111116] border border-white/8 rounded-2xl p-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-3">Bestellungen nach Status</h3>
                  <div className="space-y-2">
                    {stats.ordersByStatus.map(s => (
                      <div key={s.status} className="flex items-center justify-between text-sm" data-testid={`status-row-${s.status}`}>
                        <span className="text-white/60">{STATUS_LABELS[s.status] ?? s.status}</span>
                        <span className="font-semibold text-white">{fmtNum(s.count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.topPartners.length > 0 && (
                <div className="bg-[#111116] border border-white/8 rounded-2xl p-4">
                  <h3 className="text-sm font-semibold text-white/70 mb-3">
                    {stats.role === "supplier" ? "Top Kunden" : "Top Lieferanten"}
                  </h3>
                  <div className="space-y-1">
                    {stats.topPartners.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg" data-testid={`partner-${p.id}`}>
                        <span className="h-6 w-6 rounded-md bg-white/5 flex items-center justify-center text-xs font-bold text-white/50 shrink-0">{i + 1}</span>
                        <span className="flex-1 min-w-0 text-sm text-white truncate">{p.name}</span>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-white">{fmtEur(p.amount)}</p>
                          <p className="text-[11px] text-white/40">{fmtNum(p.orders)} Best.</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Members */}
        <div>
          <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Mitglieder ({members.length})
          </h2>
          <div className="space-y-1.5">
            {members.length === 0 && (
              <p className="text-white/30 text-sm py-4 text-center">Keine Mitglieder</p>
            )}
            {members.map(member => (
              <div
                key={member.id}
                className="flex items-center gap-3 px-4 py-3 bg-[#111116] border border-white/8 rounded-xl"
                data-testid={`row-member-${member.id}`}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={member.profileImageUrl ?? undefined} alt={member.name} />
                  <AvatarFallback className="bg-white/5 text-white text-xs font-semibold">
                    {member.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white text-sm">{member.name}</span>
                    <RoleBadge role={member.role} />
                    {!member.emailVerifiedAt && (
                      <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        Unverifiziert
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 truncate">{member.email ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(() => {
                    const active = member.lastLoginAt
                      ? Date.now() - new Date(member.lastLoginAt).getTime() <= 30 * 24 * 60 * 60 * 1000
                      : false;
                    return (
                      <span
                        className="hidden sm:flex items-center gap-1.5 text-xs text-white/30"
                        data-testid={`member-activity-${member.id}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-white/20"}`} />
                        {member.lastLoginAt
                          ? new Date(member.lastLoginAt).toLocaleDateString("de-DE")
                          : "Nie angemeldet"}
                      </span>
                    );
                  })()}
                  {member.emailVerifiedAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => memberVerifyMutation.mutate({ memberId: member.id, verified: false })}
                      disabled={memberVerifyMutation.isPending}
                      className="h-7 px-3 text-xs border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 disabled:opacity-30"
                      data-testid={`button-unverify-${member.id}`}
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Aufheben
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => memberVerifyMutation.mutate({ memberId: member.id, verified: true })}
                      disabled={memberVerifyMutation.isPending}
                      className="h-7 px-3 text-xs border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-300 disabled:opacity-30"
                      data-testid={`button-verify-${member.id}`}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verifizieren
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => impersonateMutation.mutate(member.id)}
                    disabled={impersonateMutation.isPending || isPending}
                    title={isPending ? "Organisation muss zuerst freigegeben werden" : undefined}
                    className="h-7 px-3 text-xs border-white/20 bg-white/5 hover:bg-white/10 text-white disabled:opacity-30"
                    data-testid={`button-impersonate-${member.id}`}
                  >
                    <UserCheck className="h-3 w-3 mr-1" />
                    Imitieren
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes / special agreements */}
        <div>
          <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
            <StickyNote className="h-4 w-4" />
            Notizen & Vereinbarungen ({notes.length})
          </h2>
          <div className="bg-[#111116] border border-white/8 rounded-2xl p-4 space-y-4">
            <div className="space-y-2">
              <Textarea
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                placeholder="Besondere Vereinbarung oder interne Notiz hinzufügen…"
                rows={3}
                maxLength={5000}
                className="bg-[#0a0a0f] border-white/8 text-white placeholder:text-white/30 rounded-xl resize-none"
                data-testid="input-note-body"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => addNoteMutation.mutate(noteDraft.trim())}
                  disabled={addNoteMutation.isPending || !noteDraft.trim()}
                  className="h-8 px-4 text-xs bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30"
                  data-testid="button-add-note"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Notiz speichern
                </Button>
              </div>
            </div>

            {notesLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
              </div>
            ) : notes.length === 0 ? (
              <p className="text-white/30 text-sm py-2 text-center" data-testid="text-no-notes">
                Noch keine Notizen
              </p>
            ) : (
              <div className="space-y-2">
                {notes.map(note => (
                  <div
                    key={note.id}
                    className="group flex items-start gap-3 px-4 py-3 bg-[#0a0a0f] border border-white/8 rounded-xl"
                    data-testid={`row-note-${note.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/90 whitespace-pre-wrap break-words">{note.body}</p>
                      <p className="text-[11px] text-white/35 mt-1.5">
                        {note.authorName} ·{" "}
                        {new Date(note.createdAt).toLocaleString("de-DE", {
                          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm("Notiz löschen?")) deleteNoteMutation.mutate(note.id);
                      }}
                      disabled={deleteNoteMutation.isPending}
                      className="text-white/20 hover:text-red-400 transition-colors shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
                      data-testid={`button-delete-note-${note.id}`}
                      aria-label="Notiz löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({
  icon: Icon, label, value, accent, testId, sub,
}: {
  icon: typeof Euro;
  label: string;
  value: string;
  accent: string;
  testId: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#111116] border border-white/8 rounded-2xl p-4" data-testid={testId}>
      <div className={`h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center ${accent}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <p className="text-2xl font-bold text-white mt-3">{value}</p>
      <p className="text-xs text-white/40 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-white/30 mt-0.5">{sub}</p>}
    </div>
  );
}

function OrgTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0a0a0f] border border-white/12 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-white/50 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs text-white">
          {p.name}: <span className="font-semibold">{fmtEur(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; color: string }> = {
    admin: { label: "Admin", color: "border-indigo-500/40 text-indigo-400" },
    manager: { label: "Manager", color: "border-indigo-500/30 text-indigo-300" },
    staff: { label: "Staff", color: "border-white/20 text-white/50" },
    vertreter: { label: "Vertreter", color: "border-amber-500/40 text-amber-400" },
  };
  const cfg = map[role] ?? { label: role, color: "border-white/20 text-white/50" };
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${cfg.color}`}>
      {cfg.label}
    </Badge>
  );
}
