import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Search, Play, HelpCircle, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useTour } from "@/components/tour/TourProvider";
import { getHelpTopics, getQuickTour, getPageTutorials } from "@/lib/onboardingTour";

export default function Help() {
  const { currentRole } = useUser();
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { start, startPageIntro, resetPageIntros } = useTour();
  const [query, setQuery] = useState("");

  const topics = useMemo(() => getHelpTopics(currentRole, lang), [currentRole, lang]);
  const pageTutorials = useMemo(
    () => getPageTutorials(currentRole, isMobile ? "mobile" : "web", lang),
    [currentRole, isMobile, lang],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.steps.some((s) => s.toLowerCase().includes(q)),
    );
  }, [topics, query]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    filtered.forEach((t) => {
      const arr = m.get(t.category) || [];
      arr.push(t);
      m.set(t.category, arr);
    });
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <div className="flex flex-col flex-1 pb-24 md:pb-8" data-testid="page-help-center">
      <div className="mb-4 md:mb-6">
        <button
          onClick={() => setLocation(`/${currentRole}`)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
          data-testid="button-help-back"
        >
          <ChevronLeft className="h-4 w-4" />
          {lang === "it" ? "Indietro" : "Zurück"}
        </button>
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-help-title">
            {lang === "it" ? "Centro assistenza" : "Hilfe-Center"}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {lang === "it"
            ? "Esplorate tutte le funzioni in dettaglio o riavviate la guida rapida."
            : "Lernen Sie alle Funktionen im Detail kennen oder starten Sie die Kurz-Tour erneut."}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "it" ? "Cerca un argomento…" : "Thema suchen…"}
            className="pl-9"
            data-testid="input-help-search"
          />
        </div>
        <button
          onClick={() => start(getQuickTour(currentRole, lang), { markCompleteOnFinish: true })}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          data-testid="button-restart-quick-tour"
        >
          <Play className="h-4 w-4" />
          {lang === "it" ? "Riavvia la guida rapida" : "Kurz-Tour erneut starten"}
        </button>
      </div>

      <section className="mb-8" data-testid="section-page-tutorials">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
            {lang === "it" ? "Introduzioni delle pagine" : "Seiten-Einführungen"}
          </h2>
          <button
            onClick={async () => {
              await resetPageIntros();
              toast({
                title: lang === "it" ? "Introduzioni reimpostate" : "Einführungen zurückgesetzt",
                description: lang === "it"
                  ? "Le introduzioni verranno mostrate di nuovo alla prima apertura di ogni pagina."
                  : "Die Einführungen werden bei der nächsten Öffnung jeder Seite wieder angezeigt.",
              });
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            data-testid="button-reset-page-intros"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {lang === "it" ? "Reimposta tutte" : "Alle zurücksetzen"}
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          {lang === "it"
            ? "Ogni pagina mostra una breve introduzione alla prima visita. Riavviatela qui in qualsiasi momento."
            : "Jede Seite zeigt beim ersten Besuch eine kurze Einführung. Hier können Sie sie jederzeit erneut starten."}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {pageTutorials.map((tut) => (
            <button
              key={tut.id}
              onClick={() => startPageIntro(tut.id)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 transition-colors"
              data-testid={`button-replay-intro-${tut.id}`}
            >
              <Play className="h-3.5 w-3.5 shrink-0 text-primary" />
              {tut.label}
            </button>
          ))}
        </div>
      </section>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground" data-testid="help-empty">
          {lang === "it" ? "Nessun argomento trovato." : "Kein Thema gefunden."}
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([category, items]) => (
            <section key={category} data-testid={`help-category-${category}`}>
              <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">
                {category}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((topic) => (
                  <article
                    key={topic.id}
                    className="rounded-2xl bg-card border border-border p-4 md:p-5"
                    data-testid={`help-topic-${topic.id}`}
                  >
                    {topic.imageUrl && (
                      <img
                        src={topic.imageUrl}
                        alt=""
                        className="mb-3 rounded-lg w-full h-auto bg-muted"
                        loading="lazy"
                        data-testid={`img-help-topic-${topic.id}`}
                      />
                    )}
                    <h3 className="text-base font-semibold mb-1.5">{topic.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{topic.summary}</p>
                    <ol className="text-sm space-y-1.5 mb-4 list-decimal list-inside text-foreground/90">
                      {topic.steps.map((s, i) => (
                        <li key={i} className="leading-relaxed">
                          {s}
                        </li>
                      ))}
                    </ol>
                    {topic.tour && topic.tour.length > 0 && (
                      <button
                        onClick={() => start(topic.tour!)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                        data-testid={`button-show-on-page-${topic.id}`}
                      >
                        <Play className="h-3.5 w-3.5" />
                        {lang === "it" ? "Mostra sulla pagina" : "Auf der Seite zeigen"}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
