import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, CalendarIcon, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addDays, isBefore, startOfDay, format } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import type { DeliverySchedule } from "@shared/schema";

interface DeliveryDatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  restaurantId: string;
  onConfirm: (date: string) => void;
  isPending?: boolean;
}

export default function DeliveryDatePicker({ open, onOpenChange, supplierId, restaurantId, onConfirm, isPending }: DeliveryDatePickerProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateLocale = lang === "it" ? it : de;
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [prevOpen, setPrevOpen] = useState(false);

  if (open && !prevOpen) {
    setSelectedDate(undefined);
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }

  const { data: schedules, isError: schedulesError } = useQuery<DeliverySchedule[]>({
    queryKey: ["/api/delivery-schedules/restaurant", supplierId, restaurantId],
    queryFn: async () => {
      const res = await fetch(`/api/delivery-schedules/restaurant?supplierId=${supplierId}&restaurantId=${restaurantId}`);
      if (!res.ok) throw new Error("Failed to fetch schedules");
      return res.json();
    },
    enabled: open && !!supplierId && !!restaurantId,
  });

  const allowedDaysOfWeek = useMemo(() => {
    if (!schedules || schedules.length === 0) return null;
    return new Set(schedules.map(s => s.dayOfWeek));
  }, [schedules]);

  const today = startOfDay(new Date());

  const disabledDays = (date: Date) => {
    if (isBefore(date, today)) return true;
    if (allowedDaysOfWeek === null) return false;
    return !allowedDaysOfWeek.has(date.getDay());
  };

  const handleConfirm = () => {
    if (selectedDate) {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      onConfirm(dateStr);
    }
  };

  const dayNames = lang === "it"
    ? ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"]
    : ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="dialog-delivery-date-picker">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("supplierOrders", "selectDeliveryDate")}</DialogTitle>
        </DialogHeader>

        <div className="px-5 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-semibold">{t("supplierOrders", "selectDeliveryDate")}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 pl-6">{t("supplierOrders", "selectDeliveryDateDesc")}</p>
        </div>

        <div className="space-y-3 px-5 pb-5">
          {allowedDaysOfWeek !== null && (
            <div className="flex flex-wrap gap-1">
              {Array.from(allowedDaysOfWeek).sort().map(day => (
                <Badge key={day} variant="secondary" className="text-xs" data-testid={`badge-delivery-day-${day}`}>
                  {dayNames[day]}
                </Badge>
              ))}
            </div>
          )}

          {schedulesError && (
            <div className="flex items-start gap-2 p-2 rounded-xl bg-destructive/10">
              <Info className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{lang === "it" ? "Errore nel caricamento dei giorni di consegna" : "Fehler beim Laden der Liefertage"}</p>
            </div>
          )}

          {allowedDaysOfWeek === null && schedules !== undefined && !schedulesError && (
            <div className="flex items-start gap-2 p-2 rounded-xl bg-muted/30">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{t("supplierOrders", "noDeliveryDaysConfigured")}</p>
            </div>
          )}

          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={disabledDays}
              locale={dateLocale}
              fromDate={today}
              toDate={addDays(today, 60)}
              classNames={{
                caption: "flex justify-center pt-1 relative items-center w-full",
              }}
              data-testid="calendar-delivery-date"
            />
          </div>

          {selectedDate && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40">
              <CalendarIcon className="h-4 w-4 text-purple-600 shrink-0" />
              <span className="text-sm font-medium" data-testid="text-selected-delivery-date">
                {format(selectedDate, "EEEE, dd. MMMM yyyy", { locale: dateLocale })}
              </span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-lg" onClick={() => onOpenChange(false)} data-testid="button-cancel-delivery-date">
              {t("common", "cancel")}
            </Button>
            <Button
              className="flex-1 rounded-lg"
              disabled={!selectedDate || isPending}
              onClick={handleConfirm}
              data-testid="button-confirm-delivery-date"
            >
              <Truck className="h-4 w-4 mr-1.5" />
              {t("supplierOrders", "confirmDelivery")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
