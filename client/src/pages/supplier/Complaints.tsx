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
import { AlertCircle, Calendar, FileVideo, FileImage, Clock, Loader2, CheckCircle, XCircle, Settings, MessageSquare, Send, Building2, Filter, X } from "lucide-react";
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

  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintWithDetails | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [newComment, setNewComment] = useState("");

  const [filterRestaurant, setFilterRestaurant] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [showComplaintMessageInput, setShowComplaintMessageInput] = useState(false);
  const [complaintMessage, setComplaintMessage] = useState("");

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
    const map = new Map<string, string>();
    complaints.forEach(c => {
      if (c.restaurant?.id) {
        map.set(c.restaurant.id, c.restaurant.companyName || c.restaurant.name || t("common", "unknown"));
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [complaints, t]);

  const hasActiveFilters = filterRestaurant !== "all" || filterStatus !== "all" || filterDateFrom || filterDateTo;

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

  const openCount = complaints?.filter(c => c.status === "open").length || 0;
  const inProgressCount = complaints?.filter(c => c.status === "in_progress").length || 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-2 md:gap-3">
        <AlertCircle className="h-6 w-6 md:h-8 md:w-8 text-primary" />
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">{t("common", "complaints")}</h1>
          <p className="text-sm md:text-base text-muted-foreground">{t("supplierComplaints", "manageComplaints")}</p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-3 md:gap-4">
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary">{complaints?.length || 0}</div>
              <p className="text-xs md:text-sm text-muted-foreground">{t("common", "total")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-yellow-600">{openCount}</div>
              <p className="text-xs md:text-sm text-muted-foreground">{getComplaintStatus("open", lang)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-blue-600">{inProgressCount}</div>
              <p className="text-xs md:text-sm text-muted-foreground">{getComplaintStatus("in_progress", lang)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="text-base md:text-lg">{lang === "de" ? "Alle Reklamationen" : "Tutti i reclami"}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-end flex-wrap">
            <div className="w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1 block">{t("common", "restaurant")}</label>
              <Select value={filterRestaurant} onValueChange={setFilterRestaurant}>
                <SelectTrigger className="h-9 text-xs md:text-sm w-full sm:w-[160px]" data-testid="filter-complaint-restaurant">
                  <Building2 className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  <SelectValue placeholder={t("common", "all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("supplierComplaints", "allRestaurants")}</SelectItem>
                  {uniqueRestaurants.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1 block">{t("common", "status")}</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 text-xs md:text-sm w-full sm:w-[150px]" data-testid="filter-complaint-status">
                  <Filter className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  <SelectValue placeholder={t("common", "all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{lang === "de" ? "Alle Status" : "Tutti gli stati"}</SelectItem>
                  <SelectItem value="open">{getComplaintStatus("open", lang)}</SelectItem>
                  <SelectItem value="in_progress">{getComplaintStatus("in_progress", lang)}</SelectItem>
                  <SelectItem value="resolved">{getComplaintStatus("resolved", lang)}</SelectItem>
                  <SelectItem value="closed">{getComplaintStatus("closed", lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1 block">{t("common", "from")}</label>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-9 text-xs md:text-sm w-full sm:w-[140px]" data-testid="filter-complaint-date-from" />
            </div>
            <div className="w-full sm:w-auto">
              <label className="text-xs text-muted-foreground mb-1 block">{t("common", "to")}</label>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-9 text-xs md:text-sm w-full sm:w-[140px]" data-testid="filter-complaint-date-to" />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0" data-testid="button-clear-complaint-filters">
                <X className="h-3.5 w-3.5 mr-1" />
                {t("common", "reset")}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3 md:space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 md:h-24 w-full" />
              ))}
            </div>
          ) : filteredComplaints.length > 0 ? (
            <div className="space-y-3 md:space-y-4">
              {filteredComplaints.map((complaint) => {
                const statusInfo = formatComplaintStatusInfo(complaint.status);
                const StatusIcon = statusInfo.icon;

                return (
                  <Card
                    key={complaint.id}
                    className={`overflow-hidden rounded-md cursor-pointer hover-elevate ${getComplaintCardBg(complaint.status)}`}
                    onClick={() => openDetailDialog(complaint)}
                    data-testid={`complaint-${complaint.id}`}
                  >
                    <CardContent className="p-3 md:p-4 space-y-2 md:space-y-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4">
                      <div className="flex items-center gap-2 md:gap-3">
                        <Avatar className="h-8 w-8 md:h-10 md:w-10">
                          <AvatarImage src={complaint.restaurant?.profileImageUrl || undefined} alt={complaint.restaurant?.name} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs md:text-sm">
                            {complaint.restaurant?.companyName?.substring(0, 2).toUpperCase() || "??"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm md:text-base truncate">{complaint.restaurant?.companyName || t("common", "unknown")}</div>
                          <div className="text-xs md:text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-2.5 w-2.5 md:h-3 md:w-3" />
                            {formatDate(complaint.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 self-start">
                        <Badge variant={statusInfo.variant} className="text-[10px] md:text-xs shrink-0">
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusInfo.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] md:text-xs">
                          #{complaint.orderId.substring(0, 8)}
                        </Badge>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-sm md:text-base mb-0.5 md:mb-1">{complaint.title}</h4>
                      <p className="text-xs md:text-sm text-muted-foreground">{complaint.description}</p>
                    </div>
                    
                    {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {complaint.mediaUrls.map((url, idx) => (
                          <a 
                            key={idx} 
                            href={getMediaSrc(url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-14 w-14 md:h-16 md:w-16 rounded-lg overflow-hidden border hover:opacity-80 transition-opacity"
                          >
                            {isVideoFile(url) ? (
                              <div className="h-full w-full flex items-center justify-center bg-muted">
                                <FileVideo className="h-5 w-5 text-muted-foreground" />
                              </div>
                            ) : (
                              <img 
                                src={getMediaSrc(url)} 
                                alt={`${lang === "de" ? "Anhang" : "Allegato"} ${idx + 1}`}
                                className="h-full w-full object-cover"
                              />
                            )}
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); openStatusWizard(complaint); }}
                        data-testid={`button-change-status-${complaint.id}`}
                      >
                        <Settings className="h-3.5 w-3.5 mr-1.5" />
                        {t("supplierComplaints", "updateStatus")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); openCommentWizard(complaint); }}
                        data-testid={`button-add-comment-${complaint.id}`}
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                        {lang === "de" ? "Kommentar" : "Commento"}
                      </Button>
                    </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 md:py-12 text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 md:h-12 md:w-12 mb-2 md:mb-3 opacity-50" />
              <p className="text-base md:text-lg font-medium">{lang === "de" ? "Keine Reklamationen" : "Nessun reclamo"}</p>
              <p className="text-xs md:text-sm">{lang === "de" ? "Keine Reklamationen erhalten." : "Nessun reclamo ricevuto."}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDetailDialog} onOpenChange={(open) => { if (!open) { setShowDetailDialog(false); setSelectedComplaint(null); setNewComment(""); setShowComplaintMessageInput(false); setComplaintMessage(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-complaint-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              {lang === "de" ? "Reklamation" : "Reclamo"}
            </DialogTitle>
            <DialogDescription>
              {lang === "de" ? "Details und Kommentare" : "Dettagli e commenti"}
            </DialogDescription>
          </DialogHeader>
          {selectedComplaint && (
            <div className="flex flex-col flex-1 min-h-0 space-y-4">
              <div className="space-y-3 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-sm md:text-base">{selectedComplaint.title}</h3>
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

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("common", "restaurant")}</span>
                    <span className="font-medium">{selectedComplaint.restaurant?.companyName || t("common", "unknown")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === "de" ? "Bestellung" : "Ordine"}</span>
                    <span>#{selectedComplaint.orderId.substring(0, 8)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{lang === "de" ? "Erstellt am" : "Creato il"}</span>
                    <span>{formatDate(selectedComplaint.createdAt)}</span>
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
                          target="_blank"
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

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setShowDetailDialog(false); setTimeout(() => openStatusWizard(selectedComplaint), 100); }}
                    data-testid="button-detail-change-status"
                  >
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    {t("supplierComplaints", "updateStatus")}
                  </Button>
                </div>
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

              <div className="border-t border-border pt-3 shrink-0 space-y-2">
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
                    className="w-full"
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
                        placeholder={lang === "de" ? "Nachricht an Restaurant..." : "Messaggio al ristorante..."}
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
          <DialogHeader>
            <DialogTitle>{t("supplierComplaints", "updateStatus")}</DialogTitle>
            <DialogDescription>
              {lang === "de" ? "Wählen Sie den neuen Status für diese Reklamation" : "Seleziona il nuovo stato per questo reclamo"}
            </DialogDescription>
          </DialogHeader>
          
          {selectedComplaint && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium text-sm">{selectedComplaint.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedComplaint.restaurant?.companyName} • {formatShortDate(selectedComplaint.createdAt)}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{lang === "de" ? "Neuer Status" : "Nuovo stato"}</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger data-testid="select-complaint-status">
                    <SelectValue placeholder={lang === "de" ? "Status wählen" : "Scegli stato"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {getComplaintStatus("open", lang)}
                      </div>
                    </SelectItem>
                    <SelectItem value="in_progress">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4" />
                        {getComplaintStatus("in_progress", lang)}
                      </div>
                    </SelectItem>
                    <SelectItem value="resolved">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        {getComplaintStatus("resolved", lang)}
                      </div>
                    </SelectItem>
                    <SelectItem value="closed">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        {getComplaintStatus("closed", lang)}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowStatusDialog(false)}
              data-testid="button-cancel-status"
            >
              {t("common", "cancel")}
            </Button>
            <Button
              onClick={handleStatusSubmit}
              disabled={!newStatus || updateStatusMutation.isPending}
              data-testid="button-save-status"
            >
              {updateStatusMutation.isPending ? (lang === "de" ? "Wird gespeichert..." : "Salvataggio...") : t("common", "save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{lang === "de" ? "Kommentare" : "Commenti"}</DialogTitle>
            <DialogDescription>
              {lang === "de" ? "Kommentare zur Reklamation anzeigen und hinzufügen" : "Visualizza e aggiungi commenti al reclamo"}
            </DialogDescription>
          </DialogHeader>
          
          {selectedComplaint && (
            <div className="flex flex-col flex-1 min-h-0 space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 shrink-0">
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
    </div>
  );
}
