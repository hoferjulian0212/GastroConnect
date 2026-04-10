import { type ReactNode, type CSSProperties } from "react";

interface StaggeredListProps {
  children: ReactNode[];
  baseDelay?: number;
  staggerDelay?: number;
  className?: string;
}

export default function StaggeredList({
  children,
  baseDelay = 30,
  staggerDelay = 50,
  className,
}: StaggeredListProps) {
  return (
    <div className={className}>
      {children.map((child, i) => {
        const delay = baseDelay + i * staggerDelay;
        const style: CSSProperties = {
          animation: `stagger-fade-in 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms both`,
        };
        return (
          <div key={i} style={style}>
            {child}
          </div>
        );
      })}
    </div>
  );
}
