import { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Align = "left" | "center" | "right";

interface CellProps {
  children: React.ReactNode;
  /** Plain-text fallback shown in the tooltip when the cell content is truncated. */
  title?: string;
  align?: Align;
  className?: string;
  /** When true, applies tabular-nums for stable numeric column widths. */
  numeric?: boolean;
  /** Optional test id for the cell wrapper. */
  testId?: string;
  /** When true, removes default cell padding (use for cells that own their layout). */
  unstyled?: boolean;
}

const alignClass: Record<Align, string> = {
  left: "justify-start text-left",
  center: "justify-center text-center",
  right: "justify-end text-right",
};

/**
 * Smart text cell:
 * - Detects horizontal overflow and shows the full value in a tooltip
 * - Truncates with ellipsis
 * - Right-aligned numeric variant uses tabular-nums for clean column alignment
 */
export function Cell({
  children,
  title,
  align = "center",
  className,
  numeric = false,
  testId,
  unstyled = false,
}: CellProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setIsOverflowing(el.scrollWidth > el.clientWidth + 1);
    check();
    const obs = new ResizeObserver(check);
    obs.observe(el);
    return () => obs.disconnect();
  }, [children]);

  const text = (
    <span
      ref={ref}
      className={cn(
        "block truncate min-w-0 w-full",
        numeric && "tabular-nums",
      )}
      data-testid={testId}
    >
      {children}
    </span>
  );

  const wrapperCls = cn(
    !unstyled && "px-3 flex items-center min-w-0 w-full",
    !unstyled && alignClass[align],
    className,
  );

  if (!isOverflowing || !title) {
    return <div className={wrapperCls}>{text}</div>;
  }

  return (
    <div className={wrapperCls}>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{text}</TooltipTrigger>
          <TooltipContent className="max-w-xs break-words">{title}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
