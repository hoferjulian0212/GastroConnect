import { useEffect, useState, type ReactNode } from "react";
import { SignUp, useAuth, useClerk } from "@clerk/react";
import { apiRequest } from "@/lib/queryClient";
import { navigate } from "wouter/use-browser-location";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  RegistrationLocationPicker,
  type RegistrationCoordinates,
} from "@/components/RegistrationLocationPicker";
import { isValidRegistrationPhone } from "@shared/registrationValidation";
import logo from "@assets/logo_no_bg_thick.png";

type Form = {
  role: "" | "restaurant" | "supplier";
  companyName: string; contactName: string; phone: string; address: string;
  city: string; postalCode: string; profile: string;
  coordinates: RegistrationCoordinates | null;
  locationConfirmed: boolean;
};
const empty: Form = {
  role: "",
  companyName: "",
  contactName: "",
  phone: "",
  address: "",
  city: "",
  postalCode: "",
  profile: "",
  coordinates: null,
  locationConfirmed: false,
};
const KEY = "gc.registration";

function Shell({ children, step }: { children: ReactNode; step: number }) {
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
  const [form, setForm] = useState<Form>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || "{}");
      return {
        ...empty,
        ...saved,
        coordinates:
          saved.coordinates &&
          Number.isFinite(saved.coordinates.lat) &&
          Number.isFinite(saved.coordinates.lng)
            ? saved.coordinates
            : null,
        locationConfirmed: saved.locationConfirmed === true,
      };
    } catch {
      return empty;
    }
  });
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");

  const update = (key: keyof Form, value: string) =>
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "address" || key === "city" || key === "postalCode") {
        next.coordinates = null;
        next.locationConfirmed = false;
      }
      return next;
    });

  const validateStep = () => {
    const nextErrors: Record<string, string> = {};
    if (step === 1 && !form.role) {
      nextErrors.role = "Bitte wählen Sie Betrieb oder Händler.";
    }
    if (step === 2) {
      if (form.companyName.trim().length < 2) nextErrors.companyName = "Bitte geben Sie den Unternehmensnamen ein.";
      if (form.contactName.trim().length < 2) nextErrors.contactName = "Bitte geben Sie eine Ansprechperson ein.";
      if (!isValidRegistrationPhone(form.phone)) nextErrors.phone = "Bitte geben Sie eine gültige Telefonnummer mit 7–15 Ziffern ein.";
      if (form.address.trim().length < 3) nextErrors.address = "Bitte geben Sie Straße und Hausnummer ein.";
      if (form.city.trim().length < 2) nextErrors.city = "Bitte geben Sie den Ort ein.";
      if (form.postalCode.trim().length < 3) nextErrors.postalCode = "Bitte geben Sie eine gültige PLZ ein.";
      if (!form.coordinates) nextErrors.location = "Bitte prüfen Sie zuerst die Adresse auf der Karte.";
      else if (!form.locationConfirmed) nextErrors.location = "Bitte bestätigen Sie den genauen Standort auf der Karte.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const lookupAddress = async () => {
    const addressErrors: Record<string, string> = {};
    if (form.address.trim().length < 3) addressErrors.address = "Bitte geben Sie Straße und Hausnummer ein.";
    if (form.city.trim().length < 2) addressErrors.city = "Bitte geben Sie den Ort ein.";
    if (form.postalCode.trim().length < 3) addressErrors.postalCode = "Bitte geben Sie eine gültige PLZ ein.";
    if (Object.keys(addressErrors).length > 0) {
      setErrors((current) => ({ ...current, ...addressErrors }));
      return;
    }

    setGeocoding(true);
    setGeocodeError("");
    try {
      const response = await apiRequest("POST", "/api/auth/registration/geocode", {
        address: form.address.trim(),
        city: form.city.trim(),
        postalCode: form.postalCode.trim(),
      });
      const data = (await response.json()) as {
        coordinates?: RegistrationCoordinates;
      };
      if (!data.coordinates) throw new Error("no_coordinates");
      setForm((current) => ({
        ...current,
        coordinates: data.coordinates ?? null,
        locationConfirmed: false,
      }));
      setErrors((current) => ({ ...current, location: "" }));
    } catch {
      setForm((current) => ({
        ...current,
        coordinates: null,
        locationConfirmed: false,
      }));
      setGeocodeError("Diese Adresse wurde nicht gefunden. Bitte prüfen Sie Straße, PLZ und Ort.");
    } finally {
      setGeocoding(false);
    }
  };

  const next = () => {
    if (!validateStep()) return;
    sessionStorage.setItem(KEY, JSON.stringify(form));
    setStep((current) => current + 1);
  };

  if (step === 3) return <Shell step={3}><div className="rounded-3xl bg-white p-6 shadow-xl md:p-10"><h1 className="mb-2 text-3xl font-semibold">Konto erstellen</h1><p className="mb-6 text-sm text-black/55">Geben Sie Ihre E-Mail bei Clerk ein und bestätigen Sie den Code. Erst danach wird Ihre Registrierung angelegt.</p><SignUp routing="path" path="/register" signInUrl="/sign-in" forceRedirectUrl="/register/complete" /></div></Shell>;
  return <Shell step={step}>
    <div className="rounded-3xl bg-white p-6 shadow-xl md:p-10">
      {step === 1 ? <><p className="mb-2 text-sm font-medium uppercase tracking-widest text-black/45">Willkommen bei GastroConnect</p><h1 className="mb-3 text-3xl font-semibold">Wie möchten Sie GastroConnect nutzen?</h1><p className="mb-8 text-black/55">Wählen Sie Ihren Bereich. Wir passen die Registrierung daran an.</p><div className="grid gap-4 md:grid-cols-2" aria-invalid={Boolean(errors.role)}>
        {([["restaurant", "Betrieb", "Bestellen, Lieferanten finden und Abläufe vereinfachen"], ["supplier", "Händler", "Sortiment anbieten und Kunden zuverlässig beliefern"]] as const).map(([value, title, desc]) => <button type="button" key={value} onClick={() => { update("role", value); setErrors((current) => ({ ...current, role: "" })); }} className={`rounded-2xl border-2 p-5 text-left transition ${form.role === value ? "border-[#161921] bg-[#f1f1ed]" : "border-black/10 hover:border-black/30"}`}><strong className="block text-lg">{title}</strong><span className="mt-2 block text-sm text-black/55">{desc}</span></button>)}</div>{errors.role && <p className="mt-3 text-sm text-red-600" role="alert">{errors.role}</p>}</> :
      <><h1 className="mb-2 text-3xl font-semibold">Erzählen Sie uns von Ihrem Unternehmen</h1><p className="mb-6 text-black/55">Alle Angaben sind erforderlich, damit wir Ihr Unternehmen prüfen und für Bestellungen vorbereiten können.</p><div className="grid gap-4 md:grid-cols-2">{([["companyName", "Unternehmensname"], ["contactName", "Ansprechperson"], ["phone", "Telefonnummer"], ["address", "Straße und Hausnummer"], ["city", "Ort"], ["postalCode", "PLZ"]] as const).map(([key, label]) => <label key={key} className="text-sm font-medium">{label}<Input className="mt-1.5" type={key === "phone" ? "tel" : "text"} inputMode={key === "phone" ? "tel" : key === "postalCode" ? "numeric" : undefined} value={form[key]} onChange={e => update(key, e.target.value)} required aria-label={key === "phone" ? "Telefon" : key === "address" ? "Adresse" : undefined} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} />{errors[key] && <span id={`${key}-error`} className="mt-1 block text-xs font-normal text-red-600">{errors[key]}</span>}</label>)}</div><div className="mt-5 rounded-2xl border border-black/10 bg-[#fafaf8] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Standort auf der Karte festlegen</h2><p className="mt-1 text-sm text-black/55">Wir suchen die Adresse und Sie bestätigen anschließend den exakten Pin für Lieferungen und Stammdaten.</p></div><Button type="button" variant="outline" onClick={lookupAddress} disabled={geocoding}>{geocoding ? "Adresse wird gesucht…" : "Adresse auf Karte prüfen"}</Button></div>{geocodeError && <p className="mt-3 text-sm text-red-600" role="alert">{geocodeError}</p>}{!form.coordinates && errors.location && <p className="mt-3 text-sm text-red-600" role="alert">{errors.location}</p>}{form.coordinates && <div className="mt-4"><RegistrationLocationPicker coordinates={form.coordinates} onChange={(coordinates) => setForm((current) => ({ ...current, coordinates, locationConfirmed: false }))} /><p className="mt-2 text-xs text-black/55">Klicken Sie auf die Karte oder ziehen Sie den Pin auf den Eingang bzw. die Lieferadresse.</p><Button type="button" className="mt-3 w-full sm:w-auto" variant={form.locationConfirmed ? "secondary" : "default"} onClick={() => setForm((current) => ({ ...current, locationConfirmed: true }))}>{form.locationConfirmed ? "Standort bestätigt" : "Diesen Standort bestätigen"}</Button>{errors.location && <p className="mt-2 text-sm text-red-600" role="alert">{errors.location}</p>}</div>}</div><label className="mt-4 block text-sm font-medium">Kurzprofil (optional)<Textarea className="mt-1.5" value={form.profile} onChange={e => update("profile", e.target.value)} placeholder={form.role === "restaurant" ? "Zum Beispiel: Küche, Sitzplätze oder Schwerpunkte" : "Zum Beispiel: Liefergebiet und Sortiment"} /></label></>}
       <div className="mt-8 flex justify-between"><Button type="button" variant="ghost" onClick={() => step === 1 ? navigate("/") : setStep(1)}>Zurück</Button><Button type="button" onClick={next}>{step === 1 ? "Weiter" : "Mit E-Mail fortfahren"}</Button></div>
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