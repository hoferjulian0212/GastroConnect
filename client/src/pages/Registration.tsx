import { useEffect, useState, type ReactNode } from "react";
import { SignUp, useAuth, useClerk } from "@clerk/react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { navigate } from "wouter/use-browser-location";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/context/UserContext";
import {
  RegistrationLocationPicker,
  type RegistrationCoordinates,
} from "@/components/RegistrationLocationPicker";
import { isValidRegistrationPhone } from "@shared/registrationValidation";
import logo from "@assets/logo_no_bg_thick.png";
import { Building2, CheckCircle2, Clock3, LoaderCircle, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";

type AddressSuggestion = RegistrationCoordinates & {
  label: string;
  address?: string;
  city?: string;
  postalCode?: string;
};

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
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  useEffect(() => {
    if (step !== 2 || form.coordinates) {
      setSuggestions([]);
      return;
    }
    const queryLength = form.address.trim().length >= 3 || form.city.trim().length >= 2;
    if (!queryLength) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiRequest("POST", "/api/auth/registration/address-suggestions", {
          address: form.address,
          city: form.city,
          postalCode: form.postalCode,
        });
        const data = (await response.json()) as { suggestions?: AddressSuggestion[] };
        setSuggestions(data.suggestions ?? []);
        setSuggestionsOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [step, form.address, form.city, form.postalCode, form.coordinates]);

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

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    setForm((current) => ({
      ...current,
      address: suggestion.address || suggestion.label,
      city: suggestion.city || current.city,
      postalCode: suggestion.postalCode || current.postalCode,
      coordinates: { lat: suggestion.lat, lng: suggestion.lng },
      locationConfirmed: false,
    }));
    setSuggestions([]);
    setSuggestionsOpen(false);
    setGeocodeError("");
  };

  const next = () => {
    if (!validateStep()) return;
    sessionStorage.setItem(KEY, JSON.stringify(form));
    setStep((current) => current + 1);
  };

  if (step === 3) return <Shell step={3}><div className="rounded-3xl bg-white p-6 shadow-xl md:p-10"><h1 className="mb-2 text-3xl font-semibold">Konto erstellen</h1><p className="mb-6 text-sm text-black/55">Geben Sie Ihre E-Mail bei Clerk ein und bestätigen Sie den Code. Erst danach wird Ihre Registrierung angelegt.</p><SignUp routing="path" path="/register" signInUrl="/sign-in" forceRedirectUrl="/register/complete" /></div></Shell>;
  return <Shell step={step}>
    <div className="rounded-3xl bg-white p-6 shadow-xl md:p-10">
      {step === 1 ? <><p className="mb-2 text-sm font-medium uppercase tracking-widest text-black/45">Willkommen bei GastroConnect</p><h1 className="mb-3 text-3xl font-semibold">Wie möchten Sie GastroConnect nutzen?</h1><p className="mb-2 text-black/55">Wählen Sie Ihren Bereich. Wir passen die Registrierung daran an.</p><p className="mb-8 text-xs text-black/50"><span className="font-bold text-red-600" aria-hidden="true">*</span> Pflichtfeld</p><div className="grid gap-4 md:grid-cols-2" aria-invalid={Boolean(errors.role)}>
        {([["restaurant", "Betrieb", "Bestellen, Lieferanten finden und Abläufe vereinfachen"], ["supplier", "Händler", "Sortiment anbieten und Kunden zuverlässig beliefern"]] as const).map(([value, title, desc]) => <button type="button" key={value} onClick={() => { update("role", value); setErrors((current) => ({ ...current, role: "" })); }} className={`rounded-2xl border-2 p-5 text-left transition ${form.role === value ? "border-[#161921] bg-[#f1f1ed]" : "border-black/10 hover:border-black/30"}`}><strong className="block text-lg">{title}</strong><span className="mt-2 block text-sm text-black/55">{desc}</span></button>)}</div>{errors.role && <p className="mt-3 text-sm text-red-600" role="alert">{errors.role}</p>}</> :
      <><h1 className="mb-2 text-3xl font-semibold">Erzählen Sie uns von Ihrem Unternehmen</h1><p className="mb-2 text-black/55">Alle Angaben sind erforderlich, damit wir Ihr Unternehmen prüfen und für Bestellungen vorbereiten können.</p><p className="mb-6 text-xs text-black/50"><span className="font-bold text-red-600" aria-hidden="true">*</span> Pflichtfeld</p><div className="grid gap-4 md:grid-cols-2">{([["companyName", "Unternehmensname"], ["contactName", "Ansprechperson"], ["phone", "Telefonnummer"], ["address", "Straße und Hausnummer"], ["city", "Ort"], ["postalCode", "PLZ"]] as const).map(([key, label]) => <label key={key} className="text-sm font-medium"><span>{label} <span className="font-bold text-red-600" aria-hidden="true">*</span></span><div className="relative"><Input className="mt-1.5" type={key === "phone" ? "tel" : "text"} inputMode={key === "phone" ? "tel" : key === "postalCode" ? "numeric" : undefined} value={form[key]} onFocus={() => key === "address" && suggestions.length > 0 && setSuggestionsOpen(true)} onChange={e => update(key, e.target.value)} required aria-label={key === "phone" ? "Telefon" : key === "address" ? "Adresse" : label} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined} />{key === "address" && suggestionsOpen && suggestions.length > 0 && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-black/15 bg-white p-1 shadow-xl" role="listbox" aria-label="Adressvorschläge">{suggestions.map((suggestion) => <button type="button" key={`${suggestion.lat}-${suggestion.lng}-${suggestion.label}`} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-black/5" onMouseDown={(event) => event.preventDefault()} onClick={() => selectSuggestion(suggestion)} role="option"><span className="block font-medium">{suggestion.address || suggestion.label}</span><span className="block text-xs text-black/50">{[suggestion.postalCode, suggestion.city].filter(Boolean).join(" · ") || suggestion.label}</span></button>)}</div>}</div>{errors[key] && <span id={`${key}-error`} className="mt-1 block text-xs font-normal text-red-600">{errors[key]}</span>}</label>)}</div><div className="mt-5 rounded-2xl border border-black/10 bg-[#fafaf8] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Standort auf der Karte festlegen</h2><p className="mt-1 text-sm text-black/55">Beginnen Sie mit der Eingabe: passende Adressen erscheinen automatisch. Wählen Sie eine aus und bestätigen Sie anschließend den exakten Pin für Lieferungen und Stammdaten.</p></div><Button type="button" variant="outline" onClick={lookupAddress} disabled={geocoding}>{geocoding ? "Adresse wird gesucht…" : "Adresse auf Karte prüfen"}</Button></div>{geocodeError && <p className="mt-3 text-sm text-red-600" role="alert">{geocodeError}</p>}{!form.coordinates && errors.location && <p className="mt-3 text-sm text-red-600" role="alert">{errors.location}</p>}{form.coordinates && <div className="mt-4"><RegistrationLocationPicker coordinates={form.coordinates} onChange={(coordinates) => setForm((current) => ({ ...current, coordinates, locationConfirmed: false }))} /><p className="mt-2 text-xs text-black/55">Klicken Sie auf die Karte oder ziehen Sie den Pin auf den Eingang bzw. die Lieferadresse.</p><Button type="button" className="mt-3 w-full sm:w-auto" variant={form.locationConfirmed ? "secondary" : "default"} onClick={() => setForm((current) => ({ ...current, locationConfirmed: true }))}>{form.locationConfirmed ? "Standort bestätigt" : "Diesen Standort bestätigen"}</Button>{errors.location && <p className="mt-2 text-sm text-red-600" role="alert">{errors.location}</p>}</div>}</div><label className="mt-4 block text-sm font-medium">Kurzprofil (optional)<Textarea className="mt-1.5" value={form.profile} onChange={e => update("profile", e.target.value)} placeholder={form.role === "restaurant" ? "Zum Beispiel: Küche, Sitzplätze oder Schwerpunkte" : "Zum Beispiel: Liefergebiet und Sortiment"} /></label></>}
       <div className="mt-8 flex justify-between"><Button type="button" variant="ghost" onClick={() => step === 1 ? navigate("/") : setStep(1)}>Zurück</Button><Button type="button" onClick={next}>{step === 1 ? "Weiter" : "Mit E-Mail fortfahren"}</Button></div>
    </div>
  </Shell>;
}

