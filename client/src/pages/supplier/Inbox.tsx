import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useChat } from "@/context/ChatContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ProductImage } from "@/components/ProductImage";

import { Send, MessageSquare, Search, Check, CheckCheck, ClipboardList, Eye, AlertCircle, AlertTriangle, ArrowLeft, Settings, Clock, Loader2, CheckCircle, XCircle, FileVideo, FileImage, Package, FileText, Download, Paperclip, Pencil, Truck, ShoppingBag, Tag, Calendar, CalendarDays, Phone, RotateCcw, X, Reply, User as UserIcon, ChevronDown, ChevronUp, CircleAlert, Plus, RefreshCw, Flame, Ban, Mic, Pin, PinOff } from "lucide-react";
import { QuickReplyChips } from "@/components/chat/QuickReplyChips";
import { VoiceRecorder } from "@/components/chat/VoiceRecorder";
import { VoiceMessage } from "@/components/chat/VoiceMessage";
import { useUpload } from "@/hooks/use-upload";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AttachmentPopover, AttachmentMessageCard } from "@/components/ChatAttachment";
import { DeliveryNoteCard } from "@/components/DeliveryNoteCard";
import OnlineStatus from "@/components/OnlineStatus";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { StatusTimeline } from "@/components/StatusTimeline";
import DeliveryDatePicker from "@/components/DeliveryDatePicker";
import { PartialConfirmationDialog } from "@/components/PartialConfirmationDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { formatOrderNumber, formatComplaintNumber, type ConversationWithUser, type Message, type MessageWithOrderNumber, type Order, type ComplaintWithDetails, type ComplaintCommentWithUser, type OrderStatusHistoryWithUser, type ComplaintStatusHistoryWithUser } from "@shared/schema";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { de, it } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SwipeableRow from "@/components/SwipeableRow";
import StaggeredList from "@/components/StaggeredList";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { HeroPortal } from "@/context/HeroContext";

interface OrderContent {
  items: { name: string; quantity: number; price: string; imageUrl?: string | null }[];
  total: string;
}

interface AffectedItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
}

import { getComplaintReasonLabel } from "@/lib/complaintReasons";
interface ComplaintContent {
  title: string;
  description: string;
  orderId: string;
  complaintId?: string;
  affectedItems?: AffectedItem[];
}

interface OrderWithDetails extends Order {
  items: { id: string; productName: string; quantity: number; unitPrice: string; totalPrice: string }[];
  restaurant?: { companyName: string; profileImageUrl?: string | null };
  supplier?: { companyName: string; profileImageUrl?: string | null };
}

const parseOrderContent = (content: string): OrderContent | null => {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
};

const parseComplaintContent = (content: string): ComplaintContent | null => {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "confirmed": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "partially_confirmed": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "in_delivery": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
};

const getStatusCardBg = (_status: string) => {
  return { card: "bg-white dark:bg-card border-border", header: "bg-muted/30 border-border", icon: "text-foreground" };
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "pending": return "Neu";
    case "confirmed": return "Bestätigt";
    case "partially_confirmed": return "Teilbestätigt";
    case "in_delivery": return "In Lieferung";
    case "delivered": return "Geliefert";
    case "cancelled": return "Storniert";
    default: return status;
  }
};

const isOrderInactive = (status: string) => status === "delivered" || status === "cancelled";
const isComplaintInactive = (status: string) => status === "resolved" || status === "closed";

const getComplaintStatusLabel = (status: string) => {
  switch (status) {
    case "open": return "Offen";
    case "in_progress": return "In Bearbeitung";
    case "resolved": return "Gelöst";
    case "closed": return "Geschlossen";
    case "rejected": return "Abgelehnt";
    case "partially_resolved": return "Teilweise gelöst";
    default: return status;
  }
};

const getComplaintStatusColor = (status: string) => {
  switch (status) {
    case "open": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "in_progress": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "resolved": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "closed": return "bg-muted text-muted-foreground";
    case "rejected": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "partially_resolved": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    default: return "bg-muted text-muted-foreground";
  }
};

const formatDateDivider = (date: Date) => {
  if (isToday(date)) return "Heute";
  if (isYesterday(date)) return "Gestern";
  return format(date, "dd. MMMM yyyy", { locale: de });
};

