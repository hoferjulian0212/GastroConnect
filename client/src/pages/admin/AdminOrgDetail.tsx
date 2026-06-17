import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout, AdminBreadcrumb } from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, User, Mail, Phone, MapPin, CheckCircle2, Clock,
  Users, ArrowLeft, UserCheck,
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
    createdAt: string;
  };
  members: OrgMember[];
}

export default function AdminOrgDetail({ params }: { params: { id: string } }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<OrgDetailResponse>({
    queryKey: ["/api/admin/orgs", params.id, "members"],
    queryFn: () => fetch(`/api/admin/orgs/${params.id}/members`).then(r => r.json()),
    retry: false,
  });

  const impersonateMutation = useMutation({
    mutationFn: (memberId: string) => apiRequest("POST", `/api/admin/impersonate/${memberId}`),
    onSuccess: (_data, memberId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation-status"] });
      toast({ title: "Impersonierung gestartet", description: "Sie agieren jetzt als dieses Mitglied." });
      setLocation("/");
    },
    onError: () => {
      toast({ title: "Fehler", description: "Impersonierung fehlgeschlagen.", variant: "destructive" });
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

  if (!data) {
    return (
      <AdminLayout>
        <p className="text-white/50">Organisation nicht gefunden.</p>
      </AdminLayout>
    );
  }

  const { org, members } = data;
  const displayName = org.companyName || org.name;

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[
        { label: "Organisationen", href: "/admin" },
        { label: displayName },
      ]} />

      <div className="space-y-6">
        <div className="bg-[#161921] border border-white/10 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
              <Building2 className="h-6 w-6 text-white/50" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-white">{displayName}</h1>
                {org.verifiedAt ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verifiziert
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
                      ? "border-blue-500/40 text-blue-400"
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
                className="flex items-center gap-3 px-4 py-3 bg-[#161921] border border-white/10 rounded-xl"
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
                  </div>
                  <p className="text-xs text-white/40 truncate">{member.email ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {member.lastLoginAt && (
                    <span className="text-xs text-white/30 hidden sm:block">
                      {new Date(member.lastLoginAt).toLocaleDateString("de-DE")}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => impersonateMutation.mutate(member.id)}
                    disabled={impersonateMutation.isPending}
                    className="h-7 px-3 text-xs border-white/20 bg-white/5 hover:bg-white/10 text-white"
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
      </div>
    </AdminLayout>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; color: string }> = {
    admin: { label: "Admin", color: "border-purple-500/40 text-purple-400" },
    manager: { label: "Manager", color: "border-blue-500/40 text-blue-400" },
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
