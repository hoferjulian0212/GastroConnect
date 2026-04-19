import { Link, useLocation } from "wouter";
import { Home, MessageSquare, Package, ClipboardList, Settings, AlertCircle, FileText, ChevronRight, ChevronDown, Store, Tag, Warehouse } from "lucide-react";
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

export function SupplierSidebar() {
  const [location, setLocation] = useLocation();
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [pulsingBadge, setPulsingBadge] = useState<string | null>(null);
  const prevCounts = useRef<Record<string, number>>({});
  const [currentSearch, setCurrentSearch] = useState(window.location.search);
  const isProductsSection = location.startsWith("/supplier/products") || location.startsWith("/supplier/inventory") || location.startsWith("/supplier/promotions");
  const [productsOpen, setProductsOpen] = useState(isProductsSection);

  useEffect(() => {
    const onPop = () => setCurrentSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (isProductsSection) setProductsOpen(true);
  }, [isProductsSection]);

  const productSubItems = [
    { title: lang === "de" ? "Katalog" : "Catalogo", url: "/supplier/products", icon: Package },
    { title: lang === "de" ? "Bestandsverwaltung" : "Gestione magazzino", url: "/supplier/inventory", icon: Warehouse },
    { title: lang === "de" ? "Aktionen" : "Promozioni", url: "/supplier/promotions", icon: Tag },
  ];

  const mainMenuItems = [
    { title: t("common", "home"), url: "/supplier", icon: Home },
    { title: t("common", "messages"), url: "/supplier/inbox", icon: MessageSquare, hasBadge: true },
    { title: t("common", "restaurants"), url: "/supplier/restaurants", icon: Store },
    { title: t("common", "orders"), url: "/supplier/orders", icon: ClipboardList, hasBadge: true },
    { title: t("common", "complaints"), url: "/supplier/complaints", icon: AlertCircle },
    { title: t("common", "documents"), url: "/supplier/documents", icon: FileText },
  ];

  const bottomMenuItems = [
    { title: t("common", "settings"), url: "/supplier/settings", icon: Settings },
  ];

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: [`/api/conversations/unread?userId=${currentUser?.id}`],
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

  useEffect(() => {
    const currentUnread = unreadCount?.count || 0;
    const prev = prevCounts.current["inbox"] ?? 0;
    if (currentUnread > prev && prevCounts.current["inbox"] !== undefined) {
      setPulsingBadge("inbox");
      setTimeout(() => setPulsingBadge(null), 500);
    }
    prevCounts.current["inbox"] = currentUnread;
  }, [unreadCount?.count]);

  useEffect(() => {
    const currentPending = pendingOrders?.count || 0;
    const prev = prevCounts.current["orders"] ?? 0;
    if (currentPending > prev && prevCounts.current["orders"] !== undefined) {
      setPulsingBadge("orders");
      setTimeout(() => setPulsingBadge(null), 500);
    }
    prevCounts.current["orders"] = currentPending;
  }, [pendingOrders?.count]);

  const renderMenuItem = (item: typeof mainMenuItems[0], hasBadge?: boolean) => {
    const isActive = location === item.url || 
      (item.url !== "/supplier" && location.startsWith(item.url));
    const badgeCount = hasBadge ? getBadgeCount(item.url) : 0;
    const isPulsing = (item.url === "/supplier/inbox" && pulsingBadge === "inbox") ||
                      (item.url === "/supplier/orders" && pulsingBadge === "orders");
    
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
          <Link href="/supplier/profile" className="flex flex-col items-center gap-2 px-2 py-3 rounded-xl hover-elevate cursor-pointer" data-testid="link-profile">
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
              {mainMenuItems.slice(0, 2).map((item) => renderMenuItem(item, item.hasBadge))}
              
              <SidebarMenuItem>
                <button
                  onClick={() => {
                    if (isProductsSection) {
                      setProductsOpen(!productsOpen);
                    } else {
                      setProductsOpen(true);
                      setLocation("/supplier/products");
                    }
                  }}
                  className={`flex items-center w-full h-11 rounded-xl px-2 gap-3 transition-all duration-200 text-left text-[13px] ${
                    isProductsSection
                      ? "text-primary font-semibold"
                      : "text-foreground font-normal hover-elevate"
                  }`}
                  data-testid="link-products"
                >
                  <Package className="h-5 w-5" />
                  <span className="flex-1">{t("common", "products")}</span>
                  {productsOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                  )}
                </button>
              </SidebarMenuItem>
              {productsOpen && (
                <div className="ml-4 space-y-0.5">
                  {productSubItems.map((sub) => {
                    const isSubActive = location === sub.url;
                    const slug = sub.url.split("/").pop() || "catalog";
                    return (
                      <SidebarMenuItem key={sub.url}>
                        <Link
                          href={sub.url}
                          data-testid={`link-products-${slug}`}
                          className={`flex items-center h-9 rounded-lg px-2 gap-2.5 transition-all duration-200 text-left text-[12px] cursor-pointer ${
                            isSubActive
                              ? "text-primary font-semibold bg-primary/5"
                              : "text-muted-foreground font-normal hover:text-foreground hover:bg-muted/50"
                          }`}
                        >
                          <sub.icon className="h-4 w-4" />
                          <span>{sub.title}</span>
                        </Link>
                      </SidebarMenuItem>
                    );
                  })}
                </div>
              )}

              {mainMenuItems.slice(2).map((item) => renderMenuItem(item, item.hasBadge))}
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
