import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useSearch } from "wouter";
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
import { AlertCircle, Send, Package, ImagePlus, X, FileVideo, FileImage, Pencil, Clock, CheckCircle, XCircle, Loader2, Store, Filter, MessageSquare, Calendar, ShoppingBag, CalendarDays, SlidersHorizontal, ChevronUp, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import type { User, Order, ComplaintWithDetails, ComplaintCommentWithUser } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus, getComplaintStatus } from "@/lib/translations";


export default function Complaints() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const highlightComplaintId = searchParams.get("complaintId");
  const initialSupplierId = searchParams.get("supplierId");

  const [detailComplaint, setDetailComplaint] = useState<ComplaintWithDetails | null>(null);
  const [newComment, setNewComment] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  const [filterComplaintSupplier, setFilterComplaintSupplier] = useState<string>(initialSupplierId || "all");
  const [filterComplaintStatus, setFilterComplaintStatus] = useState<string>("all");
  const [filterComplaintDateFrom, setFilterComplaintDateFrom] = useState<string>("");
  const [filterComplaintDateTo, setFilterComplaintDateTo] = useState<string>("");
  const [showSecondaryFilters, setShowSecondaryFilters] = useState(false);
  
  // Edit state
  const [editingComplaint, setEditingComplaint] = useState<ComplaintWithDetails | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMediaUrls, setEditMediaUrls] = useState<string[]>([]);
  const [showComplaintMessageInput, setShowComplaintMessageInput] = useState(false);
  const [complaintMessage, setComplaintMessage] = useState("");

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

  const { data: complaintComments, isLoading: loadingComments } = useQuery<ComplaintCommentWithUser[]>({
    queryKey: [`/api/complaints/${detailComplaint?.id}/comments`],
    enabled: !!detailComplaint?.id,
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ complaintId, content }: { complaintId: string; content: string }) => {
      return apiRequest("POST", `/api/complaints/${complaintId}/comments`, {
        userId: currentUser?.id,
        content,
      });
    },
    onSuccess: () => {
      toast({ title: t("complaints", "commentAdded"), description: t("complaints", "commentAddedDesc") });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints/${detailComplaint?.id}/comments`] });
      setNewComment("");
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("complaints", "commentError"), variant: "destructive" });
    },
  });

  const sendComplaintMessageMutation = useMutation({
    mutationFn: async ({ complaint, message }: { complaint: ComplaintWithDetails; message: string }) => {
      const supplierName = complaint.supplier?.companyName || complaint.supplier?.name || "";
      const refLabel = `${lang === "de" ? "Reklamation" : "Reclamo"}: ${complaint.title} - ${supplierName}`;
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
    if (highlightComplaintId && existingComplaints) {
      const complaint = existingComplaints.find(c => c.id === highlightComplaintId);
      if (complaint) setDetailComplaint(complaint);
    }
  }, [highlightComplaintId, existingComplaints]);

  const createComplaintMutation = useMutation({
    mutationFn: async (data: { orderId: string; restaurantId: string; supplierId: string; title: string; description: string; mediaUrls: string[] }) => {
      return apiRequest("POST", "/api/complaints", data);
    },
    onSuccess: () => {
      toast({ title: t("complaints", "complaintSent"), description: t("complaints", "complaintSentDesc") });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      resetForm();
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("complaints", "complaintSendError"), variant: "destructive" });
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
      toast({ title: t("complaints", "complaintUpdated"), description: t("complaints", "complaintUpdatedDesc") });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      setEditingComplaint(null);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("complaints", "complaintUpdateError"), variant: "destructive" });
    },
  });

  const [withdrawComplaintId, setWithdrawComplaintId] = useState<string | null>(null);

  const withdrawComplaintMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, { status: "closed" });
    },
    onSuccess: () => {
      toast({ title: t("complaints", "complaintWithdrawn"), description: t("complaints", "complaintWithdrawnDesc") });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      setWithdrawComplaintId(null);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("complaints", "withdrawError"), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedSupplierId("");
    setSelectedOrderId("");
    setTitle("");
    setDescription("");
    setMediaUrls([]);
    setShowCreateDialog(false);
  };

  const handleSubmit = () => {
    if (!selectedOrderId || !selectedSupplierId || !title.trim() || !description.trim()) {
      toast({ title: t("common", "error"), description: t("complaints", "fillAllFields"), variant: "destructive" });
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
      if (response?.objectPath) {
        setMediaUrls(prev => [...prev, response.objectPath]);
      } else if (response?.uploadURL) {
        const url = new URL(response.uploadURL);
        const objectPath = url.pathname;
        setMediaUrls(prev => [...prev, objectPath]);
      }
    }
    toast({ title: t("complaints", "uploadSuccess"), description: `${uploadedFiles.length} ${t("complaints", "filesUploaded")}` });
  };

  const removeMedia = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
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

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString(lang === "it" ? "it-IT" : "de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatOrderStatus = (status: string) => getOrderStatus(status, lang);

  const formatComplaintStatus = (status: string) => {
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

  const openEditDialog = (complaint: ComplaintWithDetails) => {
    setEditingComplaint(complaint);
    setEditTitle(complaint.title);
    setEditDescription(complaint.description);
    setEditMediaUrls(complaint.mediaUrls || []);
  };

  const handleEditSubmit = () => {
    if (!editingComplaint || !editTitle.trim() || !editDescription.trim()) {
      toast({ title: t("common", "error"), description: t("complaints", "fillAllFields"), variant: "destructive" });
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
      if (response?.objectPath) {
        setEditMediaUrls(prev => [...prev, response.objectPath]);
      } else if (response?.uploadURL) {
        const url = new URL(response.uploadURL);
        const objectPath = url.pathname;
        setEditMediaUrls(prev => [...prev, objectPath]);
      }
    }
    toast({ title: t("complaints", "uploadSuccess"), description: `${uploadedFiles.length} ${t("complaints", "filesUploaded")}` });
  };

  const uniqueSuppliers = useMemo(() => {
    if (!existingComplaints) return [];
    const map = new Map<string, { id: string; name: string; profileImageUrl: string | null; complaintCount: number }>();
    existingComplaints.forEach(c => {
      if (c.supplier?.id) {
        const existing = map.get(c.supplier.id);
        if (existing) {
          existing.complaintCount++;
        } else {
          map.set(c.supplier.id, {
            id: c.supplier.id,
            name: c.supplier.companyName || c.supplier.name || "",
            profileImageUrl: c.supplier.profileImageUrl,
            complaintCount: 1,
          });
        }
      }
    });
    return Array.from(map.values());
  }, [existingComplaints]);

  const statusCounts = useMemo(() => {
    if (!existingComplaints) return { all: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    const counts = { all: existingComplaints.length, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    existingComplaints.forEach(c => {
      if (c.status in counts) (counts as any)[c.status]++;
    });
    return counts;
  }, [existingComplaints]);

  const filteredComplaints = useMemo(() => {
    if (!existingComplaints) return [];
    return existingComplaints.filter(c => {
      if (filterComplaintSupplier !== "all" && c.supplier?.id !== filterComplaintSupplier) return false;
      if (filterComplaintStatus !== "all" && c.status !== filterComplaintStatus) return false;
      if (filterComplaintDateFrom) {
        const from = new Date(filterComplaintDateFrom);
        from.setHours(0, 0, 0, 0);
        if (new Date(c.createdAt) < from) return false;
      }
      if (filterComplaintDateTo) {
        const to = new Date(filterComplaintDateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(c.createdAt) > to) return false;
      }
      return true;
    });
  }, [existingComplaints, filterComplaintSupplier, filterComplaintStatus, filterComplaintDateFrom, filterComplaintDateTo]);

  const hasActiveFilters = filterComplaintSupplier !== "all" || filterComplaintDateFrom || filterComplaintDateTo;
  const hasSecondaryFilters = filterComplaintDateFrom || filterComplaintDateTo;

  const clearFilters = () => {
    setFilterComplaintSupplier("all");
    setFilterComplaintStatus("all");
    setFilterComplaintDateFrom("");
    setFilterComplaintDateTo("");
  };

  const canSubmit = selectedOrderId && selectedSupplierId && title.trim() && description.trim();

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 md:gap-3">
          <AlertCircle className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">{t("common", "complaints")}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">{t("complaints", "writeComplaint")}</p>
          </div>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-new-complaint">
          <AlertCircle className="h-4 w-4 mr-2" />
          {t("complaints", "newComplaint")}
        </Button>
      </div>

      {uniqueSuppliers.length > 0 && (
        <div className="flex gap-2 md:gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <button
            onClick={() => setFilterComplaintSupplier("all")}
            className={`flex flex-col items-center gap-1.5 p-2.5 md:p-3 rounded-md border-2 transition-all shrink-0 min-w-[72px] md:min-w-[88px] ${
              filterComplaintSupplier === "all"
                ? "border-primary bg-primary/10 dark:bg-primary/20"
                : "border-transparent bg-muted/50 dark:bg-muted/30"
            }`}
            data-testid="filter-complaint-supplier-all"
          >
            <div className={`flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-full ${
              filterComplaintSupplier === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}>
              <Store className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <span className={`text-[10px] md:text-xs font-medium leading-tight text-center line-clamp-1 ${
              filterComplaintSupplier === "all" ? "text-primary" : "text-muted-foreground"
            }`}>
              {t("common", "all")}
            </span>
            <span className={`text-xs md:text-sm font-bold leading-none ${
              filterComplaintSupplier === "all" ? "text-primary" : "text-foreground"
            }`}>
              {existingComplaints?.length || 0}
            </span>
          </button>
          {uniqueSuppliers.map(supplier => {
            const isActive = filterComplaintSupplier === supplier.id;
            return (
              <button
                key={supplier.id}
                onClick={() => setFilterComplaintSupplier(supplier.id)}
                className={`flex flex-col items-center gap-1.5 p-2.5 md:p-3 rounded-md border-2 transition-all shrink-0 min-w-[72px] md:min-w-[88px] ${
                  isActive
                    ? "border-primary bg-primary/10 dark:bg-primary/20"
                    : "border-transparent bg-muted/50 dark:bg-muted/30"
                }`}
                data-testid={`filter-complaint-supplier-${supplier.id}`}
              >
                <Avatar className={`h-10 w-10 md:h-12 md:w-12 ${isActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                  <AvatarImage src={supplier.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm md:text-base font-semibold">
                    {supplier.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className={`text-[10px] md:text-xs font-medium leading-tight text-center line-clamp-1 max-w-[64px] md:max-w-[80px] ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}>
                  {supplier.name}
                </span>
                <span className={`text-xs md:text-sm font-bold leading-none ${
                  isActive ? "text-primary" : "text-foreground"
                }`}>
                  {supplier.complaintCount}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
        {([
          { key: "all", icon: AlertCircle, color: "bg-muted/80 dark:bg-muted/40", activeColor: "bg-primary text-primary-foreground", borderColor: "border-primary" },
          { key: "open", icon: Clock, color: "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400", activeColor: "bg-yellow-500 text-white dark:bg-yellow-600", borderColor: "border-yellow-400 dark:border-yellow-500" },
          { key: "in_progress", icon: Loader2, color: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400", activeColor: "bg-blue-500 text-white dark:bg-blue-600", borderColor: "border-blue-400 dark:border-blue-500" },
          { key: "resolved", icon: CheckCircle, color: "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-400", activeColor: "bg-green-500 text-white dark:bg-green-600", borderColor: "border-green-400 dark:border-green-500" },
          { key: "closed", icon: XCircle, color: "bg-muted/60 text-muted-foreground", activeColor: "bg-muted-foreground text-background", borderColor: "border-muted-foreground" },
        ] as const).map(({ key, icon: Icon, color, activeColor, borderColor }) => {
          const isActive = filterComplaintStatus === key;
          const count = (statusCounts as any)[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setFilterComplaintStatus(key)}
              className={`relative flex flex-col items-center gap-1 p-2.5 md:p-3 rounded-md border-2 transition-all ${
                isActive
                  ? `${activeColor} ${borderColor} shadow-sm`
                  : `${color} border-transparent`
              }`}
              data-testid={`filter-complaint-status-${key}`}
            >
              <Icon className="h-4 w-4 md:h-5 md:w-5" />
              <span className="text-[10px] md:text-xs font-medium leading-tight text-center">
                {key === "all" ? t("common", "all") : getComplaintStatus(key, lang)}
              </span>
              <span className={`text-sm md:text-base font-bold leading-none ${isActive ? "" : "text-foreground"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowSecondaryFilters(!showSecondaryFilters)}
          className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground hover-elevate rounded-md px-2 py-1.5"
          data-testid="button-toggle-complaint-filters"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{lang === "de" ? "Filter" : "Filtri"}</span>
          {hasSecondaryFilters && (
            <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
              {(filterComplaintDateFrom ? 1 : 0) + (filterComplaintDateTo ? 1 : 0)}
            </span>
          )}
          {showSecondaryFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover-elevate rounded-md px-2 py-1.5 flex items-center gap-1"
            data-testid="button-clear-complaint-filters"
          >
            <X className="h-3 w-3" />
            {t("common", "reset")}
          </button>
        )}
      </div>

      {showSecondaryFilters && (
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <label className="text-[10px] md:text-xs text-muted-foreground mb-1 block">{t("common", "from")}</label>
                <Input type="date" value={filterComplaintDateFrom} onChange={e => setFilterComplaintDateFrom(e.target.value)} className="h-9 text-xs md:text-sm" data-testid="filter-complaint-date-from" />
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-[10px] md:text-xs text-muted-foreground mb-1 block">{t("common", "to")}</label>
                <Input type="date" value={filterComplaintDateTo} onChange={e => setFilterComplaintDateTo(e.target.value)} className="h-9 text-xs md:text-sm" data-testid="filter-complaint-date-to" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 md:space-y-3">
            {loadingComplaints ? (
              <div className="space-y-2 md:space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 md:h-20 w-full" />
                ))}
              </div>
            ) : filteredComplaints.length > 0 ? (
              <div className="space-y-2 md:space-y-3">
                {filteredComplaints.map((complaint) => {
                  const statusInfo = formatComplaintStatus(complaint.status);
                  const StatusIcon = statusInfo.icon;
                  const canEdit = complaint.status === "open";
                  
                  return (
                    <Card
                      key={complaint.id}
                      className={`overflow-hidden rounded-md cursor-pointer hover-elevate ${getComplaintCardBg(complaint.status)}`}
                      onClick={() => setDetailComplaint(complaint)}
                      data-testid={`complaint-${complaint.id}`}
                    >
                      <CardContent className="p-3 md:p-4 space-y-1.5 md:space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm md:text-base">{complaint.title}</div>
                          <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 mt-0.5">{complaint.description}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant={statusInfo.variant} className="text-[10px] md:text-xs shrink-0">
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                          {canEdit && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); openEditDialog(complaint); }}
                                data-testid={`button-edit-complaint-${complaint.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); setWithdrawComplaintId(complaint.id); }}
                                data-testid={`button-withdraw-complaint-${complaint.id}`}
                              >
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-2 rounded-md bg-muted/40 border border-border/50 text-xs md:text-sm flex-wrap">
                        <span className="flex items-center gap-1 font-mono font-semibold text-foreground" data-testid={`text-complaint-order-${complaint.id}`}>
                          <ShoppingBag className="h-3 w-3 text-muted-foreground" />
                          #{complaint.orderId.substring(0, 8)}
                        </span>
                        {complaint.order && (
                          <>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <CalendarDays className="h-3 w-3" />
                              {formatDate(complaint.order.createdAt)}
                            </span>
                            <span className="text-muted-foreground">
                              {parseFloat(complaint.order.totalAmount).toFixed(2)}€
                            </span>
                          </>
                        )}
                      </div>
                      
                      {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
                        <div className="flex gap-1.5 mt-1">
                          {complaint.mediaUrls.slice(0, 4).map((url, idx) => (
                            <div key={idx} className="h-12 w-12 rounded overflow-hidden border">
                              {isVideoFile(url) ? (
                                <div className="h-full w-full flex items-center justify-center bg-muted">
                                  <FileVideo className="h-4 w-4 text-muted-foreground" />
                                </div>
                              ) : (
                                <img 
                                  src={getMediaSrc(url)} 
                                  alt={`${t("complaints", "attachment")} ${idx + 1}`}
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
                        <span>{complaint.supplier?.companyName || t("orders", "unknownSupplier")}</span>
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
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 md:py-8 text-muted-foreground">
                <AlertCircle className="mx-auto h-10 w-10 md:h-12 md:w-12 mb-2 md:mb-3 opacity-50" />
                <p className="text-sm md:text-base">{t("complaints", "noComplaints")}</p>
              </div>
            )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-create-complaint">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              {t("complaints", "newComplaint")}
            </DialogTitle>
            <DialogDescription>
              {t("complaints", "writeComplaint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 md:space-y-4">
            <div className="space-y-2">
              <Label>{t("complaints", "selectSupplier")}</Label>
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
                    <SelectValue placeholder={t("complaints", "selectSupplierPlaceholder")} />
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
                      <div className="p-2 text-sm text-muted-foreground">{t("complaints", "noSuppliersWithOrders")}</div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t("complaints", "selectOrder")}</Label>
              {!selectedSupplierId ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  {t("complaints", "selectSupplierFirst")}
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
                    <SelectValue placeholder={t("complaints", "selectOrderPlaceholder")} />
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
                      <div className="p-2 text-sm text-muted-foreground">{t("complaints", "noOrdersForSupplier")}</div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">{t("complaints", "subject")}</Label>
              <Input
                id="title"
                placeholder={t("complaints", "subjectPlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!selectedOrderId}
                data-testid="input-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("common", "description")}</Label>
              <Textarea
                id="description"
                placeholder={t("complaints", "descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={!selectedOrderId}
                data-testid="textarea-description"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("complaints", "attachMedia")}</Label>
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
                        src={getMediaSrc(url)} 
                        alt={`${t("complaints", "attachment")} ${index + 1}`}
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
                    <span className="text-[10px]">{t("common", "add")}</span>
                  </ObjectUploader>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("complaints", "maxFilesInfo")}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => resetForm()}
              data-testid="button-cancel-create-complaint"
            >
              {t("common", "cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || createComplaintMutation.isPending}
              data-testid="button-submit-complaint"
            >
              <Send className="mr-2 h-4 w-4" />
              {createComplaintMutation.isPending ? t("complaints", "sending") : t("complaints", "submitComplaint")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailComplaint} onOpenChange={(open) => { if (!open) { setDetailComplaint(null); setNewComment(""); setShowComplaintMessageInput(false); setComplaintMessage(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-complaint-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              {t("common", "complaints")}
            </DialogTitle>
            <DialogDescription>
              {t("complaints", "complaintDetail")}
            </DialogDescription>
          </DialogHeader>
          {detailComplaint && (
            <div className="flex flex-col flex-1 min-h-0 space-y-4">
              <div className="space-y-3 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-sm md:text-base">{detailComplaint.title}</h3>
                  {(() => {
                    const si = formatComplaintStatus(detailComplaint.status);
                    const SI = si.icon;
                    return (
                      <Badge variant={si.variant} className="text-xs shrink-0">
                        <SI className="h-3 w-3 mr-1" />
                        {si.label}
                      </Badge>
                    );
                  })()}
                </div>

                <p className="text-sm text-muted-foreground">{detailComplaint.description}</p>

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("common", "supplier")}</span>
                    <span className="font-medium">{detailComplaint.supplier?.companyName || t("common", "unknown")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("orders", "order")}</span>
                    <span>#{detailComplaint.orderId.substring(0, 8)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("orders", "createdAt")}</span>
                    <span>{formatDate(detailComplaint.createdAt)}</span>
                  </div>
                </div>

                {detailComplaint.mediaUrls && detailComplaint.mediaUrls.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1.5">{t("complaints", "attachments")}</p>
                    <div className="flex flex-wrap gap-2">
                      {detailComplaint.mediaUrls.map((url, idx) => (
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
                            <img src={getMediaSrc(url)} alt={`${t("complaints", "attachment")} ${idx + 1}`} className="h-full w-full object-cover" />
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3 flex-1 overflow-auto min-h-0">
                <p className="text-sm font-medium mb-2">{t("complaints", "comments")}</p>
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
                      <p className="text-sm">{t("complaints", "noComments")}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border pt-3 shrink-0 space-y-2">
                <div className="flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={t("complaints", "commentPlaceholder")}
                    rows={2}
                    className="flex-1"
                    data-testid="input-detail-comment"
                  />
                  <Button
                    size="icon"
                    onClick={() => detailComplaint && addCommentMutation.mutate({ complaintId: detailComplaint.id, content: newComment.trim() })}
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
                        {lang === "de" ? "Reklamation" : "Reclamo"}: {detailComplaint.title}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Textarea
                        value={complaintMessage}
                        onChange={(e) => setComplaintMessage(e.target.value)}
                        placeholder={lang === "de" ? "Nachricht an Lieferant..." : "Messaggio al fornitore..."}
                        rows={2}
                        className="flex-1"
                        data-testid="input-complaint-message"
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon"
                          onClick={() => detailComplaint && sendComplaintMessageMutation.mutate({ complaint: detailComplaint, message: complaintMessage.trim() })}
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

      {/* Edit Complaint Dialog */}
      <Dialog open={!!editingComplaint} onOpenChange={(open) => !open && setEditingComplaint(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("complaints", "editComplaint")}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("complaints", "subject")}</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t("complaints", "subjectPlaceholder")}
                data-testid="input-edit-complaint-title"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("common", "description")}</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder={t("complaints", "descriptionPlaceholder")}
                rows={4}
                data-testid="input-edit-complaint-description"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("complaints", "photosVideos")}</Label>
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
                        src={getMediaSrc(url)} 
                        alt={`${t("complaints", "attachment")} ${index + 1}`}
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
                    <span className="text-[9px]">{t("common", "add")}</span>
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
              {t("common", "cancel")}
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={!editTitle.trim() || !editDescription.trim() || updateComplaintMutation.isPending}
              data-testid="button-save-edit-complaint"
            >
              {updateComplaintMutation.isPending ? t("complaints", "saving") : t("common", "save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!withdrawComplaintId} onOpenChange={(open) => !open && setWithdrawComplaintId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("complaints", "withdrawComplaint")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("complaints", "withdrawConfirm")}
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setWithdrawComplaintId(null)}
              data-testid="button-cancel-withdraw"
            >
              {t("common", "cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => withdrawComplaintId && withdrawComplaintMutation.mutate(withdrawComplaintId)}
              disabled={withdrawComplaintMutation.isPending}
              data-testid="button-confirm-withdraw"
            >
              {withdrawComplaintMutation.isPending ? t("complaints", "closing") : t("complaints", "withdraw")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
