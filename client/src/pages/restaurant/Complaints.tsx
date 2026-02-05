import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { AlertCircle, Send, Package, ImagePlus, X, FileVideo, FileImage, Pencil, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { User, Order, ComplaintWithDetails } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";

export default function Complaints() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  
  // Edit state
  const [editingComplaint, setEditingComplaint] = useState<ComplaintWithDetails | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMediaUrls, setEditMediaUrls] = useState<string[]>([]);

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
    mutationFn: async (data: { orderId: string; restaurantId: string; supplierId: string; title: string; description: string; mediaUrls: string[] }) => {
      return apiRequest("POST", "/api/complaints", data);
    },
    onSuccess: () => {
      toast({ title: "Reklamation gesendet", description: "Ihre Reklamation wurde erfolgreich übermittelt." });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      resetForm();
    },
    onError: () => {
      toast({ title: "Fehler", description: "Reklamation konnte nicht gesendet werden.", variant: "destructive" });
    },
  });

  const updateComplaintMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; description: string; mediaUrls: string[] }) => {
      return apiRequest("PATCH", `/api/complaints/${data.id}`, { 
        title: data.title, 
        description: data.description, 
        mediaUrls: data.mediaUrls 
      });
    },
    onSuccess: () => {
      toast({ title: "Reklamation aktualisiert", description: "Ihre Änderungen wurden gespeichert." });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      setEditingComplaint(null);
    },
    onError: () => {
      toast({ title: "Fehler", description: "Änderungen konnten nicht gespeichert werden.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedSupplierId("");
    setSelectedOrderId("");
    setTitle("");
    setDescription("");
    setMediaUrls([]);
  };

  const handleSubmit = () => {
    if (!selectedOrderId || !selectedSupplierId || !title.trim() || !description.trim()) {
      toast({ title: "Fehler", description: "Bitte füllen Sie alle Felder aus.", variant: "destructive" });
      return;
    }

    createComplaintMutation.mutate({
      orderId: selectedOrderId,
      restaurantId: currentUser!.id,
      supplierId: selectedSupplierId,
      title: title.trim(),
      description: description.trim(),
      mediaUrls,
    });
  };

  const handleUploadComplete = async (result: any) => {
    const uploadedFiles = result.successful || [];
    for (const file of uploadedFiles) {
      const response = file.response;
      if (response?.uploadURL) {
        const url = new URL(response.uploadURL);
        const objectPath = url.pathname;
        setMediaUrls(prev => [...prev, objectPath]);
      }
    }
    toast({ title: "Upload erfolgreich", description: `${uploadedFiles.length} Datei(en) hochgeladen` });
  };

  const removeMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const isVideoFile = (url: string) => {
    return /\.(mp4|webm|mov|avi|mkv)$/i.test(url);
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

  const formatComplaintStatus = (status: string) => {
    const statusMap: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      open: { label: "Offen", icon: Clock, variant: "secondary" },
      in_progress: { label: "In Bearbeitung", icon: Loader2, variant: "default" },
      resolved: { label: "Gelöst", icon: CheckCircle, variant: "outline" },
      closed: { label: "Geschlossen", icon: XCircle, variant: "outline" },
    };
    return statusMap[status] || { label: status, icon: Clock, variant: "secondary" as const };
  };

  const openEditDialog = (complaint: ComplaintWithDetails) => {
    setEditingComplaint(complaint);
    setEditTitle(complaint.title);
    setEditDescription(complaint.description);
    setEditMediaUrls(complaint.mediaUrls || []);
  };

  const handleEditSubmit = () => {
    if (!editingComplaint || !editTitle.trim() || !editDescription.trim()) {
      toast({ title: "Fehler", description: "Bitte füllen Sie alle Felder aus.", variant: "destructive" });
      return;
    }

    updateComplaintMutation.mutate({
      id: editingComplaint.id,
      title: editTitle.trim(),
      description: editDescription.trim(),
      mediaUrls: editMediaUrls,
    });
  };

  const removeEditMedia = (index: number) => {
    setEditMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleEditUploadComplete = async (result: any) => {
    const uploadedFiles = result.successful || [];
    for (const file of uploadedFiles) {
      const response = file.response;
      if (response?.uploadURL) {
        const url = new URL(response.uploadURL);
        const objectPath = url.pathname;
        setEditMediaUrls(prev => [...prev, objectPath]);
      }
    }
    toast({ title: "Upload erfolgreich", description: `${uploadedFiles.length} Datei(en) hochgeladen` });
  };

  const canSubmit = selectedOrderId && selectedSupplierId && title.trim() && description.trim();

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-2 md:gap-3">
        <AlertCircle className="h-6 w-6 md:h-8 md:w-8 text-primary" />
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Reklamationen</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Schreiben Sie eine Reklamation zu einer Bestellung</p>
        </div>
      </div>

      <div className="grid gap-3 md:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="text-base md:text-lg">Neue Reklamation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4 p-3 pt-0 md:p-6 md:pt-0">
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
                              <AvatarImage src={supplier.profileImageUrl || undefined} alt={supplier.name} />
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

            <div className="space-y-2">
              <Label>Fotos / Videos anhängen (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {mediaUrls.map((url, index) => (
                  <div 
                    key={index} 
                    className="relative group h-20 w-20 rounded-lg border bg-muted overflow-hidden"
                  >
                    {isVideoFile(url) ? (
                      <div className="h-full w-full flex items-center justify-center bg-muted">
                        <FileVideo className="h-8 w-8 text-muted-foreground" />
                      </div>
                    ) : (
                      <img 
                        src={`/objects${url}`} 
                        alt={`Anhang ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(index)}
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-remove-media-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                
                {mediaUrls.length < 5 && (
                  <ObjectUploader
                    maxNumberOfFiles={5 - mediaUrls.length}
                    maxFileSize={50 * 1024 * 1024}
                    onGetUploadParameters={async (file) => {
                      const res = await fetch("/api/uploads/request-url", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: file.name,
                          size: file.size,
                          contentType: file.type,
                        }),
                      });
                      const { uploadURL } = await res.json();
                      return {
                        method: "PUT" as const,
                        url: uploadURL,
                        headers: { "Content-Type": file.type },
                      };
                    }}
                    onComplete={handleUploadComplete}
                    buttonClassName="h-20 w-20 border-2 border-dashed border-muted-foreground/30 bg-muted/30 rounded-lg hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-[10px]">Hinzufügen</span>
                  </ObjectUploader>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Max. 5 Dateien, je max. 50 MB (Bilder oder Videos)
              </p>
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
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="text-base md:text-lg">Bisherige Reklamationen</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            {loadingComplaints ? (
              <div className="space-y-2 md:space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 md:h-20 w-full" />
                ))}
              </div>
            ) : existingComplaints && existingComplaints.length > 0 ? (
              <div className="space-y-2 md:space-y-3">
                {existingComplaints.map((complaint) => {
                  const statusInfo = formatComplaintStatus(complaint.status);
                  const StatusIcon = statusInfo.icon;
                  const canEdit = complaint.status === "open";
                  
                  return (
                    <div
                      key={complaint.id}
                      className="rounded-lg border p-3 md:p-4 space-y-1.5 md:space-y-2"
                      data-testid={`complaint-${complaint.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm md:text-base">{complaint.title}</div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={statusInfo.variant} className="text-[10px] md:text-xs shrink-0">
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openEditDialog(complaint)}
                              data-testid={`button-edit-complaint-${complaint.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">{complaint.description}</p>
                      
                      {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
                        <div className="flex gap-1.5 mt-2">
                          {complaint.mediaUrls.slice(0, 4).map((url, idx) => (
                            <div key={idx} className="h-12 w-12 rounded overflow-hidden border">
                              {isVideoFile(url) ? (
                                <div className="h-full w-full flex items-center justify-center bg-muted">
                                  <FileVideo className="h-4 w-4 text-muted-foreground" />
                                </div>
                              ) : (
                                <img 
                                  src={`/objects${url}`} 
                                  alt={`Anhang ${idx + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              )}
                            </div>
                          ))}
                          {complaint.mediaUrls.length > 4 && (
                            <div className="h-12 w-12 rounded border flex items-center justify-center bg-muted text-xs text-muted-foreground">
                              +{complaint.mediaUrls.length - 4}
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 text-[10px] md:text-xs text-muted-foreground">
                        <span>{complaint.supplier?.companyName || "Unbekannter Lieferant"}</span>
                        <span>•</span>
                        <span>{formatDate(complaint.createdAt)}</span>
                        {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-0.5">
                              <FileImage className="h-3 w-3" />
                              {complaint.mediaUrls.length}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 md:py-8 text-muted-foreground">
                <AlertCircle className="mx-auto h-10 w-10 md:h-12 md:w-12 mb-2 md:mb-3 opacity-50" />
                <p className="text-sm md:text-base">Noch keine Reklamationen vorhanden</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Complaint Dialog */}
      <Dialog open={!!editingComplaint} onOpenChange={(open) => !open && setEditingComplaint(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reklamation bearbeiten</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titel</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Kurze Beschreibung des Problems"
                data-testid="input-edit-complaint-title"
              />
            </div>

            <div className="space-y-2">
              <Label>Beschreibung</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Beschreiben Sie das Problem ausführlich..."
                rows={4}
                data-testid="input-edit-complaint-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Fotos / Videos</Label>
              <div className="flex flex-wrap gap-2">
                {editMediaUrls.map((url, index) => (
                  <div 
                    key={index} 
                    className="relative group h-16 w-16 rounded-lg border bg-muted overflow-hidden"
                  >
                    {isVideoFile(url) ? (
                      <div className="h-full w-full flex items-center justify-center bg-muted">
                        <FileVideo className="h-6 w-6 text-muted-foreground" />
                      </div>
                    ) : (
                      <img 
                        src={`/objects${url}`} 
                        alt={`Anhang ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeEditMedia(index)}
                      className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-remove-edit-media-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                
                {editMediaUrls.length < 5 && (
                  <ObjectUploader
                    maxNumberOfFiles={5 - editMediaUrls.length}
                    maxFileSize={50 * 1024 * 1024}
                    onGetUploadParameters={async (file) => {
                      const res = await fetch("/api/uploads/request-url", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: file.name,
                          size: file.size,
                          contentType: file.type,
                        }),
                      });
                      const { uploadURL } = await res.json();
                      return {
                        method: "PUT" as const,
                        url: uploadURL,
                        headers: { "Content-Type": file.type },
                      };
                    }}
                    onComplete={handleEditUploadComplete}
                    buttonClassName="h-16 w-16 border-2 border-dashed border-muted-foreground/30 bg-muted/30 rounded-lg hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ImagePlus className="h-4 w-4" />
                    <span className="text-[9px]">Hinzufügen</span>
                  </ObjectUploader>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingComplaint(null)}
              data-testid="button-cancel-edit-complaint"
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={!editTitle.trim() || !editDescription.trim() || updateComplaintMutation.isPending}
              data-testid="button-save-edit-complaint"
            >
              {updateComplaintMutation.isPending ? "Wird gespeichert..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
