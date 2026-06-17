import { useRef, useEffect, useLayoutEffect, useState, type ReactNode } from "react";

const BORDER_RADIUS = 24; // rounded-3xl = 1.5rem = 24px

function buildPaths(w: number, h: number) {
  const r = BORDER_RADIUS;
  const s = 1; // 1px inset so stroke sits inside the card edge
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

interface Props {
  children: ReactNode;
  strokeWidth?: number;
  duration?: number;
  strokeClassName?: string;
}

export function CardOutlineReveal({
  children,
  strokeWidth = 2,
  duration = 1.15,
  strokeClassName = "text-black/70 dark:text-white/50",
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<SVGPathElement>(null);
  const leftRef = useRef<SVGPathElement>(null);

  const [paths, setPaths] = useState<{ right: string; left: string } | null>(null);
  const [lengths, setLengths] = useState({ right: 0, left: 0 });
  const [started, setStarted] = useState(false);

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

  useLayoutEffect(() => {
    if (!paths) return;
    const rLen = rightRef.current?.getTotalLength() ?? 0;
    const lLen = leftRef.current?.getTotalLength() ?? 0;
    if (rLen > 0 && lLen > 0) setLengths({ right: rLen, left: lLen });
  }, [paths]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const rLen = lengths.right;
  const lLen = lengths.left;
  const ready = rLen > 0 && lLen > 0;

  const dashFor = (len: number) => ({
    strokeDasharray: ready ? len : 9999,
    strokeDashoffset: started && ready ? 0 : ready ? len : 9999,
  });

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
            {...dashFor(rLen)}
            style={{
              transition:
                started && ready
                  ? `stroke-dashoffset ${duration}s cubic-bezier(0.4,0,0.2,1)`
                  : "none",
            }}
          />
          <path
            ref={leftRef}
            d={paths.left}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...dashFor(lLen)}
            style={{
              transition:
                started && ready
                  ? `stroke-dashoffset ${duration}s cubic-bezier(0.4,0,0.2,1)`
                  : "none",
            }}
          />
        </svg>
      )}
    </div>
  );
}
