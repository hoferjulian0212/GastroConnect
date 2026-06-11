import { useState } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bell, Mail, ShoppingBag, MessageSquare, AlertCircle, Monitor, Moon, LogOut, Smartphone, ChevronRight, FileBarChart } from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AccountSwitcher } from "@/components/AccountSwitcher";

export default function RestaurantSettings() {
  const { currentUser, setCurrentUser } = useUser();
  const [, setLocation] = useLocation();

  function handleLogout() {
    try { localStorage.removeItem("gastroconnect_selected_restaurant_id"); } catch {}
    try { localStorage.removeItem("gastroconnect_selected_supplier_id"); } catch {}
    setCurrentUser(null);
    queryClient.clear();
    setLocation("/");
  }
  const { toast } = useToast();
  const { isDark, setTheme } = useTheme();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, permission: pushPermission, needsInstall: pushNeedsInstall, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe, sendTest: pushSendTest } = usePushNotifications(currentUser?.id);

  const [prefs, setPrefs] = useState<NotificationPrefs>(
    () => currentUser?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS
  );

  const prefsMutation = useMutation({
    mutationFn: async (next: NotificationPrefs) =>
      apiRequest("PATCH", `/api/users/${currentUser?.id}/notification-prefs`, next),
    onSuccess: (_d, next) => {
      if (currentUser) setCurrentUser({ ...currentUser, notificationPrefs: next });
    },
    onError: () => {
      setPrefs(currentUser?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS);
      toast({
        title: lang === "de" ? "Fehler" : "Errore",
        description: lang === "de" ? "Einstellung konnte nicht gespeichert werden." : "Impossibile salvare l'impostazione.",
        variant: "destructive",
      });
    },
  });

  const handlePref = (
    channel: "push" | "email",
    key: keyof NotificationPrefs["push"],
    value: boolean,
    label: string,
  ) => {
    const next: NotificationPrefs = { ...prefs, [channel]: { ...prefs[channel], [key]: value } };
    setPrefs(next);
    prefsMutation.mutate(next);
    toast({
      title: t("common", "settingSaved"),
      description: `${label} ${t("common", "was")} ${value ? t("common", "activated") : t("common", "deactivated")}.`,
    });
  };

  const [monthlyReportEnabled, setMonthlyReportEnabled] = useState(!currentUser?.monthlyReportOptOut);

  const optOutMutation = useMutation({
    mutationFn: async (optOut: boolean) =>
      apiRequest("PATCH", `/api/users/${currentUser?.id}/monthly-report-opt-out`, { optOut }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users?role=restaurant`] });
    },
    onError: (_err, optOut) => {
      // Revert local switch state on failure so the UI does not lie.
      setMonthlyReportEnabled(optOut);
      toast({ title: "Fehler", description: "Einstellung konnte nicht gespeichert werden.", variant: "destructive" });
    },
  });

  const handleToggle = (setter: (v: boolean) => void, value: boolean, label: string) => {
    setter(value);
    toast({
      title: t("common", "settingSaved"),
      description: `${label} ${t("common", "was")} ${value ? t("common", "activated") : t("common", "deactivated")}.`,
    });
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
      <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-6">
        <h1 className="text-xl md:text-3xl font-bold text-white mb-3 md:mb-4" data-testid="text-page-title">
          {t("common", "settings")}
        </h1>
        <Link href="/restaurant/profile" data-testid="link-profile-card" className="block group">
          <div className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.10] hover:border-white/[0.15] transition-all duration-200 cursor-pointer">
            <div className="relative shrink-0">
              <Avatar className="h-12 w-12 md:h-14 md:w-14 ring-2 ring-white/10">
                {currentUser?.profileImageUrl ? (
                  <AvatarImage src={currentUser.profileImageUrl} alt={currentUser.name} />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-white text-base md:text-lg font-semibold">
                  {(currentUser?.companyName || currentUser?.name || "?").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 md:h-4 md:w-4 rounded-full bg-green-500 border-2 border-[#161921]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm md:text-base font-semibold text-white truncate" data-testid="text-profile-name">
                {currentUser?.companyName || currentUser?.name}
              </p>
              <p className="text-xs md:text-sm text-white/50 truncate">{currentUser?.email}</p>
              <p className="text-[11px] md:text-xs text-white/40 mt-0.5 group-hover:text-white/60 transition-colors">
                {lang === "de" ? "Profil bearbeiten" : "Modifica profilo"}
              </p>
            </div>
            <div className="h-9 w-9 rounded-full bg-white/[0.08] border border-white/[0.10] flex items-center justify-center shrink-0 group-hover:bg-white/[0.15] group-hover:translate-x-0.5 transition-all">
              <ChevronRight className="h-4 w-4 text-white/70" />
            </div>
          </div>
        </Link>
      </div></HeroPortal>

      <AccountSwitcher />

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Bell className="h-4 w-4 md:h-5 md:w-5" />
              {t("settings", "notifications")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-4">
            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-sm font-medium">{t("settings", "orderConfirmations")}</Label>
              </div>
              <Switch
                checked={prefs.push.orderStatus}
                onCheckedChange={(v) => handlePref("push", "orderStatus", v, t("settings", "orderConfirmations"))}
                data-testid="switch-notif-order-status"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-sm font-medium">{t("settings", "newOrders")}</Label>
              </div>
              <Switch
                checked={prefs.push.newOrder}
                onCheckedChange={(v) => handlePref("push", "newOrder", v, t("settings", "newOrders"))}
                data-testid="switch-notif-new-order"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-sm font-medium">{t("settings", "newMessages")}</Label>
              </div>
              <Switch
                checked={prefs.push.newMessage}
                onCheckedChange={(v) => handlePref("push", "newMessage", v, t("settings", "newMessages"))}
                data-testid="switch-notif-new-message"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-sm font-medium">{t("settings", "complaintsNotif")}</Label>
              </div>
              <Switch
                checked={prefs.push.complaint}
                onCheckedChange={(v) => handlePref("push", "complaint", v, t("settings", "complaintsNotif"))}
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
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-4">
            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-sm font-medium">{t("settings", "orderConfirmations")}</Label>
              </div>
              <Switch
                checked={prefs.email.orderStatus}
                onCheckedChange={(v) => handlePref("email", "orderStatus", v, `${t("settings", "emailNotifications")} ${t("settings", "orderConfirmations")}`)}
                data-testid="switch-email-order-status"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-sm font-medium">{t("settings", "newOrders")}</Label>
              </div>
              <Switch
                checked={prefs.email.newOrder}
                onCheckedChange={(v) => handlePref("email", "newOrder", v, `${t("settings", "emailNotifications")} ${t("settings", "newOrders")}`)}
                data-testid="switch-email-new-order"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-sm font-medium">{t("settings", "newMessages")}</Label>
              </div>
              <Switch
                checked={prefs.email.newMessage}
                onCheckedChange={(v) => handlePref("email", "newMessage", v, `${t("settings", "emailNotifications")} ${t("settings", "newMessages")}`)}
                data-testid="switch-email-new-message"
              />
            </div>

            <div className="flex items-center justify-between gap-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-sm font-medium">{t("settings", "complaintsNotif")}</Label>
              </div>
              <Switch
                checked={prefs.email.complaint}
                onCheckedChange={(v) => handlePref("email", "complaint", v, `${t("settings", "emailNotifications")} ${t("settings", "complaintsNotif")}`)}
                data-testid="switch-email-complaint"
              />
            </div>
          </CardContent>
        </Card>

        {(pushSupported || pushNeedsInstall) && (
          <Card>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Smartphone className="h-4 w-4 md:h-5 md:w-5" />
                {t("settings", "pushNotifications")}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">{t("settings", "pushNotificationsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              {pushNeedsInstall ? (
                <div className="rounded-lg bg-muted/50 p-3 text-sm" data-testid="push-ios-install">
                  <p className="font-medium mb-1">{t("settings", "pushIosInstallTitle")}</p>
                  <p className="text-muted-foreground text-xs md:text-sm">{t("settings", "pushIosInstallDesc")}</p>
                </div>
              ) : pushPermission === "denied" ? (
                <p className="text-sm text-muted-foreground">{t("settings", "pushDenied")}</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Label className="text-sm font-medium">
                        {pushSubscribed ? t("settings", "pushDisable") : t("settings", "pushEnable")}
                      </Label>
                    </div>
                    <Switch
                      checked={pushSubscribed}
                      onCheckedChange={async (checked) => {
                        if (checked) {
                          const ok = await pushSubscribe();
                          toast({
                            title: ok ? t("settings", "pushEnabled") : t("settings", "pushDenied"),
                            description: ok ? t("settings", "pushEnabledDesc") : t("settings", "pushDeniedDesc"),
                          });
                        } else {
                          await pushUnsubscribe();
                          toast({ title: t("settings", "pushDisabled"), description: t("settings", "pushDisabledDesc") });
                        }
                      }}
                      data-testid="switch-push-notifications"
                    />
                  </div>
                  {pushSubscribed && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={async () => {
                        const ok = await pushSendTest();
                        toast({
                          title: ok ? t("settings", "pushTestSent") : t("settings", "pushTestNoSubs"),
                          description: ok ? t("settings", "pushTestSentDesc") : t("settings", "pushTestNoSubsDesc"),
                          variant: ok ? undefined : "destructive",
                        });
                      }}
                      data-testid="button-push-test"
                    >
                      <Bell className="h-4 w-4" />
                      {t("settings", "pushTest")}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <FileBarChart className="h-4 w-4 md:h-5 md:w-5" />
            Monatsberichte
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Erhalte am 1. jedes Monats einen automatisch erstellten Vergleichsbericht für den Vormonat mit Top-Produkten, Einsparpotenzial und verpassten Aktionen.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
              <Label className="text-sm font-medium">Monatlichen Vergleichsbericht erhalten</Label>
            </div>
            <Switch
              checked={monthlyReportEnabled}
              onCheckedChange={(v) => {
                setMonthlyReportEnabled(v);
                optOutMutation.mutate(!v);
                toast({
                  title: t("common", "settingSaved"),
                  description: `Monatsbericht ${t("common", "was")} ${v ? t("common", "activated") : t("common", "deactivated")}.`,
                });
              }}
              data-testid="switch-monthly-report"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-center max-w-md mx-auto w-full">
        <Card className="flex-1">
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Moon className="h-4 w-4 text-muted-foreground shrink-0" />
              <Label className="text-sm font-medium">{t("settings", "darkMode")}</Label>
            </div>
            <Switch
              checked={isDark}
              onCheckedChange={(v) => {
                setTheme(v);
                handleToggle(() => {}, v, t("settings", "darkMode"));
              }}
              data-testid="switch-dark-mode"
            />
          </CardContent>
        </Card>

        <Card className="flex-1 border-destructive/30">
          <CardContent className="p-3 flex items-center justify-center">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-destructive font-medium transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm font-semibold">{t("common", "logout")}</span>
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
