import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { TiltCard } from "./TiltCard";

interface Callout {
  label: string;
  /** anchor point on screenshot in % */
  ax: number;
  ay: number;
  /** label position in % (where the text sits) */
  lx: number;
  ly: number;
  testId?: string;
}

interface HeroShotRevealProps {
  src: string;
  alt: string;
  callouts: Callout[];
}

export function HeroShotReveal({ src, alt, callouts }: HeroShotRevealProps) {
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [showCallouts, setShowCallouts] = useState(false);

  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start end", "end start"],
    layoutEffect: false,
  });

  // Map first half of scroll-in: from 0.0..0.35 → grow from 0.95 → 1, opacity 0 → 1
  const rawScale = useTransform(scrollYProgress, [0, 0.35], [0.95, 1]);
  const rawY = useTransform(scrollYProgress, [0, 0.35], [40, 0]);
  const rawOpacity = useTransform(scrollYProgress, [0, 0.15, 0.35], [0, 0.85, 1]);

  const scale = useSpring(rawScale, { stiffness: 120, damping: 24, mass: 0.8 });
  const yMv = useSpring(rawY, { stiffness: 120, damping: 24, mass: 0.8 });

  useEffect(() => {
    const unsub = scrollYProgress.on("change", (v) => {
      setShowCallouts(v > 0.25);
    });
    return () => unsub();
  }, [scrollYProgress]);

  if (reduce) {
    return (
      <div ref={wrapRef} className="relative">
        <div className="rounded-2xl border border-border overflow-hidden shadow-2xl shadow-black/5 bg-card">
          <img
            src={src}
            alt={alt}
            className="w-full h-auto block"
            data-testid="img-hero-screenshot"
            loading="eager"
          />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      ref={wrapRef}
      className="relative"
      style={{
        scale,
        y: yMv,
        opacity: rawOpacity,
        willChange: "transform, opacity",
        transformOrigin: "center top",
      }}
    >
      <TiltCard className="relative">
        <div className="relative rounded-2xl border border-border overflow-hidden shadow-2xl shadow-black/5 bg-card">
          <img
            src={src}
            alt={alt}
            className="w-full h-auto block"
            data-testid="img-hero-screenshot"
            loading="eager"
          />
        </div>

        {/* Annotation callouts (B2) — desktop only, on top of screenshot */}
        <svg
          className="hidden md:block pointer-events-none absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {callouts.map((c, i) => (
            <motion.line
              key={`l-${i}`}
              x1={c.ax}
              y1={c.ay}
              x2={c.lx}
              y2={c.ly}
              stroke="rgba(0,0,0,0.45)"
              strokeWidth={0.15}
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={
                showCallouts
                  ? { pathLength: 1, opacity: 1 }
                  : { pathLength: 0, opacity: 0 }
              }
              transition={{
                duration: 0.6,
                delay: 0.1 + i * 0.25,
                ease: "easeOut",
              }}
            />
          ))}
          {callouts.map((c, i) => (
            <motion.circle
              key={`d-${i}`}
              cx={c.ax}
              cy={c.ay}
              r={0.45}
              fill="rgba(0,0,0,0.7)"
              initial={{ opacity: 0, scale: 0 }}
              animate={
                showCallouts ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }
              }
              transition={{ duration: 0.3, delay: 0.05 + i * 0.25 }}
            />
          ))}
        </svg>

        {/* Labels */}
        <div className="hidden md:block pointer-events-none absolute inset-0">
          {callouts.map((c, i) => (
            <motion.div
              key={`t-${i}`}
              className="absolute"
              style={{
                left: `${c.lx}%`,
                top: `${c.ly}%`,
                transform: "translate(-50%, -120%)",
              }}
              initial={{ opacity: 0, y: 6 }}
              animate={
                showCallouts ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }
              }
              transition={{
                duration: 0.4,
                delay: 0.35 + i * 0.25,
                ease: "easeOut",
              }}
            >
              <span
                className="inline-block px-2.5 py-1 rounded-full bg-white/95 dark:bg-card/95 backdrop-blur text-[11px] font-medium text-foreground border border-border shadow-sm whitespace-nowrap"
                data-testid={c.testId}
              >
                {c.label}
              </span>
            </motion.div>
          ))}
        </div>
      </TiltCard>
    </motion.div>
  );
}
