import { ReactNode } from "react";

type Tone = "emerald" | "amber" | "red" | "indigo" | "blue" | "purple" | "neutral";

const toneClasses: Record<Tone, string> = {
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
  indigo: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  purple: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  neutral: "bg-muted text-muted-foreground",
};

interface MobileStatusPillProps {
  tone: Tone;
  icon?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md";
  testId?: string;
}

export function MobileStatusPill({ tone, icon, children, size = "md", testId }: MobileStatusPillProps) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${toneClasses[tone]} ${
        size === "sm" ? "h-5 px-2 text-[10px]" : "h-6 px-2.5 text-[11px]"
      }`}
    >
      {icon}
      {children}
    </span>
  );
}

export function statusToTone(status: string): Tone {
  switch (status) {
    case "pending":
      return "amber";
    case "confirmed":
      return "blue";
    case "partially_confirmed":
      return "amber";
    case "in_delivery":
      return "purple";
    case "delivered":
      return "emerald";
    case "cancelled":
      return "red";
    case "open":
      return "amber";
    case "in_progress":
      return "blue";
    case "resolved":
      return "emerald";
    default:
      return "neutral";
  }
}
