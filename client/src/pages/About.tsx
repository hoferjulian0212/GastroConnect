import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import Logo from "@/components/Logo";

// Accent: DM Serif Display italic — only applied to individual key words,
// never to whole sentences or paragraphs.
function A({ children }: { children: string }) {
  return <span className="gc-accent">{children}</span>;
}

export type PublicLang = "de" | "it" | "en";
const PUBLIC_LANGUAGE_KEY = "gc-landing-lang";

const publicLanguageOptions: Array<{ code: PublicLang; flag: string; label: string }> = [
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "en", flag: "🇬🇧", label: "English" },
];

export function detectPublicLanguage(): PublicLang {
  if (typeof window === "undefined") return "de";

  const isPublicLang = (value: string | null): value is PublicLang =>
    value === "de" || value === "it" || value === "en";

  try {
    const stored = window.localStorage.getItem(PUBLIC_LANGUAGE_KEY);
    if (isPublicLang(stored)) return stored;

    const cookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${PUBLIC_LANGUAGE_KEY}=`))
      ?.split("=")[1] ?? null;
    if (isPublicLang(cookie)) return cookie;
  } catch {}

  const browserLanguages = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ]
    .filter(Boolean)
    .map((language) => language.toLowerCase().split("-")[0]);

  for (const language of browserLanguages) {
    if (language === "de" || language === "it" || language === "en") return language;
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

export function PublicLanguageSwitcher({
  lang,
  onChange,
}: {
  lang: PublicLang;
  onChange: (lang: PublicLang) => void;
}) {
  const selected = publicLanguageOptions.find((option) => option.code === lang) ?? publicLanguageOptions[0];

  return (
    <label className="relative flex h-10 items-center gap-1.5 pl-1 text-xs font-medium text-black/55 transition-colors hover:text-black">
      <span aria-hidden="true" className="text-base leading-none">{selected.flag}</span>
      <span className="sr-only">{selected.label}</span>
      <select
        value={lang}
        onChange={(event) => onChange(event.target.value as PublicLang)}
        aria-label="Sprache auswählen"
        className="cursor-pointer appearance-none bg-transparent pr-4 text-[11px] font-semibold uppercase tracking-[0.12em] outline-none"
      >
        {publicLanguageOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {option.code.toUpperCase()}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-0 h-3 w-3 text-black/35" />
    </label>
  );
}

// ── Shared header ─────────────────────────────────────────────────────────────
// Floating pill header that matches the landing page header exactly.
export function PublicHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [lang, setLang] = useState<PublicLang>(detectPublicLanguage);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 md:pt-5 px-4 pointer-events-none">
       <div
        className={`pointer-events-auto w-full max-w-6xl flex items-center gap-3 px-5 py-3 md:px-7 md:py-3.5 rounded-full border transition-all duration-300 ${
          scrolled
            ? "bg-white/95 backdrop-blur-md border-black/[0.07] shadow-lg shadow-black/[0.06]"
            : "bg-white/80 backdrop-blur-sm border-black/[0.05] shadow-sm"
        }`}
      >
        {/* Logo */}
        <div className="shrink-0">
          <Link href="/" className="flex items-center" aria-label="GastroConnect Startseite">
            <Logo size="nav" variant="dark" thick />
          </Link>
        </div>

        {/* Nav links */}
        <nav className="hidden lg:flex flex-1 items-center justify-center gap-0.5 min-w-0">
          {[
            ["/features", "Funktionen"],
            ["/how-it-works", "So funktioniert es"],
            ["/faq", "FAQ"],
            ["/about", "Über uns"],
            ["/contact", "Kontakt"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="px-2.5 xl:px-3 py-1.5 rounded-full text-xs xl:text-sm font-medium text-black/55 hover:text-black hover:bg-black/[0.04] transition-colors whitespace-nowrap"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right: language + one prominent auth action */}
        <div className="flex items-center gap-2 shrink-0 ml-auto lg:ml-0">
          <PublicLanguageSwitcher
            lang={lang}
            onChange={(next) => {
              setLang(next);
              persistPublicLanguage(next);
            }}
          />
          <Link
            href="/login"
            className="h-10 items-center rounded-full bg-black px-5 text-sm font-medium text-white hover:bg-black/85 transition-colors hidden md:inline-flex"
          >
            Anmelden <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── Shared footer ─────────────────────────────────────────────────────────────
export function PublicFooter() {
  return (
    <footer className="border-t border-black/[0.08] px-4 py-12 md:px-8 md:py-16">
      <div className="mx-auto max-w-5xl grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <Logo size="footer" variant="dark" thick />
          <p className="mt-4 max-w-xs text-sm text-black/50 leading-relaxed">
            Die digitale Plattform für die Zusammenarbeit zwischen Gastronomie und Handel.
          </p>
        </div>

        <div>
          <p className="gc-kicker mb-4">Produkt</p>
          <ul className="grid gap-2.5 text-sm">
            {[
              ["/features", "Funktionen"],
              ["/how-it-works", "So funktioniert es"],
              ["/faq", "FAQ"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-black/60 hover:text-black transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="gc-kicker mb-4">Unternehmen</p>
          <ul className="grid gap-2.5 text-sm">
            {[
              ["/about", "Über uns"],
              ["/contact", "Kontakt"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-black/60 hover:text-black transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="gc-kicker mb-4">Rechtliches</p>
          <ul className="grid gap-2.5 text-sm">
            {[
              ["/impressum", "Impressum"],
              ["/datenschutz", "Datenschutz"],
              ["/agb", "AGB"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-black/60 hover:text-black transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto max-w-5xl mt-10 pt-6 border-t border-black/[0.06] flex items-center justify-between gap-4">
        <p className="text-xs text-black/35">
          © {new Date().getFullYear()} GastroConnect. Alle Rechte vorbehalten.
        </p>
        <Link href="/register" className="text-xs text-black/40 hover:text-black transition-colors">
          Jetzt starten →
        </Link>
      </div>
    </footer>
  );
}

// ── Über uns page ─────────────────────────────────────────────────────────────
export default function About() {
  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader />

      {/* ── HERO ── */}
      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">Über GastroConnect</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          Eine bessere <A>Verbindung</A><br />
          für die Gastronomie.
        </h1>
        <p className="mt-8 max-w-2xl text-base text-black/55 leading-relaxed md:text-lg">
          GastroConnect ist die digitale Infrastruktur für Betriebe und Händler in der Gastronomie — ein gemeinsamer Ort für Bestellungen, Kommunikation und alle Vorgänge.
        </p>
      </section>

      {/* ── DIVIDER ── */}
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black/[0.08]" />
      </div>

      {/* ── MISSION ── */}
      <section className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-10 md:grid-cols-[1fr_1.8fr] md:gap-20">
          <div>
            <p className="gc-kicker">Unsere Idee</p>
          </div>
          <div className="space-y-5">
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
              Weniger Reibung.<br />Mehr <A>Klarheit</A>.
            </h2>
            <p className="text-base text-black/55 leading-relaxed">
              Gute Zusammenarbeit scheitert selten an fehlendem Willen — sie scheitert an fehlenden Verbindungen.
              Informationen gehen verloren, Absprachen laufen per Telefon oder E-Mail, Bestellungen werden über
              mehrere Kanäle parallel aufgegeben.
            </p>
            <p className="text-base text-black/55 leading-relaxed">
              GastroConnect schafft einen gemeinsamen Kontext: Bestellungen, Gespräche, Dokumente und Kennzahlen
              an einem Ort — für Betriebe und Händler gleichzeitig sichtbar, immer aktuell.
            </p>
          </div>
        </div>
      </section>

      {/* ── BLACK BAND ── */}
      <section className="bg-black text-white">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
          <p className="gc-kicker text-white/40 mb-12">Was GastroConnect verbindet</p>
          <div className="grid gap-0 md:grid-cols-3">
            {[
              {
                num: "01",
                title: "Für Betriebe",
                text: "Alle Lieferanten, Bestellungen, Preisvergleiche und Dokumente an einem Ort. Kein Systemwechsel, keine verlorenen Informationen.",
              },
              {
                num: "02",
                title: "Für Händler",
                text: "Bestellungen, Lager, Lieferpläne und Kundenkommunikation in einer Oberfläche. Lieferscheine entstehen automatisch als PDF.",
              },
              {
                num: "03",
                title: "Für beide",
                text: "Ein gemeinsamer Posteingang für alle Vorgänge. Reklamationen, Nachlieferungen und Statusmeldungen bleiben im richtigen Kontext.",
              },
            ].map(({ num, title, text }) => (
              <article
                key={num}
                className="border-t border-white/15 py-10 md:pr-10"
              >
                <p className="text-xs font-semibold tracking-[.18em] uppercase text-white/30 mb-5">{num}</p>
                <h3 className="text-xl font-semibold mb-4">{title}</h3>
                <p className="text-sm text-white/55 leading-relaxed">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── WERTE ── */}
      <section className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
        <p className="gc-kicker mb-6">Wofür wir stehen</p>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
          Technologie mit <A>Wirkung</A>.
        </h2>

        <div className="mt-14 grid gap-px bg-black/[0.06] border border-black/[0.08] rounded-2xl overflow-hidden md:grid-cols-3">
          {[
            {
              title: "Einfachheit zuerst",
              text: "Kein langer Onboarding-Prozess. Registrierung, Genehmigung, loslegen — alle Funktionen stehen sofort bereit.",
            },
            {
              title: "Kein versteckter Vorteil",
              text: "Keine bezahlten Rankings, keine Werbeeinnahmen, keine Weitergabe von Kundendaten. Die Plattform bleibt neutral.",
            },
            {
              title: "Echte Beziehungen",
              text: "GastroConnect ersetzt nicht das Gespräch — es macht es besser. Jede Bestellung hat einen menschlichen Kontext.",
            },
          ].map(({ title, text }) => (
            <article key={title} className="bg-white p-8 md:p-10">
              <h3 className="text-lg font-semibold mb-3">{title}</h3>
              <p className="text-sm text-black/55 leading-relaxed">{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-5xl px-4 pb-24 md:px-8 md:pb-36">
        <div className="rounded-3xl border border-black/[0.1] px-8 py-16 md:px-16">
          <p className="gc-kicker mb-6">Der nächste Schritt</p>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
            Bereit für mehr <A>Zusammenarbeit</A>?
          </h2>
          <p className="mt-6 max-w-md text-base text-black/55 leading-relaxed">
            Registrieren Sie Ihr Unternehmen und starten Sie — als Betrieb oder Händler.
            Nach der Prüfung durch unser Team ist Ihr Zugang sofort aktiv.
          </p>
          <Link
            href="/register"
            className="mt-10 inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-black/85 transition-colors"
          >
            Jetzt registrieren <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
