import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "./AdminLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, Building2, Users, ChevronRight, CheckCircle2, Clock, Plus, Loader2 } from "lucide-react";

interface Org {
  id: string;
  name: string;
  companyName: string | null;
  role: "restaurant" | "supplier";
  email: string;
  verifiedAt: string | null;
  memberCount: number;
  createdAt: string;
  orderCount: number;
  gmv: number;
  lastActivityAt: string | null;
}

type SortKey = "activity" | "gmv" | "orders" | "name" | "created";

function fmtEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}

function relTime(iso: string | null): string {
  if (!iso) return "Keine Aktivität";
  const diff = Date.now() - new Date(iso).getTime();
  const day = 86400000;
  if (diff < 3600000) return "vor wenigen Minuten";
  if (diff < day) return `vor ${Math.floor(diff / 3600000)} Std.`;
  if (diff < 7 * day) return `vor ${Math.floor(diff / day)} Tg.`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminOrgs() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const filterParam = params.get("filter");
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [pendingOnly, setPendingOnly] = useState(filterParam === "pending");
  const [createOpen, setCreateOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("activity");

  // Sync the pending filter if the URL param changes (e.g. badge click).
  useEffect(() => {
    setPendingOnly(filterParam === "pending");
  }, [filterParam]);

  const { data: orgs = [], isLoading } = useQuery<Org[]>({
    queryKey: ["/api/admin/orgs"],
    staleTime: 30000,
  });

  const pendingOrgs = orgs.filter(o => !o.verifiedAt);

  const filtered = orgs.filter(o => {
    if (pendingOnly && o.verifiedAt) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.name.toLowerCase().includes(q) ||
      (o.companyName ?? "").toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q)
    );
  });

  const sortFn = (a: Org, b: Org) => {
    switch (sortKey) {
      case "gmv": return (b.gmv ?? 0) - (a.gmv ?? 0);
      case "orders": return (b.orderCount ?? 0) - (a.orderCount ?? 0);
      case "name": return (a.companyName || a.name).localeCompare(b.companyName || b.name);
      case "created": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "activity":
      default: {
        const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return bt - at;
      }
    }
  };

  const restaurants = filtered.filter(o => o.role === "restaurant").sort(sortFn);
  const suppliers = filtered.filter(o => o.role === "supplier").sort(sortFn);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Organisationen</h1>
            <p className="text-white/40 text-sm mt-1">{orgs.length} Organisationen insgesamt</p>
          </div>
          <div className="flex items-center gap-2">
            {pendingOrgs.length > 0 && (
              <button
                onClick={() => {
                  setPendingOnly(v => !v);
                  setSearch("");
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  pendingOnly
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
                }`}
                data-testid="button-filter-pending"
              >
                <Clock className="h-3.5 w-3.5" />
                {pendingOnly ? "Alle anzeigen" : `${pendingOrgs.length} ausstehend`}
              </button>
            )}
            <Button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg h-9 px-3 text-sm"
              data-testid="button-create-org"
            >
              <Plus className="h-4 w-4" />
              Neues Unternehmen
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input
              placeholder="Suche nach Name, Firma oder E-Mail..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-[#111116] border-white/8 text-white placeholder:text-white/30 rounded-xl h-10"
              data-testid="input-admin-org-search"
            />
          </div>
          <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
            <SelectTrigger
              className="w-[170px] h-10 bg-[#111116] border-white/8 text-white rounded-xl shrink-0"
              data-testid="select-org-sort"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activity">Letzte Aktivität</SelectItem>
              <SelectItem value="gmv">Umsatz</SelectItem>
              <SelectItem value="orders">Bestellungen</SelectItem>
              <SelectItem value="name">Name (A–Z)</SelectItem>
              <SelectItem value="created">Neueste zuerst</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <OrgSection
              title="Restaurants"
              orgs={restaurants}
              onSelect={id => setLocation(`/admin/orgs/${id}`)}
            />
            <OrgSection
              title="Lieferanten"
              orgs={suppliers}
              onSelect={id => setLocation(`/admin/orgs/${id}`)}
            />
          </div>
        )}
      </div>
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} toast={toast} />
    </AdminLayout>
  );
}

function CreateOrgDialog({
  open,
  onOpenChange,
  toast,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [role, setRole] = useState<"restaurant" | "supplier">("restaurant");
  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/orgs", { role, companyName, adminName, adminEmail }),
    onSuccess: async (res: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/orgs"] });
      toast({
        title: "Unternehmen erstellt",
        description: res?.emailed
          ? "Eine Einladung zum Aktivieren wurde per E-Mail gesendet."
          : "Konto erstellt. E-Mail-Versand ist nicht konfiguriert.",
      });
      setCompanyName("");
      setAdminName("");
      setAdminEmail("");
      setRole("restaurant");
      onOpenChange(false);
    },
    onError: (err: any) => {
      const msg = err?.message ?? "";
      toast({
        variant: "destructive",
        title: "Erstellung fehlgeschlagen",
        description: msg.includes("409") || msg.includes("email_taken")
          ? "Für diese E-Mail-Adresse besteht bereits ein Konto."
          : "Bitte Eingaben prüfen und erneut versuchen.",
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111116] border-white/8 text-white">
        <DialogHeader>
          <DialogTitle>Neues Unternehmen</DialogTitle>
          <DialogDescription className="text-white/50">
            Erstellt eine Organisation und ihren ersten Admin. Der Admin erhält eine
            E-Mail, um ein Passwort festzulegen und das Konto zu aktivieren.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-white/70 text-sm">Typ</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "restaurant" | "supplier")}>
              <SelectTrigger
                className="bg-white/5 border-white/8 text-white"
                data-testid="select-org-role"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="restaurant">Restaurant</SelectItem>
                <SelectItem value="supplier">Lieferant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-company" className="text-white/70 text-sm">Firmenname</Label>
            <Input
              id="org-company"
              required
              minLength={2}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              placeholder="z. B. Ristorante Bella"
              data-testid="input-org-company"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-admin-name" className="text-white/70 text-sm">Name des Admins</Label>
            <Input
              id="org-admin-name"
              required
              minLength={2}
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              placeholder="z. B. Maria Rossi"
              data-testid="input-org-admin-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-admin-email" className="text-white/70 text-sm">E-Mail des Admins</Label>
            <Input
              id="org-admin-email"
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              placeholder="admin@firma.de"
              data-testid="input-org-admin-email"
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
              data-testid="button-submit-create-org"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Erstellen & einladen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrgSection({ title, orgs, onSelect }: { title: string; orgs: Org[]; onSelect: (id: string) => void }) {
  if (orgs.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3">{title} ({orgs.length})</h2>
      <div className="space-y-1.5">
        {orgs.map(org => (
          <button
            key={org.id}
            onClick={() => onSelect(org.id)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-[#111116] hover:bg-[#1a1a24] border border-white/8 rounded-xl text-left transition-colors group"
            data-testid={`row-org-${org.id}`}
          >
            <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white text-sm truncate">
                  {org.companyName || org.name}
                </span>
                {org.verifiedAt ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                )}
              </div>
              <p className="text-xs text-white/40 truncate">
                {org.email} · {relTime(org.lastActivityAt)}
              </p>
            </div>
            <div className="hidden sm:flex flex-col items-end shrink-0 mr-1">
              <span className="text-sm font-semibold text-white" data-testid={`text-org-gmv-${org.id}`}>
                {fmtEur(org.gmv ?? 0)}
              </span>
              <span className="text-[11px] text-white/40">{org.orderCount ?? 0} Bestellungen</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="flex items-center gap-1 text-xs text-white/30">
                <Users className="h-3 w-3" />
                {org.memberCount}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-2 py-0 border ${
                  org.role === "restaurant"
                    ? "border-indigo-500/40 text-indigo-400"
                    : "border-emerald-500/40 text-emerald-400"
                }`}
              >
                {org.role === "restaurant" ? "Restaurant" : "Lieferant"}
              </Badge>
              <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/50 transition-colors" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
