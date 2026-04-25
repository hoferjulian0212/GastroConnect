import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import logoImg from "@assets/logo_no_bg.png";
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
  TrendingUp,
  Wallet,
  Package,
  Eye,
  Tag,
  Users,
  ArrowLeftRight,
  Sparkles,
  Search,
  LineChart,
  Calendar,
} from "lucide-react";

const translations = {
  de: {
    navSupplier: "Händler",
    navRestaurant: "Betrieb",
    heroBadge: "Die Plattform für die Gastronomie",
    heroH1Part1: "Händler & Betriebe.",
    heroH1Part2: "Endlich",
    heroH1Part3: "auf einer Plattform.",
    heroSub: "GastroConnect ist der digitale Marktplatz, der Lieferanten und Gastronomiebetriebe direkt verbindet — mit Preisvergleichen, Ausgaben­übersicht und allen Bestellungen an einem Ort.",
    heroCtaSupplier: "Als Händler starten",
    heroCtaRestaurant: "Als Betrieb starten",
    heroStatsLabel1: "Bestellprozess",
    heroStatsValue1: "100% digital",
    heroStatsLabel2: "Zeitersparnis pro Woche",
    heroStatsValue2: "bis zu 8 Std.",
    heroStatsLabel3: "Preisvergleich",
    heroStatsValue3: "in Echtzeit",

    bridgeBadge: "Wie es funktioniert",
    bridgeHeadline: "Eine Brücke zwischen zwei Welten",
    bridgeSub: "Statt Telefon, Fax und Excel-Listen: Händler und Betriebe arbeiten direkt miteinander — auf derselben Plattform, mit denselben Daten, in Echtzeit.",
    bridgeSupplierTitle: "Händler",
    bridgeSupplierLine1: "Produktkatalog",
    bridgeSupplierLine2: "Aktionen & Preise",
    bridgeSupplierLine3: "Lager & Lieferung",
    bridgeMiddleLabel: "GastroConnect",
    bridgeMiddleSub: "verbindet beide Seiten",
    bridgeFlow1: "Bestellungen",
    bridgeFlow2: "Chat & Reklamationen",
    bridgeFlow3: "Lieferscheine",
    bridgeRestaurantTitle: "Betrieb",
    bridgeRestaurantLine1: "Mehrere Lieferanten",
    bridgeRestaurantLine2: "Preisvergleich",
    bridgeRestaurantLine3: "Ausgabenübersicht",

    problemHeadline: "Warum Gastronomie neu gedacht werden muss",
    problemSub: "Telefonate, Faxbestellungen und unübersichtliche Excel-Listen kosten Betriebe und Händler jeden Tag wertvolle Zeit und Nerven.",
    problemCards: [
      { title: "Zeitverschwendung", desc: "Manuelle Bestellprozesse per Telefon, Fax oder E-Mail sind fehleranfällig und kosten Stunden pro Woche." },
      { title: "Fehlende Übersicht", desc: "Ohne zentrale Plattform gehen Bestellungen, Preise und Absprachen schnell verloren." },
      { title: "Kommunikationsprobleme", desc: "Rückfragen zu Bestellungen und Reklamationen laufen über verschiedene Kanäle — chaotisch und langsam." },
    ],

    pillarsHeadline: "Für jede Seite das Richtige",
    pillarsSub: "GastroConnect ist von Grund auf für beide Rollen entwickelt — mit klar getrennten, aber perfekt verbundenen Werkzeugen.",

    supplierBadge: "Für Händler",
    supplierHeadline: "Mehr Übersicht. Mehr Kunden. Weniger Aufwand.",
    supplierSub: "Alles, was Sie brauchen, um Ihren Betrieb effizient zu führen — und sichtbar für neue Kunden zu sein.",
    supplierFeatures: [
      { title: "Alles an einem Ort", desc: "Bestellungen, Lager, Produkte, Lieferpläne und Chats — eine Oberfläche, kein Tool-Wechsel." },
      { title: "Mehr Kundenreichweite", desc: "Sichtbar für alle Betriebe auf der Plattform. Aktionen und Promotionen erreichen Ihre Zielgruppe direkt." },
      { title: "Volle Geschäftsübersicht", desc: "Kennzahlen, offene Bestellungen, Reklamationen und Lieferungen auf einen Blick im Dashboard." },
      { title: "Automatisierte Abläufe", desc: "Lieferscheine generieren, Stati aktualisieren, Kunden informieren — alles automatisch." },
    ],
    supplierMockTitle: "Händler-Dashboard",
    supplierMockKpi1Label: "Heutige Bestellungen",
    supplierMockKpi1Value: "24",
    supplierMockKpi2Label: "Umsatz heute",
    supplierMockKpi2Value: "3.842€",
    supplierMockKpi3Label: "Aktive Aktionen",
    supplierMockKpi3Value: "5",
    supplierMockOrdersTitle: "Eingehende Bestellungen",
    supplierMockOrder1: "Biergarten München",
    supplierMockOrder1Items: "12 Artikel",
    supplierMockOrder2: "Trattoria Lina",
    supplierMockOrder2Items: "8 Artikel",
    supplierMockOrder3: "Gasthof Sonne",
    supplierMockOrder3Items: "15 Artikel",
    supplierCta: "Als Händler starten",

    restaurantBadge: "Für Betriebe",
    restaurantHeadline: "Ausgaben im Griff. Preise im Vergleich. Alles auf einen Blick.",
    restaurantSub: "Bestellen Sie schneller, finden Sie bessere Preise und behalten Sie volle Kontrolle über Ihre Wareneinkäufe.",
    restaurantFeatures: [
      { title: "Ausgabenübersicht", desc: "Echte Zahlen statt Schätzungen: Wareneinsatz pro Gast, Monatsausgaben, Ausgaben pro Kategorie und Lieferant." },
      { title: "Bessere Preisvergleiche", desc: "Identische Produkte direkt zwischen Händlern vergleichen — Preisunterschiede sofort sichtbar." },
      { title: "Mehr Produkte auf einen Blick", desc: "Ein zentraler Katalog für alle Lieferanten. Suchen, filtern, vergleichen — alles ohne Tool-Wechsel." },
      { title: "Volle Organisation", desc: "Alle Bestellungen, Lieferscheine, Reklamationen und Chats — strukturiert und durchsuchbar." },
    ],
    restaurantMockTitle: "Betriebs-Dashboard",
    restaurantMockKpi1Label: "Wareneinsatz/Gast",
    restaurantMockKpi1Value: "12,43€",
    restaurantMockKpi2Label: "Offene Bestellungen",
    restaurantMockKpi2Value: "15",
    restaurantMockKpi3Label: "Monatsausgaben",
    restaurantMockKpi3Value: "10.213€",
    restaurantMockCompareTitle: "Preisvergleich · Tomaten 1kg",
    restaurantMockCompareS1: "Italia Import",
    restaurantMockCompareS2: "Frische GmbH",
    restaurantMockCompareS3: "Bio Bauer",
    restaurantMockBadgeBest: "günstigster",
    restaurantCta: "Als Betrieb starten",

    showcaseHeadline: "Die Werkzeuge, die den Unterschied machen",
    showcaseSub: "Vier Kern-Features, die Ihren Arbeitsalltag spürbar verändern.",
    showcase: [
      {
        title: "Preisvergleich",
        desc: "Identische Produkte zwischen Händlern direkt vergleichen — mit historischer Preisentwicklung.",
        forLabel: "Für Betriebe",
      },
      {
        title: "Ausgabenübersicht",
        desc: "Live-Dashboard mit Wareneinsatz pro Gast, Monatsausgaben und Trend-Analysen.",
        forLabel: "Für Betriebe",
      },
      {
        title: "Produktkatalog",
        desc: "Ein zentraler Katalog für alle Lieferanten. Suche, Filter, Artikelnummern und Bilder.",
        forLabel: "Für beide",
      },
      {
        title: "Aktionen & Promotionen",
        desc: "Händler erstellen gezielte Rabattaktionen und erreichen ihre Kunden direkt.",
        forLabel: "Für Händler",
      },
    ],

    stepsHeadline: "So funktioniert es",
    stepsSub: "In wenigen Schritten zur digitalen Bestellabwicklung.",
    steps: [
      { title: "Rolle wählen", desc: "Starten Sie als Betrieb oder Händler — ohne Registrierung." },
      { title: "Produkte entdecken", desc: "Betriebe durchsuchen den Katalog und finden passende Händler." },
      { title: "Bestellen & Kommunizieren", desc: "Bestellungen aufgeben, Liefertermine wählen und direkt chatten." },
      { title: "Liefern & Verwalten", desc: "Händler bearbeiten Bestellungen, erstellen Dokumente und liefern." },
    ],
    ctaHeadline: "Bereit, Ihren Bestellprozess zu digitalisieren?",
    ctaSub: "Starten Sie jetzt und erleben Sie, wie einfach Gastronomie-Bestellungen sein können.",
    ctaSupplier: "Als Händler starten",
    ctaRestaurant: "Als Betrieb starten",
    footerTagline: "Die digitale Plattform für Gastronomie-Bestellungen.",
  },
  it: {
    navSupplier: "Commerciante",
    navRestaurant: "Azienda",
    heroBadge: "La piattaforma per la gastronomia",
    heroH1Part1: "Commercianti & Aziende.",
    heroH1Part2: "Finalmente",
    heroH1Part3: "su un'unica piattaforma.",
    heroSub: "GastroConnect è il marketplace digitale che collega direttamente fornitori e attività gastronomiche — con confronto prezzi, panoramica spese e tutti gli ordini in un unico posto.",
    heroCtaSupplier: "Inizia come commerciante",
    heroCtaRestaurant: "Inizia come azienda",
    heroStatsLabel1: "Processo d'ordine",
    heroStatsValue1: "100% digitale",
    heroStatsLabel2: "Risparmio settimanale",
    heroStatsValue2: "fino a 8 ore",
    heroStatsLabel3: "Confronto prezzi",
    heroStatsValue3: "in tempo reale",

    bridgeBadge: "Come funziona",
    bridgeHeadline: "Un ponte tra due mondi",
    bridgeSub: "Niente più telefono, fax e fogli Excel: commercianti e aziende lavorano direttamente insieme — sulla stessa piattaforma, con gli stessi dati, in tempo reale.",
    bridgeSupplierTitle: "Commerciante",
    bridgeSupplierLine1: "Catalogo prodotti",
    bridgeSupplierLine2: "Promozioni & prezzi",
    bridgeSupplierLine3: "Magazzino & consegne",
    bridgeMiddleLabel: "GastroConnect",
    bridgeMiddleSub: "collega le due parti",
    bridgeFlow1: "Ordini",
    bridgeFlow2: "Chat & reclami",
    bridgeFlow3: "Bolle di consegna",
    bridgeRestaurantTitle: "Azienda",
    bridgeRestaurantLine1: "Più fornitori",
    bridgeRestaurantLine2: "Confronto prezzi",
    bridgeRestaurantLine3: "Panoramica spese",

    problemHeadline: "Perché la gastronomia ha bisogno di innovazione",
    problemSub: "Telefonate, ordini via fax e fogli Excel confusi costano ogni giorno tempo prezioso e stress ad aziende e commercianti.",
    problemCards: [
      { title: "Spreco di tempo", desc: "Processi di ordinazione manuali via telefono, fax o e-mail sono soggetti a errori e richiedono ore ogni settimana." },
      { title: "Mancanza di visione d'insieme", desc: "Senza una piattaforma centrale, ordini, prezzi e accordi si perdono rapidamente." },
      { title: "Problemi di comunicazione", desc: "Le richieste sugli ordini e i reclami passano attraverso diversi canali — caotico e lento." },
    ],

    pillarsHeadline: "Lo strumento giusto per ogni ruolo",
    pillarsSub: "GastroConnect è progettato fin dall'inizio per entrambi i ruoli — con strumenti chiaramente separati ma perfettamente collegati.",

    supplierBadge: "Per i commercianti",
    supplierHeadline: "Più visione d'insieme. Più clienti. Meno fatica.",
    supplierSub: "Tutto ciò che serve per gestire la tua attività in modo efficiente — e per farti trovare da nuovi clienti.",
    supplierFeatures: [
      { title: "Tutto in un posto", desc: "Ordini, magazzino, prodotti, piani di consegna e chat — un'unica interfaccia, nessun cambio di strumento." },
      { title: "Più clienti raggiunti", desc: "Visibile a tutte le aziende sulla piattaforma. Promozioni e offerte raggiungono direttamente il tuo pubblico." },
      { title: "Panoramica completa", desc: "KPI, ordini aperti, reclami e consegne in un colpo d'occhio nella dashboard." },
      { title: "Flussi automatizzati", desc: "Bolle di consegna generate, stati aggiornati, clienti informati — tutto automatico." },
    ],
    supplierMockTitle: "Dashboard commerciante",
    supplierMockKpi1Label: "Ordini di oggi",
    supplierMockKpi1Value: "24",
    supplierMockKpi2Label: "Fatturato oggi",
    supplierMockKpi2Value: "3.842€",
    supplierMockKpi3Label: "Promozioni attive",
    supplierMockKpi3Value: "5",
    supplierMockOrdersTitle: "Ordini in arrivo",
    supplierMockOrder1: "Biergarten München",
    supplierMockOrder1Items: "12 articoli",
    supplierMockOrder2: "Trattoria Lina",
    supplierMockOrder2Items: "8 articoli",
    supplierMockOrder3: "Gasthof Sonne",
    supplierMockOrder3Items: "15 articoli",
    supplierCta: "Inizia come commerciante",

    restaurantBadge: "Per le aziende",
    restaurantHeadline: "Spese sotto controllo. Prezzi a confronto. Tutto in un colpo d'occhio.",
    restaurantSub: "Ordina più velocemente, trova prezzi migliori e mantieni il controllo totale sui tuoi acquisti.",
    restaurantFeatures: [
      { title: "Panoramica spese", desc: "Numeri reali invece di stime: costo merce per ospite, spese mensili, per categoria e fornitore." },
      { title: "Confronti prezzi migliori", desc: "Confronta lo stesso prodotto tra fornitori — differenze di prezzo immediatamente visibili." },
      { title: "Più prodotti in un colpo d'occhio", desc: "Un catalogo centrale per tutti i fornitori. Cerca, filtra, confronta — tutto senza cambio di strumento." },
      { title: "Organizzazione completa", desc: "Tutti gli ordini, bolle, reclami e chat — strutturati e ricercabili." },
    ],
    restaurantMockTitle: "Dashboard azienda",
    restaurantMockKpi1Label: "Costo merce/ospite",
    restaurantMockKpi1Value: "12,43€",
    restaurantMockKpi2Label: "Ordini aperti",
    restaurantMockKpi2Value: "15",
    restaurantMockKpi3Label: "Spese mensili",
    restaurantMockKpi3Value: "10.213€",
    restaurantMockCompareTitle: "Confronto prezzi · Pomodori 1kg",
    restaurantMockCompareS1: "Italia Import",
    restaurantMockCompareS2: "Frische GmbH",
    restaurantMockCompareS3: "Bio Bauer",
    restaurantMockBadgeBest: "più conveniente",
    restaurantCta: "Inizia come azienda",

    showcaseHeadline: "Gli strumenti che fanno la differenza",
    showcaseSub: "Quattro funzionalità chiave che cambiano concretamente la tua giornata lavorativa.",
    showcase: [
      {
        title: "Confronto prezzi",
        desc: "Confronta direttamente prodotti identici tra fornitori — con storico dei prezzi.",
        forLabel: "Per le aziende",
      },
      {
        title: "Panoramica spese",
        desc: "Dashboard in tempo reale con costo merce per ospite, spese mensili e analisi dei trend.",
        forLabel: "Per le aziende",
      },
      {
        title: "Catalogo prodotti",
        desc: "Un catalogo centrale per tutti i fornitori. Ricerca, filtri, codici articolo e immagini.",
        forLabel: "Per entrambi",
      },
      {
        title: "Promozioni",
        desc: "I commercianti creano promozioni mirate e raggiungono direttamente i loro clienti.",
        forLabel: "Per i commercianti",
      },
    ],

    stepsHeadline: "Come funziona",
    stepsSub: "In pochi passi alla gestione digitale degli ordini.",
    steps: [
      { title: "Scegli il ruolo", desc: "Inizia come azienda o commerciante — senza registrazione." },
      { title: "Scopri i prodotti", desc: "Le aziende esplorano il catalogo e trovano i commercianti adatti." },
      { title: "Ordina e comunica", desc: "Effettua ordini, scegli le date di consegna e chatta direttamente." },
      { title: "Consegna e gestisci", desc: "I commercianti elaborano gli ordini, creano documenti e consegnano." },
    ],
    ctaHeadline: "Pronto a digitalizzare il tuo processo di ordinazione?",
    ctaSub: "Inizia ora e scopri quanto possono essere semplici gli ordini nella gastronomia.",
    ctaSupplier: "Inizia come commerciante",
    ctaRestaurant: "Inizia come azienda",
    footerTagline: "La piattaforma digitale per gli ordini nella gastronomia.",
  },
} as const;

