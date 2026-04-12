import { Link, useLocation } from "wouter";
import { Home, MessageSquare, ShoppingBag, Package, Settings, AlertCircle, Truck, FileText, ChevronRight, Calculator } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { useRef, useState, useEffect } from "react";

export function RestaurantSidebar() {
  const [location] = useLocation();
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [pulsingBadge, setPulsingBadge] = useState<string | null>(null);
  const prevCounts = useRef<Record<string, number>>({});

  const mainMenuItems = [
    { title: t("common", "home"), url: "/restaurant", icon: Home },
    { title: t("common", "messages"), url: "/restaurant/inbox", icon: MessageSquare, hasBadge: true },
    { title: t("common", "suppliers"), url: "/restaurant/suppliers", icon: Truck },
    { title: t("common", "products"), url: "/restaurant/catalog", icon: Package },
    { title: t("common", "orders"), url: "/restaurant/orders", icon: ShoppingBag },
    { title: t("common", "complaints"), url: "/restaurant/complaints", icon: AlertCircle },
    { title: t("common", "documents"), url: "/restaurant/documents", icon: FileText },
    { title: t("common", "costAnalysis"), url: "/restaurant/cost-analysis", icon: Calculator },
  ];

  const bottomMenuItems = [
    { title: t("common", "settings"), url: "/restaurant/settings", icon: Settings },
  ];

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: [`/api/conversations/unread?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: cartCount } = useQuery<{ count: number }>({
    queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const getBadgeCount = (url: string) => {
    if (url === "/restaurant/inbox") return unreadCount?.count || 0;
    if (url === "/restaurant/cart") return cartCount?.count || 0;
    return 0;
  };

  useEffect(() => {
    const currentUnread = unreadCount?.count || 0;
    const prevUnread = prevCounts.current["inbox"] ?? 0;
    if (currentUnread > prevUnread && prevCounts.current["inbox"] !== undefined) {
      setPulsingBadge("inbox");
      setTimeout(() => setPulsingBadge(null), 500);
    }
    prevCounts.current["inbox"] = currentUnread;
  }, [unreadCount?.count]);

  const renderMenuItem = (item: typeof mainMenuItems[0], hasBadge?: boolean) => {
    const isActive = location === item.url || 
      (item.url !== "/restaurant" && location.startsWith(item.url));
    const badgeCount = hasBadge ? getBadgeCount(item.url) : 0;
    const isPulsing = item.url === "/restaurant/inbox" && pulsingBadge === "inbox";
    
    return (
      <SidebarMenuItem key={item.url}>
        <Link 
          href={item.url} 
          data-testid={`link-${item.url.split('/').pop()}`}
          className={`flex items-center h-11 rounded-xl px-2 gap-3 transition-all duration-200 text-left text-[13px] ${
            isActive
              ? "text-primary font-semibold"
              : "text-foreground font-normal hover-elevate"
          }`}
        >
          <item.icon className="h-5 w-5" />
          <span className="flex-1">{item.title}</span>
          {badgeCount > 0 && (
            <Badge 
              variant="default" 
              className={`ml-auto text-xs px-2 py-0.5 rounded-full ${isPulsing ? "animate-badge-pulse" : ""}`}
            >
              {badgeCount}
            </Badge>
          )}
        </Link>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="pt-5 pb-3 px-4 space-y-3">
        {currentUser && (
          <Link href="/restaurant/profile" className="flex flex-col items-center gap-2 px-2 py-3 rounded-xl hover-elevate cursor-pointer" data-testid="link-profile">
            <Avatar className="h-16 w-16 rounded-full">
              <AvatarImage src={currentUser.profileImageUrl || undefined} alt={currentUser.name} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xl">
                {currentUser.companyName?.substring(0, 2).toUpperCase() || currentUser.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-lg font-semibold text-center leading-snug w-full break-words">{currentUser.companyName || currentUser.name}</span>
          </Link>
        )}
        <AccountSwitcher compact />
      </SidebarHeader>
      
      <SidebarContent className="px-4">
        <SidebarGroup className="space-y-1">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {mainMenuItems.map((item) => renderMenuItem(item, item.hasBadge))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 mt-auto">
        <SidebarMenu className="space-y-1">
          {bottomMenuItems.map((item) => renderMenuItem(item))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
