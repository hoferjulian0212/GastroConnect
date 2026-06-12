import { ReactNode } from "react";
import { motion } from "framer-motion";
import { useScrollCompact } from "@/hooks/use-scroll-compact";

interface MobileFabProps {
  onClick: () => void;
  icon: ReactNode;
  label?: string;
  testId?: string;
  bottomOffset?: number;
  variant?: "primary" | "dark";
}

export function MobileFab({
  onClick,
  icon,
  label,
  testId,
  bottomOffset,
  variant = "primary",
}: MobileFabProps) {
  const compact = useScrollCompact();
  const colors =
    variant === "dark"
      ? "bg-[#161921] text-white hover:bg-[#1f2330] active:bg-[#262a39]"
      : "text-foreground dark:text-white";

  return (
    <motion.button
      onClick={onClick}
      data-testid={testId || "mobile-fab"}
      className={`md:hidden fixed right-4 z-30 inline-flex items-center justify-center gap-2 h-12 ${
        label ? "px-4 rounded-full" : "w-12 rounded-full"
      } ${colors} ${variant === "primary" ? "mobile-fab-glass" : "shadow-lg shadow-black/20"}`}
      style={{
        bottom: bottomOffset !== undefined
          ? `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`
          : "var(--mobile-cta-offset)",
        pointerEvents: compact ? "none" : "auto",
      }}
      initial={false}
      animate={{
        y: compact ? 12 : 0,
        scale: compact ? 0.9 : 1,
        opacity: compact ? 0 : 1,
      }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      whileTap={{ scale: 0.93 }}
      aria-hidden={compact}
    >
      <span className="inline-flex items-center justify-center">{icon}</span>
      {label && <span className="text-[14px] font-semibold whitespace-nowrap">{label}</span>}
    </motion.button>
  );
}