export function RegistrationCompletePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [error, setError] = useState("");
  useEffect(() => { if (!isLoaded || !isSignedIn) return; let cancelled = false;
    (async () => { try { const data = JSON.parse(sessionStorage.getItem(KEY) || "{}"); await apiRequest("POST", "/api/auth/registration/complete", data); sessionStorage.removeItem(KEY); await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }); if (!cancelled) navigate("/registration-status"); } catch (e: any) { if (!cancelled) setError(e?.message || "Die Registrierung konnte nicht abgeschlossen werden."); } })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);
  return <Shell step={3}><div className="rounded-3xl bg-white p-8 text-center shadow-xl"><h1 className="text-3xl font-semibold">Registrierung wird abgeschlossen</h1><p className="mt-3 text-black/55">{error || "Ihre E-Mail wurde bestätigt. Wir speichern Ihre Unternehmensdaten sicher."}</p>{error && <Button className="mt-6" onClick={() => signOut({ redirectUrl: "/register" })}>Erneut versuchen</Button>}</div></Shell>;
}

export function RegistrationStatusPage() {
  const {
    isAuthenticated,
    currentRole,
    isLoading,
    registrationStatus,
  } = useUser();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(currentRole === "supplier" ? "/supplier" : "/restaurant");
    }
  }, [currentRole, isAuthenticated]);

  const shouldRedirectToSignIn = !isLoading && !isAuthenticated && !registrationStatus;
  useEffect(() => {
    if (shouldRedirectToSignIn) navigate("/sign-in");
  }, [shouldRedirectToSignIn]);

  if (shouldRedirectToSignIn) return null;

  return <PendingApprovalScreen denied={registrationStatus === "denied"} />;
}

