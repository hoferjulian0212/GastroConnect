import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Mail, ShoppingBag, MessageSquare, AlertCircle, Monitor, Moon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";

export default function RestaurantSettings() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { isDark, setTheme } = useTheme();
  const { lang } = useLanguage();
  const t = useT(lang);

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
      title: t("common", "settingSaved"),
      description: `${label} ${t("common", "was")} ${value ? t("common", "activated") : t("common", "deactivated")}.`,
    });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">{t("common", "settings")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground">{t("settings", "manageSettings")}</p>
      </div>

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
                  <Label className="text-sm font-medium">{t("settings", "orderConfirmations")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "orderConfirmationsDesc")}</p>
                </div>
              </div>
              <Switch
                checked={notifOrderStatus}
                onCheckedChange={(v) => handleToggle(setNotifOrderStatus, v, t("settings", "orderConfirmations"))}
                data-testid="switch-notif-order-status"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "newOrders")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "newOrdersDesc")}</p>
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
                  <p className="text-xs text-muted-foreground">{t("settings", "complaintsNotifDesc")}</p>
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
                  <Label className="text-sm font-medium">{t("settings", "orderConfirmations")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "emailOrderConfirmations")}</p>
                </div>
              </div>
              <Switch
                checked={emailOrderStatus}
                onCheckedChange={(v) => handleToggle(setEmailOrderStatus, v, `${t("settings", "emailNotifications")} ${t("settings", "orderConfirmations")}`)}
                data-testid="switch-email-order-status"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "newOrders")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "emailNewOrders")}</p>
                </div>
              </div>
              <Switch
                checked={emailNewOrder}
                onCheckedChange={(v) => handleToggle(setEmailNewOrder, v, `${t("settings", "emailNotifications")} ${t("settings", "newOrders")}`)}
                data-testid="switch-email-new-order"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "newMessages")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "emailNewMessages")}</p>
                </div>
              </div>
              <Switch
                checked={emailNewMessage}
                onCheckedChange={(v) => handleToggle(setEmailNewMessage, v, `${t("settings", "emailNotifications")} ${t("settings", "newMessages")}`)}
                data-testid="switch-email-new-message"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{t("settings", "complaintsNotif")}</Label>
                  <p className="text-xs text-muted-foreground">{t("settings", "emailComplaints")}</p>
                </div>
              </div>
              <Switch
                checked={emailComplaint}
                onCheckedChange={(v) => handleToggle(setEmailComplaint, v, `${t("settings", "emailNotifications")} ${t("settings", "complaintsNotif")}`)}
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
    </div>
  );
}
