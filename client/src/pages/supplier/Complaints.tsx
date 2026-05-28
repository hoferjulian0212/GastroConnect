import { useState, useEffect, useMemo } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useSearch, useLocation } from "wouter";
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
import { AlertCircle, Calendar, FileVideo, FileImage, Clock, Loader2, CheckCircle, XCircle, Settings, MessageSquare, Send, X, Store, RefreshCw, Truck, Plus, Flame, Search, ArrowUpDown, ArrowUp, ArrowDown, Check, Filter as FilterIcon, Ban, AlertTriangle, Hourglass } from "lucide-react";
import { COMPLAINT_REASONS, type ComplaintReason } from "@shared/schema";
import { getComplaintReasonLabel } from "@/lib/complaintReasons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { formatComplaintNumber, formatOrderNumber, type ComplaintWithDetails, type ComplaintCommentWithUser } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getComplaintStatus } from "@/lib/translations";

export default function SupplierComplaints() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [, navTo] = useLocation();
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
  const [filterReason, setFilterReason] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"createdAt" | "status" | "restaurant" | "title">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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
        setFollowUpNotes(`Nachlieferung zu Reklamation #${formatComplaintNumber(complaint)}`);
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
      if (complaint) navTo(`/supplier/complaints/${complaint.id}`);
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
      rejected: { label: getComplaintStatus("rejected", lang), icon: Ban, variant: "destructive" },
      partially_resolved: { label: getComplaintStatus("partially_resolved", lang), icon: AlertTriangle, variant: "default" },
    };
    return statusMap[status] || { label: status, icon: Clock, variant: "secondary" as const };
  };

  const getComplaintAccent = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-400 dark:bg-yellow-500";
      case "in_progress": return "bg-blue-400 dark:bg-blue-500";
      case "resolved": return "bg-green-400 dark:bg-green-500";
      case "partially_resolved": return "bg-amber-400 dark:bg-amber-500";
      case "rejected": return "bg-red-400 dark:bg-red-500";
      case "closed": return "bg-muted-foreground/50";
      default: return "bg-muted-foreground";
    }
  };

  const getComplaintCardBg = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40";
      case "in_progress": return "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
      case "resolved": return "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40";
      case "partially_resolved": return "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40";
      case "rejected": return "bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800/40";
      case "closed": return "bg-muted/30 border-border";
      default: return "";
    }
  };

  const daysOpen = (createdAt: Date | string) => {
    const ms = Date.now() - new Date(createdAt).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
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
    if (!complaints) return { all: 0, active: 0, open: 0, in_progress: 0, resolved: 0, closed: 0, rejected: 0, partially_resolved: 0 };
    const counts = { all: complaints.length, active: 0, open: 0, in_progress: 0, resolved: 0, closed: 0, rejected: 0, partially_resolved: 0 };
    complaints.forEach(c => {
      if (c.status in counts) (counts as any)[c.status]++;
      if (c.status === "open" || c.status === "in_progress") counts.active++;
    });
    return counts;
  }, [complaints]);

  const complaintKpis = useMemo(() => {
    const list = complaints || [];
    const open = list.filter(c => c.status === "open" || c.status === "in_progress").length;
    const closedList = list.filter(c => c.status === "resolved" || c.status === "closed" || c.status === "rejected" || c.status === "partially_resolved");
    let avgHours = 0;
    if (closedList.length > 0) {
      const totalMs = closedList.reduce((sum, c: any) => {
        const end = c.updatedAt ? new Date(c.updatedAt).getTime() : Date.now();
        return sum + (end - new Date(c.createdAt).getTime());
      }, 0);
      avgHours = Math.round(totalMs / closedList.length / (1000 * 60 * 60));
    }
    const reasonCounts: Record<string, number> = {};
    list.forEach((c: any) => {
      if (c.reason) reasonCounts[c.reason] = (reasonCounts[c.reason] || 0) + 1;
    });
    const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as ComplaintReason | undefined;
    return { open, avgHours, topReason };
  }, [complaints]);

  const hasActiveFilters = filterStatus !== "all" || filterPriority !== "all" || filterRestaurant !== "all" || filterReason !== "all" || !!filterDateFrom || !!filterDateTo;
  const activeFilterCount = (filterStatus !== "all" ? 1 : 0) + (filterPriority !== "all" ? 1 : 0) + (filterRestaurant !== "all" ? 1 : 0) + (filterReason !== "all" ? 1 : 0) + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0);
  const priorityLabel = (k: string) => k === "urgent" ? (lang === "de" ? "Dringend" : "Urgente") : k === "normal" ? (lang === "de" ? "Normal" : "Normale") : t("common", "all");
  const statusFilterLabel = (k: string) => k === "active" ? (lang === "de" ? "Aktiv" : "Attivo") : getComplaintStatus(k as any, lang);

  const clearFilters = () => {
    setFilterRestaurant("all");
    setFilterStatus("all");
    setFilterPriority("all");
    setFilterReason("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSearchQuery("");
  };

  const filteredComplaints = useMemo(() => {
    if (!complaints) return [];
    const search = searchQuery.trim().toLowerCase();
    const filtered = complaints.filter(c => {
      if (filterRestaurant !== "all" && c.restaurant?.id !== filterRestaurant) return false;
      if (filterStatus === "active") {
        if (c.status !== "open" && c.status !== "in_progress") return false;
      } else if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterPriority !== "all") {
        const isUrgent = (c as any).priority === "urgent";
        if (filterPriority === "urgent" && !isUrgent) return false;
        if (filterPriority === "normal" && isUrgent) return false;
      }
      if (filterReason !== "all" && (c as any).reason !== filterReason) return false;
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
      if (search) {
        const restaurantName = (c.restaurant?.companyName || c.restaurant?.name || "").toLowerCase();
        const orderId = (c.order?.id || "").toLowerCase();
        const haystack = `${(c.title || "").toLowerCase()} ${restaurantName} ${orderId}`;
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "status":
          cmp = (a.status || "").localeCompare(b.status || "");
          break;
        case "restaurant":
          cmp = ((a.restaurant?.companyName || a.restaurant?.name || "")).localeCompare(b.restaurant?.companyName || b.restaurant?.name || "");
          break;
        case "title":
          cmp = (a.title || "").localeCompare(b.title || "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [complaints, filterRestaurant, filterStatus, filterPriority, filterReason, filterDateFrom, filterDateTo, searchQuery, sortBy, sortDir]);

  return (
    <PullToRefreshWrapper
      onRefresh={async () => {
        await queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === "string" && (key.startsWith("/api/complaints") || key.startsWith("/api/conversations"));
          },
        });
      }}
      className="space-y-3 md:space-y-4 pb-[var(--mobile-bottom-pad)] md:pb-0"
    >
      <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 md: space-y-3" data-testid="complaints-hero">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">{t("common", "complaints")}</h1>
          <p className="text-sm text-white/50 mt-1">{lang === "de" ? "Verwalten Sie eingehende Reklamationen" : "Gestisci i reclami ricevuti"}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-3 pt-1">
          <div className="rounded-xl bg-white/[0.05] border border-white/10 p-3" data-testid="kpi-open">
            <div className="text-[10px] uppercase tracking-wider text-white/50 font-medium">{lang === "de" ? "Offen" : "Aperti"}</div>
            <div className="text-2xl font-bold text-white mt-0.5">{complaintKpis.open}</div>
          </div>
          <div className="rounded-xl bg-white/[0.05] border border-white/10 p-3" data-testid="kpi-avg-time">
            <div className="text-[10px] uppercase tracking-wider text-white/50 font-medium">{lang === "de" ? "Ø Bearbeitung" : "Tempo medio"}</div>
            <div className="text-2xl font-bold text-white mt-0.5">{complaintKpis.avgHours > 0 ? `${complaintKpis.avgHours}h` : "—"}</div>
          </div>
          <div className="rounded-xl bg-white/[0.05] border border-white/10 p-3" data-testid="kpi-top-reason">
            <div className="text-[10px] uppercase tracking-wider text-white/50 font-medium">{lang === "de" ? "Top-Grund" : "Motivo top"}</div>
            <div className="text-sm font-bold text-white mt-1 truncate">{complaintKpis.topReason ? getComplaintReasonLabel(complaintKpis.topReason, lang) : "—"}</div>
          </div>
        </div>
      </div></HeroPortal>

      {/* Toolbar (Suchen · Sortieren · Filter) — page-content area, right-aligned */}
      <div className="flex items-center gap-2 flex-wrap justify-start">
        {/* Active filter chips (right of toolbar) */}
        <div className="flex items-center gap-2 flex-wrap ml-auto order-last">
          {filterStatus !== "all" && (
            <button onClick={() => setFilterStatus("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-complaint-status">
              <span>{statusFilterLabel(filterStatus)}</span><X className="h-3 w-3" />
            </button>
          )}
          {filterPriority !== "all" && (
            <button onClick={() => setFilterPriority("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-complaint-priority">
              <span>{priorityLabel(filterPriority)}</span><X className="h-3 w-3" />
            </button>
          )}
          {filterRestaurant !== "all" && (
            <button onClick={() => setFilterRestaurant("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-complaint-restaurant">
              <span>{uniqueRestaurants.find(r => r.id === filterRestaurant)?.name || "—"}</span><X className="h-3 w-3" />
            </button>
          )}
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-complaint-search">
              <span>"{searchQuery}"</span><X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-card border border-border p-1 shadow-sm">
          {/* Suchen */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${searchQuery ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title={lang === "de" ? "Suchen" : "Cerca"}
                data-testid="button-toolbar-complaint-search"
              >
                <Search className="h-4 w-4" />
                {searchQuery && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <div className="space-y-2">
                <Label className="text-xs">{lang === "de" ? "Suchen in Reklamationen" : "Cerca nei reclami"}</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder={lang === "de" ? "Titel, Restaurant, Bestellung…" : "Titolo, ristorante, ordine…"}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-8 text-sm"
                    data-testid="input-toolbar-complaint-search"
                  />
                </div>
                {searchQuery && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => setSearchQuery("")}>
                    <X className="h-3 w-3 mr-1" />{lang === "de" ? "Suche zurücksetzen" : "Cancella ricerca"}
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Sortieren */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${sortBy !== "createdAt" || sortDir !== "desc" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title={lang === "de" ? "Sortieren" : "Ordina"}
                data-testid="button-toolbar-complaint-sort"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {lang === "de" ? "Sortieren nach" : "Ordina per"}
              </div>
              {([
                { key: "createdAt", label: lang === "de" ? "Erstellt" : "Creato" },
                { key: "status", label: "Status" },
                { key: "restaurant", label: lang === "de" ? "Restaurant" : "Ristorante" },
                { key: "title", label: lang === "de" ? "Titel" : "Titolo" },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm ${sortBy === opt.key ? "bg-muted font-medium" : "hover:bg-muted"}`}
                  data-testid={`sort-by-complaint-${opt.key}`}
                >
                  <span>{opt.label}</span>
                  {sortBy === opt.key && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
              <Separator className="my-1.5" />
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setSortDir("asc")}
                  className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs ${sortDir === "asc" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"}`}
                  data-testid="sort-dir-complaint-asc"
                >
                  <ArrowUp className="h-3 w-3" />{lang === "de" ? "Aufsteigend" : "Crescente"}
                </button>
                <button
                  onClick={() => setSortDir("desc")}
                  className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs ${sortDir === "desc" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"}`}
                  data-testid="sort-dir-complaint-desc"
                >
                  <ArrowDown className="h-3 w-3" />{lang === "de" ? "Absteigend" : "Decrescente"}
                </button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${hasActiveFilters ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title="Filter"
                data-testid="button-toolbar-complaint-filter"
              >
                <FilterIcon className="h-4 w-4" />
                {hasActiveFilters && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-3">
              <div className="space-y-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">Status</Label>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { key: "all", label: t("common", "all"), dot: "bg-gray-400" },
                      { key: "active", label: lang === "de" ? "Aktiv" : "Attivo", dot: "bg-primary" },
                      { key: "open", label: getComplaintStatus("open", lang), dot: "bg-yellow-500" },
                      { key: "in_progress", label: getComplaintStatus("in_progress", lang), dot: "bg-blue-500" },
                      { key: "resolved", label: getComplaintStatus("resolved", lang), dot: "bg-green-500" },
                      { key: "partially_resolved", label: getComplaintStatus("partially_resolved", lang), dot: "bg-amber-500" },
                      { key: "rejected", label: getComplaintStatus("rejected", lang), dot: "bg-red-500" },
                      { key: "closed", label: getComplaintStatus("closed", lang), dot: "bg-gray-500" },
                    ] as const).map(({ key, label, dot }) => (
                      <button
                        key={key}
                        onClick={() => setFilterStatus(key)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all ${filterStatus === key ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-card hover:bg-muted text-muted-foreground"}`}
                        data-testid={`filter-complaint-status-${key}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{lang === "de" ? "Grund" : "Motivo"}</Label>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      onClick={() => setFilterReason("all")}
                      className={`flex items-center justify-center px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all ${filterReason === "all" ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-card hover:bg-muted text-muted-foreground"}`}
                      data-testid="filter-complaint-reason-all"
                    >
                      {t("common", "all")}
                    </button>
                    {COMPLAINT_REASONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setFilterReason(r)}
                        className={`flex items-center justify-center px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all ${filterReason === r ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-card hover:bg-muted text-muted-foreground"}`}
                        data-testid={`filter-complaint-reason-${r}`}
                      >
                        {getComplaintReasonLabel(r, lang)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{lang === "de" ? "Priorität" : "Priorità"}</Label>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { key: "all", label: t("common", "all"), dot: "bg-gray-400" },
                      { key: "urgent", label: priorityLabel("urgent"), dot: "bg-red-500" },
                      { key: "normal", label: priorityLabel("normal"), dot: "bg-blue-400" },
                    ] as const).map(({ key, label, dot }) => (
                      <button
                        key={key}
                        onClick={() => setFilterPriority(key)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all ${filterPriority === key ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-card hover:bg-muted text-muted-foreground"}`}
                        data-testid={`filter-complaint-priority-${key}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {uniqueRestaurants.length > 0 && (
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{lang === "de" ? "Restaurant" : "Ristorante"}</Label>
                    <select
                      value={filterRestaurant}
                      onChange={(e) => setFilterRestaurant(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      data-testid="filter-complaint-restaurant-select"
                    >
                      <option value="all">{lang === "de" ? "Alle Restaurants" : "Tutti i ristoranti"}</option>
                      {uniqueRestaurants.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.complaintCount})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{t("common", "from")}</Label>
                    <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-9 text-xs" data-testid="filter-complaint-date-from" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{t("common", "to")}</Label>
                    <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-9 text-xs" data-testid="filter-complaint-date-to" />
                  </div>
                </div>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={clearFilters} data-testid="button-clear-complaint-filters">
                    <X className="h-3 w-3 mr-1" />{t("common", "reset")}
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card shadow-sm overflow-hidden" data-testid="complaints-table">
          {isLoading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-3"><Skeleton className="h-10 w-full rounded-md" /></div>
              ))}
            </div>
          ) : filteredComplaints.length > 0 ? (
            <div className="divide-y divide-border">
              <div className="hidden md:grid grid-cols-[minmax(0,2fr)_120px_minmax(0,1fr)_100px_120px_72px] items-center gap-3 px-3 py-2 bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                <div>{lang === "de" ? "Reklamation" : "Reclamo"}</div>
                <div>Status</div>
                <div>{lang === "de" ? "Händler" : "Commerciante"}</div>
                <div>{lang === "de" ? "Bestellung" : "Ordine"}</div>
                <div>{lang === "de" ? "Erstellt" : "Creato"}</div>
                <div></div>
              </div>
              {filteredComplaints.map((complaint) => {
                const statusInfo = formatComplaintStatusInfo(complaint.status);
                const StatusIcon = statusInfo.icon;

                return (
                  <div
                    key={complaint.id}
                    className={`group/row cursor-pointer transition-colors ${(complaint as any).priority === "urgent" ? "bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50/70 dark:hover:bg-red-950/20" : "hover:bg-muted/40"}`}
                    onClick={() => navTo(`/supplier/complaints/${complaint.id}`)}
                    data-testid={`complaint-${complaint.id}`}
                  >
                    {/* Desktop row */}
                    <div className="hidden md:grid grid-cols-[minmax(0,2fr)_120px_minmax(0,1fr)_100px_120px_72px] items-center gap-3 px-3 py-2.5 relative">
                      <div className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full ${(complaint as any).priority === "urgent" ? "bg-red-500" : getComplaintAccent(complaint.status)}`} />
                      <div className="min-w-0 pl-1.5">
                        <div className="flex items-center gap-1.5">
                          {(complaint as any).priority === "urgent" && <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          <span className={`font-medium text-sm truncate ${(complaint as any).priority === "urgent" ? "text-red-700 dark:text-red-400" : ""}`}>{complaint.title}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{complaint.description}</p>
                      </div>
                      <div>
                        <Badge variant={statusInfo.variant} className="text-[10px] px-2 py-0 h-5 rounded-full">
                          <StatusIcon className="h-2.5 w-2.5 mr-1" />
                          {statusInfo.label}
                        </Badge>
                      </div>
                      <div className="min-w-0 flex items-center gap-2">
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={complaint.restaurant?.profileImageUrl || undefined} alt={complaint.restaurant?.name} />
                          <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-semibold">
                            {complaint.restaurant?.companyName?.substring(0, 2).toUpperCase() || "??"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{complaint.restaurant?.companyName || t("common", "unknown")}</span>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground truncate">#{complaint.order ? formatOrderNumber(complaint.order) : formatOrderNumber({orderNumber: null, id: complaint.orderId})}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatShortDate(complaint.createdAt)}
                        {complaint.status === "open" && daysOpen(complaint.createdAt) >= 1 && (
                          <span className={`ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${daysOpen(complaint.createdAt) >= 3 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`} data-testid={`age-badge-${complaint.id}`}>
                            <Hourglass className="h-2.5 w-2.5" />
                            {daysOpen(complaint.createdAt)}d
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-0.5">
                        {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground mr-1">
                            <FileImage className="h-3 w-3" />{complaint.mediaUrls.length}
                          </span>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 group-hover/row:opacity-100" onClick={(e) => { e.stopPropagation(); openStatusWizard(complaint); }} data-testid={`button-change-status-${complaint.id}`}>
                          <Settings className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 group-hover/row:opacity-100" onClick={(e) => { e.stopPropagation(); openCommentWizard(complaint); }} data-testid={`button-add-comment-${complaint.id}`}>
                          <MessageSquare className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Mobile row */}
                    <div className="md:hidden flex items-stretch gap-3 p-3.5 min-h-[72px] relative">
                      <div className={`w-1 self-stretch rounded-full shrink-0 ${(complaint as any).priority === "urgent" ? "bg-red-500" : getComplaintAccent(complaint.status)}`} />
                      <Avatar className="h-10 w-10 shrink-0 self-center">
                        <AvatarImage src={complaint.restaurant?.profileImageUrl || undefined} alt={complaint.restaurant?.name} />
                        <AvatarFallback className="bg-primary/10 text-primary text-[11px]">
                          {complaint.restaurant?.companyName?.substring(0, 2).toUpperCase() || "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                        <div className="flex items-center gap-1.5">
                          {(complaint as any).priority === "urgent" && <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          <span className={`font-semibold text-[15px] line-clamp-1 ${(complaint as any).priority === "urgent" ? "text-red-700 dark:text-red-400" : "text-foreground"}`}>{complaint.title}</span>
                        </div>
                        <p className="text-[13px] text-muted-foreground line-clamp-1 mt-1">{complaint.description}</p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[12px] text-muted-foreground">
                          <Badge variant={statusInfo.variant} className="text-[11px] px-2 py-0 h-5 shrink-0">
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                          <span className="truncate max-w-[120px]">{complaint.restaurant?.companyName || t("common", "unknown")}</span>
                          <span>·</span>
                          <span className="font-mono font-semibold">#{complaint.order ? formatOrderNumber(complaint.order) : formatOrderNumber({orderNumber: null, id: complaint.orderId})}</span>
                          <span>·</span>
                          <span>{formatShortDate(complaint.createdAt)}</span>
                          {complaint.status === "open" && daysOpen(complaint.createdAt) >= 1 && (
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[11px] font-semibold ${daysOpen(complaint.createdAt) >= 3 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`} data-testid={`age-badge-mobile-${complaint.id}`}>
                              <Hourglass className="h-2.5 w-2.5" />
                              {daysOpen(complaint.createdAt)}d
                            </span>
                          )}
                          {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
                            <span className="flex items-center gap-0.5"><FileImage className="h-3 w-3" />{complaint.mediaUrls.length}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={(e) => { e.stopPropagation(); openStatusWizard(complaint); }} data-testid={`button-change-status-mobile-${complaint.id}`}>
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-9 w-9" onClick={(e) => { e.stopPropagation(); openCommentWizard(complaint); }} data-testid={`button-add-comment-mobile-${complaint.id}`}>
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>
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
                    <span className="shrink-0">#{selectedComplaint.order ? formatOrderNumber(selectedComplaint.order) : formatOrderNumber({orderNumber: null, id: selectedComplaint.orderId})}</span>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full rounded-lg"
                onClick={() => setFollowUpItems(prev => prev.map(it => ({ ...it, quantity: Math.max(1, Math.ceil(it.quantity * 1.1)) })))}
                data-testid="button-followup-compensate-10"
              >
                {lang === "de" ? "+10% Kompensation hinzufügen" : "+10% compensazione"}
              </Button>
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
    </PullToRefreshWrapper>
  );
}
