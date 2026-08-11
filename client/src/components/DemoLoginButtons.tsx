/**
 * Demo account quick-login panel shown below the Clerk sign-in widget
 * in non-production environments only.
 *
 * Clicking a tile calls POST /api/demo-login → gets a one-time Clerk
 * sign-in token → signs the user in instantly with no email/device
 * verification code required.
 */
import { useState } from "react";
// Use the legacy hook — it returns { isLoaded, signIn, setActive } and supports
// signIn.create({ strategy: "ticket", ticket }) which is what sign-in tokens
// require. The v6 default useSignIn returns the signal-based future API whose
// create() validates the ticket value against a stricter pattern and rejects it.
import { useSignIn } from "@clerk/react/legacy";
import { Loader2 } from "lucide-react";

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

export function DemoLoginButtons() {
  const { signIn, setActive } = useSignIn();
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (email: string) => {
    if (!signIn || !setActive) return;
    setError(null);
    setLoadingEmail(email);
    try {
      // 1. Get a one-time sign-in token from our server (demo whitelist gated).
      const res = await fetch("/api/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
      } else {
        throw new Error(`Unexpected sign-in status: ${result.status}`);
      }
    } catch (err: any) {
      setError(err?.message ?? "Anmeldung fehlgeschlagen");
    } finally {
      setLoadingEmail(null);
    }
  };

  const restaurant = DEMO_ACCOUNTS.filter((a) => a.group === "restaurant");
  const supplier   = DEMO_ACCOUNTS.filter((a) => a.group === "supplier");

  return (
    <div className="w-[440px] max-w-full mt-3">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
            Demo-Zugänge
          </p>
        </div>

        {/* Restaurant group */}
        <div className="px-5 pb-3">
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
            Restaurant · Gasthof Alpenblick
          </p>
          <div className="grid grid-cols-3 gap-2">
            {restaurant.map((a) => (
              <DemoTile
                key={a.email}
                account={a}
                loading={loadingEmail === a.email}
                disabled={loadingEmail !== null}
                onLogin={handleLogin}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-white/[0.07]" />

        {/* Supplier group */}
        <div className="px-5 pt-3 pb-4">
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
            Lieferant · Frische Produkte
          </p>
          <div className="grid grid-cols-4 gap-2">
            {supplier.map((a) => (
              <DemoTile
                key={a.email}
                account={a}
                loading={loadingEmail === a.email}
                disabled={loadingEmail !== null}
                onLogin={handleLogin}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="px-5 pb-4 text-xs text-red-400 text-center">{error}</div>
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
  onLogin: (email: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onLogin(account.email)}
      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/[0.09] active:bg-white/[0.12] transition-colors px-1 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-white/60" />
      ) : (
        <>
          <span className="text-white text-[13px] font-medium leading-none">
            {account.label}
          </span>
          <span className="text-white/40 text-[10px] leading-none">
            {account.role}
          </span>
        </>
      )}
    </button>
  );
}
