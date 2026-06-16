import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Mail, Store, Truck } from "lucide-react";
import Logo from "@/components/Logo";
import { apiRequest } from "@/lib/queryClient";

type Role = "restaurant" | "supplier";

function passwordPolicyError(pw: string): string | null {
  if (pw.length < 12) return "Das Passwort muss mindestens 12 Zeichen lang sein.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return "Das Passwort muss Groß- und Kleinbuchstaben enthalten.";
  if (!/[0-9]/.test(pw)) return "Das Passwort muss mindestens eine Zahl enthalten.";
  return null;
}

export default function Signup() {
  const [, setLocation] = useLocation();
  const initialRole = (new URLSearchParams(window.location.search).get("role") as Role) || "restaurant";

  const [role, setRole] = useState<Role>(initialRole === "supplier" ? "supplier" : "restaurant");
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    setResent(false);
  }, [sent]);

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
      const res = await apiRequest("POST", "/api/auth/register", {
        role,
        companyName,
        name,
        email,
        password,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.");
        return;
      }
      setSent(true);
    } catch {
      setError("Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/verify-email/resend", { email });
      setResent(true);
    } catch {
      /* always succeeds silently */
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-dvh bg-[#161921] text-white flex flex-col">
        <header className="px-4 md:px-8 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
          <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-white/80 hover:text-white" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Zur Startseite</span>
          </button>
          <Logo size="nav" variant="light" data-testid="logo-signup" />
          <div className="w-28" />
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md text-center" data-testid="screen-signup-sent">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Mail className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Bestätigen Sie Ihre E-Mail</h1>
            <p className="mt-3 text-white/70">
              Wir haben einen Bestätigungslink an <span className="font-semibold text-white">{email}</span> gesendet.
              Klicken Sie auf den Link, um Ihr Geschäftskonto zu aktivieren. Der Link ist 24 Stunden gültig.
            </p>
            {resent && (
              <p className="mt-4 text-sm text-emerald-300" data-testid="text-signup-resent">
                Bestätigungs-E-Mail erneut gesendet.
              </p>
            )}
            <div className="mt-6 flex flex-col gap-3">
              <Button
                onClick={handleResend}
                disabled={submitting}
                variant="outline"
                className="h-11 rounded-xl border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.10] hover:text-white"
                data-testid="button-signup-resend"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "E-Mail erneut senden"}
              </Button>
              <Button onClick={() => setLocation("/login")} className="h-11 rounded-xl bg-white text-[#161921] hover:bg-white/90 font-semibold" data-testid="button-signup-to-login">
                Zur Anmeldung
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#161921] text-white flex flex-col">
      <header className="px-4 md:px-8 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-white/80 hover:text-white" data-testid="link-back-home">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Zurück</span>
        </button>
        <Logo size="nav" variant="light" data-testid="logo-signup" />
        <div className="w-16" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-signup-headline">
              Geschäftskonto erstellen
            </h1>
            <p className="mt-3 text-white/70 text-base">
              Registrieren Sie Ihren Betrieb und laden Sie anschließend Ihr Team ein.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" data-testid="text-signup-error">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-5">
            <button
              type="button"
              onClick={() => setRole("restaurant")}
              className={`rounded-xl border px-4 py-3 flex flex-col items-center gap-1.5 transition-colors ${role === "restaurant" ? "border-white bg-white/[0.12]" : "border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"}`}
              data-testid="button-role-restaurant"
            >
              <Store className="h-5 w-5" />
              <span className="text-sm font-medium">Restaurant</span>
            </button>
            <button
              type="button"
              onClick={() => setRole("supplier")}
              className={`rounded-xl border px-4 py-3 flex flex-col items-center gap-1.5 transition-colors ${role === "supplier" ? "border-white bg-white/[0.12]" : "border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"}`}
              data-testid="button-role-supplier"
            >
              <Truck className="h-5 w-5" />
              <span className="text-sm font-medium">Lieferant</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="signup-company" className="text-white/80">Firmenname</Label>
              <Input
                id="signup-company"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                placeholder={role === "supplier" ? "Großhandel Mustermann GmbH" : "Restaurant Mustermann"}
                data-testid="input-signup-company"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signup-name" className="text-white/80">Ihr Name</Label>
              <Input
                id="signup-name"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                placeholder="Max Mustermann"
                data-testid="input-signup-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signup-email" className="text-white/80">E-Mail</Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                placeholder="name@betrieb.de"
                data-testid="input-signup-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signup-password" className="text-white/80">Passwort</Label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/[0.06] border-white/15 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                placeholder="••••••••••••"
                data-testid="input-signup-password"
              />
              <p className="text-xs text-white/40">Mindestens 12 Zeichen, Groß-/Kleinbuchstaben und eine Zahl.</p>
            </div>

            <Button type="submit" disabled={submitting} className="w-full h-11 rounded-xl bg-white text-[#161921] hover:bg-white/90 font-semibold" data-testid="button-signup-submit">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Geschäftskonto erstellen"}
            </Button>
          </form>

          <p className="text-xs text-white/50 text-center mt-8">
            Bereits ein Konto?{" "}
            <button onClick={() => setLocation("/login")} className="text-white/80 hover:text-white underline underline-offset-2" data-testid="link-to-login">
              Anmelden
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
