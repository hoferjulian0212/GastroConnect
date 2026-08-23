import { Link } from "wouter";
import { ArrowRight, Check } from "lucide-react";
import { PublicFooter, PublicHeader } from "./About";

// Accent: DM Serif Display italic — only on individual key words.
function A({ children }: { children: string }) {
  return <span className="gc-accent">{children}</span>;
}

// ── Page content definitions ──────────────────────────────────────────────────

function FeaturesPage() {
  const features = [
    {
      title: "Katalog & Preisvergleich",
      text: "Alle Produkte aller Lieferanten in einer Ansicht. Preise für identische Artikel werden nebeneinandergestellt — die Entscheidung liegt bei Ihnen.",
    },
    {
      title: "Bestellungen & Kommunikation",
      text: "Bestellen, bestätigen, liefern — jeder Schritt bleibt am richtigen Vorgang. Rückfragen, Änderungen und Reklamationen direkt in der Plattform.",
    },
    {
      title: "Lieferscheine als PDF",
      text: "Beim Bestätigen einer Bestellung entsteht automatisch ein A4-Lieferschein — im Chat geteilt, im Dokumentencenter archiviert.",
    },
    {
      title: "Statistiken & Kennzahlen",
      text: "Wareneinsatz pro Gast, Monatsausgaben, Top-Produkte und offene Bestellungen — live für Betriebe und Händler.",
    },
    {
      title: "Aktionen & Promotionen",
      text: "Händler schalten Rabattaktionen direkt im Katalog. Betriebe sehen Aktionen dort, wo sie kaufen.",
    },
    {
      title: "Push-Benachrichtigungen",
      text: "Echtzeit-Benachrichtigungen auf allen Geräten — mit Deeplinks direkt in den richtigen Vorgang.",
    },
    {
      title: "Bestellvorlagen",
      text: "Wiederkehrende Bestellungen als Vorlage speichern und in Sekunden auslösen — ohne Artikel einzeln zusammenzusuchen.",
    },
    {
      title: "Dokumentencenter",
      text: "Alle Lieferscheine und Rechnungen sortiert nach Händler, mit Übersicht über Mengen, Werte und Zeiträume.",
    },
    {
      title: "KI-Assistent",
      text: "Unterstützung bei Produktsuche, Lieferantenvergleich und Auswertung — die KI liefert Informationen, nie Entscheidungen.",
    },
  ];

  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">Produkt</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          Alles, was <A>Zusammenarbeit</A><br />
          leichter macht.
        </h1>
        <p className="mt-8 max-w-2xl text-base text-black/55 leading-relaxed md:text-lg">
          Ein gemeinsamer Ort für Bestellungen, Lieferanten, Dokumente und Gespräche — klar strukturiert für den Alltag.
        </p>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black/[0.08]" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-px bg-black/[0.06] border border-black/[0.08] rounded-2xl overflow-hidden md:grid-cols-3">
          {features.map(({ title, text }) => (
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
            <p className="gc-kicker mb-4">Loslegen</p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Alle Funktionen.<br />Sofort <A>verfügbar</A>.
            </h2>
          </div>
          <Link
            href="/register"
            className="shrink-0 inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-black/85 transition-colors"
          >
            Jetzt registrieren <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

function HowItWorksPage() {
  const steps = [
    {
      num: "01",
      title: "Registrierung",
      text: "Wählen Sie Ihre Rolle — Betrieb oder Händler — und füllen Sie Ihr Unternehmensprofil aus. Die Registrierung dauert wenige Minuten.",
      detail: "Unternehmensname, Kontaktperson, Adresse, Kurzbeschreibung",
    },
    {
      num: "02",
      title: "Genehmigung",
      text: "Unser Team prüft Ihre Angaben und schaltet Ihren Zugang frei. Sie erhalten eine E-Mail-Bestätigung.",
      detail: "In der Regel innerhalb eines Werktages",
    },
    {
      num: "03",
      title: "Einrichtung",
      text: "Als Händler laden Sie Ihr Sortiment hoch und richten Lieferpläne ein. Als Betrieb fügen Sie Ihre Lieferanten hinzu und erkunden den Katalog.",
      detail: "ERP-Import verfügbar für Händler",
    },
    {
      num: "04",
      title: "Zusammenarbeit",
      text: "Bestellen, bestätigen, liefern, kommunizieren — alles in einer Oberfläche. Dokumente entstehen automatisch, Benachrichtigungen halten alle auf dem Laufenden.",
      detail: "Alle Geräte, auch offline-fähig als PWA",
    },
  ];

  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">Ablauf</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          Von der <A>Registrierung</A><br />
          bis zum Alltag.
        </h1>
        <p className="mt-8 max-w-2xl text-base text-black/55 leading-relaxed md:text-lg">
          GastroConnect verbindet die Schritte, die heute oft über mehrere Kanäle verteilt sind — in einem klaren Ablauf.
        </p>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black/[0.08]" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-0">
          {steps.map(({ num, title, text, detail }) => (
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
              <p className="gc-kicker text-white/40 mb-6">Für Betriebe</p>
              <ul className="space-y-3">
                {[
                  "Lieferanten entdecken und hinzufügen",
                  "Katalog durchsuchen und vergleichen",
                  "Bestellung aufgeben und Liefertermin wählen",
                  "Status verfolgen und Dokumente herunterladen",
                  "Reklamation direkt am Vorgang eröffnen",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-white/70">
                    <Check className="h-4 w-4 shrink-0 mt-0.5 text-white/40" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="gc-kicker text-white/40 mb-6">Für Händler</p>
              <ul className="space-y-3">
                {[
                  "Sortiment anlegen oder per ERP importieren",
                  "Lieferpläne und Zeitfenster konfigurieren",
                  "Eingehende Bestellungen bestätigen",
                  "Lieferschein automatisch als PDF versenden",
                  "Reklamation bearbeiten und Nachlieferung anlegen",
                ].map((item) => (
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
          Jetzt registrieren <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <PublicFooter />
    </div>
  );
}

function FaqPage() {
  const faqs = [
    {
      q: "Wer kann GastroConnect nutzen?",
      a: "GastroConnect ist für Gastronomiebetriebe (Restaurants, Hotels, Cafés) und Lebensmittelhändler in Südtirol und der angrenzenden Region. Beide Seiten arbeiten auf derselben Plattform, in getrennten, auf die jeweilige Rolle zugeschnittenen Bereichen.",
    },
    {
      q: "Wie bekomme ich Zugang?",
      a: "Sie registrieren Ihr Unternehmen über das Formular auf dieser Seite. Nach der Prüfung durch unser Team erhalten Sie eine Bestätigung per E-Mail — in der Regel innerhalb eines Werktages.",
    },
    {
      q: "Kann ich Teammitglieder einladen?",
      a: "Ja. Als Administrator Ihres Unternehmens können Sie beliebig viele Mitarbeitende mit unterschiedlichen Rollen einladen (Manager, Einkäufer, Fahrer, Lager). Jede Person erhält eine eigene Einladungs-E-Mail.",
    },
    {
      q: "Funktioniert GastroConnect auf dem Smartphone?",
      a: "GastroConnect ist als Progressive Web App (PWA) optimiert — vollständig responsive, installierbar auf iOS und Android, und für wichtige Ansichten auch offline verfügbar.",
    },
    {
      q: "Wie werden Lieferscheine erstellt?",
      a: "Sobald ein Händler eine Bestellung bestätigt, wird automatisch ein A4-Lieferschein als PDF generiert. Dieser wird im Chat mit dem Betrieb geteilt und im Dokumentencenter beider Seiten abgelegt.",
    },
    {
      q: "Wie funktioniert der Preisvergleich?",
      a: "Produkte, die bei mehreren Händlern verfügbar sind, werden in einer Vergleichsansicht zusammengefasst. Sie sehen Preis, Einheit und Verfügbarkeit aller Anbieter nebeneinander — und können direkt aus dieser Ansicht bestellen.",
    },
    {
      q: "Welche Daten werden gespeichert?",
      a: "GastroConnect speichert ausschließlich Daten, die für den Betrieb der Plattform notwendig sind — Unternehmensprofil, Bestellhistorie, Dokumente und Kommunikation. Es werden keine Daten an Dritte weitergegeben und keine Werbung geschaltet.",
    },
    {
      q: "Was kostet GastroConnect?",
      a: "Kontaktieren Sie uns für die passende Lösung für Ihr Unternehmen. Wir bieten transparente Konditionen ohne versteckte Kosten.",
    },
  ];

  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">Fragen & Antworten</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          Gut zu wissen.<br /><A>Kurz erklärt.</A>
        </h1>
        <p className="mt-8 max-w-2xl text-base text-black/55 leading-relaxed md:text-lg">
          Die wichtigsten Antworten rund um GastroConnect, Zugang und Zusammenarbeit.
        </p>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-10 pb-24 md:px-8 md:pb-36">
        {faqs.map(({ q, a }) => (
          <article
            key={q}
            className="grid gap-4 border-b border-black/[0.08] py-8 md:grid-cols-[1fr_1.4fr] md:gap-16 md:py-10"
          >
            <h2 className="text-base font-semibold leading-snug">{q}</h2>
            <p className="text-base text-black/55 leading-relaxed">{a}</p>
          </article>
        ))}

        <div className="mt-16">
          <p className="text-base text-black/55 mb-6">Ihre Frage ist nicht dabei?</p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-black/85 transition-colors"
          >
            Kontakt aufnehmen <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

function ContactPage() {
  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">Kontakt</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          Sprechen wir über<br />Ihren <A>Alltag</A>.
        </h1>
        <p className="mt-8 max-w-2xl text-base text-black/55 leading-relaxed md:text-lg">
          Sie möchten GastroConnect kennenlernen oder mit Ihrem Unternehmen starten? Wir freuen uns über Ihre Nachricht.
        </p>
      </section>

      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className="border-t border-black/[0.08]" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
        <div className="grid gap-0">
          {[
            {
              label: "E-Mail",
              value: "hello@gastroconnect.app",
              desc: "Für alle Anfragen — wir antworten in der Regel innerhalb von 24 Stunden.",
              link: "mailto:hello@gastroconnect.app",
            },
            {
              label: "Für Betriebe",
              value: "Zugang anfragen",
              desc: "Erzählen Sie uns, welche Abläufe Sie vereinfachen möchten und wie groß Ihr Betrieb ist.",
              link: "/register",
            },
            {
              label: "Für Händler",
              value: "Sortiment zeigen",
              desc: "Bringen Sie Ihr Sortiment auf eine Plattform, die Ihre Kunden täglich nutzen.",
              link: "/register",
            },
          ].map(({ label, value, desc, link }) => (
            <article
              key={label}
              className="grid gap-4 border-b border-black/[0.08] py-10 md:grid-cols-[.5fr_1fr_1.2fr] md:gap-12"
            >
              <p className="text-xs font-semibold tracking-[.18em] uppercase text-black/35">{label}</p>
              <a
                href={link}
                className="text-xl font-semibold tracking-tight hover:opacity-60 transition-opacity"
              >
                {value}
              </a>
              <p className="text-sm text-black/55 leading-relaxed">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-black text-white">
        <div className="mx-auto max-w-5xl px-4 py-20 md:px-8 md:py-28">
          <p className="gc-kicker text-white/40 mb-6">Direkt starten</p>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
            Registrieren und<br />sofort <A>loslegen</A>.
          </h2>
          <p className="mt-6 max-w-md text-base text-white/55 leading-relaxed">
            Die Registrierung dauert wenige Minuten. Nach der Prüfung durch unser Team ist Ihr Zugang aktiv.
          </p>
          <Link
            href="/register"
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:bg-white/90 transition-colors"
          >
            Jetzt registrieren <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="pb-12 md:pb-16" />
      <PublicFooter />
    </div>
  );
}

function LegalPage({ type }: { type: "impressum" | "datenschutz" | "agb" }) {
  const pages = {
    impressum: {
      kicker: "Rechtliches",
      title: "Impressum",
      accent: "Impressum" as string,
      sections: [
        {
          title: "Angaben zum Unternehmen",
          text: "GastroConnect\nDigitale Plattform für die Lebensmittelversorgung und Gastronomie\n\nFür geschäftliche Anfragen erreichen Sie uns unter:\nhello@gastroconnect.app",
        },
        {
          title: "Haftungshinweis",
          text: "Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich.",
        },
        {
          title: "Urheberrecht",
          text: "Die auf dieser Website veröffentlichten Inhalte und Werke unterliegen dem Urheberrecht. Jede Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedarf der vorherigen schriftlichen Zustimmung.",
        },
      ],
    },
    datenschutz: {
      kicker: "Rechtliches",
      title: "Datenschutz",
      accent: "Datenschutz" as string,
      sections: [
        {
          title: "Grundsatz",
          text: "Der Schutz personenbezogener Daten ist ein zentraler Bestandteil von GastroConnect. Wir verarbeiten nur Daten, die für den Betrieb der Plattform, die Kommunikation und die Sicherheit erforderlich sind.",
        },
        {
          title: "Welche Daten wir verarbeiten",
          text: "Unternehmensprofil und Kontaktdaten, Bestellhistorie und Kommunikation auf der Plattform, technische Zugriffsdaten (IP-Adresse, Browser-Typ) sowie Dokumente, die Sie auf der Plattform hochladen oder generieren.",
        },
        {
          title: "Weitergabe an Dritte",
          text: "Personenbezogene Daten werden nicht an Dritte weitergegeben, nicht für Werbezwecke genutzt und nicht verkauft. Ausnahmen bestehen ausschließlich bei gesetzlicher Verpflichtung.",
        },
        {
          title: "Ihre Rechte",
          text: "Sie haben jederzeit das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung Ihrer Daten. Für entsprechende Anfragen wenden Sie sich an hello@gastroconnect.app.",
        },
        {
          title: "Cookies",
          text: "GastroConnect verwendet ausschließlich technisch notwendige Cookies für die Sitzungsverwaltung. Es werden keine Tracking- oder Werbe-Cookies eingesetzt.",
        },
      ],
    },
    agb: {
      kicker: "Rechtliches",
      title: "Allgemeine Geschäftsbedingungen",
      accent: "Bedingungen" as string,
      sections: [
        {
          title: "§ 1 Geltungsbereich",
          text: "Diese Bedingungen gelten für die Nutzung der GastroConnect-Plattform durch Unternehmen und ihre durch Einladung hinzugefügten Mitarbeitenden.",
        },
        {
          title: "§ 2 Zugang und Registrierung",
          text: "Der Zugang zur Plattform setzt eine erfolgreiche Registrierung und Prüfung durch GastroConnect voraus. Ein Rechtsanspruch auf Zulassung besteht nicht. Zugangsdaten sind vertraulich zu behandeln.",
        },
        {
          title: "§ 3 Nutzung der Plattform",
          text: "Die Plattform darf ausschließlich für legitime gewerbliche Zwecke im Bereich Gastronomie und Lebensmittelhandel genutzt werden. Missbräuchliche Nutzung, Scraping oder die Weitergabe von Zugangsdaten sind untersagt.",
        },
        {
          title: "§ 4 Inhalte und Daten",
          text: "Unternehmen sind für die Richtigkeit der von ihnen eingestellten Inhalte (Produkte, Preise, Dokumente) verantwortlich. GastroConnect übernimmt keine Haftung für die Vollständigkeit oder Richtigkeit dieser Inhalte.",
        },
        {
          title: "§ 5 Verfügbarkeit",
          text: "GastroConnect strebt eine hohe Verfügbarkeit der Plattform an, übernimmt jedoch keine Garantie für eine unterbrechungsfreie Nutzung. Wartungsarbeiten werden nach Möglichkeit im Voraus angekündigt.",
        },
        {
          title: "§ 6 Änderungen",
          text: "GastroConnect behält sich das Recht vor, diese Bedingungen mit angemessener Vorankündigung zu ändern. Die weitere Nutzung der Plattform nach einer Änderung gilt als Zustimmung.",
        },
      ],
    },
  };

  const page = pages[type];

  return (
    <div className="gc-public min-h-screen bg-white text-black">
      <PublicHeader />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <p className="gc-kicker">{page.kicker}</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[.98] tracking-tight md:text-8xl">
          {page.title === "Impressum" ? (
            <><A>Impressum</A>.</>
          ) : page.title === "Datenschutz" ? (
            <>Ihr <A>Datenschutz</A>.</>
          ) : (
            <>Unsere <A>Bedingungen</A>.</>
          )}
        </h1>
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
                <p key={i} className="text-base text-black/55 leading-relaxed whitespace-pre-line">
                  {para}
                </p>
              ))}
            </div>
          </article>
        ))}
      </section>

      <PublicFooter />
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────
export default function PublicInfo({ type }: { type: string }) {
  if (type === "features") return <FeaturesPage />;
  if (type === "how-it-works") return <HowItWorksPage />;
  if (type === "faq") return <FaqPage />;
  if (type === "contact") return <ContactPage />;
  if (type === "impressum") return <LegalPage type="impressum" />;
  if (type === "datenschutz") return <LegalPage type="datenschutz" />;
  if (type === "agb") return <LegalPage type="agb" />;
  return <FeaturesPage />;
}
