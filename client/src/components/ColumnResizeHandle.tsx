import type React from "react";

interface Props {
  onPointerDown: (e: React.PointerEvent) => void;
  testId?: string;
}

export function ColumnResizeHandle({ onPointerDown, testId }: Props) {
  return (
    <span
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      role="separator"
      aria-orientation="vertical"
      data-testid={testId}
      className="group absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none touch-none z-10 flex justify-center hover:bg-primary/20 active:bg-primary/40 transition-colors"
    >
      <span aria-hidden className="block h-full w-px bg-border/70 group-hover:bg-primary/70 transition-colors" />
    </span>
  );
}