export function PendingApprovalScreen({ denied = false }: { denied?: boolean }) {
  const { signOut } = useClerk();
  const {
    registrationOrganization,
    isRefreshingMe,
    refetchMe,
  } = useUser();
  const companyName = registrationOrganization?.companyName || registrationOrganization?.name || "Ihr Unternehmen";
  const submittedAt = registrationOrganization?.createdAt
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(registrationOrganization.createdAt))
    : undefined;

  return <div className="min-h-dvh bg-[#f7f7f4] px-4 py-7 text-[#161921] sm:px-6 sm:py-10">
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center justify-center">
        <img src={logo} alt="GastroConnect" className="h-12 w-12" />
      </div>
      <main className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-2xl shadow-black/10">
        <div className="bg-[#161921] px-6 py-7 text-white sm:px-10">
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            <span className={`h-2 w-2 rounded-full ${denied ? "bg-red-400" : "bg-amber-300 animate-pulse"}`} />
            {denied ? "Entscheidung verfügbar" : "Live-Status"}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{denied ? "Registrierung abgelehnt" : "Prüfung läuft"}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
            {denied
              ? "Ihre Registrierung wurde nicht freigegeben. Wenn Sie Rückfragen haben, wenden Sie sich bitte an das GastroConnect-Team."
              : "Ihre E-Mail ist bestätigt und Ihre Unternehmensdaten wurden sicher eingereicht. Unser Team prüft sie jetzt für die Freischaltung."}
          </p>
        </div>
        <div className="p-6 sm:p-10">
          <div className="rounded-2xl border border-black/10 bg-[#fafaf8] p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/5"><Building2 className="h-5 w-5" /></div>
              <div className="min-w-0"><p className="font-semibold">{companyName}</p><p className="mt-0.5 text-sm text-black/50">{registrationOrganization?.role === "supplier" ? "Händlerzugang" : "Betriebszugang"}{submittedAt ? ` · Eingereicht ${submittedAt}` : ""}</p></div>
            </div>
          </div>
          <ol className="mt-7 space-y-5" aria-label="Status der Registrierung">
            <li className="flex gap-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="font-semibold">E-Mail bestätigt</p><p className="mt-1 text-sm text-black/55">Ihre E-Mail-Adresse wurde erfolgreich verifiziert.</p></div></li>
            <li className="flex gap-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><p className="font-semibold">Unternehmen eingereicht</p><p className="mt-1 text-sm text-black/55">Ihre Kontaktdaten und Ihr bestätigter Standort liegen dem Team vor.</p></div></li>
            <li className="flex gap-4"><div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${denied ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>{denied ? <Clock3 className="h-3.5 w-3.5" /> : <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}</div><div><p className="font-semibold">{denied ? "Prüfung nicht freigegeben" : "Manuelle Prüfung läuft"}</p><p className="mt-1 text-sm text-black/55">{denied ? "Der Zugang bleibt bis zu einer erneuten Freigabe gesperrt." : "Sobald Ihr Zugang freigegeben wird, öffnen wir automatisch Ihr persönliches Dashboard."}</p></div></li>
          </ol>
          {!denied && <div className="mt-8 flex flex-col gap-3 border-t border-black/10 pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-2 text-sm text-black/50"><MailCheck className="h-4 w-4" />Wir aktualisieren diesen Status automatisch.</p><Button type="button" variant="outline" onClick={() => void refetchMe()} disabled={isRefreshingMe}><RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingMe ? "animate-spin" : ""}`} />{isRefreshingMe ? "Status wird geprüft…" : "Status jetzt prüfen"}</Button></div>}
          <div className="mt-6 flex items-center justify-between gap-4"><p className="text-xs text-black/45">{denied ? "Sie können sich mit einem anderen Konto anmelden." : "Sie können diese Seite schließen und später wiederkommen."}</p><Button type="button" variant="ghost" className="shrink-0" onClick={() => signOut({ redirectUrl: "/" })}><ShieldCheck className="mr-2 h-4 w-4" />Abmelden</Button></div>
        </div>
      </main>
    </div>
  </div>;
}