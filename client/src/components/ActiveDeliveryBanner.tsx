import { ArrowRight, MapPin, Truck } from "lucide-react";
import { Link } from "wouter";
import type { OrderWithDetails } from "@shared/schema";

interface ActiveDeliveryBannerProps {
  orders: OrderWithDetails[];
  lang: "de" | "it";
  className?: string;
}

export function ActiveDeliveryBanner({ orders, lang, className = "" }: ActiveDeliveryBannerProps) {
  if (orders.length === 0) return null;

  const order = orders[0];
  const supplierName = order.supplier?.companyName || order.supplier?.name || (lang === "de" ? "Ihr Lieferant" : "Il tuo fornitore");
  const extraCount = orders.length - 1;

  return (
    <Link
      href={`/restaurant/orders/${order.id}`}
      className={`group relative block overflow-hidden rounded-2xl border border-purple-300/70 bg-gradient-to-r from-purple-50 via-white to-blue-50 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-purple-700/50 dark:from-purple-950/40 dark:via-card dark:to-blue-950/30 ${className}`}
      data-testid="active-delivery-banner"
    >
      <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-purple-400/15 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white shadow-md shadow-purple-600/25">
          <Truck className="h-5 w-5" />
          <span className="absolute inset-0 rounded-full border-2 border-purple-400/70 animate-ping" />
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-card" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-purple-700 dark:text-purple-300">
            {lang === "de" ? "Lieferung unterwegs" : "Consegna in arrivo"}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {lang === "de" ? `${supplierName} kommt zu Ihnen` : `${supplierName} sta arrivando`}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {lang === "de" ? "Live-Karte öffnen" : "Apri mappa live"}
            {extraCount > 0 && ` · +${extraCount}`}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-purple-600 transition-transform group-hover:translate-x-1 dark:text-purple-300" />
      </div>
    </Link>
  );
}