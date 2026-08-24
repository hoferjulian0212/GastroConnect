/**
 * Demo account quick-login selector for the dedicated demo sign-in page.
 *
 * Clicking a tile calls POST /api/demo-login → gets a one-time Clerk
 * sign-in token → signs the user in instantly with no email/device
 * verification code required.
 */
import { useRef, useState } from "react";
// Use the legacy hook — it returns { isLoaded, signIn, setActive } and supports
// signIn.create({ strategy: "ticket", ticket }) which is what sign-in tokens
// require. The v6 default useSignIn returns the signal-based future API whose
// create() validates the ticket value against a stricter pattern and rejects it.
import { useSignIn } from "@clerk/react/legacy";
import { useAuth, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { ArrowLeft, Building2, Loader2, Store } from "lucide-react";

interface DemoAccount {
  email: string;
  label: string;
  role: string;
  group: "restaurant" | "supplier";
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  // Restaurant
  { email: "klaus@gasthof-alpenblick.de",  label: "Klaus",  role: "Admin",     group: "restaurant" },
  { email: "sepp@gasthof-alpenblick.de",   label: "Sepp",   role: "Manager",   group: "restaurant" },
  { email: "anita@gasthof-alpenblick.de",  label: "Anita",  role: "Staff",     group: "restaurant" },
  // Supplier
  { email: "hans@frische-produkte.de",     label: "Hans",   role: "Admin",     group: "supplier" },
  { email: "sabine@frische-produkte.de",   label: "Sabine", role: "Manager",   group: "supplier" },
  { email: "markus@frische-produkte.de",   label: "Markus", role: "Vertreter", group: "supplier" },
  { email: "lager@frische-produkte.de",    label: "Lager",  role: "Lager",     group: "supplier" },
  { email: "fahrer@frische-produkte.de",   label: "Fahrer", role: "Fahrer",    group: "supplier" },
];

export function DemoLoginButtons({ standalone = false }: { standalone?: boolean }) {
  const { signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loginInFlight = useRef(false);

  const handleLogin = async (account: DemoAccount) => {
    if (!signIn || !setActive || loginInFlight.current) return;
    loginInFlight.current = true;
    setError(null);
    setLoadingEmail(account.email);
    try {
      // A previous demo attempt may have activated Clerk before the app
      // navigated away from /sign-in. Clear that session first so switching
      // demo accounts never produces Clerk's "already signed in" error.
      if (isSignedIn) {
        await signOut();
      }

      // 1. Get a one-time sign-in token from our server (demo whitelist gated).
      const res = await fetch("/api/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account.email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { token } = await res.json();

      // 2. Use the ticket strategy — bypasses all MFA / device verification.
      const result = await signIn.create({
        strategy: "ticket",
        ticket: token,
      });

      // 3. status is 'complete' → activate the new session.
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        // Custom signIn.create does not apply the SignIn component's
        // afterSignInUrl, so explicitly leave the sign-in screen once the
        // session has been activated.
        setLocation(account.group === "restaurant" ? "/restaurant" : "/supplier");
      } else {
        throw new Error(`Unexpected sign-in status: ${result.status}`);
      }
    } catch (err: any) {
      setError(err?.message ?? "Anmeldung fehlgeschlagen");
    } finally {
      setLoadingEmail(null);
      loginInFlight.current = false;
    }
  };

  const restaurant = DEMO_ACCOUNTS.filter((a) => a.group === "restaurant");
  const supplier   = DEMO_ACCOUNTS.filter((a) => a.group === "supplier");

  const accountList = (accounts: DemoAccount[]) => (
    <div className="space-y-2">
      {accounts.map((a) => (
        <DemoTile
          key={a.email}
          account={a}
          loading={loadingEmail === a.email}
          disabled={loadingEmail !== null}
          onLogin={handleLogin}
        />
      ))}
    </div>
  );

  return (
    <div className={standalone ? "w-full max-w-xl" : "w-full"}>
      {standalone && (
        <button
          type="button"
          onClick={() => setLocation("/sign-in")}
          className="mb-5 inline-flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-white"
          data-testid="button-demo-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Zur normalen Anmeldung
        </button>
      )}
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 px-5 py-5 md:px-7">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/10 p-2.5 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">Demo-Benutzer anmelden</h1>
              <p className="mt-1 text-sm leading-relaxed text-white/55">
                Wählen Sie zuerst den Bereich und anschließend den gewünschten Benutzer.
                Keine echte E-Mail-Adresse und keine Verifizierung erforderlich.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2 md:p-7">
          <section aria-labelledby="demo-restaurant-heading">
            <div className="mb-3 flex items-center gap-2 text-white">
              <Store className="h-4 w-4 text-white/60" />
              <h2 id="demo-restaurant-heading" className="text-sm font-semibold">
                Restaurant
              </h2>
            </div>
            <p className="mb-3 text-xs text-white/40">Gasthof Alpenblick</p>
            {accountList(restaurant)}
          </section>

          <section aria-labelledby="demo-supplier-heading">
            <div className="mb-3 flex items-center gap-2 text-white">
              <Building2 className="h-4 w-4 text-white/60" />
              <h2 id="demo-supplier-heading" className="text-sm font-semibold">
                Lieferant
              </h2>
            </div>
            <p className="mb-3 text-xs text-white/40">Frische Produkte</p>
            {accountList(supplier)}
          </section>
        </div>

        {error && (
          <div className="border-t border-red-400/20 bg-red-400/10 px-5 py-3 text-center text-xs text-red-300" role="alert">
            Die Demo-Anmeldung konnte nicht gestartet werden. Bitte versuchen Sie es erneut.
          </div>
        )}
      </div>
    </div>
  );
}

function DemoTile({
  account,
  loading,
  disabled,
  onLogin,
}: {
  account: DemoAccount;
  loading: boolean;
  disabled: boolean;
  onLogin: (account: DemoAccount) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onLogin(account)}
      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-3 text-left transition-colors hover:bg-white/[0.09] active:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={`${account.label}, ${account.role}`}
      data-testid={`button-demo-login-${account.email}`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-white/60" />
      ) : (
        <span className="min-w-0">
          <span className="block text-sm font-medium text-white">{account.label}</span>
          <span className="mt-0.5 block truncate text-[11px] text-white/40">{account.email}</span>
        </span>
      )}
      {!loading && <span className="ml-3 shrink-0 text-xs font-medium text-white/45">{account.role}</span>}
    </button>
  );
}
