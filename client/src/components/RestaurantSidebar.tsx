import { Link, useLocation } from "wouter";
import { Home, MessageSquare, ShoppingBag, Package, Settings, AlertCircle, Truck, FileText, ChevronRight } from "lucide-react";
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

export function RestaurantSidebar() {
  const [location] = useLocation();
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const mainMenuItems = [
    { title: t("common", "home"), url: "/restaurant", icon: Home },
    { title: t("common", "messages"), url: "/restaurant/inbox", icon: MessageSquare, hasBadge: true },
    { title: t("common", "suppliers"), url: "/restaurant/suppliers", icon: Truck },
    { title: t("common", "products"), url: "/restaurant/catalog", icon: Package },
    { title: t("common", "orders"), url: "/restaurant/orders", icon: ShoppingBag },
    { title: t("common", "complaints"), url: "/restaurant/complaints", icon: AlertCircle },
    { title: t("common", "documents"), url: "/restaurant/documents", icon: FileText },
  ];

  const bottomMenuItems = [
    { title: t("common", "settings"), url: "/restaurant/settings", icon: Settings },
  ];

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

  const getBadgeCount = (url: string) => {
    if (url === "/restaurant/inbox") return unreadCount?.count || 0;
    if (url === "/restaurant/cart") return cartCount?.count || 0;
    return 0;
  };

  const renderMenuItem = (item: typeof mainMenuItems[0], hasBadge?: boolean) => {
    const isActive = location === item.url || 
      (item.url !== "/restaurant" && location.startsWith(item.url));
    const badgeCount = hasBadge ? getBadgeCount(item.url) : 0;
    
    return (
      <SidebarMenuItem key={item.url}>
        <Link 
          href={item.url} 
          data-testid={`link-${item.url.split('/').pop()}`}
          className={`flex items-center h-11 rounded-xl px-2 gap-3 transition-all duration-200 text-left text-[13px] hover-elevate ${
            isActive 
              ? "bg-primary/10 text-primary font-semibold" 
              : "text-foreground font-normal"
          }`}
        >
          <item.icon className="h-5 w-5" />
          <span className="flex-1">{item.title}</span>
          {badgeCount > 0 && (
            <Badge 
              variant="default" 
              className="ml-auto text-xs px-2 py-0.5 rounded-full"
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
      <SidebarHeader className="pt-5 pb-3 px-4">
        {currentUser && (
          <Link href="/restaurant/profile" className="flex items-center gap-3 px-2 rounded-xl hover-elevate cursor-pointer" data-testid="link-profile">
            <Avatar className="h-9 w-9 rounded-full">
              <AvatarImage src={currentUser.profileImageUrl || undefined} alt={currentUser.name} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {currentUser.companyName?.substring(0, 2).toUpperCase() || currentUser.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-semibold truncate flex-1">{currentUser.companyName || currentUser.name}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </Link>
        )}
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
