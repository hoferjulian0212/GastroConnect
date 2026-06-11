import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { MoreHorizontal, X, ChevronRight, type LucideIcon } from "lucide-react";
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

export interface NavGroup {
  title: string;
  items: NavItem[];
}

interface MobileNavBaseProps {
  mainNavItems: NavItem[];
  moreMenuGroups: NavGroup[];
  getBadgeCount: (url: string) => number;
  rootPath: string;
  testIdPrefix: string;
}

export function MobileNavBase({
  mainNavItems,
  moreMenuGroups,
  getBadgeCount,
  rootPath,
  testIdPrefix,
}: MobileNavBaseProps) {
  const [location, setLocation] = useLocation();
  const { isInChat } = useChat();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    // Mobile-only: don't run scroll tracking on desktop where the nav is hidden.
    const mq = window.matchMedia("(max-width: 767px)");
    let lastY = -1;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = (e: Event) => {
      // Only react to the main app content scroller, not modals/drawers/sheets.
      const target = e.target as HTMLElement;
      if (!(target instanceof HTMLElement) || !target.hasAttribute("data-app-scroll")) return;
      const y = target.scrollTop;
      if (lastY < 0) lastY = y;
      const delta = y - lastY;
      if (y < 24) {
        setCompact(false);
      } else if (delta > 4) {
        setCompact(true);
      } else if (delta < -4) {
        setCompact(false);
      }
      lastY = y;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setCompact(false), 220);
    };
    const attach = () => {
      // Capture phase so we catch scroll on the inner content container
      // (scroll events don't bubble); the app scrolls inside an overflow-auto div.
      window.addEventListener("scroll", onScroll, true);
    };
    const detach = () => {
      window.removeEventListener("scroll", onScroll, true);
      if (idleTimer) clearTimeout(idleTimer);
      setCompact(false);
    };
    const sync = () => {
      if (mq.matches) attach();
      else detach();
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      detach();
    };
  }, []);

  const labelClass = `text-[10px] text-center w-full overflow-hidden transition-all duration-300 ease-out ${
    compact ? "max-h-0 opacity-0" : "max-h-4 opacity-100"
  }`;
  const itemPadClass = `transition-all duration-300 ease-out ${compact ? "gap-0 py-1.5" : "gap-1 py-3"}`;

  const isItemActive = (url: string) => {
    if (url === rootPath) return location === rootPath;
    return location === url || location.startsWith(url + "/") || location.startsWith(url + "?");
  };

  const allMoreItems = moreMenuGroups.flatMap((g) => g.items);
  const isMoreActive = allMoreItems.some((item) => isItemActive(item.url));

  useEffect(() => {
    if (isMoreOpen) setIsMoreOpen(false);
  }, [location]);

  const handleMoreItemClick = (url: string) => {
    setIsMoreOpen(false);
    setLocation(url);
  };

  if (isInChat) return null;

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
                <div className="space-y-6">
                  {moreMenuGroups.map((group) => (
                    <div key={group.title} className="space-y-1">
                      <h3 className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.title}
                      </h3>
                      {group.items.map((item) => {
                        const isActive = isItemActive(item.url);
                        return (
                          <button
                            key={item.url}
                            onClick={() => handleMoreItemClick(item.url)}
                            className={`flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl text-left transition-colors ${
                              isActive
                                ? "bg-foreground/10 text-foreground"
                                : "text-foreground hover:bg-muted/50 active:bg-muted/70"
                            }`}
                            data-testid={`${testIdPrefix}-mobile-nav-more-${item.url.split("/").pop()}`}
                          >
                            <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${
                              isActive ? "bg-foreground/15" : "bg-muted/60"
                            }`}>
                              <item.icon className={`h-5 w-5 ${isActive ? "text-foreground" : "text-muted-foreground"}`} />
                            </div>
                            <span className={`flex-1 text-[15px] ${isActive ? "font-semibold" : "font-medium"}`}>
                              {item.title}
                            </span>
                            <ChevronRight className={`h-4 w-4 ${isActive ? "text-foreground/50" : "text-muted-foreground/40"}`} />
                          </button>
                        );
                      })}
                    </div>
                  ))}
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
        <div
          className="flex items-stretch relative"
          style={{ borderRadius: "inherit" }}
        >
          {mainNavItems.map((item) => {
            const badgeCount = item.hasBadge ? getBadgeCount(item.url) : 0;
            const active = isItemActive(item.url);

            return (
              <Link
                key={item.url}
                href={item.url}
                className={`flex-1 flex flex-col items-center justify-center relative select-none ${itemPadClass} ${
                  active ? "nav-item-active" : "nav-item-inactive"
                }`}
                data-testid={`${testIdPrefix}-mobile-nav-${item.url.split("/").pop()}`}
              >
                <motion.div
                  className="relative inline-flex items-center justify-center"
                  whileTap={{ scale: 0.92 }}
                  transition={{ duration: 0.1 }}
                >
                  {active && (
                    <motion.span
                      layoutId={`${testIdPrefix}-nav-pill`}
                      className="absolute -inset-x-3.5 -inset-y-1.5 rounded-full bg-foreground/[0.10] dark:bg-white/[0.16]"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                    />
                  )}
                  <item.icon className={`relative h-5 w-5 ${active ? "stroke-[2.4]" : "stroke-[2]"}`} />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-medium">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </motion.div>
                <span className={`${labelClass} ${active ? "font-semibold" : "font-medium"}`}>
                  {item.title}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setIsMoreOpen((v) => !v)}
            className={`flex-1 flex flex-col items-center justify-center relative select-none ${itemPadClass} ${
              isMoreActive || isMoreOpen ? "nav-item-active" : "nav-item-inactive"
            }`}
            data-testid={`${testIdPrefix}-mobile-nav-more`}
          >
            <motion.div
              className="relative inline-flex items-center justify-center"
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.1 }}
            >
              {isMoreActive && (
                <motion.span
                  layoutId={`${testIdPrefix}-nav-pill`}
                  className="absolute -inset-x-3.5 -inset-y-1.5 rounded-full bg-foreground/[0.10] dark:bg-white/[0.16]"
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              )}
              <MoreHorizontal className={`relative h-5 w-5 ${(isMoreActive || isMoreOpen) ? "stroke-[2.4]" : "stroke-[2]"}`} />
            </motion.div>
            <span className={`${labelClass} ${(isMoreActive || isMoreOpen) ? "font-semibold" : "font-medium"}`}>
              {t("common", "more")}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
