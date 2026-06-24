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
      { href: "/supplier/inventory-risk", label: de ? "Risiko-Bestand" : "Scorte a rischio" },
      { href: "/supplier/promotions", label: de ? "Aktionen" : "Promozioni" },
    ],
  ];

  const group = groups.find((g) => g.some((tab) => path === tab.href));
  if (!group) return null;

  return (
    <nav
      className="-mx-3 md:mx-0 mb-5 md:mb-6 flex items-center gap-2 overflow-x-auto px-3 md:px-0 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="section-tabs"
      aria-label="Section navigation"
    >
      {group.map((tab) => {
        const active = path === tab.href;
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}>
            <span
              className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium cursor-pointer transition-colors min-h-[40px] px-4 text-[13px] md:min-h-0 md:px-3.5 md:py-1.5 md:text-sm ${
                active
                  ? "bg-white text-[#161921] shadow-sm"
                  : "bg-white/[0.08] text-white/65 hover:bg-white/15 hover:text-white active:bg-white/20"
              }`}
              data-testid={`section-tab-${tab.href.split("/").pop()}`}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
