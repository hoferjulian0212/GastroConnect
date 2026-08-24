// PRE-UPGRADE REVERT ANCHOR: 4f40c9f4a0a4ae80a1229769db07b16ed4a41d9a
// To roll back this file to the state before the landing-page polish:
//   git checkout 4f40c9f4a0a4ae80a1229769db07b16ed4a41d9a -- client/src/pages/Landing.tsx
import { useLocation } from "wouter";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { MotionReveal } from "@/components/landing/MotionReveal";
import CountUp from "@/components/CountUp";
import { HeadlineReveal } from "@/components/landing/HeadlineReveal";
import { HeadlineCta } from "@/components/landing/HeadlineCta";
import { PinnedFeatureStory } from "@/components/landing/PinnedFeatureStory";
import { StatsStrip, SavingsChart } from "@/components/landing/AnimatedStats";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import Logo from "@/components/Logo";
import {
  detectPublicLanguage,
  persistPublicLanguage,
  PublicLanguageSwitcher,
  PublicFooter,
} from "@/pages/About";
import shotChefPhone from "@assets/iStock-1277816551_1781732715128.jpg";
import shotOfficePhone from "@assets/sk_art-corporate-training-10046033_1920_1781806207063.jpg";
import shotOrderingProcess from "@assets/landing-ordering-process-clean.mp4";
import shotOrderingProcessPoster from "@assets/landing-ordering-process-clean-poster.jpg";
import shotOrderingProcessAutoplayFallback from "@assets/landing-ordering-process-autoplay-fallback.webp";
import shotBusinessProcess from "@assets/landing-business-process-clean.mp4";
import shotBusinessProcessPoster from "@assets/landing-business-process-clean-poster.jpg";
import shotBusinessProcessAutoplayFallback from "@assets/landing-business-process-autoplay-fallback.webp";
import shotMobileHome from "@assets/landing-mobile-home.png";
import shotMobileProducts from "@assets/landing-mobile-products.png";
import shotMobileInbox from "@assets/landing-mobile-inbox.png";
import shotMobileSupplierHome from "@assets/landing-mobile-supplier-home.png";
import shotMobileSupplierProducts from "@assets/landing-mobile-supplier-products.png";
import shotPrice from "@assets/landing-story/price-2-savings.jpg";
import shotPriceOverview from "@assets/landing-story/price-1-overview.jpg";
import shotPriceCatalog from "@assets/landing-story/price-3-catalog.jpg";
import shotComplaintDialog from "@assets/landing-story/complaint-1-dialog.jpg";
import shotComplaintInbox from "@assets/landing-story/complaint-2-inbox.jpg";
import shotComplaintDetail from "@assets/landing-story/complaint-3-detail.jpg";
import {
  MessageSquare,
  FileText,
  Tag,
  Calendar,
  Package,
  BarChart3,
  ArrowLeftRight,
  Bookmark,
  BellRing,
  WifiOff,
  Hand,
  Clock,
  Shield,
  Eye,
  Wallet,
  Search,
  ChevronRight,
  ArrowRight,
  ArrowUpRight,
  Utensils,
  Store,
  Menu,
  CheckCircle2,
  UserPlus,
} from "lucide-react";

const animationStrings = {
  de: {
    callout1: "Preisvergleich",
    callout2: "Live-Chat",
    callout3: "Lieferschein als PDF",
    priceStoryHeadline: "Preisvergleich in Echtzeit.",
    priceStorySteps: [
      "Identische Produkte. Drei Händler. Eine Übersicht.",
      "Ersparnis sofort sichtbar.",
      "Direkt im Katalog bestellen.",
    ],
    complaintStoryHeadline: "Reklamation mit Nachlieferung.",
    complaintStorySteps: [
      "Betroffene Artikel auswählen.",
      "Händler bestätigt direkt im Chat.",
      "Nachlieferung als Folge-Bestellung.",
    ],
    kpiSavings: "Ø Ersparnis",
    kpiOrders: "Bestellungen / Monat",
    kpiSuppliers: "Aktive Händler",
  },
  it: {
    callout1: "Confronto prezzi",
    callout2: "Chat live",
    callout3: "Bolla in PDF",
    priceStoryHeadline: "Confronto prezzi in tempo reale.",
    priceStorySteps: [
      "Prodotti identici. Tre fornitori. Una panoramica.",
      "Risparmio subito visibile.",
      "Ordina direttamente dal catalogo.",
    ],
    complaintStoryHeadline: "Reclamo con riconsegna.",
    complaintStorySteps: [
      "Seleziona gli articoli interessati.",
      "Il fornitore conferma in chat.",
      "Riconsegna come ordine successivo.",
    ],
    kpiSavings: "Risparmio medio",
    kpiOrders: "Ordini / mese",
    kpiSuppliers: "Fornitori attivi",
  },
  en: {
    callout1: "Price comparison",
    callout2: "Live chat",
    callout3: "Delivery note as PDF",
    priceStoryHeadline: "Price comparison in real time.",
    priceStorySteps: [
      "Identical products. Three suppliers. One overview.",
      "Savings visible instantly.",
      "Order directly from the catalog.",
    ],
    complaintStoryHeadline: "Complaints with re-delivery.",
    complaintStorySteps: [
      "Pick the affected items.",
      "Supplier confirms right in chat.",
      "Re-delivery as a follow-up order.",
    ],
    kpiSavings: "Avg. savings",
    kpiOrders: "Orders / month",
    kpiSuppliers: "Active suppliers",
  },
} as const;

function smoothScrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const translations = {
  de: {
    navAnchorPillars: "Für wen",
    navAnchorSteps: "So funktioniert es",
    navAnchorFeatures: "Funktionen",
    navAnchorMobile: "Mobile",
    navAnchorFaq: "FAQ",
    navLogin: "Anmelden",
    navStart: "Jetzt starten",
    navMenu: "Entdecken",
    navLanguage: "Sprache",

    heroH1: "Händler und Betriebe. Alles auf einer Plattform.",
    heroDiscover: "Über uns",
    heroSub:
      "GastroConnect verbindet Lieferanten und Gastronomie direkt — mit Preisvergleichen, Ausgabenübersicht und allen Bestellungen an einem Ort.",
    heroCtaRestaurant: "Als Betrieb starten",
    heroCtaSupplier: "Als Händler starten",
    heroImageAlt: "GastroConnect Restaurant-Dashboard",

    guideEyebrow: "So kommen Sie rein",
    guideStep1Title: "Einladung erhalten",
    guideStep1Desc: "Ihr Administrator richtet Ihren Zugang ein und sendet eine Einladungs-E-Mail.",
    guideStep2Title: "Passwort festlegen",
    guideStep2Desc: "Über den Link in der E-Mail setzen Sie Ihr persönliches Passwort.",
    guideStep3Title: "Sofort loslegen",
    guideStep3Desc: "Nach der Anmeldung stehen alle Funktionen sofort bereit.",
    guideCta: "Anmelden",
    guideNotice: "Der Zugang wird vom Administrator Ihres Unternehmens eingerichtet.",
    guideMobileCta: "Jetzt Registrierung anfragen",

    pillarsHeadline: "Für wen GastroConnect gebaut ist",
    pillarsSub:
      "Eine Plattform, zwei klar getrennte Erlebnisse — beide perfekt auf die jeweilige Rolle zugeschnitten.",
    pillarsSwipe: "Wischen, um beide Ansichten zu sehen",
    pillarRestaurantTitle: "Für Betriebe",
    pillarRestaurantBullets: [
      "Alle Lieferanten in einem Katalog — suchen, vergleichen, bestellen.",
      "Preisvergleich für identische Produkte über alle Händler hinweg.",
      "Wareneinsatz pro Gast, Monatsausgaben und Trends auf einen Blick.",
      "Bestellungen, Dokumente und Chats strukturiert und durchsuchbar.",
    ],
    pillarSupplierTitle: "Für Händler",
    pillarSupplierBullets: [
      "Bestellungen, Lager, Produkte und Lieferpläne in einer Oberfläche.",
      "Sichtbar für alle Betriebe — Aktionen erreichen Kunden direkt.",
      "Lieferscheine automatisch als PDF, im Chat geteilt, im Dokumentencenter abgelegt.",
      "Umsatz, Top-Produkte und offene Bestellungen im Live-Dashboard.",
    ],

    stepsHeadline: "So funktioniert es",
    steps: [
      {
        title: "Rolle wählen",
        desc: "Starten Sie als Betrieb oder Händler — ohne Registrierung.",
      },
      {
        title: "Bestellen & kommunizieren",
        desc: "Produkte entdecken, bestellen, Liefertermine wählen, direkt chatten.",
      },
      {
        title: "Liefern & verwalten",
        desc: "Bestellungen bearbeiten, Lieferscheine erzeugen, ausliefern.",
      },
    ],

    featuresHeadline: "Funktionen im Überblick",
    featuresSub:
      "Alles, was Sie für die tägliche Zusammenarbeit zwischen Händler und Betrieb brauchen.",
    features: [
      {
        title: "Chat & Reklamationen",
        desc: "Direkter Chat zu jeder Bestellung, mit priorisierten Nachrichten.",
      },
      {
        title: "Lieferscheine als PDF",
        desc: "A4-Lieferscheine werden automatisch erzeugt und im Chat geteilt.",
      },
      {
        title: "Aktionen & Promotionen",
        desc: "Händler erstellen Rabattaktionen, die im Katalog hervorgehoben werden.",
      },
      {
        title: "Lieferpläne",
        desc: "Pro Kunde individuelle Liefertage und optionale Zeitfenster.",
      },
      {
        title: "Bestellvorlagen",
        desc: "Wiederkehrende Bestellungen als Vorlage speichern und in Sekunden auslösen.",
      },
      {
        title: "Dokumentencenter",
        desc: "Lieferscheine und Rechnungen pro Händler sortiert mit Statistiken.",
      },
      {
        title: "Statistiken & KPIs",
        desc: "Umsatz, Top-Produkte, Wareneinsatz pro Gast — live für beide Seiten.",
      },
      {
        title: "Preisvergleich",
        desc: "Identische Produkte zwischen Händlern direkt vergleichen.",
      },
      {
        title: "Reklamationen mit Nachlieferung",
        desc: "Betroffene Artikel auswählen — Händler bestätigt die Nachlieferung.",
      },
      {
        title: "Push-Benachrichtigungen",
        desc: "Echtzeit-Benachrichtigungen mit Deeplinks direkt in die richtige Ansicht.",
      },
    ],

    mobileHeadline: "Ihre Bestellungen — immer in der Tasche",
    mobileSub:
      "GastroConnect funktioniert auf jedem Gerät. Das mobile Erlebnis ist genauso vollständig wie am Desktop.",
    lifestyleEyebrow: "Mitten im Service",
    lifestyleHeadline: "Bestellen, wo gekocht wird",
    lifestyleSub:
      "Vom Posten in der Küche bis zum Lager — GastroConnect ist immer griffbereit. Bestellungen, Chat und Lieferscheine direkt auf dem Handy.",
    lifestyleSupplierEyebrow: "Mitten im Betrieb",
    lifestyleSupplierHeadline: "Alles im Griff, im Büro und unterwegs",
    lifestyleSupplierSub:
      "Vom Büro bis zur Lieferung — GastroConnect hält alles zusammen. Eingehende Bestellungen, Kundenchat und Lieferscheine direkt auf dem Handy.",
    mobileRoleRestaurant: "Betrieb",
    mobileRoleSupplier: "Händler",
    mobileAltRestaurant: "GastroConnect mobil — Betrieb",
    mobileAltSupplier: "GastroConnect mobil — Händler",
    mobileBullets: [
      {
        title: "Push-Benachrichtigungen",
        desc: "Neue Bestellungen, Statuswechsel und Nachrichten direkt aufs Handy.",
      },
      {
        title: "Offline-fähig",
        desc: "Auch unterwegs oder im Lager: zuletzt geladene Daten bleiben verfügbar.",
      },
      {
        title: "Wisch-Gesten",
        desc: "Bestellungen schnell bestätigen oder als gelesen markieren — mit einem Swipe.",
      },
      {
        title: "Bestellvorlagen",
        desc: "Wiederkehrende Bestellungen vom Startbildschirm in Sekunden auslösen.",
      },
    ],

    faqHeadline: "Häufige Fragen",
    faq: [
      {
        q: "Was kostet GastroConnect?",
        a: "Sie können GastroConnect direkt ausprobieren — ohne Registrierung und ohne Kreditkarte. Preise besprechen wir individuell, abgestimmt auf Ihren Betrieb.",
      },
      {
        q: "Für welche Betriebe ist die Plattform geeignet?",
        a: "GastroConnect richtet sich an Restaurants, Hotels, Kantinen, Cafés und Gastronomiebetriebe jeder Größe — sowie an Lieferanten und Großhändler, die diese Betriebe beliefern.",
      },
      {
        q: "Wie funktioniert die Anmeldung?",
        a: "Sie wählen einfach Ihre Rolle (Betrieb oder Händler) und legen direkt los. Eine vollständige Registrierung ist erst nötig, wenn Sie produktiv arbeiten möchten.",
      },
      {
        q: "Brauche ich eine App aus dem Store?",
        a: "Nein. GastroConnect läuft in jedem Browser. Auf dem Handy können Sie die Seite wie eine App zum Startbildschirm hinzufügen — inklusive Push-Benachrichtigungen.",
      },
      {
        q: "Sind meine Daten sicher?",
        a: "Ja. Alle Daten werden verschlüsselt übertragen und sicher in der EU gehostet. Jede Rolle sieht nur die für sie bestimmten Informationen.",
      },
      {
        q: "Kann ich meine bestehenden Lieferanten weiter nutzen?",
        a: "Selbstverständlich. Sie können Ihre vorhandenen Lieferanten zu GastroConnect einladen oder direkt aus unserem Netzwerk auswählen.",
      },
    ],

    ctaHeadline: "Bereit, Ihren Bestellprozess zu digitalisieren?",
    ctaSub: "Starten Sie in wenigen Sekunden — kein Setup, keine Kreditkarte.",
    ctaConfirm: "Kostenlos testen — keine Kreditkarte nötig.",

    footerTagline: "Die digitale Plattform für Gastronomie-Bestellungen.",
    footerTitleProduct: "Produkt",
    footerTitleCompany: "Unternehmen",
    footerTitleLegal: "Rechtliches",
    footerLinkFeatures: "Funktionen",
    footerLinkSteps: "So funktioniert es",
    footerLinkFaq: "FAQ",
    footerLinkAbout: "Über uns",
    footerLinkContact: "Kontakt",
    footerLinkImprint: "Impressum",
    footerLinkPrivacy: "Datenschutz",
    footerLinkTerms: "AGB",
    footerCopyright: "Alle Rechte vorbehalten.",
    eyebrowPillars: "Für Restaurants & Händler",
    eyebrowSteps: "In 3 einfachen Schritten",
    eyebrowStats: "Zahlen & Fakten",
    eyebrowFeatures: "Alles dabei",
    eyebrowMobile: "Mobile First",
    eyebrowFaq: "Fragen & Antworten",
    eyebrowCta: "Jetzt loslegen",
    eyebrowWhatsNew: "Was gibt's Neues",
    pillarPlatformTitle: "Verbunden auf einer Plattform",
    pillarPlatformBullets: [
      "Direkter Chat zu jeder Bestellung — kein Medienbruch, keine verlorenen Infos.",
      "Lieferscheine als PDF automatisch erzeugt, geteilt und archiviert.",
      "Echtzeit-Benachrichtigungen auf jedem Gerät, mit Deeplinks in die richtige Ansicht.",
      "Alle Daten verschlüsselt und sicher in der EU gehostet.",
    ],
    pillarPlatformCta: "Mehr erfahren",
  },
  it: {
    navAnchorPillars: "Per chi",
    navAnchorSteps: "Come funziona",
    navAnchorFeatures: "Funzionalità",
    navAnchorMobile: "Mobile",
    navAnchorFaq: "FAQ",
    navLogin: "Accedi",
    navStart: "Inizia ora",
    navMenu: "Scopri",
    navLanguage: "Lingua",

    heroH1: "Commercianti e aziende. Finalmente su un'unica piattaforma.",
    heroDiscover: "Chi siamo",
    heroSub:
      "GastroConnect collega direttamente fornitori e gastronomia — con confronto prezzi, panoramica spese e tutti gli ordini in un unico posto.",
    heroCtaRestaurant: "Inizia come azienda",
    heroCtaSupplier: "Inizia come commerciante",
    heroImageAlt: "Dashboard ristorante GastroConnect",

    guideEyebrow: "Come accedere",
    guideStep1Title: "Ricevi l'invito",
    guideStep1Desc: "Il tuo amministratore crea il tuo accesso e invia un'email di invito.",
    guideStep2Title: "Imposta la password",
    guideStep2Desc: "Dal link nell'email imposti la tua password personale.",
    guideStep3Title: "Sei subito operativo",
    guideStep3Desc: "Dopo l'accesso tutte le funzioni sono disponibili immediatamente.",
    guideCta: "Accedi",
    guideNotice: "L'accesso viene creato dall'amministratore della tua azienda.",
    guideMobileCta: "Richiedi la registrazione",

    pillarsHeadline: "Per chi è pensato GastroConnect",
    pillarsSub:
      "Una piattaforma, due esperienze chiaramente separate — entrambe ottimizzate per il rispettivo ruolo.",
    pillarsSwipe: "Scorri per vedere entrambe le viste",
    pillarRestaurantTitle: "Per le aziende",
    pillarRestaurantBullets: [
      "Tutti i fornitori in un unico catalogo — cerca, confronta, ordina.",
      "Confronto prezzi per prodotti identici tra tutti i commercianti.",
      "Costo merce per ospite, spese mensili e trend in un colpo d'occhio.",
      "Ordini, documenti e chat strutturati e ricercabili.",
    ],
    pillarSupplierTitle: "Per i commercianti",
    pillarSupplierBullets: [
      "Ordini, magazzino, prodotti e piani di consegna in un'unica interfaccia.",
      "Visibile a tutte le aziende — le promozioni raggiungono i clienti direttamente.",
      "Bolle di consegna automatiche in PDF, condivise in chat, archiviate nel centro documenti.",
      "Fatturato, top prodotti e ordini aperti nella dashboard live.",
    ],

    stepsHeadline: "Come funziona",
    steps: [
      {
        title: "Scegli il ruolo",
        desc: "Inizia come azienda o commerciante — senza registrazione.",
      },
      {
        title: "Ordina e comunica",
        desc: "Scopri i prodotti, ordina, scegli le date di consegna, chatta direttamente.",
      },
      {
        title: "Consegna e gestisci",
        desc: "Elabora gli ordini, crea le bolle di consegna, consegna.",
      },
    ],

    featuresHeadline: "Funzionalità in sintesi",
    featuresSub:
      "Tutto ciò che serve per la collaborazione quotidiana tra commerciante e azienda.",
    features: [
      { title: "Chat e reclami", desc: "Chat diretta per ogni ordine, con messaggi prioritari." },
      { title: "Bolle di consegna PDF", desc: "Bolle A4 generate automaticamente e condivise in chat." },
      { title: "Promozioni", desc: "I commercianti creano promozioni evidenziate nel catalogo." },
      { title: "Piani di consegna", desc: "Giorni di consegna individuali e finestre orarie opzionali per cliente." },
      { title: "Modelli d'ordine", desc: "Salva ordini ricorrenti come modelli e attivali in pochi secondi." },
      { title: "Centro documenti", desc: "Bolle e fatture ordinate per commerciante con statistiche." },
      { title: "Statistiche e KPI", desc: "Fatturato, top prodotti, costo merce per ospite — live per entrambi." },
      { title: "Confronto prezzi", desc: "Confronta direttamente prodotti identici tra commercianti." },
      { title: "Reclami con riconsegna", desc: "Seleziona gli articoli interessati — il commerciante conferma la riconsegna." },
      { title: "Notifiche push", desc: "Notifiche in tempo reale con deep link direttamente alla vista corretta." },
    ],

    mobileHeadline: "I tuoi ordini — sempre in tasca",
    mobileSub:
      "GastroConnect funziona su qualsiasi dispositivo. L'esperienza mobile è completa come quella desktop.",
    lifestyleEyebrow: "Nel cuore del servizio",
    lifestyleHeadline: "Ordina dove si cucina",
    lifestyleSub:
      "Dalla postazione in cucina al magazzino — GastroConnect è sempre a portata di mano. Ordini, chat e bolle di consegna direttamente sul telefono.",
    lifestyleSupplierEyebrow: "Nel cuore dell'azienda",
    lifestyleSupplierHeadline: "Tutto sotto controllo, in ufficio e in movimento",
    lifestyleSupplierSub:
      "Dall'ufficio alla consegna — GastroConnect tiene tutto insieme. Ordini in arrivo, chat con i clienti e bolle di consegna direttamente sul telefono.",
    mobileRoleRestaurant: "Ristorante",
    mobileRoleSupplier: "Fornitore",
    mobileAltRestaurant: "GastroConnect mobile — Ristorante",
    mobileAltSupplier: "GastroConnect mobile — Fornitore",
    mobileBullets: [
      { title: "Notifiche push", desc: "Nuovi ordini, cambi di stato e messaggi direttamente sul telefono." },
      { title: "Funziona offline", desc: "Anche fuori sede o in magazzino: i dati caricati restano disponibili." },
      { title: "Gesti rapidi", desc: "Conferma ordini o segna come letti con un semplice swipe." },
      { title: "Modelli d'ordine", desc: "Ordini ricorrenti dalla home screen in pochi secondi." },
    ],

    faqHeadline: "Domande frequenti",
    faq: [
      { q: "Quanto costa GastroConnect?", a: "Puoi provare GastroConnect subito — senza registrazione e senza carta di credito. I prezzi vengono concordati individualmente, in base alla tua attività." },
      { q: "Per quali attività è adatta la piattaforma?", a: "GastroConnect è pensato per ristoranti, hotel, mense, bar e attività gastronomiche di ogni dimensione — oltre a fornitori e grossisti che li riforniscono." },
      { q: "Come funziona la registrazione?", a: "Scegli semplicemente il tuo ruolo (azienda o commerciante) e inizia subito. Una registrazione completa è necessaria solo quando passi all'uso produttivo." },
      { q: "Mi serve un'app dallo store?", a: "No. GastroConnect funziona in qualsiasi browser. Sul telefono puoi aggiungerla alla home come un'app — comprese le notifiche push." },
      { q: "I miei dati sono al sicuro?", a: "Sì. Tutti i dati sono trasmessi in modo cifrato e ospitati in modo sicuro nell'UE. Ogni ruolo vede solo le informazioni a lui destinate." },
      { q: "Posso continuare a usare i miei fornitori esistenti?", a: "Certamente. Puoi invitare i tuoi fornitori attuali su GastroConnect oppure scegliere direttamente dalla nostra rete." },
    ],

    ctaHeadline: "Pronto a digitalizzare il tuo processo d'ordine?",
    ctaSub: "Inizia in pochi secondi — nessun setup, nessuna carta di credito.",
    ctaConfirm: "Prova gratuitamente — senza carta di credito.",

    footerTagline: "La piattaforma digitale per gli ordini nella gastronomia.",
    footerTitleProduct: "Prodotto",
    footerTitleCompany: "Azienda",
    footerTitleLegal: "Legale",
    footerLinkFeatures: "Funzionalità",
    footerLinkSteps: "Come funziona",
    footerLinkFaq: "FAQ",
    footerLinkAbout: "Chi siamo",
    footerLinkContact: "Contatti",
    footerLinkImprint: "Note legali",
    footerLinkPrivacy: "Privacy",
    footerLinkTerms: "Termini",
    footerCopyright: "Tutti i diritti riservati.",
    eyebrowPillars: "Per ristoranti e commercianti",
    eyebrowSteps: "In 3 semplici passi",
    eyebrowStats: "Numeri e fatti",
    eyebrowFeatures: "Tutto incluso",
    eyebrowMobile: "Mobile First",
    eyebrowFaq: "Domande e risposte",
    eyebrowCta: "Inizia ora",
    eyebrowWhatsNew: "Novità",
    pillarPlatformTitle: "Connessi su un'unica piattaforma",
    pillarPlatformBullets: [
      "Chat diretta per ogni ordine — nessuna interruzione, nessuna informazione persa.",
      "Bolle di consegna PDF generate automaticamente, condivise e archiviate.",
      "Notifiche in tempo reale su ogni dispositivo, con deep link alla vista corretta.",
      "Tutti i dati cifrati e ospitati in modo sicuro nell'UE.",
    ],
    pillarPlatformCta: "Scopri di più",
  },
  en: {
    navAnchorPillars: "Who it's for",
    navAnchorSteps: "How it works",
    navAnchorFeatures: "Features",
    navAnchorMobile: "Mobile",
    navAnchorFaq: "FAQ",
    navLogin: "Sign in",
    navStart: "Get started",
    navMenu: "Explore",
    navLanguage: "Language",

    heroH1: "Suppliers and restaurants. Finally on one platform.",
    heroDiscover: "About us",
    heroSub:
      "GastroConnect connects suppliers and hospitality directly — with price comparison, spending overview and all your orders in one place.",
    heroCtaRestaurant: "Start as a restaurant",
    heroCtaSupplier: "Start as a supplier",
    heroImageAlt: "GastroConnect restaurant dashboard",

    guideEyebrow: "How to get access",
    guideStep1Title: "Receive your invite",
    guideStep1Desc: "Your administrator creates your account and sends an invitation email.",
    guideStep2Title: "Set your password",
    guideStep2Desc: "Open the link in the email to set your personal password.",
    guideStep3Title: "Get started right away",
    guideStep3Desc: "Once signed in, all features are available immediately.",
    guideCta: "Sign in",
    guideNotice: "Access is set up by your company's administrator.",
    guideMobileCta: "Request registration",

    pillarsHeadline: "Who GastroConnect is built for",
    pillarsSub:
      "One platform, two clearly separated experiences — both tailored perfectly to their role.",
    pillarsSwipe: "Swipe to see both views",
    pillarRestaurantTitle: "For restaurants",
    pillarRestaurantBullets: [
      "All your suppliers in one catalog — search, compare, order.",
      "Price comparison for identical products across every supplier.",
      "Food cost per guest, monthly spending and trends at a glance.",
      "Orders, documents and chats — structured and searchable.",
    ],
    pillarSupplierTitle: "For suppliers",
    pillarSupplierBullets: [
      "Orders, inventory, products and delivery schedules in one interface.",
      "Visible to every restaurant — promotions reach customers directly.",
      "Delivery notes generated as PDF, shared in chat, filed in the document center.",
      "Revenue, top products and open orders in a live dashboard.",
    ],

    stepsHeadline: "How it works",
    steps: [
      { title: "Choose your role", desc: "Start as a restaurant or supplier — no sign-up needed." },
      { title: "Order & communicate", desc: "Discover products, place orders, pick delivery dates, chat directly." },
      { title: "Deliver & manage", desc: "Process orders, generate delivery notes, deliver." },
    ],

    featuresHeadline: "Features at a glance",
    featuresSub: "Everything you need for the daily collaboration between supplier and restaurant.",
    features: [
      { title: "Chat & complaints", desc: "Direct chat on every order, with priority messages." },
      { title: "Delivery notes as PDF", desc: "A4 delivery notes generated automatically and shared in chat." },
      { title: "Promotions", desc: "Suppliers create discounts that are highlighted in the catalog." },
      { title: "Delivery schedules", desc: "Per-customer delivery days and optional time windows." },
      { title: "Order templates", desc: "Save recurring orders as templates and trigger them in seconds." },
      { title: "Document center", desc: "Delivery notes and invoices sorted per supplier with stats." },
      { title: "Statistics & KPIs", desc: "Revenue, top products, food cost per guest — live for both sides." },
      { title: "Price comparison", desc: "Compare identical products across suppliers directly." },
      { title: "Complaints with re-delivery", desc: "Pick affected items — supplier confirms the re-delivery." },
      { title: "Push notifications", desc: "Real-time notifications with deep links straight into the right view." },
    ],

    mobileHeadline: "Your orders — always in your pocket",
    mobileSub: "GastroConnect runs on every device. The mobile experience is just as complete as the desktop one.",
    lifestyleEyebrow: "Right in the service",
    lifestyleHeadline: "Order where the cooking happens",
    lifestyleSub:
      "From the line in the kitchen to the storeroom — GastroConnect is always within reach. Orders, chat and delivery notes right on your phone.",
    lifestyleSupplierEyebrow: "Right in the business",
    lifestyleSupplierHeadline: "Everything under control, at the office and on the go",
    lifestyleSupplierSub:
      "From the office to the delivery — GastroConnect keeps it all together. Incoming orders, customer chat and delivery notes right on your phone.",
    mobileRoleRestaurant: "Restaurant",
    mobileRoleSupplier: "Supplier",
    mobileAltRestaurant: "GastroConnect mobile — Restaurant",
    mobileAltSupplier: "GastroConnect mobile — Supplier",
    mobileBullets: [
      { title: "Push notifications", desc: "New orders, status changes and messages straight to your phone." },
      { title: "Works offline", desc: "On the road or in the warehouse: last-loaded data stays available." },
      { title: "Swipe gestures", desc: "Confirm orders or mark them as read with a single swipe." },
      { title: "Order templates", desc: "Trigger recurring orders from your home screen in seconds." },
    ],

    faqHeadline: "Frequently asked questions",
    faq: [
      { q: "What does GastroConnect cost?", a: "You can try GastroConnect right away — no sign-up and no credit card. We discuss pricing individually, tailored to your business." },
      { q: "Which businesses is the platform for?", a: "GastroConnect is built for restaurants, hotels, canteens, cafés and hospitality businesses of every size — and for the suppliers and wholesalers that serve them." },
      { q: "How does sign-up work?", a: "Just pick your role (restaurant or supplier) and get going. A full registration is only needed once you switch to productive use." },
      { q: "Do I need an app from the store?", a: "No. GastroConnect runs in any browser. On your phone you can add it to the home screen like an app — push notifications included." },
      { q: "Is my data safe?", a: "Yes. All data is transmitted encrypted and hosted securely in the EU. Each role only sees the information meant for them." },
      { q: "Can I keep my existing suppliers?", a: "Of course. You can invite your current suppliers to GastroConnect or pick directly from our growing network." },
    ],

    ctaHeadline: "Ready to digitize your ordering process?",
    ctaSub: "Get started in seconds — no setup, no credit card.",
    ctaConfirm: "Free to try — no credit card required.",

    footerTagline: "The digital platform for hospitality ordering.",
    footerTitleProduct: "Product",
    footerTitleCompany: "Company",
    footerTitleLegal: "Legal",
    footerLinkFeatures: "Features",
    footerLinkSteps: "How it works",
    footerLinkFaq: "FAQ",
    footerLinkAbout: "About",
    footerLinkContact: "Contact",
    footerLinkImprint: "Imprint",
    footerLinkPrivacy: "Privacy",
    footerLinkTerms: "Terms",
    footerCopyright: "All rights reserved.",
    eyebrowPillars: "For restaurants & suppliers",
    eyebrowSteps: "In 3 simple steps",
    eyebrowStats: "Numbers & facts",
    eyebrowFeatures: "Everything included",
    eyebrowMobile: "Mobile first",
    eyebrowFaq: "Questions & answers",
    eyebrowCta: "Get started today",
    eyebrowWhatsNew: "What's new",
    pillarPlatformTitle: "Connected on one platform",
    pillarPlatformBullets: [
      "Direct chat on every order — no broken chains, no lost information.",
      "Delivery notes as PDF generated automatically, shared and archived.",
      "Real-time notifications on every device, with deep links to the right view.",
      "All data encrypted and securely hosted in the EU.",
    ],
    pillarPlatformCta: "Learn more",
  },
} as const;

