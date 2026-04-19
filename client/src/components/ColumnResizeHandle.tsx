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
      className="absolute top-0 -right-[1px] h-full w-1.5 cursor-col-resize select-none touch-none z-10 hover:bg-primary/30 active:bg-primary/50 transition-colors"
    />
  );
}
