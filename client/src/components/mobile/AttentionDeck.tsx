import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export type AttentionAccent = "amber" | "rose" | "emerald" | "indigo" | "sky" | "violet" | "neutral";

export interface AttentionCard {
  id: string;
  icon: ReactNode;
  accent: AttentionAccent;
  eyebrow: string;
  title: string;
  subtitle?: string;
  cta?: string;
  onClick: () => void;
  testId?: string;
}

const accentBg: Record<AttentionAccent, string> = {
  amber: "bg-amber-500/10 border-amber-500/20",
  rose: "bg-rose-500/10 border-rose-500/20",
  emerald: "bg-emerald-500/10 border-emerald-500/20",
  indigo: "bg-indigo-500/10 border-indigo-500/20",
  sky: "bg-sky-500/10 border-sky-500/20",
  violet: "bg-violet-500/10 border-violet-500/20",
  neutral: "bg-muted/40 border-border",
};
const accentIcon: Record<AttentionAccent, string> = {
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  neutral: "bg-muted text-foreground",
};

export function AttentionDeck({ cards, testId }: { cards: AttentionCard[]; testId?: string }) {
  if (cards.length === 0) return null;
  return (
    <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide" data-testid={testId}>
      <div className="flex items-stretch gap-2.5 pr-4 snap-x snap-mandatory">
        {cards.map((c) => (
          <button
            key={c.id}
            onClick={c.onClick}
            data-testid={c.testId}
            className={`shrink-0 snap-start w-[230px] min-h-[120px] text-left rounded-2xl border ${accentBg[c.accent]} p-3.5 active:scale-[0.98] transition-transform flex flex-col gap-2`}
          >
            <div className="flex items-center gap-2">
              <div className={`flex items-center justify-center h-8 w-8 rounded-xl ${accentIcon[c.accent]}`}>{c.icon}</div>
              <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">{c.eyebrow}</span>
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-foreground leading-tight line-clamp-2">{c.title}</div>
              {c.subtitle && <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{c.subtitle}</div>}
            </div>
            {c.cta && (
              <div className="inline-flex items-center gap-1 text-[12px] font-semibold text-foreground">
                {c.cta} <ChevronRight className="h-3.5 w-3.5" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
