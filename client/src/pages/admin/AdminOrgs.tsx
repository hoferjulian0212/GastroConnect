import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "./AdminLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Building2, Users, ChevronRight, CheckCircle2, Clock } from "lucide-react";

interface Org {
  id: string;
  name: string;
  companyName: string | null;
  role: "restaurant" | "supplier";
  email: string;
  verifiedAt: string | null;
  memberCount: number;
  createdAt: string;
}

export default function AdminOrgs() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const { data: orgs = [], isLoading } = useQuery<Org[]>({
    queryKey: ["/api/admin/orgs"],
    staleTime: 30000,
  });

  const filtered = orgs.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.name.toLowerCase().includes(q) ||
      (o.companyName ?? "").toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q)
    );
  });

  const restaurants = filtered.filter(o => o.role === "restaurant");
  const suppliers = filtered.filter(o => o.role === "supplier");

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Organisationen</h1>
          <p className="text-white/40 text-sm mt-1">{orgs.length} Organisationen insgesamt</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <Input
            placeholder="Suche nach Name, Firma oder E-Mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-[#161921] border-white/10 text-white placeholder:text-white/30 rounded-xl h-10"
            data-testid="input-admin-org-search"
          />
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
    </AdminLayout>
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
            className="w-full flex items-center gap-3 px-4 py-3 bg-[#161921] hover:bg-[#1e2533] border border-white/10 rounded-xl text-left transition-colors group"
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
              <p className="text-xs text-white/40 truncate">{org.email}</p>
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
                    ? "border-blue-500/40 text-blue-400"
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
