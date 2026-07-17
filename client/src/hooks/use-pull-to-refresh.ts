import { useRef, useState, useCallback, useEffect } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 70,
  maxPull = 120,
}: UsePullToRefreshOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  // Direction lock: once a gesture is recognized as horizontal (e.g. swiping
  // through the supplier filter chips), pull-to-refresh must stay out of the
  // way for the rest of that gesture — otherwise preventDefault() would freeze
  // the horizontal scroll mid-swipe.
  const horizontalGestureRef = useRef(false);
  const pullingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  // The element that actually scrolls is an ancestor of our wrapper (the
  // app-level scroll container), not the wrapper itself. Resolve it so the
  // "am I at the top?" check is accurate; otherwise we'd hijack every
  // downward swipe and block native scrolling.
  const getScrollEl = useCallback((): HTMLElement | null => {
    if (scrollElRef.current && scrollElRef.current.isConnected) return scrollElRef.current;
    let node: HTMLElement | null = containerRef.current;
    while (node) {
      const appScroll = node.closest<HTMLElement>("[data-app-scroll]");
      if (appScroll) {
        scrollElRef.current = appScroll;
        return appScroll;
      }
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        scrollElRef.current = node;
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (isRefreshing) return;
      const scrollEl = getScrollEl();
      if (!scrollEl || scrollEl.scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      horizontalGestureRef.current = false;
      pullingRef.current = false;
    },
    [isRefreshing, getScrollEl]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (isRefreshing || horizontalGestureRef.current) return;
      const scrollEl = getScrollEl();
      if (!scrollEl || scrollEl.scrollTop > 0) return;

      const deltaY = e.touches[0].clientY - startYRef.current;
      const deltaX = e.touches[0].clientX - startXRef.current;

      // Lock out as soon as the gesture is clearly horizontal, so nested
      // horizontal scrollers (filter chips, tab rows) scroll natively.
      if (!pullingRef.current && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 6) {
        horizontalGestureRef.current = true;
        return;
      }

      if (deltaY < 0) return;

      if (!pullingRef.current && deltaY > 10 && deltaY > Math.abs(deltaX)) {
        pullingRef.current = true;
        setIsPulling(true);
      }

      if (pullingRef.current) {
        e.preventDefault();
        const resistance = 0.45;
        const dist = Math.min(deltaY * resistance, maxPull);
        setPullDistance(dist);
      }
    },
    [isRefreshing, maxPull, getScrollEl]
  );

  const handleTouchCancel = useCallback(() => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    setPullDistance(0);
    setIsPulling(false);
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold * 0.6);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
        setIsPulling(false);
      }
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches || window.matchMedia("(pointer: coarse)").matches;
    if (!isMobile) return;
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", handleTouchCancel);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel]);

  const progress = Math.min(pullDistance / threshold, 1);

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    isPulling,
    progress,
  };
}
