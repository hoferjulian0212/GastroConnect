import { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: ReactNode;
  filters?: ReactNode;
  search?: ReactNode;
  testId?: string;
  compact?: boolean;
}

export function MobilePageHeader({
  title,
  subtitle,
  showBack,
  onBack,
  rightAction,
  filters,
  search,
  testId,
  compact,
}: MobilePageHeaderProps) {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (onBack) onBack();
    else if (typeof window !== "undefined") {
      if (window.history.length > 1) window.history.back();
      else setLocation("/");
    }
  };

  return (
    <div
      className={`md:hidden bg-[#161921] text-white px-4 ${compact ? "pt-3 pb-3" : "pt-3 pb-4"} rounded-b-3xl`}
      data-testid={testId || "mobile-page-header"}
    >
      <div className="flex items-center gap-3 min-h-[40px]">
        {showBack && (
          <button
            onClick={handleBack}
            className="-ml-2 p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
            data-testid="button-mobile-back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold leading-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-[12px] text-white/55 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {rightAction}
      </div>
      {search && <div className="mt-3">{search}</div>}
      {filters && (
        <div className="mt-3 -mx-4 px-4 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-2 min-w-min">{filters}</div>
        </div>
      )}
    </div>
  );
}

interface MobileFilterChipProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  testId?: string;
}
export function MobileFilterChip({ active, onClick, children, testId }: MobileFilterChipProps) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-medium transition-colors ${
        active
          ? "bg-white text-[#161921]"
          : "bg-white/10 text-white/85 hover:bg-white/15 active:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
}

interface MobileHeaderActionProps {
  onClick?: () => void;
  children: ReactNode;
  testId?: string;
  variant?: "default" | "primary";
}
export function MobileHeaderAction({ onClick, children, testId, variant = "default" }: MobileHeaderActionProps) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors ${
        variant === "primary"
          ? "bg-white text-[#161921] hover:bg-white/90"
          : "bg-white/10 text-white hover:bg-white/15 active:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
}
