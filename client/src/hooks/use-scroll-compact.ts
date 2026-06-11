import { useEffect, useState } from "react";

/**
 * Tracks whether the main mobile content area is being scrolled down, so that
 * fixed mobile UI (bottom nav, floating CTAs) can shrink/hide in sync.
 *
 * Mobile-only (max-width: 767px). Reacts to the inner `[data-app-scroll]`
 * content scroller, ignoring modals/drawers/sheets. Returns `true` while the
 * user scrolls down past a small threshold, `false` near the top / when
 * scrolling up / after a short idle.
 */
export function useScrollCompact(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    let lastY = -1;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!(target instanceof HTMLElement) || !target.hasAttribute("data-app-scroll")) return;
      const y = target.scrollTop;
      if (lastY < 0) lastY = y;
      const delta = y - lastY;
      if (y < 24) {
        setCompact(false);
      } else if (delta > 4) {
        setCompact(true);
      } else if (delta < -4) {
        setCompact(false);
      }
      lastY = y;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setCompact(false), 220);
    };
    const attach = () => {
      window.addEventListener("scroll", onScroll, true);
    };
    const detach = () => {
      window.removeEventListener("scroll", onScroll, true);
      if (idleTimer) clearTimeout(idleTimer);
      setCompact(false);
    };
    const sync = () => {
      if (mq.matches) attach();
      else detach();
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      detach();
    };
  }, []);

  return compact;
}
