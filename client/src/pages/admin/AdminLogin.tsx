import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, Clock, XCircle, Shield } from "lucide-react";
import logoImg from "@assets/logo_no_bg_thick.png";

interface AdminMeResponse {
  authenticated: boolean;
  configured: boolean;
  admin?: { id: string; replitUsername: string; name: string; status: string };
}

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<AdminMeResponse>({
    queryKey: ["/api/admin/auth/me"],
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStatus(params.get("status"));
    setError(params.get("error"));
  }, []);

  useEffect(() => {
    if (data?.authenticated) {
      setLocation("/admin");
    }
  }, [data, setLocation]);

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
          <CardContent className="space-y-4">
            {status === "pending" && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Clock className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-300">Antrag eingereicht</p>
                  <p className="text-amber-400/80 mt-0.5">Ihr Zugriffsantrag wurde übermittelt und wird von einem bestehenden Admin geprüft.</p>
                </div>
              </div>
            )}
            {status === "denied" && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-red-300">Zugriff verweigert</p>
                  <p className="text-red-400/80 mt-0.5">Ihr Zugriffsantrag wurde abgelehnt.</p>
                </div>
              </div>
            )}
            {error && error !== "oauth_failed" && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-sm text-red-300">Anmeldung fehlgeschlagen ({error}). Bitte erneut versuchen.</p>
              </div>
            )}
            {!data?.configured ? (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <AlertCircle className="h-4 w-4 text-white/40 mt-0.5 shrink-0" />
                <p className="text-sm text-white/50">
                  Replit OAuth ist nicht konfiguriert.<br />
                  Bitte <code className="bg-white/10 px-1 rounded text-xs">REPLIT_CLIENT_ID</code> und{" "}
                  <code className="bg-white/10 px-1 rounded text-xs">REPLIT_CLIENT_SECRET</code> setzen.
                </p>
              </div>
            ) : (
              <a href="/api/admin/auth/start" className="block w-full">
                <Button
                  className="w-full bg-[#F26207] hover:bg-[#e05500] text-white font-semibold rounded-xl h-11"
                  data-testid="button-admin-replit-login"
                >
                  Mit Replit anmelden
                </Button>
              </a>
            )}
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
