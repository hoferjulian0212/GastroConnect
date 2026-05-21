import { useEffect } from "react";

export function useLandingSmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktopMq = window.matchMedia("(min-width: 768px)");

    let lenis: any = null;
    let rafId = 0;
    let cancelled = false;
    let initInFlight = false;

    const teardown = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (lenis) {
        try {
          lenis.destroy();
        } catch {}
        lenis = null;
      }
    };

    const init = async () => {
      if (lenis || initInFlight) return;
      if (reducedMq.matches || !desktopMq.matches) return;
      initInFlight = true;
      try {
        const mod = await import("lenis");
        if (cancelled || reducedMq.matches || !desktopMq.matches) return;
        const Lenis = (mod as any).default ?? (mod as any).Lenis;
        lenis = new Lenis({
          lerp: 0.1,
          smoothWheel: true,
          wheelMultiplier: 1,
          touchMultiplier: 1.5,
        });
        const raf = (time: number) => {
          if (cancelled || !lenis) return;
          lenis.raf(time);
          rafId = requestAnimationFrame(raf);
        };
        rafId = requestAnimationFrame(raf);
      } catch {
        // Silent: smooth-scroll is a non-essential enhancement.
      } finally {
        initInFlight = false;
      }
    };

    const onChange = () => {
      if (reducedMq.matches || !desktopMq.matches) {
        teardown();
      } else {
        init();
      }
    };

    init();
    reducedMq.addEventListener("change", onChange);
    desktopMq.addEventListener("change", onChange);

    return () => {
      cancelled = true;
      reducedMq.removeEventListener("change", onChange);
      desktopMq.removeEventListener("change", onChange);
      teardown();
    };
  }, []);
}
