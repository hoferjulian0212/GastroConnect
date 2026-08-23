import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check } from "lucide-react";
import {
  PublicFooter,
  PublicHeader,
  PublicLang,
  detectPublicLanguage,
  persistPublicLanguage,
} from "./About";

// ── Accent span ───────────────────────────────────────────────────────────────
function A({ children }: { children: string }) {
  return <span className="gc-accent">{children}</span>;
}

// ── Lang-state hook ───────────────────────────────────────────────────────────
function useLang(): [PublicLang, (l: PublicLang) => void] {
  const [lang, setLang] = useState<PublicLang>(detectPublicLanguage);
  function handleLang(l: PublicLang) {
    setLang(l);
    persistPublicLanguage(l);
  }
  return [lang, handleLang];
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURES PAGE
// ─────────────────────────────────────────────────────────────────────────────

const featuresT = {
  de: {
    kicker: "Produkt",
    heroPre: "Alles, was", heroAccent: "Zusammenarbeit", heroPost: "leichter macht.",
    heroSub: "Ein gemeinsamer Ort für Bestellungen, Lieferanten, Dokumente und Gespräche — klar strukturiert für den Alltag.",
    features: [
      { title: "Katalog & Preisvergleich",       text: "Alle Produkte aller Lieferanten in einer Ansicht. Preise für identische Artikel werden nebeneinandergestellt — die Entscheidung liegt bei Ihnen." },
      { title: "Bestellungen & Kommunikation",   text: "Bestellen, bestätigen, liefern — jeder Schritt bleibt am richtigen Vorgang. Rückfragen, Änderungen und Reklamationen direkt in der Plattform." },
      { title: "Lieferscheine als PDF",          text: "Beim Bestätigen einer Bestellung entsteht automatisch ein A4-Lieferschein — im Chat geteilt, im Dokumentencenter archiviert." },
      { title: "Statistiken & Kennzahlen",       text: "Wareneinsatz pro Gast, Monatsausgaben, Top-Produkte und offene Bestellungen — live für Betriebe und Händler." },
      { title: "Aktionen & Promotionen",         text: "Händler schalten Rabattaktionen direkt im Katalog. Betriebe sehen Aktionen dort, wo sie kaufen." },
      { title: "Push-Benachrichtigungen",        text: "Echtzeit-Benachrichtigungen auf allen Geräten — mit Deeplinks direkt in den richtigen Vorgang." },
      { title: "Bestellvorlagen",                text: "Wiederkehrende Bestellungen als Vorlage speichern und in Sekunden auslösen — ohne Artikel einzeln zusammenzusuchen." },
      { title: "Dokumentencenter",               text: "Alle Lieferscheine und Rechnungen sortiert nach Händler, mit Übersicht über Mengen, Werte und Zeiträume." },
      { title: "KI-Assistent",                   text: "Unterstützung bei Produktsuche, Lieferantenvergleich und Auswertung — die KI liefert Informationen, nie Entscheidungen." },
    ],
    ctaKicker: "Loslegen",
    ctaPre: "Alle Funktionen.", ctaAccent: "Sofort verfügbar", ctaPost: ".",
    ctaButton: "Jetzt registrieren",
  },
  it: {
    kicker: "Prodotto",
    heroPre: "Tutto ciò che rende", heroAccent: "la collaborazione", heroPost: "più facile.",
    heroSub: "Un unico posto per ordini, fornitori, documenti e conversazioni — strutturato chiaramente per la routine quotidiana.",
    features: [
      { title: "Catalogo e confronto prezzi",    text: "Tutti i prodotti di tutti i fornitori in una vista. I prezzi per articoli identici vengono affiancati — la scelta spetta a voi." },
      { title: "Ordini e comunicazione",         text: "Ordina, conferma, consegna — ogni passaggio rimane legato alla pratica giusta. Domande, modifiche e reclami direttamente nella piattaforma." },
      { title: "Bolle di consegna PDF",          text: "Alla conferma di un ordine viene generata automaticamente una bolla A4 — condivisa in chat, archiviata nel centro documenti." },
      { title: "Statistiche e indicatori",       text: "Costo merce per ospite, spese mensili, top prodotti e ordini aperti — live per aziende e commercianti." },
      { title: "Promozioni",                     text: "I commercianti attivano sconti direttamente nel catalogo. Le aziende vedono le promozioni dove acquistano." },
      { title: "Notifiche push",                 text: "Notifiche in tempo reale su tutti i dispositivi — con deep link direttamente alla pratica giusta." },
      { title: "Modelli d'ordine",               text: "Salva ordini ricorrenti come modello e attivali in pochi secondi — senza cercare ogni articolo singolarmente." },
      { title: "Centro documenti",               text: "Tutte le bolle e le fatture ordinate per commerciante, con panoramica di quantità, valori e periodi." },
      { title: "Assistente AI",                  text: "Supporto nella ricerca prodotti, confronto fornitori e analisi — l'AI fornisce informazioni, mai decisioni." },
    ],
    ctaKicker: "Inizia",
    ctaPre: "Tutte le funzioni.", ctaAccent: "Subito disponibili", ctaPost: ".",
    ctaButton: "Registrati ora",
  },
  en: {
    kicker: "Product",
    heroPre: "Everything that makes", heroAccent: "collaboration", heroPost: "easier.",
    heroSub: "One shared place for orders, suppliers, documents and conversations — clearly structured for everyday use.",
    features: [
      { title: "Catalogue & price comparison",  text: "All products from all suppliers in one view. Prices for identical items are shown side by side — the decision is yours." },
      { title: "Orders & communication",        text: "Order, confirm, deliver — every step stays tied to the right transaction. Questions, changes and complaints directly in the platform." },
      { title: "Delivery notes as PDF",         text: "When an order is confirmed, an A4 delivery note is generated automatically — shared in chat, archived in the document centre." },
      { title: "Statistics & KPIs",             text: "Food cost per guest, monthly spending, top products and open orders — live for both businesses and suppliers." },
      { title: "Promotions",                    text: "Suppliers run discount promotions directly in the catalogue. Businesses see them where they buy." },
      { title: "Push notifications",            text: "Real-time notifications on all devices — with deep links directly to the right transaction." },
      { title: "Order templates",               text: "Save recurring orders as a template and trigger them in seconds — without searching for each item individually." },
      { title: "Document centre",               text: "All delivery notes and invoices sorted by supplier, with an overview of quantities, values and time periods." },
      { title: "AI assistant",                  text: "Help with product search, supplier comparison and analysis — the AI provides information, never decisions." },
    ],
    ctaKicker: "Get started",
    ctaPre: "All features.", ctaAccent: "Available now", ctaPost: ".",
    ctaButton: "Register now",
  },
} as const;

function FeaturesPage() {
  const [lang, handleLang] = useLang();
  const t = featuresT[lang];

  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader lang={lang} onChange={handleLang} />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">{t.kicker}</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          {t.heroPre} <A>{t.heroAccent}</A><br />{t.heroPost}
        </h1>
        <p className="mt-8 max-w-2xl text-base text-black/55 leading-relaxed md:text-lg">{t.heroSub}</p>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black/[0.08]" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-px bg-black/[0.06] border border-black/[0.08] rounded-2xl overflow-hidden md:grid-cols-3">
          {t.features.map(({ title, text }) => (
            <article key={title} className="bg-white p-8 md:p-9">
              <h2 className="text-lg font-semibold mb-3">{title}</h2>
              <p className="text-sm text-black/55 leading-relaxed">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24 md:px-8 md:pb-36">
        <div className="rounded-3xl border border-black/[0.1] px-8 py-14 md:px-16 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div>
            <p className="gc-kicker mb-4">{t.ctaKicker}</p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {t.ctaPre}<br /><A>{t.ctaAccent}</A>{t.ctaPost}
            </h2>
          </div>
          <Link
            href="/register"
            className="shrink-0 inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-black/85 transition-colors"
          >
            {t.ctaButton} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <PublicFooter lang={lang} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOW IT WORKS PAGE
// ─────────────────────────────────────────────────────────────────────────────

const howItWorksT = {
  de: {
    kicker: "Ablauf",
    heroPre: "Von der", heroAccent: "Registrierung", heroPost: "bis zum Alltag.",
    heroSub: "GastroConnect verbindet die Schritte, die heute oft über mehrere Kanäle verteilt sind — in einem klaren Ablauf.",
    steps: [
      { num: "01", title: "Registrierung",   text: "Wählen Sie Ihre Rolle — Betrieb oder Händler — und füllen Sie Ihr Unternehmensprofil aus. Die Registrierung dauert wenige Minuten.",       detail: "Unternehmensname, Kontaktperson, Adresse, Kurzbeschreibung" },
      { num: "02", title: "Genehmigung",     text: "Unser Team prüft Ihre Angaben und schaltet Ihren Zugang frei. Sie erhalten eine E-Mail-Bestätigung.",                                     detail: "In der Regel innerhalb eines Werktages" },
      { num: "03", title: "Einrichtung",     text: "Als Händler laden Sie Ihr Sortiment hoch und richten Lieferpläne ein. Als Betrieb fügen Sie Ihre Lieferanten hinzu und erkunden den Katalog.", detail: "ERP-Import verfügbar für Händler" },
      { num: "04", title: "Zusammenarbeit", text: "Bestellen, bestätigen, liefern, kommunizieren — alles in einer Oberfläche. Dokumente entstehen automatisch, Benachrichtigungen halten alle auf dem Laufenden.", detail: "Alle Geräte, auch offline-fähig als PWA" },
    ],
    bandRestaurantKicker: "Für Betriebe",
    bandSupplierKicker: "Für Händler",
    restaurantList: [
      "Lieferanten entdecken und hinzufügen",
      "Katalog durchsuchen und vergleichen",
      "Bestellung aufgeben und Liefertermin wählen",
      "Status verfolgen und Dokumente herunterladen",
      "Reklamation direkt am Vorgang eröffnen",
    ],
    supplierList: [
      "Sortiment anlegen oder per ERP importieren",
      "Lieferpläne und Zeitfenster konfigurieren",
      "Eingehende Bestellungen bestätigen",
      "Lieferschein automatisch als PDF versenden",
      "Reklamation bearbeiten und Nachlieferung anlegen",
    ],
    ctaButton: "Jetzt registrieren",
  },
  it: {
    kicker: "Come funziona",
    heroPre: "Dalla", heroAccent: "registrazione", heroPost: "alla routine quotidiana.",
    heroSub: "GastroConnect unisce i passaggi che oggi spesso sono distribuiti su più canali — in un flusso chiaro.",
    steps: [
      { num: "01", title: "Registrazione",    text: "Scegli il tuo ruolo — azienda o commerciante — e compila il profilo della tua impresa. La registrazione richiede pochi minuti.",              detail: "Nome azienda, referente, indirizzo, breve descrizione" },
      { num: "02", title: "Approvazione",     text: "Il nostro team verifica i tuoi dati e attiva il tuo accesso. Riceverai una conferma via email.",                                             detail: "Di solito entro un giorno lavorativo" },
      { num: "03", title: "Configurazione",   text: "Come commerciante carichi il tuo assortimento e imposti i piani di consegna. Come azienda aggiungi i tuoi fornitori ed esplori il catalogo.", detail: "Importazione ERP disponibile per i commercianti" },
      { num: "04", title: "Collaborazione",   text: "Ordina, conferma, consegna, comunica — tutto in un'unica interfaccia. I documenti si generano automaticamente, le notifiche tengono tutti aggiornati.", detail: "Tutti i dispositivi, anche offline come PWA" },
    ],
    bandRestaurantKicker: "Per le aziende",
    bandSupplierKicker: "Per i commercianti",
    restaurantList: [
      "Scopri e aggiungi fornitori",
      "Sfoglia e confronta il catalogo",
      "Fai un ordine e scegli la data di consegna",
      "Monitora lo stato e scarica i documenti",
      "Apri un reclamo direttamente sulla pratica",
    ],
    supplierList: [
      "Crea l'assortimento o importa da ERP",
      "Configura piani di consegna e fasce orarie",
      "Conferma gli ordini in arrivo",
      "Invia automaticamente la bolla di consegna in PDF",
      "Gestisci i reclami e crea una riconsegna",
    ],
    ctaButton: "Registrati ora",
  },
  en: {
    kicker: "How it works",
    heroPre: "From", heroAccent: "registration", heroPost: "to everyday use.",
    heroSub: "GastroConnect connects the steps that are often spread across multiple channels today — in one clear flow.",
    steps: [
      { num: "01", title: "Registration",    text: "Choose your role — business or supplier — and fill in your company profile. Registration takes just a few minutes.",                          detail: "Company name, contact person, address, short description" },
      { num: "02", title: "Approval",        text: "Our team reviews your information and activates your access. You will receive an email confirmation.",                                       detail: "Usually within one business day" },
      { num: "03", title: "Setup",           text: "As a supplier you upload your catalogue and configure delivery schedules. As a business you add your suppliers and explore the catalogue.",  detail: "ERP import available for suppliers" },
      { num: "04", title: "Collaboration",   text: "Order, confirm, deliver, communicate — all in one interface. Documents are generated automatically, notifications keep everyone informed.",  detail: "All devices, also offline-capable as a PWA" },
    ],
    bandRestaurantKicker: "For businesses",
    bandSupplierKicker: "For suppliers",
    restaurantList: [
      "Discover and add suppliers",
      "Browse and compare the catalogue",
      "Place an order and choose a delivery date",
      "Track status and download documents",
      "Open a complaint directly on the transaction",
    ],
    supplierList: [
      "Create your catalogue or import via ERP",
      "Configure delivery schedules and time windows",
      "Confirm incoming orders",
      "Send the delivery note automatically as a PDF",
      "Handle complaints and create a re-delivery",
    ],
    ctaButton: "Register now",
  },
} as const;

function HowItWorksPage() {
  const [lang, handleLang] = useLang();
  const t = howItWorksT[lang];

  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader lang={lang} onChange={handleLang} />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">{t.kicker}</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          {t.heroPre} <A>{t.heroAccent}</A><br />{t.heroPost}
        </h1>
        <p className="mt-8 max-w-2xl text-base text-black/55 leading-relaxed md:text-lg">{t.heroSub}</p>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black/[0.08]" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-0">
          {t.steps.map(({ num, title, text, detail }) => (
            <article
              key={num}
              className="grid gap-4 border-b border-black/[0.08] py-10 md:grid-cols-[.4fr_1.6fr_1fr] md:gap-12 md:py-14"
            >
              <p className="text-xs font-semibold tracking-[.18em] uppercase text-black/30">{num}</p>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-3">{title}</h2>
                <p className="text-base text-black/55 leading-relaxed">{text}</p>
              </div>
              <p className="text-sm text-black/35 leading-relaxed">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-black text-white">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
          <div className="grid gap-12 md:grid-cols-2 md:gap-20">
            <div>
              <p className="gc-kicker text-white/40 mb-6">{t.bandRestaurantKicker}</p>
              <ul className="space-y-3">
                {t.restaurantList.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-white/70">
                    <Check className="h-4 w-4 shrink-0 mt-0.5 text-white/40" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="gc-kicker text-white/40 mb-6">{t.bandSupplierKicker}</p>
              <ul className="space-y-3">
                {t.supplierList.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-white/70">
                    <Check className="h-4 w-4 shrink-0 mt-0.5 text-white/40" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20 pb-24 md:px-8 md:pb-36">
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-black/85 transition-colors"
        >
          {t.ctaButton} <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <PublicFooter lang={lang} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FAQ PAGE
// ─────────────────────────────────────────────────────────────────────────────

const faqT = {
  de: {
    kicker: "Fragen & Antworten",
    heroPre: "Gut zu wissen.", heroAccent: "Kurz erklärt", heroPost: ".",
    heroSub: "Die wichtigsten Antworten rund um GastroConnect, Zugang und Zusammenarbeit.",
    faqs: [
      { q: "Wer kann GastroConnect nutzen?",           a: "GastroConnect ist für Gastronomiebetriebe (Restaurants, Hotels, Cafés) und Lebensmittelhändler in Südtirol und der angrenzenden Region. Beide Seiten arbeiten auf derselben Plattform, in getrennten, auf die jeweilige Rolle zugeschnittenen Bereichen." },
      { q: "Wie bekomme ich Zugang?",                  a: "Sie registrieren Ihr Unternehmen über das Formular auf dieser Seite. Nach der Prüfung durch unser Team erhalten Sie eine Bestätigung per E-Mail — in der Regel innerhalb eines Werktages." },
      { q: "Kann ich Teammitglieder einladen?",        a: "Ja. Als Administrator Ihres Unternehmens können Sie beliebig viele Mitarbeitende mit unterschiedlichen Rollen einladen (Manager, Einkäufer, Fahrer, Lager). Jede Person erhält eine eigene Einladungs-E-Mail." },
      { q: "Funktioniert GastroConnect auf dem Smartphone?", a: "GastroConnect ist als Progressive Web App (PWA) optimiert — vollständig responsive, installierbar auf iOS und Android, und für wichtige Ansichten auch offline verfügbar." },
      { q: "Wie werden Lieferscheine erstellt?",       a: "Sobald ein Händler eine Bestellung bestätigt, wird automatisch ein A4-Lieferschein als PDF generiert. Dieser wird im Chat mit dem Betrieb geteilt und im Dokumentencenter beider Seiten abgelegt." },
      { q: "Wie funktioniert der Preisvergleich?",     a: "Produkte, die bei mehreren Händlern verfügbar sind, werden in einer Vergleichsansicht zusammengefasst. Sie sehen Preis, Einheit und Verfügbarkeit aller Anbieter nebeneinander — und können direkt aus dieser Ansicht bestellen." },
      { q: "Welche Daten werden gespeichert?",         a: "GastroConnect speichert ausschließlich Daten, die für den Betrieb der Plattform notwendig sind — Unternehmensprofil, Bestellhistorie, Dokumente und Kommunikation. Es werden keine Daten an Dritte weitergegeben und keine Werbung geschaltet." },
      { q: "Was kostet GastroConnect?",                a: "Kontaktieren Sie uns für die passende Lösung für Ihr Unternehmen. Wir bieten transparente Konditionen ohne versteckte Kosten." },
    ],
    notFound: "Ihre Frage ist nicht dabei?",
    contactLink: "Kontakt aufnehmen",
  },
  it: {
    kicker: "Domande e risposte",
    heroPre: "Utile sapere.", heroAccent: "In breve", heroPost: ".",
    heroSub: "Le risposte più importanti su GastroConnect, accesso e collaborazione.",
    faqs: [
      { q: "Chi può usare GastroConnect?",              a: "GastroConnect è rivolto ad aziende gastronomiche (ristoranti, hotel, bar) e commercianti alimentari in Alto Adige e nelle regioni limitrofe. Entrambe le parti lavorano sulla stessa piattaforma, in aree separate e adattate al rispettivo ruolo." },
      { q: "Come ottengo l'accesso?",                   a: "Registrate la vostra azienda tramite il modulo su questa pagina. Dopo la verifica del nostro team riceverete una conferma via email — di solito entro un giorno lavorativo." },
      { q: "Posso invitare membri del team?",           a: "Sì. Come amministratore della vostra azienda potete invitare un numero illimitato di collaboratori con ruoli diversi (manager, acquirente, autista, magazzino). Ogni persona riceve la propria email di invito." },
      { q: "GastroConnect funziona sullo smartphone?",  a: "GastroConnect è ottimizzato come Progressive Web App (PWA) — completamente responsive, installabile su iOS e Android, e disponibile offline per le viste principali." },
      { q: "Come vengono create le bolle di consegna?", a: "Non appena un commerciante conferma un ordine, viene generata automaticamente una bolla A4 in PDF. Questa viene condivisa in chat con l'azienda e archiviata nel centro documenti di entrambe le parti." },
      { q: "Come funziona il confronto prezzi?",        a: "I prodotti disponibili presso più commercianti vengono raggruppati in una vista di confronto. Vedete prezzo, unità e disponibilità di tutti i fornitori affiancati — e potete ordinare direttamente da questa vista." },
      { q: "Quali dati vengono salvati?",               a: "GastroConnect salva esclusivamente i dati necessari per il funzionamento della piattaforma — profilo aziendale, storico ordini, documenti e comunicazione. Nessun dato viene ceduto a terzi e non viene pubblicità." },
      { q: "Quanto costa GastroConnect?",               a: "Contattateci per la soluzione adatta alla vostra azienda. Offriamo condizioni trasparenti senza costi nascosti." },
    ],
    notFound: "La tua domanda non c'è?",
    contactLink: "Contattaci",
  },
  en: {
    kicker: "FAQ",
    heroPre: "Good to know.", heroAccent: "Briefly explained", heroPost: ".",
    heroSub: "The most important answers about GastroConnect, access and collaboration.",
    faqs: [
      { q: "Who can use GastroConnect?",                a: "GastroConnect is for hospitality businesses (restaurants, hotels, cafés) and food suppliers in South Tyrol and the surrounding region. Both sides work on the same platform, in separate areas tailored to each role." },
      { q: "How do I get access?",                      a: "Register your business via the form on this page. After our team reviews your details, you will receive an email confirmation — usually within one business day." },
      { q: "Can I invite team members?",                a: "Yes. As your company's administrator, you can invite any number of team members with different roles (manager, buyer, driver, warehouse). Each person receives their own invitation email." },
      { q: "Does GastroConnect work on mobile?",        a: "GastroConnect is optimised as a Progressive Web App (PWA) — fully responsive, installable on iOS and Android, and available offline for key views." },
      { q: "How are delivery notes created?",           a: "As soon as a supplier confirms an order, an A4 delivery note is automatically generated as a PDF. This is shared in the chat with the business and archived in both parties' document centres." },
      { q: "How does the price comparison work?",       a: "Products available from multiple suppliers are grouped in a comparison view. You see price, unit and availability from all providers side by side — and can order directly from this view." },
      { q: "What data is stored?",                      a: "GastroConnect stores only data necessary to operate the platform — company profile, order history, documents and communication. No data is passed on to third parties and no advertising is shown." },
      { q: "How much does GastroConnect cost?",         a: "Contact us for the right solution for your business. We offer transparent pricing with no hidden costs." },
    ],
    notFound: "Can't find your question?",
    contactLink: "Get in touch",
  },
} as const;

function FaqPage() {
  const [lang, handleLang] = useLang();
  const t = faqT[lang];

  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader lang={lang} onChange={handleLang} />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">{t.kicker}</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          {t.heroPre}<br /><A>{t.heroAccent}</A>{t.heroPost}
        </h1>
        <p className="mt-8 max-w-2xl text-base text-black/55 leading-relaxed md:text-lg">{t.heroSub}</p>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-10 pb-24 md:px-8 md:pb-36">
        {t.faqs.map(({ q, a }) => (
          <article
            key={q}
            className="grid gap-4 border-b border-black/[0.08] py-8 md:grid-cols-[1fr_1.4fr] md:gap-16 md:py-10"
          >
            <h2 className="text-base font-semibold leading-snug">{q}</h2>
            <p className="text-base text-black/55 leading-relaxed">{a}</p>
          </article>
        ))}

        <div className="mt-16">
          <p className="text-base text-black/55 mb-6">{t.notFound}</p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-black/85 transition-colors"
          >
            {t.contactLink} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <PublicFooter lang={lang} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT PAGE
// ─────────────────────────────────────────────────────────────────────────────

const contactT = {
  de: {
    kicker: "Kontakt",
    heroPre: "Sprechen wir über", heroAccent: "Ihren Alltag", heroPost: ".",
    heroSub: "Sie möchten GastroConnect kennenlernen oder mit Ihrem Unternehmen starten? Wir freuen uns über Ihre Nachricht.",
    rows: [
      { label: "E-Mail",        value: "hello@gastroconnect.app", desc: "Für alle Anfragen — wir antworten in der Regel innerhalb von 24 Stunden.", link: "mailto:hello@gastroconnect.app" },
      { label: "Für Betriebe",  value: "Zugang anfragen",         desc: "Erzählen Sie uns, welche Abläufe Sie vereinfachen möchten und wie groß Ihr Betrieb ist.", link: "/register" },
      { label: "Für Händler",   value: "Sortiment zeigen",        desc: "Bringen Sie Ihr Sortiment auf eine Plattform, die Ihre Kunden täglich nutzen.", link: "/register" },
    ],
    bandKicker: "Direkt starten",
    bandPre: "Registrieren und", bandAccent: "sofort loslegen", bandPost: ".",
    bandSub: "Die Registrierung dauert wenige Minuten. Nach der Prüfung durch unser Team ist Ihr Zugang aktiv.",
    bandButton: "Jetzt registrieren",
  },
  it: {
    kicker: "Contatti",
    heroPre: "Parliamo della", heroAccent: "vostra attività", heroPost: ".",
    heroSub: "Volete conoscere GastroConnect o iniziare con la vostra azienda? Siamo felici di ricevere il vostro messaggio.",
    rows: [
      { label: "Email",             value: "hello@gastroconnect.app", desc: "Per tutte le richieste — di solito rispondiamo entro 24 ore.", link: "mailto:hello@gastroconnect.app" },
      { label: "Per le aziende",    value: "Richiedi l'accesso",      desc: "Dite ci quali processi volete semplificare e le dimensioni della vostra attività.", link: "/register" },
      { label: "Per i commercianti",value: "Mostra il tuo catalogo",  desc: "Porta il tuo assortimento su una piattaforma usata quotidianamente dai tuoi clienti.", link: "/register" },
    ],
    bandKicker: "Inizia subito",
    bandPre: "Registrati e", bandAccent: "inizia subito", bandPost: ".",
    bandSub: "La registrazione richiede pochi minuti. Dopo la verifica del nostro team il tuo accesso è attivo.",
    bandButton: "Registrati ora",
  },
  en: {
    kicker: "Contact",
    heroPre: "Let's talk about", heroAccent: "your day-to-day", heroPost: ".",
    heroSub: "Want to get to know GastroConnect or get your business started? We'd love to hear from you.",
    rows: [
      { label: "Email",         value: "hello@gastroconnect.app", desc: "For all enquiries — we usually reply within 24 hours.", link: "mailto:hello@gastroconnect.app" },
      { label: "For businesses",value: "Request access",          desc: "Tell us which workflows you'd like to simplify and how large your business is.", link: "/register" },
      { label: "For suppliers", value: "Show your catalogue",     desc: "Bring your range to a platform your customers use every day.", link: "/register" },
    ],
    bandKicker: "Get started",
    bandPre: "Register and", bandAccent: "start immediately", bandPost: ".",
    bandSub: "Registration takes just a few minutes. Once our team approves you, your access is active right away.",
    bandButton: "Register now",
  },
} as const;

function ContactPage() {
  const [lang, handleLang] = useLang();
  const t = contactT[lang];

  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader lang={lang} onChange={handleLang} />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">{t.kicker}</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          {t.heroPre}<br /><A>{t.heroAccent}</A>{t.heroPost}
        </h1>
        <p className="mt-8 max-w-2xl text-base text-black/55 leading-relaxed md:text-lg">{t.heroSub}</p>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black/[0.08]" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-0">
          {t.rows.map(({ label, value, desc, link }) => (
            <article
              key={label}
              className="grid gap-4 border-b border-black/[0.08] py-10 md:grid-cols-[.5fr_1fr_1.2fr] md:gap-12"
            >
              <p className="text-xs font-semibold tracking-[.18em] uppercase text-black/35">{label}</p>
              <a href={link} className="text-xl font-semibold tracking-tight hover:opacity-60 transition-opacity">{value}</a>
              <p className="text-sm text-black/55 leading-relaxed">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-black text-white">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
          <p className="gc-kicker text-white/40 mb-6">{t.bandKicker}</p>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
            {t.bandPre}<br /><A>{t.bandAccent}</A>{t.bandPost}
          </h2>
          <p className="mt-6 max-w-md text-base text-white/55 leading-relaxed">{t.bandSub}</p>
          <Link
            href="/register"
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:bg-white/90 transition-colors"
          >
            {t.bandButton} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="pb-12 md:pb-16" />
      <PublicFooter lang={lang} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL PAGE (Impressum / Datenschutz / AGB)
// Legal text stays in German as required by law.
// A localized notice is shown for IT and EN visitors.
// ─────────────────────────────────────────────────────────────────────────────

const legalNotice: Record<PublicLang, string | null> = {
  de: null,
  it: "Questo documento è disponibile esclusivamente in tedesco, come richiesto dalla normativa vigente.",
  en: "This document is only available in German, as required by applicable law.",
};

const legalPages = {
  impressum: {
    kicker: "Rechtliches",
    titlePre: "", titleAccent: "Impressum", titlePost: ".",
    sections: [
      { title: "Angaben zum Unternehmen", text: "GastroConnect\nDigitale Plattform für die Lebensmittelversorgung und Gastronomie\n\nFür geschäftliche Anfragen erreichen Sie uns unter:\nhello@gastroconnect.app" },
      { title: "Haftungshinweis", text: "Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich." },
      { title: "Urheberrecht", text: "Die auf dieser Website veröffentlichten Inhalte und Werke unterliegen dem Urheberrecht. Jede Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedarf der vorherigen schriftlichen Zustimmung." },
    ],
  },
  datenschutz: {
    kicker: "Rechtliches",
    titlePre: "Ihr ", titleAccent: "Datenschutz", titlePost: ".",
    sections: [
      { title: "Grundsatz", text: "Der Schutz personenbezogener Daten ist ein zentraler Bestandteil von GastroConnect. Wir verarbeiten nur Daten, die für den Betrieb der Plattform, die Kommunikation und die Sicherheit erforderlich sind." },
      { title: "Welche Daten wir verarbeiten", text: "Unternehmensprofil und Kontaktdaten, Bestellhistorie und Kommunikation auf der Plattform, technische Zugriffsdaten (IP-Adresse, Browser-Typ) sowie Dokumente, die Sie auf der Plattform hochladen oder generieren." },
      { title: "Weitergabe an Dritte", text: "Personenbezogene Daten werden nicht an Dritte weitergegeben, nicht für Werbezwecke genutzt und nicht verkauft. Ausnahmen bestehen ausschließlich bei gesetzlicher Verpflichtung." },
      { title: "Ihre Rechte", text: "Sie haben jederzeit das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung Ihrer Daten. Für entsprechende Anfragen wenden Sie sich an hello@gastroconnect.app." },
      { title: "Cookies", text: "GastroConnect verwendet ausschließlich technisch notwendige Cookies für die Sitzungsverwaltung. Es werden keine Tracking- oder Werbe-Cookies eingesetzt." },
    ],
  },
  agb: {
    kicker: "Rechtliches",
    titlePre: "Unsere ", titleAccent: "Bedingungen", titlePost: ".",
    sections: [
      { title: "§ 1 Geltungsbereich", text: "Diese Bedingungen gelten für die Nutzung der GastroConnect-Plattform durch Unternehmen und ihre durch Einladung hinzugefügten Mitarbeitenden." },
      { title: "§ 2 Zugang und Registrierung", text: "Der Zugang zur Plattform setzt eine erfolgreiche Registrierung und Prüfung durch GastroConnect voraus. Ein Rechtsanspruch auf Zulassung besteht nicht. Zugangsdaten sind vertraulich zu behandeln." },
      { title: "§ 3 Nutzung der Plattform", text: "Die Plattform darf ausschließlich für legitime gewerbliche Zwecke im Bereich Gastronomie und Lebensmittelhandel genutzt werden. Missbräuchliche Nutzung, Scraping oder die Weitergabe von Zugangsdaten sind untersagt." },
      { title: "§ 4 Inhalte und Daten", text: "Unternehmen sind für die Richtigkeit der von ihnen eingestellten Inhalte (Produkte, Preise, Dokumente) verantwortlich. GastroConnect übernimmt keine Haftung für die Vollständigkeit oder Richtigkeit dieser Inhalte." },
      { title: "§ 5 Verfügbarkeit", text: "GastroConnect strebt eine hohe Verfügbarkeit der Plattform an, übernimmt jedoch keine Garantie für eine unterbrechungsfreie Nutzung. Wartungsarbeiten werden nach Möglichkeit im Voraus angekündigt." },
      { title: "§ 6 Änderungen", text: "GastroConnect behält sich das Recht vor, diese Bedingungen mit angemessener Vorankündigung zu ändern. Die weitere Nutzung der Plattform nach einer Änderung gilt als Zustimmung." },
    ],
  },
} as const;

function LegalPage({ type }: { type: "impressum" | "datenschutz" | "agb" }) {
  const [lang, handleLang] = useLang();
  const page = legalPages[type];
  const notice = legalNotice[lang];

  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader lang={lang} onChange={handleLang} />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">{page.kicker}</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          {page.titlePre}<A>{page.titleAccent}</A>{page.titlePost}
        </h1>
        {notice && (
          <p className="mt-6 max-w-xl text-sm text-black/40 leading-relaxed border border-black/[0.08] rounded-xl px-5 py-3">
            {notice}
          </p>
        )}
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-10 pb-24 md:px-8 md:pb-36">
        {page.sections.map(({ title, text }) => (
          <article
            key={title}
            className="grid gap-4 border-b border-black/[0.08] py-8 md:grid-cols-[.6fr_1.4fr] md:gap-16 md:py-10"
          >
            <h2 className="text-base font-semibold leading-snug">{title}</h2>
            <div className="space-y-3">
              {text.split("\n\n").map((para, i) => (
                <p key={i} className="text-base text-black/55 leading-relaxed whitespace-pre-line">{para}</p>
              ))}
            </div>
          </article>
        ))}
      </section>

      <PublicFooter lang={lang} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Route dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export function FeaturesRoute()    { return <FeaturesPage />; }
export function HowItWorksRoute()  { return <HowItWorksPage />; }
export function FaqRoute()         { return <FaqPage />; }
export function ContactRoute()     { return <ContactPage />; }
export function ImpressumRoute()   { return <LegalPage type="impressum" />; }
export function DatenschutzRoute() { return <LegalPage type="datenschutz" />; }
export function AgbRoute()         { return <LegalPage type="agb" />; }
