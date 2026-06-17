import { Link } from "wouter";
import { ArrowLeft, Utensils, Store, MessageSquare, BarChart3, Shield, FileText, ArrowRight, Zap, Users } from "lucide-react";

const features = [
  {
    icon: Utensils,
    title: "Für Betriebe",
    desc: "Alle Lieferanten in einem Katalog — suchen, vergleichen, bestellen. Preisvergleich und Ausgabenübersicht inklusive.",
    accent: "emerald",
  },
  {
    icon: Store,
    title: "Für Händler",
    desc: "Produkte verwalten, Bestellungen bearbeiten, Kunden pflegen — alles in einer modernen Oberfläche.",
    accent: "blue",
  },
  {
    icon: MessageSquare,
    title: "Chat per Auftrag",
    desc: "Jede Bestellung hat ihren eigenen Chat-Thread — Dokumente, Rückmeldungen und Nachrichten an einem Ort.",
    accent: "violet",
  },
  {
    icon: FileText,
    title: "Automatische Dokumente",
    desc: "Lieferscheine werden als PDF erzeugt, im Chat geteilt und im Dokumentencenter abgelegt.",
    accent: "amber",
  },
  {
    icon: Shield,
    title: "Reklamationen",
    desc: "Professionelles Handling von Beschwerden, Nachlieferungen und Qualitätsproblemen — direkt aus dem Chat.",
    accent: "rose",
  },
  {
    icon: BarChart3,
    title: "Live-Dashboard",
    desc: "Umsatz, Top-Produkte, offene Bestellungen und Kosten pro Gast — immer aktuell im Blick.",
    accent: "indigo",
  },
];

const accentMap: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  blue:    "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  violet:  "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  amber:   "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  rose:    "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  indigo:  "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
};

const stats = [
  { value: "2", unit: "Rollen", label: "Betriebe & Händler" },
  { value: "1", unit: "Plattform", label: "Alles verbunden" },
  { value: "100%", unit: "Invite-only", label: "Kontrollierter Zugang" },
  { value: "∞", unit: "Effizienz", label: "Weniger Aufwand" },
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
      <div className="bg-[#161921] rounded-b-3xl px-4 md:px-8 pb-16 pt-6">
        <div className="max-w-5xl mx-auto">
          {/* Back link */}
          <Link href="/">
            <button
              className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/90 transition-colors mb-14"
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück zur Startseite
            </button>
          </Link>

          {/* Eyebrow */}
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-4">
            Über uns
          </p>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-white leading-tight max-w-3xl">
            Die Plattform, die<br />
            <span className="text-indigo-400">Gastronomie verbindet.</span>
          </h1>

          <p className="mt-6 text-base md:text-lg text-white/60 max-w-2xl leading-relaxed">
            GastroConnect ist eine B2B-Software für die Gastronomiebranche — gebaut, um die tägliche Kommunikation zwischen Betrieben und ihren Lieferanten zu vereinfachen. Kein Papierchaos, keine WhatsApp-Gruppen, kein Nachfragen per Telefon.
          </p>

          {/* CTA */}
          <div className="mt-10">
            <Link href="/login">
              <button
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2.5 rounded-full transition-colors"
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl md:text-4xl font-semibold tracking-tight">{s.value}</p>
              <p className="text-sm font-medium text-foreground/70 mt-0.5">{s.unit}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
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
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accentMap[f.accent]}`}>
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
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <h3 className="font-semibold text-base">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── FOOTER CTA ───────────────────────────────────────── */}
      <div className="bg-[#161921] rounded-t-3xl px-4 md:px-8 py-16">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight text-white mb-4">
            Bereit loszulegen?
          </h2>
          <p className="text-white/55 text-base mb-8 max-w-md mx-auto">
            GastroConnect ist invite-only. Kontaktieren Sie uns — wir richten Ihren Zugang ein.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login">
              <button
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-6 py-3 rounded-full transition-colors w-full sm:w-auto"
                data-testid="button-footer-login"
              >
                Anmelden
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <Link href="/">
              <button
                className="inline-flex items-center justify-center gap-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 text-sm font-medium px-6 py-3 rounded-full transition-colors w-full sm:w-auto"
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
