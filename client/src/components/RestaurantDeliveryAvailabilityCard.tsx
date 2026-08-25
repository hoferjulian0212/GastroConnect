import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Window = { dayOfWeek: number; opensAt: string; closesAt: string };
type Exception = { id: string; date: string; isClosed: boolean; opensAt: string | null; closesAt: string | null; note: string | null };
const DAYS = [
  ["Sonntag", "Domenica"], ["Montag", "Lunedì"], ["Dienstag", "Martedì"], ["Mittwoch", "Mercoledì"],
  ["Donnerstag", "Giovedì"], ["Freitag", "Venerdì"], ["Samstag", "Sabato"],
];

export function RestaurantDeliveryAvailabilityCard({ lang, disabled }: { lang: "de" | "it"; disabled?: boolean }) {
  const { toast } = useToast();
  const [timeZone, setTimeZone] = useState("Europe/Rome");
  const [windows, setWindows] = useState<Window[]>([]);
  const [exceptionDate, setExceptionDate] = useState("");
  const { data, isLoading } = useQuery<{ timeZone: string; windows: Window[]; exceptions: Exception[] }>({
    queryKey: ["/api/restaurant/delivery-availability"],
  });
  useEffect(() => {
    if (!data) return;
    setTimeZone(data.timeZone);
    setWindows(data.windows);
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/restaurant/delivery-availability", { timeZone, windows }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/delivery-availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-constraints/candidates"] });
      toast({ title: lang === "de" ? "Öffnungszeiten gespeichert" : "Orari salvati" });
    },
    onError: () => toast({ title: lang === "de" ? "Öffnungszeiten konnten nicht gespeichert werden" : "Impossibile salvare gli orari", variant: "destructive" }),
  });
  const addClosure = useMutation({
    mutationFn: () => apiRequest("POST", "/api/restaurant/delivery-availability/exceptions", { date: exceptionDate, isClosed: true }),
    onSuccess: () => {
      setExceptionDate("");
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/delivery-availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-constraints/candidates"] });
    },
  });
  const removeException = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/restaurant/delivery-availability/exceptions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/delivery-availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-constraints/candidates"] });
    },
  });

  const updateDay = (dayOfWeek: number, patch: Partial<Window>) => {
    setWindows((current) => current.map((window) => window.dayOfWeek === dayOfWeek ? { ...window, ...patch } : window));
  };
  const toggleDay = (dayOfWeek: number) => {
    setWindows((current) => current.some((window) => window.dayOfWeek === dayOfWeek)
      ? current.filter((window) => window.dayOfWeek !== dayOfWeek)
      : [...current, { dayOfWeek, opensAt: "08:00", closesAt: "18:00" }]);
  };

  return (
    <Card>
      <CardHeader className="p-3 md:p-6">
        <CardTitle className="flex items-center gap-2 text-base md:text-lg"><CalendarClock className="h-4 w-4 md:h-5 md:w-5" />{lang === "de" ? "Liefer-Öffnungszeiten" : "Orari per le consegne"}</CardTitle>
        <CardDescription className="text-xs md:text-sm">{lang === "de" ? "Nur bestätigte Lieferfenster innerhalb dieser Zeiten können gewählt oder disponiert werden." : "Si possono scegliere e assegnare solo consegne nelle fasce confermate e in questi orari."}</CardDescription>
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0 space-y-3">
        <label className="text-sm font-medium">{lang === "de" ? "Zeitzone (IANA)" : "Fuso orario (IANA)"}
          <Input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className="mt-1" disabled={disabled || isLoading} placeholder="Europe/Rome" />
        </label>
        <div className="space-y-2">
          {DAYS.map(([de, it], dayOfWeek) => {
            const window = windows.find((entry) => entry.dayOfWeek === dayOfWeek);
            return <div key={dayOfWeek} className="flex items-center gap-2">
              <input type="checkbox" checked={!!window} onChange={() => toggleDay(dayOfWeek)} disabled={disabled} aria-label={de} />
              <span className="w-24 text-sm">{lang === "de" ? de : it}</span>
              {window && <><Input type="time" value={window.opensAt} onChange={(event) => updateDay(dayOfWeek, { opensAt: event.target.value })} disabled={disabled} className="w-28" /><span>–</span><Input type="time" value={window.closesAt} onChange={(event) => updateDay(dayOfWeek, { closesAt: event.target.value })} disabled={disabled} className="w-28" /></>}
            </div>;
          })}
        </div>
        <Button onClick={() => save.mutate()} disabled={disabled || save.isPending} className="gap-2">{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{lang === "de" ? "Öffnungszeiten speichern" : "Salva orari"}</Button>
        <div className="border-t pt-3 space-y-2">
          <p className="text-sm font-medium">{lang === "de" ? "Betriebsruhe / Feiertage" : "Chiusure / festività"}</p>
          <div className="flex gap-2"><Input type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} disabled={disabled} /><Button size="sm" onClick={() => addClosure.mutate()} disabled={disabled || !exceptionDate || addClosure.isPending}><Plus className="h-4 w-4" /></Button></div>
          {data?.exceptions.map((exception) => <div key={exception.id} className="flex justify-between text-sm rounded bg-muted/50 px-2 py-1.5"><span>{exception.date} · {exception.isClosed ? (lang === "de" ? "geschlossen" : "chiuso") : `${exception.opensAt}-${exception.closesAt}`}</span><Button variant="ghost" size="icon" className="h-6 w-6" disabled={disabled} onClick={() => removeException.mutate(exception.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>)}
        </div>
      </CardContent>
    </Card>
  );
}