import { useState, useEffect, useMemo } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useSearch, useLocation } from "wouter";
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
import { AlertCircle, CircleAlert, Send, Package, ImagePlus, X, FileVideo, FileImage, Pencil, Clock, CheckCircle, XCircle, Loader2, Store, Filter as FilterIcon, MessageSquare, Calendar, ShoppingBag, CalendarDays, SlidersHorizontal, ChevronUp, ChevronDown, RefreshCw, Flame, Search, ArrowUpDown, ArrowUp, ArrowDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogFooter,
 DialogDescription,
} from "@/components/ui/dialog";
import { formatOrderNumber, type User, type Order, type ComplaintWithDetails, type ComplaintCommentWithUser } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus, getComplaintStatus } from "@/lib/translations";


export default function Complaints() {
 const { currentUser } = useUser();
 const [, navigate] = useLocation();
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
 const [priorityImmediate, setPriorityImmediate] = useState(false);
 const [affectedItems, setAffectedItems] = useState<{ productId: string; productName: string; quantity: number; unitPrice: string }[]>([]);
 const [showCreateDialog, setShowCreateDialog] = useState(false);
 
 const [filterComplaintSupplier, setFilterComplaintSupplier] = useState<string>(initialSupplierId || "all");
 const [filterComplaintStatus, setFilterComplaintStatus] = useState<string>("all");
 const [filterComplaintPriority, setFilterComplaintPriority] = useState<"all" | "urgent" | "normal">("all");
 const [filterComplaintDateFrom, setFilterComplaintDateFrom] = useState<string>("");
 const [filterComplaintDateTo, setFilterComplaintDateTo] = useState<string>("");
 const [searchQuery, setSearchQuery] = useState<string>("");
 const [sortBy, setSortBy] = useState<"createdAt" | "status" | "supplier" | "title">("createdAt");
 const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
 
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

 const { data: selectedOrderDetails } = useQuery<any>({
 queryKey: ['/api/orders', selectedOrderId],
 queryFn: async () => {
 const res = await fetch(`/api/orders/${selectedOrderId}`);
 return res.json();
 },
 enabled: !!selectedOrderId,
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
 if (complaint) navigate(`/restaurant/complaints/${complaint.id}`);
 }
 }, [highlightComplaintId, existingComplaints]);

 const createComplaintMutation = useMutation({
 mutationFn: async (data: { orderId: string; restaurantId: string; supplierId: string; title: string; description: string; mediaUrls: string[]; priorityImmediate?: boolean; affectedItems?: { productId: string; productName: string; quantity: number; unitPrice: string }[] }) => {
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
 setPriorityImmediate(false);
 setAffectedItems([]);
 setShowCreateDialog(false);
 };

 const toggleAffectedItem = (item: { productId: string; productName: string; quantity: number; unitPrice: string }) => {
 setAffectedItems(prev => {
 const existing = prev.find(i => i.productId === item.productId);
 if (existing) {
 return prev.filter(i => i.productId !== item.productId);
 }
 return [...prev, item];
 });
 };

 const handleSubmit = () => {
 if (!selectedOrderId || !selectedSupplierId || !title.trim() || !description.trim()) {
 toast({ title: t("common", "error"), description: t("complaints", "fillAllFields"), variant: "destructive" });
 return;
 }

 const hasAffected = affectedItems.length > 0;
 createComplaintMutation.mutate({
 orderId: selectedOrderId,
 restaurantId: currentUser!.id,
 supplierId: selectedSupplierId,
 title: (priorityImmediate || hasAffected) ? `[PRIORITY IMMEDIATE] ${title.trim()}` : title.trim(),
 description: description.trim(),
 mediaUrls,
 priorityImmediate: priorityImmediate || hasAffected,
 affectedItems: hasAffected ? affectedItems : undefined,
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
 const search = searchQuery.trim().toLowerCase();
 const filtered = existingComplaints.filter(c => {
 if (filterComplaintSupplier !== "all" && c.supplier?.id !== filterComplaintSupplier) return false;
 if (filterComplaintStatus !== "all") {
 if (filterComplaintStatus === "active") {
 if (c.status !== "open" && c.status !== "in_progress") return false;
 } else if (c.status !== filterComplaintStatus) return false;
 }
 if (filterComplaintPriority !== "all") {
 const isUrgent = (c as any).priority === "urgent";
 if (filterComplaintPriority === "urgent" && !isUrgent) return false;
 if (filterComplaintPriority === "normal" && isUrgent) return false;
 }
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
 if (search) {
 const haystack = [
 c.title,
 c.description,
 c.supplier?.name,
 c.id,
 (c as any).orderId,
 ].filter(Boolean).join(" ").toLowerCase();
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
 case "supplier":
 cmp = (a.supplier?.name || "").localeCompare(b.supplier?.name || "");
 break;
 case "title":
 cmp = (a.title || "").localeCompare(b.title || "");
 break;
 }
 return sortDir === "asc" ? cmp : -cmp;
 });

 return sorted;
 }, [existingComplaints, filterComplaintSupplier, filterComplaintStatus, filterComplaintPriority, filterComplaintDateFrom, filterComplaintDateTo, searchQuery, sortBy, sortDir]);

 const hasActiveFilters = filterComplaintStatus !== "all" || filterComplaintSupplier !== "all" || filterComplaintPriority !== "all" || !!filterComplaintDateFrom || !!filterComplaintDateTo;
 const activeFilterCount = (filterComplaintStatus !== "all" ? 1 : 0) + (filterComplaintSupplier !== "all" ? 1 : 0) + (filterComplaintPriority !== "all" ? 1 : 0) + (filterComplaintDateFrom ? 1 : 0) + (filterComplaintDateTo ? 1 : 0);
 const priorityLabel = (k: string) => k === "urgent" ? (lang === "de" ? "Dringend" : "Urgente") : k === "normal" ? (lang === "de" ? "Normal" : "Normale") : t("common", "all");
 const statusFilterLabel = (k: string) => k === "active" ? (lang === "de" ? "Aktiv" : "Attivo") : getComplaintStatus(k as any, lang);

 const clearFilters = () => {
 setFilterComplaintSupplier("all");
 setFilterComplaintStatus("all");
 setFilterComplaintPriority("all");
 setFilterComplaintDateFrom("");
 setFilterComplaintDateTo("");
 setSearchQuery("");
 };

 const canSubmit = selectedOrderId && selectedSupplierId && title.trim() && description.trim();

 return (
 <PullToRefreshWrapper
 onRefresh={async () => {
 await queryClient.invalidateQueries({
 predicate: (query) => {
 const key = query.queryKey[0];
 return typeof key === "string" && (key.startsWith("/api/complaints") || key.startsWith("/api/suppliers-with-orders") || key.startsWith("/api/orders-by-supplier") || key.startsWith("/api/orders"));
 },
 });
 }}
 className="space-y-3 md:space-y-4 pb-[var(--mobile-bottom-pad)] md:pb-0"
 >
 <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-3" data-testid="complaints-hero">
 <div className="flex items-start justify-between gap-3">
 <div>
 <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">{t("common", "complaints")}</h1>
 <p className="text-sm text-white/50 mt-1">{lang === "de" ? "Verwalten Sie Ihre Reklamationen" : "Gestisci i tuoi reclami"}</p>
 </div>
 <Button size="sm" onClick={() => setShowCreateDialog(true)} className="rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15" data-testid="button-new-complaint">
 <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
 {t("complaints", "newComplaint")}
 </Button>
 </div>
 </div></HeroPortal>

 {/* Toolbar (Suchen · Sortieren · Filter) — page-content area, right-aligned */}
 <div className="flex items-center gap-2 flex-wrap justify-start">
 {/* Active filter chips (right of toolbar) */}
 <div className="flex items-center gap-2 flex-wrap ml-auto order-last">
 {filterComplaintStatus !== "all" && (
 <button onClick={() => setFilterComplaintStatus("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-complaint-status">
 <span>{statusFilterLabel(filterComplaintStatus)}</span><X className="h-3 w-3" />
 </button>
 )}
 {filterComplaintPriority !== "all" && (
 <button onClick={() => setFilterComplaintPriority("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-complaint-priority">
 <span>{priorityLabel(filterComplaintPriority)}</span><X className="h-3 w-3" />
 </button>
 )}
 {filterComplaintSupplier !== "all" && (
 <button onClick={() => setFilterComplaintSupplier("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-complaint-supplier">
 <span>{uniqueSuppliers.find(s => s.id === filterComplaintSupplier)?.name || "—"}</span><X className="h-3 w-3" />
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
 placeholder={lang === "de" ? "Titel, Lieferant, Bestellung…" : "Titolo, fornitore, ordine…"}
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
 { key: "supplier", label: lang === "de" ? "Lieferant" : "Fornitore" },
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
 { key: "closed", label: getComplaintStatus("closed", lang), dot: "bg-gray-500" },
 ] as const).map(({ key, label, dot }) => (
 <button
 key={key}
 onClick={() => setFilterComplaintStatus(key)}
 className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all ${filterComplaintStatus === key ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-card hover:bg-muted text-muted-foreground"}`}
 data-testid={`filter-complaint-status-${key}`}
 >
 <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
 <span className="truncate">{label}</span>
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
 onClick={() => setFilterComplaintPriority(key)}
 className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all ${filterComplaintPriority === key ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-card hover:bg-muted text-muted-foreground"}`}
 data-testid={`filter-complaint-priority-${key}`}
 >
 <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
 <span className="truncate">{label}</span>
 </button>
 ))}
 </div>
 </div>
 {uniqueSuppliers.length > 0 && (
 <div>
 <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{lang === "de" ? "Lieferant" : "Fornitore"}</Label>
 <select
 value={filterComplaintSupplier}
 onChange={(e) => setFilterComplaintSupplier(e.target.value)}
 className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
 data-testid="filter-complaint-supplier-select"
 >
 <option value="all">{lang === "de" ? "Alle Lieferanten" : "Tutti i fornitori"}</option>
 {uniqueSuppliers.map((s) => (
 <option key={s.id} value={s.id}>{s.name} ({s.complaintCount})</option>
 ))}
 </select>
 </div>
 )}
 <div className="grid grid-cols-2 gap-2">
 <div>
 <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{t("common", "from")}</Label>
 <Input type="date" value={filterComplaintDateFrom} onChange={(e) => setFilterComplaintDateFrom(e.target.value)} className="h-9 text-xs" data-testid="filter-complaint-date-from" />
 </div>
 <div>
 <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{t("common", "to")}</Label>
 <Input type="date" value={filterComplaintDateTo} onChange={(e) => setFilterComplaintDateTo(e.target.value)} className="h-9 text-xs" data-testid="filter-complaint-date-to" />
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
 {loadingComplaints ? (
 <div className="divide-y divide-border">
 {[1, 2, 3].map((i) => (
 <div key={i} className="p-3"><Skeleton className="h-10 w-full rounded-md" /></div>
 ))}
 </div>
 ) : filteredComplaints.length > 0 ? (
 <div className="divide-y divide-border">
 <div className="hidden md:grid grid-cols-[minmax(0,2fr)_120px_minmax(0,1fr)_100px_120px_60px] items-center gap-3 px-3 py-2 bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
 <div>{lang === "de" ? "Reklamation" : "Reclamo"}</div>
 <div>Status</div>
 <div>{lang === "de" ? "Lieferant" : "Fornitore"}</div>
 <div>{lang === "de" ? "Bestellung" : "Ordine"}</div>
 <div>{lang === "de" ? "Erstellt" : "Creato"}</div>
 <div></div>
 </div>
 {filteredComplaints.map((complaint) => {
 const statusInfo = formatComplaintStatus(complaint.status);
 const StatusIcon = statusInfo.icon;
 const canEdit = complaint.status === "open";
 
 return (
 <div
 key={complaint.id}
 className={`group/row cursor-pointer transition-colors ${(complaint as any).priority === "urgent" ? "bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50/70 dark:hover:bg-red-950/20" : "hover:bg-muted/40"}`}
 onClick={() => navigate(`/restaurant/complaints/${complaint.id}`)}
 data-testid={`complaint-${complaint.id}`}
 >
 {/* Desktop row — grid matching header */}
 <div className="hidden md:grid grid-cols-[minmax(0,2fr)_120px_minmax(0,1fr)_100px_120px_60px] items-center gap-3 px-3 py-2.5 relative">
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
 <AvatarImage src={complaint.supplier?.profileImageUrl || undefined} />
 <AvatarFallback className="text-[9px] font-semibold">{(complaint.supplier?.companyName || complaint.supplier?.name || "??").substring(0, 2).toUpperCase()}</AvatarFallback>
 </Avatar>
 <span className="text-sm truncate">{complaint.supplier?.companyName || complaint.supplier?.name || t("orders", "unknownSupplier")}</span>
 </div>
 <div className="text-xs font-mono text-muted-foreground truncate" data-testid={`text-complaint-order-${complaint.id}`}>#{complaint.order ? formatOrderNumber(complaint.order) : formatOrderNumber({orderNumber: null, id: complaint.orderId})}</div>
 <div className="text-xs text-muted-foreground truncate">{formatDate(complaint.createdAt)}</div>
 <div className="flex items-center justify-end gap-0.5">
 {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
 <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground mr-1">
 <FileImage className="h-3 w-3" />{complaint.mediaUrls.length}
 </span>
 )}
 {canEdit && (
 <>
 <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 group-hover/row:opacity-100" onClick={(e) => { e.stopPropagation(); openEditDialog(complaint); }} data-testid={`button-edit-complaint-${complaint.id}`}>
 <Pencil className="h-3 w-3" />
 </Button>
 <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 group-hover/row:opacity-100" onClick={(e) => { e.stopPropagation(); setWithdrawComplaintId(complaint.id); }} data-testid={`button-withdraw-complaint-${complaint.id}`}>
 <XCircle className="h-3 w-3 text-destructive" />
 </Button>
 </>
 )}
 </div>
 </div>

 {/* Mobile row — stacked card */}
 <div className="md:hidden flex items-center gap-2.5 p-2.5 relative">
 <div className={`w-1 self-stretch rounded-full shrink-0 ${(complaint as any).priority === "urgent" ? "bg-red-500" : getComplaintAccent(complaint.status)}`} />
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1.5">
 {(complaint as any).priority === "urgent" && <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />}
 <span className={`font-medium text-sm line-clamp-1 ${(complaint as any).priority === "urgent" ? "text-red-700 dark:text-red-400" : ""}`}>{complaint.title}</span>
 </div>
 <div className="flex items-center gap-1.5 mt-1 flex-wrap">
 <Badge variant={statusInfo.variant} className="text-[9px] px-1.5 py-0 h-4 shrink-0">
 <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
 {statusInfo.label}
 </Badge>
 </div>
 <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{complaint.description}</p>
 <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
 <span className="font-mono font-semibold">#{complaint.order ? formatOrderNumber(complaint.order) : formatOrderNumber({orderNumber: null, id: complaint.orderId})}</span>
 <span>·</span>
 <span>{complaint.supplier?.companyName || t("orders", "unknownSupplier")}</span>
 <span>·</span>
 <span>{formatDate(complaint.createdAt)}</span>
 {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
 <>
 <span>·</span>
 <span className="flex items-center gap-0.5"><FileImage className="h-2.5 w-2.5" />{complaint.mediaUrls.length}</span>
 </>
 )}
 </div>
 </div>
 {canEdit && (
 <div className="flex items-center gap-0.5 shrink-0">
 <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditDialog(complaint); }} data-testid={`button-edit-complaint-mobile-${complaint.id}`}>
 <Pencil className="h-3 w-3" />
 </Button>
 <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setWithdrawComplaintId(complaint.id); }} data-testid={`button-withdraw-complaint-mobile-${complaint.id}`}>
 <XCircle className="h-3 w-3 text-destructive" />
 </Button>
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 ) : (
 <div className="text-center py-8 text-muted-foreground">
 <AlertCircle className="mx-auto h-10 w-10 mb-2 opacity-50" />
 <p className="text-sm">{t("complaints", "noComplaints")}</p>
 </div>
 )}
 </div>

 <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) resetForm(); }}>
 <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-create-complaint">
 <DialogHeader className="sr-only">
 <DialogTitle>{t("complaints", "newComplaint")}</DialogTitle>
 </DialogHeader>
 <div className="px-5 pt-5 pb-2">
 <div className="flex items-center gap-2">
 <AlertCircle className="h-4 w-4" />
 <h3 className="text-sm font-semibold">{t("complaints", "newComplaint")}</h3>
 </div>
 <p className="text-xs text-muted-foreground mt-0.5 pl-6">{t("complaints", "writeComplaint")}</p>
 </div>
 <div className="space-y-3 md:space-y-4 px-5 pb-5">
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
 onValueChange={(val) => { setSelectedOrderId(val); setAffectedItems([]); }}
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

 {selectedOrderId && selectedOrderDetails?.items && selectedOrderDetails.items.length > 0 && (
 <div className="space-y-2">
 <Label>{lang === "de" ? "Betroffene Produkte" : "Prodotti interessati"}</Label>
 <p className="text-xs text-muted-foreground">
 {lang === "de" ? "Wählen Sie die Produkte aus, die betroffen sind" : "Seleziona i prodotti interessati"}
 </p>
 <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border p-2">
 {selectedOrderDetails.items.map((item: any) => {
 const pid = item.productId || item.id;
 const isSelected = affectedItems.some(a => a.productId === pid);
 return (
 <label
 key={item.id}
 className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${isSelected ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" : "hover:bg-muted/50"}`}
 data-testid={`affected-item-${pid}`}
 >
 <input
 type="checkbox"
 checked={isSelected}
 onChange={() => toggleAffectedItem({
 productId: pid,
 productName: item.productName,
 quantity: item.quantity,
 unitPrice: item.unitPrice,
 })}
 className="h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
 />
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <span className="text-sm font-medium truncate">{item.productName}</span>
 <span className="text-xs text-muted-foreground shrink-0">{item.quantity}x {parseFloat(item.unitPrice).toFixed(2)} €</span>
 </div>
 </div>
 </label>
 );
 })}
 </div>
 {affectedItems.length > 0 && (
 <div className="flex items-center gap-2 p-2 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
 <RefreshCw className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
 <span className="text-xs text-orange-700 dark:text-orange-300">
 {lang === "de"
 ? `Nachlieferung für ${affectedItems.length} Produkt(e) wird angefragt`
 : `Riconsegna per ${affectedItems.length} prodotto/i verra richiesta`}
 </span>
 </div>
 )}
 </div>
 )}

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

 <label
 htmlFor="dialog-complaint-priority-immediate"
 className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
 priorityImmediate
 ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30"
 : "border-border bg-muted/30 hover:bg-muted/50"
 }`}
 >
 <input
 type="checkbox"
 id="dialog-complaint-priority-immediate"
 checked={priorityImmediate}
 onChange={(e) => setPriorityImmediate(e.target.checked)}
 className="sr-only"
 data-testid="checkbox-priority-immediate"
 />
 <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
 priorityImmediate ? "bg-red-500" : "bg-muted"
 }`}>
 <Flame className={`h-4 w-4 ${priorityImmediate ? "text-white" : "text-muted-foreground"}`} />
 </div>
 <div className="flex-1 min-w-0">
 <span className={`text-sm font-medium ${priorityImmediate ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
 {lang === "de" ? "Dringend" : "Urgente"}
 </span>
 <p className="text-xs text-muted-foreground mt-0.5">
 {lang === "de" ? "Lieferant wird sofort benachrichtigt" : "Il fornitore verra avvisato subito"}
 </p>
 </div>
 </label>
 </div>

 <div className="flex gap-2">
 <Button
 variant="outline"
 className="flex-1 rounded-lg"
 onClick={() => resetForm()}
 data-testid="button-cancel-create-complaint"
 >
 {t("common", "cancel")}
 </Button>
 <Button
 className="flex-1 rounded-lg"
 onClick={handleSubmit}
 disabled={!canSubmit || createComplaintMutation.isPending}
 data-testid="button-submit-complaint"
 >
 <Send className="mr-2 h-4 w-4" />
 {createComplaintMutation.isPending ? t("complaints", "sending") : t("complaints", "submitComplaint")}
 </Button>
 </div>
 </DialogContent>
 </Dialog>

 <Dialog open={!!detailComplaint} onOpenChange={(open) => { if (!open) { setDetailComplaint(null); setNewComment(""); setShowComplaintMessageInput(false); setComplaintMessage(""); } }}>
 <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-complaint-detail">
 <DialogHeader className="sr-only">
 <DialogTitle>{t("common", "complaints")}</DialogTitle>
 </DialogHeader>
 {detailComplaint && (
 <div className="flex flex-col flex-1 min-h-0 px-5 pt-5 pb-5 space-y-4">
 <div className="space-y-3 shrink-0">
 {(detailComplaint as any).priority === "urgent" && (
 <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
 <Flame className="h-4 w-4 text-red-500 shrink-0" />
 <span className="text-xs font-semibold text-red-600 dark:text-red-400">
 {lang === "de" ? "Dringende Reklamation" : "Reclamo urgente"}
 </span>
 </div>
 )}
 <div className="flex items-center justify-between gap-2">
 <h3 className="font-medium text-sm md:text-base min-w-0 truncate">{detailComplaint.title}</h3>
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

 {detailComplaint.affectedItems && (() => {
 try {
 const items = JSON.parse(detailComplaint.affectedItems);
 if (Array.isArray(items) && items.length > 0) {
 return (
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
 <span className="text-muted-foreground">{ai.quantity}x {parseFloat(ai.unitPrice).toFixed(2)} €</span>
 </div>
 ))}
 </div>
 </div>
 );
 }
 return null;
 } catch { return null; }
 })()}

 <div className="space-y-1.5 text-sm">
 <div className="flex justify-between gap-3">
 <span className="text-muted-foreground shrink-0">{t("common", "supplier")}</span>
 <span className="font-medium text-right truncate">{detailComplaint.supplier?.companyName || t("common", "unknown")}</span>
 </div>
 <div className="flex justify-between gap-3">
 <span className="text-muted-foreground shrink-0">{t("orders", "order")}</span>
 <span className="shrink-0">#{detailComplaint.order ? formatOrderNumber(detailComplaint.order) : formatOrderNumber({orderNumber: null, id: detailComplaint.orderId})}</span>
 </div>
 <div className="flex justify-between gap-3">
 <span className="text-muted-foreground shrink-0">{t("orders", "createdAt")}</span>
 <span className="shrink-0">{formatDate(detailComplaint.createdAt)}</span>
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

 <div className="flex-1 overflow-auto min-h-0">
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

 <div className="shrink-0 space-y-2">
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
 {lang === "de" ? "Reklamation" : "Reclamo"}: {detailComplaint.title}
 </span>
 </div>
 <div className="flex gap-2">
 <Textarea
 value={complaintMessage}
 onChange={(e) => setComplaintMessage(e.target.value)}
 placeholder={lang === "de" ? "Nachricht an Händler..." : "Messaggio al commerciante..."}
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
 <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] sm:max-h-[85vh] p-0 flex flex-col gap-0">
 <DialogHeader className="sr-only">
 <DialogTitle>{t("complaints", "editComplaint")}</DialogTitle>
 </DialogHeader>

 <div className="px-5 pt-5 pb-3 border-b shrink-0">
 <h3 className="text-base font-semibold">{t("complaints", "editComplaint")}</h3>
 </div>
 <div className="space-y-4 px-5 py-5 overflow-y-auto flex-1 min-h-0">
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

 <div className="flex gap-2 px-5 py-4 border-t shrink-0 bg-background">
 <Button
 variant="outline"
 className="flex-1 rounded-lg"
 onClick={() => setEditingComplaint(null)}
 data-testid="button-cancel-edit-complaint"
 >
 {t("common", "cancel")}
 </Button>
 <Button
 className="flex-1 rounded-lg"
 onClick={handleEditSubmit}
 disabled={!editTitle.trim() || !editDescription.trim() || updateComplaintMutation.isPending}
 data-testid="button-save-edit-complaint"
 >
 {updateComplaintMutation.isPending ? t("complaints", "saving") : t("common", "save")}
 </Button>
 </div>
 </DialogContent>
 </Dialog>

 <Dialog open={!!withdrawComplaintId} onOpenChange={(open) => !open && setWithdrawComplaintId(null)}>
 <DialogContent className="max-w-sm">
 <DialogHeader className="sr-only">
 <DialogTitle>{t("complaints", "withdrawComplaint")}</DialogTitle>
 </DialogHeader>
 <div className="px-5 pt-5 pb-5 space-y-4">
 <h3 className="text-sm font-semibold">{t("complaints", "withdrawComplaint")}</h3>
 <p className="text-sm text-muted-foreground">
 {t("complaints", "withdrawConfirm")}
 </p>
 <div className="flex gap-2">
 <Button
 variant="outline"
 className="flex-1 rounded-lg"
 onClick={() => setWithdrawComplaintId(null)}
 data-testid="button-cancel-withdraw"
 >
 {t("common", "cancel")}
 </Button>
 <Button
 variant="destructive"
 className="flex-1 rounded-lg"
 onClick={() => withdrawComplaintId && withdrawComplaintMutation.mutate(withdrawComplaintId)}
 disabled={withdrawComplaintMutation.isPending}
 data-testid="button-confirm-withdraw"
 >
 {withdrawComplaintMutation.isPending ? t("complaints", "closing") : t("complaints", "withdraw")}
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>
 </PullToRefreshWrapper>
 );
}
