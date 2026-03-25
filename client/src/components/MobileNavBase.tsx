import { useState, useRef, useEffect, useCallback, type LucideIcon } from "react";
import { Link, useLocation } from "wouter";
import { MoreHorizontal, X } from "lucide-react";
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

function generateBlobPath(w: number, h: number, neck: number, vel: number): string {
  if (w < 2 || h < 2) return "M 0,0 Z";

  const ry = h / 2;

  if (neck < 0.01) {
    const r = Math.min(ry, w / 2);
    return `M ${r},0 L ${w - r},0 A ${r},${ry} 0 0 1 ${w - r},${h} L ${r},${h} A ${r},${ry} 0 0 1 ${r},0 Z`;
  }

  const r = Math.min(ry, w / 4);
  const neckDepth = ry * neck * 0.75;

  const velShift = clamp(vel / 800, -0.12, 0.12);
  const midX = w / 2 + w * velShift;

  const cp1x = lerp(r * 1.2, midX, 0.5);
  const cp2x = lerp(midX, w - r * 1.2, 0.5);

  return [
    `M ${r.toFixed(1)},0`,
    `C ${cp1x.toFixed(1)},${neckDepth.toFixed(1)} ${cp2x.toFixed(1)},${neckDepth.toFixed(1)} ${(w - r).toFixed(1)},0`,
    `A ${r.toFixed(1)},${ry.toFixed(1)} 0 0 1 ${(w - r).toFixed(1)},${h.toFixed(1)}`,
    `C ${cp2x.toFixed(1)},${(h - neckDepth).toFixed(1)} ${cp1x.toFixed(1)},${(h - neckDepth).toFixed(1)} ${r.toFixed(1)},${h.toFixed(1)}`,
    `A ${r.toFixed(1)},${ry.toFixed(1)} 0 0 1 ${r.toFixed(1)},0`,
    "Z",
  ].join(" ");
}

const DRAG_THRESHOLD = 8;

