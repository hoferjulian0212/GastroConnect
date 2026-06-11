import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { MoreHorizontal, X, ChevronRight, type LucideIcon } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useScrollCompact } from "@/hooks/use-scroll-compact";
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
  const compact = useScrollCompact();

  const labelClass = `text-[10px] leading-tight text-center w-full overflow-hidden transition-all duration-300 ease-out ${
    compact ? "max-h-0 opacity-0" : "max-h-4 opacity-100"
  }`;
  const itemPadClass = `transition-all duration-300 ease-out ${compact ? "gap-0 py-2" : "gap-1 py-2"}`;

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
                {active && (
                  <motion.span
                    layoutId={`${testIdPrefix}-nav-pill`}
                    className="absolute inset-x-2 inset-y-1 rounded-2xl bg-foreground/[0.08] dark:bg-white/[0.14]"
                    transition={{ type: "spring", stiffness: 480, damping: 38 }}
                  />
                )}
                <motion.div
                  className="relative z-10 inline-flex items-center justify-center"
                  whileTap={{ scale: 0.92 }}
                  transition={{ duration: 0.1 }}
                >
                  <item.icon className={`h-6 w-6 ${active ? "stroke-[2.2]" : "stroke-[1.8]"}`} />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1 -right-2.5 z-10 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground font-semibold">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </motion.div>
                <span className={`relative z-10 ${labelClass} ${active ? "font-semibold" : "font-medium"}`}>
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
            {isMoreActive && (
              <motion.span
                layoutId={`${testIdPrefix}-nav-pill`}
                className="absolute inset-x-2 inset-y-1 rounded-2xl bg-foreground/[0.08] dark:bg-white/[0.14]"
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
              />
            )}
            <motion.div
              className="relative z-10 inline-flex items-center justify-center"
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.1 }}
            >
              <MoreHorizontal className={`h-6 w-6 ${(isMoreActive || isMoreOpen) ? "stroke-[2.2]" : "stroke-[1.8]"}`} />
            </motion.div>
            <span className={`relative z-10 ${labelClass} ${(isMoreActive || isMoreOpen) ? "font-semibold" : "font-medium"}`}>
              {t("common", "more")}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
