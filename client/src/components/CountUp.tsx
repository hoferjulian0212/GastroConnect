import { useState, useEffect, useRef } from "react";

interface CountUpProps {
  end: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  formatter?: (value: number) => string;
}

export default function CountUp({
  end,
  duration = 1200,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  formatter,
}: CountUpProps) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const hasAnimated = useRef(false);
  const elRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (hasAnimated.current || end === 0) {
      setCurrent(end);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          observer.disconnect();
          startTimeRef.current = performance.now();

          const animate = (now: number) => {
            const elapsed = now - startTimeRef.current;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCurrent(eased * end);
            if (progress < 1) {
              rafRef.current = requestAnimationFrame(animate);
            } else {
              setCurrent(end);
            }
          };
          rafRef.current = requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    if (elRef.current) observer.observe(elRef.current);

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [end, duration]);

  const display = formatter
    ? formatter(current)
    : current.toFixed(decimals);

  return (
    <span ref={elRef} className={className}>
      {prefix}{display}{suffix}
    </span>
  );
}
