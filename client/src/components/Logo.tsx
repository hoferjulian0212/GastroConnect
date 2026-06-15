import logoImg from "@assets/logo_no_bg.png";
import logoImgThick from "@assets/logo_no_bg_thick.png";
import { cn } from "@/lib/utils";

/**
 * Universal GastroConnect logo lockup (icon + wordmark).
 *
 * The canonical proportions are taken from the dark app header:
 *   icon height 64px, wordmark 18px, gap -4px  ->  icon 3.556em, gap -0.222em.
 *
 * Everything is driven by a single fluid `font-size` (set per placement via
 * `size`). The icon, the gap and the wordmark are all expressed in `em`, so
 * they scale together — exponentially locked — when the window is resized or
 * the page is zoomed. The `vw` term in each clamp keeps the lockup from looking
 * too heavy when zoomed in (the CSS viewport shrinks, so the logo shrinks with
 * it) while never dropping below a legible minimum.
 */

const ICON_EM = 3.556; // 64 / 18  (icon height relative to wordmark)
const GAP_EM = -0.222; // -4 / 18  (negative nudge to tuck the wordmark in)

type LogoSize = "header" | "nav" | "footer" | "hero";

const SIZE_FONT: Record<LogoSize, string> = {
  // Tuned so the icon stays ~36px below lg and ~48px through ~1280px, only
  // reaching the canonical 64px near the 2xl breakpoint (where the wordmark
  // appears). This preserves the header's tight layout / no-overlap envelope.
  header: "clamp(8px, calc(-0.45rem + 1.3vw), 14px)",
  nav: "clamp(12px, calc(0.45rem + 0.4vw), 15px)",
  footer: "clamp(12px, calc(0.65rem + 0.2vw), 15px)",
  hero: "clamp(20px, calc(0.9rem + 1.4vw), 34px)",
};

interface LogoProps {
  /** Placement preset that controls the fluid base size. */
  size?: LogoSize;
  /** `light` = white logo + white text (dark backgrounds). `dark` = dark logo + theme text (light backgrounds). */
  variant?: "light" | "dark";
  /** Whether to render the "GastroConnect" wordmark next to the icon. */
  showText?: boolean;
  /** Use the slightly thicker-stroked icon variant. */
  thick?: boolean;
  /** Extra classes for the wordmark span (e.g. responsive show/hide). */
  textClassName?: string;
  className?: string;
  "data-testid"?: string;
}

export default function Logo({
  size = "nav",
  variant = "dark",
  showText = true,
  thick = false,
  textClassName,
  className,
  "data-testid": testId,
}: LogoProps) {
  return (
    <span
      className={cn("inline-flex items-center leading-none", className)}
      style={{ fontSize: SIZE_FONT[size] }}
      data-testid={testId}
    >
      <img
        src={thick ? logoImgThick : logoImg}
        alt="GastroConnect Logo"
        className={cn(
          "object-contain shrink-0",
          variant === "light" ? "brightness-0 invert" : "dark:invert",
        )}
        style={{ height: `${ICON_EM}em`, width: `${ICON_EM}em` }}
      />
      {showText && (
        <span
          className={cn(
            "font-bold tracking-tight whitespace-nowrap",
            variant === "light" ? "text-white" : "text-foreground",
            textClassName,
          )}
          style={{ fontSize: "1em", marginLeft: `${GAP_EM}em` }}
        >
          GastroConnect
        </span>
      )}
    </span>
  );
}
