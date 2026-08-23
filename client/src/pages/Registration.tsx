import { useEffect, useState } from "react";
import { SignUp, useAuth, useClerk } from "@clerk/react";
import { apiRequest } from "@/lib/queryClient";
import { navigate } from "wouter/use-browser-location";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import logo from "@assets/logo_no_bg_thick.png";

type Form = {
  role: "restaurant" | "supplier";
  companyName: string; contactName: string; phone: string; address: string;
  city: string; postalCode: string; profile: string;
};
const empty: Form = { role: "restaurant", companyName: "", contactName: "", phone: "", address: "", city: "", postalCode: "", profile: "" };
const KEY = "gc.registration";

function Shell({ children, step }: { children: React.ReactNode; step: number }) {
  return <div className="min-h-dvh bg-[#f8f8f6] px-4 py-8 text-[#161921]">
    <div className="mx-auto max-w-2xl">
      <a href="/" className="mb-8 flex items-center justify-center"><img src={logo} className="h-12 w-12" alt="GastroConnect" /></a>
      <div className="mb-8 flex justify-center gap-2" aria-label={`Schritt ${step} von 3`}>
        {[1, 2, 3].map(n => <div key={n} className={`h-1.5 w-16 rounded-full ${n <= step ? "bg-[#161921]" : "bg-black/10"}`} />)}
      </div>
      {children}
    </div>
  </div>;
}

export function RegistrationPage() {
  const [form, setForm] = useState<Form>(() => { try { return { ...empty, ...JSON.parse(sessionStorage.getItem(KEY) || "{}") }; } catch { return empty; } });
  const [step, setStep] = useState(1);
  const update = (key: keyof Form, value: string) => setForm(f => ({ ...f, [key]: value }));
  const next = () => { sessionStorage.setItem(KEY, JSON.stringify(form)); setStep(s => s + 1); };
  if (step === 3) return <Shell step={3}><div className="rounded-3xl bg-white p-6 shadow-xl md:p-10"><h1 className="mb-2 text-3xl font-semibold">Konto erstellen</h1><p className="mb-6 text-sm text-black/55">Bestätigen Sie Ihre E-Mail mit dem Code, den Clerk Ihnen sendet.</p><SignUp routing="path" path="/register" signInUrl="/sign-in" forceRedirectUrl="/register/complete" /></div></Shell>;
  return <Shell step={step}>
    <div className="rounded-3xl bg-white p-6 shadow-xl md:p-10">
      {step === 1 ? <><p className="mb-2 text-sm font-medium uppercase tracking-widest text-black/45">Willkommen bei GastroConnect</p><h1 className="mb-3 text-3xl font-semibold">Wie möchten Sie GastroConnect nutzen?</h1><p className="mb-8 text-black/55">Wählen Sie Ihren Bereich. Wir passen die Registrierung daran an.</p><div className="grid gap-4 md:grid-cols-2">
        {([["restaurant", "Betrieb", "Bestellen, Lieferanten finden und Abläufe vereinfachen"], ["supplier", "Händler", "Sortiment anbieten und Kunden zuverlässig beliefern"]] as const).map(([value, title, desc]) => <button type="button" key={value} onClick={() => update("role", value)} className={`rounded-2xl border-2 p-5 text-left transition ${form.role === value ? "border-[#161921] bg-[#f1f1ed]" : "border-black/10 hover:border-black/30"}`}><strong className="block text-lg">{title}</strong><span className="mt-2 block text-sm text-black/55">{desc}</span></button>)}</div></> :
      <><h1 className="mb-2 text-3xl font-semibold">Erzählen Sie uns von Ihrem Unternehmen</h1><p className="mb-6 text-black/55">Diese Angaben helfen uns, Ihren Zugang zu prüfen und vorzubereiten.</p><div className="grid gap-4 md:grid-cols-2">{([["companyName", "Unternehmensname"], ["contactName", "Ansprechperson"], ["phone", "Telefon"], ["address", "Adresse"], ["city", "Ort"], ["postalCode", "PLZ"]] as const).map(([key, label]) => <label key={key} className="text-sm font-medium">{label}<Input className="mt-1.5" value={form[key]} onChange={e => update(key, e.target.value)} required /></label>)}</div><label className="mt-4 block text-sm font-medium">Kurzprofil (optional)<Textarea className="mt-1.5" value={form.profile} onChange={e => update("profile", e.target.value)} placeholder={form.role === "restaurant" ? "Zum Beispiel: Küche, Sitzplätze oder Schwerpunkte" : "Zum Beispiel: Liefergebiet und Sortiment"} /></label></>}
      <div className="mt-8 flex justify-between"><Button variant="ghost" onClick={() => step === 1 ? navigate("/") : setStep(1)}>Zurück</Button><Button onClick={next}>{step === 1 ? "Weiter" : "Mit E-Mail fortfahren"}</Button></div>
    </div>
  </Shell>;
}

export function RegistrationCompletePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [error, setError] = useState("");
  useEffect(() => { if (!isLoaded || !isSignedIn) return; let cancelled = false;
    (async () => { try { const data = JSON.parse(sessionStorage.getItem(KEY) || "{}"); await apiRequest("POST", "/api/auth/registration/complete", data); sessionStorage.removeItem(KEY); if (!cancelled) navigate("/"); } catch (e: any) { if (!cancelled) setError(e?.message || "Die Registrierung konnte nicht abgeschlossen werden."); } })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);
  return <Shell step={3}><div className="rounded-3xl bg-white p-8 text-center shadow-xl"><h1 className="text-3xl font-semibold">Registrierung wird abgeschlossen</h1><p className="mt-3 text-black/55">{error || "Ihre E-Mail wurde bestätigt. Wir speichern Ihre Unternehmensdaten sicher."}</p>{error && <Button className="mt-6" onClick={() => signOut({ redirectUrl: "/register" })}>Erneut versuchen</Button>}</div></Shell>;
}

export function PendingApprovalScreen({ denied = false }: { denied?: boolean }) {
  const { signOut } = useClerk();
  return <div className="flex min-h-dvh items-center justify-center bg-[#161921] px-6"><div className="max-w-md text-center text-white"><img src={logo} alt="GastroConnect" className="mx-auto mb-7 h-20 w-20 invert" /><h1 className="text-3xl font-semibold">{denied ? "Registrierung abgelehnt" : "Prüfung läuft"}</h1><p className="mt-4 leading-relaxed text-white/65">{denied ? "Ihre Registrierung wurde nicht freigegeben. Bitte wenden Sie sich an das GastroConnect-Team." : "Ihre E-Mail ist bestätigt. Unser Team prüft Ihre Unternehmensdaten. Sie erhalten eine Nachricht, sobald Ihr Zugang freigeschaltet wurde."}</p><Button variant="outline" className="mt-8 border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => signOut({ redirectUrl: "/" })}>Abmelden</Button></div></div>;
}