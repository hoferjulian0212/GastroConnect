import { useState, useRef, useEffect, useCallback, type LucideIcon } from "react";
import { Link, useLocation } from "wouter";
import { MoreHorizontal, X, ChevronRight } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  hasBadge?: boolean;
}

interface MobileNavBaseProps {
  mainNavItems: NavItem[];
  moreMenuItems: NavItem[];
  getBadgeCount: (url: string) => number;
  rootPath: string;
  testIdPrefix: string;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function fmt(n: number): string {
  return n.toFixed(1);
}

function generateDropletPath(w: number, h: number, vel: number, oy: number = 0): string {
  if (w < 2 || h < 2) return "M 0,0 Z";

  const cy = h / 2;
  const absVel = Math.abs(vel);
  const d = Math.min(absVel / 320, 0.8);

  const squeeze = d * cy * 0.35;
  const narrow = d * Math.min(cy, w * 0.42) * 0.28;

  const k = 0.6;
  const R = Math.min(cy, w * 0.48);

  const leftSqueeze = vel > 0 ? squeeze : 0;
  const leftNarrow = vel > 0 ? narrow : 0;
  const rightSqueeze = vel < 0 ? squeeze : 0;
  const rightNarrow = vel < 0 ? narrow : 0;

  const Rl = vel > 0 ? R * (1 - d * 0.15) : R;
  const Rr = vel < 0 ? R * (1 - d * 0.15) : R;

  const tlY = leftSqueeze + oy;
  const blY = h - leftSqueeze + oy;
  const trY = rightSqueeze + oy;
  const brY = h - rightSqueeze + oy;
  const midY = cy + oy;
  const lX = leftNarrow;
  const rX = w - rightNarrow;

  return [
    `M ${fmt(Rl)},${fmt(tlY)}`,
    `L ${fmt(w - Rr)},${fmt(trY)}`,
    `C ${fmt(w - Rr + Rr * k)},${fmt(trY)} ${fmt(rX)},${fmt(lerp(trY, midY, k))} ${fmt(rX)},${fmt(midY)}`,
    `C ${fmt(rX)},${fmt(lerp(midY, brY, 1 - k))} ${fmt(w - Rr + Rr * k)},${fmt(brY)} ${fmt(w - Rr)},${fmt(brY)}`,
    `L ${fmt(Rl)},${fmt(blY)}`,
    `C ${fmt(Rl - Rl * k)},${fmt(blY)} ${fmt(lX)},${fmt(lerp(midY, blY, 1 - k))} ${fmt(lX)},${fmt(midY)}`,
    `C ${fmt(lX)},${fmt(lerp(tlY, midY, k))} ${fmt(Rl - Rl * k)},${fmt(tlY)} ${fmt(Rl)},${fmt(tlY)}`,
    "Z",
  ].join(" ");
}

const DRAG_THRESHOLD = 6;

const snapSpring = {
  type: "spring" as const,
  stiffness: 380,
  damping: 30,
  mass: 0.7,
};

export function MobileNavBase({
  mainNavItems,
  moreMenuItems,
  getBadgeCount,
  rootPath,
  testIdPrefix,
}: MobileNavBaseProps) {
  const [location, setLocation] = useLocation();
  const { isInChat } = useChat();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [navWidth, setNavWidth] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const activeOverlayRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const totalItems = mainNavItems.length + 1;
  const cachedHeight = useRef(48);

  const blobX = useMotionValue(0);
  const blobW = useMotionValue(72);

  const springX = useSpring(blobX, snapSpring);
  const springW = useSpring(blobW, snapSpring);

  const rawVelocity = useMotionValue(0);
  const smoothVelocity = useSpring(rawVelocity, { stiffness: 220, damping: 20, mass: 0.6 });

  const negSpringX = useTransform(springX, (v) => -v);

  const pointerDown = useRef(false);
  const hasDragged = useRef(false);
  const dragStartX = useRef(0);
  const dragStartBlobX = useRef(0);
  const lastDragX = useRef(0);
  const lastDragTime = useRef(0);
  const pointerId = useRef<number | null>(null);

  const updateClipPath = useCallback(() => {
    const w = springW.get();
    const vel = smoothVelocity.get();
    const h = cachedHeight.current;
    const blobPath = generateDropletPath(w, h, vel);
    if (glassRef.current) glassRef.current.style.clipPath = `path('${blobPath}')`;
    const overlayPath = generateDropletPath(w, h, vel, 4);
    if (activeOverlayRef.current) activeOverlayRef.current.style.clipPath = `path('${overlayPath}')`;
  }, [springW, smoothVelocity]);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateClipPath(); });
    };

    const unsubs = [
      springW.on("change", schedule),
      smoothVelocity.on("change", schedule),
    ];

    requestAnimationFrame(() => {
      if (glassRef.current) cachedHeight.current = glassRef.current.offsetHeight;
      if (containerRef.current) setNavWidth(containerRef.current.offsetWidth);
      updateClipPath();
    });

    return () => { unsubs.forEach((fn) => fn()); if (raf) cancelAnimationFrame(raf); };
  }, [springW, smoothVelocity, updateClipPath]);

  const isMoreActive = moreMenuItems.some(
    (item) => location === item.url || location.startsWith(item.url)
  );

  const getActiveIndex = useCallback(() => {
    for (let i = 0; i < mainNavItems.length; i++) {
      const item = mainNavItems[i];
      if (item.url === rootPath && location === rootPath) return i;
      if (item.url !== rootPath && location.startsWith(item.url)) return i;
    }
    if (isMoreActive || isMoreOpen) return mainNavItems.length;
    return location === rootPath ? 0 : -1;
  }, [location, mainNavItems, rootPath, isMoreActive, isMoreOpen]);

  const getItemMeasurements = useCallback(() => {
    if (!containerRef.current) return [];
    const containerRect = containerRef.current.getBoundingClientRect();
    return itemRefs.current.map((el) => {
      if (!el) return { x: 0, width: 0, center: 0 };
      const rect = el.getBoundingClientRect();
      const x = rect.left - containerRect.left;
      const width = rect.width;
      return { x, width, center: x + width / 2 };
    });
  }, []);

  const snapToIndex = useCallback((idx: number) => {
    const measurements = getItemMeasurements();
    if (idx < 0 || idx >= measurements.length) return;
    const m = measurements[idx];
    if (!m) return;
    blobX.set(m.x);
    blobW.set(m.width);
    rawVelocity.set(0);
  }, [getItemMeasurements, blobX, blobW, rawVelocity]);

  useEffect(() => {
    const activeIdx = getActiveIndex();
    if (activeIdx >= 0) {
      const measurements = getItemMeasurements();
      const m = measurements[activeIdx];
      if (m) {
        springX.jump(m.x);
        springW.jump(m.width);
        blobX.set(m.x);
        blobW.set(m.width);
      }
    }
  }, []);

  useEffect(() => {
    const activeIdx = getActiveIndex();
    if (activeIdx >= 0 && !pointerDown.current) {
      requestAnimationFrame(() => snapToIndex(activeIdx));
    }
  }, [location, isMoreOpen, getActiveIndex, snapToIndex]);

  useEffect(() => {
    const handleResize = () => {
      if (glassRef.current) cachedHeight.current = glassRef.current.offsetHeight;
      if (containerRef.current) setNavWidth(containerRef.current.offsetWidth);
      const activeIdx = getActiveIndex();
      if (activeIdx >= 0) requestAnimationFrame(() => {
        snapToIndex(activeIdx);
        updateClipPath();
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getActiveIndex, snapToIndex, updateClipPath]);

  const interpolateIndicator = useCallback((clientX: number) => {
    const measurements = getItemMeasurements();
    if (measurements.length === 0) return;

    const now = Date.now();
    const dt = Math.max(now - lastDragTime.current, 1);
    const instantVelocity = ((clientX - lastDragX.current) / dt) * 16;
    rawVelocity.set(instantVelocity);
    lastDragX.current = clientX;
    lastDragTime.current = now;

    const dx = clientX - dragStartX.current;
    const targetX = dragStartBlobX.current + dx;
    const firstM = measurements[0];
    const lastM = measurements[measurements.length - 1];
    if (!firstM || !lastM) return;

    const clampedX = clamp(targetX, firstM.x, lastM.x);
    blobX.set(clampedX);
  }, [getItemMeasurements, blobX, rawVelocity]);

  const snapToClosest = useCallback(() => {
    const measurements = getItemMeasurements();
    if (measurements.length === 0) return -1;

    const currentCenter = blobX.get() + blobW.get() / 2;
    let closestIdx = 0;
    let closestDist = Infinity;

    for (let i = 0; i < measurements.length; i++) {
      const dist = Math.abs(currentCenter - measurements[i].center);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    rawVelocity.set(0);
    snapToIndex(closestIdx);
    return closestIdx;
  }, [getItemMeasurements, blobX, blobW, snapToIndex, rawVelocity]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerDown.current = true;
    hasDragged.current = false;
    dragStartX.current = e.clientX;
    dragStartBlobX.current = blobX.get();
    lastDragX.current = e.clientX;
    lastDragTime.current = Date.now();
    pointerId.current = e.pointerId;
  }, [blobX]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerDown.current) return;
    const dx = Math.abs(e.clientX - dragStartX.current);
    if (!hasDragged.current && dx < DRAG_THRESHOLD) return;
    if (!hasDragged.current) {
      hasDragged.current = true;
      try { containerRef.current?.setPointerCapture(e.pointerId); } catch {}
    }
    e.preventDefault();
    interpolateIndicator(e.clientX);
  }, [interpolateIndicator]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointerDown.current) return;
    pointerDown.current = false;
    try { containerRef.current?.releasePointerCapture(e.pointerId); } catch {}
    if (hasDragged.current) {
      e.preventDefault();
      e.stopPropagation();
      const closestIdx = snapToClosest();
      if (closestIdx >= 0) {
        if (closestIdx < mainNavItems.length) {
          setLocation(mainNavItems[closestIdx].url);
        } else {
          setIsMoreOpen(true);
        }
      }
    }
    hasDragged.current = false;
    pointerId.current = null;
  }, [snapToClosest, mainNavItems, setLocation]);

  useEffect(() => {
    if (isMoreOpen) setIsMoreOpen(false);
  }, [location]);

  const handleMoreItemClick = (url: string) => {
    setIsMoreOpen(false);
    setLocation(url);
  };

  if (isInChat) return null;

  const activeIndex = getActiveIndex();

  const navStyle: React.CSSProperties = {
    position: "fixed",
    bottom: "max(8px, env(safe-area-inset-bottom, 8px))",
    left: 12,
    right: 12,
    zIndex: 50,
    borderRadius: "9999px",
  };

  return (
    <>
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute", overflow: "hidden" }}>
        <defs>
          <filter id="liquid-glass-refraction" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.008 0.008"
              numOctaves="2"
              seed="42"
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation="2" result="smoothNoise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="smoothNoise"
              scale="18"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <AnimatePresence>
        {isMoreOpen && (
          <motion.div
            className="fixed inset-0 z-[60] md:hidden bg-background"
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.8 }}
            data-testid={`${testIdPrefix}-mobile-nav-more-menu`}
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))] pb-3">
                <h2 className="text-lg font-semibold text-foreground">
                  {t("common", "more")}
                </h2>
                <button
                  onClick={() => setIsMoreOpen(false)}
                  className="p-2 -mr-2 rounded-full hover:bg-muted/60 transition-colors"
                  data-testid={`button-close-${testIdPrefix}-more-menu`}
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-[calc(80px+env(safe-area-inset-bottom,16px))]">
                <div className="space-y-1">
                  {moreMenuItems.map((item) => {
                    const isActive =
                      location === item.url || location.startsWith(item.url);
                    return (
                      <button
                        key={item.url}
                        onClick={() => handleMoreItemClick(item.url)}
                        className={`flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl text-left transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-muted/50 active:bg-muted/70"
                        }`}
                        data-testid={`${testIdPrefix}-mobile-nav-more-${item.url.split("/").pop()}`}
                      >
                        <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${
                          isActive ? "bg-primary/15" : "bg-muted/60"
                        }`}>
                          <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <span className={`flex-1 text-[15px] ${isActive ? "font-semibold" : "font-medium"}`}>
                          {item.title}
                        </span>
                        <ChevronRight className={`h-4 w-4 ${isActive ? "text-primary/50" : "text-muted-foreground/40"}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav
        className="md:hidden floating-nav"
        style={navStyle}
        data-testid={`${testIdPrefix}-mobile-nav`}
      >
        <div className="lg-blur-layer" />
        <div className="lg-tint-layer" />
        <div className="lg-specular-layer" />
        <div className="lg-rim-highlight" />

        <div
          className="flex items-stretch relative overflow-hidden"
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: "none", zIndex: 10, borderRadius: "inherit" }}
        >
          {activeIndex >= 0 && (
            <>
              <motion.div
                ref={glassRef}
                className="liquid-metaball"
                style={{
                  x: springX,
                  width: springW,
                }}
              >
                <div className="liquid-metaball-glow" />
                <div className="liquid-metaball-shine" />
                <div className="liquid-metaball-rim" />
              </motion.div>

              <motion.div
                ref={activeOverlayRef}
                className="active-items-overlay"
                style={{
                  x: springX,
                  width: springW,
                }}
              >
                {navWidth > 0 && (
                  <motion.div
                    className="flex items-stretch"
                    style={{
                      x: negSpringX,
                      width: navWidth,
                      height: "100%",
                    }}
                  >
                    {mainNavItems.map((item) => (
                      <div
                        key={item.url}
                        className="flex-1 flex flex-col items-center justify-center gap-1 py-3 nav-item-active"
                      >
                        <div className="inline-flex items-center justify-center">
                          <item.icon className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-medium text-center w-full">
                          {item.title}
                        </span>
                      </div>
                    ))}
                    <div className="flex-1 flex flex-col items-center justify-center gap-1 py-3 nav-item-active">
                      <div className="inline-flex items-center justify-center">
                        <MoreHorizontal className="h-5 w-5" />
                      </div>
                      <span className="text-[10px] font-medium text-center w-full">
                        {t("common", "more")}
                      </span>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </>
          )}

          {mainNavItems.map((item, index) => {
            const badgeCount = item.hasBadge ? getBadgeCount(item.url) : 0;

            return (
              <Link
                key={item.url}
                href={item.url}
                ref={(el: HTMLAnchorElement | null) => {
                  itemRefs.current[index] = el;
                }}
                className="flex-1 flex flex-col items-center justify-center gap-1 relative py-3 select-none nav-item-inactive"
                style={{ zIndex: 5 }}
                data-testid={`${testIdPrefix}-mobile-nav-${item.url.split("/").pop()}`}
              >
                <motion.div
                  className="relative inline-flex items-center justify-center"
                  whileTap={{ scale: 0.92 }}
                  transition={{ duration: 0.1 }}
                >
                  <item.icon className="h-5 w-5" />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-medium">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </motion.div>
                <span className="text-[10px] font-medium text-center w-full">
                  {item.title}
                </span>
              </Link>
            );
          })}

          <button
            ref={(el) => {
              itemRefs.current[totalItems - 1] = el;
            }}
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            className="flex-1 flex flex-col items-center justify-center gap-1 relative py-3 select-none nav-item-inactive"
            style={{ zIndex: 5 }}
            data-testid={`${testIdPrefix}-mobile-nav-more`}
          >
            <motion.div
              className="relative inline-flex items-center justify-center"
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.1 }}
            >
              <MoreHorizontal className="h-5 w-5" />
            </motion.div>
            <span className="text-[10px] font-medium text-center w-full">
              {t("common", "more")}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
