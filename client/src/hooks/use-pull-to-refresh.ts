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
      pullingRef.current = false;
    },
    [isRefreshing, getScrollEl]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (isRefreshing) return;
      const scrollEl = getScrollEl();
      if (!scrollEl || scrollEl.scrollTop > 0) return;

      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY < 0) return;

      if (!pullingRef.current && deltaY > 10) {
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
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const indicatorStyle = {
    transform: `translateY(${pullDistance}px)`,
    transition: isPulling && pullingRef.current ? "none" : "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  };

  const progress = Math.min(pullDistance / threshold, 1);

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    isPulling,
    indicatorStyle,
    progress,
  };
}
