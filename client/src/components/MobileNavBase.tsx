import { useState, useRef, useEffect, useCallback, type LucideIcon } from "react";
import { Link, useLocation } from "wouter";
import { MoreHorizontal, X } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion";

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

const springConfig = { stiffness: 300, damping: 25, mass: 0.8 };

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
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const totalItems = mainNavItems.length + 1;

  const indicatorX = useMotionValue(0);
  const indicatorWidth = useMotionValue(0);
  const springX = useSpring(indicatorX, springConfig);
  const springWidth = useSpring(indicatorWidth, springConfig);

  const scaleX = useTransform(springX, (latest) => {
    const target = indicatorX.get();
    const diff = Math.abs(latest - target);
    return 1 + Math.min(diff / 400, 0.05);
  });

  const scaleY = useTransform(scaleX, (sx) => {
    return 1 - (sx - 1) * 0.6;
  });

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

  const updateIndicator = useCallback(() => {
    const activeIdx = getActiveIndex();
    if (activeIdx < 0 || !containerRef.current) return;
    const el = itemRefs.current[activeIdx];
    if (!el) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    indicatorX.set(elRect.left - containerRect.left);
    indicatorWidth.set(elRect.width);
  }, [getActiveIndex, indicatorX, indicatorWidth]);

  useEffect(() => {
    updateIndicator();
  }, [location, isMoreOpen, updateIndicator]);

  useEffect(() => {
    const frame = requestAnimationFrame(updateIndicator);
    return () => cancelAnimationFrame(frame);
  }, [updateIndicator]);

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
              style={{
                x: springX,
                width: springWidth,
                scaleX,
                scaleY,
              }}
              layout
              transition={springConfig}
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
                className={`flex-1 flex flex-col items-center justify-center gap-1 relative z-10 transition-all duration-200 py-3 ${
                  isActive ? "nav-item-active" : "nav-item-inactive"
                }`}
                data-testid={`${testIdPrefix}-mobile-nav-${item.url.split("/").pop()}`}
              >
                <motion.div
                  className="relative inline-flex items-center justify-center"
                  whileTap={{ scale: 0.9 }}
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
            className={`flex-1 flex flex-col items-center justify-center gap-1 relative z-10 transition-all duration-200 py-3 ${
              isMoreActive || isMoreOpen
                ? "nav-item-active"
                : "nav-item-inactive"
            }`}
            data-testid={`${testIdPrefix}-mobile-nav-more`}
          >
            <motion.div
              className="relative inline-flex items-center justify-center"
              whileTap={{ scale: 0.9 }}
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
