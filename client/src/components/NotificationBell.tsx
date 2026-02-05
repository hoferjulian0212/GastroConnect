import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, MessageSquare, ShoppingBag, AlertCircle, CheckCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/context/UserContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

export function NotificationBell() {
  const { currentUser } = useUser();
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: [`/api/notifications?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    refetchInterval: 30000,
  });

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: [`/api/notifications/count?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    refetchInterval: 10000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/notifications?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/notifications/count?userId=${currentUser?.id}`] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/notifications/read-all?userId=${currentUser?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/notifications?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/notifications/count?userId=${currentUser?.id}`] });
    },
  });

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

    if (diffMins < 1) return "jetzt";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
  };

  const unreadCount = countData?.count || 0;
  const hasNotifications = notifications && notifications.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <span className="font-medium text-sm">Benachrichtigungen</span>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllAsReadMutation.mutate()}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Alle lesen
            </Button>
          )}
        </div>
        
        {hasNotifications ? (
          <ScrollArea className="max-h-[280px]">
            <div className="py-1">
              {notifications.map((notification) => {
                const style = getNotificationStyle(notification.type);
                return (
                  <div
                    key={notification.id}
                    className={`group relative flex items-start gap-2.5 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors ${
                      !notification.isRead ? "bg-primary/5" : ""
                    }`}
                    onClick={() => {
                      if (!notification.isRead) {
                        markAsReadMutation.mutate(notification.id);
                      }
                    }}
                    data-testid={`notification-${notification.id}`}
                  >
                    <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${style.bg}`}>
                      {style.icon}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm leading-tight ${!notification.isRead ? "font-medium" : ""}`}>
                          {notification.title}
                        </span>
                        <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                          {formatTime(notification.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {notification.message}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <div className="flex-shrink-0 h-1.5 w-1.5 rounded-full bg-primary mt-2" />
                    )}
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
            <p className="text-sm text-muted-foreground">Keine Benachrichtigungen</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
