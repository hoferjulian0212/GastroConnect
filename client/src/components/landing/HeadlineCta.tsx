import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { useLocation } from "wouter";

interface HeadlineCtaProps {
  href: string;
  pillText: string;
  children: ReactNode;
  testId?: string;
}

export function HeadlineCta({ href, pillText, children, testId }: HeadlineCtaProps) {
  const reduce = useReducedMotion();
  const [, setLocation] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springConfig = { stiffness: 350, damping: 28, mass: 0.5 };
  const px = useSpring(x, springConfig);
  const py = useSpring(y, springConfig);

  const handleMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set(e.clientX - rect.left);
    y.set(e.clientY - rect.top);
  };

  const go = () => setLocation(href);

  return (
    <div
      ref={ref}
      onMouseMove={reduce ? undefined : handleMove}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
      role="link"
      tabIndex={0}
      aria-label={pillText}
      className="group relative inline-block cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      data-testid={testId}
    >
      {children}
      <motion.span
        aria-hidden
        style={reduce ? { left: "50%", top: "50%" } : { left: px, top: py }}
        className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-foreground px-5 py-2.5 text-sm md:text-base font-medium text-background shadow-xl shadow-black/20 opacity-0 scale-90 transition-[opacity,transform] duration-200 ease-out group-hover:opacity-100 group-hover:scale-100"
        data-testid="pill-hero-discover"
      >
        {pillText}
      </motion.span>
    </div>
  );
}
