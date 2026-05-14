import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, MessageSquare, ShoppingBag, AlertCircle, ExternalLink, MessageCircle, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

export function NotificationBell() {
  const { currentUser, currentRole } = useUser();
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: [`/api/notifications?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: [`/api/notifications/count?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const unreadCount = countData?.count || 0;

  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/notifications?userId=${currentUser?.id}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/notifications/count?userId=${currentUser?.id}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/conversations/unread?userId=${currentUser?.id}`] });
  };

  const markByReferenceMutation = useMutation({
    mutationFn: async ({ referenceId, type }: { referenceId: string; type?: string }) => {
      const params = new URLSearchParams({ userId: currentUser?.id || "", referenceId });
      if (type) params.set("type", type);
      await apiRequest("PATCH", `/api/notifications/read-by-reference?${params.toString()}`);
    },
    onSuccess: invalidateNotifications,
  });

  const markSingleReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: invalidateNotifications,
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/notifications/read-all?userId=${currentUser?.id}`);
    },
    onSuccess: invalidateNotifications,
  });

  const getNotificationRoute = (notification: Notification): string | null => {
    const role = currentRole;
    const ref = notification.referenceId;

    switch (notification.type) {
      case "new_order":
      case "order_status":
        return ref ? `/${role}/orders?orderId=${ref}` : `/${role}/orders`;
      case "new_message":
        return ref ? `/${role}/inbox?conversationId=${ref}` : `/${role}/inbox`;
      case "new_complaint":
      case "complaint_comment":
        return ref ? `/${role}/complaints?complaintId=${ref}` : `/${role}/complaints`;
      case "low_stock":
        return role === "supplier" ? "/supplier/inventory" : null;
      default:
        return null;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.referenceId) {
      markByReferenceMutation.mutate({
        referenceId: notification.referenceId,
        type: undefined,
      });
    } else {
      markSingleReadMutation.mutate(notification.id);
    }

    const route = getNotificationRoute(notification);
    setOpen(false);
    if (route) {
      setLocation(route);
    }
  };

  const getNotificationStyle = (type: string) => {
    switch (type) {
      case "new_message":
        return { 
          icon: <MessageSquare className="h-3.5 w-3.5" />,
          bg: "bg-primary/10 text-primary"
        };
      case "new_order":
        return { 
          icon: <ShoppingBag className="h-3.5 w-3.5" />,
          bg: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
        };
      case "order_status":
        return { 
          icon: <ShoppingBag className="h-3.5 w-3.5" />,
          bg: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        };
      case "new_complaint":
        return { 
          icon: <AlertCircle className="h-3.5 w-3.5" />,
          bg: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        };
      case "complaint_comment":
        return { 
          icon: <MessageCircle className="h-3.5 w-3.5" />,
          bg: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
        };
      case "low_stock":
        return { 
          icon: <AlertCircle className="h-3.5 w-3.5" />,
          bg: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        };
      default:
        return { 
          icon: <Bell className="h-3.5 w-3.5" />,
          bg: "bg-muted text-muted-foreground"
        };
    }
  };

  const formatTime = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return lang === "it" ? "ora" : "jetzt";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(lang === "it" ? "it-IT" : "de-DE", { day: "numeric", month: "short" });
  };

  const unreadNotifications = notifications?.filter(n => !n.isRead) || [];
  const hasUnread = unreadNotifications.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button 
          className="relative flex items-center justify-center h-8 w-8 rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15 transition-colors"
          data-testid="button-notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
          <span className="font-medium text-sm">{lang === "it" ? "Notifiche" : "Benachrichtigungen"}</span>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {lang === "it" ? "Tutte lette" : "Alle gelesen"}
            </Button>
          )}
        </div>
        
        {hasUnread ? (
          <ScrollArea className="max-h-[320px]">
            <div className="py-1">
              {unreadNotifications.map((notification) => {
                const style = getNotificationStyle(notification.type);
                const hasRoute = !!getNotificationRoute(notification);
                return (
                  <div
                    key={notification.id}
                    className="group relative flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors hover-elevate bg-primary/5"
                    onClick={() => handleNotificationClick(notification)}
                    data-testid={`notification-${notification.id}`}
                  >
                    <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${style.bg}`}>
                      {style.icon}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="text-sm leading-tight font-medium">
                          {notification.title}
                        </span>
                        <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                          {formatTime(notification.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      {hasRoute && (
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-primary">
                          <ExternalLink className="h-3 w-3" />
                          <span>{lang === "it" ? "Visualizza" : "Anzeigen"}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{lang === "it" ? "Nessuna nuova notifica" : "Keine neuen Benachrichtigungen"}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
