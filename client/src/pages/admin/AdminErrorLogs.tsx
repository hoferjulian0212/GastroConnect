import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout, AdminBreadcrumb } from "./AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Bug, Server, Monitor, Trash2, ChevronDown, ChevronRight, Filter,
} from "lucide-react";

interface ErrorLogEntry {
  id: string;
  level: string;
  source: string;
  message: string;
  stack: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  userId: string | null;
  memberId: string | null;
  userAgent: string | null;
  context: Record<string, unknown> | null;
  createdAt: string;
}

const SOURCE_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Alle Quellen" },
  { value: "server", label: "Server" },
  { value: "client", label: "Browser" },
];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function AdminErrorLogs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const queryKey = source
    ? ["/api/admin/error-logs", { source }]
    : ["/api/admin/error-logs"];

  const { data: logs = [], isLoading } = useQuery<ErrorLogEntry[]>({
    queryKey,
    queryFn: async () => {
      const url = source ? `/api/admin/error-logs?source=${source}` : "/api/admin/error-logs";
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/error-logs"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/error-logs"] });
      toast({ title: "Fehlerprotokoll geleert", description: "Alle Einträge wurden entfernt." });
    },
    onError: () => toast({ title: "Fehler", description: "Konnte das Protokoll nicht leeren.", variant: "destructive" }),
  });

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.message.toLowerCase().includes(q) ||
      (l.path ?? "").toLowerCase().includes(q) ||
      (l.method ?? "").toLowerCase().includes(q) ||
      String(l.statusCode ?? "").includes(q)
    );
  });

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: "Dashboard", href: "/admin" }, { label: "Fehlerprotokolle" }]} />
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Fehlerprotokolle</h1>
            <p className="text-white/40 text-sm mt-1">
              {logs.length} {logs.length === 1 ? "Eintrag" : "Einträge"} · Server- & Browser-Fehler
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("Alle Fehlerprotokoll-Einträge dauerhaft löschen?")) clearMutation.mutate();
            }}
            disabled={clearMutation.isPending || logs.length === 0}
            className="h-9 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            data-testid="button-clear-error-logs"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Protokoll leeren
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input
              placeholder="Suche nach Nachricht, Pfad, Methode oder Status..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-[#161921] border-white/10 text-white placeholder:text-white/30 rounded-xl h-10"
              data-testid="input-error-search"
            />
          </div>
          <div className="flex items-center gap-1 bg-[#161921] border border-white/10 rounded-xl p-1">
            <Filter className="h-3.5 w-3.5 text-white/30 ml-1.5" />
            {SOURCE_FILTERS.map(f => (
              <button
                key={f.value || "all"}
                onClick={() => setSource(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  source === f.value ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
                }`}
                data-testid={`filter-source-${f.value || "all"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#161921] border border-white/10 rounded-2xl py-16 text-center">
            <Bug className="h-8 w-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm" data-testid="text-no-errors">
              {logs.length === 0 ? "Keine Fehler protokolliert" : "Keine Treffer"}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(l => {
              const isOpen = expanded.has(l.id);
              const isServer = l.source === "server";
              return (
                <div
                  key={l.id}
                  className="bg-[#161921] border border-white/10 rounded-xl overflow-hidden"
                  data-testid={`row-error-${l.id}`}
                >
                  <button
                    onClick={() => toggle(l.id)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isServer ? "bg-purple-500/10" : "bg-amber-500/10"}`}>
                      {isServer ? <Server className="h-4 w-4 text-purple-400" /> : <Monitor className="h-4 w-4 text-amber-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] px-2 py-0 border ${isServer ? "border-purple-500/40 text-purple-300" : "border-amber-500/40 text-amber-300"}`}>
                          {isServer ? "Server" : "Browser"}
                        </Badge>
                        {l.statusCode != null && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0 border border-red-500/40 text-red-300">
                            {l.statusCode}
                          </Badge>
                        )}
                        {l.method && l.path && (
                          <span className="text-[10px] text-white/40 font-mono truncate">{l.method} {l.path}</span>
                        )}
                      </div>
                      <p className="text-sm text-white/90 mt-1 truncate">{l.message}</p>
                      <p className="text-[11px] text-white/35 mt-0.5">{fmtTime(l.createdAt)}</p>
                    </div>
                    {isOpen ? <ChevronDown className="h-4 w-4 text-white/30 shrink-0 mt-1" /> : <ChevronRight className="h-4 w-4 text-white/20 shrink-0 mt-1" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3" data-testid={`detail-error-${l.id}`}>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mt-3">
                        {l.path && <DetailRow label="Pfad" value={`${l.method ?? ""} ${l.path}`.trim()} />}
                        {l.statusCode != null && <DetailRow label="Status" value={String(l.statusCode)} />}
                        {l.userId && <DetailRow label="Organisation" value={l.userId} mono />}
                        {l.memberId && <DetailRow label="Mitglied" value={l.memberId} mono />}
                        {l.userAgent && <DetailRow label="User-Agent" value={l.userAgent} />}
                      </div>
                      {l.stack && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Stacktrace</p>
                          <pre className="text-[11px] text-white/60 bg-black/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-72">{l.stack}</pre>
                        </div>
                      )}
                      {l.context && Object.keys(l.context).length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">Kontext</p>
                          <pre className="text-[11px] text-white/60 bg-black/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(l.context, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="text-white/30">{label}: </span>
      <span className={`text-white/70 break-words ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
