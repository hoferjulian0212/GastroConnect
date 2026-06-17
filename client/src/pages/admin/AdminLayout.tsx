import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Shield, Building2, Users, LogOut, ChevronRight, LayoutDashboard, FileWarning, PackageX, Bug } from "lucide-react";
import logoImg from "@assets/logo_no_bg_thick.png";
import type { ReactNode } from "react";

interface PendingCountResponse { count: number }

interface AdminMeResponse {
  authenticated: boolean;
  admin?: { id: string; email: string | null; name: string; status: string };
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AdminMeResponse>({
    queryKey: ["/api/admin/auth/me"],
    retry: false,
    staleTime: 10000,
  });

  const { data: pendingData } = useQuery<PendingCountResponse>({
    queryKey: ["/api/admin/orgs/pending-count"],
    enabled: !!data?.authenticated,
    staleTime: 30000,
    refetchInterval: 60000,
  });
  const pendingCount = pendingData?.count ?? 0;

  useEffect(() => {
    if (!isLoading && !data?.authenticated) {
      setLocation("/admin/login");
    }
  }, [data, isLoading, setLocation]);

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      setLocation("/admin/login");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e1117]">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-white/40 animate-bounce [animation-delay:0ms]" />
          <div className="h-2 w-2 rounded-full bg-white/40 animate-bounce [animation-delay:150ms]" />
          <div className="h-2 w-2 rounded-full bg-white/40 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    );
  }

  if (!data?.authenticated) return null;

  const navItems = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: "/admin/orgs", label: "Organisationen", icon: Building2 },
    { href: "/admin/complaints", label: "Reklamationen", icon: FileWarning },
    { href: "/admin/low-stock", label: "Bestand", icon: PackageX },
    { href: "/admin/error-logs", label: "Fehler-Logs", icon: Bug },
    { href: "/admin/admins", label: "Admins", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#0e1117] text-white flex flex-col">
      <header className="shrink-0 bg-[#161921] border-b border-white/10 px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <img src={logoImg} alt="GastroConnect" className="h-7 w-7 object-contain invert" />
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white text-sm">GastroConnect</span>
            <span className="text-white/30">·</span>
            <span className="flex items-center gap-1 text-xs text-blue-400">
              <Shield className="h-3 w-3" />
              Admin
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-1 ml-4">
          {navItems.map(item => {
            const active = item.exact ? location === item.href : location.startsWith(item.href + "/") || location === item.href;
            const isOrgs = item.href === "/admin/orgs";
            return (
              <Link key={item.href} href={item.href}>
                <span
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    active ? "bg-white/15 text-white" : "text-white/50 hover:text-white hover:bg-white/5"
                  }`}
                  data-testid={`admin-nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                  {isOrgs && pendingCount > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none cursor-pointer"
                      data-testid="badge-pending-orgs"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setLocation("/admin/orgs?filter=pending");
                      }}
                    >
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-white/50">{data.admin?.email ?? data.admin?.name}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="h-8 px-3 text-white/50 hover:text-white hover:bg-white/5 text-xs"
            data-testid="button-admin-logout"
          >
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            Abmelden
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}

export function AdminBreadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-white/40 mb-6">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {item.href ? (
            <Link href={item.href}>
              <span className="hover:text-white transition-colors cursor-pointer">{item.label}</span>
            </Link>
          ) : (
            <span className="text-white/70">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
