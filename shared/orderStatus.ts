export const ORDER_STATUS_VALUES = [
  "pending",
  "confirmed",
  "scheduled",
  "in_delivery",
  "delivered",
  "cancelled",
  "not_deliverable",
] as const;

export type OrderStatus = typeof ORDER_STATUS_VALUES[number];

export const ORDER_STATUS_META: Record<OrderStatus, {
  labelDe: string;
  labelIt: string;
  tone: "amber" | "indigo" | "emerald" | "red";
}> = {
  pending: { labelDe: "Neu", labelIt: "Nuovo", tone: "amber" },
  confirmed: { labelDe: "Bestätigt", labelIt: "Confermato", tone: "indigo" },
  scheduled: { labelDe: "Geplant", labelIt: "Pianificato", tone: "indigo" },
  in_delivery: { labelDe: "Unterwegs", labelIt: "In consegna", tone: "indigo" },
  delivered: { labelDe: "Geliefert", labelIt: "Consegnato", tone: "emerald" },
  cancelled: { labelDe: "Storniert", labelIt: "Annullato", tone: "red" },
  not_deliverable: { labelDe: "Nicht zustellbar", labelIt: "Non consegnabile", tone: "red" },
};

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUS_VALUES as readonly string[]).includes(value);
}