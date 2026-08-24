import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import Logo from "@/components/Logo";

// ── Language utilities (re-exported for Landing.tsx and PublicInfo.tsx) ────────

export type PublicLang = "de" | "it" | "en";
export const PUBLIC_LANGUAGE_KEY = "gc-landing-lang";

const publicLanguageOptions: Array<{ code: PublicLang; flag: string; label: string }> = [
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "en", flag: "🇬🇧", label: "English" },
];

export function detectPublicLanguage(): PublicLang {
  if (typeof window === "undefined") return "de";
  const isValid = (v: string | null | undefined): v is PublicLang =>
    v === "de" || v === "it" || v === "en";
  try {
    const stored = window.localStorage.getItem(PUBLIC_LANGUAGE_KEY);
    if (isValid(stored)) return stored;
    const cookie = document.cookie
      .split("; ")
      .find((r) => r.startsWith(`${PUBLIC_LANGUAGE_KEY}=`))
      ?.split("=")[1];
    if (isValid(cookie)) return cookie;
  } catch {}
  const langs = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language ?? "",
  ].map((l) => l.toLowerCase().split("-")[0]);
  for (const l of langs) {
    if (l === "de" || l === "it" || l === "en") return l;
  }
  return "de";
}

export function persistPublicLanguage(lang: PublicLang) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PUBLIC_LANGUAGE_KEY, lang);
    document.cookie = `${PUBLIC_LANGUAGE_KEY}=${lang}; max-age=31536000; path=/; samesite=lax`;
  } catch {}
}

// ── Language switcher ─────────────────────────────────────────────────────────

