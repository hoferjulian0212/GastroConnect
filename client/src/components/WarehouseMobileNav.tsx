import { Home, AlertTriangle, Package, Settings, HelpCircle, User } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { MobileNavBase, type NavGroup } from "./MobileNavBase";

export function WarehouseMobileNav() {
  const { lang } = useLanguage();
  const t = useT(lang);

  const mainNavItems = [
    { title: t("common", "home"), url: "/supplier", icon: Home },
    { title: t("inventoryRisk", "navLabel"), url: "/supplier/inventory-risk", icon: AlertTriangle },
    { title: lang === "de" ? "Bestand" : "Magazzino", url: "/supplier/inventory", icon: Package },
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
      getBadgeCount={() => 0}
      rootPath="/supplier"
      testIdPrefix="warehouse"
    />
  );
}
