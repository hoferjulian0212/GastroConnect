import { Home, AlertTriangle, Package, Settings, HelpCircle, User, MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { MobileNavBase, type NavGroup } from "./MobileNavBase";

export function WarehouseMobileNav() {
  const { lang } = useLanguage();
  const t = useT(lang);

  const { data: internalUnread } = useQuery<{ count: number }>({
    queryKey: ["/api/internal-chat/unread-count"],
    refetchInterval: 15000,
  });

  const mainNavItems = [
    { title: t("common", "home"), url: "/supplier", icon: Home },
    { title: t("inventoryRisk", "navLabel"), url: "/supplier/inventory-risk", icon: AlertTriangle },
    { title: lang === "de" ? "Bestand" : "Magazzino", url: "/supplier/inventory", icon: Package },
    { title: lang === "de" ? "Team-Chat" : "Chat team", url: "/supplier/team-chat", icon: MessageCircle, hasBadge: true },
  ];

  const moreMenuGroups: NavGroup[] = [
    {
      title: lang === "de" ? "Mehr" : "Altro",
      items: [
        { title: t("common", "profile"), url: "/supplier/profile", icon: User },
        { title: t("common", "settings"), url: "/supplier/settings", icon: Settings },
        { title: lang === "de" ? "Hilfe" : "Aiuto", url: "/supplier/help", icon: HelpCircle },
      ],
    },
  ];

  return (
    <MobileNavBase
      mainNavItems={mainNavItems}
      moreMenuGroups={moreMenuGroups}
      getBadgeCount={(url) => (url === "/supplier/team-chat" ? internalUnread?.count ?? 0 : 0)}
      rootPath="/supplier"
      testIdPrefix="warehouse"
    />
  );
}
