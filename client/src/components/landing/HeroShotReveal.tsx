import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { TiltCard } from "./TiltCard";
import CountUp from "@/components/CountUp";

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

interface KpiOverlay {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** position on screenshot in % */
  x: number;
  y: number;
  testId?: string;
}

interface FloatingPanel {
  src: string;
  alt: string;
  side: "left" | "right";
  rotate: number;
}

interface HeroShotRevealProps {
  src: string;
  alt: string;
  callouts: Callout[];
  kpis?: KpiOverlay[];
  floatingPanels?: FloatingPanel[];
}

export function HeroShotReveal({
  src,
  alt,
  callouts,
  kpis = [],
  floatingPanels = [],
}: HeroShotRevealProps) {
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [showCallouts, setShowCallouts] = useState(false);
  const [kpisInView, setKpisInView] = useState(false);

  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start end", "end start"],
    layoutEffect: false,
  });

  // Map first half of scroll-in: from 0.0..0.35 → grow from 0.95 → 1, opacity 0 → 1
  const rawScale = useTransform(scrollYProgress, [0, 0.35], [0.95, 1]);
  const rawY = useTransform(scrollYProgress, [0, 0.35], [40, 0]);
  const rawOpacity = useTransform(scrollYProgress, [0, 0.15, 0.35], [0, 0.85, 1]);
  // A2: explicit width interpolation 85% → 100% as the shot scrolls in
  const rawWidth = useTransform(
    scrollYProgress,
    [0, 0.35],
    ["85%", "100%"],
  );

  // Floating panels: slightly delayed and slide in from the sides
  const rawFloatOpacity = useTransform(scrollYProgress, [0.05, 0.2, 0.42], [0, 0, 1]);
  const rawFloatXLeft = useTransform(scrollYProgress, [0.1, 0.42], [-64, 0]);
  const rawFloatXRight = useTransform(scrollYProgress, [0.1, 0.42], [64, 0]);

  const scale = useSpring(rawScale, { stiffness: 120, damping: 24, mass: 0.8 });
  const yMv = useSpring(rawY, { stiffness: 120, damping: 24, mass: 0.8 });
  const floatOpacity = useSpring(rawFloatOpacity, { stiffness: 100, damping: 26, mass: 0.8 });
  const floatXLeft = useSpring(rawFloatXLeft, { stiffness: 100, damping: 26, mass: 0.8 });
  const floatXRight = useSpring(rawFloatXRight, { stiffness: 100, damping: 26, mass: 0.8 });

  useEffect(() => {
    const unsub = scrollYProgress.on("change", (v) => {
      setShowCallouts(v > 0.25);
      if (v > 0.2) setKpisInView(true);
    });
    return () => unsub();
  }, [scrollYProgress]);

  if (reduce) {
    return (
      <div ref={wrapRef} className="relative">
        {/* Floating panels — static in reduced motion */}
        {floatingPanels.map((panel, i) => (
          <div
            key={`fp-rm-${i}`}
            className="absolute hidden md:block z-10 w-[36%]"
            style={{
              top: panel.side === "left" ? "8%" : "42%",
              [panel.side]: "-14%",
              transform: `rotate(${panel.rotate}deg)`,
            }}
          >
            <div className="rounded-xl border border-border overflow-hidden shadow-2xl shadow-black/10 bg-card">
              <img
                src={panel.src}
                alt={panel.alt}
                className="w-full h-auto block"
                loading="lazy"
                data-testid={`img-floating-panel-${panel.side}`}
              />
            </div>
          </div>
        ))}

        <div className="relative rounded-2xl border border-border overflow-hidden shadow-2xl shadow-black/5 bg-card">
          <img
            src={src}
            alt={alt}
            className="w-full h-auto block"
            data-testid="img-hero-screenshot"
            loading="eager"
          />
        </div>
        {/* Reduced-motion: marketing KPI badges hanging off the bottom of the screenshot */}
        {kpis.map((k, i) => (
          <div
            key={`kpi-${i}`}
            className="absolute hidden md:flex flex-col items-start gap-0.5 px-4 py-2.5 rounded-xl bg-white/95 backdrop-blur border border-border shadow-lg"
            style={{
              left: `${k.x}%`,
              top: `${k.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            data-testid={k.testId}
          >
            <span className="text-[11px] md:text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              {k.label}
            </span>
            <span className="text-xl md:text-2xl font-semibold text-foreground tabular-nums">
              {k.prefix ?? ""}
              {k.decimals ? k.value.toFixed(k.decimals) : k.value}
              {k.suffix ?? ""}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      ref={wrapRef}
      className="relative mx-auto"
      style={{
        width: rawWidth,
        scale,
        y: yMv,
        opacity: rawOpacity,
        willChange: "transform, opacity, width",
        transformOrigin: "center top",
      }}
    >
      {/* Floating panels — rendered outside TiltCard so they overflow the main frame */}
      {floatingPanels.map((panel, i) => (
        <motion.div
          key={`fp-${i}`}
          className="absolute hidden md:block z-10 w-[36%]"
          style={{
            top: panel.side === "left" ? "8%" : "42%",
            [panel.side]: "-14%",
            rotate: panel.rotate,
            x: panel.side === "left" ? floatXLeft : floatXRight,
            opacity: floatOpacity,
            willChange: "transform, opacity",
          }}
        >
          <div className="rounded-xl border border-border overflow-hidden shadow-2xl shadow-black/10 bg-card">
            <img
              src={panel.src}
              alt={panel.alt}
              className="w-full h-auto block"
              loading="lazy"
              data-testid={`img-floating-panel-${panel.side}`}
            />
          </div>
        </motion.div>
      ))}

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

        {/* KPI marketing badges (A5) — floated outside the screenshot card
            so they never overlap dashboard chrome */}
        {kpis.map((k, i) => (
          <motion.div
            key={`kpi-${i}`}
            className="absolute hidden md:flex flex-col items-start gap-0.5 px-4 py-2.5 rounded-xl bg-white/95 backdrop-blur border border-border shadow-lg"
            style={{
              left: `${k.x}%`,
              top: `${k.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={
              kpisInView
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 8, scale: 0.96 }
            }
            transition={{
              duration: 0.45,
              delay: 0.2 + i * 0.15,
              ease: "easeOut",
            }}
            data-testid={k.testId}
          >
            <span className="text-[11px] md:text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              {k.label}
            </span>
            <span className="text-xl md:text-2xl font-semibold text-foreground tabular-nums">
              {k.prefix ?? ""}
              {kpisInView ? (
                <CountUp
                  end={k.value}
                  duration={1200}
                  decimals={k.decimals ?? 0}
                />
              ) : (
                0
              )}
              {k.suffix ?? ""}
            </span>
          </motion.div>
        ))}

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
                className="inline-block px-3 py-1.5 rounded-full bg-white/95 dark:bg-card/95 backdrop-blur text-sm font-medium text-foreground border border-border shadow-sm whitespace-nowrap"
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
