import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ZoomIn, X } from "lucide-react";

export interface StepImage {
  src: string;
  alt: string;
}

interface LightboxState {
  img: StepImage;
  title: string;
  caption: string;
}

interface PinnedFeatureStoryProps {
  imageSrc: string;
  imageAlt: string;
  headline: string;
  steps: string[];
  stepImages?: StepImage[];
  side?: "left" | "right";
  testId?: string;
  reverse?: boolean;
}

export function PinnedFeatureStory({
  imageSrc,
  imageAlt,
  headline,
  steps,
  stepImages,
  testId,
  reverse = false,
}: PinnedFeatureStoryProps) {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 768px)").matches,
  );
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

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

  const [activeStep, setActiveStep] = useState(0);
  useEffect(() => {
    const unsub = scrollYProgress.on("change", (v) => {
      const n = steps.length;
      const t = Math.max(0, Math.min(1, (v - 0.08) / 0.84));
      const idx = Math.min(n - 1, Math.floor(t * n));
      setActiveStep(idx);
    });
    return () => unsub();
  }, [scrollYProgress, steps.length]);

  const resolvedImages: StepImage[] =
    stepImages && stepImages.length === steps.length
      ? stepImages
      : steps.map(() => ({ src: imageSrc, alt: imageAlt }));

  const openLightbox = (img: StepImage, stepText: string) => {
    setLightbox({ img, title: stepText, caption: img.alt });
  };

  if (reduce) {
    return (
      <section className="px-4 py-20" data-testid={testId}>
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight mb-8">
            {headline}
          </h2>
          <ul className="space-y-10">
            {steps.map((s, i) => {
              const img = resolvedImages[i];
              return (
                <li key={i} className="space-y-4">
                  <div
                    className="rounded-2xl border border-border overflow-hidden shadow-xl shadow-black/5 bg-card cursor-zoom-in group relative"
                    onClick={() => openLightbox(img, s)}
                  >
                    <img
                      src={img.src}
                      alt={img.alt}
                      className="w-full h-auto block"
                    />
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="h-8 w-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                        <ZoomIn className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-base md:text-lg text-foreground/80 leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-foreground/60 shrink-0" />
                    <span>{s}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <Lightbox lightbox={lightbox} onClose={() => setLightbox(null)} />
      </section>
    );
  }

  if (!isDesktop) {
    return (
      <>
        <MobileStoryCarousel
          headline={headline}
          steps={steps}
          stepImages={resolvedImages}
          testId={testId}
          onZoom={openLightbox}
        />
        <Lightbox lightbox={lightbox} onClose={() => setLightbox(null)} />
      </>
    );
  }

  return (
    <>
      <section
        ref={containerRef}
        className="relative"
        style={{ height: "300vh" }}
        data-testid={testId}
      >
        <div className="sticky top-0 h-screen flex items-center px-8">
          <div className="mx-auto max-w-6xl w-full grid gap-12 items-center grid-cols-12">
            {/* Image side */}
            <div className={reverse ? "col-span-7 order-2" : "col-span-7 order-1"}>
              <motion.div
                className="relative rounded-2xl border border-border overflow-hidden shadow-2xl shadow-black/5 bg-card cursor-zoom-in group"
                style={{ scale: imageScale }}
                onClick={() =>
                  openLightbox(resolvedImages[activeStep], steps[activeStep])
                }
              >
                <img
                  src={resolvedImages[0].src}
                  alt=""
                  aria-hidden="true"
                  className="w-full h-auto block invisible"
                />
                {resolvedImages.map((img, i) => {
                  const isActive = i === activeStep;
                  return (
                    <motion.img
                      key={i}
                      src={img.src}
                      alt={img.alt}
                      loading={i === 0 ? "eager" : "lazy"}
                      className="absolute inset-0 w-full h-full object-cover block"
                      initial={false}
                      animate={{
                        opacity: isActive ? 1 : 0,
                        scale: isActive ? 1 : 1.02,
                      }}
                      transition={{
                        opacity: { duration: 0.45, ease: "easeOut" },
                        scale: {
                          type: "spring",
                          stiffness: 140,
                          damping: 22,
                        },
                      }}
                      data-testid={testId ? `${testId}-image-${i}` : undefined}
                    />
                  );
                })}
                {/* Zoom hint */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                  <div className="h-9 w-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                    <ZoomIn className="h-4 w-4 text-white" />
                  </div>
                </div>
                {/* Step indicator badge */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 z-10 pointer-events-none">
                  {resolvedImages.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === activeStep
                          ? "w-6 bg-white"
                          : "w-1.5 bg-white/40"
                      }`}
                    />
                  ))}
                </div>
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

      <Lightbox lightbox={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

function Lightbox({
  lightbox,
  onClose,
}: {
  lightbox: LightboxState | null;
  onClose: () => void;
}) {
  if (!lightbox) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      data-testid="lightbox-overlay"
    >
      <div
        className="relative max-w-4xl w-full bg-card rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
          aria-label="Schließen"
          data-testid="lightbox-close"
        >
          <X className="h-4 w-4" />
        </button>
        <img
          src={lightbox.img.src}
          alt={lightbox.img.alt}
          className="w-full h-auto block"
          data-testid="lightbox-image"
        />
        <div className="px-6 py-5 border-t border-border">
          <p className="font-semibold text-base text-foreground leading-snug" data-testid="lightbox-title">
            {lightbox.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed" data-testid="lightbox-caption">
            {lightbox.caption}
          </p>
        </div>
      </div>
    </div>
  );
}

interface MobileStoryCarouselProps {
  headline: string;
  steps: string[];
  stepImages: StepImage[];
  testId?: string;
  onZoom: (img: StepImage, stepText: string) => void;
}

function MobileStoryCarousel({
  headline,
  steps,
  stepImages,
  testId,
  onZoom,
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

        <div
          ref={scrollerRef}
          className="-mx-4 flex overflow-x-auto snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
          data-testid={testId ? `${testId}-scroller` : undefined}
        >
          {steps.map((s, i) => {
            const img = stepImages[i];
            return (
              <div
                key={i}
                className="snap-center shrink-0 w-full px-4"
                aria-roledescription="slide"
                aria-label={`Schritt ${i + 1} von ${steps.length}`}
              >
                <div
                  className="rounded-2xl border border-border overflow-hidden shadow-xl shadow-black/5 bg-card mb-4 cursor-zoom-in group relative"
                  onClick={() => onZoom(img, s)}
                >
                  <img
                    src={img.src}
                    alt={img.alt}
                    loading={i === 0 ? "eager" : "lazy"}
                    className="w-full h-auto block"
                    data-testid={
                      testId ? `${testId}-mobile-image-${i}` : undefined
                    }
                  />
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="h-8 w-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                      <ZoomIn className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5 min-h-[140px] flex items-start gap-4">
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
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Zu Schritt ${i + 1} springen`}
              aria-current={i === activeStep ? "true" : undefined}
              data-testid={testId ? `${testId}-dot-${i}` : undefined}
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
