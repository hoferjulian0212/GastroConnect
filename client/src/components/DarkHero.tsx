import { ReactNode } from "react";
import { HeroPortal } from "@/context/HeroContext";

interface DarkHeroProps {
  children: ReactNode;
  testId?: string;
  className?: string;
  mobileClassName?: string;
  desktopClassName?: string;
  mb?: string;
}

export function DarkHero({
  children,
  testId,
  className,
  mobileClassName,
  desktopClassName,
  mb = "mb-3 md:mb-4",
}: DarkHeroProps) {
  return (
    <>
      <div
        className={`dark bg-[#161921] px-3 pt-3 pb-4 rounded-b-3xl ${mb} md:hidden ${className ?? ""} ${mobileClassName ?? ""}`}
        data-testid={testId ? `${testId}-mobile` : undefined}
      >
        {children}
      </div>
      <HeroPortal>
        <div
          className={`px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 ${className ?? ""} ${desktopClassName ?? ""}`}
          data-testid={testId}
        >
          {children}
        </div>
      </HeroPortal>
    </>
  );
}