const problemIcons = [Clock, BarChart3, MessageSquare];
const supplierFeatureIcons = [Package, Users, Eye, Zap];
const restaurantFeatureIcons = [Wallet, BarChart3, Search, Calendar];
const showcaseIcons = [LineChart, TrendingUp, Package, Tag];

export default function Landing() {
  const [, setLocation] = useLocation();
  const { switchRole } = useUser();
  const { lang, toggleLang } = useLanguage();

  const t = translations[lang];

  function handleStart(role: "restaurant" | "supplier") {
    switchRole(role);
    setLocation(`/${role}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl flex items-center justify-between flex-wrap gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="GastroConnect Logo" className="h-20 w-20 object-contain dark:invert -mr-2" />
            <span className="font-bold text-xl tracking-tight" data-testid="text-brand-name">GastroConnect</span>
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

      {/* HERO */}
      <section className="relative overflow-hidden py-16 md:py-24">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/8 via-primary/3 to-transparent" />
        <div className="absolute inset-0 -z-10 [background-image:radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.12),transparent_70%)]" />
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
              <Zap className="h-3 w-3 text-primary" />
              {t.heroBadge}
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight leading-tight" data-testid="text-hero-headline">
              {t.heroH1Part1}
              <br />
              <span className="text-primary">{t.heroH1Part2}</span> {t.heroH1Part3}
            </h1>
            <p className="mt-6 text-base md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              {t.heroSub}
            </p>
            <div className="mt-8 md:mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="w-full sm:w-auto gap-2 text-base text-[#000000]"
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

            {/* Hero Stats */}
            <div className="mt-10 md:mt-14 grid grid-cols-3 gap-3 md:gap-6 max-w-2xl mx-auto">
              {[
                { label: t.heroStatsLabel1, value: t.heroStatsValue1, icon: Sparkles },
                { label: t.heroStatsLabel2, value: t.heroStatsValue2, icon: Clock },
                { label: t.heroStatsLabel3, value: t.heroStatsValue3, icon: TrendingUp },
              ].map((stat, idx) => (
                <div key={idx} className="rounded-2xl border border-border bg-card/60 backdrop-blur p-3 md:p-4 text-center" data-testid={`hero-stat-${idx}`}>
                  <stat.icon className="h-4 w-4 text-primary mx-auto mb-1.5" />
                  <div className="text-sm md:text-lg font-bold tracking-tight">{stat.value}</div>
                  <div className="text-[10px] md:text-xs text-muted-foreground mt-0.5 leading-tight">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* BRIDGE — Konzept-Visualisierung */}
      <section className="py-16 md:py-24 bg-muted/30 border-y border-border/50">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-2xl text-center mb-10 md:mb-14">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <ArrowLeftRight className="h-3 w-3" />
              {t.bridgeBadge}
            </div>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight" data-testid="text-bridge-headline">
              {t.bridgeHeadline}
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.bridgeSub}
            </p>
          </div>

          {/* Bridge diagram */}
          <div className="grid gap-4 md:gap-6 lg:grid-cols-[1fr_auto_1fr] items-stretch">
            {/* Supplier card */}
            <div className="rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50 to-card dark:from-emerald-950/20 dark:to-card p-5 md:p-6 relative overflow-hidden" data-testid="bridge-supplier">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/30">
                    <Store className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-lg" data-testid="text-bridge-supplier-title">{t.bridgeSupplierTitle}</h3>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {[t.bridgeSupplierLine1, t.bridgeSupplierLine2, t.bridgeSupplierLine3].map((line, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Middle hub */}
            <div className="flex flex-col items-center justify-center gap-3 py-2 md:py-0 md:px-2 lg:px-4">
              {/* Mobile: arrow down. Desktop: arrows horizontal */}
              <div className="flex lg:hidden items-center gap-2 text-primary">
                <ArrowLeftRight className="h-5 w-5 rotate-90" />
              </div>

              <div className="relative inline-flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                <div className="relative h-20 w-20 md:h-24 md:w-24 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-xl shadow-primary/30">
                  <img src={logoImg} alt="GastroConnect" className="h-12 w-12 md:h-14 md:w-14 object-contain invert" />
                </div>
              </div>
              <div className="text-center">
                <div className="font-bold text-sm md:text-base" data-testid="text-bridge-middle">{t.bridgeMiddleLabel}</div>
                <div className="text-[11px] md:text-xs text-muted-foreground">{t.bridgeMiddleSub}</div>
              </div>

              {/* Flow chips */}
              <div className="flex flex-wrap justify-center gap-1.5 max-w-[220px]">
                {[t.bridgeFlow1, t.bridgeFlow2, t.bridgeFlow3].map((flow, idx) => (
                  <span key={idx} className="text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/15">
                    {flow}
                  </span>
                ))}
              </div>
            </div>

            {/* Restaurant card */}
            <div className="rounded-2xl border-2 border-blue-500/30 bg-gradient-to-br from-blue-50 to-card dark:from-blue-950/20 dark:to-card p-5 md:p-6 relative overflow-hidden" data-testid="bridge-restaurant">
              <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-md shadow-blue-500/30">
                    <Utensils className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-lg" data-testid="text-bridge-restaurant-title">{t.bridgeRestaurantTitle}</h3>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {[t.bridgeRestaurantLine1, t.bridgeRestaurantLine2, t.bridgeRestaurantLine3].map((line, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="py-16 md:py-24">
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

      {/* PILLARS — Supplier & Restaurant detail panels */}
      <section className="py-16 md:py-24 bg-muted/30 border-y border-border/50">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-2xl text-center mb-10 md:mb-14">
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight" data-testid="text-pillars-headline">
              {t.pillarsHeadline}
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.pillarsSub}
            </p>
          </div>

          {/* Supplier panel */}
          <div className="grid gap-8 lg:grid-cols-2 items-center mb-12 md:mb-16" data-testid="panel-supplier">
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-4">
                <Store className="h-3 w-3" />
                {t.supplierBadge}
              </div>
              <h3 className="text-2xl md:text-3xl font-bold tracking-tight mb-3" data-testid="text-supplier-headline">
                {t.supplierHeadline}
              </h3>
              <p className="text-muted-foreground text-base mb-6 leading-relaxed">
                {t.supplierSub}
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {t.supplierFeatures.map((feature, idx) => {
                  const Icon = supplierFeatureIcons[idx];
                  return (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:border-emerald-500/40 transition-colors" data-testid={`supplier-feature-${idx}`}>
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">{feature.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{feature.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                className="mt-6 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleStart("supplier")}
                data-testid="button-supplier-cta"
              >
                {t.supplierCta}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Supplier mock */}
            <div className="order-1 lg:order-2">
              <div className="relative rounded-3xl border border-border bg-gradient-to-br from-emerald-50/50 via-card to-card dark:from-emerald-950/20 p-3 md:p-4 shadow-xl">
                <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-emerald-500/20 to-transparent pointer-events-none" />
                <div className="relative rounded-2xl bg-[#161921] p-3 md:p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-sm font-bold">{t.supplierMockTitle}</div>
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-[10px] text-white/50 uppercase tracking-wider">live</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: t.supplierMockKpi1Label, value: t.supplierMockKpi1Value, color: "text-emerald-400" },
                      { label: t.supplierMockKpi2Label, value: t.supplierMockKpi2Value, color: "text-blue-400" },
                      { label: t.supplierMockKpi3Label, value: t.supplierMockKpi3Value, color: "text-amber-400" },
                    ].map((kpi, idx) => (
                      <div key={idx} className="rounded-xl bg-white/[0.06] border border-white/10 p-2">
                        <div className={`text-base md:text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
                        <div className="text-[9px] md:text-[10px] text-white/50 leading-tight mt-0.5">{kpi.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative mt-3 rounded-2xl bg-card border border-border p-3">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">{t.supplierMockOrdersTitle}</div>
                  <div className="space-y-1.5">
                    {[
                      { name: t.supplierMockOrder1, items: t.supplierMockOrder1Items, color: "bg-amber-500" },
                      { name: t.supplierMockOrder2, items: t.supplierMockOrder2Items, color: "bg-emerald-500" },
                      { name: t.supplierMockOrder3, items: t.supplierMockOrder3Items, color: "bg-blue-500" },
                    ].map((o, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
                        <div className={`h-7 w-7 rounded-md ${o.color}/20 flex items-center justify-center`}>
                          <ShoppingCart className={`h-3.5 w-3.5 ${o.color.replace("bg-", "text-")}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{o.name}</div>
                          <div className="text-[10px] text-muted-foreground">{o.items}</div>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Restaurant panel */}
          <div className="grid gap-8 lg:grid-cols-2 items-center" data-testid="panel-restaurant">
            {/* Restaurant mock */}
            <div>
              <div className="relative rounded-3xl border border-border bg-gradient-to-br from-blue-50/50 via-card to-card dark:from-blue-950/20 p-3 md:p-4 shadow-xl">
                <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-blue-500/20 to-transparent pointer-events-none" />
                <div className="relative rounded-2xl bg-[#161921] p-3 md:p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-white text-sm font-bold">{t.restaurantMockTitle}</div>
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-blue-400" />
                      <span className="text-[10px] text-white/50 uppercase tracking-wider">live</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: t.restaurantMockKpi1Label, value: t.restaurantMockKpi1Value, color: "text-emerald-400" },
                      { label: t.restaurantMockKpi2Label, value: t.restaurantMockKpi2Value, color: "text-amber-400" },
                      { label: t.restaurantMockKpi3Label, value: t.restaurantMockKpi3Value, color: "text-blue-400" },
                    ].map((kpi, idx) => (
                      <div key={idx} className="rounded-xl bg-white/[0.06] border border-white/10 p-2">
                        <div className={`text-base md:text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
                        <div className="text-[9px] md:text-[10px] text-white/50 leading-tight mt-0.5">{kpi.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="relative mt-3 rounded-2xl bg-card border border-border p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
                    <TrendingUp className="h-3 w-3 text-blue-500" />
                    {t.restaurantMockCompareTitle}
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { name: t.restaurantMockCompareS1, price: "3,20€", widthPct: 80, isBest: false },
                      { name: t.restaurantMockCompareS2, price: "2,85€", widthPct: 70, isBest: true },
                      { name: t.restaurantMockCompareS3, price: "3,90€", widthPct: 100, isBest: false },
                    ].map((row, idx) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium flex items-center gap-1.5">
                            {row.name}
                            {row.isBest && <span className="text-[9px] px-1.5 py-0 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold">{t.restaurantMockBadgeBest}</span>}
                          </span>
                          <span className={`font-bold tabular-nums ${row.isBest ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{row.price}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${row.isBest ? "bg-gradient-to-r from-emerald-400 to-emerald-600" : "bg-gradient-to-r from-blue-400 to-blue-500"}`} style={{ width: `${row.widthPct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 mb-4">
                <Utensils className="h-3 w-3" />
                {t.restaurantBadge}
              </div>
              <h3 className="text-2xl md:text-3xl font-bold tracking-tight mb-3" data-testid="text-restaurant-headline">
                {t.restaurantHeadline}
              </h3>
              <p className="text-muted-foreground text-base mb-6 leading-relaxed">
                {t.restaurantSub}
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {t.restaurantFeatures.map((feature, idx) => {
                  const Icon = restaurantFeatureIcons[idx];
                  return (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card hover:border-blue-500/40 transition-colors" data-testid={`restaurant-feature-${idx}`}>
                      <div className="h-8 w-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm">{feature.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{feature.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                className="mt-6 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => handleStart("restaurant")}
                data-testid="button-restaurant-cta"
              >
                {t.restaurantCta}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* SHOWCASE — Key Features */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-2xl text-center mb-10 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="text-showcase-headline">
              {t.showcaseHeadline}
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.showcaseSub}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {t.showcase.map((item, idx) => {
              const Icon = showcaseIcons[idx];
              const accent = ["from-blue-500 to-blue-600 shadow-blue-500/20", "from-emerald-500 to-emerald-600 shadow-emerald-500/20", "from-amber-500 to-amber-600 shadow-amber-500/20", "from-purple-500 to-purple-600 shadow-purple-500/20"][idx];
              const labelColor = ["text-blue-700 dark:text-blue-400 bg-blue-500/10", "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10", "text-amber-700 dark:text-amber-400 bg-amber-500/10", "text-purple-700 dark:text-purple-400 bg-purple-500/10"][idx];
              return (
                <div key={idx} className="group rounded-2xl border border-border bg-card p-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-200" data-testid={`showcase-${idx}`}>
                  <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${accent} text-white flex items-center justify-center shadow-lg mb-3`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2 ${labelColor}`}>
                    {item.forLabel}
                  </span>
                  <h3 className="font-bold text-base mb-1.5" data-testid={`text-showcase-title-${idx}`}>{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section className="py-16 md:py-24 bg-muted/30 border-y border-border/50">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl" data-testid="text-steps-headline">
              {t.stepsHeadline}
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.stepsSub}
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-4 relative">
            {/* Connection line for desktop */}
            <div className="hidden md:block absolute top-6 left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20" />
            {t.steps.map((item, idx) => (
              <div key={idx} className="text-center relative" data-testid={`card-step-${idx + 1}`}>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4 shadow-lg shadow-primary/30 relative z-10">
                  {idx + 1}
                </div>
                <h3 className="font-semibold text-base mb-2" data-testid={`text-step-title-${idx + 1}`}>{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
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
              className="w-full sm:w-auto gap-2 text-base text-[#000000]"
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
              <img src={logoImg} alt="GastroConnect Logo" className="h-12 w-12 object-contain dark:invert -mr-1" />
              <span className="font-bold text-sm tracking-tight" data-testid="text-footer-brand">GastroConnect</span>
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
