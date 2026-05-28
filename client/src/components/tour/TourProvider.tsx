import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getQuickTour, type TourStep } from "@/lib/onboardingTour";

interface TourContextValue {
  isActive: boolean;
  start: (steps: TourStep[], opts?: { markCompleteOnFinish?: boolean }) => void;
  stop: () => void;
  startQuickTour: () => void;
}

const TourContext = createContext<TourContextValue | undefined>(undefined);

const POPOVER_W = 320;
const POPOVER_OFFSET = 12;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getRectFromTestId(testId?: string): Rect | null {
  if (!testId || typeof document === "undefined") return null;
  // Prefer a visible element (desktop nav). Skip hidden ones (mobile/desktop alternates).
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`));
  const visible = els.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!visible) return null;
  const r = visible.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function clampPopover(top: number, left: number, vw: number, vh: number, h: number) {
  const padding = 12;
  const clampedLeft = Math.max(padding, Math.min(left, vw - POPOVER_W - padding));
  const clampedTop = Math.max(padding, Math.min(top, vh - h - padding));
  return { top: clampedTop, left: clampedLeft };
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { currentUser, currentRole, setCurrentUser } = useUser();
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [popoverH, setPopoverH] = useState(180);
  const [tick, setTick] = useState(0);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const markCompleteRef = useRef(false);
  const autoStartedForRef = useRef<string | null>(null);

  const isActive = steps.length > 0;
  const step = isActive ? steps[index] : null;

  const stop = useCallback(() => {
    setSteps([]);
    setIndex(0);
    setRect(null);
  }, []);

  const finish = useCallback(async () => {
    const shouldMark = markCompleteRef.current && currentUser?.id;
    stop();
    if (shouldMark && currentUser) {
      try {
        const res = await apiRequest("POST", `/api/users/${currentUser.id}/onboarding/complete`);
        const updated = await res.json();
        setCurrentUser(updated);
        queryClient.invalidateQueries({ queryKey: [`/api/users?role=${currentRole}`] });
      } catch {
        // Ignore — non-blocking
      }
    }
  }, [currentUser, currentRole, setCurrentUser, stop]);

  const start = useCallback(
    (next: TourStep[], opts?: { markCompleteOnFinish?: boolean }) => {
      if (!next.length) return;
      markCompleteRef.current = opts?.markCompleteOnFinish === true;
      setSteps(next);
      setIndex(0);
    },
    [],
  );

  const startQuickTour = useCallback(() => {
    start(getQuickTour(currentRole, lang), { markCompleteOnFinish: true });
  }, [currentRole, lang, start]);

  // Navigate to step.page if needed when step changes.
  useEffect(() => {
    if (!step) return;
    if (step.page) {
      setLocation(step.page);
    }
  }, [step, setLocation]);

  // Position recompute loop (handles dropdowns, async renders).
  useEffect(() => {
    if (!step) return;
    setRect(getRectFromTestId(step.targetTestId));
    const handler = () => {
      setRect(getRectFromTestId(step.targetTestId));
      setTick((t) => t + 1);
    };
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    // Re-resolve after page navigation paints
    const intervals: number[] = [];
    [50, 150, 300, 600].forEach((d) => {
      intervals.push(window.setTimeout(handler, d));
    });
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
      intervals.forEach((id) => window.clearTimeout(id));
    };
  }, [step?.id, step?.targetTestId]);

  // Measure popover height once rendered so clamping is correct.
  useEffect(() => {
    if (popoverRef.current) {
      const h = popoverRef.current.getBoundingClientRect().height;
      if (h && Math.abs(h - popoverH) > 4) setPopoverH(h);
    }
  }, [index, tick, popoverH]);

  // Auto-start for first-time users.
  useEffect(() => {
    if (!currentUser) return;
    if (autoStartedForRef.current === currentUser.id) return;
    if (currentUser.onboardingCompletedAt) {
      autoStartedForRef.current = currentUser.id;
      return;
    }
    // Don't auto-start on detail pages or chat
    if (typeof window !== "undefined") {
      const p = window.location.pathname;
      if (/^\/(restaurant|supplier)\/(orders|complaints)\/[^/]+$/.test(p)) return;
      if (/^\/(restaurant|supplier)\/help$/.test(p)) return;
      if (p === "/" || p === "/login" || p === "/about" || p === "/help") return;
    }
    autoStartedForRef.current = currentUser.id;
    // Small delay to let the page render first
    const id = window.setTimeout(() => {
      start(getQuickTour(currentUser.role as "restaurant" | "supplier", lang), { markCompleteOnFinish: true });
    }, 600);
    return () => window.clearTimeout(id);
  }, [currentUser, lang, start]);

  const next = () => {
    if (index < steps.length - 1) setIndex(index + 1);
    else void finish();
  };
  const prev = () => {
    if (index > 0) setIndex(index - 1);
  };

  const value: TourContextValue = { isActive, start, stop, startQuickTour };

  // Compute popover position
  let popoverPos: { top: number; left: number } | null = null;
  if (step) {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const vh = typeof window !== "undefined" ? window.innerHeight : 768;
    if (step.placement === "center" || !rect) {
      popoverPos = clampPopover((vh - popoverH) / 2, (vw - POPOVER_W) / 2, vw, vh, popoverH);
    } else {
      const placement = step.placement === "auto" || !step.placement ? "bottom" : step.placement;
      let top = 0;
      let left = 0;
      if (placement === "bottom") {
        top = rect.top + rect.height + POPOVER_OFFSET;
        left = rect.left + rect.width / 2 - POPOVER_W / 2;
      } else if (placement === "top") {
        top = rect.top - popoverH - POPOVER_OFFSET;
        left = rect.left + rect.width / 2 - POPOVER_W / 2;
      } else if (placement === "left") {
        top = rect.top + rect.height / 2 - popoverH / 2;
        left = rect.left - POPOVER_W - POPOVER_OFFSET;
      } else if (placement === "right") {
        top = rect.top + rect.height / 2 - popoverH / 2;
        left = rect.left + rect.width + POPOVER_OFFSET;
      }
      // If popover would overflow bottom, flip to top
      if (top + popoverH + 12 > vh && placement === "bottom") {
        top = rect.top - popoverH - POPOVER_OFFSET;
      }
      popoverPos = clampPopover(top, left, vw, vh, popoverH);
    }
  }

  // Highlight box
  const highlight = step && rect && step.placement !== "center"
    ? {
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
      }
    : null;

  return (
    <TourContext.Provider value={value}>
      {children}
      {isActive && step && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[10000]" data-testid="onboarding-tour">
            {/* Overlay with cut-out */}
            <div
              className="absolute inset-0 bg-black/55"
              style={
                highlight
                  ? {
                      clipPath: `polygon(
                        0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                        ${highlight.left}px ${highlight.top}px,
                        ${highlight.left}px ${highlight.top + highlight.height}px,
                        ${highlight.left + highlight.width}px ${highlight.top + highlight.height}px,
                        ${highlight.left + highlight.width}px ${highlight.top}px,
                        ${highlight.left}px ${highlight.top}px
                      )`,
                    }
                  : undefined
              }
              onClick={() => void finish()}
            />
            {highlight && (
              <div
                className="absolute pointer-events-none rounded-xl ring-2 ring-primary shadow-[0_0_0_4px_rgba(255,255,255,0.25)]"
                style={{
                  top: highlight.top,
                  left: highlight.left,
                  width: highlight.width,
                  height: highlight.height,
                }}
              />
            )}
            {popoverPos && (
              <div
                ref={popoverRef}
                className="absolute bg-popover text-popover-foreground rounded-2xl shadow-2xl border border-border p-5"
                style={{
                  top: popoverPos.top,
                  left: popoverPos.left,
                  width: POPOVER_W,
                  maxWidth: "calc(100vw - 24px)",
                }}
                data-testid="onboarding-tour-popover"
              >
                <button
                  onClick={() => void finish()}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-full hover:bg-muted text-muted-foreground"
                  data-testid="button-tour-close"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">
                  {index + 1} / {steps.length}
                </div>
                <h3 className="text-base font-semibold mb-2 pr-6" data-testid="text-tour-title">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4" data-testid="text-tour-body">
                  {step.body}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => void finish()}
                    className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5"
                    data-testid="button-tour-skip"
                  >
                    {lang === "it" ? "Salta" : "Überspringen"}
                  </button>
                  <div className="flex items-center gap-1.5">
                    {index > 0 && (
                      <button
                        onClick={prev}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted"
                        data-testid="button-tour-prev"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        {lang === "it" ? "Indietro" : "Zurück"}
                      </button>
                    )}
                    <button
                      onClick={next}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90"
                      data-testid="button-tour-next"
                    >
                      {index < steps.length - 1
                        ? (lang === "it" ? "Avanti" : "Weiter")
                        : (lang === "it" ? "Fatto" : "Fertig")}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}
