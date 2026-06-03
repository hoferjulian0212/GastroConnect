import { Link, useLocation } from "wouter";
import { useLanguage } from "@/context/LanguageContext";

type Tab = { href: string; label: string };

export function SectionTabs() {
  const [location] = useLocation();
  const { lang } = useLanguage();
  const path = location.split("?")[0];
  const de = lang === "de";

  const groups: Tab[][] = [
    [
      { href: "/restaurant/orders", label: de ? "Bestellungen" : "Ordini" },
      { href: "/restaurant/calendar", label: de ? "Kalender" : "Calendario" },
      { href: "/restaurant/templates", label: de ? "Vorlagen" : "Modelli" },
    ],
    [
      { href: "/restaurant/catalog", label: de ? "Katalog" : "Catalogo" },
      { href: "/restaurant/price-comparison", label: de ? "Preisvergleich" : "Confronto prezzi" },
    ],
    [
      { href: "/supplier/orders", label: de ? "Bestellungen" : "Ordini" },
      { href: "/supplier/calendar", label: de ? "Kalender" : "Calendario" },
    ],
    [
      { href: "/supplier/products", label: de ? "Katalog" : "Catalogo" },
      { href: "/supplier/inventory", label: de ? "Bestand" : "Magazzino" },
      { href: "/supplier/promotions", label: de ? "Aktionen" : "Promozioni" },
    ],
  ];

  const group = groups.find((g) => g.some((tab) => path === tab.href));
  if (!group) return null;

  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto mb-3 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="section-tabs"
    >
      {group.map((tab) => {
        const active = path === tab.href;
        return (
          <Link key={tab.href} href={tab.href}>
            <span
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-colors ${
                active
                  ? "bg-white text-[#161921]"
                  : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
              }`}
              data-testid={`section-tab-${tab.href.split("/").pop()}`}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
