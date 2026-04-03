import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertCircle, Calendar, FileVideo, FileImage, Clock, Loader2, CheckCircle, XCircle, Settings, MessageSquare, Send, X, Store, SlidersHorizontal, ChevronUp, ChevronDown, RefreshCw, Truck, Plus, Flame } from "lucide-react";
import type { ComplaintWithDetails, ComplaintCommentWithUser } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getComplaintStatus } from "@/lib/translations";

export default function SupplierComplaints() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const highlightComplaintId = searchParams.get("complaintId");
  const initialRestaurantId = searchParams.get("restaurantId");

  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintWithDetails | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [newComment, setNewComment] = useState("");

  const [filterRestaurant, setFilterRestaurant] = useState<string>(initialRestaurantId || "all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [showSecondaryFilters, setShowSecondaryFilters] = useState(false);
  const [showComplaintMessageInput, setShowComplaintMessageInput] = useState(false);
  const [complaintMessage, setComplaintMessage] = useState("");
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpItems, setFollowUpItems] = useState<{ productId: string; productName: string; quantity: number; unitPrice: string }[]>([]);
  const [followUpDeliveryDate, setFollowUpDeliveryDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");

  const { data: complaints, isLoading } = useQuery<ComplaintWithDetails[]>({
    queryKey: [`/api/complaints?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: complaintComments, isLoading: loadingComments } = useQuery<ComplaintCommentWithUser[]>({
    queryKey: [`/api/complaints/${selectedComplaint?.id}/comments`],
    enabled: !!selectedComplaint?.id && (showCommentDialog || showDetailDialog),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, { status });
    },
    onSuccess: () => {
      toast({ title: t("supplierComplaints", "statusUpdated"), description: lang === "de" ? "Der Status wurde erfolgreich geändert." : "Lo stato è stato aggiornato con successo." });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?supplierId=${currentUser?.id}`] });
      setShowStatusDialog(false);
      setSelectedComplaint(null);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("supplierComplaints", "statusUpdateError"), variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ complaintId, content }: { complaintId: string; content: string }) => {
      return apiRequest("POST", `/api/complaints/${complaintId}/comments`, {
        userId: currentUser?.id,
        content,
      });
    },
    onSuccess: () => {
      toast({ title: lang === "de" ? "Kommentar hinzugefügt" : "Commento aggiunto", description: lang === "de" ? "Ihr Kommentar wurde gespeichert." : "Il tuo commento è stato salvato." });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints/${selectedComplaint?.id}/comments`] });
      setNewComment("");
    },
    onError: () => {
      toast({ title: t("common", "error"), description: lang === "de" ? "Kommentar konnte nicht gespeichert werden." : "Impossibile salvare il commento.", variant: "destructive" });
    },
  });

  const followUpOrderMutation = useMutation({
    mutationFn: async (data: { complaintId: string; items: typeof followUpItems; deliveryDate: string; notes: string }) => {
      return apiRequest("POST", `/api/complaints/${data.complaintId}/follow-up-order`, {
        items: data.items,
        deliveryDate: data.deliveryDate,
        notes: data.notes,
        supplierId: currentUser?.id,
      });
    },
    onSuccess: () => {
      toast({ title: lang === "de" ? "Nachlieferung erstellt" : "Riconsegna creata", description: lang === "de" ? "Die Folgebestellung wurde erstellt und bestätigt." : "L'ordine successivo è stato creato e confermato." });
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0] as string;
        return key?.includes("/api/complaints") || key?.includes("/api/orders") || key?.includes("/api/conversations");
      }});
      setShowFollowUpDialog(false);
      setShowDetailDialog(false);
      setFollowUpItems([]);
      setFollowUpDeliveryDate("");
      setFollowUpNotes("");
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", description: lang === "de" ? "Nachlieferung konnte nicht erstellt werden." : "Impossibile creare la riconsegna.", variant: "destructive" });
    },
  });

  const openFollowUpDialog = (complaint: ComplaintWithDetails) => {
    if (!complaint.affectedItems) return;
    try {
      const items = JSON.parse(complaint.affectedItems);
      if (Array.isArray(items) && items.length > 0) {
        setFollowUpItems(items.map((ai: any) => ({ ...ai })));
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setFollowUpDeliveryDate(tomorrow.toISOString().split("T")[0]);
        setFollowUpNotes(`Nachlieferung zu Reklamation #${complaint.id.slice(0, 8)}`);
        setShowFollowUpDialog(true);
      }
    } catch {}
  };

  const sendComplaintMessageMutation = useMutation({
    mutationFn: async ({ complaint, message }: { complaint: ComplaintWithDetails; message: string }) => {
      const restaurantName = complaint.restaurant?.companyName || complaint.restaurant?.name || "";
      const refLabel = `${lang === "de" ? "Reklamation" : "Reclamo"}: ${complaint.title} - ${restaurantName}`;
      return await apiRequest("POST", "/api/send-referenced-message", {
        senderId: currentUser?.id,
        restaurantId: complaint.restaurantId,
        supplierId: complaint.supplierId,
        message,
        referenceType: "complaint",
        referenceId: complaint.id,
        referenceLabel: refLabel,
      });
    },
    onSuccess: () => {
      toast({ title: lang === "de" ? "Nachricht gesendet" : "Messaggio inviato" });
      setComplaintMessage("");
      setShowComplaintMessageInput(false);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  useEffect(() => {
    if (highlightComplaintId && complaints) {
      const complaint = complaints.find(c => c.id === highlightComplaintId);
      if (complaint) {
        setSelectedComplaint(complaint);
        setShowDetailDialog(true);
      }
    }
  }, [highlightComplaintId, complaints]);

  const openDetailDialog = (complaint: ComplaintWithDetails) => {
    setSelectedComplaint(complaint);
    setShowDetailDialog(true);
    setNewComment("");
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatShortDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const isVideoFile = (url: string) => {
    return /\.(mp4|webm|mov|avi|mkv)$/i.test(url);
  };

  const getMediaSrc = (url: string) => {
    if (url.startsWith("/objects/")) return url;
    const match = url.match(/\.private\/(.+)$/);
    if (match) return `/objects/${match[1]}`;
    return `/objects${url}`;
  };

  const formatComplaintStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      open: { label: getComplaintStatus("open", lang), icon: Clock, variant: "secondary" },
      in_progress: { label: getComplaintStatus("in_progress", lang), icon: Loader2, variant: "default" },
      resolved: { label: getComplaintStatus("resolved", lang), icon: CheckCircle, variant: "outline" },
      closed: { label: getComplaintStatus("closed", lang), icon: XCircle, variant: "outline" },
    };
    return statusMap[status] || { label: status, icon: Clock, variant: "secondary" as const };
  };

  const getComplaintAccent = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-400 dark:bg-yellow-500";
      case "in_progress": return "bg-blue-400 dark:bg-blue-500";
      case "resolved": return "bg-green-400 dark:bg-green-500";
      case "closed": return "bg-muted-foreground/50";
      default: return "bg-muted-foreground";
    }
  };

  const getComplaintCardBg = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40";
      case "in_progress": return "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
      case "resolved": return "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40";
      case "closed": return "bg-muted/30 border-border";
      default: return "";
    }
  };

  const openStatusWizard = (complaint: ComplaintWithDetails) => {
    setSelectedComplaint(complaint);
    setNewStatus(complaint.status);
    setShowStatusDialog(true);
  };

  const openCommentWizard = (complaint: ComplaintWithDetails) => {
    setSelectedComplaint(complaint);
    setShowCommentDialog(true);
    setNewComment("");
  };

  const handleStatusSubmit = () => {
    if (!selectedComplaint || !newStatus) return;
    updateStatusMutation.mutate({ id: selectedComplaint.id, status: newStatus });
  };

  const handleCommentSubmit = () => {
    if (!selectedComplaint || !newComment.trim()) {
      toast({ title: t("common", "error"), description: lang === "de" ? "Bitte geben Sie einen Kommentar ein." : "Inserisci un commento.", variant: "destructive" });
      return;
    }
    addCommentMutation.mutate({ complaintId: selectedComplaint.id, content: newComment.trim() });
  };

  const uniqueRestaurants = useMemo(() => {
    if (!complaints) return [];
    const map = new Map<string, { id: string; name: string; profileImageUrl: string | null; complaintCount: number }>();
    complaints.forEach(c => {
      if (c.restaurant?.id) {
        const existing = map.get(c.restaurant.id);
        if (existing) {
          existing.complaintCount++;
        } else {
          map.set(c.restaurant.id, {
            id: c.restaurant.id,
            name: c.restaurant.companyName || c.restaurant.name || "",
            profileImageUrl: c.restaurant.profileImageUrl,
            complaintCount: 1,
          });
        }
      }
    });
    return Array.from(map.values());
  }, [complaints]);

  const statusCounts = useMemo(() => {
    if (!complaints) return { all: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    const counts = { all: complaints.length, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    complaints.forEach(c => {
      if (c.status in counts) (counts as any)[c.status]++;
    });
    return counts;
  }, [complaints]);

  const hasActiveFilters = filterRestaurant !== "all" || filterDateFrom || filterDateTo;
  const hasSecondaryFilters = filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterRestaurant("all");
    setFilterStatus("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const filteredComplaints = useMemo(() => {
    if (!complaints) return [];
    return complaints.filter(c => {
      if (filterRestaurant !== "all" && c.restaurant?.id !== filterRestaurant) return false;
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterDateFrom) {
        const from = new Date(filterDateFrom);
        from.setHours(0, 0, 0, 0);
        if (new Date(c.createdAt) < from) return false;
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(c.createdAt) > to) return false;
      }
      return true;
    });
  }, [complaints, filterRestaurant, filterStatus, filterDateFrom, filterDateTo]);

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 md:h-6 md:w-6 text-primary" />
        <h1 className="text-lg md:text-xl font-semibold">{t("common", "complaints")}</h1>
      </div>

      {uniqueRestaurants.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          <button
            onClick={() => setFilterRestaurant("all")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all shrink-0 text-xs ${
              filterRestaurant === "all"
                ? "border-primary bg-primary/10 text-primary font-semibold dark:bg-primary/20"
                : "border-transparent bg-muted/50 text-muted-foreground dark:bg-muted/30"
            }`}
            data-testid="filter-complaint-restaurant-all"
          >
            <Store className="h-3.5 w-3.5" />
            <span>{t("common", "all")}</span>
            <span className="font-bold">{complaints?.length || 0}</span>
          </button>
          {uniqueRestaurants.map(restaurant => {
            const isActive = filterRestaurant === restaurant.id;
            return (
              <button
                key={restaurant.id}
                onClick={() => setFilterRestaurant(restaurant.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all shrink-0 text-xs ${
                  isActive
                    ? "border-primary bg-primary/10 text-primary font-semibold dark:bg-primary/20"
                    : "border-transparent bg-muted/50 text-muted-foreground dark:bg-muted/30"
                }`}
                data-testid={`filter-complaint-restaurant-${restaurant.id}`}
              >
                <Avatar className={`h-5 w-5 ${isActive ? "ring-1 ring-primary" : ""}`}>
                  <AvatarImage src={restaurant.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-[8px] font-semibold">
                    {restaurant.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[80px] truncate">{restaurant.name}</span>
                <span className="font-bold">{restaurant.complaintCount}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {([
          { key: "all", icon: AlertCircle, activeClass: "bg-primary text-primary-foreground border-primary" },
          { key: "open", icon: Clock, activeClass: "bg-yellow-500 text-white border-yellow-400 dark:bg-yellow-600 dark:border-yellow-500" },
          { key: "in_progress", icon: Loader2, activeClass: "bg-blue-500 text-white border-blue-400 dark:bg-blue-600 dark:border-blue-500" },
          { key: "resolved", icon: CheckCircle, activeClass: "bg-green-500 text-white border-green-400 dark:bg-green-600 dark:border-green-500" },
          { key: "closed", icon: XCircle, activeClass: "bg-muted-foreground text-background border-muted-foreground" },
        ] as const).map(({ key, icon: Icon, activeClass }) => {
          const isActive = filterStatus === key;
          const count = (statusCounts as any)[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs transition-all shrink-0 ${
                isActive ? activeClass : "border-transparent bg-muted/60 text-muted-foreground"
              }`}
              data-testid={`filter-complaint-status-${key}`}
            >
              <Icon className="h-3 w-3" />
              <span className="font-medium">
                {key === "all" ? t("common", "all") : getComplaintStatus(key, lang)}
              </span>
              <span className="font-bold">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowSecondaryFilters(!showSecondaryFilters)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover-elevate rounded-md px-2 py-1"
          data-testid="button-toggle-complaint-filters"
        >
          <SlidersHorizontal className="h-3 w-3" />
          <span>{lang === "de" ? "Filter" : "Filtri"}</span>
          {hasSecondaryFilters && (
            <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
              {(filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0)}
            </span>
          )}
          {showSecondaryFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover-elevate rounded-md px-2 py-1 flex items-center gap-1"
            data-testid="button-clear-complaint-filters"
          >
            <X className="h-3 w-3" />
            {t("common", "reset")}
          </button>
        )}
      </div>

      {showSecondaryFilters && (
        <div className="flex gap-2 px-1">
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-muted-foreground mb-0.5 block">{t("common", "from")}</label>
            <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 text-xs" data-testid="filter-complaint-date-from" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[10px] text-muted-foreground mb-0.5 block">{t("common", "to")}</label>
            <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 text-xs" data-testid="filter-complaint-date-to" />
          </div>
        </div>
      )}

      <div className="space-y-1.5 md:space-y-2">
          {isLoading ? (
            <div className="space-y-1.5 md:space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 md:h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredComplaints.length > 0 ? (
            <div className="space-y-1.5 md:space-y-2">
              {filteredComplaints.map((complaint) => {
                const statusInfo = formatComplaintStatusInfo(complaint.status);
                const StatusIcon = statusInfo.icon;

                return (
                  <div
                    key={complaint.id}
                    className={`flex items-center gap-2.5 md:gap-3 p-2.5 md:p-3 rounded-lg border cursor-pointer hover-elevate transition-all ${(complaint as any).priority === "urgent" ? "border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/15" : getComplaintCardBg(complaint.status)}`}
                    onClick={() => openDetailDialog(complaint)}
                    data-testid={`complaint-${complaint.id}`}
                  >
                    <div className={`w-1 self-stretch rounded-full shrink-0 ${(complaint as any).priority === "urgent" ? "bg-red-500" : getComplaintAccent(complaint.status)}`} />

                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={complaint.restaurant?.profileImageUrl || undefined} alt={complaint.restaurant?.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                        {complaint.restaurant?.companyName?.substring(0, 2).toUpperCase() || "??"}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5">
                        <div className="flex items-center gap-1.5">
                          {(complaint as any).priority === "urgent" && (
                            <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          <span className={`font-medium text-sm line-clamp-1 ${(complaint as any).priority === "urgent" ? "text-red-700 dark:text-red-400" : ""}`}>{complaint.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant={statusInfo.variant} className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                            <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                            {statusInfo.label}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{complaint.description}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] md:text-[11px] text-muted-foreground flex-wrap">
                        <span>{complaint.restaurant?.companyName || t("common", "unknown")}</span>
                        <span>·</span>
                        <span className="font-mono font-semibold">#{complaint.orderId.substring(0, 8)}</span>
                        <span>·</span>
                        <span>{formatShortDate(complaint.createdAt)}</span>
                        {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              <FileImage className="h-2.5 w-2.5" />
                              {complaint.mediaUrls.length}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); openStatusWizard(complaint); }}
                        data-testid={`button-change-status-${complaint.id}`}
                      >
                        <Settings className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); openCommentWizard(complaint); }}
                        data-testid={`button-add-comment-${complaint.id}`}
                      >
                        <MessageSquare className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm font-medium">{lang === "de" ? "Keine Reklamationen" : "Nessun reclamo"}</p>
              <p className="text-xs">{lang === "de" ? "Keine Reklamationen erhalten." : "Nessun reclamo ricevuto."}</p>
            </div>
          )}
      </div>

      <Dialog open={showDetailDialog} onOpenChange={(open) => { if (!open) { setShowDetailDialog(false); setSelectedComplaint(null); setNewComment(""); setShowComplaintMessageInput(false); setComplaintMessage(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-complaint-detail">
          <DialogHeader className="sr-only">
            <DialogTitle>{lang === "de" ? "Reklamation" : "Reclamo"}</DialogTitle>
          </DialogHeader>
          {selectedComplaint && (
            <div className="flex flex-col flex-1 min-h-0 px-5 pt-5 pb-5 space-y-4">
              <div className="space-y-3 shrink-0">
                {(selectedComplaint as any).priority === "urgent" && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                    <Flame className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                      {lang === "de" ? "Dringende Reklamation" : "Reclamo urgente"}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-sm md:text-base min-w-0 truncate">{selectedComplaint.title}</h3>
                  {(() => {
                    const si = formatComplaintStatusInfo(selectedComplaint.status);
                    const SI = si.icon;
                    return (
                      <Badge variant={si.variant} className="text-xs shrink-0">
                        <SI className="h-3 w-3 mr-1" />
                        {si.label}
                      </Badge>
                    );
                  })()}
                </div>

                <p className="text-sm text-muted-foreground">{selectedComplaint.description}</p>

                {selectedComplaint.affectedItems && (() => {
                  try {
                    const items = JSON.parse(selectedComplaint.affectedItems);
                    if (Array.isArray(items) && items.length > 0) {
                      return (
                        <div className="space-y-2">
                          <div className="p-3 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                            <div className="flex items-center gap-1.5 mb-2">
                              <RefreshCw className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                              <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase">
                                {lang === "de" ? "Nachlieferung angefragt" : "Riconsegna richiesta"}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {items.map((ai: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                                  <span className="text-foreground">{ai.productName}</span>
                                  <span className="text-muted-foreground">{ai.quantity}x {parseFloat(ai.unitPrice).toFixed(2)} EUR</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {selectedComplaint.status !== "closed" && selectedComplaint.status !== "resolved" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-foreground"
                              onClick={() => openFollowUpDialog(selectedComplaint)}
                              data-testid="button-create-follow-up-order"
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                              {lang === "de" ? "Nachlieferung erstellen" : "Crea riconsegna"}
                            </Button>
                          )}
                        </div>
                      );
                    }
                    return null;
                  } catch { return null; }
                })()}

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">{t("common", "restaurant")}</span>
                    <span className="font-medium text-right truncate">{selectedComplaint.restaurant?.companyName || t("common", "unknown")}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">{lang === "de" ? "Bestellung" : "Ordine"}</span>
                    <span className="shrink-0">#{selectedComplaint.orderId.substring(0, 8)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">{lang === "de" ? "Erstellt am" : "Creato il"}</span>
                    <span className="shrink-0">{formatDate(selectedComplaint.createdAt)}</span>
                  </div>
                </div>

                {selectedComplaint.mediaUrls && selectedComplaint.mediaUrls.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1.5">{lang === "de" ? "Anhänge" : "Allegati"}</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedComplaint.mediaUrls.map((url, idx) => (
                        <a
                          key={idx}
                          href={getMediaSrc(url)}
                          rel="noopener noreferrer"
                          className="h-16 w-16 rounded-lg border bg-muted overflow-hidden"
                        >
                          {isVideoFile(url) ? (
                            <div className="h-full w-full flex items-center justify-center">
                              <FileVideo className="h-6 w-6 text-muted-foreground" />
                            </div>
                          ) : (
                            <img src={getMediaSrc(url)} alt={`${lang === "de" ? "Anhang" : "Allegato"} ${idx + 1}`} className="h-full w-full object-cover" />
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              <div className="border-t border-border pt-3 flex-1 overflow-auto min-h-0">
                <p className="text-sm font-medium mb-2">{lang === "de" ? "Kommentare" : "Commenti"}</p>
                <div className="space-y-3">
                  {loadingComments ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : complaintComments && complaintComments.length > 0 ? (
                    complaintComments.map((comment) => (
                      <div key={comment.id} className="p-3 rounded-lg border space-y-1">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={comment.user?.profileImageUrl || undefined} />
                            <AvatarFallback className="text-xs">
                              {comment.user?.name?.substring(0, 2).toUpperCase() || "??"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{comment.user?.name || t("common", "unknown")}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {formatDate(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground pl-8">{comment.content}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">{lang === "de" ? "Noch keine Kommentare" : "Nessun commento ancora"}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-3 shrink-0 space-y-2.5">
                <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {lang === "de" ? "Aktionen" : "Azioni"}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-foreground"
                    onClick={() => { setShowDetailDialog(false); setTimeout(() => openStatusWizard(selectedComplaint), 100); }}
                    data-testid="button-detail-change-status"
                  >
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    {t("supplierComplaints", "updateStatus")}
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={lang === "de" ? "Schreiben Sie einen Kommentar..." : "Scrivi un commento..."}
                    rows={2}
                    className="flex-1"
                    data-testid="input-detail-comment"
                  />
                  <Button
                    size="icon"
                    onClick={() => selectedComplaint && addCommentMutation.mutate({ complaintId: selectedComplaint.id, content: newComment.trim() })}
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                    data-testid="button-send-detail-comment"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                {!showComplaintMessageInput ? (
                  <Button
                    variant="outline"
                    className="w-full text-foreground"
                    size="sm"
                    onClick={() => setShowComplaintMessageInput(true)}
                    data-testid="button-complaint-write-message"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {lang === "de" ? "Nachricht schreiben" : "Scrivi messaggio"}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 border-l-3 border-destructive/50">
                      <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                      <span className="text-[11px] text-muted-foreground truncate">
                        {lang === "de" ? "Reklamation" : "Reclamo"}: {selectedComplaint.title}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Textarea
                        value={complaintMessage}
                        onChange={(e) => setComplaintMessage(e.target.value)}
                        placeholder={lang === "de" ? "Nachricht an Betrieb..." : "Messaggio all'azienda..."}
                        rows={2}
                        className="flex-1"
                        data-testid="input-complaint-message"
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon"
                          onClick={() => selectedComplaint && sendComplaintMessageMutation.mutate({ complaint: selectedComplaint, message: complaintMessage.trim() })}
                          disabled={!complaintMessage.trim() || sendComplaintMessageMutation.isPending}
                          data-testid="button-send-complaint-message"
                        >
                          {sendComplaintMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setShowComplaintMessageInput(false); setComplaintMessage(""); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("supplierComplaints", "updateStatus")}</DialogTitle>
          </DialogHeader>
          
          <div className="px-5 pt-5 pb-2">
            <h3 className="text-sm font-semibold">{t("supplierComplaints", "updateStatus")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{lang === "de" ? "Wählen Sie den neuen Status" : "Seleziona il nuovo stato"}</p>
          </div>

          <div className="px-5 pb-5 space-y-3">
            {selectedComplaint && (
              <div className="p-3 rounded-xl bg-muted/30">
                <div className="font-medium text-sm">{selectedComplaint.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedComplaint.restaurant?.companyName} • {formatShortDate(selectedComplaint.createdAt)}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {selectedComplaint?.status === "open" && (
                <>
                  <Button size="sm" className="rounded-lg" onClick={() => updateStatusMutation.mutate({ id: selectedComplaint.id, status: "in_progress" })} disabled={updateStatusMutation.isPending} data-testid="button-status-in_progress">
                    <Loader2 className="h-3.5 w-3.5 mr-1.5" />
                    {lang === "de" ? "In Bearbeitung" : "In lavorazione"}
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => updateStatusMutation.mutate({ id: selectedComplaint.id, status: "closed" })} disabled={updateStatusMutation.isPending} data-testid="button-status-closed">
                    <XCircle className="h-3.5 w-3.5 mr-1.5 text-destructive" />
                    {lang === "de" ? "Schließen" : "Chiudere"}
                  </Button>
                </>
              )}
              {selectedComplaint?.status === "in_progress" && (
                <>
                  <Button size="sm" className="rounded-lg" onClick={() => updateStatusMutation.mutate({ id: selectedComplaint.id, status: "resolved" })} disabled={updateStatusMutation.isPending} data-testid="button-status-resolved">
                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                    {lang === "de" ? "Gelöst" : "Risolto"}
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => updateStatusMutation.mutate({ id: selectedComplaint.id, status: "closed" })} disabled={updateStatusMutation.isPending} data-testid="button-status-closed">
                    <XCircle className="h-3.5 w-3.5 mr-1.5 text-destructive" />
                    {lang === "de" ? "Schließen" : "Chiudere"}
                  </Button>
                </>
              )}
              {selectedComplaint?.status === "resolved" && (
                <>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => updateStatusMutation.mutate({ id: selectedComplaint.id, status: "closed" })} disabled={updateStatusMutation.isPending} data-testid="button-status-closed">
                    <XCircle className="h-3.5 w-3.5 mr-1.5 text-destructive" />
                    {lang === "de" ? "Schließen" : "Chiudere"}
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-lg" onClick={() => updateStatusMutation.mutate({ id: selectedComplaint.id, status: "open" })} disabled={updateStatusMutation.isPending} data-testid="button-status-open">
                    <Clock className="h-3.5 w-3.5 mr-1.5" />
                    {lang === "de" ? "Wieder öffnen" : "Riaprire"}
                  </Button>
                </>
              )}
              {selectedComplaint?.status === "closed" && (
                <Button size="sm" variant="outline" className="rounded-lg" onClick={() => updateStatusMutation.mutate({ id: selectedComplaint.id, status: "open" })} disabled={updateStatusMutation.isPending} data-testid="button-status-open">
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  {lang === "de" ? "Wieder öffnen" : "Riaprire"}
                </Button>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full rounded-lg"
              onClick={() => setShowStatusDialog(false)}
              data-testid="button-cancel-status"
            >
              {t("common", "cancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>{lang === "de" ? "Kommentare" : "Commenti"}</DialogTitle>
          </DialogHeader>
          
          <div className="px-5 pt-5 pb-2">
            <h3 className="text-sm font-semibold">{lang === "de" ? "Kommentare" : "Commenti"}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{lang === "de" ? "Kommentare anzeigen und hinzufügen" : "Visualizza e aggiungi commenti"}</p>
          </div>

          {selectedComplaint && (
            <div className="flex flex-col flex-1 min-h-0 space-y-4 px-5 pb-5">
              <div className="p-3 rounded-xl bg-muted/30 shrink-0">
                <div className="font-medium text-sm">{selectedComplaint.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedComplaint.restaurant?.companyName} • {formatShortDate(selectedComplaint.createdAt)}
                </div>
              </div>

              <div className="flex-1 overflow-auto space-y-3 min-h-0">
                {loadingComments ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : complaintComments && complaintComments.length > 0 ? (
                  complaintComments.map((comment) => (
                    <div key={comment.id} className="p-3 rounded-lg border space-y-1">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={comment.user?.profileImageUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {comment.user?.name?.substring(0, 2).toUpperCase() || "??"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{comment.user?.name || t("common", "unknown")}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground pl-8">{comment.content}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">{lang === "de" ? "Noch keine Kommentare" : "Nessun commento ancora"}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2 shrink-0 border-t pt-4">
                <Label>{lang === "de" ? "Neuer Kommentar" : "Nuovo commento"}</Label>
                <div className="flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={lang === "de" ? "Schreiben Sie einen Kommentar..." : "Scrivi un commento..."}
                    rows={2}
                    className="flex-1"
                    data-testid="input-new-comment"
                  />
                  <Button
                    size="icon"
                    onClick={handleCommentSubmit}
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                    data-testid="button-send-comment"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showFollowUpDialog} onOpenChange={setShowFollowUpDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{lang === "de" ? "Nachlieferung erstellen" : "Crea riconsegna"}</DialogTitle>
          </DialogHeader>

          <div className="px-5 pt-5 pb-2">
            <h3 className="text-sm font-semibold">{lang === "de" ? "Nachlieferung erstellen" : "Crea riconsegna"}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "de"
                ? "Passen Sie die Mengen an und legen Sie das Lieferdatum fest."
                : "Regola le quantità e imposta la data di consegna."}
            </p>
          </div>

          <div className="space-y-4 px-5 pb-5">
            <div className="space-y-3">
              <Label className="text-sm font-medium">{lang === "de" ? "Produkte" : "Prodotti"}</Label>
              {followUpItems.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border space-y-2" data-testid={`follow-up-item-${idx}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.productName}</span>
                    <span className="text-xs text-muted-foreground">
                      {parseFloat(item.unitPrice).toFixed(2)} EUR/{lang === "de" ? "Stk" : "pz"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground shrink-0">{lang === "de" ? "Menge" : "Quantità"}</Label>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          const updated = [...followUpItems];
                          updated[idx] = { ...updated[idx], quantity: Math.max(1, updated[idx].quantity - 1) };
                          setFollowUpItems(updated);
                        }}
                        data-testid={`button-decrease-${idx}`}
                      >
                        <span className="text-base">-</span>
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => {
                          const updated = [...followUpItems];
                          updated[idx] = { ...updated[idx], quantity: Math.max(1, parseInt(e.target.value) || 1) };
                          setFollowUpItems(updated);
                        }}
                        className="w-16 h-7 text-center text-sm"
                        data-testid={`input-quantity-${idx}`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          const updated = [...followUpItems];
                          updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
                          setFollowUpItems(updated);
                        }}
                        data-testid={`button-increase-${idx}`}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-sm font-medium ml-auto">
                      {(item.quantity * parseFloat(item.unitPrice)).toFixed(2)} EUR
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50 border font-medium text-sm">
                <span>{lang === "de" ? "Gesamt" : "Totale"}</span>
                <span>{followUpItems.reduce((sum, item) => sum + item.quantity * parseFloat(item.unitPrice), 0).toFixed(2)} EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{lang === "de" ? "Lieferdatum" : "Data di consegna"}</Label>
              <Input
                type="date"
                value={followUpDeliveryDate}
                onChange={(e) => setFollowUpDeliveryDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                data-testid="input-follow-up-delivery-date"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{lang === "de" ? "Notiz" : "Note"}</Label>
              <Textarea
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                placeholder={lang === "de" ? "Optionale Notiz zur Nachlieferung..." : "Nota opzionale per la riconsegna..."}
                rows={2}
                data-testid="input-follow-up-notes"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-lg" onClick={() => setShowFollowUpDialog(false)}>
              {lang === "de" ? "Abbrechen" : "Annulla"}
            </Button>
            <Button
              className="flex-1 rounded-lg"
              onClick={() => {
                if (selectedComplaint && followUpDeliveryDate && followUpItems.length > 0) {
                  followUpOrderMutation.mutate({
                    complaintId: selectedComplaint.id,
                    items: followUpItems,
                    deliveryDate: followUpDeliveryDate,
                    notes: followUpNotes,
                  });
                }
              }}
              disabled={!followUpDeliveryDate || followUpItems.length === 0 || followUpOrderMutation.isPending}
              data-testid="button-confirm-follow-up-order"
            >
              {followUpOrderMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Truck className="h-4 w-4 mr-2" />
              )}
              {lang === "de" ? "Nachlieferung bestätigen" : "Conferma riconsegna"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
