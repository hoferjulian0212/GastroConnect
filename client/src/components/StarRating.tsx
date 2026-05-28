import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  showValue?: boolean;
  count?: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  "data-testid"?: string;
}

const SIZE_MAP = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-6 w-6",
};

export function StarRating({
  value,
  max = 5,
  size = "md",
  className,
  showValue,
  count,
  onChange,
  readOnly,
  ...rest
}: StarRatingProps) {
  const isInteractive = !readOnly && !!onChange;
  const display = Math.max(0, Math.min(max, value));
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)} data-testid={rest["data-testid"]}>
      <div className="flex items-center" role={isInteractive ? "radiogroup" : undefined} aria-label="Sterne-Bewertung">
        {Array.from({ length: max }).map((_, i) => {
          const idx = i + 1;
          const filled = idx <= Math.round(display);
          const half = !filled && idx - 0.5 <= display;
          return (
            <button
              key={i}
              type="button"
              disabled={!isInteractive}
              onClick={isInteractive ? () => onChange?.(idx) : undefined}
              className={cn(
                "p-0.5 rounded transition-transform",
                isInteractive && "hover:scale-110 active:scale-95 cursor-pointer",
                !isInteractive && "cursor-default",
              )}
              data-testid={isInteractive ? `star-button-${idx}` : undefined}
              aria-label={`${idx} ${idx === 1 ? "Stern" : "Sterne"}`}
            >
              <Star
                className={cn(
                  SIZE_MAP[size],
                  filled
                    ? "fill-yellow-400 text-yellow-400"
                    : half
                    ? "fill-yellow-400/50 text-yellow-400"
                    : "fill-transparent text-muted-foreground/40",
                )}
              />
            </button>
          );
        })}
      </div>
      {showValue && (
        <span className="text-sm font-medium tabular-nums" data-testid="rating-value">
          {display > 0 ? display.toFixed(1) : "–"}
        </span>
      )}
      {typeof count === "number" && count > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums" data-testid="rating-count">
          ({count})
        </span>
      )}
    </div>
  );
}

export default StarRating;
