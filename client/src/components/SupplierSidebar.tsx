import { Link, useLocation } from "wouter";
import { Home, MessageSquare, Package, ClipboardList, History, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useUser } from "@/context/UserContext";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

const menuItems = [
  { title: "Home", url: "/supplier", icon: Home },
  { title: "Inbox", url: "/supplier/inbox", icon: MessageSquare, hasBadge: true },
  { title: "Produktkatalog", url: "/supplier/products", icon: Package },
  { title: "Aufträge", url: "/supplier/orders", icon: ClipboardList, hasBadge: true },
  { title: "Bestellübersicht", url: "/supplier/history", icon: History },
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

  const getBadgeCount = (item: typeof menuItems[0]) => {
    if (item.url === "/supplier/inbox") return unreadCount?.count || 0;
    if (item.url === "/supplier/orders") return pendingOrders?.count || 0;
    return 0;
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground font-bold text-lg">
            G
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sidebar-foreground">GastroConnect</span>
            <span className="text-xs text-muted-foreground">Lieferanten Portal</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location === item.url || 
                  (item.url !== "/supplier" && location.startsWith(item.url));
                const badgeCount = item.hasBadge ? getBadgeCount(item) : 0;
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url} data-testid={`link-${item.url.split('/').pop()}`}>
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {badgeCount > 0 && (
                          <Badge variant="secondary" className="ml-auto text-xs px-2 py-0">
                            {badgeCount}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        {currentUser && (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-secondary/10 text-secondary text-sm">
                {currentUser.companyName?.charAt(0) || currentUser.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{currentUser.companyName || currentUser.name}</span>
              <span className="text-xs text-muted-foreground truncate">{currentUser.email}</span>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
