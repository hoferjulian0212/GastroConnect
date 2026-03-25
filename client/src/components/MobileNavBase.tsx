import { useState, useRef, useEffect, useCallback, type LucideIcon } from "react";
import { Link, useLocation } from "wouter";
import { MoreHorizontal, X } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { motion, AnimatePresence } from "framer-motion";

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

const indicatorSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 28,
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
  const [isMoving, setIsMoving] = useState(false);
  const [indicatorPos, setIndicatorPos] = useState({ x: 0, width: 0 });
  const prevActiveRef = useRef(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const totalItems = mainNavItems.length + 1;

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

  const measureAndUpdate = useCallback(() => {
    const activeIdx = getActiveIndex();
    if (activeIdx < 0 || !containerRef.current) return;
    const el = itemRefs.current[activeIdx];
    if (!el) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const newX = elRect.left - containerRect.left;
    const newWidth = elRect.width;
    setIndicatorPos((prev) => {
      if (Math.abs(prev.x - newX) < 0.5 && Math.abs(prev.width - newWidth) < 0.5) return prev;
      return { x: newX, width: newWidth };
    });
  }, [getActiveIndex]);

  useEffect(() => {
    const activeIdx = getActiveIndex();
    if (activeIdx >= 0 && prevActiveRef.current >= 0 && prevActiveRef.current !== activeIdx) {
      setIsMoving(true);
      const timer = setTimeout(() => setIsMoving(false), 220);
      return () => clearTimeout(timer);
    }
    prevActiveRef.current = activeIdx;
  }, [getActiveIndex, location, isMoreOpen]);

  useEffect(() => {
    prevActiveRef.current = getActiveIndex();
  }, []);

  useEffect(() => {
    measureAndUpdate();
  }, [location, isMoreOpen, measureAndUpdate]);

  useEffect(() => {
    const frame = requestAnimationFrame(measureAndUpdate);
    return () => cancelAnimationFrame(frame);
  }, [measureAndUpdate]);

  useEffect(() => {
    const handleResize = () => measureAndUpdate();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [measureAndUpdate]);

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
        <div className="flex items-stretch relative" ref={containerRef}>
          {activeIndex >= 0 && (
            <motion.div
              className="liquid-indicator"
              animate={{
                x: indicatorPos.x,
                width: indicatorPos.width,
                scaleX: isMoving ? 1.08 : 1,
                scaleY: isMoving ? 0.92 : 1,
              }}
              transition={indicatorSpring}
            />
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
                className={`flex-1 flex flex-col items-center justify-center gap-1 relative z-10 py-3 ${
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
            className={`flex-1 flex flex-col items-center justify-center gap-1 relative z-10 py-3 ${
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
