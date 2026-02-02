import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertCircle, Star, Send, Package } from "lucide-react";
import type { User, Order, ComplaintWithDetails } from "@shared/schema";

export default function Complaints() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rating, setRating] = useState(0);

  const { data: suppliers, isLoading: loadingSuppliers } = useQuery<User[]>({
    queryKey: [`/api/suppliers-with-orders?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: orders, isLoading: loadingOrders } = useQuery<Order[]>({
    queryKey: [`/api/orders-by-supplier?restaurantId=${currentUser?.id}&supplierId=${selectedSupplierId}`],
    enabled: !!currentUser?.id && !!selectedSupplierId,
  });

  const { data: existingComplaints, isLoading: loadingComplaints } = useQuery<ComplaintWithDetails[]>({
    queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const createComplaintMutation = useMutation({
    mutationFn: async (data: { orderId: string; restaurantId: string; supplierId: string; title: string; description: string; rating: number }) => {
      return apiRequest("POST", "/api/complaints", data);
    },
    onSuccess: () => {
      toast({ title: "Reklamation gesendet", description: "Ihre Reklamation wurde erfolgreich übermittelt." });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints"] });
      resetForm();
    },
    onError: () => {
      toast({ title: "Fehler", description: "Reklamation konnte nicht gesendet werden.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedSupplierId("");
    setSelectedOrderId("");
    setTitle("");
    setDescription("");
    setRating(0);
  };

  const handleSubmit = () => {
    if (!selectedOrderId || !selectedSupplierId || !title.trim() || !description.trim() || rating === 0) {
      toast({ title: "Fehler", description: "Bitte füllen Sie alle Felder aus.", variant: "destructive" });
      return;
    }

    createComplaintMutation.mutate({
      orderId: selectedOrderId,
      restaurantId: currentUser!.id,
      supplierId: selectedSupplierId,
      title: title.trim(),
      description: description.trim(),
      rating,
    });
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatOrderStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: "Ausstehend",
      confirmed: "Bestätigt",
      in_delivery: "In Lieferung",
      delivered: "Geliefert",
      cancelled: "Storniert",
    };
    return statusMap[status] || status;
  };

  const canSubmit = selectedOrderId && selectedSupplierId && title.trim() && description.trim() && rating > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Reklamationen</h1>
          <p className="text-muted-foreground">Schreiben Sie eine Reklamation zu einer Bestellung</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Neue Reklamation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Lieferant auswählen</Label>
              {loadingSuppliers ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={selectedSupplierId}
                  onValueChange={(value) => {
                    setSelectedSupplierId(value);
                    setSelectedOrderId("");
                  }}
                  data-testid="select-supplier"
                >
                  <SelectTrigger data-testid="trigger-supplier">
                    <SelectValue placeholder="Lieferant wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers && suppliers.length > 0 ? (
                      suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id} data-testid={`option-supplier-${supplier.id}`}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {supplier.companyName?.substring(0, 2).toUpperCase() || "??"}
                              </AvatarFallback>
                            </Avatar>
                            {supplier.companyName || supplier.name}
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground">Keine Lieferanten mit Bestellungen gefunden</div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Bestellung auswählen</Label>
              {!selectedSupplierId ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Bitte wählen Sie zuerst einen Lieferanten aus
                </div>
              ) : loadingOrders ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={selectedOrderId}
                  onValueChange={setSelectedOrderId}
                  data-testid="select-order"
                >
                  <SelectTrigger data-testid="trigger-order">
                    <SelectValue placeholder="Bestellung wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {orders && orders.length > 0 ? (
                      orders.map((order) => (
                        <SelectItem key={order.id} value={order.id} data-testid={`option-order-${order.id}`}>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span>{formatDate(order.createdAt)}</span>
                            <span className="text-muted-foreground">-</span>
                            <span>{parseFloat(order.totalAmount).toFixed(2)} €</span>
                            <Badge variant="outline" className="text-xs">
                              {formatOrderStatus(order.status)}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground">Keine Bestellungen gefunden</div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Bewertung</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover-elevate rounded"
                    disabled={!selectedOrderId}
                    data-testid={`button-star-${star}`}
                  >
                    <Star
                      className={`h-6 w-6 ${
                        star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                      } ${!selectedOrderId ? "opacity-50" : ""}`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Betreff</Label>
              <Input
                id="title"
                placeholder="Kurze Beschreibung des Problems..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!selectedOrderId}
                data-testid="input-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                placeholder="Detaillierte Beschreibung Ihrer Reklamation..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={!selectedOrderId}
                data-testid="textarea-description"
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || createComplaintMutation.isPending}
              className="w-full"
              data-testid="button-submit-complaint"
            >
              <Send className="mr-2 h-4 w-4" />
              {createComplaintMutation.isPending ? "Wird gesendet..." : "Reklamation absenden"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bisherige Reklamationen</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingComplaints ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : existingComplaints && existingComplaints.length > 0 ? (
              <div className="space-y-3">
                {existingComplaints.map((complaint) => (
                  <div
                    key={complaint.id}
                    className="rounded-lg border p-4 space-y-2"
                    data-testid={`complaint-${complaint.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{complaint.title}</div>
                      <div className="flex shrink-0">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= complaint.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{complaint.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{complaint.supplier?.companyName || "Unbekannter Lieferant"}</span>
                      <span>•</span>
                      <span>{formatDate(complaint.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="mx-auto h-12 w-12 mb-3 opacity-50" />
                <p>Noch keine Reklamationen vorhanden</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
