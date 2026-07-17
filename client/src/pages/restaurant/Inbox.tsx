import { searchIncludes } from "@shared/searchText";
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useUser } from "@/context/UserContext";
import { useChat } from "@/context/ChatContext";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Send, MessageSquare, Search, Check, CheckCheck, Plus, ShoppingCart, ShoppingBag, X, Package, Phone, ClipboardList, Eye, AlertCircle, AlertTriangle, ArrowLeft, Settings, Clock, Loader2, CheckCircle, XCircle, FileText, Download, Paperclip, Pencil, Truck, Trash2, CalendarDays, Zap, PackagePlus, Tag, Calendar, Reply, User as UserIcon, ChevronDown, ChevronUp, CircleAlert, RefreshCw, Mic, Pin, PinOff } from "lucide-react";
import { QuickReplyChips } from "@/components/chat/QuickReplyChips";
import SwipeToReply from "@/components/SwipeToReply";
import { getMessageReplyPreview } from "@/lib/messageReplyPreview";
import { VoiceRecorder } from "@/components/chat/VoiceRecorder";
import { VoiceMessage } from "@/components/chat/VoiceMessage";
import { useUpload } from "@/hooks/use-upload";
import { AttachmentPopover, AttachmentMessageCard, ChatDropZone } from "@/components/ChatAttachment";
import { DeliveryNoteCard } from "@/components/DeliveryNoteCard";
import { StatusTimeline } from "@/components/StatusTimeline";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatOrderNumber, formatComplaintNumber, type ConversationWithUser, type Message, type MessageWithOrderNumber, type Product, type Order, type ComplaintWithDetails, type ComplaintCommentWithUser, type OrderStatusHistoryWithUser, type ComplaintStatusHistoryWithUser, type DeliverySchedule } from "@shared/schema";
import { format, isToday, isYesterday, isSameDay, addDays, startOfDay } from "date-fns";
import { de, it } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProductDetailDialog from "@/components/ProductDetailDialog";
import QuantityInput from "@/components/QuantityInput";
import OnlineStatus from "@/components/OnlineStatus";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus, getComplaintStatus } from "@/lib/translations";
import SwipeableRow from "@/components/SwipeableRow";
import StaggeredList from "@/components/StaggeredList";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { ProductImage } from "@/components/ProductImage";
import { WhatsappInboxCard } from "@/components/WhatsappInboxCard";
import { HeroPortal } from "@/context/HeroContext";

type ActionMode = "none" | "order" | "complaint";

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

interface ComplaintContent {
  title: string;
  description: string;
  orderId: string;
  complaintId?: string;
  affectedItems?: AffectedItem[];
}

const parseOrderContent = (content: string): OrderContent | null => {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
};

const getComplaintMediaSrc = (url: string) => {
  if (url.startsWith("/objects/")) return url;
  if (url.startsWith("http")) return url;
  return `/objects/${url}`;
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
    case "scheduled": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400";
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
    case "scheduled": return "Geplant";
    case "in_delivery": return "Unterwegs";
    case "delivered": return "Geliefert";
    case "cancelled": return "Storniert";
    default: return status;
  }
};

import { getComplaintReasonLabel } from "@/lib/complaintReasons";
import { COMPLAINT_REASONS, dateChangeReasonLabel, type ComplaintReason } from "@shared/schema";
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

const formatDateDivider = (date: Date, lang: string = "de") => {
  if (isToday(date)) return lang === "it" ? "Oggi" : "Heute";
  if (isYesterday(date)) return lang === "it" ? "Ieri" : "Gestern";
  return format(date, "dd. MMMM yyyy", { locale: lang === "it" ? it : de });
};

interface OrderWithDetails extends Order {
  items: { id: string; productName: string; quantity: number; unitPrice: string; totalPrice: string; productId?: string }[];
  restaurant?: { companyName: string; profileImageUrl?: string | null };
  supplier?: { companyName: string; profileImageUrl?: string | null };
  createdByUser?: { name?: string | null } | null;
}

