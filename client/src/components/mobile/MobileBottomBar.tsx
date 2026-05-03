import { ReactNode } from "react";

interface MobileBottomBarProps {
  children: ReactNode;
  testId?: string;
  bottomOffset?: number;
}

export function MobileBottomBar({ children, testId, bottomOffset = 80 }: MobileBottomBarProps) {
  return (
    <div
      className="md:hidden fixed left-0 right-0 z-30 px-3 pointer-events-none"
      style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))` }}
      data-testid={testId || "mobile-bottom-bar"}
    >
      <div className="pointer-events-auto rounded-2xl bg-card border border-border shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur-md p-2">
        {children}
      </div>
    </div>
  );
}
