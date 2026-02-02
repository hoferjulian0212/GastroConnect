import { Link, useLocation } from "wouter";
import { Home, MessageSquare, Package, ClipboardList, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/context/UserContext";
import { useQuery } from "@tanstack/react-query";

const navItems = [
  { title: "Übersicht", url: "/supplier", icon: Home },
  { title: "Nachrichten", url: "/supplier/inbox", icon: MessageSquare, hasBadge: true },
  { title: "Produkte", url: "/supplier/products", icon: Package },
  { title: "Bestellungen", url: "/supplier/orders", icon: ClipboardList, hasBadge: true },
  { title: "Mehr", url: "/supplier/settings", icon: Settings },
];

export function SupplierMobileNav() {
  const [location] = useLocation();
  const { currentUser } = useUser();

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

  const getBadgeCount = (url: string) => {
    if (url === "/supplier/inbox") return unreadCount?.count || 0;
    if (url === "/supplier/orders") return pendingOrders?.count || 0;
    return 0;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = location === item.url || 
            (item.url !== "/supplier" && item.url !== "/supplier/settings" && location.startsWith(item.url));
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
              data-testid={`mobile-nav-${item.url.split('/').pop()}`}
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
      </div>
    </nav>
  );
}
