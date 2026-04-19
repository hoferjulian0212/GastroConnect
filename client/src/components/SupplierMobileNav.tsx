import { Home, MessageSquare, Package, ClipboardList, AlertCircle, Settings, FileText, Store, Tag, User, Warehouse } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useQuery } from "@tanstack/react-query";
import { MobileNavBase } from "./MobileNavBase";

export function SupplierMobileNav() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const mainNavItems = [
    { title: t("common", "home"), url: "/supplier", icon: Home },
    { title: t("common", "products"), url: "/supplier/products", icon: Package },
    { title: t("common", "messages"), url: "/supplier/inbox", icon: MessageSquare, hasBadge: true },
    { title: t("common", "orders"), url: "/supplier/orders", icon: ClipboardList, hasBadge: true },
  ];

  const moreMenuItems = [
    { title: t("common", "restaurants"), url: "/supplier/restaurants", icon: Store },
    { title: lang === "de" ? "Bestandsverwaltung" : "Gestione magazzino", url: "/supplier/inventory", icon: Warehouse },
    { title: t("common", "promotions"), url: "/supplier/promotions", icon: Tag },
    { title: t("common", "complaints"), url: "/supplier/complaints", icon: AlertCircle },
    { title: t("common", "documents"), url: "/supplier/documents", icon: FileText },
    { title: t("common", "profile"), url: "/supplier/profile", icon: User },
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

  return (
    <MobileNavBase
      mainNavItems={mainNavItems}
      moreMenuItems={moreMenuItems}
      getBadgeCount={getBadgeCount}
      rootPath="/supplier"
      testIdPrefix="supplier"
    />
  );
}
