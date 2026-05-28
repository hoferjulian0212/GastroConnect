import { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface MobileListCardProps {
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  showChevron?: boolean;
  accent?: "emerald" | "amber" | "red" | "indigo" | "blue" | "neutral";
  testId?: string;
  className?: string;
}

const accentBorder: Record<string, string> = {
  emerald: "border-l-4 border-l-emerald-500",
  amber: "border-l-4 border-l-amber-500",
  red: "border-l-4 border-l-red-500",
  // Status meaning preserved (blue = in_delivery / info). Decorative `indigo`
  // collapses to the neutral primary accent — no stray decorative purple/indigo.
  indigo: "border-l-4 border-l-primary",
  blue: "border-l-4 border-l-blue-500",
  neutral: "",
};

export function MobileListCard({
  onClick,
  leading,
  title,
  subtitle,
  meta,
  trailing,
  showChevron,
  accent = "neutral",
  testId,
  className,
}: MobileListCardProps) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      data-testid={testId}
      className={`w-full text-left flex items-center gap-3 min-h-[56px] p-3 rounded-2xl bg-card border border-border ${accentBorder[accent]} ${
        onClick ? "active:scale-[0.98] transition-transform" : ""
      } ${className || ""}`}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-foreground truncate leading-tight">{title}</div>
        {subtitle && <div className="text-[12px] text-muted-foreground truncate mt-0.5">{subtitle}</div>}
        {meta && <div className="text-[11px] text-muted-foreground mt-0.5">{meta}</div>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
      {showChevron && <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
    </Comp>
  );
}
