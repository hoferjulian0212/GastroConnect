import { Link } from "wouter";
import { ArrowLeft, Utensils, Store, MessageSquare, BarChart3, Shield, FileText, ArrowRight, Zap, Users } from "lucide-react";

const features = [
  {
    icon: Utensils,
    title: "Für Betriebe",
    desc: "Alle Lieferanten in einem Katalog — suchen, vergleichen, bestellen. Preisvergleich und Ausgabenübersicht inklusive.",
  },
  {
    icon: Store,
    title: "Für Händler",
    desc: "Produkte verwalten, Bestellungen bearbeiten, Kunden pflegen — alles in einer modernen Oberfläche.",
  },
  {
    icon: MessageSquare,
    title: "Chat per Auftrag",
    desc: "Jede Bestellung hat ihren eigenen Chat-Thread — Dokumente, Rückmeldungen und Nachrichten an einem Ort.",
  },
  {
    icon: FileText,
    title: "Automatische Dokumente",
    desc: "Lieferscheine werden als PDF erzeugt, im Chat geteilt und im Dokumentencenter abgelegt.",
  },
  {
    icon: Shield,
    title: "Reklamationen",
    desc: "Professionelles Handling von Beschwerden, Nachlieferungen und Qualitätsproblemen — direkt aus dem Chat.",
  },
  {
    icon: BarChart3,
    title: "Live-Dashboard",
    desc: "Umsatz, Top-Produkte, offene Bestellungen und Kosten pro Gast — immer aktuell im Blick.",
  },
];

const stats = [
  {
    value: "3",
    title: "Wachstumssäulen",
    desc: "Gastronomiebetriebe, Lieferanten und Produzenten – erst wenn alle drei Gruppen wachsen, entsteht der maximale Netzwerkeffekt.",
  },
  {
    value: "0",
    title: "Versteckte Kosten",
    desc: "Keine Provisionen, keine bezahlten Rankings, keine Werbeeinnahmen – vollständige Transparenz in der Preisgestaltung.",
  },
  {
    value: "1",
    title: "Gemeinsame Plattform",
    desc: "Alle Beteiligten arbeiten erstmals auf einer gemeinsamen Infrastruktur – kein System kann diesen Netzwerkeffekt so einfach kopieren.",
  },
];

const values = [
  {
    icon: Zap,
    title: "Einfachheit zuerst",
    desc: "Keine komplizierten ERP-Integrationen, kein langer Onboarding-Prozess. Einladung erhalten, Passwort setzen, loslegen.",
  },
  {
    icon: Users,
    title: "Echte Beziehungen",
    desc: "GastroConnect ersetzt nicht das Gespräch — es macht es besser. Jede Bestellung, jede Frage, jede Reklamation hat einen menschlichen Kontext.",
  },
  {
    icon: Shield,
    title: "Vertrauen durch Kontrolle",
    desc: "Invite-only bedeutet: Nur echte Partner. Kein Spam, keine Stranger, keine öffentliche Anmeldung.",
  },
];

