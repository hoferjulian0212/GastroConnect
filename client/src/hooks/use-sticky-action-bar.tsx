import { useCallback, useEffect, useRef, useState } from "react";

const FALLBACK_HEIGHT_PX = 112;
const BREATHING_GAP_PX = 12;
const KEYBOARD_DETECT_THRESHOLD_PX = 120;

export function useStickyActionBarHeight() {
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const barRef = useCallback((el: HTMLDivElement | null) => {
    setBarEl(el);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const setVar = (px: number) => {
      const total = Math.max(px + BREATHING_GAP_PX, FALLBACK_HEIGHT_PX);
      container.style.setProperty("--mobile-action-bar-h", `${total}px`);
    };

    if (!barEl) {
      container.style.setProperty("--mobile-action-bar-h", `${FALLBACK_HEIGHT_PX}px`);
      return;
    }

    setVar(barEl.offsetHeight);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setVar((entry.target as HTMLElement).offsetHeight);
      }
    });
    ro.observe(barEl);
    return () => ro.disconnect();
  }, [barEl]);

  return { containerRef, barRef };
}

/**
 * Tracks the on-screen keyboard inset on mobile by watching `visualViewport`.
 * Sets `--mobile-keyboard-inset` (px) on `document.documentElement` so sticky
 * elements can lift above the keyboard with e.g.
 * `bottom: max(var(--mobile-cta-offset), calc(var(--mobile-keyboard-inset) + 8px))`.
 */
export function useMobileKeyboardInset() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    if (!vv) {
      root.style.setProperty("--mobile-keyboard-inset", "0px");
      return;
    }

    const update = () => {
      const layoutH = window.innerHeight;
      const visibleBottom = vv.height + vv.offsetTop;
      const inset = Math.max(0, layoutH - visibleBottom);
      const effective = inset > KEYBOARD_DETECT_THRESHOLD_PX ? inset : 0;
      root.style.setProperty("--mobile-keyboard-inset", `${effective}px`);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      root.style.setProperty("--mobile-keyboard-inset", "0px");
    };
  }, []);
}
