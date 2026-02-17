import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import logoImg from "@assets/Gemini_Generated_Image_lqyjgblqyjgblqyj-Photoroom_1771323869859.png";
import {
  ShoppingCart,
  MessageSquare,
  BarChart3,
  Clock,
  Truck,
  FileText,
  CheckCircle2,
  ArrowRight,
  Utensils,
  Store,
  Zap,
  Shield,
  ChevronRight,
  Languages,
} from "lucide-react";

type Lang = "de" | "it";

const translations = {
  de: {
    navSupplier: "Lieferant",
    navRestaurant: "Restaurant",
    heroBadge: "Die Plattform für die Gastronomie",
    heroH1Part1: "Bestellungen.",
    heroH1Part2: "Einfach.",
    heroH1Part3: "Digital.",
    heroSub: "GastroConnect verbindet Restaurants und Lieferanten auf einer Plattform. Bestellen, kommunizieren und verwalten — alles an einem Ort.",
    heroCtaSupplier: "Als Lieferant starten",
    heroCtaRestaurant: "Als Restaurant starten",
    problemHeadline: "Warum Gastronomie neu gedacht werden muss",
    problemSub: "Telefonate, Faxbestellungen und unübersichtliche Excel-Listen kosten Restaurants und Lieferanten jeden Tag wertvolle Zeit und Nerven.",
    problemCards: [
      { title: "Zeitverschwendung", desc: "Manuelle Bestellprozesse per Telefon, Fax oder E-Mail sind fehleranfällig und kosten Stunden pro Woche." },
      { title: "Fehlende Übersicht", desc: "Ohne zentrale Plattform gehen Bestellungen, Preise und Absprachen schnell verloren." },
      { title: "Kommunikationsprobleme", desc: "Rückfragen zu Bestellungen und Reklamationen laufen über verschiedene Kanäle — chaotisch und langsam." },
    ],
    solutionHeadline: "Eine Plattform. Alles im Griff.",
    solutionSub: "GastroConnect digitalisiert den gesamten Bestellprozess zwischen Restaurants und Lieferanten — von der Produktsuche bis zur Lieferung.",
    features: [
      { title: "Digitale Bestellungen", desc: "Produkte durchsuchen, in den Warenkorb legen und direkt beim Lieferanten bestellen." },
      { title: "Integrierter Chat", desc: "Direkte Kommunikation zwischen Restaurant und Lieferant — inklusive Dateien und Bilder." },
      { title: "Liefertage-Planung", desc: "Lieferanten legen Liefertage pro Restaurant fest. Restaurants wählen passende Termine." },
      { title: "Bestell-Übersicht", desc: "Alle Bestellungen mit Status-Tracking, Änderungsanfragen und visueller Zeitleiste." },
      { title: "Dokumente & Lieferscheine", desc: "Automatische Lieferschein-Erstellung als PDF mit direktem Versand im Chat." },
      { title: "Reklamations-Management", desc: "Beschwerden strukturiert erfassen, bearbeiten und den Status transparent nachverfolgen." },
    ],
    supplierBadge: "Für Lieferanten",
    supplierHeadline: "Mehr Kunden. Weniger Aufwand.",
    supplierPoints: [
      "Produktkatalog digital verwalten und aktuell halten",
      "Bestellungen zentral empfangen und bearbeiten",
      "Aktionen und Rabatte gezielt für Kunden erstellen",
      "Liefertage pro Restaurant individuell festlegen",
      "Lieferscheine automatisch generieren und versenden",
      "Direkte Kommunikation ohne Umwege",
    ],
    supplierCta: "Als Lieferant starten",
    restaurantBadge: "Für Restaurants",
    restaurantHeadline: "Schneller bestellen. Besser planen.",
    restaurantPoints: [
      "Alle Lieferanten und Produkte in einem Katalog",
      "Warenkorb mit Bestellungen bei mehreren Lieferanten",
      "Wunsch-Liefertermine bei der Bestellung angeben",
      "Bestellungen nachträglich ändern oder anpassen",
      "Reklamationen direkt an den Lieferanten melden",
      "Volle Übersicht über alle laufenden Bestellungen",
    ],
    restaurantCta: "Als Restaurant starten",
    stepsHeadline: "So funktioniert es",
    stepsSub: "In wenigen Schritten zur digitalen Bestellabwicklung.",
    steps: [
      { title: "Rolle wählen", desc: "Starten Sie als Restaurant oder Lieferant — ohne Registrierung." },
      { title: "Produkte entdecken", desc: "Restaurants durchsuchen den Katalog und finden passende Lieferanten." },
      { title: "Bestellen & Kommunizieren", desc: "Bestellungen aufgeben, Liefertermine wählen und direkt chatten." },
      { title: "Liefern & Verwalten", desc: "Lieferanten bearbeiten Bestellungen, erstellen Dokumente und liefern." },
    ],
    ctaHeadline: "Bereit, Ihren Bestellprozess zu digitalisieren?",
    ctaSub: "Starten Sie jetzt und erleben Sie, wie einfach Gastronomie-Bestellungen sein können.",
    ctaSupplier: "Als Lieferant starten",
    ctaRestaurant: "Als Restaurant starten",
    footerTagline: "Die digitale Plattform für Gastronomie-Bestellungen.",
  },
  it: {
    navSupplier: "Fornitore",
    navRestaurant: "Ristorante",
    heroBadge: "La piattaforma per la gastronomia",
    heroH1Part1: "Ordini.",
    heroH1Part2: "Semplici.",
    heroH1Part3: "Digitali.",
    heroSub: "GastroConnect collega ristoranti e fornitori su un'unica piattaforma. Ordinare, comunicare e gestire — tutto in un unico posto.",
    heroCtaSupplier: "Inizia come fornitore",
    heroCtaRestaurant: "Inizia come ristorante",
    problemHeadline: "Perché la gastronomia ha bisogno di innovazione",
    problemSub: "Telefonate, ordini via fax e fogli Excel confusi costano ogni giorno tempo prezioso e stress a ristoranti e fornitori.",
    problemCards: [
      { title: "Spreco di tempo", desc: "Processi di ordinazione manuali via telefono, fax o e-mail sono soggetti a errori e richiedono ore ogni settimana." },
      { title: "Mancanza di visione d'insieme", desc: "Senza una piattaforma centrale, ordini, prezzi e accordi si perdono rapidamente." },
      { title: "Problemi di comunicazione", desc: "Le richieste sugli ordini e i reclami passano attraverso diversi canali — caotico e lento." },
    ],
    solutionHeadline: "Una piattaforma. Tutto sotto controllo.",
    solutionSub: "GastroConnect digitalizza l'intero processo di ordinazione tra ristoranti e fornitori — dalla ricerca dei prodotti alla consegna.",
    features: [
      { title: "Ordini digitali", desc: "Cerca prodotti, aggiungili al carrello e ordina direttamente dal fornitore." },
      { title: "Chat integrata", desc: "Comunicazione diretta tra ristorante e fornitore — inclusi file e immagini." },
      { title: "Pianificazione consegne", desc: "I fornitori definiscono i giorni di consegna per ogni ristorante. I ristoranti scelgono le date adatte." },
      { title: "Panoramica ordini", desc: "Tutti gli ordini con tracking dello stato, richieste di modifica e timeline visuale." },
      { title: "Documenti e bolle di consegna", desc: "Creazione automatica di bolle di consegna in PDF con invio diretto in chat." },
      { title: "Gestione reclami", desc: "Registra, gestisci e monitora lo stato dei reclami in modo strutturato e trasparente." },
    ],
    supplierBadge: "Per i fornitori",
    supplierHeadline: "Più clienti. Meno fatica.",
    supplierPoints: [
      "Gestisci e aggiorna il catalogo prodotti digitalmente",
      "Ricevi e gestisci gli ordini centralmente",
      "Crea promozioni e sconti mirati per i clienti",
      "Imposta i giorni di consegna per ogni ristorante",
      "Genera e invia automaticamente le bolle di consegna",
      "Comunicazione diretta senza intermediari",
    ],
    supplierCta: "Inizia come fornitore",
    restaurantBadge: "Per i ristoranti",
    restaurantHeadline: "Ordina più velocemente. Pianifica meglio.",
    restaurantPoints: [
      "Tutti i fornitori e prodotti in un unico catalogo",
      "Carrello con ordini da più fornitori",
      "Indica la data di consegna desiderata nell'ordine",
      "Modifica o adatta gli ordini successivamente",
      "Invia reclami direttamente al fornitore",
      "Panoramica completa su tutti gli ordini in corso",
    ],
    restaurantCta: "Inizia come ristorante",
    stepsHeadline: "Come funziona",
    stepsSub: "In pochi passi alla gestione digitale degli ordini.",
    steps: [
      { title: "Scegli il ruolo", desc: "Inizia come ristorante o fornitore — senza registrazione." },
      { title: "Scopri i prodotti", desc: "I ristoranti esplorano il catalogo e trovano i fornitori adatti." },
      { title: "Ordina e comunica", desc: "Effettua ordini, scegli le date di consegna e chatta direttamente." },
      { title: "Consegna e gestisci", desc: "I fornitori elaborano gli ordini, creano documenti e consegnano." },
    ],
    ctaHeadline: "Pronto a digitalizzare il tuo processo di ordinazione?",
    ctaSub: "Inizia ora e scopri quanto possono essere semplici gli ordini nella gastronomia.",
    ctaSupplier: "Inizia come fornitore",
    ctaRestaurant: "Inizia come ristorante",
    footerTagline: "La piattaforma digitale per gli ordini nella gastronomia.",
  },
} as const;