interface EditableItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export default function RestaurantInbox() {
  const { currentUser, currentMember } = useUser();
  const { setIsInChat } = useChat();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateLocale = lang === "it" ? it : de;
  useHeartbeat(currentUser?.id);
  const [location, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { containerRef: pullRefreshRef, pullDistance, isRefreshing, progress: pullProgress } = usePullToRefresh({
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    },
  });
  const [actionMode, setActionMode] = useState<ActionMode>("none");
  const [inboxDetailProduct, setInboxDetailProduct] = useState<any>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [openActionsPopover, setOpenActionsPopover] = useState(false);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderCategoryFilter, setOrderCategoryFilter] = useState<string>("all");
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const orderCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orderDetailId, setOrderDetailId] = useState<string | null>(null);
  const [cardWizard, setCardWizard] = useState<{ orderId: string; action: string; reason?: string } | null>(null);
  const [editingOrderInbox, setEditingOrderInbox] = useState<OrderWithDetails | null>(null);
  const [editItemsInbox, setEditItemsInbox] = useState<EditableItem[]>([]);
  const [editProductSearchInbox, setEditProductSearchInbox] = useState("");
  const [editDeliveryOptionInbox, setEditDeliveryOptionInbox] = useState<"asap" | "date">("asap");
  const [editSelectedDeliveryDateInbox, setEditSelectedDeliveryDateInbox] = useState<string>("");
  const [complaintOrderId, setComplaintOrderId] = useState<string>("");
  const [complaintTitle, setComplaintTitle] = useState("");
  const [pendingSupplierRedirect, setPendingSupplierRedirect] = useState<string | null>(null);
  const [attachedOrderRef, setAttachedOrderRef] = useState<{ id: string; label: string } | null>(null);
  const [attachedComplaintRef, setAttachedComplaintRef] = useState<{ id: string; label: string } | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<{ id: string; senderName: string; preview: string } | null>(null);
  const [complaintDescription, setComplaintDescription] = useState("");
  const [messagePriority, setMessagePriority] = useState<"standard" | "important">("standard");
  const [complaintPriorityImmediate, setComplaintPriorityImmediate] = useState(false);
  const [complaintAffectedItems, setComplaintAffectedItems] = useState<AffectedItem[]>([]);
  const [complaintReason, setComplaintReason] = useState<ComplaintReason | "">("");
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [showComplaintDetail, setShowComplaintDetail] = useState(false);
  const [loadingComplaintDetail, setLoadingComplaintDetail] = useState(false);
  const [showDeliveryNotes, setShowDeliveryNotes] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const searchString = useSearch();

  useEffect(() => {
    return () => {
      if (orderCloseTimerRef.current) clearTimeout(orderCloseTimerRef.current);
    };
  }, []);

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
    const toSupplierId = params.get("to");
    if (toSupplierId && currentUser?.id) {
      setPendingSupplierRedirect(toSupplierId);
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
    const prefillParam = params.get("prefill") || params.get("suggestedMessage");
    if (prefillParam) {
      setMessageText(prefillParam);
    }
  }, [searchString, currentUser?.id]);

  const { data: orderDetail } = useQuery<OrderWithDetails>({
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

  const editSupplierIdInbox = editingOrderInbox?.supplierId;

  const { data: supplierProductsInbox } = useQuery<Product[]>({
    queryKey: [`/api/products?supplierId=${editSupplierIdInbox}`],
    enabled: !!editSupplierIdInbox,
  });

  const { data: editDeliverySchedulesInbox } = useQuery<DeliverySchedule[]>({
    queryKey: [`/api/delivery-schedules/restaurant?supplierId=${editSupplierIdInbox}&restaurantId=${currentUser?.id}`],
    enabled: !!editSupplierIdInbox && !!currentUser?.id,
  });

  const editAllowedWeekdaysInbox = useMemo(() => {
    if (!editDeliverySchedulesInbox || editDeliverySchedulesInbox.length === 0) return [];
    return editDeliverySchedulesInbox.map(s => s.dayOfWeek);
  }, [editDeliverySchedulesInbox]);

  const editAvailableDeliveryDatesInbox = useMemo(() => {
    if (editAllowedWeekdaysInbox.length === 0) return [];
    const dates: { value: string; label: string }[] = [];
    const today = startOfDay(new Date());
    for (let i = 1; i <= 28; i++) {
      const date = addDays(today, i);
      if (editAllowedWeekdaysInbox.includes(date.getDay())) {
        dates.push({
          value: format(date, "yyyy-MM-dd"),
          label: format(date, "EEEE, dd. MMMM yyyy", { locale: dateLocale }),
        });
      }
    }
    return dates;
  }, [editAllowedWeekdaysInbox]);

  const addableProductsInbox = useMemo(() => {
    if (!supplierProductsInbox) return [];
    const existingProductIds = new Set(editItemsInbox.map(i => i.productId));
    return supplierProductsInbox.filter(p => !existingProductIds.has(p.id) && p.inStock !== false);
  }, [supplierProductsInbox, editItemsInbox]);

  const filteredAddableProductsInbox = useMemo(() => {
    if (!editProductSearchInbox.trim()) return addableProductsInbox;
    const search = editProductSearchInbox.toLowerCase();
    return addableProductsInbox.filter(p => searchIncludes(p.name, search));
  }, [addableProductsInbox, editProductSearchInbox]);

  const addProductToEditInbox = (product: Product) => {
    setEditItemsInbox(prev => [...prev, {
      id: `new-${product.id}`,
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: product.price,
      totalPrice: product.price,
    }]);
    setEditProductSearchInbox("");
  };

  const updateEditItemQuantityInbox = (index: number, delta: number) => {
    setEditItemsInbox(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newQty = Math.max(1, item.quantity + delta);
      return { ...item, quantity: newQty, totalPrice: (newQty * parseFloat(item.unitPrice)).toFixed(2) };
    }));
  };

  const removeEditItemInbox = (index: number) => {
    setEditItemsInbox(prev => prev.filter((_, i) => i !== index));
  };

  const editTotalInbox = useMemo(() => {
    return editItemsInbox.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0).toFixed(2);
  }, [editItemsInbox]);

  const openEditOrderInbox = (order: OrderWithDetails) => {
    setEditingOrderInbox(order);
    setEditItemsInbox(order.items.map(item => ({
      id: item.id,
      productId: item.productId || item.id,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    })));
    setEditProductSearchInbox("");
    if (order.requestedDeliveryDate) {
      setEditDeliveryOptionInbox("date");
      setEditSelectedDeliveryDateInbox(order.requestedDeliveryDate);
    } else {
      setEditDeliveryOptionInbox("asap");
      setEditSelectedDeliveryDateInbox("");
    }
    setOrderDetailId(null);
  };

  const updateOrderItemsInboxMutation = useMutation({
    mutationFn: async ({ orderId, items, requestedDeliveryDate }: { orderId: string; items: EditableItem[]; requestedDeliveryDate?: string | null }) => {
      return await apiRequest("PATCH", `/api/orders/${orderId}/items`, {
        restaurantId: currentUser?.id,
        items: items.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        requestedDeliveryDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", editingOrderInbox?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${editingOrderInbox?.supplierId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats'] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
      setEditingOrderInbox(null);
      setOrderDetailId(null);
      toast({ title: t("orders", "orderUpdated"), description: t("orders", "orderUpdatedDesc") });
      setTimeout(scrollToBottom, 300);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("orders", "orderUpdateError"), variant: "destructive" });
    },
  });

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
    enabled: !!selectedComplaintId && showComplaintDetail,
  });

  const { data: complaintStatusHistoryData } = useQuery<ComplaintStatusHistoryWithUser[]>({
    queryKey: ["/api/complaints", selectedComplaintId, "status-history"],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${selectedComplaintId}/status-history`);
      return res.json();
    },
    enabled: !!selectedComplaintId && showComplaintDetail,
  });

  const formatComplaintStatus = (status: string) => {
    const statusMap: Record<string, { label: string; icon: any; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      open: { label: getComplaintStatus("open", lang), icon: Clock, variant: "destructive" },
      in_progress: { label: getComplaintStatus("in_progress", lang), icon: Loader2, variant: "default" },
      resolved: { label: getComplaintStatus("resolved", lang), icon: CheckCircle, variant: "secondary" },
      closed: { label: getComplaintStatus("closed", lang), icon: XCircle, variant: "outline" },
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
          toast({ title: t("common", "error"), description: t("inbox", "complaintNotFound"), variant: "destructive" });
        } else {
          throw new Error("Failed to fetch complaint");
        }
        setShowComplaintDetail(false);
        return;
      }
      const complaint: ComplaintWithDetails = await res.json();
      setSelectedComplaintId(complaint.id);
    } catch (error) {
      toast({ title: t("common", "error"), description: t("inbox", "complaintLoadError"), variant: "destructive" });
      setShowComplaintDetail(false);
    } finally {
      setLoadingComplaintDetail(false);
    }
  };

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
        if (hasExistingData && conv.lastMessageAt && prevTs && String(conv.lastMessageAt) !== prevTs && conv.id !== selectedConversation) {
          newFlash.add(conv.id);
        }
        prevConvTimestamps.current[conv.id] = conv.lastMessageAt ? String(conv.lastMessageAt) : "";
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

  useEffect(() => {
    const createAndSelectConversation = async () => {
      if (pendingSupplierRedirect && currentUser?.id && conversations) {
        const existingConv = conversations.find(c => c.otherUser.id === pendingSupplierRedirect);
        if (existingConv) {
          setSelectedConversation(existingConv.id);
          setPendingSupplierRedirect(null);
          setLocation("/restaurant/inbox");
        } else {
          try {
            const response = await apiRequest("POST", "/api/conversations", {
              restaurantId: currentUser.id,
              supplierId: pendingSupplierRedirect,
            });
            const newConversation = await response.json();
            queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser.id}`] });
            setSelectedConversation(newConversation.id);
            setPendingSupplierRedirect(null);
            setLocation("/restaurant/inbox");
          } catch (error) {
            console.error("Failed to create conversation:", error);
            setPendingSupplierRedirect(null);
          }
        }
      }
    };
    createAndSelectConversation();
  }, [pendingSupplierRedirect, currentUser?.id, conversations, setLocation]);

  const selectedConv = conversations?.find(c => c.id === selectedConversation);
  const supplierId = selectedConv?.otherUser.id;

  const { data: allOrdersForActions } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/orders?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id && openActionsPopover,
  });

  const { data: allComplaintsForActions } = useQuery<ComplaintWithDetails[]>({
    queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id && openActionsPopover,
  });

  const openActionsOrders = allOrdersForActions?.filter(
    (o: any) => o.supplierId === supplierId && ["pending", "confirmed", "partially_confirmed", "scheduled", "in_delivery"].includes(o.status)
  );
  const openActionsComplaints = allComplaintsForActions?.filter(
    (c: any) => c.supplierId === supplierId && ["open", "in_progress"].includes(c.status)
  );

  const { data: supplierProducts } = useQuery<Product[]>({
    queryKey: ["/api/products", { supplierId }],
    queryFn: async () => {
      const res = await fetch(`/api/products?supplierId=${supplierId}`);
      return res.json();
    },
    enabled: !!supplierId && actionMode === "order",
  });

  const { data: supplierOrders } = useQuery<Order[]>({
    queryKey: ["/api/orders-by-supplier", { supplierId, restaurantId: currentUser?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/orders-by-supplier?supplierId=${supplierId}&restaurantId=${currentUser?.id}`);
      return res.json();
    },
    enabled: !!supplierId && !!currentUser?.id && actionMode === "complaint",
  });

  const { data: complaintOrderDetails } = useQuery<OrderWithDetails>({
    queryKey: ['/api/orders', complaintOrderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${complaintOrderId}`);
      return res.json();
    },
    enabled: !!complaintOrderId && actionMode === "complaint",
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
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
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
        senderMemberId: currentMember?.id,
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
      setAttachedOrderRef(null);
      setAttachedComplaintRef(null);
      setReplyToMessage(null);
      setTimeout(scrollToBottom, 100);
    },
  });

  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, selectedConversation]);

  const createOrderMutation = useMutation({
    mutationFn: async (items: { productId: string; quantity: number }[]) => {
      if (!currentUser?.id) throw new Error(lang === "de" ? "Nicht angemeldet" : "Non autenticato");
      if (!supplierId) throw new Error(lang === "de" ? "Kein Lieferant ausgewählt" : "Nessun fornitore selezionato");
      if (items.length === 0) throw new Error(lang === "de" ? "Keine Artikel ausgewählt" : "Nessun articolo selezionato");
      return apiRequest("POST", "/api/orders/direct", {
        restaurantId: currentUser.id,
        supplierId,
        items,
        createdByUserId: currentUser.id,
        actingMemberId: currentMember?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      setOrderSubmitted(true);
      if (orderCloseTimerRef.current) clearTimeout(orderCloseTimerRef.current);
      orderCloseTimerRef.current = setTimeout(() => {
        setOrderItems({});
        setActionMode("none");
        setOrderDetailId(null);
        setOrderSubmitted(false);
        orderCloseTimerRef.current = null;
        setTimeout(scrollToBottom, 300);
      }, 1500);
    },
    onError: (err: any) => {
      toast({
        title: t("common", "error"),
        description: err?.message || t("orders", "orderPlaceError"),
        variant: "destructive",
      });
    },
  });

  const createComplaintMutation = useMutation({
    mutationFn: async (data: { orderId: string; restaurantId: string; supplierId: string; title: string; description: string; priorityImmediate?: boolean; affectedItems?: AffectedItem[]; reason: ComplaintReason }) => {
      return apiRequest("POST", "/api/complaints", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/complaints"] });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      toast({
        title: t("complaints", "complaintSent"),
        description: t("complaints", "complaintSentDesc"),
      });
      setComplaintOrderId("");
      setComplaintTitle("");
      setComplaintDescription("");
      setComplaintPriorityImmediate(false);
      setComplaintAffectedItems([]);
      setComplaintReason("");
      setActionMode("none");
      setShowComplaintDetail(false);
      setSelectedComplaintId(null);
      setTimeout(scrollToBottom, 300);
    },
    onError: (err: any) => {
      toast({
        title: t("common", "error"),
        description: err?.message || t("complaints", "complaintSendError"),
        variant: "destructive",
      });
    },
  });

  const handleSubmitComplaint = () => {
    if (!complaintOrderId || !complaintTitle.trim() || !complaintDescription.trim() || !supplierId) return;
    if (!complaintReason) {
      toast({
        title: t("common", "error"),
        description: lang === "de" ? "Bitte wählen Sie einen Grund aus." : "Seleziona un motivo.",
        variant: "destructive",
      });
      return;
    }
    const hasAffected = complaintAffectedItems.length > 0;
    createComplaintMutation.mutate({
      orderId: complaintOrderId,
      restaurantId: currentUser!.id,
      supplierId,
      title: (complaintPriorityImmediate || hasAffected) ? `[PRIORITY IMMEDIATE] ${complaintTitle.trim()}` : complaintTitle.trim(),
      description: complaintDescription.trim(),
      priorityImmediate: complaintPriorityImmediate || hasAffected,
      affectedItems: hasAffected ? complaintAffectedItems : undefined,
      reason: complaintReason,
    });
  };

  const toggleAffectedItem = (item: { productId: string; productName: string; quantity: number; unitPrice: string }) => {
    setComplaintAffectedItems(prev => {
      const existing = prev.find(i => i.productId === item.productId);
      if (existing) {
        return prev.filter(i => i.productId !== item.productId);
      }
      return [...prev, item];
    });
  };

  const [showCancelOrderConfirm, setShowCancelOrderConfirm] = useState(false);
  const [showWithdrawComplaintConfirm, setShowWithdrawComplaintConfirm] = useState(false);
  const [withdrawCloseNote, setWithdrawCloseNote] = useState("");
  const [newComplaintComment, setNewComplaintComment] = useState("");

  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, { status: "cancelled", changedBy: currentUser?.id, actingMemberId: currentMember?.id });
    },
    onSuccess: () => {
      toast({ title: t("orders", "orderCancelled"), description: t("orders", "orderCancelledDesc") });
      setCardWizard(null);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderDetailId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderDetailId, "status-history"] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
      setShowCancelOrderConfirm(false);
      setOrderDetailId(null);
      setTimeout(scrollToBottom, 300);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("orders", "orderCancelError"), variant: "destructive" });
    },
  });

  const changeRequestMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      return apiRequest("POST", `/api/orders/${orderId}/change-request`, { restaurantId: currentUser?.id, reason });
    },
    onSuccess: () => {
      toast({ title: lang === "it" ? "Richiesta inviata" : "Anfrage gesendet", description: lang === "it" ? "La richiesta di modifica è stata inviata al commerciante." : "Die Änderungsanfrage wurde an den Händler gesendet." });
      setCardWizard(null);
      setOrderDetailId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'messages'] });
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
      setTimeout(scrollToBottom, 300);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: lang === "it" ? "La richiesta non è stata inviata." : "Die Anfrage konnte nicht gesendet werden.", variant: "destructive" });
    },
  });

  const withdrawComplaintMutation = useMutation({
    mutationFn: async ({ id, closeNote }: { id: string; closeNote: string }) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, { status: "closed", changedBy: currentUser?.id, actorRole: "restaurant", closeNote });
    },
    onSuccess: () => {
      toast({ title: t("complaints", "complaintWithdrawn"), description: t("complaints", "complaintWithdrawnDesc") });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId] });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId, "status-history"] });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
        queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      }
      setShowWithdrawComplaintConfirm(false);
      setWithdrawCloseNote("");
      setShowComplaintDetail(false);
      setSelectedComplaintId(null);
      setTimeout(scrollToBottom, 300);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("complaints", "withdrawError"), variant: "destructive" });
    },
  });

  const reopenComplaintMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, { status: "open", changedBy: currentUser?.id, actorRole: "restaurant" });
    },
    onSuccess: () => {
      toast({ title: lang === "de" ? "Reklamation wieder geöffnet" : "Reclamo riaperto" });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId] });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId, "status-history"] });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
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
      toast({ title: t("complaints", "commentAdded"), description: t("complaints", "commentAddedDesc") });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId] });
      setNewComplaintComment("");
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("complaints", "commentError"), variant: "destructive" });
    },
  });

  const formatOrderDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString(lang === "it" ? "it-IT" : "de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const filteredConversations = conversations?.filter(conv => 
    searchIncludes(conv.otherUser.companyName, searchQuery) ||
    searchIncludes(conv.otherUser.name, searchQuery)
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

  const onReplyToMessage = (message: any) => {
    if (!selectedConv) return;
    const isOwn = message.senderId === currentUser?.id;
    const senderName = message.senderMember?.name || (isOwn ? (currentUser?.name || "") : (selectedConv.otherUser.name || ""));
    setReplyToMessage({
      id: message.id,
      senderName,
      preview: getMessageReplyPreview(message, lang as "de" | "it"),
    });
    const input = document.querySelector('[data-testid="input-message"]') as HTMLInputElement | null;
    input?.focus();
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
    if (last.messageType === "order" || last.messageType === "confirmation") {
      return isDe ? ["Danke!", "Wann kommt es?", "Alles klar"] : ["Grazie!", "Quando arriva?", "Va bene"];
    }
    if (last.messageType === "complaint") {
      return isDe ? ["Danke fürs Update", "Bitte schnell", "Ok"] : ["Grazie", "Per favore presto", "Ok"];
    }
    if (last.messageType === "delivery_status") {
      return isDe ? ["Super, danke!", "Geliefert ✓", "Alles gut"] : ["Grazie!", "Consegnato ✓", "Tutto bene"];
    }
    return isDe ? ["Danke!", "👍", "Ok"] : ["Grazie!", "👍", "Ok"];
  }, [messages, currentUser, lang]);

  const updateOrderQuantity = (productId: string, delta: number) => {
    setOrderItems(prev => {
      const current = prev[productId] || 0;
      const newQty = Math.max(0, current + delta);
      if (newQty === 0) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: newQty };
    });
  };

  const handleSubmitOrder = () => {
    if (createOrderMutation.isPending || orderSubmitted) return;
    const items = Object.entries(orderItems).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
    if (items.length > 0) {
      createOrderMutation.mutate(items);
    }
  };

  const totalOrderItems = Object.values(orderItems).reduce((sum, qty) => sum + qty, 0);

  const inStockSupplierProducts = useMemo(
    () => (supplierProducts || []).filter(p => p.inStock !== false),
    [supplierProducts]
  );

  const orderProductCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of inStockSupplierProducts) {
      const cat = (p.category && p.category.trim()) || (lang === "de" ? "Sonstiges" : "Altro");
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [inStockSupplierProducts, lang]);

  const filteredOrderProducts = useMemo(() => {
    const q = orderSearchQuery.trim().toLowerCase();
    return inStockSupplierProducts.filter(p => {
      if (orderCategoryFilter !== "all") {
        const cat = (p.category && p.category.trim()) || (lang === "de" ? "Sonstiges" : "Altro");
        if (cat !== orderCategoryFilter) return false;
      }
      if (q && !searchIncludes(p.name, q) && !searchIncludes((p.description || ""), q)) {
        return false;
      }
      return true;
    });
  }, [inStockSupplierProducts, orderSearchQuery, orderCategoryFilter, lang]);

  const estimatedOrderTotal = useMemo(() => {
    let total = 0;
    for (const [pid, qty] of Object.entries(orderItems)) {
      const p = inStockSupplierProducts.find(x => x.id === pid);
      if (p) total += parseFloat(p.price) * qty;
    }
    return total;
  }, [orderItems, inStockSupplierProducts]);

  const handleBackToList = () => {
    setSelectedConversation(null);
    setReplyToMessage(null);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full max-w-[1500px] mx-auto">
<Card className={`flex-1 flex flex-col overflow-hidden ${selectedConversation ? 'border-0 rounded-none shadow-none md:border md:rounded-xl md:shadow' : ''}`}>
        <div className="flex flex-1 min-h-0 min-w-0">
          <div className={`w-full md:w-72 lg:w-80 border-r border-border flex flex-col min-h-0 shrink-0 ${selectedConversation ? 'hidden md:flex' : 'flex'}`}>
            <CardHeader className="pb-2 p-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("inbox", "searchPlaceholder")}
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
                {currentUser?.id && <WhatsappInboxCard userId={currentUser.id} />}
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
                      let msgPreviewText = conv.lastMessage?.content || t("inbox", "noConversations");
                      try {
                        const parsed = JSON.parse(conv.lastMessage?.content || "");
                        if (parsed.refType && parsed.text) msgPreviewText = parsed.text;
                      } catch {}
                      let isFollowUpOrder = false;
                      if (conv.lastMessage?.messageType === "order") {
                        try { isFollowUpOrder = JSON.parse(conv.lastMessage.content)?.isFollowUp === true; } catch {}
                      }
                      const lastOid = conv.lastMessage?.orderId ? ` #${formatOrderNumber({orderNumber: conv.lastMessage.orderNumber, id: conv.lastMessage.orderId})}` : "";
                      const messagePreview = conv.lastMessage?.messageType === "order" 
                        ? (isFollowUpOrder ? (lang === "de" ? "Nachlieferung" : "Riconsegna") : (lang === "de" ? "Bestellung" : "Ordine")) + lastOid
                        : conv.lastMessage?.messageType === "complaint"
                        ? (lang === "de" ? "Reklamation" : "Reclamo") + lastOid
                        : conv.lastMessage?.messageType === "document"
                        ? (lang === "de" ? "Lieferschein" : "Bolla") + lastOid
                        : conv.lastMessage?.messageType === "order_change_request"
                        ? (lang === "de" ? "Änderungsanfrage" : "Richiesta modifica") + lastOid
                        : conv.lastMessage?.messageType === "delivery_status"
                        ? (lang === "de" ? "Lieferhinweis" : "Avviso di consegna") + lastOid
                        : conv.lastMessage?.messageType === "promotion"
                        ? t("promotionsPage", "promotionMessage")
                        : conv.lastMessage?.messageType === "voice"
                        ? (lang === "de" ? "🎤 Sprachnachricht" : "🎤 Messaggio vocale")
                        : conv.lastMessage?.messageType === "attachment"
                        ? t("inbox", "file")
                        : msgPreviewText;
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
                              icon: (conv as any).pinnedByRestaurant ? <PinOff className="h-5 w-5" /> : <Pin className="h-5 w-5" />,
                              label: (conv as any).pinnedByRestaurant ? (lang === "de" ? "Lösen" : "Sblocca") : (lang === "de" ? "Anheften" : "Fissa"),
                              color: "bg-amber-500",
                              onClick: () => pinConvMutation.mutate({ conversationId: conv.id, isPinned: !(conv as any).pinnedByRestaurant }),
                              testId: `swipe-pin-${conv.id}`,
                            },
                          ]}
                          rightActions={[]}
                        >
                          <button
                            onClick={() => {
                              handleSelectConversation(conv.id);
                              setActionMode("none");
                              setOrderItems({});
                            }}
                            className={`w-full p-3 md:p-2.5 min-h-[64px] md:min-h-0 rounded-xl md:rounded-md text-left transition-colors hover-elevate overflow-hidden ${
                              selectedConversation === conv.id
                                ? "bg-muted"
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
                                  <AvatarFallback className="bg-secondary/20 text-secondary text-sm">
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
                                    {(conv as any).pinnedByRestaurant && (
                                      <Pin className="h-3 w-3 text-amber-500 fill-amber-500" data-testid={`icon-pinned-${conv.id}`} />
                                    )}
                                    {lastMessageTime && (
                                      <span className={`text-[11px] md:text-[10px] ${hasUnread && isPriorityMsg ? "text-red-500 font-semibold" : hasUnread ? "text-primary font-semibold" : "text-muted-foreground"}`}>{lastMessageTime}</span>
                                    )}
                                    {hasUnread && (
                                      <span className={`flex h-5 min-w-5 px-1 items-center justify-center rounded-full text-[10px] font-bold m-num ${isPriorityMsg ? "bg-red-500 text-white" : "bg-primary text-primary-foreground"}`}>
                                        {conv.unreadCount}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className={`text-[13px] md:text-xs truncate max-w-full mt-0.5 ${hasUnread && isPriorityMsg ? "text-red-500 font-semibold" : hasUnread ? "text-primary font-semibold" : "text-muted-foreground"}`}>
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
                    <p className="text-sm text-muted-foreground">{t("inbox", "noConversations")}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`flex-1 min-w-0 flex flex-col overflow-hidden ${selectedConversation ? 'flex' : 'hidden md:flex'}`}>
            {selectedConversation && selectedConv ? (
              <ChatDropZone
                conversationId={selectedConversation}
                senderId={currentUser?.id || ""}
                onSendAttachment={handleSendAttachment}
                lang={lang as "de" | "it"}
                className="flex-1 flex flex-col overflow-hidden h-full"
              >
                <div className="border-b border-border px-3 pb-3.5 pt-[calc(env(safe-area-inset-top,0px)+0.875rem)] md:px-4 md:py-4 bg-background">
                  <div className="flex items-center justify-between gap-2 min-h-[44px]">
                    <div className="flex items-center gap-2.5 md:gap-3">
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
                        <AvatarFallback className="bg-secondary/20 text-secondary">
                          {selectedConv.otherUser.companyName?.charAt(0) || selectedConv.otherUser.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="m-type-body font-medium text-sm md:text-base truncate" data-testid="text-conversation-partner">
                          {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                        </p>
                        <OnlineStatus userId={selectedConv.otherUser.id} size="sm" />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setOpenActionsPopover(true)} data-testid="button-open-actions">
                        <ClipboardList className="h-5 w-5" />
                      </Button>
                      <Dialog open={openActionsPopover} onOpenChange={setOpenActionsPopover}>
                        <DialogContent className="max-w-[92vw] md:max-w-md p-0 gap-0 rounded-2xl">
                          <DialogHeader className="sr-only">
                            <DialogTitle>{t("inbox", "openActions")}</DialogTitle>
                            <DialogDescription>{selectedConv.otherUser.companyName || selectedConv.otherUser.name}</DialogDescription>
                          </DialogHeader>
                          <div className="px-6 pt-6 pb-2">
                            <div className="flex items-center gap-2">
                              <ClipboardList className="h-4 w-4 text-foreground" />
                              <h3 className="text-sm font-semibold text-foreground">{t("inbox", "openActions")}</h3>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 pl-6">{selectedConv.otherUser.companyName || selectedConv.otherUser.name}</p>
                          </div>
                          <div className="max-h-[60vh] overflow-y-auto px-4 pb-3 space-y-3">
                            {openActionsOrders && openActionsOrders.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5" data-testid="text-open-orders-header">{t("inbox", "openOrders")} ({openActionsOrders.length})</p>
                                <div className="space-y-2">
                                  {openActionsOrders.map((order: any) => {
                                    const StatusIcon = order.status === "pending" ? Clock : order.status === "partially_confirmed" ? AlertTriangle : order.status === "confirmed" ? CheckCircle : Package;
                                    return (
                                      <div
                                        key={order.id}
                                        className="rounded-xl bg-muted/30 dark:bg-muted/20 p-3 space-y-2 cursor-pointer"
                                        onClick={() => { setOrderDetailId(order.id); setOpenActionsPopover(false); }}
                                        data-testid={`open-action-order-${order.id}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <StatusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            <span className="text-xs font-mono truncate">Bestellung #{formatOrderNumber(order)}</span>
                                          </div>
                                          <Badge variant="secondary" className={`text-[10px] shrink-0 ${getStatusColor(order.status)}`}>
                                            {getOrderStatus(order.status, lang)}
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
                                              <p className="text-[10px] text-muted-foreground">+{order.items.length - 3} {t("orders", "moreItems")}</p>
                                            )}
                                          </div>
                                        )}
                                        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                                          <span>
                                            {format(new Date(order.createdAt), "dd.MM.yy", { locale: dateLocale })}
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
                                              {t("orders", "deliveredOn")} {format(new Date(order.updatedAt || order.createdAt), "dd.MM.yyyy", { locale: dateLocale })}
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
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {openActionsComplaints && openActionsComplaints.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5" data-testid="text-open-complaints-header">{t("inbox", "openComplaints")} ({openActionsComplaints.length})</p>
                                <div className="space-y-2">
                                  {openActionsComplaints.map((complaint: any) => {
                                    const StatusIcon = complaint.status === "open" ? AlertCircle : Clock;
                                    return (
                                      <div
                                        key={complaint.id}
                                        className="rounded-xl bg-muted/30 dark:bg-muted/20 p-3 space-y-2 cursor-pointer"
                                        onClick={() => { openComplaintDetailById(complaint.id); setOpenActionsPopover(false); }}
                                        data-testid={`open-action-complaint-${complaint.id}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <StatusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            <span className="text-xs font-medium truncate">{complaint.title}</span>
                                          </div>
                                          <Badge variant="secondary" className={`text-[10px] shrink-0 ${getComplaintStatusColor(complaint.status)}`}>
                                            {getComplaintStatus(complaint.status, lang)}
                                          </Badge>
                                        </div>
                                        {complaint.description && (
                                          <p className="text-[10px] text-muted-foreground line-clamp-2">{complaint.description}</p>
                                        )}
                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                          <span>Reklamation #{formatComplaintNumber(complaint)}</span>
                                          <span>•</span>
                                          <span>{format(new Date(complaint.createdAt), "dd.MM.yy", { locale: dateLocale })}</span>
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
                              onClick={() => { setOpenActionsPopover(false); setLocation(`/restaurant/orders?supplierId=${selectedConv.otherUser.id}`); }}
                              data-testid="button-view-all-orders"
                            >
                              <ShoppingBag className="h-3.5 w-3.5 mr-2" />
                              {t("inbox", "viewAllOrders")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-center text-xs border-border/40 rounded-xl h-9"
                              onClick={() => { setOpenActionsPopover(false); setLocation(`/restaurant/complaints?supplierId=${selectedConv.otherUser.id}`); }}
                              data-testid="button-view-all-complaints"
                            >
                              <AlertCircle className="h-3.5 w-3.5 mr-2" />
                              {t("inbox", "viewAllComplaints")}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      {selectedConv.otherUser.phone && (
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          data-testid="button-call-supplier"
                        >
                          <a href={`tel:${selectedConv.otherUser.phone}`}>
                            <Phone className="h-5 w-5" />
                          </a>
                        </Button>
                      )}
                    </div>
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

                {actionMode === "none" ? (
                  <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 h-full" style={{ minHeight: 0 }}>
                    {messagesLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-16 w-3/4" />
                        ))}
                      </div>
                    ) : messages && messages.length > 0 ? (
                      <div className="space-y-3 w-full max-w-full overflow-hidden">
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
                                    {formatDateDivider(messageDate, lang)}
                                  </span>
                                </div>
                              )}
                              <SwipeToReply onReply={() => onReplyToMessage(message)}>
                              <div
                                className={`flex ${message.messageType === "order" || message.messageType === "complaint" || message.messageType === "document" || message.messageType === "order_change_request" || message.messageType === "promotion" || message.messageType === "delivery_status" ? "justify-center" : message.messageType === "attachment" ? (isOwn ? "justify-end" : "justify-start") : isOwn ? "justify-end" : "justify-start"}`}
                                data-testid={`message-${message.id}`}
                                {...(message.orderId ? { "data-order-id": message.orderId } : {})}
                              >
                                {message.messageType === "promotion" && !message.dismissed ? (
                                  (() => {
                                    let promoData: any = null;
                                    try { promoData = JSON.parse(message.content); } catch {}
                                    if (!promoData) return null;
                                    const now = new Date();
                                    const endDate = new Date(promoData.endDate);
                                    const isExpired = endDate < now;
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
                                                <span className="font-medium flex-1 min-w-0 truncate">{prod.name}</span>
                                                <span className="text-muted-foreground line-through shrink-0">{prod.originalPrice}€</span>
                                                <span className="font-semibold text-green-600 dark:text-green-400 shrink-0">{prod.discountedPrice}€/{prod.unit}</span>
                                              </div>
                                            ))}
                                          </div>
                                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                            <Calendar className="h-3 w-3" />
                                            <span>{t("promotionsPage", "validUntil")} {format(endDate, "dd.MM.yyyy")}</span>
                                          </div>
                                          {!isExpired && (
                                            <div className="grid grid-cols-2 gap-2 pt-1">
                                              <Button
                                                size="sm"
                                                className="h-8 text-xs truncate"
                                                onClick={() => setLocation(`/restaurant/catalog?supplier=${promoData.supplierId}`)}
                                                data-testid={`button-order-promo-${message.id}`}
                                              >
                                                <ShoppingCart className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                                                <span className="truncate">{t("promotionsPage", "orderNow")}</span>
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs truncate"
                                                onClick={async () => {
                                                  try {
                                                    await apiRequest("PATCH", `/api/messages/${message.id}/dismiss`);
                                                    queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
                                                  } catch {}
                                                }}
                                                data-testid={`button-dismiss-promo-${message.id}`}
                                              >
                                                <X className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                <span className="truncate">{t("promotionsPage", "notInterested")}</span>
                                              </Button>
                                            </div>
                                          )}
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
                                                  {getOrderStatus(orderStatus, lang)}
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
                                                {getOrderStatus(orderStatus, lang)}
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
                                                <span className="text-[13px] font-semibold shrink-0">{t("common", "total")}</span>
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
                                                {cardWizard.action === "change_request" ? (
                                                  <>
                                                    <div className="flex items-center gap-2">
                                                      <Pencil className="h-4 w-4 text-amber-600" />
                                                      <span className="text-sm font-medium">{lang === "it" ? "Richiedi modifica ordine" : "Änderung anfragen"}</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{lang === "it" ? "Descrivi le modifiche desiderate. Il commerciante dovrà approvare la richiesta." : "Beschreiben Sie die gewünschten Änderungen. Der Händler muss die Anfrage genehmigen."}</p>
                                                    <Textarea
                                                      placeholder={lang === "it" ? "Motivo della modifica..." : "Grund der Änderung..."}
                                                      value={cardWizard.reason || ""}
                                                      onChange={(e) => setCardWizard({ ...cardWizard, reason: e.target.value })}
                                                      className="min-h-[60px] text-sm"
                                                      data-testid={`wizard-reason-${message.orderId}`}
                                                    />
                                                    <div className="flex gap-2">
                                                      <Button variant="outline" size="sm" className="flex-1 text-foreground" onClick={() => setCardWizard(null)} data-testid={`wizard-cancel-${message.orderId}`}>
                                                        {t("common", "cancel")}
                                                      </Button>
                                                      <Button
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => changeRequestMutation.mutate({ orderId: message.orderId!, reason: cardWizard.reason || "" })}
                                                        disabled={!cardWizard.reason?.trim() || changeRequestMutation.isPending}
                                                        data-testid={`wizard-send-change-${message.orderId}`}
                                                      >
                                                        {changeRequestMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                                                        {lang === "it" ? "Invia richiesta" : "Anfrage senden"}
                                                      </Button>
                                                    </div>
                                                  </>
                                                ) : cardWizard.action === "cancel" ? (
                                                  <>
                                                    <div className="flex items-center gap-2">
                                                      <XCircle className="h-4 w-4 text-red-600" />
                                                      <span className="text-sm font-medium">{lang === "it" ? "Annullare l'ordine?" : "Bestellung stornieren?"}</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{lang === "it" ? "Questa azione non può essere annullata." : "Diese Aktion kann nicht rückgängig gemacht werden."}</p>
                                                    <div className="flex gap-2">
                                                      <Button variant="outline" size="sm" className="flex-1 text-foreground" onClick={() => setCardWizard(null)} data-testid={`wizard-cancel-${message.orderId}`}>
                                                        {t("common", "cancel")}
                                                      </Button>
                                                      <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => cancelOrderMutation.mutate(message.orderId!)}
                                                        disabled={cancelOrderMutation.isPending}
                                                        data-testid={`wizard-confirm-cancel-${message.orderId}`}
                                                      >
                                                        {cancelOrderMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                                                        {lang === "it" ? "Sì, annulla" : "Ja, stornieren"}
                                                      </Button>
                                                    </div>
                                                  </>
                                                ) : cardWizard.action === "edit" ? (
                                                  <>
                                                    <div className="flex items-center gap-2">
                                                      <Pencil className="h-4 w-4 text-primary" />
                                                      <span className="text-sm font-medium">{lang === "it" ? "Modificare l'ordine?" : "Bestellung bearbeiten?"}</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{lang === "it" ? "Apri l'editor per modificare prodotti e quantità." : "Öffne den Editor um Produkte und Mengen zu ändern."}</p>
                                                    <div className="flex gap-2">
                                                      <Button variant="outline" size="sm" className="flex-1 text-foreground" onClick={() => setCardWizard(null)} data-testid={`wizard-cancel-${message.orderId}`}>
                                                        {t("common", "cancel")}
                                                      </Button>
                                                      <Button
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => {
                                                          setCardWizard(null);
                                                          setOrderDetailId(message.orderId);
                                                        }}
                                                        data-testid={`wizard-open-edit-${message.orderId}`}
                                                      >
                                                        <Pencil className="h-3.5 w-3.5 mr-1" />
                                                        {lang === "it" ? "Apri editor" : "Editor öffnen"}
                                                      </Button>
                                                    </div>
                                                  </>
                                                ) : null}
                                              </div>
                                            ) : (
                                              <div className="grid grid-cols-2 gap-1.5">
                                                <Button size="sm" variant="outline" className="text-xs h-8 min-w-0 truncate" onClick={() => setOrderDetailId(message.orderId)} data-testid={`button-order-details-${message.id}`}>
                                                  <Eye className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                  <span className="truncate">Details</span>
                                                </Button>
                                                {orderStatus === "pending" && (
                                                  <Button size="sm" variant="outline" className="text-xs h-8 min-w-0 truncate" onClick={() => setCardWizard({ orderId: message.orderId!, action: "edit" })} data-testid={`button-card-edit-${message.id}`}>
                                                    <Pencil className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                    <span className="truncate">{lang === "it" ? "Modifica" : "Bearbeiten"}</span>
                                                  </Button>
                                                )}
                                                {(orderStatus === "confirmed" || orderStatus === "partially_confirmed") && (
                                                  <Button size="sm" variant="outline" className="text-xs h-8 min-w-0 truncate" onClick={() => setCardWizard({ orderId: message.orderId!, action: "change_request", reason: "" })} data-testid={`button-card-change-request-${message.id}`}>
                                                    <Pencil className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                    <span className="truncate">{lang === "it" ? "Modifica" : "Ändern"}</span>
                                                  </Button>
                                                )}
                                                {orderStatus && !["delivered", "cancelled"].includes(orderStatus) && (
                                                  <Button size="sm" variant="outline" className="text-xs h-8 min-w-0 truncate" onClick={() => setCardWizard({ orderId: message.orderId!, action: "cancel" })} data-testid={`button-card-cancel-${message.id}`}>
                                                    <XCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                    <span className="truncate">{lang === "it" ? "Annulla" : "Stornieren"}</span>
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
                                              <span className="text-xs text-muted-foreground truncate">{t("inbox", "complaintMessage")} {complaintData?.orderId ? `#${(complaintData as any).complaintNumber || (complaintData as any).orderNumber || formatOrderNumber({orderNumber: null, id: complaintData.orderId})}` : ""}</span>
                                              {complaintStatus && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${getComplaintStatusColor(complaintStatus)}`}>
                                                  {getComplaintStatus(complaintStatus, lang)}
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
                                            <span className="text-xs font-semibold text-red-600 dark:text-red-400">{t("inbox", "complaintMessage")} {complaintData?.orderId ? `#${(complaintData as any).complaintNumber || (complaintData as any).orderNumber || formatOrderNumber({orderNumber: null, id: complaintData.orderId})}` : ""}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {complaintStatus && (
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getComplaintStatusColor(complaintStatus)}`} data-testid={`complaint-status-${message.id}`}>
                                                {getComplaintStatus(complaintStatus, lang)}
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
                                                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                                  )}
                                                  <span className={`font-medium ${message.priority === "important" ? "text-red-700 dark:text-red-400" : ""}`}>{complaintData.title}</span>
                                                </div>
                                                <Badge variant="outline" className="text-xs">
                                                  {t("orders", "order")} #{complaintData.orderId ? ((complaintData as any).orderNumber || formatOrderNumber({orderNumber: null, id: complaintData.orderId})) : ""}
                                                </Badge>
                                              </div>
                                              <p className="text-sm text-muted-foreground">{complaintData.description}</p>
                                              {(complaintData as any).reason && (
                                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] font-medium" data-testid={`complaint-reason-${message.id}`}>
                                                  <AlertCircle className="h-2.5 w-2.5" />
                                                  {getComplaintReasonLabel((complaintData as any).reason, lang)}
                                                </div>
                                              )}
                                              {(complaintData as any).mediaUrls && (complaintData as any).mediaUrls.length > 0 && (
                                                <div className="mt-2 grid grid-cols-3 gap-1.5" data-testid={`complaint-media-${message.id}`}>
                                                  {((complaintData as any).mediaUrls as string[]).slice(0, 6).map((url, i) => (
                                                    <a key={i} href={getComplaintMediaSrc(url)} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border hover-elevate">
                                                      <img src={getComplaintMediaSrc(url)} alt="" className="h-full w-full object-cover" loading="lazy" />
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
                                          <div className="px-4 pb-3 pt-1">
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
                                              {t("inbox", "showComplaint")}
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
                                            <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setOrderDetailId(dsData.orderId!)} data-testid={`button-ds-details-${message.id}`}>
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
                                    if (changeData.type === "delivery_date_change") {
                                      const ddData = changeData as { orderId?: string; orderNumber?: string; oldDate?: string | null; newDate?: string; reason?: string };
                                      const fmtD = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });
                                      return (
                                        <div className="max-w-[88%] md:w-[75%] md:max-w-sm rounded-2xl border border-blue-200 dark:border-blue-800/50 bg-white dark:bg-card shadow-sm overflow-hidden" data-testid={`delivery-date-change-${message.id}`}>
                                          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
                                            <div className="flex items-center gap-2">
                                              <Truck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                                {lang === "it" ? "Data di consegna modificata" : "Lieferdatum geändert"}{ddData.orderNumber ? ` #${ddData.orderNumber}` : ""}
                                              </span>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                          </div>
                                          <div className="px-4 py-2 space-y-1">
                                            {ddData.oldDate && (
                                              <p className="text-xs text-muted-foreground line-through" data-testid={`text-dd-old-${message.id}`}>{fmtD(ddData.oldDate)}</p>
                                            )}
                                            {ddData.newDate && (
                                              <p className="text-sm font-medium" data-testid={`text-dd-new-${message.id}`}>→ {fmtD(ddData.newDate)}</p>
                                            )}
                                            {ddData.reason && (
                                              <div className="mt-1.5 rounded-lg border border-blue-200/60 dark:border-blue-800/40 bg-blue-50/70 dark:bg-blue-950/20 px-2.5 py-1.5">
                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                                                  {lang === "it" ? "Motivo" : "Begründung"}
                                                </p>
                                                <p className="text-xs text-foreground whitespace-pre-wrap mt-0.5" data-testid={`text-dd-reason-${message.id}`}>{dateChangeReasonLabel(ddData.reason, lang)}</p>
                                              </div>
                                            )}
                                          </div>
                                          {ddData.orderId && (
                                            <div className="px-4 pb-3 pt-1">
                                              <Button variant="outline" size="sm" className="w-full text-xs h-8" onClick={() => setOrderDetailId(ddData.orderId!)} data-testid={`button-dd-details-${message.id}`}>
                                                <Eye className="h-3.5 w-3.5 mr-1" />
                                                {lang === "it" ? "Dettagli" : "Details"}
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }
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
                                    const isResponse = changeData.type === "change_request_response";
                                    const isEdited = changeData.type === "order_edited";
                                    const isChangeRequest = changeData.type === "change_request";
                                    const changeInactive = isResponse || isEdited || (isChangeRequest && changeData.status !== "pending");
                                    const label = isEdited ? t("inbox", "orderEdited") : isResponse ? (changeData.approved ? t("inbox", "changeApproved") : t("inbox", "changeRejected")) : t("inbox", "changeRequest");
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
                                          {changeData.reason && (
                                            <p className="text-sm text-muted-foreground mt-1">{t("inbox", "reason")}: {changeData.reason}</p>
                                          )}
                                        </div>
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
                                  <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-3 py-2 shadow-sm ${isOwn ? "bg-primary/10" : "bg-muted"}`} data-testid={`voice-bubble-${message.id}`}>
                                    <VoiceMessage
                                      src={(message as any).audioUrl}
                                      durationMs={(message as any).audioDurationMs}
                                      testId={`voice-${message.id}`}
                                    />
                                    <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                                      <span className="text-[10px] text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                      {isOwn && (
                                        message.isRead
                                          ? <CheckCheck className={`h-3 w-3 ${newlyReadIds.has(message.id) ? "animate-read-receipt" : ""} text-muted-foreground`} />
                                          : <Check className="h-3 w-3 text-muted-foreground" />
                                      )}
                                    </div>
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
                                    const senderName = message.senderMember?.name || (isOwn ? (currentUser?.name || "") : (selectedConv.otherUser.name || ""));
                                    const senderAvatarUrl = message.senderMember?.profileImageUrl || (isOwn ? currentUser?.profileImageUrl : selectedConv.otherUser.profileImageUrl) || undefined;
                                    const senderInitials = (senderName || "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";
                                    const isImportant = message.priority === "important";
                                    return (
                                      <div className={`max-w-[85%] md:max-w-[70%] group/msg flex items-center gap-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                                        <div className="flex-1 min-w-0">
                                          {showSenderName && (
                                            <div className={`mb-0.5 px-1 flex items-center gap-1 ${isOwn ? "justify-end" : ""}`}>
                                              {isImportant && <AlertTriangle className="h-3 w-3 text-red-500" />}
                                              <Avatar className="h-4 w-4 shrink-0">
                                                {senderAvatarUrl ? <AvatarImage src={senderAvatarUrl} alt={senderName} /> : null}
                                                <AvatarFallback className="bg-primary/10 text-primary text-[7px] font-semibold">{senderInitials}</AvatarFallback>
                                              </Avatar>
                                              <span className={`text-[11px] font-semibold ${isImportant ? (isOwn ? "text-red-400" : "text-red-500") : (isOwn ? "text-primary/70" : "text-primary")}`} data-testid={`text-sender-${message.id}`}>
                                                {senderName}
                                              </span>
                                            </div>
                                          )}
                                          {!showSenderName && isImportant && (
                                            <div className={`flex items-center gap-1 mb-0.5 px-1 ${isOwn ? "justify-end" : ""}`}>
                                              <AlertTriangle className="h-3 w-3 text-red-500" />
                                            </div>
                                          )}
                                          <div className={`flex items-start gap-1.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                                          <div
                                            className={`rounded-lg px-3 py-2 shadow-lg ${
                                              isImportant
                                                ? "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-foreground"
                                                : isOwn
                                                  ? "bg-primary text-primary-foreground"
                                                  : "bg-muted"
                                            }`}
                                          >
                                            {refData && refData.refType === "reply" && (
                                              <div
                                                className={`mb-1.5 rounded-md px-2.5 py-1.5 border-l-3 cursor-pointer hover:opacity-80 transition-opacity ${
                                                  isOwn
                                                    ? "bg-primary-foreground/15 border-primary-foreground/50"
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
                                                <p className={`text-[11px] font-semibold ${isOwn ? "text-primary-foreground/80" : "text-primary"}`}>
                                                  {refData.refLabel}
                                                </p>
                                                <p className={`text-[11px] truncate ${isOwn ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                                                  {refData.refPreview}
                                                </p>
                                              </div>
                                            )}
                                            {refData && refData.refType !== "reply" && (
                                              <div
                                                className={`mb-1.5 rounded-md px-2.5 py-1.5 border-l-3 cursor-pointer hover:opacity-80 transition-opacity ${
                                                  isOwn
                                                    ? "bg-primary-foreground/15 border-primary-foreground/50"
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
                                                    <ShoppingBag className={`h-3 w-3 shrink-0 ${isOwn ? "text-primary-foreground/70" : "text-foreground"}`} />
                                                  ) : (
                                                    <AlertCircle className={`h-3 w-3 shrink-0 ${isOwn ? "text-primary-foreground/70" : "text-foreground"}`} />
                                                  )}
                                                  <span className={`text-[11px] font-medium truncate ${isOwn ? "text-primary-foreground/80" : "text-foreground/80"}`}>
                                                    {refData.refLabel || (refData.refType === "order" ? (lang === "de" ? "Bestellung" : "Ordine") : (lang === "de" ? "Reklamation" : "Reclamo"))}
                                                  </span>
                                                </div>
                                              </div>
                                            )}
                                            <p className="text-sm">{refData ? refData.text : message.content}</p>
                                            <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                                              <span className={`text-[10px] ${isImportant ? "text-muted-foreground" : isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                                {format(messageDate, "HH:mm")}
                                              </span>
                                              {isOwn && (
                                                message.isRead 
                                                  ? <CheckCheck className={`h-3 w-3 ${newlyReadIds.has(message.id) ? "animate-read-receipt" : ""} ${isImportant ? "text-muted-foreground" : "text-primary-foreground/70"}`} />
                                                  : <Check className={`h-3 w-3 ${isImportant ? "text-muted-foreground" : "text-primary-foreground/70"}`} />
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
                              </SwipeToReply>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
                        <p className="text-sm text-muted-foreground">{t("inbox", "noConversations")}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t("inbox", "startConversation")}</p>
                      </div>
                    )}
                  </div>
                ) : actionMode === "order" ? (
                  <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="px-4 pt-4 pb-3 border-b border-border bg-background">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <ShoppingCart className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm leading-tight truncate">{t("inbox", "orderMessage")}</h3>
                            <p className="text-xs text-muted-foreground truncate">
                              {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => { setActionMode("none"); setOrderSubmitted(false); setOrderSearchQuery(""); setOrderCategoryFilter("all"); setTimeout(scrollToBottom, 100); }} data-testid="button-close-order">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={lang === "de" ? "Produkt suchen..." : "Cerca prodotto..."}
                          value={orderSearchQuery}
                          onChange={(e) => setOrderSearchQuery(e.target.value)}
                          className="pl-9 h-9 rounded-full bg-muted/50 border-transparent focus-visible:bg-background"
                          data-testid="input-order-product-search"
                        />
                      </div>
                      {orderProductCategories.length > 0 && (
                        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
                          <button
                            onClick={() => setOrderCategoryFilter("all")}
                            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${orderCategoryFilter === "all" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}
                            data-testid="filter-order-category-all"
                          >
                            {lang === "de" ? "Alle" : "Tutti"} · {inStockSupplierProducts.length}
                          </button>
                          {orderProductCategories.map(({ name, count }) => (
                            <button
                              key={name}
                              onClick={() => setOrderCategoryFilter(name)}
                              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${orderCategoryFilter === name ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}
                              data-testid={`filter-order-category-${name}`}
                            >
                              {name} · {count}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <ScrollArea className="flex-1 px-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 py-3">
                        {filteredOrderProducts.map((product) => {
                          const qty = orderItems[product.id] || 0;
                          const isSelected = qty > 0;
                          return (
                            <div
                              key={product.id}
                              className={`group relative rounded-xl border transition-all duration-200 overflow-hidden bg-card ${isSelected ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border hover:border-primary/40 hover:shadow-sm"}`}
                              data-testid={`order-product-card-${product.id}`}
                            >
                              <div className="flex gap-3 p-2.5">
                                <button
                                  className="shrink-0 relative"
                                  onClick={() => setInboxDetailProduct(product)}
                                  data-testid={`button-product-detail-${product.id}`}
                                >
                                  <ProductImage src={product.imageUrl} alt={product.name} className="w-20 h-20 rounded-lg" iconClassName="h-7 w-7" fallbackIconColor="text-muted-foreground/40" />
                                  {isSelected && (
                                    <div className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-md animate-in zoom-in duration-150">
                                      {qty}
                                    </div>
                                  )}
                                </button>
                                <div className="flex-1 min-w-0 flex flex-col">
                                  <button
                                    className="text-left min-w-0"
                                    onClick={() => setInboxDetailProduct(product)}
                                    data-testid={`text-product-info-${product.id}`}
                                  >
                                    <p className="text-sm font-semibold leading-tight line-clamp-2 mb-0.5">{product.name}</p>
                                    {product.category && (
                                      <p className="text-[10px] text-muted-foreground/80 truncate uppercase tracking-wide">{product.category}</p>
                                    )}
                                  </button>
                                  <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                                    <div className="min-w-0">
                                      <p className="text-sm font-bold text-foreground tabular-nums">{parseFloat(product.price).toFixed(2)}€</p>
                                      <p className="text-[10px] text-muted-foreground">/{product.unit}</p>
                                    </div>
                                    <QuantityInput
                                      value={qty}
                                      onChange={(val) => {
                                        setOrderItems(prev => {
                                          if (val === 0) {
                                            const { [product.id]: _, ...rest } = prev;
                                            return rest;
                                          }
                                          return { ...prev, [product.id]: val };
                                        });
                                      }}
                                      min={0}
                                      size="sm"
                                      testIdPrefix={`order-qty-${product.id}`}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {filteredOrderProducts.length === 0 && (
                          <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                            <Package className="h-10 w-10 text-muted-foreground/40 mb-2" />
                            <p className="text-sm text-muted-foreground">
                              {inStockSupplierProducts.length === 0
                                ? t("inbox", "noProductsAvailable")
                                : (lang === "de" ? "Keine Produkte gefunden" : "Nessun prodotto trovato")}
                            </p>
                            {inStockSupplierProducts.length > 0 && (orderSearchQuery || orderCategoryFilter !== "all") && (
                              <button
                                className="text-xs text-primary mt-2 hover:underline"
                                onClick={() => { setOrderSearchQuery(""); setOrderCategoryFilter("all"); }}
                                data-testid="button-clear-order-filters"
                              >
                                {lang === "de" ? "Filter zurücksetzen" : "Reimposta filtri"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                    <div className="p-3 border-t border-border bg-background shrink-0">
                      {orderSubmitted ? (
                        <div className="flex items-center justify-center gap-2 py-2 text-green-600 font-semibold animate-in fade-in zoom-in-95 duration-300" data-testid="text-order-success">
                          <CheckCircle className="h-5 w-5" />
                          {t("orders", "orderPlaced")}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {totalOrderItems > 0 && (
                            <div className="flex items-center justify-between text-xs px-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                              <span className="text-muted-foreground">
                                {totalOrderItems} {t("common", "items")}
                              </span>
                              <span className="font-semibold tabular-nums">
                                ≈ {estimatedOrderTotal.toFixed(2)} €
                              </span>
                            </div>
                          )}
                          <Button
                            className="w-full gap-2 h-11 rounded-full font-semibold"
                            disabled={totalOrderItems === 0 || createOrderMutation.isPending}
                            onClick={handleSubmitOrder}
                            data-testid="button-submit-order"
                          >
                            {createOrderMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ShoppingCart className="h-4 w-4" />
                            )}
                            {totalOrderItems === 0
                              ? (lang === "de" ? "Produkte auswählen" : "Seleziona prodotti")
                              : t("inbox", "placeOrderItems")}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : actionMode === "complaint" ? (
                  <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="px-4 pt-4 pb-3 border-b border-border bg-background">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-9 w-9 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm leading-tight truncate">{t("complaints", "newComplaint")}</h3>
                            <p className="text-xs text-muted-foreground truncate">
                              {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => { setActionMode("none"); setTimeout(scrollToBottom, 100); }} data-testid="button-close-complaint">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="flex-1 px-4">
                      <div className="space-y-5 py-4">
                        {/* STEP 1: Order picker as cards */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                            <Label className="text-sm font-semibold m-0">{t("complaints", "selectOrder")}</Label>
                          </div>
                          {supplierOrders && supplierOrders.length > 0 ? (
                            <div className="grid grid-cols-1 gap-1.5">
                              {supplierOrders.slice(0, 8).map((order) => {
                                const isSelected = complaintOrderId === order.id;
                                return (
                                  <button
                                    key={order.id}
                                    onClick={() => { setComplaintOrderId(order.id); setComplaintAffectedItems([]); }}
                                    className={`flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/40"}`}
                                    data-testid={`option-complaint-order-${order.id}`}
                                  >
                                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                      <Package className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium leading-tight truncate">
                                        #{formatOrderNumber(order)}
                                      </p>
                                      <p className="text-[11px] text-muted-foreground">
                                        {formatOrderDate(order.createdAt)}
                                      </p>
                                    </div>
                                    <span className="text-sm font-semibold tabular-nums shrink-0">
                                      {parseFloat(order.totalAmount).toFixed(2)} €
                                    </span>
                                    {isSelected && <Check className="h-4 w-4 text-primary shrink-0 animate-in zoom-in duration-150" />}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-4 rounded-lg border border-dashed border-border bg-muted/30 text-center">
                              <Package className="h-6 w-6 text-muted-foreground/50 mx-auto mb-1" />
                              <p className="text-xs text-muted-foreground">{t("complaints", "noOrdersForSupplier")}</p>
                            </div>
                          )}
                        </div>

                        {/* STEP 2: Affected items */}
                        {complaintOrderId && complaintOrderDetails?.items && complaintOrderDetails.items.length > 0 && (
                          <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                                <Label className="text-sm font-semibold m-0">{lang === "de" ? "Betroffene Produkte" : "Prodotti interessati"}</Label>
                              </div>
                              {complaintAffectedItems.length > 0 && (
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{complaintAffectedItems.length}</Badge>
                              )}
                            </div>
                            <div className="space-y-1 rounded-lg border border-border p-1.5 bg-muted/20">
                              {complaintOrderDetails.items.map((item) => {
                                const isSelected = complaintAffectedItems.some(a => a.productId === (item.productId || item.id));
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => toggleAffectedItem({
                                      productId: item.productId || item.id,
                                      productName: item.productName,
                                      quantity: item.quantity,
                                      unitPrice: item.unitPrice,
                                    })}
                                    className={`w-full flex items-center gap-2.5 p-2 rounded-md transition-all text-left ${isSelected ? "bg-red-50 dark:bg-red-950/30 ring-1 ring-red-200 dark:ring-red-800" : "hover:bg-muted/60"}`}
                                    data-testid={`affected-item-${item.productId || item.id}`}
                                  >
                                    <div className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-red-500 border-red-500" : "border-muted-foreground/30"}`}>
                                      {isSelected && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <span className="flex-1 text-sm font-medium truncate">{item.productName}</span>
                                    <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{item.quantity}× {parseFloat(item.unitPrice).toFixed(2)}€</span>
                                  </button>
                                );
                              })}
                            </div>
                            {complaintAffectedItems.length > 0 && (
                              <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 animate-in fade-in duration-200">
                                <RefreshCw className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
                                <span className="text-[11px] text-orange-700 dark:text-orange-300">
                                  {lang === "de"
                                    ? `Nachlieferung für ${complaintAffectedItems.length} Produkt(e) wird angefragt`
                                    : `Riconsegna per ${complaintAffectedItems.length} prodotto/i verra richiesta`}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* STEP 2.5: Reason (mandatory) */}
                        <div className={`space-y-2 transition-opacity ${complaintOrderId ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
                          <div className="flex items-center gap-2">
                            <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                            <Label className="text-sm font-semibold m-0">{lang === "de" ? "Grund (Pflichtfeld)" : "Motivo (obbligatorio)"}</Label>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {COMPLAINT_REASONS.map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setComplaintReason(r)}
                                disabled={!complaintOrderId}
                                className={`flex items-center justify-center px-2 py-2 rounded-lg text-xs font-medium border transition-all ${complaintReason === r ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card hover:bg-muted text-muted-foreground"}`}
                                data-testid={`button-inbox-reason-${r}`}
                              >
                                {getComplaintReasonLabel(r, lang)}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* STEP 4: Title + Description */}
                        <div className={`space-y-3 transition-opacity ${complaintOrderId ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
                          <div className="flex items-center gap-2">
                            <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">4</span>
                            <Label className="text-sm font-semibold m-0">{lang === "de" ? "Beschreibung" : "Descrizione"}</Label>
                          </div>
                          <Input
                            placeholder={t("complaints", "subjectPlaceholder")}
                            value={complaintTitle}
                            onChange={(e) => setComplaintTitle(e.target.value)}
                            disabled={!complaintOrderId}
                            className="h-10"
                            data-testid="input-complaint-title"
                          />
                          <Textarea
                            placeholder={t("complaints", "descriptionPlaceholder")}
                            value={complaintDescription}
                            onChange={(e) => setComplaintDescription(e.target.value)}
                            rows={4}
                            disabled={!complaintOrderId}
                            data-testid="textarea-complaint-description"
                          />
                        </div>

                        {/* STEP 4: Priority */}
                        <button
                          type="button"
                          onClick={() => setComplaintPriorityImmediate(v => !v)}
                          disabled={!complaintOrderId}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${complaintPriorityImmediate ? "border-red-400 bg-red-50 dark:bg-red-950/30 shadow-sm" : "border-border hover:border-red-200"} ${!complaintOrderId ? "opacity-50 pointer-events-none" : ""}`}
                          data-testid="checkbox-priority-immediate"
                        >
                          <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${complaintPriorityImmediate ? "bg-red-500 text-white" : "bg-muted text-muted-foreground"}`}>
                            <AlertTriangle className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${complaintPriorityImmediate ? "text-red-600 dark:text-red-400" : ""}`}>
                              {lang === "de" ? "Dringend" : "Urgente"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {lang === "de" ? "Lieferant wird sofort benachrichtigt" : "Il fornitore verra avvisato subito"}
                            </p>
                          </div>
                          <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${complaintPriorityImmediate ? "bg-red-500 border-red-500" : "border-muted-foreground/30"}`}>
                            {complaintPriorityImmediate && <Check className="h-3 w-3 text-white" />}
                          </div>
                        </button>
                      </div>
                    </ScrollArea>
                    <div className="p-3 border-t border-border bg-background shrink-0">
                      <Button
                        className="w-full gap-2 h-11 rounded-full font-semibold"
                        variant="destructive"
                        disabled={!complaintOrderId || !complaintReason || !complaintTitle.trim() || !complaintDescription.trim() || createComplaintMutation.isPending}
                        onClick={handleSubmitComplaint}
                        data-testid="button-submit-complaint"
                      >
                        {createComplaintMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        {createComplaintMutation.isPending ? t("complaints", "sending") : t("complaints", "submitComplaint")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-border p-3 md:p-4 md:rounded-none md:shadow-none md:border-t md:border-x-0 md:mb-0 md:mx-0 floating-message-bar mobile-message-pill">
                  {replyToMessage && (
                    <div className="flex items-center gap-2 mb-3 px-1" data-testid="attached-reply-ref">
                      <div className="flex-1 min-w-0 bg-muted/60 border-l-3 border-foreground rounded-md px-3 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-primary truncate">{replyToMessage.senderName}</p>
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

                  {messagePriority === "important" && (
                    <div className="flex items-center justify-between gap-2 mb-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" data-testid="priority-important-banner">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
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
                  {!messageText && !replyToMessage && !attachedOrderRef && !attachedComplaintRef && quickReplySuggestions.length > 0 && (
                    <QuickReplyChips
                      suggestions={quickReplySuggestions}
                      onPick={(s) => {
                        if (!selectedConversation) return;
                        sendMessageMutation.mutate({ content: s, messageType: "text", priority: messagePriority });
                      }}
                      testIdPrefix="restaurant-quick-reply"
                    />
                  )}
                  <div className="flex gap-2 items-center">
                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-full shrink-0" data-testid="button-quick-actions">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="start">
                        <button
                          className="w-full flex items-center gap-2 p-2 rounded-md text-sm hover-elevate text-left"
                          onClick={() => {
                            setActionMode("order");
                            setPopoverOpen(false);
                          }}
                          data-testid="button-new-order"
                        >
                          <ShoppingCart className="h-4 w-4" />
                          {t("inbox", "orderMessage")}
                        </button>
                        <button
                          className="w-full flex items-center gap-2 p-2 rounded-md text-sm hover-elevate text-left"
                          onClick={() => {
                            setActionMode("complaint");
                            setComplaintOrderId("");
                            setComplaintTitle("");
                            setComplaintDescription("");
                            setComplaintPriorityImmediate(false);
                            setPopoverOpen(false);
                          }}
                          data-testid="button-new-complaint"
                        >
                          <AlertCircle className="h-4 w-4" />
                          {t("complaints", "newComplaint")}
                        </button>
                        <Separator className="my-1" />
                        <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {lang === "de" ? "Priorität" : "Priorità"}
                        </p>
                        <button
                          className={`w-full flex items-center gap-2.5 p-2 rounded-md text-sm text-left ${messagePriority === "standard" ? "bg-muted" : "hover-elevate"}`}
                          onClick={() => { setMessagePriority("standard"); setPopoverOpen(false); }}
                          data-testid="button-priority-standard"
                        >
                          <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 min-w-0">Standard</span>
                          {messagePriority === "standard" && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                        <button
                          className={`w-full flex items-center gap-2.5 p-2 rounded-md text-sm text-left ${messagePriority === "important" ? "bg-muted" : "hover-elevate"}`}
                          onClick={() => { setMessagePriority("important"); setPopoverOpen(false); }}
                          data-testid="button-priority-important"
                        >
                          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                          <span className="flex-1 min-w-0">{lang === "de" ? "Dringend" : "Urgente"}</span>
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
                      placeholder={t("inbox", "typeMessage")}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="rounded-full min-h-12 md:min-h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
                      data-testid="input-message"
                    />
                    {!messageText.trim() ? (
                      <VoiceRecorder onSend={handleSendVoice} isSending={isUploadingVoice || sendMessageMutation.isPending} lang={lang as "de" | "it"} />
                    ) : (
                      <Button
                        onClick={handleSendMessage}
                        disabled={!messageText.trim() || sendMessageMutation.isPending}
                        className="rounded-full shrink-0 h-12 w-12 md:h-10 md:w-10"
                        size="icon"
                        data-testid="button-send-message"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </ChatDropZone>
            ) : (
              <div className="flex-1 flex flex-col h-full min-h-[calc(100dvh-200px)]">
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
                    <p className="text-lg font-medium">{t("inbox", "selectConversation")}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("inbox", "selectConversationDesc")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={!!orderDetailId} onOpenChange={(open) => !open && setOrderDetailId(null)}>
        <DialogContent className="gap-0 max-w-lg max-h-[85vh] overflow-y-auto p-0" aria-describedby={undefined}>
          <DialogHeader className="sr-only"><DialogTitle>{lang === "de" ? "Bestelldetails" : "Dettagli ordine"}</DialogTitle></DialogHeader>
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{lang === "de" ? "Bestellung" : "Ordine"}</p>
                <h2 className="text-lg font-semibold tracking-tight" data-testid="text-order-id">#{formatOrderNumber(orderDetail)}</h2>
              </div>
              {orderDetail && (
                <Badge className={getStatusColor(orderDetail.status)} data-testid="badge-order-status">
                  {getOrderStatus(orderDetail.status, lang)}
                </Badge>
              )}
            </div>
          </div>
          {orderDetail && (
            <div className="px-6 pb-6 space-y-5">
              {orderDetail.supplier && (
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={orderDetail.supplier.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
                      {orderDetail.supplier.companyName?.substring(0, 2).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-sm">{orderDetail.supplier.companyName || t("common", "supplier")}</div>
                    <div className="text-xs text-muted-foreground">{t("common", "supplier")}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">{t("orders", "createdAt")}</div>
                  <div className="text-sm font-medium">{format(new Date(orderDetail.createdAt), "dd.MM.yyyy", { locale: dateLocale })}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(orderDetail.createdAt), "HH:mm", { locale: dateLocale })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">{t("orders", "lastChange")}</div>
                  <div className="text-sm font-medium">{format(new Date(orderDetail.updatedAt), "dd.MM.yyyy", { locale: dateLocale })}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(orderDetail.updatedAt), "HH:mm", { locale: dateLocale })}</div>
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
                  {t("orders", "statusHistory")}
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
                  {t("common", "products")} ({orderDetail.items.length})
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
                        {(item as any).confirmedQuantity != null && (item as any).confirmedQuantity < item.quantity && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="h-3 w-3 text-orange-500" />
                            <span className="text-[10px] text-orange-600">
                              {lang === "it" ? "Confermato" : "Bestätigt"}: {(item as any).confirmedQuantity}/{item.quantity}
                              {(item as any).rejectedQuantity > 0 && (
                                <span className="text-red-500 ml-1">(-{(item as any).rejectedQuantity})</span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-semibold whitespace-nowrap">{parseFloat(item.totalPrice).toFixed(2)}€</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center gap-2 px-3 py-3 border-t bg-muted/30">
                    <span className="text-sm font-bold">{t("orders", "totalAmount")}</span>
                    <span className="text-base font-bold">{parseFloat(orderDetail.totalAmount).toFixed(2)}€</span>
                  </div>
                </div>
              </div>

              {orderDetail.notes && (
                <div>
                  <h4 className="font-medium mb-2 text-sm text-muted-foreground">{t("orders", "notes")}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{orderDetail.notes}</p>
                </div>
              )}

              {(orderDetail.status === "in_delivery" || orderDetail.status === "scheduled") && (
                <Button
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => {
                    const a = document.createElement("a"); a.href = `/api/orders/${orderDetail.id}/delivery-note/download`; a.setAttribute("download", ""); document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  }}
                  data-testid="button-download-delivery-note"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {lang === "de" ? "Lieferschein herunterladen" : "Scarica bolla"}
                </Button>
              )}

              {orderDetail.status === "pending" && (
                <Button
                  className="w-full rounded-xl"
                  onClick={() => openEditOrderInbox(orderDetail)}
                  data-testid="button-edit-order-inbox"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  {t("orders", "editOrder")}
                </Button>
              )}

              {(orderDetail.status === "pending" || orderDetail.status === "confirmed" || orderDetail.status === "partially_confirmed") && (
                <>
                  {!showCancelOrderConfirm ? (
                    <Button
                      variant="destructive"
                      className="w-full rounded-xl"
                      onClick={() => setShowCancelOrderConfirm(true)}
                      data-testid="button-cancel-order-inbox"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {t("orders", "cancelOrder")}
                    </Button>
                  ) : (
                    <div className="p-4 rounded-xl border border-destructive/20 space-y-3">
                      <p className="text-sm font-medium text-destructive">{t("orders", "confirmCancel")}</p>
                      <p className="text-xs text-muted-foreground">{t("orders", "cancelWarning")}</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-lg"
                          onClick={() => setShowCancelOrderConfirm(false)}
                          data-testid="button-cancel-order-abort"
                        >
                          {t("common", "cancel")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1 rounded-lg"
                          onClick={() => cancelOrderMutation.mutate(orderDetail.id)}
                          disabled={cancelOrderMutation.isPending}
                          data-testid="button-cancel-order-confirm"
                        >
                          {cancelOrderMutation.isPending ? t("inbox", "cancelling") : t("inbox", "yesCancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
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
        <DialogContent className="gap-0 max-w-lg max-h-[85vh] overflow-y-auto p-0" aria-describedby={undefined}>
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
              <p className="text-sm font-medium text-destructive">{t("inbox", "loadError")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("inbox", "complaintLoadError")}</p>
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
                    <AvatarImage src={complaintDetail.supplier?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-sm font-semibold">
                      {complaintDetail.supplier?.companyName?.substring(0, 2).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-sm">{complaintDetail.supplier?.companyName || t("common", "supplier")}</div>
                    <div className="text-xs text-muted-foreground">{complaintDetail.supplier?.email}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">{t("orders", "createdAt")}</div>
                    <div className="text-sm font-medium">{format(new Date(complaintDetail.createdAt), "dd.MM.yyyy", { locale: dateLocale })}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(complaintDetail.createdAt), "HH:mm", { locale: dateLocale })}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">{t("orders", "lastChange")}</div>
                    <div className="text-sm font-medium">{format(new Date(complaintDetail.updatedAt), "dd.MM.yyyy", { locale: dateLocale })}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(complaintDetail.updatedAt), "HH:mm", { locale: dateLocale })}</div>
                  </div>
                </div>

                <div>
                  {(complaintDetail as any).priority === "urgent" && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                        {lang === "de" ? "Dringende Reklamation" : "Reclamo urgente"}
                      </span>
                    </div>
                  )}
                  <h4 className="font-semibold text-base mb-2" data-testid="text-complaint-title">{complaintDetail.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-complaint-description">{complaintDetail.description}</p>

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
                    <h4 className="font-medium text-sm mb-2 text-muted-foreground">{t("complaints", "attachments")}</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {complaintDetail.mediaUrls.map((url: string, idx: number) => (
                        <a key={idx} href={getMediaSrc(url)} rel="noopener noreferrer" className="block aspect-square rounded-xl overflow-hidden border hover-elevate">
                          {isVideoFile(url) ? (
                            <div className="h-full w-full flex items-center justify-center bg-muted">
                              <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                          ) : (
                            <img 
                              src={getMediaSrc(url)} 
                              alt={`${t("complaints", "attachment")} ${idx + 1}`}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">{t("complaints", "affectedOrder")}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{complaintDetail.order ? formatOrderNumber(complaintDetail.order) : formatOrderNumber({orderNumber: null, id: complaintDetail.orderId})}</Badge>
                    {complaintDetail.order && (
                      <span className="text-sm text-muted-foreground">{parseFloat(complaintDetail.order.totalAmount).toFixed(2)}€</span>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {t("orders", "statusHistory")}
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
                    {t("complaints", "comments")} ({complaintComments?.length || 0})
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
                              <span className="text-sm font-medium">{comment.user?.companyName || comment.user?.name || t("common", "unknown")}</span>
                              <Badge variant="outline" className="text-xs">
                                {comment.user?.role === "supplier" ? t("common", "supplier") : t("common", "restaurant")}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(comment.createdAt), "dd.MM. HH:mm", { locale: dateLocale })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground ml-8">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("complaints", "noComments")}</p>
                  )}
                </div>

                {complaintDetail.status !== "closed" && complaintDetail.status !== "resolved" && (
                  <div className="space-y-2 pt-2">
                    <Label className="text-sm">{t("complaints", "addComment")}</Label>
                    <div className="flex gap-2">
                      <Textarea
                        value={newComplaintComment}
                        onChange={(e) => setNewComplaintComment(e.target.value)}
                        placeholder={t("complaints", "commentPlaceholder")}
                        rows={2}
                        className="flex-1"
                        data-testid="input-inbox-complaint-comment"
                      />
                      <Button
                        size="icon"
                        onClick={() => selectedComplaintId && addComplaintCommentMutation.mutate({ complaintId: selectedComplaintId, content: newComplaintComment.trim() })}
                        disabled={!newComplaintComment.trim() || addComplaintCommentMutation.isPending}
                        data-testid="button-inbox-send-complaint-comment"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {(complaintDetail.status === "resolved" || complaintDetail.status === "closed") && (
                  <Button
                    variant="outline"
                    className="w-full rounded-xl"
                    onClick={() => selectedComplaintId && reopenComplaintMutation.mutate(selectedComplaintId)}
                    disabled={reopenComplaintMutation.isPending}
                    data-testid="button-reopen-complaint"
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {lang === "de" ? "Reklamation wieder öffnen" : "Riapri reclamo"}
                  </Button>
                )}

                {complaintDetail.status === "open" && (
                  <>
                    {!showWithdrawComplaintConfirm ? (
                      <Button
                        variant="destructive"
                        className="w-full rounded-xl"
                        onClick={() => setShowWithdrawComplaintConfirm(true)}
                        data-testid="button-withdraw-complaint-inbox"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        {t("complaints", "withdrawComplaint")}
                      </Button>
                    ) : (
                      <div className="p-4 rounded-xl border border-destructive/20 space-y-3">
                        <p className="text-sm font-medium text-destructive">{t("complaints", "confirmWithdraw")}</p>
                        <p className="text-xs text-muted-foreground">{t("complaints", "withdrawWarning")}</p>
                        <Textarea
                          value={withdrawCloseNote}
                          onChange={(e) => setWithdrawCloseNote(e.target.value)}
                          placeholder={lang === "de" ? "Grund für den Rückzug (Pflichtfeld)" : "Motivo del ritiro (obbligatorio)"}
                          className="min-h-[72px] rounded-lg"
                          data-testid="input-withdraw-close-note"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-lg"
                            onClick={() => { setShowWithdrawComplaintConfirm(false); setWithdrawCloseNote(""); }}
                            data-testid="button-withdraw-complaint-abort"
                          >
                            {t("common", "cancel")}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="flex-1 rounded-lg"
                            onClick={() => selectedComplaintId && withdrawCloseNote.trim() && withdrawComplaintMutation.mutate({ id: selectedComplaintId, closeNote: withdrawCloseNote.trim() })}
                            disabled={withdrawComplaintMutation.isPending || !withdrawCloseNote.trim()}
                            data-testid="button-withdraw-complaint-confirm"
                          >
                            {withdrawComplaintMutation.isPending ? t("inbox", "closing") : t("inbox", "yesWithdraw")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 px-6 text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">{t("inbox", "complaintNotFound")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOrderInbox} onOpenChange={(open) => !open && setEditingOrderInbox(null)}>
        <DialogContent className="p-0 gap-0 max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("orders", "editOrder")}</DialogTitle>
          </DialogHeader>

          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              <h3 className="text-sm font-semibold">{t("orders", "editOrder")}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 pl-6">
              {t("orders", "order")} #{formatOrderNumber(editingOrderInbox)}
            </p>
          </div>

          <div className="space-y-4 px-6 pb-6">
            <div>
              <Label className="text-sm font-medium mb-2 block">{t("orders", "orderItems")}</Label>
              <div className="space-y-2">
                {editItemsInbox.map((item: any, index) => (
                  <div key={item.id} className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/30" data-testid={`inbox-edit-item-${item.productId}`}>
                    <ProductImage src={item.productImageUrl} className="h-9 w-9 rounded" iconClassName="h-4 w-4" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{parseFloat(item.unitPrice).toFixed(2)}€ {t("orders", "perUnit")}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <QuantityInput
                        value={item.quantity}
                        onChange={(val) => {
                          const newItems = [...editItemsInbox];
                          newItems[index] = { ...newItems[index], quantity: val, totalPrice: (val * parseFloat(newItems[index].unitPrice)).toFixed(2) };
                          setEditItemsInbox(newItems);
                        }}
                        min={1}
                        size="md"
                        testIdPrefix={`inbox-qty-${item.productId}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEditItemInbox(index)}
                        disabled={editItemsInbox.length <= 1}
                        data-testid={`inbox-button-remove-${item.productId}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <span className="text-sm font-medium w-16 text-right">{item.totalPrice}€</span>
                  </div>
                ))}
              </div>
            </div>

            {addableProductsInbox.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <PackagePlus className="h-3.5 w-3.5" />
                  {t("orders", "addProduct")}
                </Label>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={t("inbox", "searchProduct")}
                    value={editProductSearchInbox}
                    onChange={(e) => setEditProductSearchInbox(e.target.value)}
                    className="pl-8"
                    data-testid="inbox-input-search-add-product"
                  />
                </div>
                {(editProductSearchInbox.trim() ? filteredAddableProductsInbox : addableProductsInbox.slice(0, 5)).length > 0 ? (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {(editProductSearchInbox.trim() ? filteredAddableProductsInbox : addableProductsInbox.slice(0, 5)).map(product => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate cursor-pointer bg-muted/30"
                        onClick={() => addProductToEditInbox(product)}
                        data-testid={`inbox-add-product-${product.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{parseFloat(product.price).toFixed(2)}€ / {product.unit || t("common", "piece")}</p>
                        </div>
                        <Button variant="ghost" size="icon" data-testid={`inbox-button-add-product-${product.id}`}>
                          <Plus className="h-4 w-4 text-primary" />
                        </Button>
                      </div>
                    ))}
                    {!editProductSearchInbox.trim() && addableProductsInbox.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        {addableProductsInbox.length - 5} {t("orders", "moreProductsAvailable")}
                      </p>
                    )}
                  </div>
                ) : editProductSearchInbox.trim() ? (
                  <p className="text-xs text-muted-foreground py-2">{t("orders", "noMatchingProducts")}</p>
                ) : null}
              </div>
            )}

            <Separator />

            <div>
              <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {t("cart", "deliveryDate")}
              </Label>
              <div className="space-y-2">
                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                    editDeliveryOptionInbox === "asap" ? "border-primary/50 bg-primary/5" : "border-border"
                  }`}
                  data-testid="inbox-edit-radio-delivery-asap"
                >
                  <input
                    type="radio"
                    name="inboxEditDeliveryOption"
                    checked={editDeliveryOptionInbox === "asap"}
                    onChange={() => { setEditDeliveryOptionInbox("asap"); setEditSelectedDeliveryDateInbox(""); }}
                    className="accent-primary"
                  />
                  <Zap className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm">{t("cart", "asap")}</span>
                </label>
                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                    editDeliveryOptionInbox === "date" ? "border-primary/50 bg-primary/5" : "border-border"
                  }`}
                  data-testid="inbox-edit-radio-delivery-date"
                >
                  <input
                    type="radio"
                    name="inboxEditDeliveryOption"
                    checked={editDeliveryOptionInbox === "date"}
                    onChange={() => setEditDeliveryOptionInbox("date")}
                    className="accent-primary"
                  />
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{t("cart", "selectDeliveryDay")}</span>
                </label>
              </div>
              {editDeliveryOptionInbox === "date" && (
                <div className="pt-2">
                  {editAvailableDeliveryDatesInbox.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {editAvailableDeliveryDatesInbox.map(date => (
                        <label
                          key={date.value}
                          className={`flex items-center gap-2.5 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                            editSelectedDeliveryDateInbox === date.value
                              ? "border-primary/50 bg-primary/5"
                              : "border-border"
                          }`}
                          data-testid={`inbox-edit-delivery-date-${date.value}`}
                        >
                          <input
                            type="radio"
                            name="inboxEditDeliveryDate"
                            checked={editSelectedDeliveryDateInbox === date.value}
                            onChange={() => setEditSelectedDeliveryDateInbox(date.value)}
                            className="accent-primary"
                          />
                          <span>{date.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">
                      {t("cart", "noDeliveryDays")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("orders", "totalAmount")}</span>
              <span className="text-lg font-bold" data-testid="inbox-text-edit-total">{editTotalInbox}€</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-lg" onClick={() => setEditingOrderInbox(null)} data-testid="inbox-button-cancel-edit">
              {t("common", "cancel")}
            </Button>
            <Button
              className="flex-1 rounded-lg"
              onClick={() => {
                if (!editingOrderInbox) return;
                const deliveryDate = editDeliveryOptionInbox === "date" && editSelectedDeliveryDateInbox ? editSelectedDeliveryDateInbox : null;
                updateOrderItemsInboxMutation.mutate({ orderId: editingOrderInbox.id, items: editItemsInbox, requestedDeliveryDate: deliveryDate });
              }}
              disabled={editItemsInbox.length === 0 || updateOrderItemsInboxMutation.isPending || (editDeliveryOptionInbox === "date" && !editSelectedDeliveryDateInbox)}
              data-testid="inbox-button-save-edit"
            >
              {updateOrderItemsInboxMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("orders", "saveChanges")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProductDetailDialog
        product={inboxDetailProduct}
        open={!!inboxDetailProduct}
        onOpenChange={(open) => !open && setInboxDetailProduct(null)}
        supplierName={selectedConv?.otherUser?.companyName || selectedConv?.otherUser?.name}
      />
    </div>
  );
}
