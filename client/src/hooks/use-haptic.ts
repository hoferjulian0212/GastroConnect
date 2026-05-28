import { useCallback } from "react";

type HapticPattern = "light" | "medium" | "heavy" | "success" | "error" | "selection";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 8,
  medium: 18,
  heavy: 35,
  success: [12, 40, 22],
  error: [40, 30, 40],
  selection: 4,
};

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(pattern);
  } catch {
    // graceful no-op
  }
}

export function useHaptic() {
  return useCallback((pattern: HapticPattern = "light") => {
    vibrate(PATTERNS[pattern]);
  }, []);
}

export const haptic = (pattern: HapticPattern = "light") => vibrate(PATTERNS[pattern]);
