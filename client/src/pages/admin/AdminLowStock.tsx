import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout, AdminBreadcrumb } from "./AdminLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, PackageX, ChevronRight, Truck } from "lucide-react";

interface AdminLowStockProduct {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  stockQuantity: number;
  lowStockThreshold: number;
  supplierId: string;
  supplierName: string;
}

const UNIT_LABELS: Record<string, string> = {
  piece: "Stk.",
  kg: "kg",
  g: "g",
  l: "l",
  ml: "ml",
  box: "Kiste",
  pack: "Pack",
};

export default function AdminLowStock() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const { data: products = [], isLoading } = useQuery<AdminLowStockProduct[]>({
    queryKey: ["/api/admin/low-stock"],
    staleTime: 30000,
  });

  const filtered = products.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.supplierName.toLowerCase().includes(q) ||
      (p.category ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: "Dashboard", href: "/admin" }, { label: "Niedriger Bestand" }]} />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Niedriger Bestand</h1>
          <p className="text-white/40 text-sm mt-1">
            {products.length} {products.length === 1 ? "Produkt" : "Produkte"} auf oder unter der Mindestbestandsgrenze
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <Input
            placeholder="Suche nach Produkt, Lieferant oder Kategorie..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-[#111116] border-white/8 text-white placeholder:text-white/30 rounded-xl h-10"
            data-testid="input-admin-low-stock-search"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#111116] border border-white/8 rounded-2xl py-16 text-center">
            <PackageX className="h-8 w-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm" data-testid="text-no-low-stock">
              {products.length === 0 ? "Keine Produkte mit niedrigem Bestand" : "Keine Treffer"}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(p => {
              const isOut = p.stockQuantity <= 0;
              const unit = UNIT_LABELS[p.unit] ?? p.unit;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-3 bg-[#111116] border border-white/8 rounded-xl"
                  data-testid={`row-low-stock-${p.id}`}
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isOut ? "bg-red-500/10" : "bg-amber-500/10"}`}>
                    <PackageX className={`h-4 w-4 ${isOut ? "text-red-400" : "text-amber-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm truncate">{p.name}</span>
                      {p.category && (
                        <span className="text-[10px] text-white/40">{p.category}</span>
                      )}
                    </div>
                    <button
                      onClick={() => setLocation(`/admin/orgs/${p.supplierId}`)}
                      className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors mt-1"
                      data-testid={`link-supplier-${p.id}`}
                    >
                      <Truck className="h-3 w-3" />
                      {p.supplierName}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${isOut ? "text-red-400" : "text-white"}`} data-testid={`text-stock-${p.id}`}>
                        {p.stockQuantity} {unit}
                      </p>
                      <p className="text-[11px] text-white/40">Grenze: {p.lowStockThreshold} {unit}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-2 py-0 border ${isOut ? "border-red-500/40 text-red-400" : "border-amber-500/40 text-amber-400"}`}
                      data-testid={`badge-stock-status-${p.id}`}
                    >
                      {isOut ? "Ausverkauft" : "Niedrig"}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-white/20 hidden sm:block" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
