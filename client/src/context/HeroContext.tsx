import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";

type Ctx = { el: HTMLElement | null; setEl: (el: HTMLElement | null) => void };

const HeroCtx = createContext<Ctx>({ el: null, setEl: () => {} });

export function HeroProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return <HeroCtx.Provider value={{ el, setEl }}>{children}</HeroCtx.Provider>;
}

export function HeroOutlet({ className }: { className?: string }) {
  const { setEl } = useContext(HeroCtx);
  return <div ref={setEl} className={className} data-hero-outlet />;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

interface HeroPortalProps {
  children: ReactNode;
  desktopOnly?: boolean;
  mobileWrapperClassName?: string;
}

export function HeroPortal({ children, desktopOnly = false, mobileWrapperClassName }: HeroPortalProps) {
  const { el } = useContext(HeroCtx);
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return el ? createPortal(children, el) : null;
  }

  if (desktopOnly) return null;

  return (
    <div
      className={`dark bg-[#161921] rounded-3xl overflow-hidden shrink-0 mx-2 mb-3 relative ${mobileWrapperClassName ?? ""}`}
      style={{ marginTop: "0.25rem" }}
      data-hero-mobile
    >
      <div>{children}</div>
    </div>
  );
}
