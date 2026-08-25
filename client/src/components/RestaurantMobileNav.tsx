import { Home, Send, Package, ShoppingBag, AlertCircle, Truck, FileText, Calculator, HelpCircle, BarChart3, Settings } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useQuery } from "@tanstack/react-query";
import { MobileNavBase, type NavGroup } from "./MobileNavBase";
import { can } from "@shared/permissions";

export function RestaurantMobileNav() {
  const { currentUser, currentMember } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const mainNavItems = [
    { title: t("common", "home"), url: "/restaurant", icon: Home },
    { title: t("common", "products"), url: "/restaurant/catalog", icon: Package, matchPaths: ["/restaurant/price-comparison"] },
    { title: t("common", "messages"), url: "/restaurant/inbox", icon: Send, hasBadge: true },
    { title: t("common", "orders"), url: "/restaurant/orders", icon: ShoppingBag, matchPaths: ["/restaurant/calendar", "/restaurant/templates"] },
  ];

  const moreMenuGroups: NavGroup[] = [
    {
      title: lang === "de" ? "Bestellungen" : "Ordini",
      items: [
        { title: t("common", "complaints"), url: "/restaurant/complaints", icon: AlertCircle },
        { title: t("common", "documents"), url: "/restaurant/documents", icon: FileText },
        ...(can(currentMember?.role, "impact.analytics")
          ? [{ title: lang === "de" ? "Monatsberichte" : "Report mensili", url: "/restaurant/monthly-reports", icon: BarChart3 }]
          : []),
      ],
    },
    {
      title: lang === "de" ? "Katalog" : "Catalogo",
      items: [
        { title: t("common", "suppliers"), url: "/restaurant/suppliers", icon: Truck },
        { title: t("common", "costAnalysis"), url: "/restaurant/cost-analysis", icon: Calculator },
      ],
    },
    {
      title: lang === "de" ? "Mehr" : "Altro",
      items: [
        { title: lang === "de" ? "Interner Chat" : "Chat interno", url: "/restaurant/team-chat", icon: Send },
        { title: t("common", "settings"), url: "/restaurant/settings", icon: Settings },
        { title: lang === "de" ? "Hilfe" : "Aiuto", url: "/restaurant/help", icon: HelpCircle },
      ],
    },
  ];

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: [`/api/conversations/unread?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const getBadgeCount = (url: string) => {
    if (url === "/restaurant/inbox") return unreadCount?.count || 0;
    return 0;
  };

  return (
    <MobileNavBase
      mainNavItems={mainNavItems}
      moreMenuGroups={moreMenuGroups}
      getBadgeCount={getBadgeCount}
      rootPath="/restaurant"
      testIdPrefix="restaurant"
    />
  );
}
