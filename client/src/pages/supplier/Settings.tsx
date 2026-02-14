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

const WEEKDAYS = [
  { value: 1, label: "Montag" },
  { value: 2, label: "Dienstag" },
  { value: 3, label: "Mittwoch" },
  { value: 4, label: "Donnerstag" },
  { value: 5, label: "Freitag" },
  { value: 6, label: "Samstag" },
  { value: 0, label: "Sonntag" },
];

export default function SupplierSettings() {
  const { currentUser } = useUser();
  const { toast } = useToast();
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

  const handleToggle = (setter: (v: boolean) => void, value: boolean, label: string) => {
    setter(value);
    toast({
      title: "Einstellung gespeichert",
      description: `${label} wurde ${value ? "aktiviert" : "deaktiviert"}.`,
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
      toast({ title: "Liefertage gespeichert", description: "Die Liefertage wurden aktualisiert." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Die Liefertage konnten nicht gespeichert werden.", variant: "destructive" });
    },
  });

  const restaurantsWithSchedules = restaurants?.map(r => {
    const days = deliverySchedules?.filter(s => s.restaurantId === r.id).map(s => s.dayOfWeek) || [];
    return { ...r, deliveryDays: days };
  }) || [];

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Einstellungen</h1>
        <p className="text-sm md:text-base text-muted-foreground">Systemeinstellungen und Benachrichtigungen verwalten</p>
      </div>

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <CalendarDays className="h-4 w-4 md:h-5 md:w-5" />
            Liefertage
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Legen Sie fest, an welchen Wochentagen Sie an einzelne Kunden liefern
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Kunde auswählen</label>
            <Select value={selectedRestaurant} onValueChange={handleRestaurantSelect}>
              <SelectTrigger data-testid="select-delivery-restaurant">
                <SelectValue placeholder="Restaurant auswählen..." />
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
              <label className="text-sm font-medium">Liefertage für diesen Kunden</label>
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
                Liefertage speichern
              </Button>
            </div>
          )}

          {restaurantsWithSchedules.filter(r => r.role === "restaurant").length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-sm font-medium text-muted-foreground">Übersicht aller Kunden</label>
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
                              {WEEKDAYS.find(w => w.value === d)?.label.slice(0, 2)}
                            </Badge>
                          ))
                      ) : (
                        <span className="text-xs text-muted-foreground">Keine Liefertage</span>
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
              Benachrichtigungen
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Legen Sie fest, welche In-App-Benachrichtigungen Sie erhalten möchten
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-4">
            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">Neue Bestellungen</Label>
                  <p className="text-xs text-muted-foreground">Bei eingehenden Bestellungen</p>
                </div>
              </div>
              <Switch
                checked={notifNewOrder}
                onCheckedChange={(v) => handleToggle(setNotifNewOrder, v, "Neue Bestellungen")}
                data-testid="switch-notif-new-order"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">Bestellstatus</Label>
                  <p className="text-xs text-muted-foreground">Bei Statusänderungen von Bestellungen</p>
                </div>
              </div>
              <Switch
                checked={notifOrderStatus}
                onCheckedChange={(v) => handleToggle(setNotifOrderStatus, v, "Bestellstatus")}
                data-testid="switch-notif-order-status"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">Neue Nachrichten</Label>
                  <p className="text-xs text-muted-foreground">Bei eingehenden Chat-Nachrichten</p>
                </div>
              </div>
              <Switch
                checked={notifNewMessage}
                onCheckedChange={(v) => handleToggle(setNotifNewMessage, v, "Neue Nachrichten")}
                data-testid="switch-notif-new-message"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">Reklamationen</Label>
                  <p className="text-xs text-muted-foreground">Bei neuen Reklamationen und Updates</p>
                </div>
              </div>
              <Switch
                checked={notifComplaint}
                onCheckedChange={(v) => handleToggle(setNotifComplaint, v, "Reklamationen")}
                data-testid="switch-notif-complaint"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Mail className="h-4 w-4 md:h-5 md:w-5" />
              E-Mail-Benachrichtigungen
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Wählen Sie, bei welchen Ereignissen Sie per E-Mail informiert werden
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-4">
            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">Neue Bestellungen</Label>
                  <p className="text-xs text-muted-foreground">E-Mail bei eingehenden Bestellungen</p>
                </div>
              </div>
              <Switch
                checked={emailNewOrder}
                onCheckedChange={(v) => handleToggle(setEmailNewOrder, v, "E-Mail Neue Bestellungen")}
                data-testid="switch-email-new-order"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">Bestellstatus</Label>
                  <p className="text-xs text-muted-foreground">E-Mail bei Statusänderungen</p>
                </div>
              </div>
              <Switch
                checked={emailOrderStatus}
                onCheckedChange={(v) => handleToggle(setEmailOrderStatus, v, "E-Mail Bestellstatus")}
                data-testid="switch-email-order-status"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">Neue Nachrichten</Label>
                  <p className="text-xs text-muted-foreground">E-Mail bei eingehenden Nachrichten</p>
                </div>
              </div>
              <Switch
                checked={emailNewMessage}
                onCheckedChange={(v) => handleToggle(setEmailNewMessage, v, "E-Mail Neue Nachrichten")}
                data-testid="switch-email-new-message"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">Reklamationen</Label>
                  <p className="text-xs text-muted-foreground">E-Mail bei Reklamations-Updates</p>
                </div>
              </div>
              <Switch
                checked={emailComplaint}
                onCheckedChange={(v) => handleToggle(setEmailComplaint, v, "E-Mail Reklamationen")}
                data-testid="switch-email-complaint"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
