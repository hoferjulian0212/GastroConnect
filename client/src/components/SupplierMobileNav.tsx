import { Home, Send, Package, ClipboardList, AlertCircle, AlertTriangle, FileText, Store, HelpCircle, Settings, Truck } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useQuery } from "@tanstack/react-query";
import { MobileNavBase, type NavGroup } from "./MobileNavBase";

export function SupplierMobileNav() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const mainNavItems = [
    { title: t("common", "home"), url: "/supplier", icon: Home },
    { title: t("common", "products"), url: "/supplier/products", icon: Package, matchPaths: ["/supplier/inventory", "/supplier/inventory-risk", "/supplier/promotions"] },
    { title: t("common", "messages"), url: "/supplier/inbox", icon: Send, hasBadge: true },
    { title: t("common", "orders"), url: "/supplier/orders", icon: ClipboardList, hasBadge: true, matchPaths: ["/supplier/calendar"] },
  ];

  const moreMenuGroups: NavGroup[] = [
    {
      title: lang === "de" ? "Bestellungen" : "Ordini",
      items: [
        { title: lang === "de" ? "Fahrer" : "Autisti", url: "/supplier/drivers", icon: Truck },
        { title: t("common", "complaints"), url: "/supplier/complaints", icon: AlertCircle },
        { title: t("common", "documents"), url: "/supplier/documents", icon: FileText },
      ],
    },
    {
      title: lang === "de" ? "Produkte" : "Prodotti",
      items: [
        { title: t("inventoryRisk", "navLabel"), url: "/supplier/inventory-risk", icon: AlertTriangle },
        { title: t("common", "restaurants"), url: "/supplier/restaurants", icon: Store },
      ],
    },
    {
      title: lang === "de" ? "Mehr" : "Altro",
      items: [
        { title: lang === "de" ? "Interner Chat" : "Chat interno", url: "/supplier/team-chat", icon: Send },
        { title: t("common", "settings"), url: "/supplier/settings", icon: Settings },
        { title: lang === "de" ? "Hilfe" : "Aiuto", url: "/supplier/help", icon: HelpCircle },
      ],
    },
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

  return (
    <MobileNavBase
      mainNavItems={mainNavItems}
      moreMenuGroups={moreMenuGroups}
      getBadgeCount={getBadgeCount}
      rootPath="/supplier"
      testIdPrefix="supplier"
    />
  );
}
