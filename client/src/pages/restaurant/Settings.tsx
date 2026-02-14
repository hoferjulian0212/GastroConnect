import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Bell, Mail, ShoppingBag, MessageSquare, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function RestaurantSettings() {
  const { currentUser } = useUser();
  const { toast } = useToast();

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

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Einstellungen</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Systemeinstellungen und Benachrichtigungen verwalten</p>
      </div>

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
                  <Label className="text-sm font-medium">Bestellbestätigungen</Label>
                  <p className="text-xs text-muted-foreground">Bei Statusänderungen Ihrer Bestellungen</p>
                </div>
              </div>
              <Switch
                checked={notifOrderStatus}
                onCheckedChange={(v) => handleToggle(setNotifOrderStatus, v, "Bestellbestätigungen")}
                data-testid="switch-notif-order-status"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">Neue Bestellungen</Label>
                  <p className="text-xs text-muted-foreground">Wenn eine neue Bestellung aufgegeben wird</p>
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
                  <p className="text-xs text-muted-foreground">Bei Updates zu Ihren Reklamationen</p>
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
                  <Label className="text-sm font-medium">Bestellbestätigungen</Label>
                  <p className="text-xs text-muted-foreground">E-Mail bei Statusänderungen</p>
                </div>
              </div>
              <Switch
                checked={emailOrderStatus}
                onCheckedChange={(v) => handleToggle(setEmailOrderStatus, v, "E-Mail Bestellbestätigungen")}
                data-testid="switch-email-order-status"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">Neue Bestellungen</Label>
                  <p className="text-xs text-muted-foreground">E-Mail bei neuen Bestellungen</p>
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
