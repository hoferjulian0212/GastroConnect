import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout, AdminBreadcrumb } from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Clock, Shield, UserX } from "lucide-react";

interface PlatformAdmin {
  id: string;
  replitUserId: string | null;
  replitUsername: string | null;
  name: string;
  email: string | null;
  status: "pending" | "approved" | "denied";
  approvedBy: string | null;
  approvedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function AdminAdmins() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: admins = [], isLoading } = useQuery<PlatformAdmin[]>({
    queryKey: ["/api/admin/admins"],
    staleTime: 15000,
  });

  const { data: me } = useQuery<{ admin?: { id: string } }>({
    queryKey: ["/api/admin/auth/me"],
    staleTime: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/admins/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      toast({ title: "Admin genehmigt", description: "Der Admin kann sich jetzt anmelden." });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const denyMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/admins/${id}/deny`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      toast({ title: "Admin abgelehnt" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/admins/${id}/revoke`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admins"] });
      toast({ title: "Zugang widerrufen" });
    },
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  });

  const pending = admins.filter(a => a.status === "pending");
  const approved = admins.filter(a => a.status === "approved");
  const denied = admins.filter(a => a.status === "denied");

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: "Organisationen", href: "/admin" }, { label: "Admins" }]} />

      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform-Admins</h1>
          <p className="text-white/40 text-sm mt-1">Verwalten Sie GastroConnect-Systemadministratoren</p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />)}
          </div>
        ) : (
          <>
            {pending.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-amber-400/80 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  Ausstehende Anträge ({pending.length})
                </h2>
                <div className="space-y-2">
                  {pending.map(admin => (
                    <AdminRow
                      key={admin.id}
                      admin={admin}
                      isSelf={admin.id === me?.admin?.id}
                      actions={
                        <>
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate(admin.id)}
                            disabled={approveMutation.isPending}
                            className="h-7 px-3 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
                            data-testid={`button-approve-${admin.id}`}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Genehmigen
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => denyMutation.mutate(admin.id)}
                            disabled={denyMutation.isPending}
                            className="h-7 px-3 text-xs text-red-400 hover:bg-red-500/10"
                            data-testid={`button-deny-${admin.id}`}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Ablehnen
                          </Button>
                        </>
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5" />
                Aktive Admins ({approved.length})
              </h2>
              {approved.length === 0 ? (
                <p className="text-white/30 text-sm py-4 text-center">Noch keine aktiven Admins</p>
              ) : (
                <div className="space-y-2">
                  {approved.map(admin => (
                    <AdminRow
                      key={admin.id}
                      admin={admin}
                      isSelf={admin.id === me?.admin?.id}
                      actions={
                        admin.id !== me?.admin?.id ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => revokeMutation.mutate(admin.id)}
                            disabled={revokeMutation.isPending}
                            className="h-7 px-3 text-xs text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                            data-testid={`button-revoke-${admin.id}`}
                          >
                            <UserX className="h-3 w-3 mr-1" />
                            Widerrufen
                          </Button>
                        ) : null
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            {denied.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-white/30 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5" />
                  Abgelehnt ({denied.length})
                </h2>
                <div className="space-y-2 opacity-60">
                  {denied.map(admin => (
                    <AdminRow
                      key={admin.id}
                      admin={admin}
                      isSelf={false}
                      actions={
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => approveMutation.mutate(admin.id)}
                          disabled={approveMutation.isPending}
                          className="h-7 px-3 text-xs text-white/40 hover:bg-white/5"
                        >
                          Wiederherstellen
                        </Button>
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function AdminRow({
  admin,
  isSelf,
  actions,
}: {
  admin: PlatformAdmin;
  isSelf: boolean;
  actions: React.ReactNode;
}) {
  const statusBadge = {
    pending: <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400">Ausstehend</Badge>,
    approved: <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-400">Aktiv</Badge>,
    denied: <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/40 text-red-400">Abgelehnt</Badge>,
  }[admin.status];

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-[#161921] border border-white/10 rounded-xl"
      data-testid={`row-admin-${admin.id}`}
    >
      <div className="h-9 w-9 rounded-full bg-[#F26207]/20 flex items-center justify-center shrink-0">
        <span className="text-[#F26207] text-sm font-bold">
          {admin.name.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-white text-sm">{admin.email ?? admin.name}</span>
          {isSelf && <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0 rounded">(Sie)</span>}
          {statusBadge}
          {admin.approvedBy === "auto" && (
            <span className="text-[10px] text-white/30">Auto-genehmigt</span>
          )}
        </div>
        <p className="text-xs text-white/40">
          {admin.name}
          {admin.email ? ` · ${admin.email}` : ""}
          {admin.lastLoginAt
            ? ` · Zuletzt: ${new Date(admin.lastLoginAt).toLocaleDateString("de-DE")}`
            : ""}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    </div>
  );
}
