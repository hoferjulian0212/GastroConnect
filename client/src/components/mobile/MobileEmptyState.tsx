import { ReactNode } from "react";

interface MobileEmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Subtle accent tint for the icon halo. Defaults to neutral. */
  tone?: "neutral" | "emerald" | "amber" | "red" | "primary";
  testId?: string;
}

const toneRing: Record<NonNullable<MobileEmptyStateProps["tone"]>, string> = {
  neutral: "bg-muted/50 text-muted-foreground ring-border",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
  red: "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20",
  primary: "bg-primary/10 text-primary ring-primary/20",
};

export function MobileEmptyState({
  icon,
  title,
  description,
  action,
  tone = "neutral",
  testId,
}: MobileEmptyStateProps) {
  return (
    <div
      data-testid={testId || "mobile-empty-state"}
      className="flex flex-col items-center justify-center text-center px-6 py-14"
    >
      {icon && (
        <div
          className={`flex items-center justify-center w-20 h-20 rounded-3xl ring-1 mb-5 [&>svg]:h-9 [&>svg]:w-9 ${toneRing[tone]}`}
        >
          {icon}
        </div>
      )}
      <h3 className="m-type-h1 text-foreground">{title}</h3>
      {description && (
        <p className="m-type-meta mt-1.5 max-w-[300px] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
