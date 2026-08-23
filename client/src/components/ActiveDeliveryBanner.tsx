import { useState } from "react";
import { Link } from "wouter";
import { Truck, ChevronUp } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";
import { formatOrderNumber } from "@shared/schema";

interface ActiveDeliveryBannerProps {
  orders: OrderWithDetails[];
  lang: "de" | "it";
}

/**
 * Compact delivery launcher for the restaurant dashboard.
 *
 * It intentionally lives outside the dashboard layout as a fixed control so
 * it does not consume a widget slot or push the upcoming-deliveries section
 * down. One order opens directly; multiple orders expose numbered choices.
 */
export function ActiveDeliveryBanner({ orders, lang }: ActiveDeliveryBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (orders.length === 0) return null;

  const first = orders[0];
  const multiple = orders.length > 1;
  const orderLabel = (order: OrderWithDetails) => {
    const number = formatOrderNumber(order);
    const supplier = order.supplier?.companyName || order.supplier?.name;
    return supplier
      ? (lang === "de" ? `Bestellung ${number} von ${supplier} ist unterwegs` : `L'ordine ${number} di ${supplier} è in viaggio`)
      : (lang === "de" ? `Bestellung ${number} ist unterwegs` : `L'ordine ${number} è in viaggio`);
  };

  const openFirst = () => {
    if (multiple) {
      setExpanded((value) => !value);
    }
  };

  return (
    <div
      className="fixed bottom-[5.75rem] right-4 z-[58] flex flex-col items-end gap-2 md:bottom-24 md:right-6"
      data-testid="active-delivery-launcher"
    >
      {expanded && multiple && (
        <div
          className="flex max-w-[calc(100vw-2rem)] items-center gap-1.5 rounded-full border border-border/60 bg-background/95 p-1.5 shadow-xl backdrop-blur"
          data-testid="active-delivery-order-choices"
        >
          {orders.map((order, index) => (
            <Link
              key={order.id}
              href={`/restaurant/orders/${order.id}`}
              title={orderLabel(order)}
              aria-label={orderLabel(order)}
              onClick={() => setExpanded(false)}
              className="group relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition-transform hover:scale-110 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              data-testid={`active-delivery-choice-${order.id}`}
            >
              <Truck className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-purple-600 px-0.5 text-[9px] font-bold leading-none">
                {index + 1}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {multiple && expanded && (
          <span className="rounded-full bg-[#161921] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg">
            {lang === "de" ? `${orders.length} Lieferungen unterwegs` : `${orders.length} consegne in viaggio`}
          </span>
        )}
        <button
          type="button"
          onClick={openFirst}
          title={multiple
            ? (lang === "de" ? `${orders.length} Bestellungen sind unterwegs – Auswahl öffnen` : `${orders.length} ordini in viaggio – apri selezione`)
            : orderLabel(first)}
          aria-label={multiple
            ? (lang === "de" ? `${orders.length} Bestellungen unterwegs, Auswahl öffnen` : `${orders.length} ordini in viaggio, apri selezione`)
            : orderLabel(first)}
          className="group relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:h-16 md:w-16"
          data-testid="active-delivery-launcher-button"
        >
          <span className="absolute inset-0 rounded-full border-2 border-blue-300/80 animate-ping" />
          <span className="absolute inset-1 rounded-full border border-white/25" />
          <Truck className="relative h-7 w-7 animate-bounce md:h-8 md:w-8" />
          {multiple ? (
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-background bg-purple-600 px-1 text-[11px] font-bold">
              {orders.length}
            </span>
          ) : (
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-400" />
          )}
          {multiple && (
            <ChevronUp className={`absolute -bottom-1 h-3.5 w-3.5 rounded-full bg-background text-blue-700 transition-transform ${expanded ? "rotate-180" : ""}`} />
          )}
        </button>
      </div>
    </div>
  );
}