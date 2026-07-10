import { Package, Truck, MapPin, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import type { DeliveryStatus } from "@shared/schema";

// Shared status metadata for the driver module (German-first UI).
export const DELIVERY_STATUS_META: Record<
  DeliveryStatus,
  { labelDe: string; labelIt: string; icon: typeof Package; pillClass: string; dotClass: string }
> = {
  assigned: {
    labelDe: "Zugewiesen",
    labelIt: "Assegnata",
    icon: Clock,
    pillClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    dotClass: "bg-slate-400",
  },
  picked_up: {
    labelDe: "Übernommen",
    labelIt: "Ritirata",
    icon: Package,
    pillClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    dotClass: "bg-amber-500",
  },
  en_route: {
    labelDe: "Unterwegs",
    labelIt: "In viaggio",
    icon: Truck,
    pillClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    dotClass: "bg-blue-500",
  },
  arriving: {
    labelDe: "Kommt gleich an",
    labelIt: "In arrivo",
    icon: MapPin,
    pillClass: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    dotClass: "bg-violet-500",
  },
  delivered: {
    labelDe: "Geliefert",
    labelIt: "Consegnata",
    icon: CheckCircle2,
    pillClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
  },
  problem: {
    labelDe: "Problem",
    labelIt: "Problema",
    icon: AlertTriangle,
    pillClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    dotClass: "bg-red-500",
  },
};

export const PROBLEM_TYPE_LABELS: Record<string, { de: string; it: string }> = {
  not_reachable: { de: "Kunde nicht erreichbar", it: "Cliente non raggiungibile" },
  refused: { de: "Annahme verweigert", it: "Consegna rifiutata" },
  damaged: { de: "Ware beschädigt", it: "Merce danneggiata" },
  wrong_address: { de: "Falsche Adresse", it: "Indirizzo errato" },
  traffic: { de: "Verkehrsproblem", it: "Problema di traffico" },
  other: { de: "Sonstiges Problem", it: "Altro problema" },
};

export function StatusPill({ status, lang }: { status: DeliveryStatus; lang: "de" | "it" }) {
  const meta = DELIVERY_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.pillClass}`}
      data-testid={`pill-status-${status}`}
    >
      <Icon className="h-3 w-3" />
      {lang === "de" ? meta.labelDe : meta.labelIt}
    </span>
  );
}

export function mapsDirectionsUrl(restaurant: { latitude?: string | null; longitude?: string | null; address?: string | null; city?: string | null }): string {
  const lat = restaurant.latitude ? parseFloat(restaurant.latitude) : NaN;
  const lng = restaurant.longitude ? parseFloat(restaurant.longitude) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }
  const q = encodeURIComponent([restaurant.address, restaurant.city].filter(Boolean).join(", "));
  return `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
}
