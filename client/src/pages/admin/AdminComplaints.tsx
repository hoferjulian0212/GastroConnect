import { searchIncludes } from "@shared/searchText";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout, AdminBreadcrumb } from "./AdminLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatComplaintNumber, formatOrderNumber } from "@shared/schema";
import { Search, FileWarning, ChevronRight, Building2, Truck, AlertTriangle } from "lucide-react";

interface AdminComplaint {
  id: string;
  complaintNumber: string | null;
  title: string;
  status: string;
  priority: string;
  reason: string | null;
  createdAt: string;
  restaurantId: string;
  restaurantName: string;
  supplierId: string;
  supplierName: string;
  orderId: string;
  orderNumber: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  partially_resolved: "Teilweise gelöst",
  resolved: "Gelöst",
  closed: "Geschlossen",
  rejected: "Abgelehnt",
};

const STATUS_STYLES: Record<string, string> = {
  open: "border-red-500/40 text-red-400",
  in_progress: "border-amber-500/40 text-amber-400",
  partially_resolved: "border-amber-500/40 text-amber-400",
};

const REASON_LABELS: Record<string, string> = {
  damaged: "Beschädigt",
  short: "Fehlmenge",
  wrong: "Falsche Ware",
  quality: "Qualität",
  late: "Verspätet",
  other: "Sonstiges",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const day = 86400000;
  if (diff < 3600000) return "vor wenigen Minuten";
  if (diff < day) return `vor ${Math.floor(diff / 3600000)} Std.`;
  if (diff < 7 * day) return `vor ${Math.floor(diff / day)} Tg.`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminComplaints() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const { data: complaints = [], isLoading } = useQuery<AdminComplaint[]>({
    queryKey: ["/api/admin/complaints"],
    staleTime: 30000,
  });

  const filtered = complaints.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      searchIncludes(c.title, q) ||
      searchIncludes(c.restaurantName, q) ||
      searchIncludes(c.supplierName, q) ||
      searchIncludes(formatComplaintNumber(c), q)
    );
  });

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: "Dashboard", href: "/admin" }, { label: "Offene Reklamationen" }]} />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Offene Reklamationen</h1>
          <p className="text-white/40 text-sm mt-1">
            {complaints.length} ungelöste {complaints.length === 1 ? "Reklamation" : "Reklamationen"} über alle Organisationen
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <Input
            placeholder="Suche nach Titel, Restaurant, Lieferant oder Nummer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-[#111116] border-white/8 text-white placeholder:text-white/30 rounded-xl h-10"
            data-testid="input-admin-complaint-search"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#111116] border border-white/8 rounded-2xl py-16 text-center">
            <FileWarning className="h-8 w-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm" data-testid="text-no-complaints">
              {complaints.length === 0 ? "Keine offenen Reklamationen" : "Keine Treffer"}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(c => (
              <div
                key={c.id}
                className="flex items-start gap-3 px-4 py-3 bg-[#111116] border border-white/8 rounded-xl"
                data-testid={`row-complaint-${c.id}`}
              >
                <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                  <FileWarning className="h-4 w-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm truncate">{c.title}</span>
                    {c.priority === "high" && (
                      <span className="flex items-center gap-0.5 text-[10px] text-red-400" data-testid={`badge-priority-${c.id}`}>
                        <AlertTriangle className="h-3 w-3" />
                        Hohe Priorität
                      </span>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-2 py-0 border ${STATUS_STYLES[c.status] ?? "border-white/20 text-white/50"}`}
                      data-testid={`badge-status-${c.id}`}
                    >
                      {STATUS_LABELS[c.status] ?? c.status}
                    </Badge>
                    {c.reason && (
                      <span className="text-[10px] text-white/40">{REASON_LABELS[c.reason] ?? c.reason}</span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 mt-1 font-mono">
                    #{formatComplaintNumber(c)} · Bestellung #{formatOrderNumber({ orderNumber: c.orderNumber, id: c.orderId })} · {relTime(c.createdAt)}
                  </p>
                  <div className="flex items-center gap-x-4 gap-y-1 mt-2 flex-wrap">
                    <button
                      onClick={() => setLocation(`/admin/orgs/${c.restaurantId}`)}
                      className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      data-testid={`link-restaurant-${c.id}`}
                    >
                      <Building2 className="h-3 w-3" />
                      {c.restaurantName}
                    </button>
                    <button
                      onClick={() => setLocation(`/admin/orgs/${c.supplierId}`)}
                      className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                      data-testid={`link-supplier-${c.id}`}
                    >
                      <Truck className="h-3 w-3" />
                      {c.supplierName}
                    </button>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/20 shrink-0 mt-1 hidden sm:block" />
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
