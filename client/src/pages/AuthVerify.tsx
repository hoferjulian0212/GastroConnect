import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, CheckCircle2, XCircle } from "lucide-react";
import Logo from "@/components/Logo";
import { apiRequest } from "@/lib/queryClient";

type Status = "loading" | "success" | "error";

export default function AuthVerify() {
  const [, setLocation] = useLocation();
  const { refetchMe } = useUser();
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [status, setStatus] = useState<Status>("loading");
  const [role, setRole] = useState<string>("restaurant");
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setStatus("error");
      return;
    }
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/auth/verify-email", { token });
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (data?.org?.role) setRole(data.org.role);
        setStatus("success");
        refetchMe();
      } catch {
        setStatus("error");
      }
    })();
  }, [token, refetchMe]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (resending) return;
    setResending(true);
    try {
      await apiRequest("POST", "/api/auth/verify-email/resend", { email });
      setResent(true);
    } catch {
      /* always succeeds silently */
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#161921] text-white flex flex-col">
      <header className="px-4 md:px-8 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-white/80 hover:text-white" data-testid="link-back-home">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Zur Startseite</span>
        </button>
        <Logo size="nav" variant="light" data-testid="logo-verify" />
        <div className="w-28" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          {status === "loading" && (
            <div data-testid="screen-verify-loading">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-white/70" />
              <h1 className="mt-5 text-2xl font-bold tracking-tight">E-Mail wird bestätigt …</h1>
              <p className="mt-3 text-white/70">Einen Moment bitte.</p>
            </div>
          )}

          {status === "success" && (
            <div data-testid="screen-verify-success">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">E-Mail bestätigt</h1>
              <p className="mt-3 text-white/70">
                Ihr Geschäftskonto ist jetzt aktiv. Sie sind angemeldet und können loslegen.
              </p>
              <Button onClick={() => setLocation(`/${role}`)} className="mt-6 h-11 rounded-xl bg-white text-[#161921] hover:bg-white/90 font-semibold px-6" data-testid="button-verify-continue">
                Zum Dashboard
              </Button>
            </div>
          )}

          {status === "error" && (
            <div data-testid="screen-verify-error">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                <XCircle className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Link ungültig oder abgelaufen</h1>
              <p className="mt-3 text-white/70">
                Dieser Bestätigungslink ist nicht mehr gültig. Geben Sie Ihre E-Mail-Adresse ein,
                um einen neuen Link zu erhalten.
              </p>
              {resent ? (
                <p className="mt-6 text-sm text-emerald-300" data-testid="text-verify-resent">
                  Falls ein Konto auf Bestätigung wartet, haben wir einen neuen Link gesendet.
                </p>
              ) : (
                <form onSubmit={handleResend} className="mt-6 space-y-3 text-left">
                  <div className="space-y-1.5">
                    <Label htmlFor="verify-email" className="text-white/80">E-Mail</Label>
                    <Input
                      id="verify-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                      placeholder="name@betrieb.de"
                      data-testid="input-verify-email"
                    />
                  </div>
                  <Button type="submit" disabled={resending} className="w-full h-11 rounded-xl bg-white text-[#161921] hover:bg-white/90 font-semibold" data-testid="button-verify-resend">
                    {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Neuen Link senden"}
                  </Button>
                </form>
              )}
              <Button onClick={() => setLocation("/login")} variant="ghost" className="mt-4 text-white/70 hover:text-white hover:bg-white/[0.06]" data-testid="button-verify-to-login">
                Zur Anmeldung
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
