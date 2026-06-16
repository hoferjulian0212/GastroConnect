import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import Logo from "@/components/Logo";
import { apiRequest } from "@/lib/queryClient";

function passwordPolicyError(pw: string): string | null {
  if (pw.length < 12) return "Das Passwort muss mindestens 12 Zeichen lang sein.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return "Das Passwort muss Groß- und Kleinbuchstaben enthalten.";
  if (!/[0-9]/.test(pw)) return "Das Passwort muss mindestens eine Zahl enthalten.";
  return null;
}

interface ClaimInfo {
  email: string | null;
  name: string | null;
  orgName: string | null;
}

export default function AuthClaim() {
  const [, setLocation] = useLocation();
  const { refetchMe } = useUser();
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setInvalid(true);
        setLoading(false);
        return;
      }
      try {
        const res = await apiRequest("GET", `/api/auth/claim?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          if (!cancelled) setInvalid(true);
          return;
        }
        const data = (await res.json()) as ClaimInfo;
        if (!cancelled) setInfo(data);
      } catch {
        if (!cancelled) setInvalid(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const policy = passwordPolicyError(password);
    if (policy) {
      setError(policy);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/auth/claim", { token, password });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Aktivierung fehlgeschlagen.");
        return;
      }
      refetchMe();
      setLocation("/");
    } catch {
      setError("Aktivierung fehlgeschlagen. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#161921] text-white flex flex-col">
      <header className="px-4 md:px-8 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <button
          onClick={() => setLocation("/login")}
          className="flex items-center gap-2 text-white/80 hover:text-white"
          data-testid="link-back-login"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Zur Anmeldung</span>
        </button>
        <Logo size="nav" variant="light" data-testid="logo-claim" />
        <div className="w-24" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8" data-testid="screen-claim-loading">
              <div className="h-1.5 w-1.5 rounded-full bg-white animate-bounce [animation-delay:0ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-white animate-bounce [animation-delay:150ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-white animate-bounce [animation-delay:300ms]" />
            </div>
          ) : invalid ? (
            <div className="text-center" data-testid="screen-claim-invalid">
              <h1 className="text-2xl font-bold tracking-tight">Einladung ungültig</h1>
              <p className="mt-3 text-white/70">
                Diese Einladung ist ungültig oder abgelaufen. Bitten Sie Ihre
                Organisation, Sie erneut einzuladen.
              </p>
              <Button onClick={() => setLocation("/login")} className="mt-6 h-11 rounded-xl bg-white text-[#161921] hover:bg-white/90 font-semibold px-6" data-testid="button-claim-to-login">
                Zur Anmeldung
              </Button>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight" data-testid="text-claim-headline">Konto aktivieren</h1>
                <p className="mt-3 text-white/70">
                  {info?.orgName ? (
                    <>Willkommen bei <span className="text-white font-medium">{info.orgName}</span>. </>
                  ) : null}
                  Legen Sie ein Passwort fest, um loszulegen.
                </p>
                {info?.email && (
                  <p className="mt-2 text-sm text-white/50" data-testid="text-claim-email">{info.email}</p>
                )}
              </div>

              {error && (
                <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" data-testid="text-claim-error">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="claim-password" className="text-white/80">Passwort</Label>
                  <Input
                    id="claim-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                    placeholder="••••••••••••"
                    data-testid="input-claim-password"
                  />
                  <p className="text-xs text-white/40">Mindestens 12 Zeichen, Groß-/Kleinbuchstaben und eine Zahl.</p>
                </div>
                <Button type="submit" disabled={submitting} className="w-full h-11 rounded-xl bg-white text-[#161921] hover:bg-white/90 font-semibold" data-testid="button-claim-submit">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Konto aktivieren"}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
