import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupHeaderProps {
  label: string;
  count: number;
  countLabel: string;
  /** Highlight today's group with primary accent */
  highlight?: boolean;
  /** Optional warning state (e.g. overdue) */
  warning?: boolean;
  testId?: string;
  /**
   * Top offset (CSS length) used by the sticky positioning so the group header
   * stays just BELOW the main column header. Pass the approximate header height
   * (e.g. "32px" / "36px" / "52px"). Defaults to "0".
   */
  topOffset?: string;
}

/**
 * Sticky day-group header for the orders table.
 * - Sticks below the fixed table header on vertical scroll
 * - Visually distinct from data rows
 * - Adaptive accent color (primary for today, red for overdue, neutral otherwise)
 */
export function GroupHeader({ label, count, countLabel, highlight, warning, testId, topOffset = "0" }: GroupHeaderProps) {
  return (
    <div
      style={{ top: topOffset }}
      className={cn(
        "sticky z-[5] flex items-center gap-2 px-3 py-1.5 border-b border-border text-[11px] font-semibold uppercase tracking-wider",
        warning
          ? "bg-red-50/80 dark:bg-red-950/20 text-red-700 dark:text-red-400 backdrop-blur-sm"
          : highlight
            ? "bg-primary/[0.06] text-foreground backdrop-blur-sm"
            : "bg-muted/80 text-muted-foreground backdrop-blur-sm",
      )}
      data-testid={testId}
    >
      <CalendarDays className={cn("h-3.5 w-3.5", warning ? "text-red-600 dark:text-red-400" : highlight ? "text-primary" : "text-muted-foreground/70")} />
      <span>{label}</span>
      <span className={cn(
        "inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1.5 tabular-nums",
        warning
          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          : highlight
            ? "bg-primary/15 text-primary"
            : "bg-muted-foreground/10 text-muted-foreground",
      )}>
        {count}
      </span>
      <span className="text-muted-foreground/70 normal-case font-normal tracking-normal text-[10px]">
        {count === 1 ? countLabel : `${countLabel}`}
      </span>
    </div>
  );
}
