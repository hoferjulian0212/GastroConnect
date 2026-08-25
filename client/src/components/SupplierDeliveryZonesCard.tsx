import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Zone = { id: string; postalCodePrefix: string; label: string | null };
export function SupplierDeliveryZonesCard({ lang }: { lang: "de" | "it" }) {
  const [prefix, setPrefix] = useState("");
  const [label, setLabel] = useState("");
  const { data: zones = [] } = useQuery<Zone[]>({ queryKey: ["/api/supplier/delivery-zones"] });
  const add = useMutation({
    mutationFn: () => apiRequest("POST", "/api/supplier/delivery-zones", { postalCodePrefix: prefix, label: label || null }),
    onSuccess: () => { setPrefix(""); setLabel(""); queryClient.invalidateQueries({ queryKey: ["/api/supplier/delivery-zones"] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/supplier/delivery-zones/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/supplier/delivery-zones"] }),
  });
  return <Card>
    <CardHeader className="p-3 md:p-6"><CardTitle className="flex items-center gap-2 text-base md:text-lg"><MapPin className="h-4 w-4 md:h-5 md:w-5" />{lang === "de" ? "Liefergebiete" : "Zone di consegna"}</CardTitle><CardDescription className="text-xs md:text-sm">{lang === "de" ? "Sobald Sie Gebiete festlegen, sind Lieferzusagen außerhalb dieser PLZ-Präfixe gesperrt." : "Dopo aver definito zone, le promesse di consegna fuori da questi prefissi CAP vengono bloccate."}</CardDescription></CardHeader>
    <CardContent className="p-3 md:p-6 pt-0 space-y-2">
      <div className="flex gap-2"><Input value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder={lang === "de" ? "PLZ-Präfix, z. B. 39" : "Prefisso CAP, es. 39"} /><Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={lang === "de" ? "Name (optional)" : "Nome (facoltativo)"} /><Button onClick={() => add.mutate()} disabled={!prefix || add.isPending}><Plus className="h-4 w-4" /></Button></div>
      {zones.map((zone) => <div key={zone.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1.5 text-sm"><span>{zone.postalCodePrefix}{zone.label ? ` · ${zone.label}` : ""}</span><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove.mutate(zone.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>)}
    </CardContent>
  </Card>;
}