export function PublicLanguageSwitcher({
  lang,
  onChange,
  compact = false,
}: {
  lang: PublicLang;
  onChange: (lang: PublicLang) => void;
  compact?: boolean;
}) {
  const selected = publicLanguageOptions.find((o) => o.code === lang) ?? publicLanguageOptions[0];
  return (
    <label className={`relative flex items-center gap-1.5 pl-1 text-xs font-medium text-black/55 transition-colors hover:text-black ${compact ? "h-8" : "h-10"}`}>
      <span aria-hidden="true" className={`${compact ? "text-sm" : "text-base"} leading-none`}>{selected.flag}</span>
      <span className="sr-only">{selected.label}</span>
      <select
        value={lang}
        onChange={(e) => onChange(e.target.value as PublicLang)}
        aria-label="Language / Sprache / Lingua"
        className={`cursor-pointer appearance-none bg-transparent font-semibold uppercase outline-none ${compact ? "pr-3 text-[10px] tracking-[0.1em]" : "pr-4 text-[11px] tracking-[0.12em]"}`}
      >
        {publicLanguageOptions.map((o) => (
          <option key={o.code} value={o.code}>{o.code.toUpperCase()}</option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className={`pointer-events-none absolute right-0 text-black/35 ${compact ? "h-2.5 w-2.5" : "h-3 w-3"}`} />
    </label>
  );
}

// ── Shared nav / footer translations ─────────────────────────────────────────

export const headerNavT = {
  de: { features: "Funktionen", howItWorks: "So funktioniert es", faq: "FAQ", about: "Über uns",  contact: "Kontakt",  signIn: "Anmelden" },
  it: { features: "Funzionalità", howItWorks: "Come funziona",   faq: "FAQ", about: "Chi siamo", contact: "Contatti", signIn: "Accedi"   },
  en: { features: "Features",     howItWorks: "How it works",    faq: "FAQ", about: "About",     contact: "Contact",  signIn: "Sign in"  },
} as const;

const footerT = {
  de: {
    tagline: "Die digitale Plattform für die Zusammenarbeit zwischen Gastronomie und Handel.",
    product: "Produkt", company: "Unternehmen", legal: "Rechtliches",
    features: "Funktionen", howItWorks: "So funktioniert es", faq: "FAQ",
    about: "Über uns", contact: "Kontakt",
    impressum: "Impressum", datenschutz: "Datenschutz", agb: "AGB",
    copyright: "Alle Rechte vorbehalten.", cta: "Jetzt starten",
  },
  it: {
    tagline: "La piattaforma digitale per la collaborazione tra gastronomia e commercio.",
    product: "Prodotto", company: "Azienda", legal: "Legale",
    features: "Funzionalità", howItWorks: "Come funziona", faq: "FAQ",
    about: "Chi siamo", contact: "Contatti",
    impressum: "Note legali", datenschutz: "Privacy", agb: "Termini",
    copyright: "Tutti i diritti riservati.", cta: "Inizia ora",
  },
  en: {
    tagline: "The digital platform for collaboration between hospitality and trade.",
    product: "Product", company: "Company", legal: "Legal",
    features: "Features", howItWorks: "How it works", faq: "FAQ",
    about: "About", contact: "Contact",
    impressum: "Imprint", datenschutz: "Privacy", agb: "Terms",
    copyright: "All rights reserved.", cta: "Get started",
  },
} as const;

// ── About-page translations ───────────────────────────────────────────────────

const aboutT = {
  de: {
    heroKicker: "Über GastroConnect",
    heroPre: "Eine bessere", heroAccent: "Verbindung", heroPost: "für die Gastronomie.",
    heroSub: "GastroConnect ist die digitale Infrastruktur für Betriebe und Händler in der Gastronomie — ein gemeinsamer Ort für Bestellungen, Kommunikation und alle Vorgänge.",
    missionKicker: "Unsere Idee",
    missionPre: "Weniger Reibung.", missionAccent: "Mehr Klarheit", missionPost: ".",
    missionP1: "Gute Zusammenarbeit scheitert selten an fehlendem Willen — sie scheitert an fehlenden Verbindungen. Informationen gehen verloren, Absprachen laufen per Telefon oder E-Mail, Bestellungen werden über mehrere Kanäle parallel aufgegeben.",
    missionP2: "GastroConnect schafft einen gemeinsamen Kontext: Bestellungen, Gespräche, Dokumente und Kennzahlen an einem Ort — für Betriebe und Händler gleichzeitig sichtbar, immer aktuell.",
    bandKicker: "Was GastroConnect verbindet",
    bandCards: [
      { num: "01", title: "Für Betriebe", text: "Alle Lieferanten, Bestellungen, Preisvergleiche und Dokumente an einem Ort. Kein Systemwechsel, keine verlorenen Informationen." },
      { num: "02", title: "Für Händler",  text: "Bestellungen, Lager, Lieferpläne und Kundenkommunikation in einer Oberfläche. Lieferscheine entstehen automatisch als PDF." },
      { num: "03", title: "Für beide",    text: "Ein gemeinsamer Posteingang für alle Vorgänge. Reklamationen, Nachlieferungen und Statusmeldungen bleiben im richtigen Kontext." },
    ],
    valuesKicker: "Wofür wir stehen",
    valuesPre: "Technologie mit", valuesAccent: "Wirkung", valuesPost: ".",
    valueCards: [
      { title: "Einfachheit zuerst",      text: "Kein langer Onboarding-Prozess. Registrierung, Genehmigung, loslegen — alle Funktionen stehen sofort bereit." },
      { title: "Kein versteckter Vorteil",text: "Keine bezahlten Rankings, keine Werbeeinnahmen, keine Weitergabe von Kundendaten. Die Plattform bleibt neutral." },
      { title: "Echte Beziehungen",       text: "GastroConnect ersetzt nicht das Gespräch — es macht es besser. Jede Bestellung hat einen menschlichen Kontext." },
    ],
    ctaKicker: "Der nächste Schritt",
    ctaPre: "Bereit für mehr", ctaAccent: "Zusammenarbeit", ctaPost: "?",
    ctaText: "Registrieren Sie Ihr Unternehmen und starten Sie — als Betrieb oder Händler. Nach der Prüfung durch unser Team ist Ihr Zugang sofort aktiv.",
    ctaButton: "Jetzt registrieren",
  },
  it: {
    heroKicker: "Chi siamo",
    heroPre: "Una migliore", heroAccent: "connessione", heroPost: "per la gastronomia.",
    heroSub: "GastroConnect è l'infrastruttura digitale per aziende e commercianti nel settore gastronomico — un luogo comune per ordini, comunicazione e tutte le pratiche.",
    missionKicker: "La nostra idea",
    missionPre: "Meno attrito.", missionAccent: "Più chiarezza", missionPost: ".",
    missionP1: "La buona collaborazione raramente fallisce per mancanza di volontà — fallisce per mancanza di connessioni. Le informazioni si perdono, gli accordi avvengono per telefono o email, gli ordini vengono effettuati su più canali in parallelo.",
    missionP2: "GastroConnect crea un contesto comune: ordini, conversazioni, documenti e indicatori in un unico posto — visibile contemporaneamente ad aziende e commercianti, sempre aggiornato.",
    bandKicker: "Cosa connette GastroConnect",
    bandCards: [
      { num: "01", title: "Per le aziende",     text: "Tutti i fornitori, ordini, confronti prezzi e documenti in un unico posto. Nessun cambio di sistema, nessuna informazione persa." },
      { num: "02", title: "Per i commercianti", text: "Ordini, magazzino, piani di consegna e comunicazione con i clienti in un'unica interfaccia. Le bolle di consegna si generano automaticamente in PDF." },
      { num: "03", title: "Per entrambi",       text: "Una casella comune per tutte le pratiche. Reclami, riconsegne e aggiornamenti di stato rimangono nel contesto giusto." },
    ],
    valuesKicker: "In cosa crediamo",
    valuesPre: "Tecnologia con", valuesAccent: "impatto", valuesPost: ".",
    valueCards: [
      { title: "Semplicità prima di tutto", text: "Nessun lungo processo di onboarding. Registrazione, approvazione, via — tutte le funzioni sono subito disponibili." },
      { title: "Nessun vantaggio nascosto", text: "Nessun ranking a pagamento, nessun ricavo pubblicitario, nessuna cessione di dati clienti. La piattaforma rimane neutrale." },
      { title: "Relazioni vere",            text: "GastroConnect non sostituisce la conversazione — la migliora. Ogni ordine ha un contesto umano." },
    ],
    ctaKicker: "Il prossimo passo",
    ctaPre: "Pronti per più", ctaAccent: "collaborazione", ctaPost: "?",
    ctaText: "Registra la tua azienda e inizia — come ristorante o fornitore. Dopo la verifica del nostro team, il tuo accesso è subito attivo.",
    ctaButton: "Registrati ora",
  },
  en: {
    heroKicker: "About GastroConnect",
    heroPre: "A better", heroAccent: "connection", heroPost: "for hospitality.",
    heroSub: "GastroConnect is the digital infrastructure for restaurants and suppliers — one shared place for orders, communication, and every transaction.",
    missionKicker: "Our idea",
    missionPre: "Less friction.", missionAccent: "More clarity", missionPost: ".",
    missionP1: "Good collaboration rarely fails due to a lack of willingness — it fails due to a lack of connection. Information gets lost, agreements happen over the phone or email, orders are placed across multiple channels at the same time.",
    missionP2: "GastroConnect creates a shared context: orders, conversations, documents and metrics in one place — visible to both businesses and suppliers simultaneously, always up to date.",
    bandKicker: "What GastroConnect connects",
    bandCards: [
      { num: "01", title: "For businesses", text: "All suppliers, orders, price comparisons and documents in one place. No system switching, no lost information." },
      { num: "02", title: "For suppliers",  text: "Orders, inventory, delivery schedules and customer communication in one interface. Delivery notes are generated automatically as PDFs." },
      { num: "03", title: "For both",       text: "One shared inbox for every transaction. Complaints, re-deliveries and status updates stay in the right context." },
    ],
    valuesKicker: "What we stand for",
    valuesPre: "Technology with", valuesAccent: "impact", valuesPost: ".",
    valueCards: [
      { title: "Simplicity first",    text: "No lengthy onboarding. Register, get approved, start — all features are available immediately." },
      { title: "No hidden advantage", text: "No paid rankings, no ad revenue, no selling of customer data. The platform stays neutral." },
      { title: "Real relationships",  text: "GastroConnect doesn't replace the conversation — it makes it better. Every order has a human context." },
    ],
    ctaKicker: "Next step",
    ctaPre: "Ready for more", ctaAccent: "collaboration", ctaPost: "?",
    ctaText: "Register your business and get started — as a restaurant or supplier. Once our team approves your account, your access is immediately active.",
    ctaButton: "Register now",
  },
} as const;

// ── Accent span ───────────────────────────────────────────────────────────────

function A({ children }: { children: string }) {
  return <span className="gc-accent">{children}</span>;
}

// ── Shared public header ──────────────────────────────────────────────────────
// lang and onChange are required — each page manages its own lang state and
// passes it down so nav labels and the CTA button translate together.

export function PublicHeader({
  lang,
  onChange,
}: {
  lang: PublicLang;
  onChange: (l: PublicLang) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const nav = headerNavT[lang];

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-8 px-4 pointer-events-none">
      <div
        className={`pointer-events-auto w-full max-w-6xl flex items-center gap-3 px-5 py-3 md:px-7 md:py-3.5 rounded-full border transition-all duration-300 ${
          scrolled
            ? "bg-white/95 backdrop-blur-md border-black/[0.07] shadow-lg shadow-black/[0.06]"
            : "bg-white/80 backdrop-blur-sm border-black/[0.05] shadow-sm"
        }`}
      >
        <div className="shrink-0">
          <Link href="/" className="flex items-center" aria-label="GastroConnect">
            <Logo size="nav" variant="dark" thick />
          </Link>
        </div>

        <nav className="hidden lg:flex flex-1 items-center justify-center gap-0.5 min-w-0">
          {(
            [
              ["/features",     nav.features],
              ["/how-it-works", nav.howItWorks],
              ["/faq",          nav.faq],
              ["/about",        nav.about],
              ["/contact",      nav.contact],
            ] as [string, string][]
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="px-2.5 xl:px-3 py-1.5 rounded-full text-xs xl:text-sm font-medium text-black/55 hover:text-black hover:bg-black/[0.04] transition-colors whitespace-nowrap"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
          <PublicLanguageSwitcher lang={lang} onChange={onChange} />
          <Link
            href="/login"
            className="h-10 items-center rounded-full bg-black px-5 text-sm font-medium text-white hover:bg-black/85 transition-colors hidden md:inline-flex"
          >
            {nav.signIn} <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── Shared public footer ──────────────────────────────────────────────────────

export function PublicFooter({ lang }: { lang: PublicLang }) {
  const t = footerT[lang];
  return (
    <footer className="bg-white text-black border-t border-black/[0.08] px-4 py-12 md:px-8 md:py-16">
      <div className="mx-auto max-w-5xl grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <Logo size="footer" variant="dark" thick />
          <p className="mt-4 max-w-xs text-sm text-black/50 leading-relaxed">{t.tagline}</p>
        </div>

        <div>
            <p className="gc-kicker mb-4 !font-extrabold !text-black">{t.product}</p>
          <ul className="grid gap-2.5 text-sm">
            {(
              [
                ["/features",     t.features],
                ["/how-it-works", t.howItWorks],
                ["/faq",          t.faq],
              ] as [string, string][]
            ).map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-black/60 hover:text-black transition-colors">{label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
            <p className="gc-kicker mb-4 !font-extrabold !text-black">{t.company}</p>
          <ul className="grid gap-2.5 text-sm">
            {(
              [
                ["/about",   t.about],
                ["/contact", t.contact],
              ] as [string, string][]
            ).map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-black/60 hover:text-black transition-colors">{label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
            <p className="gc-kicker mb-4 !font-extrabold !text-black">{t.legal}</p>
          <ul className="grid gap-2.5 text-sm">
            {(
              [
                ["/impressum",   t.impressum],
                ["/datenschutz", t.datenschutz],
                ["/agb",         t.agb],
              ] as [string, string][]
            ).map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-black/60 hover:text-black transition-colors">{label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-5xl mt-10 pt-6 border-t border-black/[0.06] flex items-center justify-between gap-4">
        <p className="text-xs text-black/35">© {new Date().getFullYear()} GastroConnect. {t.copyright}</p>
        <Link
          href="/register"
          className="inline-flex items-center gap-1.5 rounded-full bg-black px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-black/85"
        >
          {t.cta}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </footer>
  );
}

// ── About page ────────────────────────────────────────────────────────────────

export default function About() {
  const [lang, setLang] = useState<PublicLang>(detectPublicLanguage);

  function handleLang(l: PublicLang) {
    setLang(l);
    persistPublicLanguage(l);
  }

  const t = aboutT[lang];

  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader lang={lang} onChange={handleLang} />

      {/* HERO */}
      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">{t.heroKicker}</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          {t.heroPre} <A>{t.heroAccent}</A><br />
          {t.heroPost}
        </h1>
        <p className="mt-8 max-w-2xl text-base text-black/55 leading-relaxed md:text-lg">{t.heroSub}</p>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black/[0.08]" />
      </div>

      {/* MISSION */}
      <section className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-10 md:grid-cols-[1fr_1.8fr] md:gap-20">
          <div>
            <p className="gc-kicker">{t.missionKicker}</p>
          </div>
          <div className="space-y-5">
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
              {t.missionPre}<br /><A>{t.missionAccent}</A>{t.missionPost}
            </h2>
            <p className="text-base text-black/55 leading-relaxed">{t.missionP1}</p>
            <p className="text-base text-black/55 leading-relaxed">{t.missionP2}</p>
          </div>
        </div>
      </section>

      {/* BLACK BAND */}
      <section className="bg-black text-white">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
          <p className="gc-kicker text-white/40 mb-12">{t.bandKicker}</p>
          <div className="grid gap-0 md:grid-cols-3">
            {t.bandCards.map(({ num, title, text }) => (
              <article key={num} className="border-t border-white/15 py-10 md:pr-10">
                <p className="text-xs font-semibold tracking-[.18em] uppercase text-white/30 mb-5">{num}</p>
                <h3 className="text-xl font-semibold mb-4">{title}</h3>
                <p className="text-sm text-white/55 leading-relaxed">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
        <p className="gc-kicker mb-6">{t.valuesKicker}</p>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
          {t.valuesPre} <A>{t.valuesAccent}</A>{t.valuesPost}
        </h2>
        <div className="mt-14 grid gap-px bg-black/[0.06] border border-black/[0.08] rounded-2xl overflow-hidden md:grid-cols-3">
          {t.valueCards.map(({ title, text }) => (
            <article key={title} className="bg-white p-8 md:p-10">
              <h3 className="text-lg font-semibold mb-3">{title}</h3>
              <p className="text-sm text-black/55 leading-relaxed">{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 pb-24 md:px-8 md:pb-36">
        <div className="rounded-3xl border border-black/[0.1] px-8 py-16 md:px-16">
          <p className="gc-kicker mb-6">{t.ctaKicker}</p>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
            {t.ctaPre} <A>{t.ctaAccent}</A>{t.ctaPost}
          </h2>
          <p className="mt-6 max-w-md text-base text-black/55 leading-relaxed">{t.ctaText}</p>
          <Link
            href="/register"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-black/85 transition-colors"
          >
            {t.ctaButton} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <PublicFooter lang={lang} />
    </div>
  );
}
