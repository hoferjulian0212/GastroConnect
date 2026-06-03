import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getQuickTour, getPageTutorials, getPageIntroForPath, type TourStep } from "@/lib/onboardingTour";

interface TourContextValue {
  isActive: boolean;
  start: (steps: TourStep[], opts?: { markCompleteOnFinish?: boolean; pageIntroId?: string }) => void;
  stop: () => void;
  startQuickTour: () => void;
  startPageIntro: (introId: string) => void;
  resetPageIntros: () => Promise<void>;
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
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [popoverH, setPopoverH] = useState(180);
  const [tick, setTick] = useState(0);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const markCompleteRef = useRef(false);
  const activePageIntroRef = useRef<string | null>(null);
  const autoTriggeredRef = useRef<Set<string>>(new Set());
  const lastUserIdRef = useRef<string | null>(null);

  const isActive = steps.length > 0;
  const step = isActive ? steps[index] : null;
  const view = isMobile ? "mobile" : "web";

  const stop = useCallback(() => {
    setSteps([]);
    setIndex(0);
    setRect(null);
  }, []);

  const finish = useCallback(async () => {
    const shouldMark = markCompleteRef.current && currentUser?.id;
    const pageIntroId = activePageIntroRef.current;
    activePageIntroRef.current = null;
    stop();
    if (!currentUser?.id) return;
    try {
      if (pageIntroId) {
        const res = await apiRequest("POST", `/api/users/${currentUser.id}/page-intros/seen`, { introId: pageIntroId });
        const updated = await res.json();
        setCurrentUser(updated);
        queryClient.invalidateQueries({ queryKey: [`/api/users?role=${currentRole}`] });
      } else if (shouldMark) {
        const res = await apiRequest("POST", `/api/users/${currentUser.id}/onboarding/complete`);
        const updated = await res.json();
        setCurrentUser(updated);
        queryClient.invalidateQueries({ queryKey: [`/api/users?role=${currentRole}`] });
      }
    } catch {
      // Ignore — non-blocking
    }
  }, [currentUser, currentRole, setCurrentUser, stop]);

  const skipAll = useCallback(async () => {
    activePageIntroRef.current = null;
    stop();
    if (!currentUser?.id) return;
    try {
      const res = await apiRequest("POST", `/api/users/${currentUser.id}/page-intros/skip-all`, { value: true });
      const updated = await res.json();
      setCurrentUser(updated);
      queryClient.invalidateQueries({ queryKey: [`/api/users?role=${currentRole}`] });
    } catch {
      // Ignore — non-blocking
    }
  }, [currentUser, currentRole, setCurrentUser, stop]);

  const resetPageIntros = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await apiRequest("POST", `/api/users/${currentUser.id}/page-intros/reset`);
      const updated = await res.json();
      setCurrentUser(updated);
      autoTriggeredRef.current = new Set();
      queryClient.invalidateQueries({ queryKey: [`/api/users?role=${currentRole}`] });
    } catch {
      // Ignore — non-blocking
    }
  }, [currentUser, currentRole, setCurrentUser]);

  const start = useCallback(
    (next: TourStep[], opts?: { markCompleteOnFinish?: boolean; pageIntroId?: string }) => {
      if (!next.length) return;
      markCompleteRef.current = opts?.markCompleteOnFinish === true;
      activePageIntroRef.current = opts?.pageIntroId ?? null;
      setSteps(next);
      setIndex(0);
    },
    [],
  );

  const startQuickTour = useCallback(() => {
    start(getQuickTour(currentRole, lang), { markCompleteOnFinish: true });
  }, [currentRole, lang, start]);

  const startPageIntro = useCallback(
    (introId: string) => {
      const tut = getPageTutorials(currentRole, view, lang).find((p) => p.id === introId);
      if (!tut) return;
      start(tut.steps, { pageIntroId: tut.id });
    },
    [currentRole, view, lang, start],
  );

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

  // Auto-start a per-page intro on first visit (per role + view), unless opted out.
  useEffect(() => {
    if (!currentUser) return;
    if (isActive) return;
    if (currentUser.skipAllPageIntros) return;
    const role = currentUser.role as "restaurant" | "supplier";
    const pathOnly = location.split("?")[0];
    // Skip detail/chat/help/auth pages
    if (/^\/(restaurant|supplier)\/(orders|complaints)\/[^/]+$/.test(pathOnly)) return;
    if (/^\/(restaurant|supplier)\/help$/.test(pathOnly)) return;
    if (pathOnly === "/" || pathOnly === "/login" || pathOnly === "/about" || pathOnly === "/help") return;
    const intro = getPageIntroForPath(pathOnly, role, view, lang);
    if (!intro) return;
    if ((currentUser.seenPageIntros || []).includes(intro.id)) return;
    if (autoTriggeredRef.current.has(intro.id)) return;
    autoTriggeredRef.current.add(intro.id);
    // Small delay to let the page render first
    let fired = false;
    const id = window.setTimeout(() => {
      fired = true;
      start(intro.steps, { pageIntroId: intro.id });
    }, 600);
    return () => {
      window.clearTimeout(id);
      // If we navigated away before the intro actually showed, allow it to
      // re-trigger on a genuine future visit instead of suppressing it.
      if (!fired) autoTriggeredRef.current.delete(intro.id);
    };
  }, [currentUser, location, view, lang, isActive, start]);

  // Clear the per-session auto-trigger cache when the active user changes
  // (e.g. account switcher) so one user's attempts never suppress another's.
  useEffect(() => {
    if (currentUser?.id && lastUserIdRef.current !== currentUser.id) {
      lastUserIdRef.current = currentUser.id;
      autoTriggeredRef.current = new Set();
    }
  }, [currentUser?.id]);

  // Re-evaluate web vs mobile steps if the viewport crosses the breakpoint mid-tour.
  useEffect(() => {
    const introId = activePageIntroRef.current;
    if (!introId || !currentUser) return;
    const role = currentUser.role as "restaurant" | "supplier";
    const tut = getPageTutorials(role, view, lang).find((p) => p.id === introId);
    if (!tut) return;
    setSteps(tut.steps);
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const next = () => {
    if (index < steps.length - 1) setIndex(index + 1);
    else void finish();
  };
  const prev = () => {
    if (index > 0) setIndex(index - 1);
  };

  const value: TourContextValue = { isActive, start, stop, startQuickTour, startPageIntro, resetPageIntros };
  const isPageIntro = activePageIntroRef.current !== null;

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
                {isPageIntro && (
                  <div className="mt-3 pt-3 border-t border-border text-center">
                    <button
                      onClick={() => void skipAll()}
                      className="text-xs text-muted-foreground hover:text-foreground"
                      data-testid="button-tour-skip-all"
                    >
                      {lang === "it" ? "Non mostrare più le introduzioni" : "Einführungen nicht mehr anzeigen"}
                    </button>
                  </div>
                )}
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
