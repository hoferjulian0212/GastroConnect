import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Truck, CalendarIcon, Info, StickyNote, CalendarHeart } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DATE_CHANGE_REASONS } from "@shared/schema";
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
  onConfirm: (date: string, notes?: string, reason?: string) => void;
  isPending?: boolean;
  showNotesField?: boolean;
  /** Current (requested) delivery date. If set and a different date is picked, a reason is mandatory. */
  currentDate?: string | null;
}

export default function DeliveryDatePicker({ open, onOpenChange, supplierId, restaurantId, onConfirm, isPending, showNotesField = true, currentDate }: DeliveryDatePickerProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateLocale = lang === "it" ? it : de;
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [prevOpen, setPrevOpen] = useState(false);

  if (open && !prevOpen) {
    // Preselect the restaurant's requested date if it is still in the future.
    let initial: Date | undefined = undefined;
    if (currentDate) {
      const d = new Date(currentDate + "T00:00:00");
      if (!isBefore(d, startOfDay(new Date()))) initial = d;
    }
    setSelectedDate(initial);
    setNotes("");
    setReasonCode("");
    setReasonText("");
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

  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const isDateChange = !!currentDate && !!selectedDateStr && selectedDateStr !== currentDate;
  const reasonMissing = isDateChange && (reasonCode === "" || (reasonCode === "other" && reasonText.trim().length === 0));

  const composedReason = useMemo(() => {
    if (!isDateChange) return undefined;
    const entry = DATE_CHANGE_REASONS.find(r => r.code === reasonCode);
    if (!entry) return undefined;
    // Send the language-neutral code; only "other" carries free text.
    if (entry.code === "other") return reasonText.trim() || undefined;
    return entry.code;
  }, [isDateChange, reasonCode, reasonText]);

  const handleConfirm = () => {
    if (selectedDate && !reasonMissing) {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const trimmedNotes = notes.trim();
      onConfirm(dateStr, trimmedNotes ? trimmedNotes : undefined, composedReason);
    }
  };

  const dayNames = lang === "it"
    ? ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"]
    : ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-sm" data-testid="dialog-delivery-date-picker">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("supplierOrders", "selectDeliveryDate")}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-semibold">{t("supplierOrders", "selectDeliveryDate")}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 pl-6">{t("supplierOrders", "selectDeliveryDateDesc")}</p>
        </div>

        <div className="space-y-3 px-6 pb-6">
          {currentDate && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40" data-testid="banner-requested-date">
              <CalendarHeart className="h-4 w-4 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                  {lang === "it" ? "Data richiesta dal cliente" : "Wunschtermin des Betriebs"}
                </p>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {format(new Date(currentDate + "T00:00:00"), "EEEE, dd. MMMM yyyy", { locale: dateLocale })}
                </p>
              </div>
            </div>
          )}
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

          {isDateChange && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Info className="h-3.5 w-3.5 text-amber-500" />
                {lang === "it" ? "Motivo del cambio data (obbligatorio)" : "Grund für die Datumsänderung (Pflicht)"}
              </label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger className="text-sm" data-testid="select-date-change-reason">
                  <SelectValue placeholder={lang === "it" ? "Seleziona un motivo…" : "Grund auswählen…"} />
                </SelectTrigger>
                <SelectContent>
                  {DATE_CHANGE_REASONS.map(r => (
                    <SelectItem key={r.code} value={r.code} data-testid={`reason-option-${r.code}`}>
                      {lang === "it" ? r.it : r.de}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reasonCode === "other" && (
                <Textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder={lang === "it" ? "Descrivi il motivo…" : "Grund beschreiben…"}
                  rows={2}
                  maxLength={500}
                  className="resize-none text-sm"
                  data-testid="textarea-date-change-reason"
                />
              )}
              <p className="text-[10px] text-muted-foreground">
                {lang === "it"
                  ? "L'azienda verrà informata automaticamente del nuovo appuntamento e del motivo."
                  : "Der Betrieb wird automatisch über den neuen Termin und den Grund informiert."}
              </p>
            </div>
          )}

          {showNotesField && (
            <div className="space-y-1.5">
              <label htmlFor="delivery-notes-input" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                {lang === "it" ? "Note di consegna (opzionale)" : "Lieferhinweis (optional)"}
              </label>
              <Textarea
                id="delivery-notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={lang === "it" ? "es. La consegna arriverà intorno alle 15:00" : "z. B. Lieferung kommt voraussichtlich um 15:00 Uhr"}
                rows={2}
                maxLength={500}
                className="resize-none text-sm"
                data-testid="textarea-delivery-notes"
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-lg" onClick={() => onOpenChange(false)} data-testid="button-cancel-delivery-date">
              {t("common", "cancel")}
            </Button>
            <Button
              className="flex-1 rounded-lg"
              disabled={!selectedDate || isPending || reasonMissing}
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
