import { Link, useLocation } from "wouter";
import { Home, MessageSquare, Package, ClipboardList, History, Settings, AlertCircle, LogOut } from "lucide-react";
import logoImage from "@assets/ChatGPT_Image_5._Feb._2026,_16_51_02_1770306687793.png";
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
  { title: "Home", url: "/supplier", icon: Home },
  { title: "Nachrichten", url: "/supplier/inbox", icon: MessageSquare, hasBadge: true },
  { title: "Produkte", url: "/supplier/products", icon: Package },
  { title: "Bestellungen", url: "/supplier/orders", icon: ClipboardList, hasBadge: true },
  { title: "Historie", url: "/supplier/history", icon: History },
  { title: "Reklamationen", url: "/supplier/complaints", icon: AlertCircle },
];

const bottomMenuItems = [
  { title: "Einstellungen", url: "/supplier/settings", icon: Settings },
];

export function SupplierSidebar() {
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

  const renderMenuItem = (item: typeof mainMenuItems[0], hasBadge?: boolean) => {
    const isActive = location === item.url || 
      (item.url !== "/supplier" && location.startsWith(item.url));
    const badgeCount = hasBadge ? getBadgeCount(item.url) : 0;
    
    return (
      <SidebarMenuItem key={item.title}>
        <Link 
          href={item.url} 
          data-testid={`link-${item.url.split('/').pop()}`}
          className={`flex items-center h-11 rounded-xl px-4 gap-3 transition-all duration-200 hover-elevate ${
            isActive 
              ? "text-primary font-semibold" 
              : "text-black dark:text-white font-medium"
          }`}
        >
          <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
          <span className="flex-1">{item.title}</span>
          {badgeCount > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs px-2 py-0.5 rounded-full">
              {badgeCount}
            </Badge>
          )}
        </Link>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="pt-8 pb-4 px-4">
        <Link href="/about" className="flex items-center justify-center">
          <img 
            src={logoImage} 
            alt="GastroConnect Logo" 
            className="h-28 object-contain dark:invert transition-transform duration-300 hover:scale-110 cursor-pointer"
          />
        </Link>
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
          {bottomMenuItems.map((item) => renderMenuItem(item, false))}
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
              <span className="text-xs text-muted-foreground">Lieferant</span>
            </div>
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
