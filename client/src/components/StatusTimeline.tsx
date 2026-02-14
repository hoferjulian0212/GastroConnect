import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Clock, CheckCircle, Truck, Package, XCircle, Loader2, ShieldCheck, Lock,
  CircleDot
} from "lucide-react";
import type { OrderStatusHistoryWithUser, ComplaintStatusHistoryWithUser } from "@shared/schema";

const orderStatusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pending: { label: "Neu", icon: Clock, color: "text-amber-500" },
  confirmed: { label: "Bestätigt", icon: CheckCircle, color: "text-blue-500" },
  in_delivery: { label: "In Lieferung", icon: Truck, color: "text-indigo-500" },
  delivered: { label: "Geliefert", icon: Package, color: "text-green-500" },
  cancelled: { label: "Storniert", icon: XCircle, color: "text-red-500" },
};

const complaintStatusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  open: { label: "Offen", icon: Clock, color: "text-amber-500" },
  in_progress: { label: "In Bearbeitung", icon: Loader2, color: "text-blue-500" },
  resolved: { label: "Gelöst", icon: ShieldCheck, color: "text-green-500" },
  closed: { label: "Geschlossen", icon: Lock, color: "text-muted-foreground" },
};

interface StatusTimelineProps {
  history: (OrderStatusHistoryWithUser | ComplaintStatusHistoryWithUser)[];
  type: "order" | "complaint";
  createdAt?: Date | string;
  currentStatus?: string;
}

export function StatusTimeline({ history, type, createdAt, currentStatus }: StatusTimelineProps) {
  const config = type === "order" ? orderStatusConfig : complaintStatusConfig;

  const fallbackStatus = currentStatus || (type === "order" ? "pending" : "open");

  const timelineEntries = history.length > 0 ? history : (createdAt ? [{
    id: "initial",
    fromStatus: null,
    toStatus: fallbackStatus,
    changedBy: null,
    createdAt: typeof createdAt === "string" ? new Date(createdAt) : createdAt,
    changedByUser: undefined,
  } as any] : []);

  if (timelineEntries.length === 0) return null;

  return (
    <div className="space-y-0" data-testid="status-timeline">
      {timelineEntries.map((entry: any, index: number) => {
        const statusInfo = config[entry.toStatus] || { label: entry.toStatus, icon: CircleDot, color: "text-muted-foreground" };
        const StatusIcon = statusInfo.icon;
        const isLast = index === timelineEntries.length - 1;
        const entryDate = new Date(entry.createdAt);

        return (
          <div key={entry.id} className="flex gap-3" data-testid={`timeline-entry-${entry.toStatus}`}>
            <div className="flex flex-col items-center">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full border-2 ${isLast ? "border-current bg-current/10" : "border-muted-foreground/30 bg-muted/50"} ${statusInfo.color}`}>
                <StatusIcon className="h-3.5 w-3.5" />
              </div>
              {!isLast && (
                <div className="w-px h-full min-h-[24px] bg-border" />
              )}
            </div>
            <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
              <p className={`text-sm font-medium ${isLast ? "" : "text-muted-foreground"}`}>
                {statusInfo.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(entryDate, "dd.MM.yyyy, HH:mm", { locale: de })} Uhr
              </p>
              {entry.changedByUser && (
                <p className="text-xs text-muted-foreground">
                  von {entry.changedByUser.companyName || entry.changedByUser.name}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function getOrderStatusLabel(status: string): string {
  return orderStatusConfig[status]?.label || status;
}

export function getOrderStatusColor(status: string): string {
  return orderStatusConfig[status]?.color || "text-muted-foreground";
}

export function getComplaintStatusLabel(status: string): string {
  return complaintStatusConfig[status]?.label || status;
}

export function getComplaintStatusColor(status: string): string {
  return complaintStatusConfig[status]?.color || "text-muted-foreground";
}
