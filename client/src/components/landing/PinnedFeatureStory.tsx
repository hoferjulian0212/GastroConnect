import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface PinnedFeatureStoryProps {
  imageSrc: string;
  imageAlt: string;
  headline: string;
  steps: string[];
  side?: "left" | "right";
  testId?: string;
  reverse?: boolean;
}

export function PinnedFeatureStory({
  imageSrc,
  imageAlt,
  headline,
  steps,
  testId,
  reverse = false,
}: PinnedFeatureStoryProps) {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Initialize synchronously to avoid first-paint layout shift between
  // mobile-stack and desktop-pinned variants.
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
    layoutEffect: false,
  });
  const imageScale = useTransform(
    scrollYProgress,
    [0, 0.1, 0.9, 1],
    [0.96, 1, 1, 0.98],
  );

  // Active step index based on scroll progress
  const [activeStep, setActiveStep] = useState(0);
  useEffect(() => {
    const unsub = scrollYProgress.on("change", (v) => {
      const n = steps.length;
      // ignore the first 10% (intro) and last 10% (outro)
      const t = Math.max(0, Math.min(1, (v - 0.1) / 0.8));
      const idx = Math.min(n - 1, Math.floor(t * n));
      setActiveStep(idx);
    });
    return () => unsub();
  }, [scrollYProgress, steps.length]);

  // Reduced-motion fallback (any viewport): simple stacked, no pin, no snap
  if (reduce) {
    return (
      <section className="px-4 py-20" data-testid={testId}>
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-8">
            {headline}
          </h2>
          <div className="rounded-2xl border border-border overflow-hidden shadow-xl shadow-black/5 bg-card mb-8">
            <img src={imageSrc} alt={imageAlt} className="w-full h-auto block" />
          </div>
          <ul className="space-y-4">
            {steps.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-base md:text-lg text-foreground/80 leading-relaxed"
              >
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-foreground/60 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  // Mobile / tablet: horizontally snapping step carousel with tap-through dots
  if (!isDesktop) {
    return (
      <MobileStoryCarousel
        imageSrc={imageSrc}
        imageAlt={imageAlt}
        headline={headline}
        steps={steps}
        testId={testId}
      />
    );
  }

  // Desktop: ~150vh scroll distance, content pinned in center
  return (
    <section
      ref={containerRef}
      className="relative"
      style={{ height: "180vh" }}
      data-testid={testId}
    >
      <div className="sticky top-0 h-screen flex items-center px-8">
        <div
          className={`mx-auto max-w-6xl w-full grid gap-12 items-center grid-cols-12 ${
            reverse ? "" : ""
          }`}
        >
          {/* Image side */}
          <div className={reverse ? "col-span-7 order-2" : "col-span-7 order-1"}>
            <motion.div
              className="rounded-2xl border border-border overflow-hidden shadow-2xl shadow-black/5 bg-card"
              style={{ scale: imageScale }}
            >
              <img
                src={imageSrc}
                alt={imageAlt}
                className="w-full h-auto block"
                loading="lazy"
              />
            </motion.div>
          </div>

          {/* Text side */}
          <div className={reverse ? "col-span-5 order-1" : "col-span-5 order-2"}>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-10 leading-tight">
              {headline}
            </h2>
            <div className="relative min-h-[200px]">
              {steps.map((s, i) => {
                const isActive = i === activeStep;
                return (
                  <motion.div
                    key={i}
                    className="absolute inset-0 flex items-start gap-4"
                    initial={false}
                    animate={{
                      opacity: isActive ? 1 : 0,
                      y: isActive ? 0 : 12,
                      filter: isActive ? "blur(0px)" : "blur(6px)",
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 140,
                      damping: 22,
                    }}
                  >
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                        0{i + 1}
                      </span>
                      <div className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
                    </div>
                    <p className="text-xl md:text-2xl font-medium text-foreground leading-snug">
                      {s}
                    </p>
                  </motion.div>
                );
              })}
            </div>
            {/* Progress dots */}
            <div className="mt-8 flex items-center gap-2">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === activeStep
                      ? "w-8 bg-foreground"
                      : "w-4 bg-foreground/20"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface MobileStoryCarouselProps {
  imageSrc: string;
  imageAlt: string;
  headline: string;
  steps: string[];
  testId?: string;
}

function MobileStoryCarousel({
  imageSrc,
  imageAlt,
  headline,
  steps,
  testId,
}: MobileStoryCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const idx = Math.round(el.scrollLeft / w);
      setActiveStep(Math.max(0, Math.min(steps.length - 1, idx)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [steps.length]);

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section className="px-4 py-16" data-testid={testId}>
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-6">
          {headline}
        </h2>
        <div className="rounded-2xl border border-border overflow-hidden shadow-xl shadow-black/5 bg-card mb-6">
          <img src={imageSrc} alt={imageAlt} className="w-full h-auto block" />
        </div>

        <div
          ref={scrollerRef}
          className="-mx-4 flex overflow-x-auto snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
          data-testid={testId ? `${testId}-scroller` : undefined}
        >
          {steps.map((s, i) => (
            <div
              key={i}
              className="snap-center shrink-0 w-full px-4"
              aria-roledescription="slide"
              aria-label={`Schritt ${i + 1} von ${steps.length}`}
            >
              <div className="rounded-2xl border border-border bg-card p-5 min-h-[160px] flex items-start gap-4">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                    0{i + 1}
                  </span>
                  <div className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
                </div>
                <p className="text-lg font-medium text-foreground leading-snug">
                  {s}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Zu Schritt ${i + 1} springen`}
              aria-current={i === activeStep ? "true" : undefined}
              data-testid={
                testId ? `${testId}-dot-${i}` : undefined
              }
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeStep
                  ? "w-8 bg-foreground"
                  : "w-4 bg-foreground/20"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
