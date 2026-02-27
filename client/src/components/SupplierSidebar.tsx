import { Link, useLocation } from "wouter";
import { Home, MessageSquare, Package, ClipboardList, Settings, AlertCircle, FileText, ChevronRight, Store, Tag } from "lucide-react";
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

export function SupplierSidebar() {
  const [location] = useLocation();
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const mainMenuItems = [
    { title: t("common", "home"), url: "/supplier", icon: Home },
    { title: t("common", "messages"), url: "/supplier/inbox", icon: MessageSquare, hasBadge: true },
    { title: t("common", "products"), url: "/supplier/products", icon: Package },
    { title: t("common", "restaurants"), url: "/supplier/restaurants", icon: Store },
    { title: t("common", "orders"), url: "/supplier/orders", icon: ClipboardList, hasBadge: true },
    { title: t("common", "promotions"), url: "/supplier/promotions", icon: Tag },
    { title: t("common", "complaints"), url: "/supplier/complaints", icon: AlertCircle },
    { title: t("common", "documents"), url: "/supplier/documents", icon: FileText },
  ];

  const bottomMenuItems = [
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

  const getBadgeCount = (url: string) => {
    if (url === "/supplier/inbox") return unreadCount?.count || 0;
    if (url === "/supplier/orders") return pendingOrders?.count || 0;
    return 0;
  };

  const renderMenuItem = (item: typeof mainMenuItems[0], hasBadge?: boolean) => {
    const isActive = location === item.url || 
      (item.url !== "/supplier" && location.startsWith(item.url));
    const badgeCount = hasBadge ? getBadgeCount(item.url) : 0;
    
    return (
      <SidebarMenuItem key={item.url}>
        <Link 
          href={item.url} 
          data-testid={`link-${item.url.split('/').pop()}`}
          className={`flex items-center h-11 rounded-xl px-2 gap-3 transition-all duration-200 text-left text-[13px] hover-elevate ${
            isActive
              ? "text-primary font-semibold"
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
      <SidebarHeader className="pt-5 pb-5 px-4">
        {currentUser && (
          <Link href="/supplier/profile" className="flex flex-col items-center gap-2 px-2 py-3 rounded-xl hover-elevate cursor-pointer" data-testid="link-profile">
            <Avatar className="h-12 w-12 rounded-full">
              <AvatarImage src={currentUser.profileImageUrl || undefined} alt={currentUser.name} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-base">
                {currentUser.companyName?.substring(0, 2).toUpperCase() || currentUser.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-base font-semibold text-center leading-snug w-full break-words">{currentUser.companyName || currentUser.name}</span>
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
          {bottomMenuItems.map((item) => renderMenuItem(item, false))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