const snapSpring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.8,
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

  const containerRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const totalItems = mainNavItems.length + 1;
  const cachedHeight = useRef(48);

  const blobX = useMotionValue(0);
  const blobW = useMotionValue(72);
  const blobNeck = useMotionValue(0);

  const springX = useSpring(blobX, snapSpring);
  const springW = useSpring(blobW, snapSpring);
  const springNeck = useSpring(blobNeck, { stiffness: 450, damping: 25, mass: 0.5 });

  const rawVelocity = useMotionValue(0);
  const smoothVelocity = useSpring(rawVelocity, { stiffness: 300, damping: 30 });

  const scaleX = useTransform(smoothVelocity, (v) => 1 + Math.min(Math.abs(v) / 900, 0.12));
  const scaleY = useTransform(smoothVelocity, (v) => 1 - Math.min(Math.abs(v) / 1100, 0.08));

  const pointerDown = useRef(false);
  const hasDragged = useRef(false);
  const dragStartX = useRef(0);
  const dragStartBlobX = useRef(0);
  const lastDragX = useRef(0);
  const lastDragTime = useRef(0);
  const pointerId = useRef<number | null>(null);

  const updateClipPath = useCallback(() => {
    const el = glassRef.current;
    if (!el) return;
    const w = springW.get();
    const neck = springNeck.get();
    const vel = smoothVelocity.get();
    const h = cachedHeight.current;
    el.style.clipPath = `path('${generateBlobPath(w, h, neck, vel)}')`;
  }, [springW, springNeck, smoothVelocity]);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateClipPath(); });
    };

    const unsubs = [
      springW.on("change", schedule),
      springNeck.on("change", schedule),
      smoothVelocity.on("change", schedule),
    ];

    requestAnimationFrame(() => {
      if (glassRef.current) cachedHeight.current = glassRef.current.offsetHeight;
      updateClipPath();
    });

    return () => { unsubs.forEach((fn) => fn()); if (raf) cancelAnimationFrame(raf); };
  }, [springW, springNeck, smoothVelocity, updateClipPath]);

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
    blobNeck.set(0);
    rawVelocity.set(0);
  }, [getItemMeasurements, blobX, blobW, blobNeck, rawVelocity]);

  useEffect(() => {
    const activeIdx = getActiveIndex();
    if (activeIdx >= 0) {
      const measurements = getItemMeasurements();
      const m = measurements[activeIdx];
      if (m) {
        springX.jump(m.x);
        springW.jump(m.width);
        springNeck.jump(0);
        blobX.set(m.x);
        blobW.set(m.width);
        blobNeck.set(0);
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
    const refW = blobW.get() || 72;
    const targetCenter = clampedX + refW / 2;

    let srcIdx = 0;
    let tgtIdx = 0;

    for (let i = 0; i < measurements.length - 1; i++) {
      if (targetCenter >= measurements[i].center && targetCenter <= measurements[i + 1].center) {
        srcIdx = i;
        tgtIdx = i + 1;
        break;
      }
    }

    if (targetCenter <= measurements[0].center) {
      srcIdx = 0;
      tgtIdx = 0;
    } else if (targetCenter >= measurements[measurements.length - 1].center) {
      srcIdx = measurements.length - 1;
      tgtIdx = measurements.length - 1;
    }

    const mA = measurements[srcIdx];
    const mB = measurements[tgtIdx];

    if (srcIdx === tgtIdx) {
      blobX.set(mA.x);
      blobW.set(mA.width);
      blobNeck.set(0);
    } else {
      const range = mB.center - mA.center;
      const progress = range > 0 ? clamp((targetCenter - mA.center) / range, 0, 1) : 0;

      const left = mA.x;
      const right = mB.x + mB.width;
      blobX.set(left);
      blobW.set(right - left);

      const gap = mB.x - (mA.x + mA.width);
      const distFactor = clamp(gap / 80, 0, 1);
      const progressFactor = 1 - Math.pow(Math.abs(2 * progress - 1), 1.5);
      blobNeck.set(distFactor * progressFactor * 0.85);
    }
  }, [getItemMeasurements, blobX, blobW, blobNeck, rawVelocity]);

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
    boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
  };

  return (
    <>
      <AnimatePresence>
        {isMoreOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMoreOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            data-testid={`${testIdPrefix}-mobile-nav-overlay`}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMoreOpen && (
          <motion.div
            className="fixed z-50 border border-border rounded-2xl shadow-lg p-2 min-w-[180px] md:hidden floating-nav-menu"
            style={{
              bottom: "calc(80px + env(safe-area-inset-bottom, 16px))",
              right: "20px",
            }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            data-testid={`${testIdPrefix}-mobile-nav-more-menu`}
          >
            <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">
                {t("common", "moreOptions")}
              </span>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="p-1 rounded hover-elevate"
                data-testid={`button-close-${testIdPrefix}-more-menu`}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            {moreMenuItems.map((item) => {
              const isActive =
                location === item.url || location.startsWith(item.url);
              return (
                <button
                  key={item.url}
                  onClick={() => handleMoreItemClick(item.url)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors ${
                    isActive
                      ? "text-primary font-semibold"
                      : "text-foreground hover-elevate"
                  }`}
                  data-testid={`${testIdPrefix}-mobile-nav-more-${item.url.split("/").pop()}`}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="text-sm font-semibold">{item.title}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <nav
        className="md:hidden floating-nav"
        style={navStyle}
        data-testid={`${testIdPrefix}-mobile-nav`}
      >
        <div
          className="flex items-stretch relative"
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: "none" }}
        >
          {activeIndex >= 0 && (
            <motion.div
              ref={glassRef}
              className="liquid-metaball"
              style={{
                x: springX,
                width: springW,
                scaleX,
                scaleY,
              }}
            >
              <div className="liquid-metaball-glow" />
              <div className="liquid-metaball-shine" />
            </motion.div>
          )}

          {mainNavItems.map((item, index) => {
            const isActive =
              item.url === rootPath
                ? location === rootPath
                : location.startsWith(item.url);
            const badgeCount = item.hasBadge ? getBadgeCount(item.url) : 0;

            return (
              <Link
                key={item.url}
                href={item.url}
                ref={(el: HTMLAnchorElement | null) => {
                  itemRefs.current[index] = el;
                }}
                className={`flex-1 flex flex-col items-center justify-center gap-1 relative z-10 py-3 select-none ${
                  isActive ? "nav-item-active" : "nav-item-inactive"
                }`}
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
            className={`flex-1 flex flex-col items-center justify-center gap-1 relative z-10 py-3 select-none ${
              isMoreActive || isMoreOpen
                ? "nav-item-active"
                : "nav-item-inactive"
            }`}
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