export default function About() {
  return (
    <div className="min-h-screen bg-background">

      {/* ── HERO ─────────────────────────────────────────────── */}
      <div className="px-4 md:px-8 pb-16 pt-6">
        <div className="max-w-5xl mx-auto">
          {/* Back link */}
          <Link href="/">
            <button
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-14"
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück zur Startseite
            </button>
          </Link>

          {/* Eyebrow */}
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-4">
            Über uns
          </p>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-foreground leading-tight max-w-3xl">
            Die Plattform, die<br />
            <span className="text-muted-foreground">Gastronomie verbindet.</span>
          </h1>

          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed">
            GastroConnect ist die zentrale Informations- und Kollaborationsplattform für die Lebensmittelversorgung der Südtiroler Gastronomie. Die Plattform verbindet Restaurants, Hotels, Lieferanten, Produzenten und Vertreter auf einer gemeinsamen digitalen Infrastruktur – nicht um bestehende Unternehmen zu ersetzen, sondern um sie sinnvoll miteinander zu verbinden. GastroConnect digitalisiert den Informationsfluss zwischen allen Beteiligten und schafft dadurch weniger Verwaltungsaufwand, mehr Transparenz, bessere Zusammenarbeit, stärkere Regionalität, geringere Lebensmittelverschwendung und höhere Wirtschaftlichkeit.
          </p>

          {/* CTA */}
          <div className="mt-10">
            <Link href="/login">
              <button
                className="inline-flex items-center gap-2 bg-foreground hover:bg-foreground/90 text-background text-sm font-medium px-5 py-2.5 rounded-full transition-colors"
                data-testid="button-request-access"
              >
                Zugang anfragen
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── STATS BAND ───────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
          {stats.map((s) => (
            <div key={s.title} className="text-center">
              <p className="text-4xl md:text-5xl font-semibold tracking-tight">{s.value}</p>
              <h3 className="text-base md:text-lg font-semibold text-foreground mt-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="border-t border-border" />
      </div>

      {/* ── FEATURES ─────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Was GastroConnect kann</p>
        <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mb-12 max-w-xl">
          Alles, was der Alltag in der Gastronomie braucht.
        </h2>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-2xl border border-border bg-muted/30 p-6 flex flex-col gap-4 hover:bg-muted/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-foreground text-background">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-1.5">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="border-t border-border" />
      </div>

      {/* ── VALUES ───────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Unsere Überzeugung</p>
        <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mb-12 max-w-xl">
          Gebaut mit einer klaren Haltung.
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
          {values.map((v) => {
            const Icon = v.icon;
            return (
              <div key={v.title} className="flex flex-col gap-3">
                <div className="h-9 w-9 rounded-lg bg-foreground text-background flex items-center justify-center">
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <h3 className="font-semibold text-base">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="border-t border-border" />
      </div>

      {/* ── TRUST & PRODUCT ──────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-20">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Unser Versprechen</p>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-5">
              Vertrauen als Geschäftsmodell
            </h2>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              Das wichtigste Kapital von GastroConnect ist Vertrauen. Hotels müssen darauf vertrauen können, dass Produkte objektiv dargestellt werden. Lieferanten müssen darauf vertrauen können, dass keine Wettbewerber bevorzugt werden. Produzenten müssen darauf vertrauen können, dass Qualität sichtbar wird. Dieses Vertrauen ist langfristig wertvoller als kurzfristige Werbeeinnahmen.
            </p>
            <p className="mt-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              GastroConnect verkauft keine Werbung, keine bezahlten Rankings, keine gekauften Suchergebnisse, keine Weitergabe von Kundendaten und keine versteckten Provisionen.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Unser Ansatz</p>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mb-5">
              Das Produkt
            </h2>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              GastroConnect ist keine klassische Bestellsoftware – es ist eine Informations- und Kollaborationsplattform. Bestellungen sind lediglich ein Bestandteil der Infrastruktur. Jede Funktion verfolgt denselben Zweck: mehr Transparenz für bessere Entscheidungen. Neue Funktionen werden nicht entwickelt, weil sie technisch möglich sind, sondern weil sie einen messbaren Mehrwert schaffen.
            </p>
            <p className="mt-4 text-sm md:text-base text-muted-foreground leading-relaxed">
              Jede neue Funktion muss mindestens einen dieser Punkte erfüllen: Zeit sparen, Transparenz erhöhen, Zusammenarbeit verbessern, Regionalität stärken, Lebensmittelverschwendung reduzieren oder Entscheidungen verbessern.
            </p>
          </div>
        </div>
      </div>

      {/* ── FOOTER CTA ───────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 pb-20">
        <div className="rounded-3xl border border-border bg-muted/30 px-6 md:px-8 py-16 text-center">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-foreground mb-4">
            Bereit loszulegen?
          </h2>
          <p className="text-muted-foreground text-base mb-8 max-w-md mx-auto">
            GastroConnect ist invite-only. Kontaktieren Sie uns — wir richten Ihren Zugang ein.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login">
              <button
                className="inline-flex items-center justify-center gap-2 bg-foreground hover:bg-foreground/90 text-background text-sm font-medium px-6 py-3 rounded-full transition-colors w-full sm:w-auto"
                data-testid="button-footer-login"
              >
                Anmelden
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <Link href="/">
              <button
                className="inline-flex items-center justify-center gap-2 border border-border text-foreground hover:bg-muted text-sm font-medium px-6 py-3 rounded-full transition-colors w-full sm:w-auto"
                data-testid="button-footer-back"
              >
                Zur Startseite
              </button>
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
