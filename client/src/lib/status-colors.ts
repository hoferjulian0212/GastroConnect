/**
 * Locked-down 4-tone status palette used across the app.
 *
 *   emerald  → success / saving / completed
 *   amber    → pending / attention / partial
 *   red      → critical / overdue / cancelled
 *   indigo   → informational / in-flight / movement
 *   slate    → terminal-neutral (closed) — used sparingly
 *
 * One source of truth so the same status never picks two different colors
 * across pages.
 */

export type StatusTone = "emerald" | "amber" | "red" | "indigo" | "slate";

export const TONE = {
  emerald: {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    soft: "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40",
  },
  amber: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    soft: "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40",
  },
  red: {
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
    soft: "bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800/40",
  },
  indigo: {
    badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
    bg: "bg-indigo-100 dark:bg-indigo-900/40",
    text: "text-indigo-700 dark:text-indigo-400",
    dot: "bg-indigo-500",
    soft: "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/40",
  },
  slate: {
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300",
    bg: "bg-slate-100 dark:bg-slate-800/60",
    text: "text-slate-600 dark:text-slate-300",
    dot: "bg-slate-400",
    soft: "bg-slate-50/60 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700/50",
  },
} as const satisfies Record<StatusTone, Record<"badge" | "bg" | "text" | "dot" | "soft", string>>;

/** Map an order status to the correct tone. */
export function orderStatusTone(status: string): StatusTone {
  switch (status) {
    case "delivered": return "emerald";
    case "confirmed": return "indigo";
    case "scheduled": return "indigo";
    case "in_delivery": return "indigo";
    case "pending": return "amber";
    case "partially_confirmed": return "amber";
    case "cancelled": return "red";
    default: return "slate";
  }
}

/** Map a complaint status to the correct tone. */
export function complaintStatusTone(status: string): StatusTone {
  switch (status) {
    case "resolved": return "emerald";
    case "in_progress": return "indigo";
    case "open": return "amber";
    case "partially_resolved": return "amber";
    case "rejected": return "red";
    case "closed": return "slate";
    default: return "slate";
  }
}
