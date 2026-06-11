import { Home, MessageSquare, Package, ShoppingCart, ShoppingBag, AlertCircle, Settings, Truck, FileText, User, Calculator, ArrowUpDown, HelpCircle } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useQuery } from "@tanstack/react-query";
import { MobileNavBase } from "./MobileNavBase";

export function RestaurantMobileNav() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const mainNavItems = [
    { title: t("common", "home"), url: "/restaurant", icon: Home },
    { title: t("common", "products"), url: "/restaurant/catalog", icon: Package },
    { title: t("common", "messages"), url: "/restaurant/inbox", icon: MessageSquare, hasBadge: true },
    { title: t("common", "orders"), url: "/restaurant/orders", icon: ShoppingBag },
  ];

  const moreMenuItems = [
    { title: t("common", "suppliers"), url: "/restaurant/suppliers", icon: Truck },
    { title: lang === "de" ? "Preisvergleich" : "Confronto prezzi", url: "/restaurant/price-comparison", icon: ArrowUpDown },
    { title: t("common", "cart"), url: "/restaurant/cart", icon: ShoppingCart, hasBadge: true },
    { title: t("common", "complaints"), url: "/restaurant/complaints", icon: AlertCircle },
    { title: t("common", "documents"), url: "/restaurant/documents", icon: FileText },
    { title: t("common", "costAnalysis"), url: "/restaurant/cost-analysis", icon: Calculator },
    { title: t("common", "profile"), url: "/restaurant/profile", icon: User },
    { title: t("common", "settings"), url: "/restaurant/settings", icon: Settings },
    { title: lang === "de" ? "Hilfe" : "Aiuto", url: "/restaurant/help", icon: HelpCircle },
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

  return (
    <MobileNavBase
      mainNavItems={mainNavItems}
      moreMenuItems={moreMenuItems}
      getBadgeCount={getBadgeCount}
      rootPath="/restaurant"
      testIdPrefix="restaurant"
    />
  );
}
