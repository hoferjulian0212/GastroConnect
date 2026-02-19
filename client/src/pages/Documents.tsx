import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FileText, Download, ClipboardList, Building2, Clock, Eye, Pencil, Save, X, Minus, Plus, Trash2 } from "lucide-react";
import type { DocumentWithDetails } from "@shared/schema";
import { format } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useToast } from "@/hooks/use-toast";

interface DeliveryNotePreview {
  orderId: string;
  supplierName: string;
  supplierAddress: string;
  supplierCity: string;
  supplierPhone: string;
  supplierEmail: string;
  restaurantName: string;
  restaurantAddress: string;
  restaurantCity: string;
  orderDate: string;
  deliveryDate: string;
  items: Array<{ productName: string; quantity: number; unitPrice: string; totalPrice: string }>;
  totalAmount: string;
  notes: string;
}

const getDocTypeLabel = (type: string, lang: string) => {
  if (lang === "it") {
    switch (type) {
      case "delivery_note": return "Bolla di consegna";
      case "invoice": return "Fattura";
      default: return "Documento";
    }
  }
  switch (type) {
    case "delivery_note": return "Lieferschein";
    case "invoice": return "Rechnung";
    default: return "Dokument";
  }
};

const getDocTypeColor = (type: string) => {
  switch (type) {
    case "delivery_note": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "invoice": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    default: return "bg-muted text-muted-foreground";
  }
};

