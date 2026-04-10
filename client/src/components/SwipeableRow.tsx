import { useRef, useState, useCallback, type ReactNode } from "react";

interface SwipeAction {
  icon: ReactNode;
  label: string;
  color: string;
  onClick: () => void;
  testId?: string;
}

interface SwipeableRowProps {
  children: ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  threshold?: number;
}

const ACTION_WIDTH = 72;
const VELOCITY_THRESHOLD = 0.3;

export default function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
  threshold = 0.35,
}: SwipeableRowProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const startTimeRef = useRef(0);
  const isSwipingRef = useRef(false);
  const directionLockedRef = useRef<"horizontal" | "vertical" | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const maxLeftSwipe = rightActions.length * ACTION_WIDTH;
  const maxRightSwipe = leftActions.length * ACTION_WIDTH;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    currentXRef.current = offsetX;
    startTimeRef.current = Date.now();
    isSwipingRef.current = false;
    directionLockedRef.current = null;
  }, [offsetX]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const deltaX = touch.clientX - startXRef.current;
    const deltaY = touch.clientY - startYRef.current;

    if (!directionLockedRef.current) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        directionLockedRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
      }
      return;
    }

    if (directionLockedRef.current === "vertical") return;

    e.preventDefault();

    if (!isSwipingRef.current) {
      isSwipingRef.current = true;
      setIsSwiping(true);
    }

    let newOffset = currentXRef.current + deltaX;

    if (rightActions.length === 0 && newOffset < 0) newOffset = 0;
    if (leftActions.length === 0 && newOffset > 0) newOffset = 0;

    const resistance = 0.3;
    if (newOffset < -maxLeftSwipe) {
      newOffset = -maxLeftSwipe + (newOffset + maxLeftSwipe) * resistance;
    }
    if (newOffset > maxRightSwipe) {
      newOffset = maxRightSwipe + (newOffset - maxRightSwipe) * resistance;
    }

    setOffsetX(newOffset);
  }, [leftActions.length, rightActions.length, maxLeftSwipe, maxRightSwipe]);

  const handleTouchEnd = useCallback(() => {
    if (!isSwipingRef.current) return;

    setIsSwiping(false);
    isSwipingRef.current = false;
    directionLockedRef.current = null;

    const elapsed = Date.now() - startTimeRef.current;
    const velocity = Math.abs(offsetX - currentXRef.current) / elapsed;
    const isQuickSwipe = velocity > VELOCITY_THRESHOLD;

    let snapTo = 0;

    if (offsetX < 0 && rightActions.length > 0) {
      if (isQuickSwipe || Math.abs(offsetX) > maxLeftSwipe * threshold) {
        snapTo = -maxLeftSwipe;
      }
    } else if (offsetX > 0 && leftActions.length > 0) {
      if (isQuickSwipe || offsetX > maxRightSwipe * threshold) {
        snapTo = maxRightSwipe;
      }
    }

    setOffsetX(snapTo);
  }, [offsetX, leftActions.length, rightActions.length, maxLeftSwipe, maxRightSwipe, threshold]);

  const handleActionClick = useCallback((action: SwipeAction) => {
    action.onClick();
    setOffsetX(0);
  }, []);

  const hasActions = leftActions.length > 0 || rightActions.length > 0;
  if (!hasActions) return <>{children}</>;

  return (
    <>
      <div className="hidden md:block" data-testid="swipeable-row-desktop">
        {children}
      </div>
      <div className="relative overflow-hidden rounded-md md:hidden" data-testid="swipeable-row">
        {leftActions.length > 0 && (
          <div
            className="absolute left-0 top-0 bottom-0 flex items-stretch"
            style={{ width: maxRightSwipe }}
          >
            {leftActions.map((action, i) => (
              <button
                key={i}
                className={`flex flex-col items-center justify-center gap-0.5 text-white text-[10px] font-medium ${action.color}`}
                style={{ width: ACTION_WIDTH }}
                onClick={() => handleActionClick(action)}
                data-testid={action.testId}
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}

        {rightActions.length > 0 && (
          <div
            className="absolute right-0 top-0 bottom-0 flex items-stretch"
            style={{ width: maxLeftSwipe }}
          >
            {rightActions.map((action, i) => (
              <button
                key={i}
                className={`flex flex-col items-center justify-center gap-0.5 text-white text-[10px] font-medium ${action.color}`}
                style={{ width: ACTION_WIDTH }}
                onClick={() => handleActionClick(action)}
                data-testid={action.testId}
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}

        <div
          ref={contentRef}
          className="relative bg-background z-10"
          style={{
            transform: `translateX(${offsetX}px)`,
            transition: isSwiping ? "none" : "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            touchAction: "pan-y",
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {children}
        </div>
      </div>
    </>
  );
}
