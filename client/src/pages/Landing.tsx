import { useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { useUser } from "@/context/UserContext";
import { Button } from "@/components/ui/button";
import { MotionReveal } from "@/components/landing/MotionReveal";
import CountUp from "@/components/CountUp";
import { HeadlineReveal } from "@/components/landing/HeadlineReveal";
import { HeroShotReveal } from "@/components/landing/HeroShotReveal";
import { TiltCard } from "@/components/landing/TiltCard";
import { PinnedFeatureStory } from "@/components/landing/PinnedFeatureStory";
import { useLandingSmoothScroll } from "@/components/landing/useLandingSmoothScroll";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import logoImg from "@assets/logo_no_bg.png";
import shotHome from "@assets/landing-home.jpg";
import shotMobile from "@assets/landing-mobile.png";
import shotMobileSupplier from "@assets/landing-mobile-supplier.png";
import shotPrice from "@assets/landing-price-comparison.jpg";
import shotInbox from "@assets/landing-inbox.jpg";
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
  Sparkles,
  Wallet,
  Search,
  ChevronRight,
  ArrowRight,
  Utensils,
  Store,
  Menu,
  CheckCircle2,
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

    heroH1: "Händler und Betriebe. Endlich auf einer Plattform.",
    heroSub:
      "GastroConnect verbindet Lieferanten und Gastronomie direkt — mit Preisvergleichen, Ausgabenübersicht und allen Bestellungen an einem Ort.",
    heroCtaRestaurant: "Als Betrieb starten",
    heroCtaSupplier: "Als Händler starten",
    heroImageAlt: "GastroConnect Restaurant-Dashboard",

    pillarsHeadline: "Für wen GastroConnect gebaut ist",
    pillarsSub:
      "Eine Plattform, zwei klar getrennte Erlebnisse — beide perfekt auf die jeweilige Rolle zugeschnitten.",
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

    showcaseHeadline: "Sehen Sie es in Aktion",
    showcaseSub:
      "Die wichtigsten Ansichten aus der App — direkte Sicht auf das, womit Sie täglich arbeiten.",
    showcase: [
      {
        img: shotHome,
        caption: "Bestellungen, Nachrichten und Ausgaben auf einen Blick.",
        alt: "Restaurant-Dashboard",
      },
      {
        img: shotPrice,
        caption: "Preisvergleich für identische Produkte über alle Händler.",
        alt: "Preisvergleich",
      },
      {
        img: shotInbox,
        caption: "Chat zu jeder Bestellung — Nachrichten, Belege, Reklamationen.",
        alt: "Chat & Inbox",
      },
    ],

    mobileHeadline: "Ihre Bestellungen — immer in der Tasche",
    mobileSub:
      "GastroConnect funktioniert auf jedem Gerät. Das mobile Erlebnis ist genauso vollständig wie am Desktop.",
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
  },
  it: {
    navAnchorPillars: "Per chi",
    navAnchorSteps: "Come funziona",
    navAnchorFeatures: "Funzionalità",
    navAnchorMobile: "Mobile",
    navAnchorFaq: "FAQ",
    navLogin: "Accedi",
    navStart: "Inizia ora",

    heroH1: "Commercianti e aziende. Finalmente su un'unica piattaforma.",
    heroSub:
      "GastroConnect collega direttamente fornitori e gastronomia — con confronto prezzi, panoramica spese e tutti gli ordini in un unico posto.",
    heroCtaRestaurant: "Inizia come azienda",
    heroCtaSupplier: "Inizia come commerciante",
    heroImageAlt: "Dashboard ristorante GastroConnect",

    pillarsHeadline: "Per chi è pensato GastroConnect",
    pillarsSub:
      "Una piattaforma, due esperienze chiaramente separate — entrambe ottimizzate per il rispettivo ruolo.",
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

    showcaseHeadline: "Guardalo in azione",
    showcaseSub:
      "Le viste più importanti dell'app — uno sguardo diretto a ciò con cui lavori ogni giorno.",
    showcase: [
      { img: shotHome, caption: "Ordini, messaggi e spese in un colpo d'occhio.", alt: "Dashboard ristorante" },
      { img: shotPrice, caption: "Confronto prezzi per prodotti identici tra tutti i commercianti.", alt: "Confronto prezzi" },
      { img: shotInbox, caption: "Chat per ogni ordine — messaggi, documenti, reclami.", alt: "Chat & inbox" },
    ],

    mobileHeadline: "I tuoi ordini — sempre in tasca",
    mobileSub:
      "GastroConnect funziona su qualsiasi dispositivo. L'esperienza mobile è completa come quella desktop.",
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
  },
  en: {
    navAnchorPillars: "Who it's for",
    navAnchorSteps: "How it works",
    navAnchorFeatures: "Features",
    navAnchorMobile: "Mobile",
    navAnchorFaq: "FAQ",
    navLogin: "Sign in",
    navStart: "Get started",

    heroH1: "Suppliers and restaurants. Finally on one platform.",
    heroSub:
      "GastroConnect connects suppliers and hospitality directly — with price comparison, spending overview and all your orders in one place.",
    heroCtaRestaurant: "Start as a restaurant",
    heroCtaSupplier: "Start as a supplier",
    heroImageAlt: "GastroConnect restaurant dashboard",

    pillarsHeadline: "Who GastroConnect is built for",
    pillarsSub:
      "One platform, two clearly separated experiences — both tailored perfectly to their role.",
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

    showcaseHeadline: "See it in action",
    showcaseSub: "The most important views from the app — a direct look at what you'll work with every day.",
    showcase: [
      { img: shotHome, caption: "Orders, messages and spending at a glance.", alt: "Restaurant dashboard" },
      { img: shotPrice, caption: "Price comparison for identical products across every supplier.", alt: "Price comparison" },
      { img: shotInbox, caption: "Chat on every order — messages, documents, complaints.", alt: "Chat & inbox" },
    ],

    mobileHeadline: "Your orders — always in your pocket",
    mobileSub: "GastroConnect runs on every device. The mobile experience is just as complete as the desktop one.",
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
  },
} as const;

