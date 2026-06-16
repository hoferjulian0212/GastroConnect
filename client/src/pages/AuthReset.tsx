import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import Logo from "@/components/Logo";
import { apiRequest } from "@/lib/queryClient";

function passwordPolicyError(pw: string): string | null {
  if (pw.length < 12) return "Das Passwort muss mindestens 12 Zeichen lang sein.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return "Das Passwort muss Groß- und Kleinbuchstaben enthalten.";
  if (!/[0-9]/.test(pw)) return "Das Passwort muss mindestens eine Zahl enthalten.";
  return null;
}

export default function AuthReset() {
  const [, setLocation] = useLocation();
  const { refetchMe } = useUser();
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/password-reset/request", { email });
      setSent(true);
    } catch {
      setError("Anfrage fehlgeschlagen. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
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
      const res = await apiRequest("POST", "/api/auth/password-reset/confirm", { token, password });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Zurücksetzen fehlgeschlagen.");
        return;
      }
      refetchMe();
      setLocation("/");
    } catch {
      setError("Zurücksetzen fehlgeschlagen. Bitte versuchen Sie es erneut.");
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
        <Logo size="nav" variant="light" data-testid="logo-reset" />
        <div className="w-24" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {error && (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" data-testid="text-reset-error">
              {error}
            </div>
          )}

          {token ? (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight" data-testid="text-reset-headline">Neues Passwort</h1>
                <p className="mt-3 text-white/70">Wählen Sie ein neues, sicheres Passwort.</p>
              </div>
              <form onSubmit={handleConfirm} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-password" className="text-white/80">Neues Passwort</Label>
                  <Input
                    id="reset-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                    placeholder="••••••••••••"
                    data-testid="input-reset-password"
                  />
                  <p className="text-xs text-white/40">Mindestens 12 Zeichen, Groß-/Kleinbuchstaben und eine Zahl.</p>
                </div>
                <Button type="submit" disabled={submitting} className="w-full h-11 rounded-xl bg-white text-[#161921] hover:bg-white/90 font-semibold" data-testid="button-reset-confirm">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Passwort speichern"}
                </Button>
              </form>
            </>
          ) : sent ? (
            <div className="text-center" data-testid="screen-reset-sent">
              <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">E-Mail gesendet</h1>
              <p className="mt-3 text-white/70">
                Falls ein Konto mit dieser E-Mail existiert, haben wir einen Link zum
                Zurücksetzen gesendet. Bitte prüfen Sie Ihr Postfach.
              </p>
              <Button onClick={() => setLocation("/login")} className="mt-6 h-11 rounded-xl bg-white text-[#161921] hover:bg-white/90 font-semibold px-6" data-testid="button-back-to-login">
                Zur Anmeldung
              </Button>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight" data-testid="text-reset-headline">Passwort zurücksetzen</h1>
                <p className="mt-3 text-white/70">Wir senden Ihnen einen Link zum Zurücksetzen.</p>
              </div>
              <form onSubmit={handleRequest} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email" className="text-white/80">E-Mail</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                    placeholder="name@betrieb.de"
                    data-testid="input-reset-email"
                  />
                </div>
                <Button type="submit" disabled={submitting} className="w-full h-11 rounded-xl bg-white text-[#161921] hover:bg-white/90 font-semibold" data-testid="button-reset-request">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link senden"}
                </Button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
