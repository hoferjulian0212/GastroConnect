import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FileText, Download, Building2, Clock, Eye, Pencil, ChevronDown, ChevronRight, BarChart3, Receipt, TrendingUp, ShoppingCart, Trash2 } from "lucide-react";
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

interface SupplierStats {
  totalOrders: number;
  totalSpent: string;
  avgOrderValue: string;
  monthlyBreakdown: Array<{ month: string; total: number; count: number }>;
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
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [invoiceMonth, setInvoiceMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [invoiceSupplierId, setInvoiceSupplierId] = useState<string | null>(null);

  const { data: documents, isLoading } = useQuery<DocumentWithDetails[]>({
    queryKey: ["/api/documents", currentUser?.id, currentRole],
    queryFn: async () => {
      const res = await fetch(`/api/documents?userId=${currentUser?.id}&role=${currentRole}`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!currentUser?.id,
  });

  const supplierGroups = useMemo(() => {
    if (!documents) return [];
    const groups: Record<string, { supplier: { id: string; name: string; companyName: string | null }; docs: Record<string, DocumentWithDetails[]> }> = {};
    for (const doc of documents) {
      const other = currentRole === "restaurant" ? doc.supplier : doc.restaurant;
      const key = other.id;
      if (!groups[key]) {
        groups[key] = { supplier: { id: other.id, name: other.name, companyName: other.companyName }, docs: {} };
      }
      const docType = doc.type;
      if (!groups[key].docs[docType]) groups[key].docs[docType] = [];
      groups[key].docs[docType].push(doc);
    }
    return Object.values(groups).sort((a, b) =>
      (a.supplier.companyName || a.supplier.name).localeCompare(b.supplier.companyName || b.supplier.name)
    );
  }, [documents, currentRole]);

  const toggleSupplier = (id: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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

  const handleDownloadInvoice = async (supplierId: string, month: string) => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch(`/api/restaurant/monthly-invoice?restaurantId=${currentUser.id}&supplierId=${supplierId}&month=${month}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rechnung_${month}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: lang === "de" ? "Rechnung heruntergeladen" : "Fattura scaricata" });
    } catch (e: any) {
      const msg = e?.message === "No orders for this month"
        ? (lang === "de" ? "Keine Bestellungen in diesem Monat" : "Nessun ordine in questo mese")
        : (lang === "de" ? "Fehler beim Erstellen der Rechnung" : "Errore nella creazione della fattura");
      toast({ title: msg, variant: "destructive" });
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
      supplier: "Haendler", restaurant: "Empfaenger", address: "Adresse", city: "PLZ / Ort",
      phone: "Telefon", email: "E-Mail", orderDate: "Bestelldatum", deliveryDate: "Lieferdatum",
      items: "Positionen", product: "Produkt", quantity: "Menge", unitPrice: "Einzelpreis",
      total: "Gesamt", notes: "Anmerkungen", preview: "Vorschau", edit: "Bearbeiten",
      downloadEdited: "Korrigiert herunterladen", cancel: "Abbrechen",
    };
    return labels[key] || key;
  };

  const labelIt = (key: string) => {
    const labels: Record<string, string> = {
      supplier: "Commerciante", restaurant: "Destinatario", address: "Indirizzo", city: "CAP / Citta",
      phone: "Telefono", email: "E-Mail", orderDate: "Data ordine", deliveryDate: "Data consegna",
      items: "Posizioni", product: "Prodotto", quantity: "Quantita", unitPrice: "Prezzo unitario",
      total: "Totale", notes: "Note", preview: "Anteprima", edit: "Modifica",
      downloadEdited: "Scarica corretto", cancel: "Annulla",
    };
    return labels[key] || key;
  };

  const l = lang === "it" ? labelIt : labelDe;

  const docCategoryLabels: Record<string, { de: string; it: string; icon: typeof FileText }> = {
    delivery_note: { de: "Lieferscheine", it: "Bolle di consegna", icon: FileText },
    invoice: { de: "Rechnungen", it: "Fatture", icon: Receipt },
    other: { de: "Sonstige", it: "Altri", icon: FileText },
  };

  const availableMonths = useMemo(() => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return months;
  }, []);

  const formatMonthLabel = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    const d = new Date(y, mo - 1, 1);
    return d.toLocaleDateString(lang === "it" ? "it-IT" : "de-DE", { month: "long", year: "numeric" });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">
          {lang === "de" ? "Dokument-Center" : "Centro documenti"}
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          {lang === "de" ? "Alle Ihre Dokumente nach Haendler geordnet" : "Tutti i tuoi documenti ordinati per commerciante"}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : supplierGroups.length > 0 ? (
        <div className="space-y-4">
          {supplierGroups.map((group) => {
            const supplierId = group.supplier.id;
            const supplierName = group.supplier.companyName || group.supplier.name;
            const isExpanded = expandedSuppliers.has(supplierId);
            const totalDocs = Object.values(group.docs).reduce((sum, arr) => sum + arr.length, 0);

            return (
              <Card key={supplierId} className="overflow-hidden" data-testid={`supplier-group-${supplierId}`}>
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleSupplier(supplierId)}
                  data-testid={`button-toggle-supplier-${supplierId}`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30 shrink-0">
                    <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm md:text-base">{supplierName}</p>
                    <p className="text-xs text-muted-foreground">
                      {totalDocs} {lang === "de" ? (totalDocs === 1 ? "Dokument" : "Dokumente") : (totalDocs === 1 ? "documento" : "documenti")}
                    </p>
                  </div>
                  {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="border-t border-border">
                    <SupplierStatsCard
                      restaurantId={currentUser?.id || ""}
                      supplierId={supplierId}
                      lang={lang}
                      currentRole={currentRole}
                    />

                    {currentRole === "restaurant" && (
                      <div className="px-4 pb-3 pt-1">
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30">
                          <Receipt className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                          <span className="text-sm font-medium text-green-800 dark:text-green-300 flex-1">
                            {lang === "de" ? "Monatsrechnung erstellen" : "Crea fattura mensile"}
                          </span>
                          <Select value={invoiceSupplierId === supplierId ? invoiceMonth : ""} onValueChange={(v) => { setInvoiceSupplierId(supplierId); setInvoiceMonth(v); }}>
                            <SelectTrigger className="w-[160px] h-8 text-xs" data-testid={`select-invoice-month-${supplierId}`}>
                              <SelectValue placeholder={lang === "de" ? "Monat..." : "Mese..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {availableMonths.map(m => (
                                <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => handleDownloadInvoice(supplierId, invoiceSupplierId === supplierId ? invoiceMonth : invoiceMonth)}
                            data-testid={`button-download-invoice-${supplierId}`}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            PDF
                          </Button>
                        </div>
                      </div>
                    )}

                    {Object.entries(group.docs).sort(([a], [b]) => a.localeCompare(b)).map(([docType, docs]) => {
                      const catKey = `${supplierId}-${docType}`;
                      const isCatExpanded = expandedCategories.has(catKey);
                      const catInfo = docCategoryLabels[docType] || docCategoryLabels.other;
                      const CatIcon = catInfo.icon;

                      return (
                        <div key={catKey} className="border-t border-border/50">
                          <div
                            className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                            onClick={() => toggleCategory(catKey)}
                            data-testid={`button-toggle-category-${catKey}`}
                          >
                            <CatIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium flex-1">
                              {lang === "it" ? catInfo.it : catInfo.de}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">{docs.length}</Badge>
                            {isCatExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          {isCatExpanded && (
                            <div className="px-4 pb-3 space-y-2">
                              {docs.map((doc) => (
                                <div
                                  key={doc.id}
                                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                                  onClick={() => handleOpenPreview(doc)}
                                  data-testid={`document-card-${doc.id}`}
                                >
                                  <div className={`flex h-8 w-8 items-center justify-center rounded-md shrink-0 ${getDocTypeColor(doc.type)}`}>
                                    <FileText className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{doc.title}</p>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span>#{doc.orderId.slice(0, 8)}</span>
                                      <span>{format(new Date(doc.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleOpenPreview(doc); }} data-testid={`button-preview-${doc.id}`}>
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={(e) => {
                                      e.stopPropagation();
                                      const url = doc.type === "delivery_note" ? `/api/orders/${doc.orderId}/delivery-note/download` : doc.fileUrl;
                                      const a = document.createElement("a"); a.href = url; a.setAttribute("download", ""); document.body.appendChild(a); a.click(); document.body.removeChild(a);
                                    }} data-testid={`button-download-${doc.id}`}>
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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
                            <span className="text-muted-foreground ml-1">@ {item.unitPrice} EUR</span>
                          </div>
                          <span className="font-medium shrink-0 ml-2">{item.totalPrice} EUR</span>
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
                    <span className="text-lg font-bold" data-testid="text-preview-total">{previewData.totalAmount} EUR</span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setIsEditing(true)} data-testid="button-edit-delivery-note">
                      <Pencil className="h-4 w-4 mr-1.5" />
                      {l("edit")}
                    </Button>
                    <Button className="flex-1" onClick={() => {
                      if (selectedDoc) {
                        const a = document.createElement("a"); a.href = `/api/orders/${selectedDoc.orderId}/delivery-note/download`; a.setAttribute("download", ""); document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      }
                    }} data-testid="button-download-original">
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
                        <Input value={editData.supplierName} onChange={(e) => setEditData({ ...editData, supplierName: e.target.value })} placeholder={l("supplier")} className="text-sm" data-testid="input-edit-supplier-name" />
                        <Input value={editData.supplierAddress} onChange={(e) => setEditData({ ...editData, supplierAddress: e.target.value })} placeholder={l("address")} className="text-sm" />
                        <Input value={editData.supplierCity} onChange={(e) => setEditData({ ...editData, supplierCity: e.target.value })} placeholder={l("city")} className="text-sm" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase">{l("restaurant")}</p>
                      <div className="space-y-1.5">
                        <Input value={editData.restaurantName} onChange={(e) => setEditData({ ...editData, restaurantName: e.target.value })} placeholder={l("restaurant")} className="text-sm" data-testid="input-edit-restaurant-name" />
                        <Input value={editData.restaurantAddress} onChange={(e) => setEditData({ ...editData, restaurantAddress: e.target.value })} placeholder={l("address")} className="text-sm" />
                        <Input value={editData.restaurantCity} onChange={(e) => setEditData({ ...editData, restaurantCity: e.target.value })} placeholder={l("city")} className="text-sm" />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3">
                    <p className="text-sm font-medium mb-2">{l("items")}</p>
                    <div className="space-y-2">
                      {editData.items.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/50" data-testid={`edit-item-${i}`}>
                          <div className="flex-1 min-w-0 space-y-1">
                            <Input value={item.productName} onChange={(e) => updateEditItem(i, "productName", e.target.value)} className="text-sm" placeholder={l("product")} />
                            <div className="flex gap-2">
                              <div className="w-20">
                                <Input type="number" value={item.quantity} onChange={(e) => updateEditItem(i, "quantity", Number(e.target.value))} className="text-sm" min={1} />
                              </div>
                              <div className="flex-1">
                                <Input type="number" value={item.unitPrice} onChange={(e) => updateEditItem(i, "unitPrice", e.target.value)} className="text-sm" step="0.01" min={0} />
                              </div>
                              <div className="w-20 flex items-center justify-end text-sm font-medium shrink-0">
                                {item.totalPrice} EUR
                              </div>
                            </div>
                          </div>
                          {editData.items.length > 1 && (
                            <Button variant="ghost" size="icon" onClick={() => removeEditItem(i)} className="shrink-0">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{l("notes")}</Label>
                    <Textarea value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} className="text-sm resize-none" rows={2} data-testid="input-edit-notes" />
                  </div>

                  <div className="border-t border-border pt-3 flex items-center justify-between">
                    <span className="text-sm font-medium">{l("total")}</span>
                    <span className="text-lg font-bold">{editData.totalAmount} EUR</span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setEditData(previewData ? { ...previewData } : null); setIsEditing(false); }} data-testid="button-cancel-edit">
                      {l("cancel")}
                    </Button>
                    <Button className="flex-1" onClick={handleDownloadEdited} data-testid="button-download-edited">
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

function SupplierStatsCard({ restaurantId, supplierId, lang, currentRole }: { restaurantId: string; supplierId: string; lang: string; currentRole: string }) {
  const { data: stats, isLoading } = useQuery<SupplierStats>({
    queryKey: [`/api/restaurant/supplier-order-stats?restaurantId=${restaurantId}&supplierId=${supplierId}`],
    enabled: !!restaurantId && !!supplierId && currentRole === "restaurant",
  });

  if (currentRole !== "restaurant") return null;

  if (isLoading) {
    return (
      <div className="px-4 py-3">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!stats) return null;

  const maxTotal = Math.max(...stats.monthlyBreakdown.map(m => m.total), 1);

  return (
    <div className="px-4 py-3" data-testid={`supplier-stats-${supplierId}`}>
      <div className="rounded-lg bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-100 dark:border-indigo-800/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
            {lang === "de" ? "Bestellstatistik" : "Statistiche ordini"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300" data-testid={`stat-total-orders-${supplierId}`}>{stats.totalOrders}</div>
            <div className="text-[10px] text-muted-foreground">{lang === "de" ? "Bestellungen" : "Ordini"}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300" data-testid={`stat-total-spent-${supplierId}`}>{Number(stats.totalSpent).toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR</div>
            <div className="text-[10px] text-muted-foreground">{lang === "de" ? "Gesamt" : "Totale"}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300" data-testid={`stat-avg-order-${supplierId}`}>{Number(stats.avgOrderValue).toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR</div>
            <div className="text-[10px] text-muted-foreground">{lang === "de" ? "Durchschn." : "Media"}</div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground mb-2">{lang === "de" ? "Letzte 6 Monate" : "Ultimi 6 mesi"}</div>
          <div className="flex items-end gap-1 h-16">
            {stats.monthlyBreakdown.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex justify-center">
                  {m.total > 0 && (
                    <span className="text-[8px] text-muted-foreground font-medium">
                      {m.total >= 1000 ? `${(m.total / 1000).toFixed(1)}k` : m.total.toFixed(0)}
                    </span>
                  )}
                </div>
                <div
                  className="w-full rounded-t-sm bg-indigo-400 dark:bg-indigo-500 min-h-[2px]"
                  style={{ height: `${Math.max((m.total / maxTotal) * 48, 2)}px` }}
                />
                <span className="text-[8px] text-muted-foreground">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
