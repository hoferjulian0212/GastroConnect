import { Link, useLocation } from "wouter";
import { Home, MessageSquare, ShoppingBag, Package, History, Settings, AlertCircle, LogOut, Truck } from "lucide-react";
import logoImage from "@assets/Gemini_Generated_Image_lqyjgblqyjgblqyj-Photoroom_1769969436354.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/context/UserContext";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

const mainMenuItems = [
  { title: "Home", url: "/restaurant", icon: Home },
  { title: "Nachrichten", url: "/restaurant/inbox", icon: MessageSquare, hasBadge: true },
  { title: "Lieferanten", url: "/restaurant/suppliers", icon: Truck },
  { title: "Produkte", url: "/restaurant/catalog", icon: Package },
  { title: "Bestellungen", url: "/restaurant/orders", icon: ShoppingBag },
  { title: "Historie", url: "/restaurant/history", icon: History },
  { title: "Reklamationen", url: "/restaurant/complaints", icon: AlertCircle },
];

const bottomMenuItems = [
  { title: "Einstellungen", url: "/restaurant/settings", icon: Settings },
];

export function RestaurantSidebar() {
  const [location] = useLocation();
  const { currentUser } = useUser();

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
      <SidebarMenuItem key={item.title}>
        <Link 
          href={item.url} 
          data-testid={`link-${item.url.split('/').pop()}`}
          className={`flex items-center h-11 rounded-xl px-4 gap-3 transition-all duration-200 hover-elevate ${
            isActive 
              ? "text-primary font-semibold" 
              : "text-foreground/80 hover:text-foreground"
          }`}
        >
          <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
          <span className="flex-1">{item.title}</span>
          {badgeCount > 0 && (
            <Badge variant="default" className="ml-auto text-xs px-2 py-0.5 rounded-full">
              {badgeCount}
            </Badge>
          )}
        </Link>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-6 pb-8">
        <div className="flex items-center gap-0">
          <img 
            src={logoImage} 
            alt="GastroConnect Logo" 
            className="h-14 w-14 object-contain dark:invert"
          />
          <span className="font-semibold text-lg text-foreground">GastroConnect</span>
        </div>
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
        <SidebarMenu className="space-y-1 mb-3">
          {bottomMenuItems.map((item) => renderMenuItem(item))}
        </SidebarMenu>
        
        <SidebarSeparator className="mb-3" />
        
        {currentUser && (
          <div className="flex items-center gap-3 p-2 rounded-xl hover-elevate cursor-pointer">
            <Avatar className="h-10 w-10 rounded-xl">
              <AvatarImage src={currentUser.profileImageUrl || undefined} alt={currentUser.name} className="rounded-xl" />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold rounded-xl">
                {currentUser.companyName?.substring(0, 2).toUpperCase() || currentUser.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-medium truncate">{currentUser.companyName || currentUser.name}</span>
              <span className="text-xs text-muted-foreground">Restaurant</span>
            </div>
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
