import { useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Store, Utensils, ArrowLeft } from "lucide-react";
import logoImg from "@assets/logo_no_bg.png";

export default function Login() {
  const [, setLocation] = useLocation();
  const { currentUser, currentRole, switchRole } = useUser();

  useEffect(() => {
    if (currentUser && currentRole) {
      setLocation(`/${currentRole}`);
    }
  }, [currentUser, currentRole]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");
    if (role === "supplier" || role === "restaurant") {
      switchRole(role);
      setLocation(`/${role}`);
    }
  }, []);

  function handleLogin(role: "supplier" | "restaurant") {
    switchRole(role);
    setLocation(`/${role}`);
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
        <div className="flex items-center gap-2">
          <img src={logoImg} alt="GastroConnect Logo" className="h-10 w-10 object-contain invert" />
          <span className="font-bold text-base tracking-tight">GastroConnect</span>
        </div>
        <div className="w-16" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight" data-testid="text-login-headline">
              Anmelden
            </h1>
            <p className="mt-3 text-white/70 text-base">
              Wählen Sie Ihre Rolle, um fortzufahren.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleLogin("supplier")}
              className="w-full rounded-2xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.10] p-5 flex items-center gap-4 text-left transition-colors"
              data-testid="button-login-supplier"
            >
              <div className="h-12 w-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Store className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-white">Als Händler anmelden</div>
                <div className="text-xs text-white/60 mt-0.5">Bestellungen verwalten, Kunden bedienen</div>
              </div>
            </button>

            <button
              onClick={() => handleLogin("restaurant")}
              className="w-full rounded-2xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.10] p-5 flex items-center gap-4 text-left transition-colors"
              data-testid="button-login-restaurant"
            >
              <div className="h-12 w-12 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
                <Utensils className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base text-white">Als Betrieb anmelden</div>
                <div className="text-xs text-white/60 mt-0.5">Bestellen, Lieferanten vergleichen, Ausgaben verfolgen</div>
              </div>
            </button>
          </div>

          <p className="text-xs text-white/50 text-center mt-8">
            Noch kein Konto? Wählen Sie eine Rolle, um direkt loszulegen — keine Registrierung nötig.
          </p>
        </div>
      </main>
    </div>
  );
}
