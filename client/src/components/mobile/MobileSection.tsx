import { ReactNode } from "react";

interface MobileSectionProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
  className?: string;
}

export function MobileSection({ title, action, children, testId, className }: MobileSectionProps) {
  return (
    <section className={`px-4 ${className || ""}`} data-testid={testId}>
      {(title || action) && (
        <div className="flex items-end justify-between mb-2.5">
          {title && (
            <h2 className="text-[14px] font-semibold text-foreground tracking-tight">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function MobileSectionLink({ onClick, children, testId }: { onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="text-[12px] font-semibold text-primary hover:text-primary/80 active:text-primary/70 transition-colors"
    >
      {children}
    </button>
  );
}
