import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, MessageSquare, Package, ShoppingCart, MoreHorizontal, ShoppingBag, History, AlertCircle, Settings, X } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useChat } from "@/context/ChatContext";
import { useQuery } from "@tanstack/react-query";

const mainNavItems = [
  { title: "Übersicht", url: "/restaurant", icon: Home },
  { title: "Nachrichten", url: "/restaurant/inbox", icon: MessageSquare, hasBadge: true },
  { title: "Produkte", url: "/restaurant/catalog", icon: Package },
  { title: "Warenkorb", url: "/restaurant/cart", icon: ShoppingCart, hasBadge: true },
];

const moreMenuItems = [
  { title: "Bestellungen", url: "/restaurant/orders", icon: ShoppingBag },
  { title: "Historie", url: "/restaurant/history", icon: History },
  { title: "Reklamationen", url: "/restaurant/complaints", icon: AlertCircle },
  { title: "Einstellungen", url: "/restaurant/settings", icon: Settings },
];

export function RestaurantMobileNav() {
  const [location, setLocation] = useLocation();
  const { currentUser } = useUser();
  const { isInChat } = useChat();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: [`/api/conversations/unread?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: cartCount } = useQuery<{ count: number }>({
    queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  if (isInChat) return null;

  const getBadgeCount = (url: string) => {
    if (url === "/restaurant/inbox") return unreadCount?.count || 0;
    if (url === "/restaurant/cart") return cartCount?.count || 0;
    return 0;
  };

  const isMoreActive = moreMenuItems.some(item => location === item.url || location.startsWith(item.url));

  const handleMoreItemClick = (url: string) => {
    setIsMoreOpen(false);
    setLocation(url);
  };

  return (
    <>
      {isMoreOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={() => setIsMoreOpen(false)}
          data-testid="restaurant-mobile-nav-overlay"
        />
      )}
      
      {isMoreOpen && (
        <div className="fixed bottom-16 right-2 z-50 bg-background border border-border rounded-lg shadow-lg p-2 min-w-[180px] md:hidden" data-testid="restaurant-mobile-nav-more-menu">
          <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground">Weitere Optionen</span>
            <button 
              onClick={() => setIsMoreOpen(false)}
              className="p-1 rounded hover-elevate"
              data-testid="button-close-restaurant-more-menu"
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
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-left transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "hover-elevate"
                }`}
                data-testid={`restaurant-mobile-nav-more-${item.url.split('/').pop()}`}
              >
                <item.icon className="h-4 w-4" />
                <span className="text-sm font-medium">{item.title}</span>
              </button>
            );
          })}
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border md:hidden">
        <div className="flex items-center justify-around h-16 px-2">
          {mainNavItems.map((item) => {
            const isActive = location === item.url || 
              (item.url !== "/restaurant" && location.startsWith(item.url));
            const badgeCount = item.hasBadge ? getBadgeCount(item.url) : 0;

            return (
              <Link
                key={item.url}
                href={item.url}
                className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg min-w-[60px] relative transition-colors ${
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground"
                }`}
                data-testid={`restaurant-mobile-nav-${item.url.split('/').pop()}`}
              >
                <div className="relative">
                  <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-medium">
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-medium ${isActive ? "text-primary" : ""}`}>
                  {item.title}
                </span>
              </Link>
            );
          })}
          
          <button
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg min-w-[60px] relative transition-colors ${
              isMoreActive || isMoreOpen
                ? "text-primary" 
                : "text-muted-foreground"
            }`}
            data-testid="restaurant-mobile-nav-more"
          >
            <MoreHorizontal className={`h-5 w-5 ${isMoreActive || isMoreOpen ? "text-primary" : ""}`} />
            <span className={`text-[10px] font-medium ${isMoreActive || isMoreOpen ? "text-primary" : ""}`}>
              Mehr
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