const featureIcons = [ShoppingCart, MessageSquare, Truck, BarChart3, FileText, Shield];
const problemIcons = [Clock, BarChart3, MessageSquare];

export default function Landing() {
  const [, setLocation] = useLocation();
  const { switchRole } = useUser();
  const [lang, setLang] = useState<Lang>("de");

  const t = translations[lang];

  function handleStart(role: "restaurant" | "supplier") {
    switchRole(role);
    setLocation(`/${role}`);
  }

  function toggleLang() {
    setLang((prev) => (prev === "de" ? "it" : "de"));
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl flex items-center justify-between flex-wrap gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="GastroConnect Logo" className="h-16 w-16 object-contain dark:invert" />
            <span className="font-semibold text-lg tracking-tight" data-testid="text-brand-name">GastroConnect</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              data-testid="button-toggle-lang"
              title={lang === "de" ? "Lingua italiana" : "Deutsche Sprache"}
              className="relative flex h-8 w-[72px] items-center rounded-full bg-muted border border-border p-0.5 transition-colors cursor-pointer"
            >
              <span className={`absolute left-0.5 flex h-7 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold shadow-sm transition-transform duration-300 ease-in-out ${lang === "it" ? "translate-x-[30px]" : "translate-x-0"}`}>
                {lang === "de" ? "DE" : "IT"}
              </span>
              <span className={`absolute left-1.5 text-[11px] font-semibold text-muted-foreground transition-opacity duration-200 ${lang === "de" ? "opacity-0" : "opacity-100"}`}>DE</span>
              <span className={`absolute right-1.5 text-[11px] font-semibold text-muted-foreground transition-opacity duration-200 ${lang === "it" ? "opacity-0" : "opacity-100"}`}>IT</span>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleStart("supplier")}
              data-testid="button-nav-supplier"
            >
              {t.navSupplier}
            </Button>
            <Button
              size="sm"
              onClick={() => handleStart("restaurant")}
              data-testid="button-nav-restaurant"
            >
              {t.navRestaurant}
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden py-20 md:py-32">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Zap className="h-3 w-3 text-primary" />
              {t.heroBadge}
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl" data-testid="text-hero-headline">
              {t.heroH1Part1}{" "}
              <span className="text-primary">{t.heroH1Part2}</span>{" "}
              {t.heroH1Part3}
            </h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl leading-relaxed max-w-2xl mx-auto">
              {t.heroSub}
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="w-full sm:w-auto gap-2 text-base"
                onClick={() => handleStart("supplier")}
                data-testid="button-hero-supplier"
              >
                <Store className="h-4 w-4" />
                {t.heroCtaSupplier}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto gap-2 text-base"
                onClick={() => handleStart("restaurant")}
                data-testid="button-hero-restaurant"
              >
                <Utensils className="h-4 w-4" />
                {t.heroCtaRestaurant}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl" data-testid="text-problem-headline">
              {t.problemHeadline}
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.problemSub}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {t.problemCards.map((item, idx) => {
              const Icon = problemIcons[idx];
              return (
                <Card key={idx} className="border-border/50 hover-elevate overflow-visible" data-testid={`card-problem-${idx}`}>
                  <CardContent className="pt-6 pb-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive mb-4">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-base mb-2" data-testid={`text-problem-title-${idx}`}>{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl" data-testid="text-solution-headline">
              {t.solutionHeadline}
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.solutionSub}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {t.features.map((feature, idx) => {
              const Icon = featureIcons[idx];
              return (
                <Card key={idx} className="hover-elevate transition-all duration-200 overflow-visible" data-testid={`card-feature-${idx}`}>
                  <CardContent className="pt-6 pb-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-base mb-2" data-testid={`text-feature-title-${idx}`}>{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-4">
                <Store className="h-3 w-3" />
                {t.supplierBadge}
              </div>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl mb-6" data-testid="text-supplier-benefits">
                {t.supplierHeadline}
              </h2>
              <ul className="space-y-4">
                {t.supplierPoints.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-8 gap-2"
                onClick={() => handleStart("supplier")}
                data-testid="button-benefits-supplier"
              >
                {t.supplierCta}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-4">
                <Utensils className="h-3 w-3" />
                {t.restaurantBadge}
              </div>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl mb-6" data-testid="text-restaurant-benefits">
                {t.restaurantHeadline}
              </h2>
              <ul className="space-y-4">
                {t.restaurantPoints.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-8 gap-2"
                onClick={() => handleStart("restaurant")}
                data-testid="button-benefits-restaurant"
              >
                {t.restaurantCta}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl" data-testid="text-steps-headline">
              {t.stepsHeadline}
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.stepsSub}
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-4">
            {t.steps.map((item, idx) => (
              <div key={idx} className="text-center" data-testid={`card-step-${idx + 1}`}>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4">
                  {idx + 1}
                </div>
                <h3 className="font-semibold text-base mb-2" data-testid={`text-step-title-${idx + 1}`}>{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-primary/5 border-t border-border/50">
        <div className="mx-auto max-w-6xl px-4 md:px-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl mb-4" data-testid="text-cta-headline">
            {t.ctaHeadline}
          </h2>
          <p className="text-muted-foreground text-base md:text-lg mb-8 max-w-xl mx-auto">
            {t.ctaSub}
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="w-full sm:w-auto gap-2 text-base"
              onClick={() => handleStart("supplier")}
              data-testid="button-cta-supplier"
            >
              <Store className="h-4 w-4" />
              {t.ctaSupplier}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto gap-2 text-base"
              onClick={() => handleStart("restaurant")}
              data-testid="button-cta-restaurant"
            >
              <Utensils className="h-4 w-4" />
              {t.ctaRestaurant}
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 md:py-12">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between flex-wrap">
            <div className="flex items-center gap-2">
              <img src={logoImg} alt="GastroConnect Logo" className="h-14 w-14 object-contain dark:invert" />
              <span className="font-semibold text-sm" data-testid="text-footer-brand">GastroConnect</span>
            </div>
            <p className="text-xs text-muted-foreground text-center md:text-right" data-testid="text-footer-tagline">
              {t.footerTagline}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
