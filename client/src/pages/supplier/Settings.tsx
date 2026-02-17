import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Mail, ShoppingBag, MessageSquare, AlertCircle, CalendarDays, Save, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User, DeliverySchedule } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getWeekdays, getWeekdayLabel } from "@/lib/translations";

export default function SupplierSettings() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  const [emailNewOrder, setEmailNewOrder] = useState(true);
  const [emailOrderStatus, setEmailOrderStatus] = useState(true);
  const [emailNewMessage, setEmailNewMessage] = useState(false);
  const [emailComplaint, setEmailComplaint] = useState(true);

  const [notifNewOrder, setNotifNewOrder] = useState(true);
  const [notifOrderStatus, setNotifOrderStatus] = useState(true);
  const [notifNewMessage, setNotifNewMessage] = useState(true);
  const [notifComplaint, setNotifComplaint] = useState(true);

  const WEEKDAYS = getWeekdays(lang);

  const handleToggle = (setter: (v: boolean) => void, value: boolean, label: string) => {
    setter(value);
    toast({
      title: t("common", "settingSaved"),
      description: `${label} ${t("common", "was")} ${value ? t("common", "activated") : t("common", "deactivated")}.`,
    });
  };

  const { data: restaurants } = useQuery<User[]>({
    queryKey: ["/api/users?role=restaurant"],
  });

  const { data: deliverySchedules } = useQuery<(DeliverySchedule & { restaurant: User })[]>({
    queryKey: [`/api/delivery-schedules?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const handleRestaurantSelect = (restaurantId: string) => {
    setSelectedRestaurant(restaurantId);
    const existing = deliverySchedules?.filter(s => s.restaurantId === restaurantId).map(s => s.dayOfWeek) || [];
    setSelectedDays(existing);
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/delivery-schedules", {
        supplierId: currentUser?.id,
        restaurantId: selectedRestaurant,
        days: selectedDays,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/delivery-schedules?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/delivery-schedules/restaurant?supplierId=${currentUser?.id}&restaurantId=${selectedRestaurant}`] });
      toast({ title: t("settings", "deliveryDaysSaved"), description: t("settings", "deliveryDaysSavedDesc") });
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("settings", "deliveryDaysSaveError"), variant: "destructive" });
    },
  });

  const restaurantsWithSchedules = restaurants?.map(r => {
    const days = deliverySchedules?.filter(s => s.restaurantId === r.id).map(s => s.dayOfWeek) || [];
    return { ...r, deliveryDays: days };
  }) || [];

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">{t("common", "settings")}</h1>
        <p className="text-sm md:text-base text-muted-foreground">{t("settings", "manageSettings")}</p>
      </div>

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <CalendarDays className="h-4 w-4 md:h-5 md:w-5" />
            {t("settings", "deliveryDays")}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {t("settings", "deliveryDaysDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("settings", "selectCustomer")}</label>
            <Select value={selectedRestaurant} onValueChange={handleRestaurantSelect}>
              <SelectTrigger data-testid="select-delivery-restaurant">
                <SelectValue placeholder={t("settings", "selectRestaurantPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {restaurants?.filter(r => r.role === "restaurant").map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.companyName || r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedRestaurant && (
            <div className="space-y-3">
              <label className="text-sm font-medium">{t("settings", "deliveryDaysForCustomer")}</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {WEEKDAYS.map(day => (
                  <label
                    key={day.value}
                    className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                      selectedDays.includes(day.value)
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                    data-testid={`checkbox-day-${day.value}`}
                  >
                    <Checkbox
                      checked={selectedDays.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                    />
                    <span className="text-sm">{day.label}</span>
                  </label>
                ))}
              </div>
              <Button
                onClick={() => saveScheduleMutation.mutate()}
                disabled={saveScheduleMutation.isPending}
                className="gap-2"
                data-testid="button-save-delivery-days"
              >
                {saveScheduleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("settings", "saveDeliveryDays")}
              </Button>
            </div>
          )}

          {restaurantsWithSchedules.filter(r => r.role === "restaurant").length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-sm font-medium text-muted-foreground">{t("settings", "customerOverview")}</label>
              <div className="space-y-2">
                {restaurantsWithSchedules.filter(r => r.role === "restaurant").map(r => (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/50 cursor-pointer transition-colors ${
                      selectedRestaurant === r.id ? "ring-1 ring-primary" : ""
                    }`}
                    onClick={() => handleRestaurantSelect(r.id)}
                    data-testid={`delivery-restaurant-${r.id}`}
                  >
                    <span className="text-sm font-medium truncate">{r.companyName || r.name}</span>
                    <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
                      {r.deliveryDays.length > 0 ? (
                        r.deliveryDays
                          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                          .map(d => (
                            <Badge key={d} variant="secondary" className="text-[10px] px-1.5">
                              {getWeekdayLabel(d, lang).slice(0, 2)}
                            </Badge>
                          ))
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("settings", "noDeliveryDays")}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Bell className="h-4 w-4 md:h-5 md:w-5" />
              {t("settings", "notifications")}
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {t("settings", "notificationsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-4">
            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "newOrders")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "supplierNewOrdersDesc")}</p>
                </div>
              </div>
              <Switch
                checked={notifNewOrder}
                onCheckedChange={(v) => handleToggle(setNotifNewOrder, v, t("settings", "newOrders"))}
                data-testid="switch-notif-new-order"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "orderStatus")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "orderStatusDesc")}</p>
                </div>
              </div>
              <Switch
                checked={notifOrderStatus}
                onCheckedChange={(v) => handleToggle(setNotifOrderStatus, v, t("settings", "orderStatus"))}
                data-testid="switch-notif-order-status"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "newMessages")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "newMessagesDesc")}</p>
                </div>
              </div>
              <Switch
                checked={notifNewMessage}
                onCheckedChange={(v) => handleToggle(setNotifNewMessage, v, t("settings", "newMessages"))}
                data-testid="switch-notif-new-message"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "complaintsNotif")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "supplierComplaintsDesc")}</p>
                </div>
              </div>
              <Switch
                checked={notifComplaint}
                onCheckedChange={(v) => handleToggle(setNotifComplaint, v, t("settings", "complaintsNotif"))}
                data-testid="switch-notif-complaint"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Mail className="h-4 w-4 md:h-5 md:w-5" />
              {t("settings", "emailNotifications")}
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {t("settings", "emailNotificationsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-4">
            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "newOrders")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "emailSupplierNewOrders")}</p>
                </div>
              </div>
              <Switch
                checked={emailNewOrder}
                onCheckedChange={(v) => handleToggle(setEmailNewOrder, v, lang === "de" ? "E-Mail Neue Bestellungen" : "E-mail nuovi ordini")}
                data-testid="switch-email-new-order"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "orderStatus")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "emailOrderStatus")}</p>
                </div>
              </div>
              <Switch
                checked={emailOrderStatus}
                onCheckedChange={(v) => handleToggle(setEmailOrderStatus, v, lang === "de" ? "E-Mail Bestellstatus" : "E-mail stato ordini")}
                data-testid="switch-email-order-status"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "newMessages")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "emailSupplierNewMessages")}</p>
                </div>
              </div>
              <Switch
                checked={emailNewMessage}
                onCheckedChange={(v) => handleToggle(setEmailNewMessage, v, lang === "de" ? "E-Mail Neue Nachrichten" : "E-mail nuovi messaggi")}
                data-testid="switch-email-new-message"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "complaintsNotif")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "emailSupplierComplaints")}</p>
                </div>
              </div>
              <Switch
                checked={emailComplaint}
                onCheckedChange={(v) => handleToggle(setEmailComplaint, v, lang === "de" ? "E-Mail Reklamationen" : "E-mail reclami")}
                data-testid="switch-email-complaint"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
