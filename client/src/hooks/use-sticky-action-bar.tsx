import { useEffect } from "react";

const KEYBOARD_DETECT_THRESHOLD_PX = 120;

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
