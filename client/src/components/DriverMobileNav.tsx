import { Truck, Route, Map, MessageCircle, History, Settings, HelpCircle, User, Users, Inbox } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { MobileNavBase, type NavGroup } from "./MobileNavBase";

export function DriverMobileNav() {
  const { lang } = useLanguage();
  const t = useT(lang);

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["/api/internal-chat/unread-count"],
    refetchInterval: 30000,
  });

  const mainNavItems = [
    { title: lang === "de" ? "Lieferungen" : "Consegne", url: "/supplier", icon: Truck },
    { title: lang === "de" ? "Route" : "Percorso", url: "/supplier/route", icon: Route },
    { title: lang === "de" ? "Karte" : "Mappa", url: "/supplier/map", icon: Map },
    { title: "Chat", url: "/supplier/team-chat", icon: MessageCircle, hasBadge: true },
  ];

  const moreMenuGroups: NavGroup[] = [
    {
      title: lang === "de" ? "Mehr" : "Altro",
      items: [
        { title: lang === "de" ? "Verlauf" : "Cronologia", url: "/supplier/history", icon: History },
        { title: "Inbox", url: "/supplier/inbox", icon: Inbox },
        { title: lang === "de" ? "Team" : "Team", url: "/supplier/team", icon: Users },
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
      getBadgeCount={(url) => (url === "/supplier/team-chat" ? unread?.count ?? 0 : 0)}
      rootPath="/supplier"
      testIdPrefix="driver"
    />
  );
}
