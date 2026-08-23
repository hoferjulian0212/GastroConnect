import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Truck, X } from "lucide-react";
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
 * down. One order opens directly; multiple orders expose a labelled list.
 */
export function ActiveDeliveryBanner({ orders, lang }: ActiveDeliveryBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [aiOpen, setAiOpen] = useState(() =>
    typeof document !== "undefined" && document.body.dataset.aiAssistantOpen === "true",
  );
  const [, navigate] = useLocation();

  useEffect(() => {
    const onAiVisibility = (event: Event) => {
      setAiOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    };
    window.addEventListener("gc:ai-visibility", onAiVisibility);
    return () => window.removeEventListener("gc:ai-visibility", onAiVisibility);
  }, []);

  if (aiOpen) return null;
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
    if (multiple) setExpanded((value) => !value);
    else navigate(`/restaurant/orders/${first.id}`);
  };

  return (
    <div
      className="fixed bottom-[5.75rem] right-4 z-[58] flex flex-col items-end gap-2 md:bottom-24 md:right-6"
      data-testid="active-delivery-launcher"
    >
      {expanded && multiple && (
        <div
          className="w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-blue-200 bg-background/95 shadow-xl shadow-blue-950/10 backdrop-blur dark:border-blue-900/70"
          data-testid="active-delivery-order-choices"
        >
          <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-3 py-2.5 dark:border-blue-900/60 dark:bg-blue-950/40">
            <div>
              <p className="text-xs font-bold text-blue-900 dark:text-blue-100">
                {lang === "de" ? "Lieferungen unterwegs" : "Consegne in viaggio"}
              </p>
              <p className="text-[11px] text-blue-700/75 dark:text-blue-200/75">
                {lang === "de" ? `${orders.length} Bestellungen auswählen` : `Scegli tra ${orders.length} ordini`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-200 dark:hover:bg-blue-900/60"
              aria-label={lang === "de" ? "Auswahl schließen" : "Chiudi selezione"}
              data-testid="active-delivery-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/restaurant/orders/${order.id}`}
              title={orderLabel(order)}
              aria-label={orderLabel(order)}
              onClick={() => setExpanded(false)}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-blue-950/50"
              data-testid={`active-delivery-order-${order.id}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
                {formatOrderNumber(order).replace(/^#/, "")}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {order.supplier?.companyName || order.supplier?.name || (lang === "de" ? "Lieferant" : "Fornitore")}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {lang === "de" ? `Bestellung ${formatOrderNumber(order)} ist unterwegs` : `${formatOrderNumber(order)} è in viaggio`}
                </span>
              </span>
            </Link>
          ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openFirst}
          title={multiple
            ? (lang === "de" ? `${orders.length} Bestellungen sind unterwegs – Auswahl öffnen` : `${orders.length} ordini in viaggio – apri selezione`)
            : orderLabel(first)}
          aria-label={multiple
            ? (lang === "de" ? `${orders.length} Bestellungen unterwegs, Auswahl öffnen` : `${orders.length} ordini in viaggio, apri selezione`)
            : orderLabel(first)}
          className="group relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-white shadow-lg shadow-blue-700/25 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:h-16 md:w-16"
          data-testid="active-delivery-launcher-button"
        >
          <span className="absolute inset-0 rounded-full border-2 border-blue-400/80 animate-ping" />
          <span className="absolute inset-1 rounded-full border border-blue-200/40" />
          <Truck className="relative h-7 w-7 animate-[truck-float_2s_ease-in-out_infinite] md:h-8 md:w-8" />
          {multiple ? (
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-blue-700 bg-white px-1 text-[11px] font-bold text-blue-700">
              {orders.length}
            </span>
          ) : (
            <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-blue-700 bg-white" />
          )}
        </button>
      </div>
    </div>
  );
}