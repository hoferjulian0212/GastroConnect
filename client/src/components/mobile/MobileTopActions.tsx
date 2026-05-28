import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Bell,
  ShoppingCart,
  Settings as SettingsIcon,
  MessageSquare,
  ShoppingBag,
  AlertCircle,
  MessageCircle,
  CheckCheck,
  ExternalLink,
  Search as SearchIcon,
  MoreHorizontal,
  User as UserIcon,
  HelpCircle,
} from "lucide-react";
import { openGlobalSearch } from "@/components/GlobalSearch";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { Notification } from "@shared/schema";

interface MobileTopActionsProps {
  variant?: "dark" | "light";
  hideCart?: boolean;
  className?: string;
}

interface OverflowAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: number;
  testId: string;
}

const ACTION_BTN_DARK =
  "relative shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/10 text-white hover:bg-white/15 active:bg-white/20 transition-colors before:absolute before:inset-[-2px] before:content-['']";

const ACTION_BTN_LIGHT =
  "relative shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full bg-foreground/[0.06] text-foreground hover:bg-foreground/10 active:bg-foreground/15 transition-colors before:absolute before:inset-[-2px] before:content-['']";

export function MobileTopActions({
  variant = "dark",
  hideCart = false,
  className,
}: MobileTopActionsProps) {
  const { currentUser, currentRole } = useUser();
  const { lang } = useLanguage();
  const [location, setLocation] = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const btnCls = variant === "dark" ? ACTION_BTN_DARK : ACTION_BTN_LIGHT;

  const { data: cartCount } = useQuery<{ count: number }>({
    queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id && currentRole === "restaurant",
  });
  const cartTotal = cartCount?.count || 0;

  const { data: notifCount } = useQuery<{ count: number }>({
    queryKey: [`/api/notifications/count?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });
  const unreadCount = notifCount?.count || 0;

  const onCart = location.startsWith("/restaurant/cart");
  const showCart =
    currentRole === "restaurant" && !hideCart && !onCart;

  const overflowActions: OverflowAction[] = [];
  if (showCart) {
    overflowActions.push({
      icon: <ShoppingCart className="h-5 w-5" />,
      label: lang === "it" ? "Carrello" : "Warenkorb",
      onClick: () => { setMoreOpen(false); setLocation("/restaurant/cart"); },
      badge: cartTotal,
      testId: "button-mobile-more-cart",
    });
  }
  overflowActions.push({
    icon: <UserIcon className="h-5 w-5" />,
    label: lang === "it" ? "Profilo" : "Profil",
    onClick: () => { setMoreOpen(false); setLocation(`/${currentRole}/profile`); },
    testId: "button-mobile-more-profile",
  });
  overflowActions.push({
    icon: <SettingsIcon className="h-5 w-5" />,
    label: lang === "it" ? "Impostazioni" : "Einstellungen",
    onClick: () => { setMoreOpen(false); setLocation(`/${currentRole}/settings`); },
    testId: "button-mobile-more-settings",
  });
  overflowActions.push({
    icon: <HelpCircle className="h-5 w-5" />,
    label: lang === "it" ? "Aiuto" : "Hilfe",
    onClick: () => { setMoreOpen(false); setLocation(`/${currentRole}/help`); },
    testId: "button-mobile-more-help",
  });

  const totalBadge = (showCart ? cartTotal : 0);

  return (
    <>
      <div
        className={`flex items-center gap-1.5 ${className ?? ""}`}
        data-testid="mobile-top-actions"
      >
        <button
          onClick={() => openGlobalSearch()}
          className={btnCls}
          data-testid="button-mobile-search"
          aria-label="Search"
        >
          <SearchIcon className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={() => setNotifOpen(true)}
          className={btnCls}
          data-testid="button-mobile-notifications"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setMoreOpen(true)}
          className={btnCls}
          data-testid="button-mobile-more"
          aria-label="More"
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
          {totalBadge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
              {totalBadge > 99 ? "99+" : totalBadge}
            </span>
          )}
        </button>
      </div>

      <NotificationsSheet open={notifOpen} onOpenChange={setNotifOpen} />
      <OverflowSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        actions={overflowActions}
        title={lang === "it" ? "Altro" : "Mehr"}
      />
    </>
  );
}

function OverflowSheet({
  open,
  onOpenChange,
  actions,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  actions: OverflowAction[];
  title: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-3xl max-h-[60dvh] flex flex-col"
        data-testid="sheet-mobile-overflow"
      >
        <div className="flex flex-col items-center pt-2 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <SheetHeader className="px-5 pt-2 pb-3 shrink-0">
          <SheetTitle className="text-base text-left">{title}</SheetTitle>
        </SheetHeader>
        <div className="px-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] space-y-1">
          {actions.map((a) => (
            <button
              key={a.testId}
              type="button"
              onClick={a.onClick}
              data-testid={a.testId}
              className="w-full flex items-center gap-4 px-3 py-3.5 rounded-2xl text-left transition-colors hover:bg-muted/50 active:bg-muted/70"
            >
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-muted/60 text-foreground">
                {a.icon}
                {a.badge && a.badge > 0 ? (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {a.badge > 99 ? "99+" : a.badge}
                  </span>
                ) : null}
              </div>
              <span className="flex-1 text-[15px] font-medium text-foreground">{a.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NotificationsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { currentUser, currentRole } = useUser();
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: [`/api/notifications?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id && open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: [`/api/notifications?userId=${currentUser?.id}`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/notifications/count?userId=${currentUser?.id}`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    });
    queryClient.invalidateQueries({
      queryKey: [`/api/conversations/unread?userId=${currentUser?.id}`],
    });
  };

  const markByRefMutation = useMutation({
    mutationFn: async ({ referenceId }: { referenceId: string }) => {
      const params = new URLSearchParams({
        userId: currentUser?.id || "",
        referenceId,
      });
      await apiRequest(
        "PATCH",
        `/api/notifications/read-by-reference?${params.toString()}`
      );
    },
    onSuccess: invalidate,
  });

  const markSingleMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: invalidate,
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "PATCH",
        `/api/notifications/read-all?userId=${currentUser?.id}`
      );
    },
    onSuccess: invalidate,
  });

  const getRoute = (n: Notification): string | null => {
    const role = currentRole;
    const ref = n.referenceId;
    switch (n.type) {
      case "new_order":
      case "order_status":
        return ref ? `/${role}/orders?orderId=${ref}` : `/${role}/orders`;
      case "new_message":
        return ref
          ? `/${role}/inbox?conversationId=${ref}`
          : `/${role}/inbox`;
      case "new_complaint":
      case "complaint_comment":
        return ref
          ? `/${role}/complaints?complaintId=${ref}`
          : `/${role}/complaints`;
      case "low_stock":
        return role === "supplier" ? "/supplier/inventory" : null;
      default:
        return null;
    }
  };

  const handleClick = (n: Notification) => {
    if (n.referenceId)
      markByRefMutation.mutate({ referenceId: n.referenceId });
    else markSingleMutation.mutate(n.id);
    const route = getRoute(n);
    onOpenChange(false);
    if (route) setLocation(route);
  };

  const styleFor = (type: string) => {
    switch (type) {
      case "new_message":
        return {
          icon: <MessageSquare className="h-3.5 w-3.5" />,
          bg: "bg-primary/10 text-primary",
        };
      case "new_order":
        return {
          icon: <ShoppingBag className="h-3.5 w-3.5" />,
          bg: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
        };
      case "order_status":
        return {
          icon: <ShoppingBag className="h-3.5 w-3.5" />,
          bg: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
        };
      case "new_complaint":
        return {
          icon: <AlertCircle className="h-3.5 w-3.5" />,
          bg: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
        };
      case "complaint_comment":
        return {
          icon: <MessageCircle className="h-3.5 w-3.5" />,
          bg: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
        };
      case "low_stock":
        return {
          icon: <AlertCircle className="h-3.5 w-3.5" />,
          bg: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
        };
      default:
        return {
          icon: <Bell className="h-3.5 w-3.5" />,
          bg: "bg-muted text-muted-foreground",
        };
    }
  };

  const formatTime = (dateString: string | Date) => {
    const date =
      typeof dateString === "string" ? new Date(dateString) : dateString;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return lang === "it" ? "ora" : "jetzt";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(lang === "it" ? "it-IT" : "de-DE", {
      day: "numeric",
      month: "short",
    });
  };

  const unread = notifications?.filter((n) => !n.isRead) || [];
  const hasUnread = unread.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-3xl max-h-[85dvh] flex flex-col"
        data-testid="sheet-mobile-notifications"
      >
        <div className="flex flex-col items-center pt-2 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <SheetHeader className="px-4 pt-2 pb-3 flex-row items-center justify-between gap-2 space-y-0 shrink-0">
          <SheetTitle className="text-base">
            {lang === "it" ? "Notifiche" : "Benachrichtigungen"}
          </SheetTitle>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1 px-2"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              data-testid="button-mobile-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {lang === "it" ? "Tutte lette" : "Alle gelesen"}
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          {hasUnread ? (
            <div className="py-1">
              {unread.map((n) => {
                const s = styleFor(n.type);
                const hasRoute = !!getRoute(n);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleClick(n)}
                    className="w-full text-left flex items-start gap-3 px-4 py-3 transition-colors active:bg-muted/60 hover:bg-muted/40 bg-primary/5"
                    data-testid={`mobile-notification-${n.id}`}
                  >
                    <div
                      className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${s.bg}`}
                    >
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm leading-tight font-medium truncate">
                          {n.title}
                        </span>
                        <span className="flex-shrink-0 text-[11px] text-muted-foreground ml-auto">
                          {formatTime(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {n.message}
                      </p>
                      {hasRoute && (
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-primary">
                          <ExternalLink className="h-3 w-3" />
                          <span>
                            {lang === "it" ? "Visualizza" : "Anzeigen"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 h-2 w-2 rounded-full bg-primary mt-2" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {lang === "it"
                  ? "Nessuna nuova notifica"
                  : "Keine neuen Benachrichtigungen"}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
