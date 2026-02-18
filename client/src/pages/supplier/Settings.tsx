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
import { Input } from "@/components/ui/input";
import { Bell, Mail, ShoppingBag, MessageSquare, AlertCircle, CalendarDays, Save, Loader2, Package, Trash2, Monitor, Moon, LogOut } from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import type { User, DeliverySchedule, Product, CustomMinOrderQuantity } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getWeekdays, getWeekdayLabel } from "@/lib/translations";

export default function SupplierSettings() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { isDark, setTheme } = useTheme();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [moqRestaurant, setMoqRestaurant] = useState<string>("");
  const [moqProduct, setMoqProduct] = useState<string>("");
  const [moqValue, setMoqValue] = useState<number>(1);

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

  const { data: supplierProducts } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: customMoqs } = useQuery<(CustomMinOrderQuantity & { product: Product; restaurant: User })[]>({
    queryKey: [`/api/custom-moq?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const saveMoqMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/custom-moq", {
        productId: moqProduct,
        supplierId: currentUser?.id,
        restaurantId: moqRestaurant,
        minOrderQuantity: moqValue,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-moq?supplierId=${currentUser?.id}`] });
      toast({ title: t("supplierProducts", "moqSaved") });
      setMoqRestaurant("");
      setMoqProduct("");
      setMoqValue(1);
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const deleteMoqMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/custom-moq/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-moq?supplierId=${currentUser?.id}`] });
      toast({ title: t("supplierProducts", "moqDeleted") });
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

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Package className="h-4 w-4 md:h-5 md:w-5" />
            {t("supplierProducts", "customMoq")}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {t("supplierProducts", "customMoqDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-0 md:pt-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={moqRestaurant} onValueChange={setMoqRestaurant}>
              <SelectTrigger data-testid="select-moq-restaurant">
                <SelectValue placeholder={t("supplierProducts", "selectRestaurant")} />
              </SelectTrigger>
              <SelectContent>
                {restaurants?.filter(r => r.role === "restaurant").map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.companyName || r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={moqProduct} onValueChange={setMoqProduct}>
              <SelectTrigger data-testid="select-moq-product">
                <SelectValue placeholder={t("supplierProducts", "selectProductPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {supplierProducts?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.unit})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              value={moqValue}
              onChange={(e) => setMoqValue(parseInt(e.target.value) || 1)}
              placeholder={t("supplierProducts", "minOrderQuantity")}
              data-testid="input-moq-value"
            />
            <Button
              onClick={() => saveMoqMutation.mutate()}
              disabled={!moqRestaurant || !moqProduct || moqValue < 1 || saveMoqMutation.isPending}
              className="gap-2"
              data-testid="button-save-moq"
            >
              {saveMoqMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("common", "save")}
            </Button>
          </div>

          {customMoqs && customMoqs.length > 0 ? (
            <div className="space-y-2 pt-2 border-t border-border">
              {customMoqs.map(moq => (
                <div key={moq.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/50" data-testid={`moq-entry-${moq.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{moq.product?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {moq.restaurant?.companyName || moq.restaurant?.name} — {t("supplierProducts", "minOrderQuantityShort")} {moq.minOrderQuantity} {moq.product?.unit}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMoqMutation.mutate(moq.id)}
                    disabled={deleteMoqMutation.isPending}
                    data-testid={`button-delete-moq-${moq.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">{t("supplierProducts", "noCustomMoq")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("supplierProducts", "noCustomMoqDesc")}</p>
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

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Monitor className="h-4 w-4 md:h-5 md:w-5" />
            {t("settings", "appearance")}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {t("settings", "appearanceDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-4">
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <Moon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <Label className="text-sm font-medium">{t("settings", "darkMode")}</Label>
                <p className="text-xs text-muted-foreground">{t("settings", "darkModeDesc")}</p>
              </div>
            </div>
            <Switch
              checked={isDark}
              onCheckedChange={(v) => {
                setTheme(v);
                handleToggle(() => {}, v, t("settings", "darkMode"));
              }}
              data-testid="switch-dark-mode"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardContent className="p-3 md:p-6">
          <Link
            href="/"
            className="flex items-center gap-3 py-2 text-destructive font-medium transition-colors rounded-lg"
            data-testid="button-logout"
          >
            <LogOut className="h-5 w-5" />
            <div>
              <span className="text-sm font-semibold">{t("common", "logout")}</span>
              <p className="text-xs text-destructive/70">{t("settings", "logoutDesc")}</p>
            </div>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