type Lang = keyof typeof translations;
const landingAccentWords = new Set([
  "händler", "betriebe", "commercianti", "aziende", "suppliers",
  "restaurants", "restaurant", "lieferanten", "bestellungen",
  "preisvergleich", "reklamation", "funktionen", "mobile",
  "ordini", "fornitori", "confronto", "prezzi", "ristoranti",
  "orders", "features", "complaints", "delivery", "suppliers.",
  // lifestyle card accents
  "bestellen", "ordina", "order",
]);

function LandingWordMix({ children }: { children: ReactNode }) {
  const text = typeof children === "string" ? children : String(children);
  return (
    <>
      {text.split(/(\s+)/).map((part, index) => {
        const normalized = part.toLocaleLowerCase().replace(/[.,!?]/g, "");
        return (
          <span
            key={`${part}-${index}`}
            className={landingAccentWords.has(normalized) ? "landing-accent-word" : undefined}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

function detectInitialLang(): Lang {
  return detectPublicLanguage();
}

function RegistrationGuide({
  t,
  reduceMotion,
  onStart,
  onRegister,
}: {
  t: (typeof translations)[Lang];
  reduceMotion: boolean | null;
  onStart: (role: "restaurant" | "supplier") => void;
  onRegister: () => void;
}) {
  return (
    <motion.div
      className="mx-auto w-full max-w-sm"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 }}
      data-testid="registration-guide"
    >
      <div className="px-0">
        <div className="hidden w-full flex-col gap-3 md:flex">
          <Button
            size="lg"
            className="h-12 w-full gap-2 rounded-full bg-black px-6 text-sm font-semibold text-white shadow-none hover:bg-black/85"
            onClick={() => onStart("restaurant")}
            data-testid="button-guide-cta"
          >
            {t.guideCta}
            <ArrowUpRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 w-full gap-2 rounded-full border-black/15 bg-white px-6 text-sm font-semibold text-black shadow-none hover:bg-black/[0.04] hover:text-black"
            onClick={onRegister}
            data-testid="button-guide-register"
          >
            {t.guideMobileCta}
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile keeps this area intentionally minimal: one clear path into
            the new-user registration flow. */}
        <div className="flex justify-center md:hidden">
          <Button
            size="lg"
            className="h-11 gap-1.5 rounded-full bg-black px-5 text-sm font-medium text-white shadow-none hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90"
            onClick={() => onStart("restaurant")}
            data-testid="button-guide-mobile-cta"
          >
            {t.guideMobileCta}
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function OrderingProcessCanvas({
  src,
  poster,
  fallback,
  label,
  reduceMotion,
  testId,
}: {
  src: string;
  poster: string;
  fallback: string;
  label: string;
  reduceMotion: boolean | null;
  testId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasRenderedFrameRef = useRef(false);
  const [hasRenderedFrame, setHasRenderedFrame] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!video || !canvas || !context || reduceMotion) return;

    let animationFrame: number | null = null;
    let retryTimer: number | null = null;
    let lastRenderedTime = -1;

    const drawFrame = () => {
      animationFrame = null;

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        if (video.currentTime !== lastRenderedTime) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          lastRenderedTime = video.currentTime;
          if (!hasRenderedFrameRef.current) {
            hasRenderedFrameRef.current = true;
            setHasRenderedFrame(true);
          }
        }
      }

      animationFrame = window.requestAnimationFrame(drawFrame);
    };

    const renderFrames = () => {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(drawFrame);
      }
    };

    const tryPlay = () => {
      if (document.hidden) return;
      if (!video.paused && !video.ended) {
        renderFrames();
        return;
      }
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      void video.play().then(renderFrames).catch(() => {
        // Retry in case the browser is still decoding or waking the media
        // element after the page scrolls into place.
        if (retryTimer === null) {
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            tryPlay();
          }, 250);
        }
      });
    };

    const onScroll = () => tryPlay();
    const onUserGesture = () => tryPlay();
    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) tryPlay();
          },
          { rootMargin: "180px 0px", threshold: 0.01 },
        )
      : null;
    const onVisibilityChange = () => {
      if (document.hidden) {
        video.pause();
      } else {
        tryPlay();
      }
    };

    video.addEventListener("loadedmetadata", renderFrames);
    video.addEventListener("loadeddata", renderFrames);
    video.addEventListener("canplay", tryPlay);
    video.addEventListener("play", renderFrames);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onUserGesture, { passive: true });
    window.addEventListener("pointermove", onUserGesture, { passive: true });
    window.addEventListener("touchstart", onUserGesture, { passive: true });
    window.addEventListener("touchmove", onUserGesture, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    observer?.observe(canvas);
    video.load();
    renderFrames();
    tryPlay();

    return () => {
      observer?.disconnect();
      video.removeEventListener("loadedmetadata", renderFrames);
      video.removeEventListener("loadeddata", renderFrames);
      video.removeEventListener("canplay", tryPlay);
      video.removeEventListener("play", renderFrames);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onUserGesture);
      window.removeEventListener("pointermove", onUserGesture);
      window.removeEventListener("touchstart", onUserGesture);
      window.removeEventListener("touchmove", onUserGesture);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      video.pause();
    };
  }, [reduceMotion]);

  return (
    <>
      <img
        src={reduceMotion ? poster : fallback}
        alt=""
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-10 h-full w-full object-cover object-top transition-opacity duration-150 ${
          reduceMotion || !hasRenderedFrame ? "opacity-100" : "opacity-0"
        }`}
      />
      <canvas
        ref={canvasRef}
        aria-label={label}
        data-testid={testId}
        className={`absolute inset-0 z-20 h-full w-full object-cover object-top transition-opacity duration-150 ${
          reduceMotion || !hasRenderedFrame ? "opacity-0" : "opacity-100"
        }`}
        style={{
          backgroundImage: `url(${poster})`,
          backgroundPosition: "top",
          backgroundSize: "cover",
        }}
      />
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        autoPlay={!reduceMotion}
        preload={reduceMotion ? "none" : "auto"}
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-top"
        // Keep the decoder genuinely visible to mobile autoplay heuristics.
        // The canvas above it still fully covers the native media surface.
        style={{ opacity: 1 }}
      />
    </>
  );
}

const pillarRestaurantIcons = [Search, BarChart3, Wallet, Eye];
const pillarSupplierIcons = [Package, Eye, FileText, BarChart3];
const featureIcons = [
  MessageSquare,
  FileText,
  Tag,
  Calendar,
  Bookmark,
  FileText,
  BarChart3,
  ArrowLeftRight,
  Shield,
  BellRing,
];
const mobileBulletIcons = [BellRing, WifiOff, Hand, Bookmark];
const restaurantMobileShots = [shotMobileHome, shotMobileProducts, shotMobileInbox];
const supplierMobileShots = [shotMobileSupplierHome, shotMobileSupplierProducts];
const publicLanguageOptions: Array<{ code: Lang; flag: string; name: string }> = [
  { code: "de", flag: "🇩🇪", name: "Deutsch" },
  { code: "it", flag: "🇮🇹", name: "Italiano" },
  { code: "en", flag: "🇬🇧", name: "English" },
];

/** Two rows of text that loop continuously in opposite directions. */
function ScrollMarquee({
  items,
  speed = 0.12,
  direction = "left",
}: {
  items: string[];
  speed?: number;
  direction?: "left" | "right";
}) {
  const duration = `${Math.max(24, Math.round(4.8 / speed))}s`;
  return (
    <div className="overflow-hidden">
      <motion.div
        style={{ "--landing-marquee-duration": duration } as CSSProperties}
        className={`landing-marquee-track flex w-max items-center whitespace-nowrap will-change-transform ${
          direction === "right" ? "landing-marquee-track-reverse" : ""
        }`}
      >
        {[0, 1].map((group) => (
          <div key={group} className="flex shrink-0 items-center gap-10 pr-10 md:gap-16 md:pr-16">
            {items.map((item) => (
              <span
                key={`${group}-${item}`}
                className="text-[clamp(1.4rem,2.8vw,2.4rem)] font-semibold tracking-[0.12em] text-foreground/[0.065]"
              >
                {item}
              </span>
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const { currentUser, currentRole } = useUser();
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("de");
  const [mobileShotRole, setMobileShotRole] = useState<"restaurant" | "supplier">("restaurant");
  const [mobileShotIndex, setMobileShotIndex] = useState(0);
  const [pillarSlideIndex, setPillarSlideIndex] = useState(0);
  const pillarsCarouselRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Auto-rotate the phone preview through the active role's screenshots.
  useEffect(() => {
    if (reduceMotion) return;
    const count =
      mobileShotRole === "supplier"
        ? supplierMobileShots.length
        : restaurantMobileShots.length;
    if (count < 2) return;
    const id = window.setInterval(() => {
      setMobileShotIndex((i) => (i + 1) % count);
    }, 2800);
    return () => window.clearInterval(id);
  }, [mobileShotRole, reduceMotion]);

  useEffect(() => {
    setMobileShotIndex(0);
  }, [mobileShotRole]);

  // B4 — Phone-frame parallax in mobile section (desktop-only motion)
  const phoneFrameRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress: phoneProgress } = useScroll({
    target: phoneFrameRef,
    offset: ["start end", "end start"],
    layoutEffect: false,
  });
  const phoneY = useTransform(phoneProgress, [0, 1], [24, -24]);
  const phoneParallaxActive = isDesktop && !reduceMotion;


  useEffect(() => {
    setLang(detectInitialLang());
  }, []);

  useEffect(() => {
    if (currentUser && currentRole) {
      setLocation(`/${currentRole}`);
    }
  }, [currentUser, currentRole]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function changeLang(next: Lang) {
    setLang(next);
    persistPublicLanguage(next);
  }

  const t = translations[lang];
  const a = animationStrings[lang];

  function handleStart(_role: "restaurant" | "supplier") {
    setLocation("/login");
  }

  function handleLogin() {
    setLocation("/login");
  }

  function selectPillarSlide(index: number) {
    const carousel = pillarsCarouselRef.current;
    const slide = carousel?.querySelector<HTMLElement>(`[data-pillar-slide="${index}"]`);
    slide?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    setPillarSlideIndex(index);
  }

  const anchors = [
    { id: "fuer-wen", label: t.navAnchorPillars },
    { id: "so-funktioniert", label: t.navAnchorSteps },
    { id: "funktionen", label: t.navAnchorFeatures },
    { id: "mobile", label: t.navAnchorMobile },
    { id: "faq", label: t.navAnchorFaq },
  ];

  return (
    <div className="landing-page min-h-screen bg-white dark:bg-background text-foreground">
      {/* HEADER — floating pill */}
       <header className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-8 px-4 pointer-events-none">
           <div className={`landing-header-inner pointer-events-auto w-full max-w-6xl flex items-center justify-between gap-1.5 px-4 py-2.5 md:gap-3 md:px-7 md:py-3.5 rounded-full border transition-all duration-300 ${
          scrolled
             ? "bg-white dark:bg-background md:bg-white/92 md:dark:bg-background/92 backdrop-blur-md border-black/[0.06] dark:border-white/10 shadow-lg shadow-black/[0.07]"
             : "bg-white dark:bg-background md:bg-white/75 md:dark:bg-background/75 backdrop-blur-sm border-black/[0.04] dark:border-white/[0.08] shadow-sm"
        }`}>
          {/* Left: logo */}
          <div className="shrink-0">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                setLocation("/");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="flex items-center"
              data-testid="link-brand"
            >
               <Logo
                 size="nav"
                 variant="dark"
                 thick
                 className="[&_img]:drop-shadow-[0_0_0.6px_rgba(0,0,0,0.55)] dark:[&_img]:drop-shadow-[0_0_0.6px_rgba(255,255,255,0.45)]"
                 data-testid="logo-landing-nav"
               />
            </a>
          </div>

          {/* Center: anchor nav — flex-1 so it never encroaches on the right side */}
          <div className="hidden lg:flex flex-1 items-center justify-center gap-0.5 min-w-0 overflow-hidden">
            {anchors.map((item) => (
              <button
                key={item.id}
                onClick={() => smoothScrollTo(item.id)}
                className="px-2.5 xl:px-3 py-1.5 rounded-full text-xs xl:text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors whitespace-nowrap"
                data-testid={`nav-anchor-${item.id}`}
              >
                {item.label}
              </button>
            ))}
          </div>

           {/* Right: language + one prominent auth action */}
           <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
             <div className="hidden lg:block">
               <PublicLanguageSwitcher lang={lang} onChange={changeLang} />
             </div>
            <Button
               variant="default"
               className="hidden md:inline-flex h-10 rounded-full bg-black px-5 text-sm font-medium text-white shadow-none hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90"
              onClick={handleLogin}
              data-testid="link-login"
            >
               {t.navLogin}
               <ArrowUpRight className="ml-1 h-4 w-4" />
            </Button>

            {/* Mobile navigation — the language selector and all actions live
                inside this view so the tab bar stays visually quiet. */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="lg:hidden inline-flex h-9 w-10 items-center justify-center text-foreground transition-colors hover:opacity-60"
                  aria-label={t.navMenu}
                  data-testid="button-mobile-menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                 className="h-[min(92vh,760px)] rounded-t-[2rem] border-border bg-background p-0 [&>button]:right-5 [&>button]:top-5 [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:opacity-70 [&>button_svg]:h-6 [&>button_svg]:w-6"
              >
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-border px-5 py-5">
                    <Logo size="nav" variant="dark" thick data-testid="logo-landing-mobile-menu" />
                  </div>
                  <nav className="flex-1 overflow-y-auto px-5 py-5" aria-label={t.navMenu}>
                    <div className="space-y-1">
                      {anchors.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setMobileNavOpen(false);
                            window.setTimeout(() => smoothScrollTo(item.id), 80);
                          }}
                           className="flex min-h-14 w-full items-center justify-between border-b border-border/70 px-1 text-left text-xl font-medium tracking-tight text-foreground transition-colors hover:text-muted-foreground focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                          data-testid={`nav-mobile-${item.id}`}
                        >
                          {item.label}
                          <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </nav>
                  <div className="space-y-3 border-t border-border px-5 pb-[calc(env(safe-area-inset-bottom,0px)+2.75rem)] pt-5">
                    <Button
                      className="h-12 w-full rounded-full bg-black text-white shadow-none hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90"
                      onClick={() => {
                        setMobileNavOpen(false);
                        setLocation("/register");
                      }}
                      data-testid="link-register-mobile"
                    >
                      {t.navStart}
                      <ArrowUpRight className="ml-1 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      className="h-12 w-full rounded-full border-border bg-transparent"
                      onClick={() => {
                        setMobileNavOpen(false);
                        handleLogin();
                      }}
                      data-testid="link-login-mobile"
                    >
                      {t.navLogin}
                    </Button>
                    <div className="border-t border-border pt-5">
                      <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {t.navLanguage}
                      </p>
                      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t.navLanguage}>
                        {publicLanguageOptions.map((option) => {
                          const active = lang === option.code;
                          return (
                            <button
                              key={option.code}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => changeLang(option.code)}
                              className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-xs transition-colors ${
                                active
                                  ? "border-[3px] border-foreground bg-transparent text-foreground"
                                  : "border-border bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                              }`}
                              data-testid={`language-mobile-${option.code}`}
                            >
                              <span className="text-2xl leading-none" aria-hidden="true">{option.flag}</span>
                              <span className="font-medium">{option.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <div id="top" />

      {/* HERO */}
      <section className="landing-hero relative px-4 pb-6 pt-24 md:px-8 md:pb-8 md:pt-28">
        <div className="mx-auto max-w-5xl text-center flex flex-col justify-center gap-10 md:gap-14 min-h-[calc(100svh-5rem)]">
          {/* Headline + subtitle */}
          <div>
            {isDesktop ? (
              <HeadlineCta
                href="/about"
                pillText={t.heroDiscover}
                testId="link-hero-headline"
              >
                <HeadlineReveal
                  key={`hero-${lang}`}
                  text={t.heroH1}
                  className="mx-auto max-w-6xl text-[2.6rem] font-semibold leading-[.98] tracking-tight md:text-8xl"
                  testId="text-hero-headline"
                />
              </HeadlineCta>
            ) : (
              <div data-testid="text-hero-headline-mobile">
                <HeadlineReveal
                  key={`hero-mobile-${lang}`}
                  text={t.heroH1}
                  className="mx-auto max-w-[20rem] text-[2.45rem] font-semibold leading-[.98] tracking-tight"
                  testId="text-hero-headline"
                />
              </div>
            )}
            <MotionReveal delay={400} y={16} blur={false}>
               <p className="landing-hero-sub-mobile mt-6 md:mt-8 text-base md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                {t.heroSub}
              </p>
            </MotionReveal>
          </div>

          {/* Invite-only guide — grouped directly below headline */}
          <MotionReveal delay={600} y={16} blur={false}>
             <RegistrationGuide
               t={t}
               reduceMotion={reduceMotion}
               onStart={handleStart}
               onRegister={() => setLocation("/register")}
             />
          </MotionReveal>
        </div>
      </section>

      {/* LIFESTYLE — chef using the app in the kitchen with floating phone mockup */}
      <section className="px-4 md:px-8 py-12 md:py-20">
        <div className="mx-auto max-w-7xl">
          <MotionReveal>
            <div
              className="flex flex-col md:flex-row items-center gap-8 md:gap-8"
              data-testid="section-lifestyle"
            >
              {/* Left — chef image + floating phone (size, ratio and crop unchanged) */}
              <div className="relative overflow-hidden rounded-3xl bg-neutral-900 w-full md:flex-1">
                <img
                  src={shotChefPhone}
                  alt={t.lifestyleHeadline}
                  className="w-full h-[460px] md:h-[600px] object-cover object-center"
                  loading="lazy"
                  data-testid="img-lifestyle"
                />
                {/* legibility gradient — darker on the left under the phone, fading right */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/10 md:to-transparent" />

                {/* Floating phone mockup on the left-middle — same frame as the mobile section */}
                <div className="absolute left-3 sm:left-6 md:left-8 top-1/2 -translate-y-1/2">
                  <div className="rounded-[2.25rem] md:rounded-[2.75rem] border border-border bg-card p-2.5 md:p-3 shadow-2xl shadow-black/50">
                    <div className="relative rounded-[1.75rem] md:rounded-[2.25rem] overflow-hidden border border-border w-[150px] sm:w-[185px] md:w-[230px] aspect-[9/19] bg-card">
                      <OrderingProcessCanvas
                        src={shotOrderingProcess}
                        poster={shotOrderingProcessPoster}
                        fallback={shotOrderingProcessAutoplayFallback}
                        label={t.mobileAltRestaurant}
                        reduceMotion={reduceMotion}
                        testId="img-lifestyle-phone"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right — text outside the image, desktop only */}
              <div className="hidden md:block md:w-[340px] flex-shrink-0 text-left">
                <span className="inline-block mb-3 text-xs font-semibold uppercase tracking-widest text-black/60">
                  {t.lifestyleEyebrow}
                </span>
                <h2
                  className="text-4xl font-semibold tracking-tight text-black leading-tight"
                  data-testid="text-lifestyle-headline"
                >
                  <LandingWordMix>{t.lifestyleHeadline}</LandingWordMix>
                </h2>
                <p className="mt-4 text-base text-black/80 leading-relaxed">
                  {t.lifestyleSub}
                </p>
              </div>
            </div>

            {/* Copy below image — mobile only (stacked, no overlap with phone) */}
            <div className="md:hidden mt-6 px-1">
              <span className="inline-block mb-2 text-[11px] font-semibold uppercase tracking-widest text-primary">
                {t.lifestyleEyebrow}
              </span>
              <h2
                className="text-2xl font-semibold tracking-tight leading-tight"
                data-testid="text-lifestyle-headline-mobile"
              >
                {t.lifestyleHeadline}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {t.lifestyleSub}
              </p>
            </div>
          </MotionReveal>
        </div>
      </section>

      {/* LIFESTYLE (supplier) — office team using the app with floating phone mockup, mirrored layout */}
      <section className="px-4 md:px-8 py-12 md:py-20">
        <div className="mx-auto max-w-7xl">
          <MotionReveal>
            <div
              className="flex flex-col md:flex-row items-center gap-8 md:gap-8"
              data-testid="section-lifestyle-supplier"
            >
              {/* Left — text outside the image, desktop only */}
              <div className="hidden md:block md:w-[340px] flex-shrink-0 text-left order-2 md:order-1">
                <span className="inline-block mb-3 text-xs font-semibold uppercase tracking-widest text-black/60">
                  {t.lifestyleSupplierEyebrow}
                </span>
                <h2
                  className="text-4xl font-semibold tracking-tight text-black leading-tight"
                  data-testid="text-lifestyle-supplier-headline"
                >
                  {lang === "de" ? (
                    <><span className="landing-accent-word">Alles im Griff</span>, im Büro und unterwegs</>
                  ) : (
                    <LandingWordMix>{t.lifestyleSupplierHeadline}</LandingWordMix>
                  )}
                </h2>
                <p className="mt-4 text-base text-black/80 leading-relaxed">
                  {t.lifestyleSupplierSub}
                </p>
              </div>

              {/* Right — office image + floating phone (mirror: phone on the right) */}
              <div className="relative overflow-hidden rounded-3xl bg-neutral-900 w-full md:flex-1 order-1 md:order-2">
                <img
                  src={shotOfficePhone}
                  alt={t.lifestyleSupplierHeadline}
                  className="w-full h-[460px] md:h-[600px] object-cover object-[60%_center]"
                  loading="lazy"
                  data-testid="img-lifestyle-supplier"
                />
                {/* legibility gradient — darker on the left under the phone, fading right toward the people */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/10 md:to-transparent" />

                {/* Floating phone mockup on the left-middle — keeps the workers (center-right) uncovered */}
                <div className="absolute left-3 sm:left-6 md:left-8 top-1/2 -translate-y-1/2">
                  <div className="rounded-[2.25rem] md:rounded-[2.75rem] border border-border bg-card p-2.5 md:p-3 shadow-2xl shadow-black/50">
                    <div className="relative rounded-[1.75rem] md:rounded-[2.25rem] overflow-hidden border border-border w-[150px] sm:w-[185px] md:w-[230px] aspect-[9/19] bg-card">
                      <OrderingProcessCanvas
                        src={shotBusinessProcess}
                        poster={shotBusinessProcessPoster}
                        fallback={shotBusinessProcessAutoplayFallback}
                        label={t.mobileAltSupplier}
                        reduceMotion={reduceMotion}
                        testId="img-lifestyle-supplier-phone"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Copy below image — mobile only (stacked, no overlap with phone) */}
            <div className="md:hidden mt-6 px-1">
              <span className="inline-block mb-2 text-[11px] font-semibold uppercase tracking-widest text-primary">
                {t.lifestyleSupplierEyebrow}
              </span>
              <h2
                className="text-2xl font-semibold tracking-tight leading-tight"
                data-testid="text-lifestyle-supplier-headline-mobile"
              >
                {lang === "de" ? (
                  <><span className="landing-accent-word">Alles im Griff</span>, im Büro und unterwegs</>
                ) : (
                  <LandingWordMix>{t.lifestyleSupplierHeadline}</LandingWordMix>
                )}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {t.lifestyleSupplierSub}
              </p>
            </div>
          </MotionReveal>
        </div>
      </section>

      {/* STATS STRIP — animated count-up metrics */}
      <StatsStrip lang={lang} />

      {/* PILLARS — Für wen */}
      <section
        id="fuer-wen"
        className="scroll-mt-20 px-4 pb-12 pt-4 md:px-8 md:py-32"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center mb-12 md:mb-16">
            <span className="inline-block mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
              {t.eyebrowPillars}
            </span>
            <h2
              className="text-3xl md:text-5xl font-semibold tracking-tight"
              data-testid="text-pillars-headline"
            >
              <LandingWordMix>{t.pillarsHeadline}</LandingWordMix>
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.pillarsSub}
            </p>
          </div>
          <div
            ref={pillarsCarouselRef}
            onScroll={(event) => {
              const firstSlide = event.currentTarget.querySelector<HTMLElement>("[data-pillar-slide]");
              if (!firstSlide) return;
              const slideDistance = firstSlide.offsetWidth + 16;
              setPillarSlideIndex(Math.min(1, Math.max(0, Math.round(event.currentTarget.scrollLeft / slideDistance))));
            }}
            className="flex w-full snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-smooth scroll-px-4 touch-pan-x bg-white pb-3 scrollbar-hide md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:bg-transparent md:pb-0"
            aria-label={t.eyebrowPillars}
          >
            {[
              {
                title: t.pillarRestaurantTitle,
                bullets: t.pillarRestaurantBullets,
                icons: pillarRestaurantIcons,
                head: Utensils,
                cta: t.heroCtaRestaurant,
                role: "restaurant" as const,
                testid: "card-pillar-restaurant",
                accent: "emerald",
              },
              {
                title: t.pillarSupplierTitle,
                bullets: t.pillarSupplierBullets,
                icons: pillarSupplierIcons,
                head: Store,
                cta: t.heroCtaSupplier,
                role: "supplier" as const,
                testid: "card-pillar-supplier",
                accent: "blue",
              },
            ].map((p, pIdx) => (
              <div
                key={p.testid}
                className="w-full min-w-full shrink-0 snap-center md:min-w-0 md:shrink"
              >
              <div
                data-pillar-slide={pIdx}
                className="h-full rounded-3xl p-6 md:p-10 flex flex-col border border-neutral-200 bg-white dark:border-neutral-200 dark:bg-white"
                data-testid={p.testid}
              >
                {/* Icon */}
                <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-7 bg-black dark:bg-white">
                  <p.head className="h-7 w-7 text-white dark:text-black" />
                </div>
                <div className="flex flex-col flex-1">
                  <h3
                    className="text-2xl md:text-3xl font-semibold tracking-tight mb-2"
                    data-testid={`text-${p.testid}-title`}
                  >
                    <LandingWordMix>{p.title}</LandingWordMix>
                  </h3>
                  <ul className="space-y-3.5 flex-1 mt-6">
                    {p.bullets.map((b, i) => {
                      const Icon = p.icons[i] ?? CheckCircle2;
                      return (
                        <li key={i} className="flex items-start gap-3">
                          <div className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                            <Icon className="h-3 w-3" />
                          </div>
                          <span className="text-sm md:text-base text-foreground/80 leading-relaxed">
                            {b}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
              </div>
            ))}
            <div className="w-1/2 min-w-[50%] shrink-0 md:hidden" aria-hidden="true" />
          </div>
          <div className="mt-4 flex flex-col items-center gap-2 md:hidden">
            <div className="flex items-center gap-2" aria-label={t.pillarsSwipe}>
              {[0, 1].map((index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`${t.eyebrowPillars} ${index + 1}`}
                  aria-current={pillarSlideIndex === index}
                  onClick={() => selectPillarSlide(index)}
                  className={`h-2 rounded-full transition-all duration-200 ${
                    pillarSlideIndex === index ? "w-6 bg-foreground" : "w-2 bg-foreground/20"
                  }`}
                  data-testid={`pillar-carousel-dot-${index}`}
                />
              ))}
            </div>
            <motion.div
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              animate={reduceMotion ? undefined : { x: [-4, 5, -4], opacity: [0.45, 1, 0.45] }}
              transition={reduceMotion ? undefined : { duration: 1.6, repeat: 2, ease: "easeInOut" }}
              aria-hidden="true"
            >
              <Hand className="h-3.5 w-3.5" />
              <span>{t.pillarsSwipe}</span>
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Scroll-driven marquee separator */}
      {!reduceMotion && (
        <div
          className="hidden overflow-hidden py-5 md:py-7 mt-10 md:mt-16 select-none pointer-events-none md:block"
          aria-hidden
        >
          <ScrollMarquee
            items={[
              "ORDERS", "SUPPLIERS", "CATALOG", "DELIVERY",
              "GASTRO", "CONNECT", "INVOICES", "DIGITAL",
            ]}
            speed={0.13}
          />
          <div className="mt-3 md:mt-4">
            <ScrollMarquee
              items={[
                "BESTELLUNGEN", "LIEFERANTEN", "PREISVERGLEICH",
                "LAGERHALTUNG", "CHAT", "DOKUMENTE", "AKTIONEN",
              ]}
              speed={0.085}
              direction="right"
            />
          </div>
        </div>
      )}

      {/* STEPS — So funktioniert es */}
      <section
        id="so-funktioniert"
        className="scroll-mt-20 px-4 md:px-8 py-12 md:py-32"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center mb-12 md:mb-16">
            <span className="inline-block mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
              {t.eyebrowSteps}
            </span>
            <h2
              className="text-3xl md:text-5xl font-semibold tracking-tight"
              data-testid="text-steps-headline"
            >
              <LandingWordMix>{t.stepsHeadline}</LandingWordMix>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 md:divide-x divide-border">
            {t.steps.map((s, idx) => (
              <MotionReveal key={idx} delay={idx * 100}>
                <div
                  className="px-0 md:px-8 py-6 md:py-2 text-center md:text-left"
                  data-testid={`card-step-${idx + 1}`}
                >
                  <div className="text-sm font-semibold text-muted-foreground tabular-nums">
                    0
                    <CountUp end={idx + 1} duration={700} />
                  </div>
                  <h3
                    className="mt-2 text-lg md:text-xl font-semibold tracking-tight"
                    data-testid={`text-step-title-${idx + 1}`}
                  >
                    <LandingWordMix>{s.title}</LandingWordMix>
                  </h3>
                  <p className="mt-2 text-sm md:text-base text-muted-foreground leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </MotionReveal>
            ))}
          </div>
        </div>
      </section>


      {/* FEATURES — Funktionen */}
      <section
        id="funktionen"
        className="scroll-mt-20 px-4 md:px-8 py-12 md:py-32"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center mb-12 md:mb-16">
            <span className="inline-block mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
              {t.eyebrowFeatures}
            </span>
            <h2
              className="text-3xl md:text-5xl font-semibold tracking-tight"
              data-testid="text-features-headline"
            >
              <LandingWordMix>{t.featuresHeadline}</LandingWordMix>
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.featuresSub}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {t.features.map((f, idx) => {
              const Icon = featureIcons[idx % featureIcons.length];
              return (
                <MotionReveal key={idx} delay={(idx % 5) * 60}>
                  <div
                    className="h-full rounded-2xl border border-border bg-white dark:bg-card p-5 hover-elevate transition"
                    data-testid={`feature-${idx}`}
                  >
                    <Icon className="h-5 w-5 text-foreground mb-3" />
                    <h3
                      className="font-semibold text-sm md:text-base mb-1"
                      data-testid={`text-feature-title-${idx}`}
                    >
                      <LandingWordMix>{f.title}</LandingWordMix>
                    </h3>
                    <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                      {f.desc}
                    </p>
                  </div>
                </MotionReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* SAVINGS CHART — animated bar chart + spark bars */}
      <SavingsChart lang={lang} />

      {/* B1a — Pinned Preisvergleich-Story */}
      <PinnedFeatureStory
        imageSrc={shotPriceOverview}
        imageAlt="GastroConnect Preisvergleich"
        headline={a.priceStoryHeadline}
        steps={[...a.priceStorySteps]}
        stepImages={[
          {
            src: shotPriceOverview,
            alt: "Preisvergleich-Übersicht mit mehreren Anbietern pro Produkt",
          },
          {
            src: shotPrice,
            alt: "Preisvergleich-Zeile mit hervorgehobener Ersparnis",
          },
          {
            src: shotPriceCatalog,
            alt: "Produktkatalog zum Bestellen",
          },
        ]}
        testId="pinned-story-price"
      />

      {/* B1b — Pinned Reklamation/Nachlieferung-Story */}
      <PinnedFeatureStory
        imageSrc={shotComplaintDialog}
        imageAlt="GastroConnect Reklamation im Chat"
        headline={a.complaintStoryHeadline}
        steps={[...a.complaintStorySteps]}
        stepImages={[
          {
            src: shotComplaintDialog,
            alt: "Reklamations-Wizard mit Auswahl der betroffenen Bestellung",
          },
          {
            src: shotComplaintInbox,
            alt: "Inbox mit Reklamations-Chat zum Händler",
          },
          {
            src: shotComplaintDetail,
            alt: "Reklamations-Detailansicht mit Status und Nachlieferung",
          },
        ]}
        testId="pinned-story-complaint"
        reverse
      />

      {/* MOBILE */}
      <section
        id="mobile"
        ref={phoneFrameRef}
        className="relative scroll-mt-20 px-4 md:px-8 py-12 md:py-32"
      >
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <MotionReveal>
              <span className="inline-block mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
                {t.eyebrowMobile}
              </span>
              <h2
                className="text-3xl md:text-5xl font-semibold tracking-tight"
                data-testid="text-mobile-headline"
              >
                <LandingWordMix>{t.mobileHeadline}</LandingWordMix>
              </h2>
              <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
                {t.mobileSub}
              </p>
              <ul className="mt-8 space-y-5">
                {t.mobileBullets.map((b, idx) => {
                  const Icon = mobileBulletIcons[idx];
                  return (
                    <MotionReveal key={idx} delay={idx * 80} y={16}>
                      <li
                        className="flex items-start gap-3"
                        data-testid={`mobile-bullet-${idx}`}
                      >
                        <div className="h-9 w-9 rounded-xl border border-border bg-muted/30 flex items-center justify-center shrink-0">
                          <Icon className="h-4 w-4 text-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm md:text-base">
                            {b.title}
                          </div>
                          <div className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                            {b.desc}
                          </div>
                        </div>
                      </li>
                    </MotionReveal>
                  );
                })}
              </ul>
            </MotionReveal>

            {/* Phone frame — B4 parallax (desktop) + role tab switcher */}
            <div className="flex flex-col items-center gap-5">
              <div
                role="tablist"
                aria-label="Mobile preview role"
                className="inline-flex rounded-full border border-border bg-muted/40 p-1 text-sm"
                data-testid="tabs-mobile-role"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileShotRole === "restaurant"}
                  onClick={() => setMobileShotRole("restaurant")}
                   className={`px-4 py-1.5 rounded-full text-base md:text-sm font-medium transition-colors ${
                    mobileShotRole === "restaurant"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="tab-mobile-role-restaurant"
                >
                  {t.mobileRoleRestaurant}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileShotRole === "supplier"}
                  onClick={() => setMobileShotRole("supplier")}
                   className={`px-4 py-1.5 rounded-full text-base md:text-sm font-medium transition-colors ${
                    mobileShotRole === "supplier"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="tab-mobile-role-supplier"
                >
                  {t.mobileRoleSupplier}
                </button>
              </div>
              <motion.div
                ref={phoneFrameRef}
                className="rounded-[2.75rem] border border-border bg-card p-3 shadow-2xl shadow-black/5"
                style={
                  phoneParallaxActive
                    ? { y: phoneY, willChange: "transform" }
                    : undefined
                }
              >
                <div className="relative rounded-[2.25rem] overflow-hidden border border-border w-[260px] md:w-[300px] aspect-[9/19] bg-card">
                  {(mobileShotRole === "supplier"
                    ? supplierMobileShots
                    : restaurantMobileShots
                  ).map((shot, i) => (
                    <img
                      key={shot}
                      src={shot}
                      alt={
                        mobileShotRole === "supplier"
                          ? t.mobileAltSupplier
                          : t.mobileAltRestaurant
                      }
                      width={375}
                      height={812}
                      className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-700 ${
                        i === mobileShotIndex ? "opacity-100" : "opacity-0"
                      }`}
                      loading="lazy"
                      data-testid={i === 0 ? "img-mobile-screenshot" : `img-mobile-screenshot-${i}`}
                    />
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 px-4 md:px-8 py-12 md:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="text-center mb-12 md:mb-16">
            <span className="inline-block mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
              {t.eyebrowFaq}
            </span>
            <h2
              className="text-3xl md:text-5xl font-semibold tracking-tight"
              data-testid="text-faq-headline"
            >
              <LandingWordMix>{t.faqHeadline}</LandingWordMix>
            </h2>
          </div>
          <Accordion type="single" collapsible className="divide-y divide-border border-t border-b border-border">
            {t.faq.map((item, idx) => (
              <MotionReveal key={idx} delay={idx * 60} y={12}>
              <AccordionItem
                value={`item-${idx}`}
                className="border-0"
              >
                <AccordionTrigger
                  className="py-5 text-left text-base md:text-lg font-medium hover:no-underline"
                  data-testid={`faq-q-${idx}`}
                >
                  {item.q}
                </AccordionTrigger>
                <AccordionContent
                  className="pb-5 text-sm md:text-base text-muted-foreground leading-relaxed"
                  data-testid={`faq-a-${idx}`}
                >
                  {item.a}
                </AccordionContent>
              </AccordionItem>
              </MotionReveal>
            ))}
          </Accordion>
        </div>
      </section>

      <PublicFooter lang={lang} />
    </div>
  );
}