type Lang = keyof typeof translations;
const LANG_STORAGE_KEY = "gc-landing-lang";

function detectInitialLang(): Lang {
  if (typeof window === "undefined") return "de";
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY) as Lang | null;
    if (stored && stored in translations) return stored;
  } catch {}
  const nav = (typeof navigator !== "undefined" ? navigator.language : "de").toLowerCase();
  if (nav.startsWith("it")) return "it";
  if (nav.startsWith("en")) return "en";
  return "de";
}

const pillarRestaurantIcons = [Search, BarChart3, Wallet, Eye];
const pillarSupplierIcons = [Package, Sparkles, FileText, BarChart3];
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

export default function Landing() {
  const [, setLocation] = useLocation();
  const { currentUser, currentRole } = useUser();
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("de");
  const [mobileShotRole, setMobileShotRole] = useState<"restaurant" | "supplier">("restaurant");
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

  // A1 — Lenis smooth scroll (landing only, desktop only, reduced-motion safe)
  useLandingSmoothScroll();

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
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {}
  }

  const t = translations[lang];
  const a = animationStrings[lang];

  function handleStart(role: "restaurant" | "supplier") {
    setLocation(`/${role}`);
  }

  function handleLogin() {
    setLocation("/login");
  }

  const anchors = [
    { id: "fuer-wen", label: t.navAnchorPillars },
    { id: "so-funktioniert", label: t.navAnchorSteps },
    { id: "funktionen", label: t.navAnchorFeatures },
    { id: "mobile", label: t.navAnchorMobile },
    { id: "faq", label: t.navAnchorFaq },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-background text-foreground">
      {/* HEADER */}
      <header
        className={`sticky top-0 z-50 transition-all ${
          scrolled
            ? "bg-white/85 dark:bg-background/85 backdrop-blur-md border-b border-border"
            : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-3 px-4 py-3 md:px-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="flex items-center gap-2 shrink-0"
            data-testid="link-brand"
          >
            <img
              src={logoImg}
              alt="GastroConnect Logo"
              className="h-10 w-10 md:h-12 md:w-12 object-contain dark:invert -mr-1"
            />
            <span
              className="font-semibold text-base md:text-lg tracking-tight"
              data-testid="text-brand-name"
            >
              GastroConnect
            </span>
          </a>

          {/* Desktop anchor nav */}
          <div className="hidden lg:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {anchors.map((item) => (
              <button
                key={item.id}
                onClick={() => smoothScrollTo(item.id)}
                className="px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                data-testid={`nav-anchor-${item.id}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              className="hidden md:flex items-center rounded-full border border-border bg-card p-0.5 text-xs font-medium"
              data-testid="lang-switcher"
            >
              {(["de", "it", "en"] as const).map((code) => (
                <button
                  key={code}
                  onClick={() => changeLang(code)}
                  className={`px-2 py-1 rounded-full uppercase tracking-wide transition-colors ${
                    lang === code
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`lang-${code}`}
                >
                  {code}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex"
              onClick={handleLogin}
              data-testid="link-login"
            >
              {t.navLogin}
            </Button>
            <Button
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => handleStart("restaurant")}
              data-testid="button-nav-start"
            >
              {t.navStart}
            </Button>

            {/* Mobile menu */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button
                  className="lg:hidden flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground"
                  aria-label="Menu"
                  data-testid="button-mobile-menu"
                >
                  <Menu className="h-4 w-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] p-0">
                <div className="flex flex-col h-full">
                  <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <img
                      src={logoImg}
                      alt=""
                      className="h-9 w-9 object-contain dark:invert"
                    />
                    <span className="font-semibold tracking-tight">
                      GastroConnect
                    </span>
                  </div>
                  <div className="flex-1 px-3 py-4 flex flex-col">
                    {anchors.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setMobileNavOpen(false);
                          setTimeout(() => smoothScrollTo(item.id), 60);
                        }}
                        className="text-left px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60"
                        data-testid={`nav-mobile-${item.id}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-border p-4 space-y-3">
                    <div
                      className="flex items-center justify-center rounded-full border border-border bg-card p-0.5 text-xs font-medium"
                      data-testid="lang-switcher-mobile"
                    >
                      {(["de", "it", "en"] as const).map((code) => (
                        <button
                          key={code}
                          onClick={() => changeLang(code)}
                          className={`flex-1 px-3 py-1.5 rounded-full uppercase tracking-wide transition-colors ${
                            lang === code
                              ? "bg-foreground text-background"
                              : "text-muted-foreground"
                          }`}
                          data-testid={`lang-mobile-${code}`}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setMobileNavOpen(false);
                        handleLogin();
                      }}
                      data-testid="link-login-mobile"
                    >
                      {t.navLogin}
                    </Button>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setMobileNavOpen(false);
                        handleStart("restaurant");
                      }}
                      data-testid="button-mobile-start"
                    >
                      {t.navStart}
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <div id="top" />

      {/* HERO */}
      <section className="px-4 md:px-8 pt-12 md:pt-20 pb-12 md:pb-16">
        <div className="mx-auto max-w-5xl text-center">
          <HeadlineReveal
            key={`hero-${lang}`}
            text={t.heroH1}
            className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05] max-w-4xl mx-auto"
            testId="text-hero-headline"
          />
          <MotionReveal delay={400} y={16} blur={false}>
            <p className="mt-6 text-base md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              {t.heroSub}
            </p>
            <div className="mt-8 md:mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="w-full sm:w-auto gap-2 text-base"
                onClick={() => handleStart("restaurant")}
                data-testid="button-hero-restaurant"
              >
                <Utensils className="h-4 w-4" />
                {t.heroCtaRestaurant}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto gap-2 text-base"
                onClick={() => handleStart("supplier")}
                data-testid="button-hero-supplier"
              >
                <Store className="h-4 w-4" />
                {t.heroCtaSupplier}
              </Button>
            </div>
          </MotionReveal>
        </div>

        {/* Hero screenshot — A2 grow + B2 callouts + B3 tilt */}
        <div className="mx-auto max-w-6xl mt-12 md:mt-16">
          <HeroShotReveal
            src={shotHome}
            alt={t.heroImageAlt}
            callouts={[
              { label: a.callout2, ax: 24, ay: 42, lx: 14, ly: 52, testId: "callout-chat" },
              { label: a.callout3, ax: 20, ay: 84, lx: 48, ly: 52, testId: "callout-pdf" },
              { label: a.callout1, ax: 93, ay: 85, lx: 82, ly: 52, testId: "callout-price" },
            ]}
            kpis={[
              { label: a.kpiSavings, value: 18, suffix: "%", x: 16, y: 104, testId: "kpi-savings" },
              { label: a.kpiOrders, value: 1240, x: 50, y: 104, testId: "kpi-orders" },
              { label: a.kpiSuppliers, value: 86, x: 84, y: 104, testId: "kpi-suppliers" },
            ]}
          />
        </div>
      </section>

      {/* PILLARS — Für wen */}
      <section
        id="fuer-wen"
        className="scroll-mt-20 px-4 md:px-8 py-24 md:py-32"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center mb-12 md:mb-16">
            <h2
              className="text-3xl md:text-5xl font-semibold tracking-tight"
              data-testid="text-pillars-headline"
            >
              {t.pillarsHeadline}
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.pillarsSub}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                title: t.pillarRestaurantTitle,
                bullets: t.pillarRestaurantBullets,
                icons: pillarRestaurantIcons,
                head: Utensils,
                cta: t.heroCtaRestaurant,
                role: "restaurant" as const,
                testid: "card-pillar-restaurant",
              },
              {
                title: t.pillarSupplierTitle,
                bullets: t.pillarSupplierBullets,
                icons: pillarSupplierIcons,
                head: Store,
                cta: t.heroCtaSupplier,
                role: "supplier" as const,
                testid: "card-pillar-supplier",
              },
            ].map((p, pIdx) => (
              <MotionReveal key={p.role} delay={pIdx * 120}>
              <div
                className="h-full rounded-2xl border border-border bg-white dark:bg-card p-7 md:p-8 flex flex-col"
                data-testid={p.testid}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-xl border border-border bg-muted/30 flex items-center justify-center">
                    <p.head className="h-5 w-5 text-foreground" />
                  </div>
                  <h3
                    className="text-xl md:text-2xl font-semibold tracking-tight"
                    data-testid={`text-${p.testid}-title`}
                  >
                    {p.title}
                  </h3>
                </div>
                <ul className="space-y-3 flex-1">
                  {p.bullets.map((b, i) => {
                    const Icon = p.icons[i] ?? CheckCircle2;
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <Icon className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                        <span className="text-sm md:text-base text-foreground/80 leading-relaxed">
                          {b}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  variant="outline"
                  className="mt-7 self-start gap-2"
                  onClick={() => handleStart(p.role)}
                  data-testid={`button-${p.testid}-cta`}
                >
                  {p.cta}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              </MotionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* STEPS — So funktioniert es */}
      <section
        id="so-funktioniert"
        className="scroll-mt-20 px-4 md:px-8 py-24 md:py-32"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center mb-12 md:mb-16">
            <h2
              className="text-3xl md:text-5xl font-semibold tracking-tight"
              data-testid="text-steps-headline"
            >
              {t.stepsHeadline}
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
                    {s.title}
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
        className="scroll-mt-20 px-4 md:px-8 py-24 md:py-32"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center mb-12 md:mb-16">
            <h2
              className="text-3xl md:text-5xl font-semibold tracking-tight"
              data-testid="text-features-headline"
            >
              {t.featuresHeadline}
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
                      {f.title}
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

      {/* B1a — Pinned Preisvergleich-Story */}
      <PinnedFeatureStory
        imageSrc={shotPrice}
        imageAlt="GastroConnect Preisvergleich"
        headline={a.priceStoryHeadline}
        steps={[...a.priceStorySteps]}
        testId="pinned-story-price"
      />

      {/* B1b — Pinned Reklamation/Nachlieferung-Story */}
      <PinnedFeatureStory
        imageSrc={shotInbox}
        imageAlt="GastroConnect Reklamation im Chat"
        headline={a.complaintStoryHeadline}
        steps={[...a.complaintStorySteps]}
        testId="pinned-story-complaint"
        reverse
      />

      {/* SHOWCASE — Inline-Produktvorschau */}
      <section className="px-4 md:px-8 py-24 md:py-32">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center mb-12 md:mb-16">
            <h2
              className="text-3xl md:text-5xl font-semibold tracking-tight"
              data-testid="text-showcase-headline"
            >
              {t.showcaseHeadline}
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              {t.showcaseSub}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {t.showcase.map((s, idx) => (
              <MotionReveal key={idx} delay={idx * 90}>
                <figure
                  className="flex flex-col"
                  data-testid={`showcase-${idx}`}
                >
                  <TiltCard className="rounded-2xl border border-border overflow-hidden shadow-xl shadow-black/5 bg-card">
                    <img
                      src={s.img}
                      alt={s.alt}
                      className="w-full h-auto block"
                      loading="lazy"
                    />
                  </TiltCard>
                  <figcaption className="mt-4 text-sm text-muted-foreground leading-relaxed">
                    {s.caption}
                  </figcaption>
                </figure>
              </MotionReveal>
            ))}
          </div>
        </div>
      </section>

      {/* MOBILE */}
      <section
        id="mobile"
        ref={phoneFrameRef}
        className="relative scroll-mt-20 px-4 md:px-8 py-24 md:py-32"
      >
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <MotionReveal>
              <h2
                className="text-3xl md:text-5xl font-semibold tracking-tight"
                data-testid="text-mobile-headline"
              >
                {t.mobileHeadline}
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
                  className={`px-4 py-1.5 rounded-full font-medium transition-colors ${
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
                  className={`px-4 py-1.5 rounded-full font-medium transition-colors ${
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
                <div className="rounded-[2.25rem] overflow-hidden border border-border w-[260px] md:w-[300px] aspect-[9/19] bg-card">
                  <img
                    src={mobileShotRole === "supplier" ? shotMobileSupplier : shotMobile}
                    alt={
                      mobileShotRole === "supplier"
                        ? t.mobileAltSupplier
                        : t.mobileAltRestaurant
                    }
                    width={375}
                    height={812}
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                    data-testid="img-mobile-screenshot"
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 px-4 md:px-8 py-24 md:py-32">
        <div className="mx-auto max-w-3xl">
          <div className="text-center mb-12 md:mb-16">
            <h2
              className="text-3xl md:text-5xl font-semibold tracking-tight"
              data-testid="text-faq-headline"
            >
              {t.faqHeadline}
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

      {/* FINAL CTA */}
      <section className="px-4 md:px-8 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            className="text-3xl md:text-5xl font-semibold tracking-tight"
            data-testid="text-cta-headline"
          >
            {t.ctaHeadline}
          </h2>
          <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
            {t.ctaSub}
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="w-full sm:w-auto gap-2 text-base"
              onClick={() => handleStart("restaurant")}
              data-testid="button-cta-restaurant"
            >
              <Utensils className="h-4 w-4" />
              {t.heroCtaRestaurant}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto gap-2 text-base"
              onClick={() => handleStart("supplier")}
              data-testid="button-cta-supplier"
            >
              <Store className="h-4 w-4" />
              {t.heroCtaSupplier}
            </Button>
          </div>
          <p className="mt-5 text-sm md:text-base text-muted-foreground inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-foreground/60" />
            {t.ctaConfirm}
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border px-4 md:px-8 py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img
                  src={logoImg}
                  alt="GastroConnect Logo"
                  className="h-10 w-10 object-contain dark:invert -mr-1"
                />
                <span
                  className="font-semibold text-sm tracking-tight"
                  data-testid="text-footer-brand"
                >
                  GastroConnect
                </span>
              </div>
              <p
                className="text-sm text-muted-foreground leading-relaxed max-w-xs"
                data-testid="text-footer-tagline"
              >
                {t.footerTagline}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t.footerTitleProduct}
              </h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <button
                    onClick={() => smoothScrollTo("funktionen")}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-features"
                  >
                    {t.footerLinkFeatures}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => smoothScrollTo("so-funktioniert")}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-steps"
                  >
                    {t.footerLinkSteps}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => smoothScrollTo("faq")}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-faq"
                  >
                    {t.footerLinkFaq}
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t.footerTitleCompany}
              </h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="/about"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-about"
                  >
                    {t.footerLinkAbout}
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:hello@gastroconnect.app"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-contact"
                  >
                    {t.footerLinkContact}
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t.footerTitleLegal}
              </h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="/impressum"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-imprint"
                  >
                    {t.footerLinkImprint}
                  </a>
                </li>
                <li>
                  <a
                    href="/datenschutz"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-privacy"
                  >
                    {t.footerLinkPrivacy}
                  </a>
                </li>
                <li>
                  <a
                    href="/agb"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-terms"
                  >
                    {t.footerLinkTerms}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-border flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-footer-copyright"
            >
              © {new Date().getFullYear()} GastroConnect. {t.footerCopyright}
            </p>
            <p className="text-sm text-muted-foreground">
              Made for Gastronomie
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
