import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import Logo from "@/components/Logo";
import { apiRequest } from "@/lib/queryClient";

export default function Login() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, currentRole, providers, refetchMe } = useUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once authenticated (from /api/auth/me), leave the login screen.
  useEffect(() => {
    if (isAuthenticated) {
      setLocation(`/${currentRole}`);
    }
  }, [isAuthenticated, currentRole, setLocation]);

  // Surface OAuth callback errors passed back as ?error=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      setError("Anmeldung mit Google fehlgeschlagen. Bitte versuchen Sie es erneut.");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "E-Mail oder Passwort ist falsch.");
        return;
      }
      refetchMe();
    } catch {
      setError("Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#161921] text-white flex flex-col">
      <header className="px-4 md:px-8 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 text-white/80 hover:text-white"
          data-testid="link-back-home"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Zurück</span>
        </button>
        <div className="flex items-center">
          <Logo size="nav" variant="light" data-testid="logo-login" />
        </div>
        <div className="w-16" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-login-headline">
              Anmelden
            </h1>
            <p className="mt-3 text-white/70 text-base">
              Melden Sie sich mit Ihrem Konto an.
            </p>
          </div>

          {error && (
            <div
              className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              data-testid="text-login-error"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-white/80">E-Mail</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                placeholder="name@betrieb.de"
                data-testid="input-login-email"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password" className="text-white/80">Passwort</Label>
                <button
                  type="button"
                  onClick={() => setLocation("/auth/reset")}
                  className="text-xs text-white/60 hover:text-white"
                  data-testid="link-forgot-password"
                >
                  Passwort vergessen?
                </button>
              </div>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                placeholder="••••••••••••"
                data-testid="input-login-password"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-white text-[#161921] hover:bg-white/90 font-semibold"
              data-testid="button-login-submit"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Anmelden"}
            </Button>
          </form>

          {providers.google && (
            <>
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-white/40">oder</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <a
                href="/api/auth/oauth/google/start"
                className="w-full h-11 rounded-xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center gap-3 font-medium transition-colors"
                data-testid="button-login-google"
              >
                <SiGoogle className="h-4 w-4" />
                Mit Google anmelden
              </a>
            </>
          )}

          <p className="text-xs text-white/50 text-center mt-8">
            Kein Konto? Der Zugang erfolgt nur auf Einladung. Bitten Sie Ihre
            Organisation, Sie zum Team einzuladen.
          </p>
        </div>
      </main>
    </div>
  );
}
