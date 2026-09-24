import type { Lang } from "@/context/LanguageContext";
import { getOrderStatus } from "@/lib/translations";

export const ORDER_STATUS_FILTERS = [
  { key: "all", dot: "bg-gray-400" },
  { key: "pending", dot: "bg-yellow-500" },
  { key: "confirmed", dot: "bg-blue-500" },
  { key: "scheduled", dot: "bg-indigo-500" },
  { key: "in_delivery", dot: "bg-purple-500" },
  { key: "delivered", dot: "bg-green-500" },
  { key: "cancelled", dot: "bg-red-500" },
  { key: "not_deliverable", dot: "bg-red-500" },
] as const;

export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number]["key"];

export function getOrderStatusFilterLabel(
  status: OrderStatusFilter,
  lang: Lang,
  isSupplier = false,
): string {
  return status === "all"
    ? lang === "de"
      ? "Alle"
      : "Tutti"
    : getOrderStatus(status, lang, isSupplier);
}

export function orderStatusQuery(search: string, status: OrderStatusFilter): string {
  const params = new URLSearchParams(search);
  if (status === "all") {
    params.delete("status");
  } else {
    params.set("status", status);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}