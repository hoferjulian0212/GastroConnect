import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tag, Plus, Pencil, Trash2, Package, Calendar, Percent, Loader2 } from "lucide-react";
import type { Product, PromotionWithProduct } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function SupplierPromotions() {
  const { currentUser } = useUser();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromotionWithProduct | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [discountPercent, setDiscountPercent] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const { data: promotions, isLoading } = useQuery<PromotionWithProduct[]>({
    queryKey: [`/api/promotions?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { productId: string; supplierId: string; discountPercent: number; startDate: string; endDate: string }) => {
      return apiRequest("POST", "/api/promotions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Aktion erstellt", description: "Die Rabattaktion wurde erfolgreich erstellt." });
      resetForm();
    },
    onError: () => {
      toast({ title: "Fehler", description: "Die Aktion konnte nicht erstellt werden.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/promotions/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Aktion aktualisiert", description: "Die Rabattaktion wurde aktualisiert." });
      resetForm();
    },
    onError: () => {
      toast({ title: "Fehler", description: "Die Aktion konnte nicht aktualisiert werden.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/promotions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Aktion gelöscht", description: "Die Rabattaktion wurde gelöscht." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Die Aktion konnte nicht gelöscht werden.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setIsDialogOpen(false);
    setEditingPromo(null);
    setSelectedProductId("");
    setDiscountPercent("");
    setStartDate("");
    setEndDate("");
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (promo: PromotionWithProduct) => {
    setEditingPromo(promo);
    setSelectedProductId(promo.productId);
    setDiscountPercent(String(promo.discountPercent));
    setStartDate(format(new Date(promo.startDate), "yyyy-MM-dd"));
    setEndDate(format(new Date(promo.endDate), "yyyy-MM-dd"));
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const discount = parseInt(discountPercent);
    if (!selectedProductId || !discount || discount < 1 || discount > 99 || !startDate || !endDate) {
      toast({ title: "Fehler", description: "Bitte füllen Sie alle Felder korrekt aus.", variant: "destructive" });
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      toast({ title: "Fehler", description: "Das Enddatum muss nach dem Startdatum liegen.", variant: "destructive" });
      return;
    }

    if (editingPromo) {
      updateMutation.mutate({
        id: editingPromo.id,
        data: {
          productId: selectedProductId,
          discountPercent: discount,
          startDate,
          endDate,
        },
      });
    } else {
      createMutation.mutate({
        productId: selectedProductId,
        supplierId: currentUser!.id,
        discountPercent: discount,
        startDate,
        endDate,
      });
    }
  };

  const getPromoStatus = (promo: PromotionWithProduct) => {
    const now = new Date();
    const start = new Date(promo.startDate);
    const end = new Date(promo.endDate);
    if (!promo.isActive) return { label: "Deaktiviert", variant: "secondary" as const };
    if (now < start) return { label: "Geplant", variant: "outline" as const };
    if (now > end) return { label: "Abgelaufen", variant: "secondary" as const };
    return { label: "Aktiv", variant: "default" as const };
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 md:gap-3">
          <Tag className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Aktionen</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Rabattaktionen für Ihre Produkte verwalten</p>
          </div>
        </div>
        <Button onClick={openCreateDialog} data-testid="button-create-promotion">
          <Plus className="h-4 w-4 mr-1.5" />
          Neue Aktion
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-3 md:gap-4">
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary" data-testid="text-total-promotions">{promotions?.length || 0}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Gesamt</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-green-600" data-testid="text-active-promotions">
                {promotions?.filter(p => {
                  const now = new Date();
                  return p.isActive && new Date(p.startDate) <= now && new Date(p.endDate) >= now;
                }).length || 0}
              </div>
              <p className="text-xs md:text-sm text-muted-foreground">Aktiv</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-muted-foreground" data-testid="text-expired-promotions">
                {promotions?.filter(p => new Date(p.endDate) < new Date()).length || 0}
              </div>
              <p className="text-xs md:text-sm text-muted-foreground">Abgelaufen</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="text-base md:text-lg">Alle Aktionen</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : promotions && promotions.length > 0 ? (
            <div className="space-y-3">
              {promotions.map(promo => {
                const status = getPromoStatus(promo);
                const originalPrice = parseFloat(promo.product.price);
                const discountedPrice = originalPrice * (1 - promo.discountPercent / 100);
                return (
                  <Card key={promo.id} data-testid={`promotion-card-${promo.id}`}>
                    <CardContent className="p-3 md:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-lg bg-primary/10 shrink-0">
                            <Percent className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium text-sm md:text-base truncate" data-testid={`text-promo-product-${promo.id}`}>
                                {promo.product.name}
                              </h3>
                              <Badge variant={status.variant} data-testid={`badge-promo-status-${promo.id}`}>
                                {status.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-sm font-bold text-primary" data-testid={`text-promo-discount-${promo.id}`}>
                                -{promo.discountPercent}%
                              </span>
                              <span className="text-xs text-muted-foreground line-through">
                                {originalPrice.toFixed(2)}€
                              </span>
                              <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                                {discountedPrice.toFixed(2)}€
                              </span>
                              <span className="text-xs text-muted-foreground">/{promo.product.unit}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {format(new Date(promo.startDate), "dd.MM.yyyy", { locale: de })} - {format(new Date(promo.endDate), "dd.MM.yyyy", { locale: de })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(promo)}
                            data-testid={`button-edit-promo-${promo.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(promo.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-promo-${promo.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Tag className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Keine Aktionen vorhanden</p>
              <p className="text-sm text-muted-foreground mt-1">
                Erstellen Sie Ihre erste Rabattaktion
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPromo ? "Aktion bearbeiten" : "Neue Aktion erstellen"}</DialogTitle>
            <DialogDescription>
              {editingPromo ? "Ändern Sie die Rabattaktion." : "Erstellen Sie eine Rabattaktion für eines Ihrer Produkte."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm">Produkt</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="mt-1" data-testid="select-promotion-product">
                  <Package className="h-4 w-4 mr-2 shrink-0" />
                  <SelectValue placeholder="Produkt auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.price}€/{p.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">Rabatt (%)</Label>
              <div className="relative mt-1">
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={discountPercent}
                  onChange={e => setDiscountPercent(e.target.value)}
                  placeholder="z.B. 15"
                  data-testid="input-discount-percent"
                />
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              {selectedProductId && discountPercent && (
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {(() => {
                    const product = products?.find(p => p.id === selectedProductId);
                    if (!product) return null;
                    const orig = parseFloat(product.price);
                    const disc = orig * (1 - parseInt(discountPercent) / 100);
                    return (
                      <span>
                        <span className="line-through">{orig.toFixed(2)}€</span>
                        {" → "}
                        <span className="font-medium text-green-600 dark:text-green-400">{disc.toFixed(2)}€</span>
                        <span> /{product.unit}</span>
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Startdatum</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="mt-1"
                  data-testid="input-start-date"
                />
              </div>
              <div>
                <Label className="text-sm">Enddatum</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="mt-1"
                  data-testid="input-end-date"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel-promotion">
              Abbrechen
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !selectedProductId || !discountPercent || !startDate || !endDate}
              data-testid="button-save-promotion"
            >
              {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingPromo ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
