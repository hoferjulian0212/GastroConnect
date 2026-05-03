import { ReactNode } from "react";

interface MobileEmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  testId?: string;
}

export function MobileEmptyState({ icon, title, description, action, testId }: MobileEmptyStateProps) {
  return (
    <div
      data-testid={testId || "mobile-empty-state"}
      className="flex flex-col items-center justify-center text-center px-6 py-12"
    >
      {icon && (
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/60 text-muted-foreground mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="text-[13px] text-muted-foreground mt-1 max-w-[280px]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
