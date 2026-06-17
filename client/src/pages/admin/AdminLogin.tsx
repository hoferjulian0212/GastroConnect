import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, Shield, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import logoImg from "@assets/logo_no_bg_thick.png";

interface AdminMeResponse {
  authenticated: boolean;
  admin?: { id: string; email: string | null; name: string; status: string };
}

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery<AdminMeResponse>({
    queryKey: ["/api/admin/auth/me"],
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (data?.authenticated) {
      setLocation("/admin");
    }
  }, [data, setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/admin/auth/login", { email, password });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/auth/me"] });
      setLocation("/admin");
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("403") || msg.includes("not_approved")) {
        setError("Dieses Admin-Konto ist nicht freigegeben.");
      } else if (msg.includes("429")) {
        setError("Zu viele Versuche. Bitte später erneut versuchen.");
      } else {
        setError("E-Mail oder Passwort ist falsch.");
      }
    } finally {
      setSubmitting(false);
    }
  }

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0e1117] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logoImg} alt="GastroConnect" className="h-14 w-14 object-contain invert" />
          <div className="text-center">
            <h1 className="text-xl font-bold text-white tracking-tight">GastroConnect</h1>
            <p className="text-sm text-white/50 mt-0.5">Platform Admin Panel</p>
          </div>
        </div>

        <Card className="bg-[#161921] border-white/10 text-white">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-blue-400" />
              Admin-Zugang
            </CardTitle>
            <CardDescription className="text-white/50 text-sm">
              Nur für GastroConnect-Systembetreiber
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-300" data-testid="text-admin-login-error">{error}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="admin-email" className="text-white/70 text-sm">E-Mail</Label>
                <Input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  placeholder="admin@gastroconnect.app"
                  data-testid="input-admin-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-password" className="text-white/70 text-sm">Passwort</Label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  placeholder="••••••••"
                  data-testid="input-admin-password"
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#F26207] hover:bg-[#e05500] text-white font-semibold rounded-xl h-11"
                data-testid="button-admin-login"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Anmelden"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-white/30">
          Zurück zur{" "}
          <a href="/" className="underline hover:text-white/60 transition-colors">
            App
          </a>
        </p>
      </div>
    </div>
  );
}
