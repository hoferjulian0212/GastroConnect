import { useRef, useEffect, useLayoutEffect, useState, type ReactNode } from "react";

const BORDER_RADIUS = 24; // rounded-3xl

function buildPaths(w: number, h: number) {
  const r = BORDER_RADIUS;
  const s = 1;
  const right =
    `M ${w / 2},${s} ` +
    `L ${w - r},${s} ` +
    `Q ${w - s},${s} ${w - s},${r} ` +
    `L ${w - s},${h - r} ` +
    `Q ${w - s},${h - s} ${w - r},${h - s} ` +
    `L ${w / 2},${h - s}`;
  const left =
    `M ${w / 2},${s} ` +
    `L ${r},${s} ` +
    `Q ${s},${s} ${s},${r} ` +
    `L ${s},${h - r} ` +
    `Q ${s},${h - s} ${r},${h - s} ` +
    `L ${w / 2},${h - s}`;
  return { right, left };
}

// Drive the draw off the card's vertical CENTER so it only starts once the
// card is near the middle of the screen (after the entry animations settle),
// then completes slowly as it scrolls up past the middle.
const DRAW_START = 0.72; // card center at 72% down the viewport -> progress 0
const DRAW_END = 0.32; // card center at 32% down the viewport -> progress 1
function computeProgress(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const center = (rect.top + rect.height / 2) / vh;
  return Math.max(0, Math.min(1, (DRAW_START - center) / (DRAW_START - DRAW_END)));
}

interface Props {
  children: ReactNode;
  strokeWidth?: number;
  strokeClassName?: string;
}

export function CardOutlineReveal({
  children,
  strokeWidth = 2,
  strokeClassName = "text-black/70 dark:text-white/50",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<SVGPathElement>(null);
  const leftRef = useRef<SVGPathElement>(null);
  const lengthsRef = useRef({ right: 0, left: 0 });

  const [paths, setPaths] = useState<{ right: string; left: string } | null>(null);

  // Measure card dimensions, rebuild paths on resize
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      if (w > 0 && h > 0) setPaths(buildPaths(w, h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // After paths render: get lengths, set dasharray, apply initial scroll position
  useLayoutEffect(() => {
    if (!paths || !rightRef.current || !leftRef.current) return;

    const rLen = rightRef.current.getTotalLength();
    const lLen = leftRef.current.getTotalLength();
    lengthsRef.current = { right: rLen, left: lLen };

    // Set dasharray so the stroke can be hidden/shown
    rightRef.current.style.strokeDasharray = String(rLen);
    leftRef.current.style.strokeDasharray = String(lLen);

    // Apply current scroll position immediately (no flash)
    const el = wrapRef.current;
    if (!el) return;
    const p = computeProgress(el);
    rightRef.current.style.strokeDashoffset = String(rLen * (1 - p));
    leftRef.current.style.strokeDashoffset = String(lLen * (1 - p));
  }, [paths]);

  // Scroll listener — updates DOM directly, no React re-render
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const update = () => {
      const { right: rLen, left: lLen } = lengthsRef.current;
      if (!rLen || !lLen) return;
      const p = computeProgress(el);
      if (rightRef.current) rightRef.current.style.strokeDashoffset = String(rLen * (1 - p));
      if (leftRef.current) leftRef.current.style.strokeDashoffset = String(lLen * (1 - p));
    };

    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div ref={wrapRef} className="relative h-full">
      {children}
      {paths && (
        <svg
          className={`absolute inset-0 pointer-events-none overflow-visible ${strokeClassName}`}
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          <path
            ref={rightRef}
            d={paths.right}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDashoffset={9999}
          />
          <path
            ref={leftRef}
            d={paths.left}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDashoffset={9999}
          />
        </svg>
      )}
    </div>
  );
}
