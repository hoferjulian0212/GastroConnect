import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, MessageSquare, Package, ClipboardList, MoreHorizontal, AlertCircle, Settings, X, FileText, Store, Tag } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useChat } from "@/context/ChatContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useQuery } from "@tanstack/react-query";

export function SupplierMobileNav() {
  const [location, setLocation] = useLocation();
  const { currentUser } = useUser();
  const { isInChat } = useChat();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const mainNavItems = [
    { title: t("common", "home"), url: "/supplier", icon: Home },
    { title: t("common", "products"), url: "/supplier/products", icon: Package },
    { title: t("common", "messages"), url: "/supplier/inbox", icon: MessageSquare, hasBadge: true },
    { title: t("common", "orders"), url: "/supplier/orders", icon: ClipboardList, hasBadge: true },
  ];

  const moreMenuItems = [
    { title: t("common", "restaurants"), url: "/supplier/restaurants", icon: Store },
    { title: t("common", "promotions"), url: "/supplier/promotions", icon: Tag },
    { title: t("common", "complaints"), url: "/supplier/complaints", icon: AlertCircle },
    { title: t("common", "documents"), url: "/supplier/documents", icon: FileText },
    { title: t("common", "settings"), url: "/supplier/settings", icon: Settings },
  ];

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: [`/api/conversations/unread?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: pendingOrders } = useQuery<{ count: number }>({
    queryKey: [`/api/orders/pending-count?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  if (isInChat) return null;

  const getBadgeCount = (url: string) => {
    if (url === "/supplier/inbox") return unreadCount?.count || 0;
    if (url === "/supplier/orders") return pendingOrders?.count || 0;
    return 0;
  };

  const isMoreActive = moreMenuItems.some(item => location === item.url || location.startsWith(item.url));

  const handleMoreItemClick = (url: string) => {
    setIsMoreOpen(false);
    setLocation(url);
  };

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
      {isMoreOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsMoreOpen(false)}
          data-testid="mobile-nav-overlay"
        />
      )}
      
      {isMoreOpen && (
        <div className="fixed z-50 border border-border rounded-2xl shadow-lg p-2 min-w-[180px] md:hidden floating-nav-menu" style={{ bottom: "calc(80px + env(safe-area-inset-bottom, 16px))", right: "20px" }} data-testid="mobile-nav-more-menu">
          <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground">{t("common", "moreOptions")}</span>
            <button 
              onClick={() => setIsMoreOpen(false)}
              className="p-1 rounded hover-elevate"
              data-testid="button-close-more-menu"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          {moreMenuItems.map((item) => {
            const isActive = location === item.url || location.startsWith(item.url);
            return (
              <button
                key={item.url}
                onClick={() => handleMoreItemClick(item.url)}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-left transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "hover-elevate"
                }`}
                data-testid={`mobile-nav-more-${item.url.split('/').pop()}`}
              >
                <item.icon className="h-4 w-4" />
                <span className="text-sm font-medium">{item.title}</span>
              </button>
            );
          })}
        </div>
      )}

      <nav className="md:hidden floating-nav" style={navStyle} data-testid="supplier-mobile-nav">
        <div className="flex items-stretch">
          {mainNavItems.map((item) => {
            const isActive = location === item.url || 
              (item.url !== "/supplier" && location.startsWith(item.url));
            const badgeCount = item.hasBadge ? getBadgeCount(item.url) : 0;

            return (
              <Link
                key={item.url}
                href={item.url}
                className="flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors py-3"
                style={{ color: isActive ? "#4285F4" : "#8E8E93" }}
                data-testid={`mobile-nav-${item.url.split('/').pop()}`}
              >
                <div className="relative inline-flex items-center justify-center">
                  <item.icon className="h-5 w-5" />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-medium">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium text-center w-full">
                  {item.title}
                </span>
              </Link>
            );
          })}
          
          <button
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            className="flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors py-3"
            style={{ color: (isMoreActive || isMoreOpen) ? "#4285F4" : "#8E8E93" }}
            data-testid="mobile-nav-more"
          >
            <div className="relative inline-flex items-center justify-center">
              <MoreHorizontal className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-medium text-center w-full">
              {t("common", "more")}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
