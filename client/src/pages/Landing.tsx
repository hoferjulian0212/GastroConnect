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
} from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();
  const { switchRole } = useUser();

  function handleStart(role: "restaurant" | "supplier") {
    switchRole(role);
    setLocation(`/${role}`);
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleStart("supplier")}
              data-testid="button-nav-supplier"
            >
              Lieferant
            </Button>
            <Button
              size="sm"
              onClick={() => handleStart("restaurant")}
              data-testid="button-nav-restaurant"
            >
              Restaurant
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
              Die Plattform für die Gastronomie
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl" data-testid="text-hero-headline">
              Bestellungen.{" "}
              <span className="text-primary">Einfach.</span>{" "}
              Digital.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl leading-relaxed max-w-2xl mx-auto">
              GastroConnect verbindet Restaurants und Lieferanten auf einer Plattform.
              Bestellen, kommunizieren und verwalten — alles an einem Ort.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="w-full sm:w-auto gap-2 text-base"
                onClick={() => handleStart("supplier")}
                data-testid="button-hero-supplier"
              >
                <Store className="h-4 w-4" />
                Als Lieferant starten
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
                Als Restaurant starten
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
              Warum Gastronomie neu gedacht werden muss
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              Telefonate, Faxbestellungen und unübersichtliche Excel-Listen kosten
              Restaurants und Lieferanten jeden Tag wertvolle Zeit und Nerven.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Zeitverschwendung",
                desc: "Manuelle Bestellprozesse per Telefon, Fax oder E-Mail sind fehleranfällig und kosten Stunden pro Woche.",
                icon: Clock,
              },
              {
                title: "Fehlende Übersicht",
                desc: "Ohne zentrale Plattform gehen Bestellungen, Preise und Absprachen schnell verloren.",
                icon: BarChart3,
              },
              {
                title: "Kommunikationsprobleme",
                desc: "Rückfragen zu Bestellungen und Reklamationen laufen über verschiedene Kanäle — chaotisch und langsam.",
                icon: MessageSquare,
              },
            ].map((item, idx) => (
              <Card key={item.title} className="border-border/50 hover-elevate overflow-visible" data-testid={`card-problem-${idx}`}>
                <CardContent className="pt-6 pb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive mb-4">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-base mb-2" data-testid={`text-problem-title-${idx}`}>{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl" data-testid="text-solution-headline">
              Eine Plattform. Alles im Griff.
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              GastroConnect digitalisiert den gesamten Bestellprozess zwischen
              Restaurants und Lieferanten — von der Produktsuche bis zur Lieferung.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: ShoppingCart,
                title: "Digitale Bestellungen",
                desc: "Produkte durchsuchen, in den Warenkorb legen und direkt beim Lieferanten bestellen.",
              },
              {
                icon: MessageSquare,
                title: "Integrierter Chat",
                desc: "Direkte Kommunikation zwischen Restaurant und Lieferant — inklusive Dateien und Bilder.",
              },
              {
                icon: Truck,
                title: "Liefertage-Planung",
                desc: "Lieferanten legen Liefertage pro Restaurant fest. Restaurants wählen passende Termine.",
              },
              {
                icon: BarChart3,
                title: "Bestell-Übersicht",
                desc: "Alle Bestellungen mit Status-Tracking, Änderungsanfragen und visueller Zeitleiste.",
              },
              {
                icon: FileText,
                title: "Dokumente & Lieferscheine",
                desc: "Automatische Lieferschein-Erstellung als PDF mit direktem Versand im Chat.",
              },
              {
                icon: Shield,
                title: "Reklamations-Management",
                desc: "Beschwerden strukturiert erfassen, bearbeiten und den Status transparent nachverfolgen.",
              },
            ].map((feature, idx) => (
              <Card key={feature.title} className="hover-elevate transition-all duration-200 overflow-visible" data-testid={`card-feature-${idx}`}>
                <CardContent className="pt-6 pb-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-base mb-2" data-testid={`text-feature-title-${idx}`}>{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-4">
                <Store className="h-3 w-3" />
                Für Lieferanten
              </div>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl mb-6" data-testid="text-supplier-benefits">
                Mehr Kunden. Weniger Aufwand.
              </h2>
              <ul className="space-y-4">
                {[
                  "Produktkatalog digital verwalten und aktuell halten",
                  "Bestellungen zentral empfangen und bearbeiten",
                  "Aktionen und Rabatte gezielt für Kunden erstellen",
                  "Liefertage pro Restaurant individuell festlegen",
                  "Lieferscheine automatisch generieren und versenden",
                  "Direkte Kommunikation ohne Umwege",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3">
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
                Als Lieferant starten
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-4">
                <Utensils className="h-3 w-3" />
                Für Restaurants
              </div>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl mb-6" data-testid="text-restaurant-benefits">
                Schneller bestellen. Besser planen.
              </h2>
              <ul className="space-y-4">
                {[
                  "Alle Lieferanten und Produkte in einem Katalog",
                  "Warenkorb mit Bestellungen bei mehreren Lieferanten",
                  "Wunsch-Liefertermine bei der Bestellung angeben",
                  "Bestellungen nachträglich ändern oder anpassen",
                  "Reklamationen direkt an den Lieferanten melden",
                  "Volle Übersicht über alle laufenden Bestellungen",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-3">
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
                Als Restaurant starten
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
              So funktioniert es
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
              In wenigen Schritten zur digitalen Bestellabwicklung.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-4">
            {[
              {
                step: "1",
                title: "Rolle wählen",
                desc: "Starten Sie als Restaurant oder Lieferant — ohne Registrierung.",
              },
              {
                step: "2",
                title: "Produkte entdecken",
                desc: "Restaurants durchsuchen den Katalog und finden passende Lieferanten.",
              },
              {
                step: "3",
                title: "Bestellen & Kommunizieren",
                desc: "Bestellungen aufgeben, Liefertermine wählen und direkt chatten.",
              },
              {
                step: "4",
                title: "Liefern & Verwalten",
                desc: "Lieferanten bearbeiten Bestellungen, erstellen Dokumente und liefern.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center" data-testid={`card-step-${item.step}`}>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-base mb-2" data-testid={`text-step-title-${item.step}`}>{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-primary/5 border-t border-border/50">
        <div className="mx-auto max-w-6xl px-4 md:px-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl mb-4" data-testid="text-cta-headline">
            Bereit, Ihren Bestellprozess zu digitalisieren?
          </h2>
          <p className="text-muted-foreground text-base md:text-lg mb-8 max-w-xl mx-auto">
            Starten Sie jetzt und erleben Sie, wie einfach Gastronomie-Bestellungen sein können.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="w-full sm:w-auto gap-2 text-base"
              onClick={() => handleStart("supplier")}
              data-testid="button-cta-supplier"
            >
              <Store className="h-4 w-4" />
              Als Lieferant starten
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto gap-2 text-base"
              onClick={() => handleStart("restaurant")}
              data-testid="button-cta-restaurant"
            >
              <Utensils className="h-4 w-4" />
              Als Restaurant starten
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
              Die digitale Plattform für Gastronomie-Bestellungen.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
