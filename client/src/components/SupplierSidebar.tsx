import { Link, useLocation } from "wouter";
import { Home, MessageSquare, Package, ClipboardList, History, Settings, AlertCircle, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useUser } from "@/context/UserContext";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

const mainMenuItems = [
  { title: "Übersicht", url: "/supplier", icon: Home },
  { title: "Nachrichten", url: "/supplier/inbox", icon: MessageSquare, hasBadge: true },
  { title: "Produkte", url: "/supplier/products", icon: Package },
  { title: "Bestellungen", url: "/supplier/orders", icon: ClipboardList, hasBadge: true },
  { title: "Historie", url: "/supplier/history", icon: History },
];

const bottomMenuItems = [
  { title: "Einstellungen", url: "/supplier/settings", icon: Settings },
];

export function SupplierSidebar() {
  const [location] = useLocation();
  const { currentUser } = useUser();

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: [`/api/conversations/unread/${currentUser?.id}`],
    enabled: !!currentUser?.id,
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
        <SidebarMenuButton 
          asChild 
          isActive={isActive}
          className="h-11 rounded-xl px-4 gap-3 transition-all duration-200"
        >
          <Link href={item.url} data-testid={`link-${item.url.split('/').pop()}`}>
            <item.icon className="h-5 w-5" />
            <span className="flex-1 font-medium">{item.title}</span>
            {badgeCount > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs px-2 py-0.5 rounded-full">
                {badgeCount}
              </Badge>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-6 pb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground font-bold text-lg shadow-sm">
            G
          </div>
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

        <div className="px-2 py-4">
          <Button 
            variant="default" 
            className="w-full h-11 rounded-xl font-medium shadow-sm"
            asChild
          >
            <Link href="/supplier/complaints" data-testid="link-complaints">
              <AlertCircle className="h-5 w-5 mr-2" />
              Reklamationen
            </Link>
          </Button>
        </div>
      </SidebarContent>

      <SidebarFooter className="p-4 mt-auto">
        <SidebarMenu className="space-y-1 mb-4">
          {bottomMenuItems.map((item) => renderMenuItem(item, false))}
        </SidebarMenu>
        
        <SidebarSeparator className="my-4" />
        
        {currentUser && (
          <div className="flex items-center gap-3 p-2 rounded-xl hover-elevate cursor-pointer">
            <Avatar className="h-10 w-10 rounded-xl">
              <AvatarFallback className="bg-secondary/10 text-secondary font-semibold rounded-xl">
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
