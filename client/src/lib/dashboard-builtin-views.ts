import type { DashboardTemplate, LayoutItem, CardSize } from "@/hooks/use-dashboard-templates";

export type Lang = "de" | "it";

const half = (id: string): LayoutItem => ({ id, size: "half" as CardSize });
const full = (id: string): LayoutItem => ({ id, size: "full" as CardSize });

interface BuiltinDef {
  id: string;
  name: { de: string; it: string };
  widgets: string[];
  layout: LayoutItem[];
}

const RESTAURANT_BUILTINS: BuiltinDef[] = [
  {
    id: "builtin-r-stats",
    name: { de: "Daten & Statistik", it: "Dati e statistiche" },
    widgets: ["w-ausgaben-trend", "w-aktions-ersparnis", "w-meist-bestellt", "w-top-lieferanten"],
    layout: [full("w-ausgaben-trend"), half("w-aktions-ersparnis"), half("w-meist-bestellt"), half("w-top-lieferanten")],
  },
  {
    id: "builtin-r-comms",
    name: { de: "Kommunikation & Reklamationen", it: "Comunicazione e reclami" },
    widgets: ["w-offene-unterhaltungen", "w-reklamationen-status", "w-letzte-reklamationen"],
    layout: [half("w-offene-unterhaltungen"), half("w-reklamationen-status"), half("w-letzte-reklamationen")],
  },
  {
    id: "builtin-r-orders",
    name: { de: "Bestellungen", it: "Ordini" },
    widgets: ["w-bestellungen-status", "w-letzte-bestellungen"],
    layout: [half("w-bestellungen-status"), full("upcoming-deliveries"), full("w-letzte-bestellungen")],
  },
];

const SUPPLIER_BUILTINS: BuiltinDef[] = [
  {
    id: "builtin-s-stats",
    name: { de: "Daten & Statistik", it: "Dati e statistiche" },
    widgets: ["w-umsatz-trend", "w-steigende-nachfrage", "w-top-kunden-30d", "w-inaktive-restaurants"],
    layout: [full("w-umsatz-trend"), half("w-steigende-nachfrage"), half("w-top-kunden-30d"), half("w-inaktive-restaurants")],
  },
  {
    id: "builtin-s-comms",
    name: { de: "Kommunikation & Reklamationen", it: "Comunicazione e reclami" },
    widgets: ["w-offene-reklamationen", "w-antwortzeit", "w-promo-performance"],
    layout: [half("w-offene-reklamationen"), half("w-antwortzeit"), half("w-promo-performance")],
  },
  {
    id: "builtin-s-orders",
    name: { de: "Bestellungen", it: "Ordini" },
    widgets: ["w-s-bestellungen-status", "w-heute-zu-liefern"],
    layout: [half("w-s-bestellungen-status"), half("w-heute-zu-liefern"), half("action-required")],
  },
];

function defsForRole(role: string): BuiltinDef[] {
  return role === "supplier" ? SUPPLIER_BUILTINS : RESTAURANT_BUILTINS;
}

// Optional widgets that are enabled by default in the standard dashboard ("Standardansicht").
// Required (non-optional) sections are always force-enabled by the grid's reconcileEnabledIds,
// so only the optional sections with defaultEnabled:true need to be listed here. Keep this in
// sync with the optional `defaultEnabled: true` sections in the desktop Home.tsx files; it lets
// the mobile selector restore the true default widget set across devices (server wins on load).
const DEFAULT_OPTIONAL_WIDGETS: Record<string, string[]> = {
  restaurant: [],
  supplier: [
    "w-offene-reklamationen",
    "w-heute-zu-liefern",
    "w-top-kunden-30d",
    "w-promo-performance",
    "w-antwortzeit",
  ],
};

export function getDefaultViewWidgets(role: string): string[] {
  return [...(DEFAULT_OPTIONAL_WIDGETS[role] ?? [])];
}

const ALL_BUILTIN_IDS = new Set<string>(
  [...RESTAURANT_BUILTINS, ...SUPPLIER_BUILTINS].map((d) => d.id),
);

export function isBuiltinViewId(id: string | null | undefined): boolean {
  return !!id && ALL_BUILTIN_IDS.has(id);
}

export function getBuiltinViews(role: string, lang: Lang): DashboardTemplate[] {
  return defsForRole(role).map((d) => ({
    id: d.id,
    name: d.name[lang] ?? d.name.de,
    layout: d.layout.map((l) => ({ ...l })),
    widgets: [...d.widgets],
  }));
}