export default function Documents() {
  const { currentUser, currentRole } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();
  const dateLocale = lang === "it" ? it : de;

  const [selectedDoc, setSelectedDoc] = useState<DocumentWithDetails | null>(null);
  const [previewData, setPreviewData] = useState<DeliveryNotePreview | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<DeliveryNotePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const { data: documents, isLoading } = useQuery<DocumentWithDetails[]>({
    queryKey: ["/api/documents", currentUser?.id, currentRole],
    queryFn: async () => {
      const res = await fetch(`/api/documents?userId=${currentUser?.id}&role=${currentRole}`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!currentUser?.id,
  });

  const handleOpenPreview = async (doc: DocumentWithDetails) => {
    setSelectedDoc(doc);
    setIsEditing(false);
    if (doc.type === "delivery_note") {
      setIsLoadingPreview(true);
      try {
        const res = await fetch(`/api/orders/${doc.orderId}/delivery-note/preview`);
        if (!res.ok) throw new Error("Failed to load preview");
        const data = await res.json();
        setPreviewData(data);
        setEditData(data);
      } catch {
        toast({ title: lang === "de" ? "Fehler beim Laden" : "Errore di caricamento", variant: "destructive" });
      } finally {
        setIsLoadingPreview(false);
      }
    }
  };

  const handleDownloadEdited = async () => {
    if (!editData || !selectedDoc) return;
    try {
      const res = await fetch(`/api/orders/${selectedDoc.orderId}/delivery-note/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (!res.ok) throw new Error("Failed to generate");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Lieferschein_${selectedDoc.orderId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: lang === "de" ? "Lieferschein heruntergeladen" : "Bolla scaricata" });
    } catch {
      toast({ title: lang === "de" ? "Fehler beim Erstellen" : "Errore nella creazione", variant: "destructive" });
    }
  };

  const updateEditItem = (index: number, field: string, value: string | number) => {
    if (!editData) return;
    const newItems = [...editData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === "quantity" || field === "unitPrice") {
      const qty = field === "quantity" ? Number(value) : newItems[index].quantity;
      const price = field === "unitPrice" ? Number(value) : Number(newItems[index].unitPrice);
      newItems[index].totalPrice = (qty * price).toFixed(2);
    }
    const newTotal = newItems.reduce((sum, item) => sum + Number(item.totalPrice), 0).toFixed(2);
    setEditData({ ...editData, items: newItems, totalAmount: newTotal });
  };

  const removeEditItem = (index: number) => {
    if (!editData) return;
    const newItems = editData.items.filter((_, i) => i !== index);
    const newTotal = newItems.reduce((sum, item) => sum + Number(item.totalPrice), 0).toFixed(2);
    setEditData({ ...editData, items: newItems, totalAmount: newTotal });
  };

  const closeDialog = () => {
    setSelectedDoc(null);
    setPreviewData(null);
    setEditData(null);
    setIsEditing(false);
  };

  const labelDe = (key: string) => {
    const labels: Record<string, string> = {
      supplier: "Lieferant", restaurant: "Empfänger", address: "Adresse", city: "PLZ / Ort",
      phone: "Telefon", email: "E-Mail", orderDate: "Bestelldatum", deliveryDate: "Lieferdatum",
      items: "Positionen", product: "Produkt", quantity: "Menge", unitPrice: "Einzelpreis",
      total: "Gesamt", notes: "Anmerkungen", preview: "Vorschau", edit: "Bearbeiten",
      downloadEdited: "Korrigiert herunterladen", cancel: "Abbrechen",
    };
    return labels[key] || key;
  };

  const labelIt = (key: string) => {
    const labels: Record<string, string> = {
      supplier: "Fornitore", restaurant: "Destinatario", address: "Indirizzo", city: "CAP / Città",
      phone: "Telefono", email: "E-Mail", orderDate: "Data ordine", deliveryDate: "Data consegna",
      items: "Posizioni", product: "Prodotto", quantity: "Quantità", unitPrice: "Prezzo unitario",
      total: "Totale", notes: "Note", preview: "Anteprima", edit: "Modifica",
      downloadEdited: "Scarica corretto", cancel: "Annulla",
    };
    return labels[key] || key;
  };

  const l = lang === "it" ? labelIt : labelDe;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">
          {lang === "de" ? "Dokument-Center" : "Centro documenti"}
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          {lang === "de" ? "Alle Ihre Dokumente an einem Ort" : "Tutti i tuoi documenti in un unico posto"}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : documents && documents.length > 0 ? (
        <div className="space-y-3">
          {documents.map((doc) => {
            const otherParty = currentRole === "restaurant" ? doc.supplier : doc.restaurant;
            return (
              <Card
                key={doc.id}
                className="hover-elevate cursor-pointer"
                onClick={() => handleOpenPreview(doc)}
                data-testid={`document-card-${doc.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className={`flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-md shrink-0 ${getDocTypeColor(doc.type)}`}>
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm md:text-base">{doc.title}</p>
                        <Badge className={`${getDocTypeColor(doc.type)} text-[10px] md:text-xs`} variant="outline">
                          {getDocTypeLabel(doc.type, lang)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs md:text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {otherParty?.companyName || otherParty?.name || (lang === "de" ? "Unbekannt" : "Sconosciuto")}
                        </span>
                        <span className="flex items-center gap-1">
                          <ClipboardList className="h-3 w-3" />
                          #{doc.orderId.slice(0, 8)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(doc.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleOpenPreview(doc); }}
                        data-testid={`button-preview-${doc.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (doc.type === "delivery_note") {
                            window.open(`/api/orders/${doc.orderId}/delivery-note/download`, "_blank");
                          } else {
                            window.open(doc.fileUrl, "_blank");
                          }
                        }}
                        data-testid={`button-download-${doc.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{lang === "de" ? "Keine Dokumente vorhanden" : "Nessun documento disponibile"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {lang === "de" ? "Dokumente werden automatisch erstellt wenn Bestellungen verarbeitet werden" : "I documenti vengono creati automaticamente quando gli ordini vengono elaborati"}
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedDoc} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-delivery-note-preview">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedDoc?.title}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? (lang === "de" ? "Daten bearbeiten und korrigierten Lieferschein herunterladen" : "Modifica i dati e scarica la bolla corretta")
                : (lang === "de" ? "Lieferschein-Vorschau" : "Anteprima bolla di consegna")}
            </DialogDescription>
          </DialogHeader>

          {isLoadingPreview ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : previewData && editData ? (
            <div className="space-y-4">
              {!isEditing ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase">{l("supplier")}</p>
                      <p className="text-sm font-medium">{previewData.supplierName}</p>
                      {previewData.supplierAddress && <p className="text-xs text-muted-foreground">{previewData.supplierAddress}</p>}
                      {previewData.supplierCity && <p className="text-xs text-muted-foreground">{previewData.supplierCity}</p>}
                      {previewData.supplierPhone && <p className="text-xs text-muted-foreground">{previewData.supplierPhone}</p>}
                      <p className="text-xs text-muted-foreground">{previewData.supplierEmail}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase">{l("restaurant")}</p>
                      <p className="text-sm font-medium">{previewData.restaurantName}</p>
                      {previewData.restaurantAddress && <p className="text-xs text-muted-foreground">{previewData.restaurantAddress}</p>}
                      {previewData.restaurantCity && <p className="text-xs text-muted-foreground">{previewData.restaurantCity}</p>}
                    </div>
                  </div>

                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{l("orderDate")}: <span className="font-medium text-foreground">{previewData.orderDate}</span></span>
                    <span>{l("deliveryDate")}: <span className="font-medium text-foreground">{previewData.deliveryDate}</span></span>
                  </div>

                  <div className="border-t border-border pt-3">
                    <p className="text-sm font-medium mb-2">{l("items")} ({previewData.items.length})</p>
                    <div className="space-y-1.5">
                      {previewData.items.map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50" data-testid={`preview-item-${i}`}>
                          <div className="min-w-0 flex-1">
                            <span className="font-medium">{item.quantity}x</span>{" "}
                            <span>{item.productName}</span>
                            <span className="text-muted-foreground ml-1">@ {item.unitPrice}€</span>
                          </div>
                          <span className="font-medium shrink-0 ml-2">{item.totalPrice}€</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {previewData.notes && (
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">{l("notes")}</p>
                      <p className="text-sm">{previewData.notes}</p>
                    </div>
                  )}

                  <div className="border-t border-border pt-3 flex items-center justify-between">
                    <span className="text-sm font-medium">{l("total")}</span>
                    <span className="text-lg font-bold" data-testid="text-preview-total">{previewData.totalAmount}€</span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setIsEditing(true)}
                      data-testid="button-edit-delivery-note"
                    >
                      <Pencil className="h-4 w-4 mr-1.5" />
                      {l("edit")}
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        if (selectedDoc) {
                          window.open(`/api/orders/${selectedDoc.orderId}/delivery-note/download`, "_blank");
                        }
                      }}
                      data-testid="button-download-original"
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      Download
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase">{l("supplier")}</p>
                      <div className="space-y-1.5">
                        <Input
                          value={editData.supplierName}
                          onChange={(e) => setEditData({ ...editData, supplierName: e.target.value })}
                          placeholder={l("supplier")}
                          className="text-sm"
                          data-testid="input-edit-supplier-name"
                        />
                        <Input
                          value={editData.supplierAddress}
                          onChange={(e) => setEditData({ ...editData, supplierAddress: e.target.value })}
                          placeholder={l("address")}
                          className="text-sm"
                        />
                        <Input
                          value={editData.supplierCity}
                          onChange={(e) => setEditData({ ...editData, supplierCity: e.target.value })}
                          placeholder={l("city")}
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase">{l("restaurant")}</p>
                      <div className="space-y-1.5">
                        <Input
                          value={editData.restaurantName}
                          onChange={(e) => setEditData({ ...editData, restaurantName: e.target.value })}
                          placeholder={l("restaurant")}
                          className="text-sm"
                          data-testid="input-edit-restaurant-name"
                        />
                        <Input
                          value={editData.restaurantAddress}
                          onChange={(e) => setEditData({ ...editData, restaurantAddress: e.target.value })}
                          placeholder={l("address")}
                          className="text-sm"
                        />
                        <Input
                          value={editData.restaurantCity}
                          onChange={(e) => setEditData({ ...editData, restaurantCity: e.target.value })}
                          placeholder={l("city")}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3">
                    <p className="text-sm font-medium mb-2">{l("items")}</p>
                    <div className="space-y-2">
                      {editData.items.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50" data-testid={`edit-item-${i}`}>
                          <div className="flex-1 min-w-0 space-y-1">
                            <Input
                              value={item.productName}
                              onChange={(e) => updateEditItem(i, "productName", e.target.value)}
                              className="text-sm"
                              placeholder={l("product")}
                            />
                            <div className="flex gap-2">
                              <div className="w-20">
                                <Input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => updateEditItem(i, "quantity", Number(e.target.value))}
                                  className="text-sm"
                                  min={1}
                                />
                              </div>
                              <div className="flex-1">
                                <Input
                                  type="number"
                                  value={item.unitPrice}
                                  onChange={(e) => updateEditItem(i, "unitPrice", e.target.value)}
                                  className="text-sm"
                                  step="0.01"
                                  min={0}
                                />
                              </div>
                              <div className="w-20 flex items-center justify-end text-sm font-medium shrink-0">
                                {item.totalPrice}€
                              </div>
                            </div>
                          </div>
                          {editData.items.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeEditItem(i)}
                              className="shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{l("notes")}</Label>
                    <Textarea
                      value={editData.notes}
                      onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                      className="text-sm resize-none"
                      rows={2}
                      data-testid="input-edit-notes"
                    />
                  </div>

                  <div className="border-t border-border pt-3 flex items-center justify-between">
                    <span className="text-sm font-medium">{l("total")}</span>
                    <span className="text-lg font-bold">{editData.totalAmount}€</span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setEditData(previewData ? { ...previewData } : null);
                        setIsEditing(false);
                      }}
                      data-testid="button-cancel-edit"
                    >
                      {l("cancel")}
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleDownloadEdited}
                      data-testid="button-download-edited"
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      {l("downloadEdited")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
