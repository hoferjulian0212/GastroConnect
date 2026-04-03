import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";
import { format } from "date-fns";
import { de, it } from "date-fns/locale";
import { ArrowLeft, Clock, Package, Truck, CheckCircle, XCircle, AlertTriangle, ShoppingBag, Check, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { OrderWithDetails, OrderStatusHistoryWithUser } from "@shared/schema";

export default function OrderDetail() {
  const [, setLocation] = useLocation();
  const [matchRestaurant, paramsR] = useRoute("/restaurant/orders/:id");
  const [matchSupplier, paramsS] = useRoute("/supplier/orders/:id");
  const params = matchRestaurant ? paramsR : paramsS;
  const orderId = params?.id;
  const { currentRole } = useUser();
  const { lang } = useLanguage();
  const t = useT();
  const dateLocale = lang === "de" ? de : it;
  const isSupplier = currentRole === "supplier";

  const [activeTab, setActiveTab] = useState<"updates" | "details">("updates");

  const { data: order, isLoading } = useQuery<OrderWithDetails>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error("Failed to fetch order");
      return res.json();
    },
    enabled: !!orderId,
  });

  const { data: statusHistory } = useQuery<OrderStatusHistoryWithUser[]>({
    queryKey: ["/api/orders", orderId, "status-history"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/status-history`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!orderId,
  });

  const goBack = () => {
    setLocation(`/${currentRole}/orders`);
  };

  const getStatusIcon = (status: string, size = "h-5 w-5") => {
    switch (status) {
      case "pending": return <Clock className={size} />;
      case "confirmed": return <Package className={size} />;
      case "partially_confirmed": return <AlertTriangle className={size} />;
      case "in_delivery": return <Truck className={size} />;
      case "delivered": return <CheckCircle className={size} />;
      case "cancelled": return <XCircle className={size} />;
      default: return <ShoppingBag className={size} />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 dark:bg-yellow-900/40";
      case "confirmed": return "bg-blue-100 dark:bg-blue-900/40";
      case "partially_confirmed": return "bg-orange-100 dark:bg-orange-900/40";
      case "in_delivery": return "bg-purple-100 dark:bg-purple-900/40";
      case "delivered": return "bg-green-100 dark:bg-green-900/40";
      case "cancelled": return "bg-red-100 dark:bg-red-900/40";
      default: return "bg-muted";
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case "pending": return "text-yellow-700 dark:text-yellow-400";
      case "confirmed": return "text-blue-700 dark:text-blue-400";
      case "partially_confirmed": return "text-orange-700 dark:text-orange-400";
      case "in_delivery": return "text-purple-700 dark:text-purple-400";
      case "delivered": return "text-green-700 dark:text-green-400";
      case "cancelled": return "text-red-700 dark:text-red-400";
      default: return "text-muted-foreground";
    }
  };

  const getTimelineDotColor = (status: string, isCompleted: boolean) => {
    if (!isCompleted) return "border-muted-foreground/30 bg-background";
    switch (status) {
      case "pending": return "border-yellow-500 bg-yellow-500";
      case "confirmed": return "border-blue-500 bg-blue-500";
      case "partially_confirmed": return "border-orange-500 bg-orange-500";
      case "in_delivery": return "border-purple-500 bg-purple-500";
      case "delivered": return "border-green-500 bg-green-500";
      case "cancelled": return "border-red-500 bg-red-500";
      default: return "border-muted-foreground bg-muted-foreground";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "confirmed": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "partially_confirmed": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "in_delivery": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getTimelineDescription = (toStatus: string) => {
    if (lang === "de") {
      switch (toStatus) {
        case "pending": return "Bestellung wurde aufgegeben";
        case "confirmed": return "Bestellung wurde bestätigt";
        case "partially_confirmed": return "Bestellung wurde teilweise bestätigt";
        case "in_delivery": return "Bestellung ist unterwegs";
        case "delivered": return "Bestellung wurde geliefert";
        case "cancelled": return "Bestellung wurde storniert";
        default: return "";
      }
    }
    switch (toStatus) {
      case "pending": return "Ordine effettuato";
      case "confirmed": return "Ordine confermato";
      case "partially_confirmed": return "Ordine parzialmente confermato";
      case "in_delivery": return "Ordine in consegna";
      case "delivered": return "Ordine consegnato";
      case "cancelled": return "Ordine annullato";
      default: return "";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-4 w-full max-w-sm px-6">
            <Skeleton className="h-20 w-20 rounded-full mx-auto" />
            <Skeleton className="h-6 w-32 mx-auto" />
            <Skeleton className="h-10 w-48 mx-auto" />
            <Skeleton className="h-4 w-40 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="p-4">
          <button onClick={goBack} className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">{lang === "de" ? "Bestellung nicht gefunden" : "Ordine non trovato"}</p>
        </div>
      </div>
    );
  }

  const counterpartyName = isSupplier
    ? (order.restaurant?.companyName || order.restaurant?.name || "")
    : (order.supplier?.companyName || order.supplier?.name || "");

  const timeline = statusHistory && statusHistory.length > 0
    ? statusHistory
    : [{ id: "created", orderId: order.id, fromStatus: null, toStatus: "pending", changedBy: null, createdAt: order.createdAt }];

  const statusSteps = ["pending", "confirmed", "in_delivery", "delivered"];
  const currentStepIndex = statusSteps.indexOf(order.status === "partially_confirmed" ? "confirmed" : order.status);

  return (
    <div className="min-h-dvh bg-background flex flex-col" data-testid="page-order-detail">
      <div className="flex items-center justify-between p-4 pb-0">
        <button onClick={goBack} className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors" data-testid="button-back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors" data-testid="button-more-options">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col items-center pt-6 pb-4 px-6">
        <div className={`h-16 w-16 rounded-full ${getStatusBg(order.status)} flex items-center justify-center mb-3`}>
          <div className={getStatusTextColor(order.status)}>
            {getStatusIcon(order.status, "h-7 w-7")}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-1">{counterpartyName}</p>
        <p className="text-3xl font-bold tracking-tight">{Number(order.totalAmount).toFixed(2)}€</p>
        <p className="text-sm text-muted-foreground mt-1">
          {lang === "de" ? "Bestellung" : "Ordine"} #{order.id.slice(0, 8)}
        </p>

        <div className="mt-3">
          <Badge className={`${getStatusBadgeColor(order.status)} rounded-full px-3 py-1 text-xs font-medium`} variant="outline">
            {getStatusIcon(order.status, "h-3.5 w-3.5 mr-1")}
            {getOrderStatus(order.status, lang, isSupplier)}
          </Badge>
        </div>
      </div>

      <div className="border-b border-border/40" />

      <div className="px-6 pt-4">
        <div className="flex bg-muted/50 rounded-full p-1">
          <button
            onClick={() => setActiveTab("updates")}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-all ${activeTab === "updates" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            data-testid="tab-updates"
          >
            {lang === "de" ? "Updates" : "Aggiornamenti"}
          </button>
          <button
            onClick={() => setActiveTab("details")}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-all ${activeTab === "details" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            data-testid="tab-details"
          >
            {lang === "de" ? "Details" : "Dettagli"}
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 pt-5 pb-8 overflow-auto">
        {activeTab === "updates" && (
          <div className="space-y-0" data-testid="section-updates">
            {timeline.map((entry: any, index: number) => {
              const isLast = index === timeline.length - 1;
              const isCompleted = true;

              return (
                <div key={entry.id} className="flex gap-3" data-testid={`timeline-entry-${index}`}>
                  <div className="flex flex-col items-center">
                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 ${getTimelineDotColor(entry.toStatus, isCompleted)}`}>
                      {isCompleted && <Check className="h-3 w-3 text-white" />}
                    </div>
                    {!isLast && (
                      <div className="w-0.5 h-12 bg-border/60 my-1" />
                    )}
                  </div>
                  <div className="pb-6">
                    <p className={`text-sm font-medium ${getStatusTextColor(entry.toStatus)}`}>
                      {format(new Date(entry.createdAt), "EEEE, dd. MMMM yyyy, HH:mm", { locale: dateLocale })}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {getTimelineDescription(entry.toStatus)}
                    </p>
                    {entry.changedByUser && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {lang === "de" ? "von" : "da"} {entry.changedByUser.name}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {order.status !== "cancelled" && order.status !== "delivered" && (
              <>
                {statusSteps.slice(currentStepIndex + 1).map((step, i) => (
                  <div key={step} className="flex gap-3" data-testid={`timeline-future-${step}`}>
                    <div className="flex flex-col items-center">
                      <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/20 bg-background shrink-0" />
                      {i < statusSteps.length - currentStepIndex - 2 && (
                        <div className="w-0.5 h-12 bg-border/30 my-1" />
                      )}
                    </div>
                    <div className="pb-6">
                      <p className="text-sm text-muted-foreground/50">
                        {getTimelineDescription(step)}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === "details" && (
          <div className="space-y-5" data-testid="section-details">
            <div className="rounded-2xl bg-muted/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/30">
                <p className="text-sm font-semibold">{lang === "de" ? "Produkte" : "Prodotti"}</p>
              </div>
              <div className="divide-y divide-border/20">
                {order.items?.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3" data-testid={`detail-item-${item.id}`}>
                    {item.productImageUrl ? (
                      <img src={item.productImageUrl} alt="" className="h-10 w-10 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity}x {Number(item.unitPrice).toFixed(2)}€
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{Number(item.totalPrice).toFixed(2)}€</p>
                      {item.confirmedQuantity !== null && item.confirmedQuantity !== undefined && item.confirmedQuantity !== item.quantity && (
                        <p className="text-xs text-orange-600 dark:text-orange-400">
                          {lang === "de" ? "Bestätigt" : "Confermato"}: {item.confirmedQuantity}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-border/30 flex justify-between items-center">
                <p className="text-sm font-semibold">{lang === "de" ? "Gesamt" : "Totale"}</p>
                <p className="text-base font-bold">{Number(order.totalAmount).toFixed(2)}€</p>
              </div>
            </div>

            <div className="rounded-2xl bg-muted/30 overflow-hidden">
              <div className="divide-y divide-border/20">
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Bestell-Nr." : "Nr. Ordine"}</p>
                  <p className="text-sm font-medium truncate text-right">#{order.id.slice(0, 8)}</p>
                </div>
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{isSupplier ? (lang === "de" ? "Betrieb" : "Azienda") : (lang === "de" ? "Händler" : "Commerciante")}</p>
                  <p className="text-sm font-medium truncate text-right">{counterpartyName}</p>
                </div>
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Erstellt am" : "Creato il"}</p>
                  <p className="text-sm font-medium shrink-0">{format(new Date(order.createdAt), "dd.MM.yyyy, HH:mm", { locale: dateLocale })}</p>
                </div>
                {order.requestedDeliveryDate && (
                  <div className="flex justify-between items-center gap-2 px-4 py-3">
                    <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Lieferdatum" : "Data consegna"}</p>
                    <p className="text-sm font-medium shrink-0">
                      {format(new Date(order.requestedDeliveryDate + "T00:00:00"), "dd.MM.yyyy", { locale: dateLocale })}
                    </p>
                  </div>
                )}
                {order.notes && (
                  <div className="px-4 py-3">
                    <p className="text-sm text-muted-foreground mb-1">{lang === "de" ? "Notizen" : "Note"}</p>
                    <p className="text-sm">{order.notes}</p>
                  </div>
                )}
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Artikel" : "Articoli"}</p>
                  <p className="text-sm font-medium shrink-0">{order.items?.length || 0}</p>
                </div>
              </div>
            </div>

            {order.createdByUser && (
              <div className="rounded-2xl bg-muted/30 overflow-hidden">
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Erstellt von" : "Creato da"}</p>
                  <p className="text-sm font-medium truncate text-right">{order.createdByUser.name}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
