import { useCallback, useEffect, useRef, useState } from "react";

const FALLBACK_HEIGHT_PX = 112;
const BREATHING_GAP_PX = 12;

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