export default function SupplierInbox() {
  const { currentUser } = useUser();
  const { setIsInChat } = useChat();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateFnsLocale = lang === "it" ? it : de;
  useHeartbeat(currentUser?.id);
  const [, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const { containerRef: pullRefreshRef, pullDistance, isRefreshing, progress: pullProgress } = usePullToRefresh({
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    },
  });
  const [orderDetailId, setOrderDetailId] = useState<string | null>(null);
  const [showCancelOrderConfirm, setShowCancelOrderConfirm] = useState(false);
  const [cardWizard, setCardWizard] = useState<{ orderId: string; action: string } | null>(null);
  const [deliveryDatePicker, setDeliveryDatePicker] = useState<{ orderId: string; restaurantId: string } | null>(null);
  const [confirmOrderForDialog, setConfirmOrderForDialog] = useState<any | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<{ id: string; senderName: string; preview: string } | null>(null);
  const [attachedOrderRef, setAttachedOrderRef] = useState<{ id: string; label: string } | null>(null);
  const [attachedComplaintRef, setAttachedComplaintRef] = useState<{ id: string; label: string } | null>(null);
  const [pendingRestaurantRedirect, setPendingRestaurantRedirect] = useState<string | null>(null);
  const [messagePriority, setMessagePriority] = useState<"standard" | "important">("standard");
  const [priorityPopoverOpen, setPriorityPopoverOpen] = useState(false);

  // Complaint management state
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [showComplaintDetail, setShowComplaintDetail] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [newComment, setNewComment] = useState("");
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpItems, setFollowUpItems] = useState<{ productId: string; productName: string; quantity: number; unitPrice: string }[]>([]);
  const [followUpDeliveryDate, setFollowUpDeliveryDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [rejectComplaintId, setRejectComplaintId] = useState<string | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState("");
  const searchString = useSearch();

  const quickStatusUpdateMutation = useMutation({
    mutationFn: async ({ id, status, rejectionReason }: { id: string; status: string; rejectionReason?: string }) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, {
        status,
        changedBy: currentUser?.id,
        actorRole: "supplier",
        ...(rejectionReason ? { rejectionReason } : {}),
      });
    },
    onSuccess: () => {
      toast({ title: lang === "de" ? "Status aktualisiert" : "Stato aggiornato" });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
        queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      }
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", description: lang === "de" ? "Status konnte nicht aktualisiert werden." : "Stato non aggiornabile.", variant: "destructive" });
    },
  });

  const computeNextDeliveryDate = (schedules: any[]): string => {
    const days = (schedules || []).map((s: any) => s.dayOfWeek).filter((d: any) => typeof d === "number");
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 1);
    if (days.length === 0) return fallback.toISOString().split("T")[0];
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (days.includes(d.getDay())) return d.toISOString().split("T")[0];
    }
    return fallback.toISOString().split("T")[0];
  };

  const startFollowUpFromCard = async (complaintId: string) => {
    try {
      const res = await fetch(`/api/complaints/${complaintId}`);
      if (!res.ok) throw new Error("fetch failed");
      const c: any = await res.json();
      let items: AffectedItem[] = [];
      if (c?.affectedItems) {
        try {
          const parsed = typeof c.affectedItems === "string" ? JSON.parse(c.affectedItems) : c.affectedItems;
          if (Array.isArray(parsed)) items = parsed;
        } catch {}
      }
      if (items.length === 0) {
        toast({ title: lang === "de" ? "Keine betroffenen Produkte" : "Nessun prodotto interessato", description: lang === "de" ? "Bitte Details öffnen." : "Apri i dettagli.", variant: "destructive" });
        return;
      }
      let schedules: any[] = [];
      if (c?.supplierId && c?.restaurantId) {
        try {
          const sRes = await fetch(`/api/delivery-schedules/restaurant?supplierId=${c.supplierId}&restaurantId=${c.restaurantId}`);
          if (sRes.ok) schedules = await sRes.json();
        } catch {}
      }
      setSelectedComplaintId(complaintId);
      setFollowUpItems(items.map(ai => ({ productId: ai.productId, productName: ai.productName, quantity: ai.quantity, unitPrice: ai.unitPrice })));
      setFollowUpDeliveryDate(computeNextDeliveryDate(schedules));
      setFollowUpNotes(`Nachlieferung zu Reklamation #${formatComplaintNumber(c)}`);
      setShowFollowUpDialog(true);
    } catch {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    }
  };

  useEffect(() => {
    setIsInChat(selectedConversation !== null);
    return () => setIsInChat(false);
  }, [selectedConversation, setIsInChat]);

  useEffect(() => {
    if (selectedConversation) {
      const timer = setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedConversation]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const toRestaurantId = params.get("to");
    if (toRestaurantId && currentUser?.id) {
      setPendingRestaurantRedirect(toRestaurantId);
    }
    const conversationIdParam = params.get("conversationId") || params.get("chat");
    if (conversationIdParam) {
      setSelectedConversation(conversationIdParam);
      if (currentUser?.id) {
        apiRequest("POST", `/api/conversations/${conversationIdParam}/read`, { userId: currentUser.id }).then(() => {
          queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser.id}`] });
          queryClient.invalidateQueries({ queryKey: [`/api/conversations/unread?userId=${currentUser.id}`] });
        }).catch(() => {});
        apiRequest("PATCH", `/api/notifications/read-by-reference?userId=${currentUser.id}&referenceId=${conversationIdParam}&type=new_message`).then(() => {
          queryClient.invalidateQueries({ queryKey: [`/api/notifications?userId=${currentUser.id}`] });
          queryClient.invalidateQueries({ queryKey: [`/api/notifications/count?userId=${currentUser.id}`] });
        }).catch(() => {});
      }
    }
    const complaintIdParam = params.get("complaintId");
    if (complaintIdParam) {
      setSelectedComplaintId(complaintIdParam);
      setShowComplaintDetail(true);
    }
    const orderRefIdParam = params.get("orderRefId");
    if (orderRefIdParam) {
      const orderNumberParam = params.get("orderNumber");
      const display = orderNumberParam || formatOrderNumber({ orderNumber: null, id: orderRefIdParam });
      const label = `${lang === "de" ? "Bestellung" : "Ordine"} #${display}`;
      setAttachedOrderRef({ id: orderRefIdParam, label });
    }
    const complaintRefIdParam = params.get("complaintRefId");
    if (complaintRefIdParam) {
      const complaintNumberParam = params.get("complaintNumber");
      const display = complaintNumberParam || formatComplaintNumber({ complaintNumber: null, id: complaintRefIdParam });
      const label = `${lang === "de" ? "Reklamation" : "Reclamo"} #${display}`;
      setAttachedComplaintRef({ id: complaintRefIdParam, label });
    }
  }, [searchString, currentUser?.id, lang]);

  const { data: orderDetail, refetch: refetchOrderDetail } = useQuery<OrderWithDetails>({
    queryKey: ["/api/orders", orderDetailId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderDetailId}`);
      return res.json();
    },
    enabled: !!orderDetailId,
  });

  const { data: orderStatusHistory } = useQuery<OrderStatusHistoryWithUser[]>({
    queryKey: ["/api/orders", orderDetailId, "status-history"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderDetailId}/status-history`);
      return res.json();
    },
    enabled: !!orderDetailId,
  });

  const { data: complaintStatusHistoryData } = useQuery<ComplaintStatusHistoryWithUser[]>({
    queryKey: ["/api/complaints", selectedComplaintId, "status-history"],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${selectedComplaintId}/status-history`);
      return res.json();
    },
    enabled: !!selectedComplaintId && showComplaintDetail,
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, requestedDeliveryDate, deliveryNotes }: { orderId: string; status: string; requestedDeliveryDate?: string; deliveryNotes?: string }) => {
      return await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status, changedBy: currentUser?.id, requestedDeliveryDate: requestedDeliveryDate || undefined, deliveryNotes: deliveryNotes || undefined });
    },
    onSuccess: (_, variables) => {
      toast({ title: "Status aktualisiert", description: "Der Bestellstatus wurde erfolgreich geändert." });
      setCardWizard(null);
      setOrderDetailId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/stats"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes?.("/api/supplier/detailed-stats") });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent'] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", variables.orderId, "status-history"] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
      setTimeout(scrollToBottom, 300);
    },
    onError: (error: any) => {
      setCardWizard(null);
      let title = "Fehler";
      let description = "Status konnte nicht aktualisiert werden.";
      try {
        const msg = error?.message || "";
        const jsonStr = msg.includes(": ") ? msg.substring(msg.indexOf(": ") + 2) : msg;
        const parsed = JSON.parse(jsonStr);
        if (parsed.error === "insufficient_stock" && parsed.details) {
          title = "Nicht genug Lagerbestand";
          description = parsed.details.join("; ");
        }
      } catch {}
      toast({ title, description, variant: "destructive" });
    },
  });

  const changeRequestRespondMutation = useMutation({
    mutationFn: async ({ orderId, approved }: { orderId: string; approved: boolean }) => {
      return await apiRequest("POST", `/api/orders/${orderId}/change-request/respond`, { supplierId: currentUser?.id, approved });
    },
    onSuccess: (_, variables) => {
      toast({ title: variables.approved ? "Änderung genehmigt" : "Änderung abgelehnt", description: variables.approved ? "Die Bestellung ist wieder offen zur Bearbeitung." : "Die Änderungsanfrage wurde abgelehnt." });
      setOrderDetailId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/stats"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes?.("/api/supplier/detailed-stats") });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation, "messages"] });
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
      setTimeout(scrollToBottom, 300);
    },
    onError: () => {
      toast({ title: "Fehler", description: "Die Antwort konnte nicht gesendet werden.", variant: "destructive" });
    },
  });

  // Complaint queries and mutations
  const { data: complaintDetail, isLoading: isLoadingComplaintDetail, isError: isComplaintDetailError } = useQuery<ComplaintWithDetails>({
    queryKey: ["/api/complaints", selectedComplaintId],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${selectedComplaintId}`);
      if (!res.ok) throw new Error("Failed to load complaint");
      return res.json();
    },
    enabled: !!selectedComplaintId,
  });

  const { data: complaintComments, isLoading: loadingComments } = useQuery<ComplaintCommentWithUser[]>({
    queryKey: ["/api/complaints", selectedComplaintId, "comments"],
    queryFn: async () => {
      if (!selectedComplaintId) return [];
      const res = await fetch(`/api/complaints/${selectedComplaintId}/comments`);
      return res.json();
    },
    enabled: !!selectedComplaintId && (showCommentDialog || showComplaintDetail),
  });

  const updateComplaintStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, { status, changedBy: currentUser?.id, actorRole: "supplier" });
    },
    onSuccess: (_, variables) => {
      toast({ title: "Status aktualisiert", description: "Der Reklamationsstatus wurde erfolgreich geändert." });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId] });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId, "status-history"] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
        queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      }
      setShowStatusDialog(false);
      if (variables.status === "resolved" || variables.status === "closed") {
        setShowComplaintDetail(false);
        setSelectedComplaintId(null);
        setTimeout(scrollToBottom, 300);
      }
    },
    onError: () => {
      toast({ title: "Fehler", description: "Status konnte nicht aktualisiert werden.", variant: "destructive" });
    },
  });

  const addComplaintCommentMutation = useMutation({
    mutationFn: async ({ complaintId, content }: { complaintId: string; content: string }) => {
      return apiRequest("POST", `/api/complaints/${complaintId}/comments`, {
        userId: currentUser?.id,
        content,
      });
    },
    onSuccess: () => {
      toast({ title: "Kommentar hinzugefügt", description: "Ihr Kommentar wurde gespeichert." });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId] });
      setNewComment("");
      setShowCommentDialog(false);
    },
    onError: () => {
      toast({ title: "Fehler", description: "Kommentar konnte nicht gespeichert werden.", variant: "destructive" });
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
      setShowComplaintDetail(false);
      setFollowUpItems([]);
      setFollowUpDeliveryDate("");
      setFollowUpNotes("");
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", description: lang === "de" ? "Nachlieferung konnte nicht erstellt werden." : "Impossibile creare la riconsegna.", variant: "destructive" });
    },
  });

  const openFollowUpDialog = () => {
    if (!complaintDetail?.affectedItems) return;
    try {
      const items = JSON.parse(complaintDetail.affectedItems);
      if (Array.isArray(items) && items.length > 0) {
        setFollowUpItems(items.map((ai: AffectedItem) => ({ ...ai })));
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setFollowUpDeliveryDate(tomorrow.toISOString().split("T")[0]);
        setFollowUpNotes(`Nachlieferung zu Reklamation #${formatComplaintNumber(complaintDetail)}`);
        setShowFollowUpDialog(true);
      }
    } catch {}
  };

  const [openActionsPopover, setOpenActionsPopover] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeliveryNotes, setShowDeliveryNotes] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const prevConvTimestamps = useRef<Record<string, string>>({});
  const [flashingConvIds, setFlashingConvIds] = useState<Set<string>>(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const { data: conversations, isLoading: conversationsLoading } = useQuery<ConversationWithUser[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    staleTime: 2000,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<MessageWithOrderNumber[]>({
    queryKey: [`/api/conversations/${selectedConversation}/messages`],
    enabled: !!selectedConversation,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const createAndSelectConversation = async () => {
      if (pendingRestaurantRedirect && currentUser?.id && conversations) {
        const existingConv = conversations.find(c => c.otherUser.id === pendingRestaurantRedirect);
        if (existingConv) {
          setSelectedConversation(existingConv.id);
          setPendingRestaurantRedirect(null);
          setLocation("/supplier/inbox");
        } else {
          try {
            const response = await apiRequest("POST", "/api/conversations", {
              restaurantId: pendingRestaurantRedirect,
              supplierId: currentUser.id,
            });
            const newConversation = await response.json();
            queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser.id}`] });
            setSelectedConversation(newConversation.id);
            setPendingRestaurantRedirect(null);
            setLocation("/supplier/inbox");
          } catch (error) {
            console.error("Failed to create conversation:", error);
            setPendingRestaurantRedirect(null);
          }
        }
      }
    };
    createAndSelectConversation();
  }, [pendingRestaurantRedirect, currentUser?.id, conversations, setLocation]);

  const { data: conversationDocs } = useQuery<any[]>({
    queryKey: ['/api/conversations', selectedConversation, 'documents', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${selectedConversation}/documents?userId=${currentUser?.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedConversation && !!currentUser?.id,
    staleTime: 10000,
  });

  useEffect(() => {
    if (conversations && conversations.length > 0) {
      const newFlash = new Set<string>();
      const hasExistingData = Object.keys(prevConvTimestamps.current).length > 0;
      conversations.forEach(conv => {
        const prevTs = prevConvTimestamps.current[conv.id];
        if (hasExistingData && conv.lastMessageAt && prevTs && conv.lastMessageAt !== prevTs && conv.id !== selectedConversation) {
          newFlash.add(conv.id);
        }
        prevConvTimestamps.current[conv.id] = conv.lastMessageAt || "";
      });
      if (newFlash.size > 0) {
        setFlashingConvIds(newFlash);
        setTimeout(() => setFlashingConvIds(new Set()), 1500);
      }
    }
  }, [conversations, selectedConversation]);

  const prevMessageCountRef = useRef<number>(0);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const knownReadIdsRef = useRef<Set<string>>(new Set());
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  const [sentMessageIds, setSentMessageIds] = useState<Set<string>>(new Set());
  const [newlyReadIds, setNewlyReadIds] = useState<Set<string>>(new Set());
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const sentTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (messages && messages.length > 0) {
      const currentCount = messages.length;
      if (prevMessageCountRef.current > 0 && currentCount > prevMessageCountRef.current) {
        const incomingIds: string[] = [];
        const ownIds: string[] = [];
        messages.forEach(m => {
          if (!knownMessageIdsRef.current.has(m.id)) {
            if (m.senderId !== currentUser?.id) {
              incomingIds.push(m.id);
            } else {
              ownIds.push(m.id);
            }
          }
        });
        if (incomingIds.length > 0) {
          setNewMessageIds(prev => { const next = new Set(prev); incomingIds.forEach(id => next.add(id)); return next; });
          clearTimeout(incomingTimerRef.current);
          incomingTimerRef.current = setTimeout(() => setNewMessageIds(new Set()), 2000);
          // Auto mark-as-read: chat is open and we just received messages from the other user.
          if (selectedConversation && currentUser?.id && (typeof document === "undefined" || document.visibilityState === "visible")) {
            markAsReadMutation.mutate(selectedConversation);
            apiRequest("PATCH", `/api/notifications/read-by-reference?userId=${currentUser.id}&referenceId=${selectedConversation}&type=new_message`).then(() => {
              queryClient.invalidateQueries({ queryKey: [`/api/notifications?userId=${currentUser.id}`] });
              queryClient.invalidateQueries({ queryKey: [`/api/notifications/count?userId=${currentUser.id}`] });
            }).catch(() => {});
          }
        }
        if (ownIds.length > 0) {
          setSentMessageIds(prev => { const next = new Set(prev); ownIds.forEach(id => next.add(id)); return next; });
          clearTimeout(sentTimerRef.current);
          sentTimerRef.current = setTimeout(() => setSentMessageIds(new Set()), 1500);
        }
      }
      knownMessageIdsRef.current = new Set(messages.map(m => m.id));
      prevMessageCountRef.current = currentCount;
    }

    if (messages) {
      const freshlyRead: string[] = [];
      messages.forEach(m => {
        if (m.senderId === currentUser?.id && m.isRead && !knownReadIdsRef.current.has(m.id)) {
          if (knownReadIdsRef.current.size > 0) {
            freshlyRead.push(m.id);
          }
        }
      });
      knownReadIdsRef.current = new Set(messages.filter(m => m.senderId === currentUser?.id && m.isRead).map(m => m.id));
      if (freshlyRead.length > 0) {
        setNewlyReadIds(prev => { const next = new Set(prev); freshlyRead.forEach(id => next.add(id)); return next; });
        setTimeout(() => setNewlyReadIds(new Set()), 2000);
      }
    }
  }, [messages, currentUser?.id]);

  useEffect(() => {
    prevMessageCountRef.current = 0;
    knownMessageIdsRef.current = new Set();
    knownReadIdsRef.current = new Set();
    setNewMessageIds(new Set());
    setSentMessageIds(new Set());
    setNewlyReadIds(new Set());
    clearTimeout(incomingTimerRef.current);
    clearTimeout(sentTimerRef.current);
  }, [selectedConversation]);

  const { data: conversationStatuses } = useQuery<{
    orderStatuses: Record<string, string>;
    complaintStatuses: Record<string, { status: string; complaintId: string }>;
  }>({
    queryKey: ['/api/conversations', selectedConversation, 'statuses'],
    enabled: !!selectedConversation,
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${selectedConversation}/statuses`);
      if (!res.ok) return { orderStatuses: {}, complaintStatuses: {} };
      return res.json();
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      return apiRequest("POST", `/api/conversations/${conversationId}/read`, {
        userId: currentUser?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/unread?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', currentUser?.id] });
    },
  });

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversation(conversationId);
    setReplyToMessage(null);
    setAttachedOrderRef(null);
    setAttachedComplaintRef(null);
    if (currentUser?.id) {
      markAsReadMutation.mutate(conversationId);
      apiRequest("PATCH", `/api/notifications/read-by-reference?userId=${currentUser.id}&referenceId=${conversationId}&type=new_message`).then(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/notifications?userId=${currentUser.id}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/notifications/count?userId=${currentUser.id}`] });
      }).catch(() => {});
    }
  };

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, messageType = "text", priority = "standard", audioUrl, audioDurationMs }: { content: string; messageType?: string; priority?: string; audioUrl?: string; audioDurationMs?: number }) => {
      return apiRequest("POST", `/api/conversations/${selectedConversation}/messages`, {
        content,
        messageType,
        senderId: currentUser?.id,
        priority,
        ...(audioUrl ? { audioUrl } : {}),
        ...(audioDurationMs !== undefined ? { audioDurationMs } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      setMessageText("");
      setMessagePriority("standard");
      setReplyToMessage(null);
      setAttachedOrderRef(null);
      setAttachedComplaintRef(null);
      setTimeout(scrollToBottom, 100);
    },
  });

  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, selectedConversation]);

  const filteredConversations = conversations?.filter(conv => 
    conv.otherUser.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.otherUser.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Complaint helper functions
  const formatComplaintStatus = (status: string) => {
    const statusMap: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      open: { label: "Offen", icon: Clock, variant: "secondary" },
      in_progress: { label: "In Bearbeitung", icon: Loader2, variant: "default" },
      resolved: { label: "Gelöst", icon: CheckCircle, variant: "outline" },
      closed: { label: "Geschlossen", icon: XCircle, variant: "outline" },
    };
    return statusMap[status] || { label: status, icon: Clock, variant: "secondary" as const };
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

  const [loadingComplaintDetail, setLoadingComplaintDetail] = useState(false);

  const openComplaintDetailById = (complaintId: string) => {
    setSelectedComplaintId(complaintId);
    setShowComplaintDetail(true);
  };

  const openComplaintDetailByOrderId = async (orderId: string) => {
    setLoadingComplaintDetail(true);
    setShowComplaintDetail(true);
    try {
      const res = await fetch(`/api/complaints/by-order/${orderId}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast({ title: "Fehler", description: "Reklamation nicht gefunden.", variant: "destructive" });
        } else {
          throw new Error("Failed to fetch complaint");
        }
        setShowComplaintDetail(false);
        return;
      }
      const complaint: ComplaintWithDetails = await res.json();
      setSelectedComplaintId(complaint.id);
    } catch (error) {
      toast({ title: "Fehler", description: "Reklamation konnte nicht geladen werden.", variant: "destructive" });
      setShowComplaintDetail(false);
    } finally {
      setLoadingComplaintDetail(false);
    }
  };

  const openComplaintStatusDialog = () => {
    if (complaintDetail) {
      setNewStatus(complaintDetail.status);
      setShowStatusDialog(true);
    }
  };

  const openComplaintCommentDialog = () => {
    setShowCommentDialog(true);
    setNewComment("");
  };

  const closeStatusDialog = () => {
    setShowStatusDialog(false);
  };

  const closeCommentDialog = () => {
    setShowCommentDialog(false);
  };

  const handleComplaintStatusSubmit = () => {
    if (!selectedComplaintId || !newStatus) return;
    updateComplaintStatusMutation.mutate({ id: selectedComplaintId, status: newStatus });
  };

  const handleComplaintCommentSubmit = () => {
    if (!selectedComplaintId || !newComment.trim()) {
      toast({ title: "Fehler", description: "Bitte geben Sie einen Kommentar ein.", variant: "destructive" });
      return;
    }
    addComplaintCommentMutation.mutate({ complaintId: selectedComplaintId, content: newComment.trim() });
  };

  const selectedConv = conversations?.find(c => c.id === selectedConversation);
  const restaurantIdForActions = selectedConv?.otherUser.id;

  const { data: allOrdersForActions } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id && openActionsPopover,
  });

  const { data: allComplaintsForActions } = useQuery<ComplaintWithDetails[]>({
    queryKey: [`/api/complaints?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id && openActionsPopover,
  });

  const openActionsOrders = allOrdersForActions?.filter(
    (o: any) => o.restaurantId === restaurantIdForActions && ["pending", "confirmed", "partially_confirmed", "in_delivery"].includes(o.status)
  );
  const openActionsComplaints = allComplaintsForActions?.filter(
    (c: any) => c.restaurantId === restaurantIdForActions && ["open", "in_progress"].includes(c.status)
  );

  const handleSendMessage = () => {
    if (messageText.trim() && selectedConversation) {
      let content = messageText.trim();
      if (attachedOrderRef) {
        content = JSON.stringify({
          refType: "order",
          refId: attachedOrderRef.id,
          refLabel: attachedOrderRef.label,
          text: messageText.trim(),
        });
      } else if (attachedComplaintRef) {
        content = JSON.stringify({
          refType: "complaint",
          refId: attachedComplaintRef.id,
          refLabel: attachedComplaintRef.label,
          text: messageText.trim(),
        });
      } else if (replyToMessage) {
        content = JSON.stringify({
          refType: "reply",
          refId: replyToMessage.id,
          refLabel: replyToMessage.senderName,
          refPreview: replyToMessage.preview,
          text: messageText.trim(),
        });
      }
      sendMessageMutation.mutate({ content, messageType: "text", priority: messagePriority });
    }
  };

  const handleSendAttachment = (content: string) => {
    if (selectedConversation) {
      sendMessageMutation.mutate({ content, messageType: "attachment", priority: messagePriority });
    }
  };

  const { uploadFile: uploadVoice, isUploading: isUploadingVoice } = useUpload();
  const handleSendVoice = async (blob: Blob, durationMs: number) => {
    if (!selectedConversation) return;
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
    const res = await uploadVoice(file);
    if (!res) return;
    sendMessageMutation.mutate({
      content: "",
      messageType: "voice",
      priority: messagePriority,
      audioUrl: res.objectPath,
      audioDurationMs: Math.round(durationMs),
    });
  };

  const pinConvMutation = useMutation({
    mutationFn: async ({ conversationId, isPinned }: { conversationId: string; isPinned: boolean }) => {
      return apiRequest("PATCH", `/api/conversations/${conversationId}/pin`, { userId: currentUser?.id, isPinned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    },
  });

  const quickReplySuggestions = useMemo<string[]>(() => {
    if (!messages || messages.length === 0 || !currentUser) return [];
    const last = messages[messages.length - 1];
    if (last.senderId === currentUser.id) return [];
    const isDe = lang === "de";
    if (last.messageType === "order") {
      return isDe ? ["Bestätigt!", "Wird bearbeitet", "Wann brauchen Sie es?"] : ["Confermato!", "In lavorazione", "Quando vi serve?"];
    }
    if (last.messageType === "complaint") {
      return isDe ? ["Entschuldigung!", "Wir kümmern uns", "Nachlieferung folgt"] : ["Ci scusiamo", "Ce ne occupiamo", "Riconsegna in arrivo"];
    }
    if (last.messageType === "order_change_request") {
      return isDe ? ["Ok, machen wir", "Bitte um Details", "Geht leider nicht"] : ["Ok, va bene", "Dettagli per favore", "Non possibile"];
    }
    return isDe ? ["Erledigt!", "Danke!", "Ok"] : ["Fatto!", "Grazie!", "Ok"];
  }, [messages, currentUser, lang]);

  const handleBackToList = () => {
    setSelectedConversation(null);
    setReplyToMessage(null);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
<Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex flex-1 min-h-0 min-w-0">
          <div className={`w-full md:w-72 lg:w-80 border-r border-border flex flex-col min-h-0 shrink-0 ${selectedConversation ? 'hidden md:flex' : 'flex'}`}>
            <CardHeader className="pb-2 p-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-sm h-9"
                  data-testid="input-search-conversations"
                />
              </div>
            </CardHeader>
            <div ref={pullRefreshRef} className="flex-1 min-h-0 overflow-y-auto relative pb-[var(--mobile-bottom-pad)] md:pb-0">
              {pullDistance > 0 && (
                <div className="absolute top-0 left-0 right-0 flex justify-center z-10 pointer-events-none md:hidden" style={{ transform: `translateY(${pullDistance - 40}px)` }}>
                  <div className={`flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 border border-primary/20 ${isRefreshing ? "animate-pull-spin" : ""}`}>
                    <RefreshCw className="h-4 w-4 text-primary" style={{ transform: isRefreshing ? undefined : `rotate(${pullProgress * 270}deg)`, opacity: pullProgress }} />
                  </div>
                </div>
              )}
              <div className="px-2 pb-2">
                {conversationsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : filteredConversations && filteredConversations.length > 0 ? (
                  <StaggeredList className="space-y-0.5" staggerDelay={30}>
                    {filteredConversations.map((conv) => {
                      const lastMessageTime = conv.lastMessage?.createdAt 
                        ? format(new Date(conv.lastMessage.createdAt), isToday(new Date(conv.lastMessage.createdAt)) ? "HH:mm" : "dd.MM.")
                        : "";
                      let messagePreviewText = conv.lastMessage?.content || (lang === "de" ? "Keine Nachrichten" : "Nessun messaggio");
                      try {
                        const parsed = JSON.parse(conv.lastMessage?.content || "");
                        if (parsed.refType && parsed.text) messagePreviewText = parsed.text;
                      } catch {}
                      let isFollowUpOrder = false;
                      if (conv.lastMessage?.messageType === "order") {
                        try { isFollowUpOrder = JSON.parse(conv.lastMessage.content)?.isFollowUp === true; } catch {}
                      }
                      const lastOid = conv.lastMessage?.orderId ? ` #${formatOrderNumber({orderNumber: conv.lastMessage.orderNumber, id: conv.lastMessage.orderId})}` : "";
                      const messagePreview = conv.lastMessage?.messageType === "voice"
                        ? (lang === "de" ? "🎤 Sprachnachricht" : "🎤 Messaggio vocale")
                        : conv.lastMessage?.messageType === "order" 
                        ? (isFollowUpOrder ? (lang === "de" ? "Nachlieferung" : "Riconsegna") : (lang === "de" ? "Bestellung" : "Ordine")) + lastOid
                        : conv.lastMessage?.messageType === "complaint"
                        ? (lang === "de" ? "Reklamation" : "Reclamo") + lastOid
                        : conv.lastMessage?.messageType === "document"
                        ? (lang === "de" ? "Lieferschein" : "Bolla") + lastOid
                        : conv.lastMessage?.messageType === "attachment"
                        ? (lang === "de" ? "Anhang" : "Allegato")
                        : conv.lastMessage?.messageType === "order_change_request"
                        ? (lang === "de" ? "Änderungsanfrage" : "Richiesta modifica") + lastOid
                        : conv.lastMessage?.messageType === "delivery_status"
                        ? (lang === "de" ? "Lieferhinweis" : "Avviso di consegna") + lastOid
                        : conv.lastMessage?.messageType === "promotion"
                        ? (lang === "de" ? "Aktion" : "Promozione")
                        : messagePreviewText;
                      const hasUnread = conv.unreadCount > 0;
                      const isPriorityMsg = conv.lastMessage?.priority === "important";
                      return (
                        <SwipeableRow
                          key={conv.id}
                          leftActions={[
                            ...(hasUnread
                              ? [{
                                  icon: <Check className="h-5 w-5" />,
                                  label: lang === "de" ? "Gelesen" : "Letto",
                                  color: "bg-blue-500",
                                  onClick: () => handleSelectConversation(conv.id),
                                  testId: `swipe-read-${conv.id}`,
                                }]
                              : []),
                            {
                              icon: (conv as any).pinnedBySupplier ? <PinOff className="h-5 w-5" /> : <Pin className="h-5 w-5" />,
                              label: (conv as any).pinnedBySupplier ? (lang === "de" ? "Lösen" : "Sblocca") : (lang === "de" ? "Anheften" : "Fissa"),
                              color: "bg-amber-500",
                              onClick: () => pinConvMutation.mutate({ conversationId: conv.id, isPinned: !(conv as any).pinnedBySupplier }),
                              testId: `swipe-pin-${conv.id}`,
                            },
                          ]}
                          rightActions={[]}
                        >
                          <button
                            onClick={() => handleSelectConversation(conv.id)}
                            className={`w-full p-3 md:p-2.5 min-h-[64px] md:min-h-0 rounded-xl md:rounded-md text-left transition-colors hover-elevate overflow-hidden ${
                              selectedConversation === conv.id
                                ? "bg-secondary/10"
                                : hasUnread && isPriorityMsg
                                ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"
                                : hasUnread
                                ? "bg-primary/5"
                                : ""
                            } ${flashingConvIds.has(conv.id) ? "animate-flash-new" : ""}`}
                            data-testid={`conversation-${conv.id}`}
                          >
                            <div className="flex items-center gap-3 md:gap-2.5">
                              <div className="relative shrink-0">
                                <Avatar className="h-11 w-11 md:h-9 md:w-9">
                                  <AvatarImage src={conv.otherUser.profileImageUrl || undefined} alt={conv.otherUser.name} />
                                  <AvatarFallback className="bg-primary/20 text-primary text-sm">
                                    {conv.otherUser.companyName?.charAt(0) || conv.otherUser.name.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                {hasUnread && isPriorityMsg ? (
                                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 border-2 border-background flex items-center justify-center text-[8px] font-bold text-white">!</span>
                                ) : hasUnread ? (
                                  <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background animate-pulse" />
                                ) : conv.otherUser.lastSeenAt && (Date.now() - new Date(conv.otherUser.lastSeenAt).getTime()) < 120000 ? (
                                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
                                ) : null}
                              </div>
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`text-[15px] md:text-sm truncate flex-1 min-w-0 ${hasUnread && isPriorityMsg ? "font-bold text-red-600 dark:text-red-400" : hasUnread ? "font-bold text-foreground" : "font-medium"}`}>
                                    {conv.otherUser.companyName || conv.otherUser.name}
                                  </p>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {(conv as any).pinnedBySupplier && (
                                      <Pin className="h-3 w-3 text-amber-500 fill-amber-500" data-testid={`icon-pinned-${conv.id}`} />
                                    )}
                                    {lastMessageTime && (
                                      <span className={`text-[11px] md:text-[10px] ${hasUnread && isPriorityMsg ? "text-red-500 font-semibold" : hasUnread ? "text-primary font-semibold" : "text-muted-foreground"}`}>{lastMessageTime}</span>
                                    )}
                                    {hasUnread && (
                                      <span className={`flex h-5 min-w-5 px-1 items-center justify-center rounded-full text-[10px] font-bold ${isPriorityMsg ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"}`}>
                                        {conv.unreadCount}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className={`text-[13px] md:text-xs truncate max-w-full mt-0.5 ${hasUnread && isPriorityMsg ? "text-red-500 font-semibold" : hasUnread ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                                  {isPriorityMsg && hasUnread ? "! " : ""}{messagePreview}
                                </p>
                              </div>
                            </div>
                          </button>
                        </SwipeableRow>
                      );
                    })}
                  </StaggeredList>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                    <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">Keine Konversationen</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${selectedConversation ? 'flex' : 'hidden md:flex'}`}>
            {selectedConversation && selectedConv ? (
              <>
                <div className="border-b border-border px-3 py-3.5 md:px-4 md:py-4 bg-background">
                  <div className="flex items-center gap-2.5 md:gap-3 min-h-[44px]">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden h-9 w-9 shrink-0"
                      onClick={handleBackToList}
                      data-testid="button-back-to-list"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Avatar className="h-10 w-10 md:h-10 md:w-10 shrink-0">
                      <AvatarImage src={selectedConv.otherUser.profileImageUrl || undefined} alt={selectedConv.otherUser.name} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm">
                        {selectedConv.otherUser.companyName?.charAt(0) || selectedConv.otherUser.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm md:text-base truncate" data-testid="text-conversation-partner">
                        {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                      </p>
                      <OnlineStatus userId={selectedConv.otherUser.id} size="sm" />
                    </div>
                    {selectedConv.otherUser.phone && (
                      <Button variant="ghost" size="icon" asChild data-testid="button-call-restaurant">
                        <a href={`tel:${selectedConv.otherUser.phone}`}>
                          <Phone className="h-5 w-5" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setOpenActionsPopover(true)} data-testid="button-open-actions">
                      <ClipboardList className="h-5 w-5" />
                    </Button>
                    <Dialog open={openActionsPopover} onOpenChange={setOpenActionsPopover}>
                      <DialogContent className="max-w-[92vw] md:max-w-md p-0 gap-0 rounded-2xl">
                        <DialogHeader className="sr-only">
                          <DialogTitle>{t("inbox", "openActions")}</DialogTitle>
                          <DialogDescription>{selectedConv.otherUser.companyName || selectedConv.otherUser.name}</DialogDescription>
                        </DialogHeader>
                        <div className="px-5 pt-5 pb-2">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-foreground" />
                            <h3 className="text-sm font-semibold text-foreground">{t("inbox", "openActions")}</h3>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 pl-6">{selectedConv.otherUser.companyName || selectedConv.otherUser.name}</p>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto px-4 pb-3 space-y-3">
                          {openActionsOrders && openActionsOrders.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5" data-testid="text-open-orders-header">Offene Bestellungen ({openActionsOrders.length})</p>
                              <div className="space-y-2">
                                {openActionsOrders.map((order: any) => {
                                  const StatusIcon = order.status === "pending" ? Clock : order.status === "partially_confirmed" ? AlertTriangle : order.status === "confirmed" ? CheckCircle : Package;
                                  const nextStatus = order.status === "pending" ? "confirmed" : (order.status === "confirmed" || order.status === "partially_confirmed") ? "in_delivery" : "delivered";
                                  const nextLabel = order.status === "pending" ? "Bestätigen" : (order.status === "confirmed" || order.status === "partially_confirmed") ? "In Lieferung" : "Geliefert";
                                  const NextIcon = order.status === "pending" ? CheckCircle : (order.status === "confirmed" || order.status === "partially_confirmed") ? Truck : Check;
                                  return (
                                    <div
                                      key={order.id}
                                      className="rounded-xl bg-muted/30 dark:bg-muted/20 p-3 space-y-2"
                                      data-testid={`open-action-order-${order.id}`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0 cursor-pointer" onClick={() => { setOrderDetailId(order.id); setOpenActionsPopover(false); }}>
                                          <StatusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                          <span className="text-xs font-mono truncate">Bestellung #{formatOrderNumber(order)}</span>
                                        </div>
                                        <Badge variant="secondary" className={`text-[10px] shrink-0 ${getStatusColor(order.status)}`}>
                                          {getStatusLabel(order.status)}
                                        </Badge>
                                      </div>
                                      {order.items && order.items.length > 0 && (
                                        <div className="space-y-0.5">
                                          {order.items.slice(0, 3).map((item: any, idx: number) => (
                                            <div key={idx} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                              <ProductImage src={item.productImageUrl} className="h-4 w-4 rounded" iconClassName="h-2 w-2" />
                                              <span className="truncate flex-1">{item.quantity}x {item.productName}</span>
                                              <span className="shrink-0 font-medium text-foreground">€{Number(item.totalPrice).toFixed(2)}</span>
                                            </div>
                                          ))}
                                          {order.items.length > 3 && (
                                            <p className="text-[10px] text-muted-foreground">+{order.items.length - 3} weitere</p>
                                          )}
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                                        <span>
                                          {format(new Date(order.createdAt), "dd.MM.yy", { locale: de })}
                                          {order.createdByUser && (
                                            <span className="ml-1" data-testid={`text-created-by-${order.id}`}>· {order.createdByUser.name}</span>
                                          )}
                                        </span>
                                        <span className="font-semibold text-xs text-foreground">{order.totalAmount ? `€${Number(order.totalAmount).toFixed(2)}` : ""}</span>
                                      </div>
                                      {order.status === "in_delivery" && order.requestedDeliveryDate && (
                                        <div className="flex items-center gap-1.5 rounded-lg bg-muted/40 dark:bg-muted/30 px-2 py-1">
                                          <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
                                          <span className="text-[10px] font-semibold text-foreground">
                                            {t("orders", "deliveryOn")} {new Date(order.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "long" })}
                                          </span>
                                        </div>
                                      )}
                                      {order.status === "delivered" && (
                                        <div className="flex items-center gap-1.5 rounded-lg bg-muted/40 dark:bg-muted/30 px-2 py-1">
                                          <CheckCircle className="h-3 w-3 text-muted-foreground shrink-0" />
                                          <span className="text-[10px] font-semibold text-foreground">
                                            {t("orders", "deliveredOn")} {format(new Date(order.updatedAt || order.createdAt), "dd.MM.yyyy", { locale: dateFnsLocale })}
                                          </span>
                                        </div>
                                      )}
                                      {order.status !== "in_delivery" && order.status !== "delivered" && order.requestedDeliveryDate && (
                                        <div className="flex items-center gap-1 rounded-lg bg-muted/40 dark:bg-muted/30 px-2 py-0.5">
                                          <CalendarDays className="h-3 w-3 text-muted-foreground shrink-0" />
                                          <span className="text-[10px] font-semibold text-foreground">
                                            {t("orders", "deliveryOn")} {new Date(order.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "long" })}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex items-center gap-1.5 pt-0.5">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-xs flex-1 border-border/40 rounded-lg"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (nextStatus === "in_delivery") {
                                              setDeliveryDatePicker({ orderId: order.id, restaurantId: order.restaurantId });
                                              setOpenActionsPopover(false);
                                              return;
                                            }
                                            apiRequest("PATCH", `/api/orders/${order.id}/status`, { status: nextStatus, changedBy: currentUser?.id })
                                              .then(() => {
                                                queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
                                                queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
                                                queryClient.invalidateQueries({ queryKey: ["/api/supplier/stats"] });
                                                queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes?.("/api/supplier/detailed-stats") });
                                                queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent', currentUser?.id] });
                                                queryClient.invalidateQueries({ queryKey: ['/api/orders/recent'] });
                                                queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                                                if (selectedConversation) {
                                                  queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
                                                }
                                                toast({ title: "Status aktualisiert", description: `Bestellung #${formatOrderNumber(order)} → ${nextLabel}` });
                                              })
                                              .catch(() => toast({ title: "Fehler", variant: "destructive" }));
                                          }}
                                          data-testid={`button-action-order-next-${order.id}`}
                                        >
                                          <NextIcon className="h-3 w-3 mr-1" />
                                          {nextLabel}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-xs border-border/40 rounded-lg"
                                          onClick={() => { setOrderDetailId(order.id); setOpenActionsPopover(false); }}
                                          data-testid={`button-action-order-detail-${order.id}`}
                                        >
                                          <Eye className="h-3 w-3 mr-1" />
                                          Details
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {openActionsComplaints && openActionsComplaints.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5" data-testid="text-open-complaints-header">Offene Reklamationen ({openActionsComplaints.length})</p>
                              <div className="space-y-2">
                                {openActionsComplaints.map((complaint: any) => {
                                  const StatusIcon = complaint.status === "open" ? AlertCircle : Clock;
                                  const nextStatus = complaint.status === "open" ? "in_progress" : "resolved";
                                  const nextLabel = complaint.status === "open" ? "In Bearbeitung" : "Gelöst";
                                  const NextIcon = complaint.status === "open" ? Settings : CheckCircle;
                                  return (
                                    <div
                                      key={complaint.id}
                                      className="rounded-xl bg-muted/30 dark:bg-muted/20 p-3 space-y-2"
                                      data-testid={`open-action-complaint-${complaint.id}`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0 cursor-pointer" onClick={() => { openComplaintDetailById(complaint.id); setOpenActionsPopover(false); }}>
                                          <StatusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                          <span className="text-xs font-medium truncate">{complaint.title}</span>
                                        </div>
                                        <Badge variant="secondary" className={`text-[10px] shrink-0 ${getComplaintStatusColor(complaint.status)}`}>
                                          {getComplaintStatusLabel(complaint.status)}
                                        </Badge>
                                      </div>
                                      {complaint.description && (
                                        <p className="text-[10px] text-muted-foreground line-clamp-2">{complaint.description}</p>
                                      )}
                                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        <span>Reklamation #{formatComplaintNumber(complaint)}</span>
                                        <span>•</span>
                                        <span>{format(new Date(complaint.createdAt), "dd.MM.yy", { locale: de })}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 pt-0.5">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-xs flex-1 border-border/40 rounded-lg"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            apiRequest("PATCH", `/api/complaints/${complaint.id}`, { status: nextStatus, changedBy: currentUser?.id, actorRole: "supplier" })
                                              .then(() => {
                                                queryClient.invalidateQueries({ queryKey: [`/api/complaints?supplierId=${currentUser?.id}`] });
                                                queryClient.invalidateQueries({ queryKey: ["/api/complaints"] });
                                                queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
                                                if (selectedConversation) {
                                                  queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
                                                }
                                                toast({ title: "Status aktualisiert", description: `Reklamation → ${nextLabel}` });
                                              })
                                              .catch(() => toast({ title: "Fehler", variant: "destructive" }));
                                          }}
                                          data-testid={`button-action-complaint-next-${complaint.id}`}
                                        >
                                          <NextIcon className="h-3 w-3 mr-1" />
                                          {nextLabel}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-xs border-border/40 rounded-lg"
                                          onClick={() => { openComplaintDetailById(complaint.id); setOpenActionsPopover(false); }}
                                          data-testid={`button-action-complaint-detail-${complaint.id}`}
                                        >
                                          <Eye className="h-3 w-3 mr-1" />
                                          Details
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {(!openActionsOrders || openActionsOrders.length === 0) && (!openActionsComplaints || openActionsComplaints.length === 0) && (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                              <CheckCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
                              <p className="text-sm text-muted-foreground" data-testid="text-no-open-actions">{t("inbox", "noOpenActions")}</p>
                            </div>
                          )}
                        </div>
                        <div className="px-4 pb-4 pt-1 space-y-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-center text-xs border-border/40 rounded-xl h-9"
                            onClick={() => { setOpenActionsPopover(false); setLocation(`/supplier/orders?restaurantId=${selectedConv.otherUser.id}`); }}
                            data-testid="button-view-all-orders"
                          >
                            <ShoppingBag className="h-3.5 w-3.5 mr-2" />
                            {t("inbox", "viewAllOrders")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-center text-xs border-border/40 rounded-xl h-9"
                            onClick={() => { setOpenActionsPopover(false); setLocation(`/supplier/complaints?restaurantId=${selectedConv.otherUser.id}`); }}
                            data-testid="button-view-all-complaints"
                          >
                            <AlertCircle className="h-3.5 w-3.5 mr-2" />
                            {t("inbox", "viewAllComplaints")}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                {conversationDocs && conversationDocs.filter(d => d.type === "delivery_note").length > 0 && (
                  <div className="border-b border-border shrink-0" data-testid="delivery-notes-panel">
                    <button
                      className="w-full flex items-center justify-between gap-2 px-4 py-2 text-xs hover:bg-muted/50 transition-colors"
                      onClick={() => setShowDeliveryNotes(!showDeliveryNotes)}
                      data-testid="button-toggle-delivery-notes"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span className="font-medium">{lang === "de" ? "Lieferscheine" : "Bolle di consegna"}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{conversationDocs.filter(d => d.type === "delivery_note").length}</Badge>
                      </div>
                      {showDeliveryNotes ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {showDeliveryNotes && (
                      <div className="px-3 pb-2 space-y-1 max-h-40 overflow-y-auto">
                        {conversationDocs.filter(d => d.type === "delivery_note").map((doc: any) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between gap-2 rounded-md bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 px-3 py-1.5"
                            data-testid={`delivery-note-item-${doc.id}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{doc.title}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(doc.createdAt).toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => {
                                const a = document.createElement("a"); a.href = `/api/orders/${doc.orderId}/delivery-note/download`; a.setAttribute("download", ""); document.body.appendChild(a); a.click(); document.body.removeChild(a);
                              }}
                              data-testid={`button-download-note-${doc.id}`}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4" style={{ minHeight: 0 }}>
                  {messagesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-3/4" />
                      ))}
                    </div>
                  ) : messages && messages.length > 0 ? (
                    <div className="space-y-3 w-full overflow-hidden">
                      {messages.map((message, index) => {
                        const isOwn = message.senderId === currentUser?.id;
                        const messageDate = new Date(message.createdAt);
                        const prevMessage = index > 0 ? messages[index - 1] : null;
                        const showDateDivider = !prevMessage || !isSameDay(messageDate, new Date(prevMessage.createdAt));
                        
                        const isNewMessage = newMessageIds.has(message.id);
                        const isSentMessage = sentMessageIds.has(message.id);
                        return (
                          <div key={message.id} className={isNewMessage ? "animate-slide-in-message" : isSentMessage ? "animate-fly-up-message" : ""}>
                            {showDateDivider && (
                              <div className="flex justify-center my-4">
                                <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                                  {formatDateDivider(messageDate)}
                                </span>
                              </div>
                            )}
                            <div
                              className={`flex ${message.messageType === "order" || message.messageType === "complaint" || message.messageType === "document" || message.messageType === "order_change_request" || message.messageType === "promotion" || message.messageType === "delivery_status" ? "justify-center" : message.messageType === "attachment" ? (isOwn ? "justify-end" : "justify-start") : isOwn ? "justify-end" : "justify-start"}`}
                              data-testid={`message-${message.id}`}
                              {...(message.orderId ? { "data-order-id": message.orderId } : {})}
                            >
                              {message.messageType === "promotion" ? (
                                (() => {
                                  let promoData: any = null;
                                  try { promoData = JSON.parse(message.content); } catch {}
                                  if (!promoData) return null;
                                  const now = new Date();
                                  const endDate = new Date(promoData.endDate);
                                  const isExpired = endDate < now;
                                  const isDismissed = message.dismissed;
                                  if (isDismissed) {
                                    return (
                                      <div className="max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`promotion-dismissed-${message.id}`}>
                                        <div className="flex items-center justify-between px-3 py-2 gap-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-xs text-muted-foreground truncate">{promoData.name}</span>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground shrink-0">
                                              {lang === "de" ? "Abgelehnt" : "Rifiutato"}
                                            </span>
                                          </div>
                                          <span className="text-[10px] text-muted-foreground shrink-0">{format(messageDate, "HH:mm")}</span>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className={`max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border-2 shadow-sm overflow-hidden ${isExpired ? "border-muted bg-muted/20 opacity-60" : "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"}`} data-testid={`promotion-card-${message.id}`}>
                                      <div className={`flex items-center justify-between gap-2 px-4 pt-3 pb-1 ${isExpired ? "" : ""}`}>
                                        <div className="flex items-center gap-2">
                                          <Tag className={`h-4 w-4 ${isExpired ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`} />
                                          <span className={`text-xs font-semibold ${isExpired ? "text-muted-foreground" : "text-green-700 dark:text-green-300"}`}>{promoData.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50 px-1.5 py-0.5 rounded">-{promoData.discountPercent}%</span>
                                          <span className="text-xs text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                        </div>
                                      </div>
                                      <div className="p-3 space-y-2">
                                        {promoData.description && (
                                          <p className="text-xs text-muted-foreground">{promoData.description}</p>
                                        )}
                                        <div className="space-y-1">
                                          {promoData.products?.map((prod: any) => (
                                            <div key={prod.id} className="flex items-center gap-2 text-xs bg-background/50 rounded-md px-2 py-1.5">
                                              <ProductImage src={prod.imageUrl} alt={prod.name} className="w-6 h-6 rounded" iconClassName="h-3 w-3" fallbackIconColor="text-muted-foreground/30" />
                                              <span className="font-medium flex-1">{prod.name}</span>
                                              <span className="text-muted-foreground line-through">{prod.originalPrice}€</span>
                                              <span className="font-semibold text-green-600 dark:text-green-400">{prod.discountedPrice}€/{prod.unit}</span>
                                            </div>
                                          ))}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                          <Calendar className="h-3 w-3" />
                                          <span>{lang === "de" ? "Gültig bis" : "Valido fino al"} {format(endDate, "dd.MM.yyyy")}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()
                              ) : message.messageType === "order" ? (
                                (() => {
                                  const orderData = parseOrderContent(message.content);
                                  const orderStatus = message.orderId ? conversationStatuses?.orderStatuses?.[message.orderId] : undefined;
                                  const inactive = orderStatus ? isOrderInactive(orderStatus) : false;
                                  if (inactive) {
                                    return (
                                      <div className="max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`inactive-order-${message.id}`}>
                                        <div className="flex items-center justify-between px-3 py-2 gap-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-xs text-muted-foreground truncate">{lang === "de" ? "Bestellung" : "Ordine"} {message.orderId ? `#${formatOrderNumber({orderNumber: message.orderNumber, id: message.orderId})}` : ""}</span>
                                            {orderStatus && (
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${getStatusColor(orderStatus)}`}>
                                                {getStatusLabel(orderStatus)}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[10px] text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                            {message.orderId && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2 text-[10px]"
                                                onClick={() => setOrderDetailId(message.orderId)}
                                                data-testid={`button-order-details-${message.id}`}
                                              >
                                                <Eye className="h-3 w-3 mr-1" />
                                                Details
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  const statusStyle = getStatusCardBg(orderStatus || "pending");
                                  return (
                                    <div className={`max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border shadow-sm overflow-hidden ${statusStyle.card}`}>
                                      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                                        <div className="flex items-center gap-2">
                                          <ClipboardList className={`h-3.5 w-3.5 ${statusStyle.icon}`} />
                                          <span className={`text-xs font-semibold ${statusStyle.icon}`}>{lang === "de" ? "Bestellung" : "Ordine"} {message.orderId ? `#${formatOrderNumber({orderNumber: message.orderNumber, id: message.orderId})}` : ""}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {orderStatus && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusColor(orderStatus)}`} data-testid={`order-status-${message.id}`}>
                                              {getStatusLabel(orderStatus)}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-muted-foreground">
                                            {format(messageDate, "HH:mm")}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="px-4 py-2">
                                        {orderData ? (
                                          <div className="space-y-0">
                                            {orderData.items.map((item, idx) => (
                                              <div key={idx} className="flex items-center gap-3 py-2" data-testid={`order-item-${message.id}-${idx}`}>
                                                <ProductImage src={item.imageUrl} alt={item.name} className="w-11 h-11 rounded-full" iconClassName="h-4 w-4" fallbackBg="bg-muted/60" />
                                                <div className="flex-1 min-w-0">
                                                  <span className="text-[13px] font-medium truncate block">{item.name}</span>
                                                  <span className="text-[11px] text-muted-foreground">{item.quantity}x</span>
                                                </div>
                                                <span className="text-[13px] font-semibold flex-shrink-0">{item.price}€</span>
                                              </div>
                                            ))}
                                            <div className="flex justify-between items-center gap-3 pt-2 pb-1">
                                              <span className="text-[13px] font-semibold shrink-0">Gesamt</span>
                                              <span className="text-[13px] font-bold shrink-0">{orderData.total}€</span>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-sm">{message.content}</p>
                                        )}
                                      </div>
                                      {message.orderId && (
                                        <div className="px-4 pb-3 pt-1 space-y-2">
                                          {cardWizard?.orderId === message.orderId ? (
                                            <div className="p-3 rounded-lg border bg-card space-y-3" data-testid={`wizard-confirm-${message.orderId}`}>
                                              <div className="flex items-center gap-2">
                                                {cardWizard.action === "confirmed" && <CheckCircle className="h-4 w-4 text-blue-600" />}
                                                {cardWizard.action === "in_delivery" && <Truck className="h-4 w-4 text-purple-600" />}
                                                {cardWizard.action === "delivered" && <Package className="h-4 w-4 text-green-600" />}
                                                {cardWizard.action === "cancelled" && <XCircle className="h-4 w-4 text-red-600" />}
                                                <span className="text-sm font-medium">
                                                  {cardWizard.action === "confirmed" && (lang === "it" ? "Confermare l'ordine?" : "Bestellung bestätigen?")}
                                                  {cardWizard.action === "in_delivery" && (lang === "it" ? "Contrassegnare come in consegna?" : "Als in Lieferung markieren?")}
                                                  {cardWizard.action === "delivered" && (lang === "it" ? "Contrassegnare come consegnato?" : "Als geliefert markieren?")}
                                                  {cardWizard.action === "cancelled" && (lang === "it" ? "Annullare l'ordine?" : "Bestellung stornieren?")}
                                                </span>
                                              </div>
                                              <p className="text-xs text-muted-foreground">
                                                {cardWizard.action === "confirmed" && (lang === "it" ? "Il magazzino verrà aggiornato automaticamente." : "Der Lagerbestand wird automatisch aktualisiert.")}
                                                {cardWizard.action === "in_delivery" && (lang === "it" ? "Lo stato cambierà a 'in consegna'." : "Der Status wird auf 'In Lieferung' geändert.")}
                                                {cardWizard.action === "delivered" && (lang === "it" ? "L'ordine verrà contrassegnato come completato." : "Die Bestellung wird als abgeschlossen markiert.")}
                                                {cardWizard.action === "cancelled" && (lang === "it" ? "Questa azione non può essere annullata." : "Diese Aktion kann nicht rückgängig gemacht werden.")}
                                              </p>
                                              <div className="flex gap-2">
                                                <Button variant="outline" size="sm" className="flex-1 text-foreground" onClick={() => setCardWizard(null)} data-testid={`wizard-cancel-${message.orderId}`}>
                                                  {lang === "it" ? "Annulla" : "Abbrechen"}
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  className="flex-1"
                                                  variant={cardWizard.action === "cancelled" ? "destructive" : "default"}
                                                  onClick={() => {
                                                    if (cardWizard.action === "in_delivery" && selectedConv) {
                                                      setDeliveryDatePicker({ orderId: message.orderId!, restaurantId: selectedConv.restaurantId });
                                                    } else {
                                                      updateOrderStatusMutation.mutate({ orderId: message.orderId!, status: cardWizard.action });
                                                    }
                                                  }}
                                                  disabled={updateOrderStatusMutation.isPending}
                                                  data-testid={`wizard-confirm-action-${message.orderId}`}
                                                >
                                                  {updateOrderStatusMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                                                  {cardWizard.action === "in_delivery"
                                                    ? (lang === "it" ? "Scegli data" : "Datum wählen")
                                                    : (lang === "it" ? "Conferma" : "Bestätigen")}
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="grid grid-cols-2 gap-1.5">
                                              <Button size="sm" variant="outline" className="text-xs h-8 min-w-0 truncate" onClick={() => setOrderDetailId(message.orderId)} data-testid={`button-order-details-${message.id}`}>
                                                <Eye className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                <span className="truncate">Details</span>
                                              </Button>
                                              {orderStatus === "pending" && (
                                                <Button size="sm" variant="outline" className="text-xs h-8 min-w-0 truncate" onClick={async () => {
                                                  try {
                                                    const res = await fetch(`/api/orders/${message.orderId}`);
                                                    if (res.ok) {
                                                      const orderData = await res.json();
                                                      setConfirmOrderForDialog(orderData);
                                                    }
                                                  } catch {}
                                                }} data-testid={`button-card-confirm-${message.id}`}>
                                                  <CheckCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                  <span className="truncate">{lang === "it" ? "Conferma" : "Bestätigen"}</span>
                                                </Button>
                                              )}
                                              {(orderStatus === "confirmed" || orderStatus === "partially_confirmed") && (
                                                <Button size="sm" variant="outline" className="text-xs h-8 min-w-0 truncate" onClick={() => setCardWizard({ orderId: message.orderId!, action: "in_delivery" })} data-testid={`button-card-in_delivery-${message.id}`}>
                                                  <Truck className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                  <span className="truncate">{lang === "it" ? "Consegna" : "Lieferung"}</span>
                                                </Button>
                                              )}
                                              {orderStatus === "in_delivery" && (
                                                <Button size="sm" variant="outline" className="text-xs h-8 min-w-0 truncate" onClick={() => setCardWizard({ orderId: message.orderId!, action: "delivered" })} data-testid={`button-card-delivered-${message.id}`}>
                                                  <Package className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                  <span className="truncate">{lang === "it" ? "Consegnato" : "Geliefert"}</span>
                                                </Button>
                                              )}
                                              {orderStatus && !["delivered", "cancelled", "in_delivery"].includes(orderStatus) && (
                                                <Button size="sm" variant="outline" className="text-xs h-8 min-w-0 truncate" onClick={() => setCardWizard({ orderId: message.orderId!, action: "cancelled" })} data-testid={`button-card-cancel-${message.id}`}>
                                                  <XCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                  <span className="truncate">{lang === "it" ? "Annulla" : "Stornieren"}</span>
                                                </Button>
                                              )}
                                              {orderStatus && !["delivered", "cancelled", "pending"].includes(orderStatus) && selectedConv && (
                                                <Button size="sm" variant="outline" className="text-xs h-8 min-w-0 truncate" onClick={() => setDeliveryDatePicker({ orderId: message.orderId!, restaurantId: selectedConv.restaurantId })} data-testid={`button-set-date-${message.id}`}>
                                                  <CalendarDays className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                  <span className="truncate">{lang === "it" ? "Data" : "Datum"}</span>
                                                </Button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              ) : message.messageType === "complaint" ? (
                                (() => {
                                  const complaintData = parseComplaintContent(message.content);
                                  const complaintStatus = complaintData?.orderId ? conversationStatuses?.complaintStatuses?.[complaintData.orderId]?.status : undefined;
                                  const inactive = complaintStatus ? isComplaintInactive(complaintStatus) : false;
                                  if (inactive) {
                                    return (
                                      <div className="max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`inactive-complaint-${message.id}`}>
                                        <div className="flex items-center justify-between px-3 py-2 gap-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-xs text-muted-foreground truncate">{lang === "de" ? "Reklamation" : "Reclamo"} {complaintData?.orderId ? `#${(complaintData as any).complaintNumber || (complaintData as any).orderNumber || formatOrderNumber({orderNumber: null, id: complaintData.orderId})}` : ""}</span>
                                            {complaintStatus && (
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${getComplaintStatusColor(complaintStatus)}`}>
                                                {getComplaintStatusLabel(complaintStatus)}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[10px] text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                            {(complaintData?.complaintId || complaintData?.orderId) && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2 text-[10px]"
                                                onClick={() => {
                                                  if (complaintData.complaintId) {
                                                    openComplaintDetailById(complaintData.complaintId);
                                                  } else if (complaintData.orderId) {
                                                    openComplaintDetailByOrderId(complaintData.orderId);
                                                  }
                                                }}
                                                data-testid={`button-complaint-details-${message.id}`}
                                              >
                                                <Eye className="h-3 w-3 mr-1" />
                                                Details
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border bg-card shadow-sm overflow-hidden border-2 border-red-500/30 shadow-lg">
                                      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                                        <div className="flex items-center gap-2">
                                          <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                                          <span className="text-xs font-semibold text-red-600 dark:text-red-400">{lang === "de" ? "Reklamation" : "Reclamo"} {complaintData?.orderId ? `#${(complaintData as any).complaintNumber || (complaintData as any).orderNumber || formatOrderNumber({orderNumber: null, id: complaintData.orderId})}` : ""}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {complaintStatus && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getComplaintStatusColor(complaintStatus)}`} data-testid={`complaint-status-${message.id}`}>
                                              {getComplaintStatusLabel(complaintStatus)}
                                            </span>
                                          )}
                                          {(complaintStatus === "open" || !complaintStatus) && (Date.now() - messageDate.getTime()) >= 24 * 60 * 60 * 1000 && (() => {
                                            const days = Math.floor((Date.now() - messageDate.getTime()) / (24 * 60 * 60 * 1000));
                                            const cls = days >= 3 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
                                            return (
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${cls}`} data-testid={`complaint-overdue-${message.id}`}>
                                                {days}d {lang === "de" ? "offen" : "aperto"}
                                              </span>
                                            );
                                          })()}
                                          <span className="text-xs text-muted-foreground">
                                            {format(messageDate, "HH:mm")}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="px-3 py-2">
                                        {complaintData ? (
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between flex-wrap gap-1">
                                              <div className="flex items-center gap-1.5">
                                                {message.priority === "important" && (
                                                  <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                                )}
                                                <span className={`font-medium ${message.priority === "important" ? "text-red-700 dark:text-red-400" : ""}`}>{complaintData.title}</span>
                                              </div>
                                              <Badge variant="outline" className="text-xs">
                                                Bestellung #{complaintData.orderId ? ((complaintData as any).orderNumber || formatOrderNumber({orderNumber: null, id: complaintData.orderId})) : ""}
                                              </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground line-clamp-2">{complaintData.description}</p>
                                            {(complaintData as any).reason && (
                                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] font-medium" data-testid={`complaint-reason-${message.id}`}>
                                                <AlertCircle className="h-2.5 w-2.5" />
                                                {getComplaintReasonLabel((complaintData as any).reason, lang)}
                                              </div>
                                            )}
                                            {(complaintData as any).mediaUrls && (complaintData as any).mediaUrls.length > 0 && (
                                              <div className="mt-2 grid grid-cols-3 gap-1.5" data-testid={`complaint-media-${message.id}`}>
                                                {((complaintData as any).mediaUrls as string[]).slice(0, 6).map((url, i) => (
                                                  <a key={i} href={getMediaSrc(url)} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border hover-elevate">
                                                    <img src={getMediaSrc(url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                                                  </a>
                                                ))}
                                              </div>
                                            )}
                                            {complaintData.affectedItems && complaintData.affectedItems.length > 0 && (
                                              <div className="mt-2 p-2 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                                                <div className="flex items-center gap-1.5 mb-1.5">
                                                  <RefreshCw className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                                                  <span className="text-[10px] font-semibold text-orange-700 dark:text-orange-300 uppercase">
                                                    {lang === "de" ? "Nachlieferung angefragt" : "Riconsegna richiesta"}
                                                  </span>
                                                </div>
                                                <div className="space-y-0.5">
                                                  {complaintData.affectedItems.map((ai, idx) => (
                                                    <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                                                      <span className="text-foreground">{ai.productName}</span>
                                                      <span className="text-muted-foreground">{ai.quantity}x {parseFloat(ai.unitPrice).toFixed(2)} €</span>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <p className="text-sm">{message.content}</p>
                                        )}
                                      </div>
                                      {(complaintData?.complaintId || complaintData?.orderId) && (
                                        <div className="px-4 pb-3 pt-1 space-y-1.5">
                                          {complaintData.complaintId && complaintStatus !== "resolved" && complaintStatus !== "closed" && complaintStatus !== "rejected" && (
                                            <div className="grid grid-cols-2 gap-1.5">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950/30"
                                                onClick={() => complaintData.complaintId && quickStatusUpdateMutation.mutate({ id: complaintData.complaintId, status: "in_progress" })}
                                                disabled={quickStatusUpdateMutation.isPending}
                                                data-testid={`button-complaint-quick-progress-${message.id}`}
                                              >
                                                <Loader2 className="h-3 w-3 mr-1" />
                                                {lang === "de" ? "Bearb." : "Avvia"}
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-[11px] text-orange-600 border-orange-200 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950/30"
                                                onClick={() => complaintData.complaintId && startFollowUpFromCard(complaintData.complaintId)}
                                                data-testid={`button-complaint-quick-followup-${message.id}`}
                                              >
                                                <RefreshCw className="h-3 w-3 mr-1" />
                                                {lang === "de" ? "Nachl." : "Riconseg."}
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-[11px] text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/30"
                                                onClick={() => complaintData.complaintId && quickStatusUpdateMutation.mutate({ id: complaintData.complaintId, status: "partially_resolved" })}
                                                disabled={quickStatusUpdateMutation.isPending}
                                                data-testid={`button-complaint-quick-partial-${message.id}`}
                                              >
                                                <CheckCircle className="h-3 w-3 mr-1" />
                                                {lang === "de" ? "Teilw." : "Parz."}
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-[11px] text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/30"
                                                onClick={() => { if (complaintData.complaintId) { setRejectComplaintId(complaintData.complaintId); setRejectReasonText(""); } }}
                                                data-testid={`button-complaint-quick-reject-${message.id}`}
                                              >
                                                <Ban className="h-3 w-3 mr-1" />
                                                {lang === "de" ? "Ablehnen" : "Rifiuta"}
                                              </Button>
                                            </div>
                                          )}
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/30"
                                            onClick={() => {
                                              if (complaintData.complaintId) {
                                                openComplaintDetailById(complaintData.complaintId);
                                              } else if (complaintData.orderId) {
                                                openComplaintDetailByOrderId(complaintData.orderId);
                                              }
                                            }}
                                            data-testid={`button-complaint-details-${message.id}`}
                                          >
                                            <Eye className="h-4 w-4 mr-2" />
                                            Details & Aktionen
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              ) : message.messageType === "document" ? (
                                <DeliveryNoteCard
                                  content={message.content}
                                  timestamp={messageDate}
                                  conversationId={selectedConversation || undefined}
                                />
                              ) : message.messageType === "delivery_status" ? (
                                (() => {
                                  let dsData: { type?: string; orderId?: string; orderNumber?: string; requestedDeliveryDate?: string | null; deliveryNotes?: string | null } = {};
                                  try { dsData = JSON.parse(message.content); } catch {}
                                  const orderRef = dsData.orderNumber || (dsData.orderId ? formatOrderNumber({ orderNumber: null, id: dsData.orderId }) : "");
                                  return (
                                    <div className="max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border border-purple-200 dark:border-purple-800/50 bg-white dark:bg-card shadow-sm overflow-hidden" data-testid={`delivery-status-${message.id}`}>
                                      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                                        <div className="flex items-center gap-2">
                                          <Truck className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                                          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                                            {t("inbox", "deliveryStatusMessage")}{orderRef ? ` #${orderRef}` : ""}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                      </div>
                                      <div className="px-4 py-2 space-y-1.5">
                                        <p className="text-sm font-medium">{t("inbox", "deliveryStatusInTransit")}</p>
                                        {dsData.requestedDeliveryDate && (
                                          <p className="text-xs text-muted-foreground">
                                            {t("inbox", "estimatedDelivery")}: {new Date(dsData.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                                          </p>
                                        )}
                                        {dsData.deliveryNotes && (
                                          <div className="mt-2 rounded-lg border border-purple-200/60 dark:border-purple-800/40 bg-purple-50/70 dark:bg-purple-950/20 px-2.5 py-1.5">
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
                                              {t("inbox", "supplierNote")}
                                            </p>
                                            <p className="text-xs text-foreground whitespace-pre-wrap mt-0.5" data-testid={`text-delivery-note-${message.id}`}>
                                              {dsData.deliveryNotes}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                      {dsData.orderId && (
                                        <div className="px-4 pb-3 pt-1">
                                          <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setLocation(`/supplier/orders/${dsData.orderId}`)} data-testid={`button-ds-details-${message.id}`}>
                                            <Eye className="h-3.5 w-3.5 mr-1" />
                                            {lang === "it" ? "Dettagli" : "Details"}
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              ) : message.messageType === "order_change_request" ? (
                                (() => {
                                  let changeData: { type?: string; orderId?: string; message?: string; reason?: string; approved?: boolean; items?: any[]; total?: string; status?: string; originalTotal?: string } = {};
                                  try { changeData = JSON.parse(message.content); } catch {}
                                  if (changeData.type === "partial_confirmation") {
                                    const pcData = changeData as { type?: string; orderId?: string; status?: string; message?: string; items?: { name: string; ordered: number; confirmed: number; rejected: number; price: string }[]; total?: string; originalTotal?: string };
                                    return (
                                      <div className="max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border bg-white dark:bg-card shadow-sm overflow-hidden border-border" data-testid={`partial-confirmation-${message.id}`}>
                                        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                                          <div className="flex items-center gap-2">
                                            <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                                            <span className="text-xs font-semibold text-orange-600">
                                              {pcData.status === "partially_confirmed"
                                                ? (lang === "it" ? "Parzialmente confermato" : "Teilbestatigt")
                                                : (lang === "it" ? "Confermato" : "Bestatigt")}
                                              {pcData.orderId ? ` #${(pcData as any).orderNumber || formatOrderNumber({orderNumber: null, id: pcData.orderId})}` : ""}
                                            </span>
                                          </div>
                                          <span className="text-xs text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                        </div>
                                        <div className="px-3 py-2 space-y-1.5">
                                          {pcData.orderId && (
                                            <p className="text-xs text-muted-foreground">
                                              {lang === "it" ? "Ordine" : "Bestellung"} #{(pcData as any).orderNumber || formatOrderNumber({orderNumber: null, id: pcData.orderId})}
                                            </p>
                                          )}
                                          {pcData.items?.map((item, idx) => (
                                            <div key={idx} className={`flex items-center justify-between gap-2 text-xs ${item.rejected > 0 ? "text-orange-700" : "text-foreground"}`}>
                                              <span className="truncate flex-1">{item.name}</span>
                                              <span className="shrink-0 ml-2">
                                                {item.confirmed}/{item.ordered}
                                                {item.rejected > 0 && (
                                                  <span className="text-red-500 ml-1">(-{item.rejected})</span>
                                                )}
                                              </span>
                                            </div>
                                          ))}
                                          {pcData.total && (
                                            <div className="flex items-center justify-between gap-2 text-xs font-semibold pt-1 border-t">
                                              <span>{lang === "it" ? "Totale" : "Gesamt"}</span>
                                              <span>{pcData.total}</span>
                                            </div>
                                          )}
                                        </div>
                                        {pcData.orderId && (
                                          <div className="px-4 pb-3 pt-1">
                                            <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setOrderDetailId(pcData.orderId!)} data-testid={`button-pc-details-${message.id}`}>
                                              <Eye className="h-3.5 w-3.5 mr-1" />
                                              {lang === "it" ? "Dettagli" : "Details"}
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  const isRequest = changeData.type === "change_request";
                                  const isResponse = changeData.type === "change_request_response";
                                  const isEdited = changeData.type === "order_edited";
                                  const hasBeenResponded = isRequest && messages.some(m =>
                                    m.messageType === "order_change_request" &&
                                    m.id !== message.id &&
                                    (() => { try { const d = JSON.parse(m.content); return d.type === "change_request_response" && d.orderId === changeData.orderId; } catch { return false; } })()
                                  );
                                  const isPendingRequest = isRequest && changeData.status === "pending" && !hasBeenResponded;
                                  const changeInactive = isResponse || isEdited || (isRequest && !isPendingRequest);
                                  const label = isEdited ? "Bestellung angepasst" : isResponse ? (changeData.approved ? "Änderung genehmigt" : "Änderung abgelehnt") : "Änderungsanfrage";
                                  if (changeInactive) {
                                    return (
                                      <div className="max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`inactive-change-${message.id}`}>
                                        <div className="flex items-center justify-between px-3 py-2 gap-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-xs text-muted-foreground truncate">{label}</span>
                                            {changeData.orderId && (
                                              <span className="text-[10px] text-muted-foreground shrink-0">#{(changeData as any).orderNumber || formatOrderNumber({orderNumber: null, id: changeData.orderId})}</span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[10px] text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                            {changeData.orderId && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2 text-[10px]"
                                                onClick={() => setOrderDetailId(changeData.orderId!)}
                                                data-testid={`button-change-details-${message.id}`}
                                              >
                                                <Eye className="h-3 w-3 mr-1" />
                                                Details
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border bg-white dark:bg-card shadow-sm overflow-hidden border-border">
                                      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                                        <div className="flex items-center gap-2">
                                          <Pencil className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{label} {changeData.orderId ? `#${(changeData as any).orderNumber || formatOrderNumber({orderNumber: null, id: changeData.orderId})}` : ""}</span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                      </div>
                                      <div className="px-4 py-2">
                                        <p className="text-sm">{changeData.message}</p>
                                        {isRequest && changeData.reason && (
                                          <p className="text-sm text-muted-foreground mt-1">Grund: {changeData.reason}</p>
                                        )}
                                      </div>
                                      {isPendingRequest && !isOwn && changeData.orderId && (
                                        <div className="px-4 pb-3 pt-1 flex gap-2">
                                          <Button
                                            variant="default"
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => changeRequestRespondMutation.mutate({ orderId: changeData.orderId!, approved: true })}
                                            disabled={changeRequestRespondMutation.isPending}
                                            data-testid={`button-approve-change-${message.id}`}
                                          >
                                            <CheckCircle className="h-4 w-4 mr-1.5" />
                                            Genehmigen
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => changeRequestRespondMutation.mutate({ orderId: changeData.orderId!, approved: false })}
                                            disabled={changeRequestRespondMutation.isPending}
                                            data-testid={`button-deny-change-${message.id}`}
                                          >
                                            <XCircle className="h-4 w-4 mr-1.5" />
                                            Ablehnen
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              ) : message.messageType === "attachment" ? (
                                <AttachmentMessageCard
                                  content={message.content}
                                  timestamp={format(messageDate, "HH:mm")}
                                  isOwn={isOwn}
                                  conversationId={selectedConversation || undefined}
                                  userId={currentUser?.id}
                                />
                              ) : message.messageType === "voice" && (message as any).audioUrl ? (
                                <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-3 py-2 shadow-sm ${isOwn ? "bg-secondary/30" : "bg-muted"}`} data-testid={`voice-bubble-${message.id}`}>
                                  <VoiceMessage
                                    src={(message as any).audioUrl}
                                    durationMs={(message as any).audioDurationMs}
                                    testId={`voice-${message.id}`}
                                  />
                                  <p className={`text-[10px] mt-1 ${isOwn ? "text-right" : "text-left"} text-muted-foreground`}>{format(messageDate, "HH:mm")}</p>
                                </div>
                              ) : (
                                (() => {
                                  let refData: { refType?: string; refId?: string; refLabel?: string; refPreview?: string; text?: string } | null = null;
                                  try {
                                    const parsed = JSON.parse(message.content);
                                    if (parsed.refType && parsed.text) refData = parsed;
                                  } catch {}
                                  const showSenderName = !prevMessage || prevMessage.senderId !== message.senderId || showDateDivider;
                                  const messagePreviewText = refData ? refData.text! : message.content;
                                  const senderName = isOwn ? (currentUser?.name || "") : (selectedConv.otherUser.name || "");
                                  const isImportant = message.priority === "important";
                                  return (
                                    <div className={`max-w-[85%] md:max-w-[70%] group/msg flex items-center gap-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                                      <div className="flex-1 min-w-0">
                                        {showSenderName && (
                                          <p className={`text-[11px] font-semibold mb-0.5 px-1 flex items-center gap-1 ${isOwn ? "justify-end" : ""} ${isImportant ? (isOwn ? "text-red-400" : "text-red-500") : (isOwn ? "text-secondary-foreground/70" : "text-indigo-600 dark:text-indigo-400")}`}>
                                            {isImportant && <Flame className="h-3 w-3 text-red-500" />}
                                            {senderName}
                                          </p>
                                        )}
                                        {!showSenderName && isImportant && (
                                          <div className={`flex items-center gap-1 mb-0.5 px-1 ${isOwn ? "justify-end" : ""}`}>
                                            <Flame className="h-3 w-3 text-red-500" />
                                          </div>
                                        )}
                                        <div className={`flex items-start gap-1.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                                        <div
                                          className={`rounded-lg px-3 py-2 shadow-lg ${
                                            isImportant
                                              ? "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-foreground"
                                              : isOwn
                                                ? "bg-secondary text-secondary-foreground"
                                                : "bg-muted"
                                          }`}
                                        >
                                          {refData && refData.refType === "reply" && (
                                            <div
                                              className={`mb-1.5 rounded-md px-2.5 py-1.5 border-l-3 cursor-pointer hover:opacity-80 transition-opacity ${
                                                isOwn
                                                  ? "bg-secondary-foreground/10 border-secondary-foreground/40"
                                                  : "bg-background/60 border-primary/50"
                                              }`}
                                              onClick={() => {
                                                if (refData.refId) {
                                                  const target = document.querySelector(`[data-testid="message-${refData.refId}"]`);
                                                  if (target) {
                                                    target.scrollIntoView({ behavior: "smooth", block: "center" });
                                                    target.classList.add("highlight-message");
                                                    setTimeout(() => target.classList.remove("highlight-message"), 2000);
                                                  }
                                                }
                                              }}
                                              data-testid={`ref-link-${message.id}`}
                                            >
                                              <p className={`text-[11px] font-semibold ${isOwn ? "text-secondary-foreground/80" : "text-indigo-600 dark:text-indigo-400"}`}>
                                                {refData.refLabel}
                                              </p>
                                              <p className={`text-[11px] truncate ${isOwn ? "text-secondary-foreground/60" : "text-muted-foreground"}`}>
                                                {refData.refPreview}
                                              </p>
                                            </div>
                                          )}
                                          {refData && refData.refType !== "reply" && (
                                            <div
                                              className={`mb-1.5 rounded-md px-2.5 py-1.5 border-l-3 cursor-pointer hover:opacity-80 transition-opacity ${
                                                isOwn
                                                  ? "bg-secondary-foreground/10 border-secondary-foreground/40"
                                                  : "bg-background/60 border-primary/50"
                                              }`}
                                              onClick={() => {
                                                if (refData.refType === "order" && refData.refId) {
                                                  const target = document.querySelector(`[data-order-id="${refData.refId}"]`);
                                                  if (target) {
                                                    target.scrollIntoView({ behavior: "smooth", block: "center" });
                                                    target.classList.add("highlight-message");
                                                    setTimeout(() => target.classList.remove("highlight-message"), 2000);
                                                  }
                                                }
                                              }}
                                              data-testid={`ref-link-${message.id}`}
                                            >
                                              <div className="flex items-center gap-1.5">
                                                {refData.refType === "order" ? (
                                                  <ShoppingBag className={`h-3 w-3 shrink-0 ${isOwn ? "text-secondary-foreground/70" : "text-primary"}`} />
                                                ) : (
                                                  <AlertCircle className={`h-3 w-3 shrink-0 ${isOwn ? "text-secondary-foreground/70" : "text-primary"}`} />
                                                )}
                                                <span className={`text-[11px] font-medium truncate ${isOwn ? "text-secondary-foreground/80" : "text-foreground/80"}`}>
                                                  {refData.refLabel || (refData.refType === "order" ? ((lang === "de" ? "Bestellung" : "Ordine") + (refData.refId ? ` #${formatOrderNumber({orderNumber: null, id: refData.refId})}` : "")) : ((lang === "de" ? "Reklamation" : "Reclamo") + (refData.refId ? ` #${formatComplaintNumber({complaintNumber: null, id: refData.refId})}` : "")))}
                                                </span>
                                              </div>
                                            </div>
                                          )}
                                          <p className="text-sm">{refData ? refData.text : message.content}</p>
                                          <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                                            <span className={`text-[10px] ${isImportant ? "text-muted-foreground" : isOwn ? "text-secondary-foreground/70" : "text-muted-foreground"}`}>
                                              {format(messageDate, "HH:mm")}
                                            </span>
                                            {isOwn && (
                                              message.isRead 
                                                ? <CheckCheck className={`h-3 w-3 ${newlyReadIds.has(message.id) ? "animate-read-receipt" : ""} ${isImportant ? "text-muted-foreground" : "text-secondary-foreground/70"}`} />
                                                : <Check className={`h-3 w-3 ${isImportant ? "text-muted-foreground" : "text-secondary-foreground/70"}`} />
                                            )}
                                          </div>
                                        </div>
                                        </div>
                                      </div>
                                      <button
                                        className="shrink-0 opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-full hover:bg-muted/80 text-muted-foreground"
                                        onClick={() => {
                                          setReplyToMessage({
                                            id: message.id,
                                            senderName: senderName,
                                            preview: messagePreviewText.length > 80 ? messagePreviewText.slice(0, 80) + "..." : messagePreviewText,
                                          });
                                          const input = document.querySelector('[data-testid="input-message"]') as HTMLInputElement;
                                          input?.focus();
                                        }}
                                        data-testid={`button-reply-${message.id}`}
                                      >
                                        <Reply className="h-4 w-4" />
                                      </button>
                                    </div>
                                  );
                                })()
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
                      <p className="text-sm text-muted-foreground">Keine Nachrichten</p>
                      <p className="text-xs text-muted-foreground mt-1">Schreiben Sie eine Nachricht um die Konversation zu starten</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-border p-2 md:p-4 md:rounded-none md:shadow-none md:border-t md:border-x-0 md:mb-0 md:mx-0 floating-message-bar mobile-message-pill">
                  {replyToMessage && (
                    <div className="flex items-center gap-2 mb-3 px-1" data-testid="attached-reply-ref">
                      <div className="flex-1 min-w-0 bg-muted/60 border-l-3 border-secondary rounded-md px-3 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-secondary-foreground truncate">{replyToMessage.senderName}</p>
                            <p className="text-xs text-muted-foreground truncate">{replyToMessage.preview}</p>
                          </div>
                          <button
                            onClick={() => setReplyToMessage(null)}
                            className="shrink-0 hover:text-destructive transition-colors text-muted-foreground"
                            data-testid="button-remove-reply-ref"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {attachedOrderRef && (
                    <div className="flex items-center gap-2 mb-3 px-1" data-testid="attached-order-ref">
                      <div className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-medium">
                        <ShoppingBag className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">{attachedOrderRef.label}</span>
                        <button
                          onClick={() => setAttachedOrderRef(null)}
                          className="ml-1 hover:text-destructive transition-colors"
                          data-testid="button-remove-order-ref"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                  {attachedComplaintRef && (
                    <div className="flex items-center gap-2 mb-3 px-1" data-testid="attached-complaint-ref">
                      <div className="flex items-center gap-1.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-full px-3 py-1 text-xs font-medium">
                        <AlertCircle className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">{attachedComplaintRef.label}</span>
                        <button
                          onClick={() => setAttachedComplaintRef(null)}
                          className="ml-1 hover:text-destructive transition-colors"
                          data-testid="button-remove-complaint-ref"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                  {!messageText && !replyToMessage && !attachedOrderRef && !attachedComplaintRef && quickReplySuggestions.length > 0 && (
                    <QuickReplyChips
                      suggestions={quickReplySuggestions}
                      onPick={(s) => {
                        if (!selectedConversation) return;
                        sendMessageMutation.mutate({ content: s, messageType: "text", priority: messagePriority });
                      }}
                      testIdPrefix="supplier-quick-reply"
                    />
                  )}
                  {messagePriority === "important" && (
                    <div className="flex items-center justify-between gap-2 mb-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" data-testid="priority-important-banner">
                      <div className="flex items-center gap-1.5">
                        <Flame className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400">{lang === "de" ? "Dringend" : "Urgente"}</span>
                      </div>
                      <button
                        onClick={() => setMessagePriority("standard")}
                        className="shrink-0 hover:text-destructive transition-colors text-muted-foreground"
                        data-testid="button-remove-priority"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2 items-center">
                    <Popover open={priorityPopoverOpen} onOpenChange={setPriorityPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-full shrink-0" data-testid="button-delivery-options">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">{lang === "de" ? "Zustelloptionen" : "Opzioni di consegna"}</p>
                        <button
                          className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors ${messagePriority === "standard" ? "bg-muted" : "hover:bg-muted/50"}`}
                          onClick={() => { setMessagePriority("standard"); setPriorityPopoverOpen(false); }}
                          data-testid="button-priority-standard"
                        >
                          <div className="h-8 w-8 rounded-full bg-muted-foreground/10 flex items-center justify-center shrink-0">
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">Standard</p>
                            <p className="text-xs text-muted-foreground">{lang === "de" ? "Nachricht wird normal gesendet" : "Il messaggio verra inviato normalmente"}</p>
                          </div>
                          {messagePriority === "standard" && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                        <button
                          className={`w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors ${messagePriority === "important" ? "bg-muted" : "hover:bg-muted/50"}`}
                          onClick={() => { setMessagePriority("important"); setPriorityPopoverOpen(false); }}
                          data-testid="button-priority-important"
                        >
                          <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                            <Flame className="h-4 w-4 text-red-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">{lang === "de" ? "Dringend" : "Urgente"}</p>
                            <p className="text-xs text-muted-foreground">{lang === "de" ? "Nachricht wird als wichtig markiert" : "Il messaggio sara contrassegnato come importante"}</p>
                          </div>
                          {messagePriority === "important" && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      </PopoverContent>
                    </Popover>
                    {selectedConversation && currentUser && (
                      <AttachmentPopover
                        conversationId={selectedConversation}
                        senderId={currentUser.id}
                        onSendAttachment={handleSendAttachment}
                        disabled={sendMessageMutation.isPending}
                      />
                    )}
                    <Input
                      ref={messageInputRef}
                      placeholder="Nachricht schreiben..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="text-sm rounded-full min-h-12 md:min-h-10"
                      data-testid="input-message"
                    />
                    {!messageText.trim() ? (
                      <VoiceRecorder onSend={handleSendVoice} isSending={isUploadingVoice || sendMessageMutation.isPending} lang={lang as "de" | "it"} />
                    ) : (
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={handleSendMessage}
                        disabled={!messageText.trim() || sendMessageMutation.isPending}
                        className="rounded-full shrink-0 h-12 w-12 md:h-10 md:w-10"
                        data-testid="button-send-message"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col">
                {selectedConversation && (
                  <div className="md:hidden border-b border-border px-3 py-3 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={handleBackToList}
                      data-testid="button-back-to-list-empty"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-lg font-medium">Wählen Sie eine Konversation</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Wählen Sie einen Betrieb aus der Liste
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={!!orderDetailId} onOpenChange={(open) => { if (!open) { setOrderDetailId(null); setShowCancelOrderConfirm(false); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0" aria-describedby={undefined}>
          <DialogHeader className="sr-only"><DialogTitle>{lang === "de" ? "Bestelldetails" : "Dettagli ordine"}</DialogTitle></DialogHeader>
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{lang === "de" ? "Bestellung" : "Ordine"}</p>
                <h2 className="text-lg font-semibold tracking-tight" data-testid="text-order-id">#{formatOrderNumber(orderDetail)}</h2>
              </div>
              {orderDetail && (
                <Badge className={`${getStatusColor(orderDetail.status)} text-xs`} variant="outline" data-testid="badge-order-status">
                  {getStatusLabel(orderDetail.status)}
                </Badge>
              )}
            </div>
          </div>
          {orderDetail && (
            <div className="px-6 pb-6 space-y-5">
              {orderDetail.status !== "delivered" && orderDetail.status !== "cancelled" && (
                <div className="flex flex-wrap gap-2">
                  {orderDetail.status === "pending" && (
                    <Button size="sm" className="rounded-lg" onClick={() => { setOrderDetailId(null); setConfirmOrderForDialog(orderDetail); }} data-testid="button-status-confirmed">
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      {lang === "it" ? "Conferma" : "Bestätigen"}
                    </Button>
                  )}
                  {(orderDetail.status === "confirmed" || orderDetail.status === "partially_confirmed") && (
                    <Button size="sm" className="rounded-lg" onClick={() => updateOrderStatusMutation.mutate({ orderId: orderDetail.id, status: "in_delivery" })} disabled={updateOrderStatusMutation.isPending} data-testid="button-status-in_delivery">
                      <Truck className="h-3.5 w-3.5 mr-1" />
                      {lang === "it" ? "In consegna" : "In Lieferung"}
                    </Button>
                  )}
                  {orderDetail.status === "in_delivery" && (
                    <Button size="sm" className="rounded-lg" onClick={() => updateOrderStatusMutation.mutate({ orderId: orderDetail.id, status: "delivered" })} disabled={updateOrderStatusMutation.isPending} data-testid="button-status-delivered">
                      <Package className="h-3.5 w-3.5 mr-1" />
                      {lang === "de" ? "Geliefert" : "Consegnato"}
                    </Button>
                  )}
                  {orderDetail.status !== "in_delivery" && !showCancelOrderConfirm && (
                    <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setShowCancelOrderConfirm(true)} disabled={updateOrderStatusMutation.isPending} data-testid="button-status-cancelled">
                      <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                      {lang === "it" ? "Annulla" : "Stornieren"}
                    </Button>
                  )}
                  {showCancelOrderConfirm && (
                    <div className="p-3 rounded-xl border border-destructive/20 space-y-2 col-span-full">
                      <p className="text-sm font-medium text-destructive">
                        {lang === "de" ? "Bestellung wirklich stornieren?" : "Annullare davvero l'ordine?"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lang === "de"
                          ? "Diese Aktion kann nicht rückgängig gemacht werden."
                          : "Questa azione non può essere annullata."}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 rounded-lg" onClick={() => setShowCancelOrderConfirm(false)} data-testid="button-cancel-order-abort">
                          {lang === "de" ? "Abbrechen" : "Annulla"}
                        </Button>
                        <Button variant="destructive" size="sm" className="flex-1 rounded-lg" onClick={() => { updateOrderStatusMutation.mutate({ orderId: orderDetail.id, status: "cancelled" }); setShowCancelOrderConfirm(false); }} disabled={updateOrderStatusMutation.isPending} data-testid="button-cancel-order-confirm">
                          {lang === "de" ? "Ja, stornieren" : "Sì, annulla"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {orderDetail.status !== "cancelled" && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">
                      {lang === "it" ? "Correggi stato" : "Status korrigieren"}
                    </p>
                  </div>
                  <Select
                    onValueChange={(value) => {
                      if (value && value !== orderDetail.status) {
                        updateOrderStatusMutation.mutate({ orderId: orderDetail.id, status: value });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-status-correction">
                      <SelectValue placeholder={lang === "it" ? "Seleziona stato..." : "Status wählen..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"]
                        .filter(s => s !== orderDetail.status)
                        .map(s => (
                          <SelectItem key={s} value={s} data-testid={`select-correction-${s}`}>
                            {getStatusLabel(s)}
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                </div>
              )}

              {orderDetail.restaurant && (
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={orderDetail.restaurant.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
                      {orderDetail.restaurant.companyName?.substring(0, 2).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-sm">{orderDetail.restaurant.companyName || t("common", "restaurant")}</div>
                    <div className="text-xs text-muted-foreground">{t("common", "restaurant")}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">{lang === "de" ? "Erstellt am" : "Creato il"}</div>
                  <div className="text-sm font-medium">{format(new Date(orderDetail.createdAt), "dd.MM.yyyy", { locale: de })}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(orderDetail.createdAt), "HH:mm", { locale: de })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">{lang === "de" ? "Letzte Änderung" : "Ultima modifica"}</div>
                  <div className="text-sm font-medium">{format(new Date(orderDetail.updatedAt), "dd.MM.yyyy", { locale: de })}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(orderDetail.updatedAt), "HH:mm", { locale: de })}</div>
                </div>
              </div>
              {orderDetail.createdByUser && (
                <div className="flex items-center gap-2" data-testid="detail-created-by">
                  <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">{t("orders", "createdBy")}</div>
                    <div className="text-sm font-medium">{orderDetail.createdByUser.name}</div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {lang === "de" ? "Statusverlauf" : "Cronologia stato"}
                </h4>
                <StatusTimeline
                  history={orderStatusHistory || []}
                  type="order"
                  createdAt={orderDetail.createdAt}
                  currentStatus={orderDetail.status}
                />
              </div>

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  {lang === "de" ? "Produkte" : "Prodotti"} ({orderDetail.items.length})
                </h4>
                <div className="rounded-xl border overflow-hidden">
                  {orderDetail.items.map((item: any, idx: number) => (
                    <div key={item.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${idx < orderDetail.items.length - 1 ? "border-b" : ""}`} data-testid={`order-item-${item.id}`}>
                      <ProductImage src={item.productImageUrl} className="h-8 w-8 rounded-lg" iconClassName="h-4 w-4" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} x {parseFloat(item.unitPrice).toFixed(2)}€
                        </p>
                        {item.confirmedQuantity != null && item.confirmedQuantity < item.quantity && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="h-3 w-3 text-orange-500" />
                            <span className="text-[10px] text-orange-600">
                              {lang === "it" ? "Confermato" : "Bestätigt"}: {item.confirmedQuantity}/{item.quantity}
                              {item.rejectedQuantity > 0 && (
                                <span className="text-red-500 ml-1">(-{item.rejectedQuantity})</span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-semibold whitespace-nowrap">{parseFloat(item.totalPrice).toFixed(2)}€</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center gap-2 px-3 py-3 border-t bg-muted/30">
                    <span className="text-sm font-bold">{lang === "it" ? "Totale" : "Gesamtbetrag"}</span>
                    <span className="text-base font-bold">{parseFloat(orderDetail.totalAmount).toFixed(2)}€</span>
                  </div>
                </div>
              </div>

              {orderDetail.notes && (
                <div>
                  <h4 className="font-medium mb-2 text-sm text-muted-foreground">{lang === "de" ? "Notizen" : "Note"}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{orderDetail.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showComplaintDetail} onOpenChange={(open) => {
        setShowComplaintDetail(open);
        if (!open) {
          setSelectedComplaintId(null);
          setLoadingComplaintDetail(false);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0" aria-describedby={undefined}>
          <DialogHeader className="sr-only"><DialogTitle>{lang === "de" ? "Reklamationsdetails" : "Dettagli reclamo"}</DialogTitle></DialogHeader>
          {(loadingComplaintDetail || isLoadingComplaintDetail) ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : isComplaintDetailError ? (
            <div className="text-center py-12 px-6 text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 mb-2 text-destructive" />
              <p className="text-sm font-medium text-destructive">{lang === "de" ? "Fehler beim Laden" : "Errore di caricamento"}</p>
              <p className="text-xs text-muted-foreground mt-1">{lang === "de" ? "Die Reklamation konnte nicht geladen werden." : "Impossibile caricare il reclamo."}</p>
            </div>
          ) : complaintDetail ? (
            <>
              <div className="px-6 pt-6 pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">{lang === "de" ? "Reklamation" : "Reclamo"}</p>
                    <h2 className="text-lg font-semibold tracking-tight" data-testid="text-complaint-id">#{formatComplaintNumber(complaintDetail)}</h2>
                  </div>
                  {(() => {
                    const statusInfo = formatComplaintStatus(complaintDetail.status);
                    const StatusIcon = statusInfo.icon;
                    return (
                      <Badge variant={statusInfo.variant} className="flex items-center gap-1" data-testid="badge-complaint-status">
                        <StatusIcon className="h-3 w-3" />
                        {statusInfo.label}
                      </Badge>
                    );
                  })()}
                </div>
              </div>

              <div className="px-6 pb-6 space-y-5">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={complaintDetail.restaurant?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
                      {complaintDetail.restaurant?.companyName?.substring(0, 2).toUpperCase() || "??"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-sm">{complaintDetail.restaurant?.companyName || (lang === "de" ? "Unbekannt" : "Sconosciuto")}</div>
                    <div className="text-xs text-muted-foreground">{complaintDetail.restaurant?.email}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">{lang === "de" ? "Erstellt am" : "Creato il"}</div>
                    <div className="text-sm font-medium">{format(new Date(complaintDetail.createdAt), "dd.MM.yyyy", { locale: de })}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(complaintDetail.createdAt), "HH:mm", { locale: de })}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">{lang === "de" ? "Letzte Änderung" : "Ultima modifica"}</div>
                    <div className="text-sm font-medium">{format(new Date(complaintDetail.updatedAt), "dd.MM.yyyy", { locale: de })}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(complaintDetail.updatedAt), "HH:mm", { locale: de })}</div>
                  </div>
                </div>

                <div>
                  {(complaintDetail as any).priority === "urgent" && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 mb-2">
                      <Flame className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                        {lang === "de" ? "Dringende Reklamation" : "Reclamo urgente"}
                      </span>
                    </div>
                  )}
                  <h4 className="font-semibold text-base mb-2" data-testid="text-complaint-title">{complaintDetail.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap" data-testid="text-complaint-description">{complaintDetail.description}</p>

                  {complaintDetail.affectedItems && (() => {
                    try {
                      const items = JSON.parse(complaintDetail.affectedItems);
                      if (Array.isArray(items) && items.length > 0) {
                        return (
                          <div className="mt-3 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
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
                </div>

                {complaintDetail.mediaUrls && complaintDetail.mediaUrls.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2 text-muted-foreground">{lang === "de" ? "Anhänge" : "Allegati"}</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {complaintDetail.mediaUrls.map((url, idx) => (
                        <a 
                          key={idx} 
                          href={getMediaSrc(url)}
                          rel="noopener noreferrer"
                          className="block aspect-square rounded-xl overflow-hidden border hover-elevate"
                        >
                          {isVideoFile(url) ? (
                            <div className="h-full w-full flex items-center justify-center bg-muted">
                              <FileVideo className="h-6 w-6 text-muted-foreground" />
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
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">{lang === "de" ? "Betroffene Bestellung" : "Ordine interessato"}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{complaintDetail.order ? formatOrderNumber(complaintDetail.order) : formatOrderNumber({orderNumber: null, id: complaintDetail.orderId})}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {complaintDetail.order?.totalAmount ? parseFloat(complaintDetail.order.totalAmount).toFixed(2) : "0.00"}€
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {lang === "de" ? "Statusverlauf" : "Cronologia stato"}
                  </h4>
                  <StatusTimeline
                    history={complaintStatusHistoryData || []}
                    type="complaint"
                    createdAt={complaintDetail.createdAt}
                    currentStatus={complaintDetail.status}
                  />
                </div>

                <div>
                  <h4 className="font-medium text-sm mb-3 flex items-center gap-2 text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {lang === "de" ? "Kommentare" : "Commenti"} ({complaintComments?.length || 0})
                  </h4>
                  {loadingComments ? (
                    <div className="space-y-3">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : complaintComments && complaintComments.length > 0 ? (
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {complaintComments.map((comment) => (
                        <div key={comment.id} className="p-3 rounded-xl bg-muted/20" data-testid={`comment-${comment.id}`}>
                          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={comment.user?.profileImageUrl || undefined} />
                                <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                                  {comment.user?.companyName?.substring(0, 2).toUpperCase() || comment.user?.name?.substring(0, 2).toUpperCase() || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium">{comment.user?.companyName || comment.user?.name || (lang === "de" ? "Unbekannt" : "Sconosciuto")}</span>
                              <Badge variant="outline" className="text-xs">
                                {comment.user?.role === "supplier" ? t("common", "supplier") : t("common", "restaurant")}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(comment.createdAt), "dd.MM. HH:mm", { locale: de })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground ml-8">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">{lang === "de" ? "Noch keine Kommentare vorhanden" : "Nessun commento ancora"}</p>
                  )}
                </div>

                {complaintDetail.status !== "closed" && complaintDetail.status !== "resolved" && (
                  <div className="space-y-2 pt-2">
                    <Label className="text-sm">{lang === "de" ? "Kommentar hinzufügen" : "Aggiungi commento"}</Label>
                    <div className="flex gap-2">
                      <Textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder={lang === "de" ? "Schreiben Sie einen Kommentar..." : "Scrivi un commento..."}
                        rows={2}
                        className="flex-1"
                        data-testid="input-supplier-complaint-comment"
                      />
                      <Button
                        size="icon"
                        onClick={() => selectedComplaintId && addComplaintCommentMutation.mutate({ complaintId: selectedComplaintId, content: newComment.trim() })}
                        disabled={!newComment.trim() || addComplaintCommentMutation.isPending}
                        data-testid="button-supplier-send-complaint-comment"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="text-foreground rounded-xl truncate"
                    onClick={openComplaintStatusDialog}
                    data-testid="button-change-complaint-status"
                  >
                    <Settings className="h-4 w-4 mr-2 shrink-0" />
                    <span className="truncate">{lang === "de" ? "Status ändern" : "Cambia stato"}</span>
                  </Button>
                  {complaintDetail.affectedItems && complaintDetail.status !== "closed" && complaintDetail.status !== "resolved" && (() => {
                    try {
                      const items = JSON.parse(complaintDetail.affectedItems);
                      return Array.isArray(items) && items.length > 0;
                    } catch { return false; }
                  })() && (
                    <Button
                      variant="outline"
                      className="text-foreground rounded-xl truncate"
                      onClick={openFollowUpDialog}
                      data-testid="button-create-follow-up-order"
                    >
                      <Truck className="h-4 w-4 mr-2 shrink-0" />
                      <span className="truncate">{lang === "de" ? "Nachlieferung erstellen" : "Crea riconsegna"}</span>
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-6 text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">{lang === "de" ? "Reklamation nicht gefunden" : "Reclamo non trovato"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Complaint Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>Status ändern</DialogTitle>
          </DialogHeader>
          
          <div className="px-5 pt-5 pb-2">
            <h3 className="text-sm font-semibold">Status ändern</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Wählen Sie den neuen Status für diese Reklamation</p>
          </div>

          <div className="px-5 pb-5 space-y-3">
            {complaintDetail && (
              <>
                <div className="p-3 rounded-xl bg-muted/30">
                  <div className="font-medium text-sm">{complaintDetail.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {complaintDetail.restaurant?.companyName}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {complaintDetail.status === "open" && (
                    <>
                      <Button size="sm" className="rounded-lg" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "in_progress" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-in_progress">
                        <Loader2 className="h-3.5 w-3.5 mr-1" />
                        In Bearbeitung
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "closed" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-closed">
                        <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                        Schließen
                      </Button>
                    </>
                  )}
                  {complaintDetail.status === "in_progress" && (
                    <>
                      <Button size="sm" className="rounded-lg" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "resolved" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-resolved">
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />
                        Gelöst
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "closed" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-closed">
                        <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                        Schließen
                      </Button>
                    </>
                  )}
                  {complaintDetail.status === "resolved" && (
                    <>
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "closed" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-closed">
                        <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                        Schließen
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "open" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-open">
                        <Clock className="h-3.5 w-3.5 mr-1" />
                        Wieder öffnen
                      </Button>
                    </>
                  )}
                  {complaintDetail.status === "closed" && (
                    <Button size="sm" variant="outline" className="rounded-lg" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "open" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-open">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      Wieder öffnen
                    </Button>
                  )}
                </div>
              </>
            )}

            <Button
              variant="outline"
              className="w-full rounded-lg"
              onClick={() => setShowStatusDialog(false)}
            >
              Abbrechen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Complaint Comment Dialog */}
      <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>Kommentare</DialogTitle>
          </DialogHeader>
          
          <div className="px-5 pt-5 pb-2">
            <h3 className="text-sm font-semibold">Kommentare</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Kommentare zur Reklamation anzeigen und hinzufügen</p>
          </div>

          {complaintDetail && (
            <div className="flex flex-col flex-1 min-h-0 space-y-4 px-5 pb-5">
              <div className="p-3 rounded-xl bg-muted/30 shrink-0">
                <div className="font-medium text-sm">{complaintDetail.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {complaintDetail.restaurant?.companyName}
                </div>
              </div>

              {/* Existing comments */}
              <div className="flex-1 overflow-auto space-y-3 min-h-0 max-h-60">
                {loadingComments ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
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
                        <span className="text-sm font-medium">{comment.user?.name || "Unbekannt"}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {format(new Date(comment.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground pl-8">{comment.content}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">Noch keine Kommentare</p>
                  </div>
                )}
              </div>

              {/* Add comment */}
              <div className="space-y-2 shrink-0 border-t pt-4">
                <Label>Neuer Kommentar</Label>
                <div className="flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Schreiben Sie einen Kommentar..."
                    rows={2}
                    className="flex-1"
                    data-testid="input-inbox-new-comment"
                  />
                  <Button
                    size="icon"
                    onClick={handleComplaintCommentSubmit}
                    disabled={!newComment.trim() || addComplaintCommentMutation.isPending}
                    data-testid="button-inbox-send-comment"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DeliveryDatePicker
        open={!!deliveryDatePicker}
        onOpenChange={(open) => { if (!open) { setDeliveryDatePicker(null); setCardWizard(null); } }}
        supplierId={currentUser?.id || ""}
        restaurantId={deliveryDatePicker?.restaurantId || ""}
        isPending={updateOrderStatusMutation.isPending}
        onConfirm={(date, deliveryNotes) => {
          if (deliveryDatePicker) {
            if (cardWizard?.action === "in_delivery") {
              updateOrderStatusMutation.mutate(
                { orderId: deliveryDatePicker.orderId, status: "in_delivery", requestedDeliveryDate: date, deliveryNotes },
                { onSuccess: () => { setDeliveryDatePicker(null); setCardWizard(null); } }
              );
            } else {
              apiRequest("PATCH", `/api/orders/${deliveryDatePicker.orderId}/reschedule`, { requestedDeliveryDate: date })
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
                  queryClient.invalidateQueries({ queryKey: ['/api/supplier/upcoming-deliveries'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
                  setDeliveryDatePicker(null);
                  setCardWizard(null);
                  toast({ title: lang === "de" ? "Lieferdatum gesetzt" : "Data di consegna impostata" });
                })
                .catch(() => {
                  setDeliveryDatePicker(null);
                  toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
                });
            }
          }
        }}
      />

      {confirmOrderForDialog && (
        <PartialConfirmationDialog
          order={confirmOrderForDialog}
          open={!!confirmOrderForDialog}
          onOpenChange={(open) => { if (!open) setConfirmOrderForDialog(null); }}
          lang={lang}
          currentUserId={currentUser?.id}
          onSuccess={() => {
            setConfirmOrderForDialog(null);
            if (selectedConversation) {
              queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
            }
          }}
        />
      )}

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

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-lg" onClick={() => setShowFollowUpDialog(false)}>
              {lang === "de" ? "Abbrechen" : "Annulla"}
            </Button>
            <Button
              className="flex-1 rounded-lg"
              onClick={() => {
                if (selectedComplaintId && followUpDeliveryDate && followUpItems.length > 0) {
                  followUpOrderMutation.mutate({
                    complaintId: selectedComplaintId,
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

      <Dialog open={!!rejectComplaintId} onOpenChange={(open) => { if (!open) { setRejectComplaintId(null); setRejectReasonText(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{lang === "de" ? "Reklamation ablehnen" : "Rifiuta reclamo"}</DialogTitle>
            <DialogDescription>
              {lang === "de" ? "Bitte begründen Sie die Ablehnung. Diese Information wird im Chat geteilt." : "Indica il motivo del rifiuto. Verrà condiviso in chat."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReasonText}
            onChange={(e) => setRejectReasonText(e.target.value)}
            placeholder={lang === "de" ? "Ablehnungsgrund (Pflichtfeld)" : "Motivo del rifiuto (obbligatorio)"}
            className="min-h-[100px] rounded-lg"
            data-testid="input-quick-reject-reason"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRejectComplaintId(null); setRejectReasonText(""); }} data-testid="button-quick-reject-cancel">
              {lang === "de" ? "Abbrechen" : "Annulla"}
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReasonText.trim() || quickStatusUpdateMutation.isPending}
              onClick={() => {
                if (rejectComplaintId && rejectReasonText.trim()) {
                  quickStatusUpdateMutation.mutate(
                    { id: rejectComplaintId, status: "rejected", rejectionReason: rejectReasonText.trim() },
                    { onSuccess: () => { setRejectComplaintId(null); setRejectReasonText(""); } }
                  );
                }
              }}
              data-testid="button-quick-reject-confirm"
            >
              {lang === "de" ? "Ablehnen" : "Rifiuta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
