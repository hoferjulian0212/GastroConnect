import { ArrowLeft } from "lucide-react";

interface MobileBackButtonProps {
  label?: string;
  onClick: () => void;
  testId?: string;
  iconOnly?: boolean;
}

/**
 * Shared mobile back control for pages that replace the normal app shell.
 * The same touch target, pill treatment, and focus ring keep navigation
 * consistent across inboxes and other full-screen mobile views.
 */
export function MobileBackButton({
  label = "Zurück",
  onClick,
  testId,
  iconOnly = false,
}: MobileBackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={testId}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-muted/70 text-foreground transition-colors hover:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        iconOnly ? "h-9 w-9" : "h-9 px-3 text-[13px] font-medium"
      }`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}