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
import { Send, MessageSquare, Search, Check, CheckCheck, Plus, ShoppingCart, ShoppingBag, X, Minus, Package, Phone, ClipboardList, Eye, AlertCircle, ArrowLeft, Settings, Clock, Loader2, CheckCircle, XCircle, FileText, Download, Paperclip, Pencil, Truck, Trash2, CalendarDays, Zap, PackagePlus, Tag, Calendar } from "lucide-react";
import { AttachmentPopover, AttachmentMessageCard } from "@/components/ChatAttachment";
import { StatusTimeline } from "@/components/StatusTimeline";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConversationWithUser, Message, Product, Order, ComplaintWithDetails, ComplaintCommentWithUser, OrderStatusHistoryWithUser, ComplaintStatusHistoryWithUser, DeliverySchedule } from "@shared/schema";
import { format, isToday, isYesterday, isSameDay, addDays, startOfDay } from "date-fns";
import { de, it } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProductDetailDialog from "@/components/ProductDetailDialog";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus, getComplaintStatus } from "@/lib/translations";

type ActionMode = "none" | "order" | "complaint";

interface OrderContent {
  items: { name: string; quantity: number; price: string }[];
  total: string;
}

interface ComplaintContent {
  title: string;
  description: string;
  orderId: string;
  complaintId?: string;
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
    case "in_delivery": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
};

const getStatusCardBg = (status: string) => {
  switch (status) {
    case "pending": return { card: "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40", header: "bg-yellow-500/10 border-yellow-500/20", icon: "text-yellow-600 dark:text-yellow-400" };
    case "confirmed": return { card: "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40", header: "bg-blue-500/10 border-blue-500/20", icon: "text-blue-600 dark:text-blue-400" };
    case "in_delivery": return { card: "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40", header: "bg-purple-500/10 border-purple-500/20", icon: "text-purple-600 dark:text-purple-400" };
    case "delivered": return { card: "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40", header: "bg-green-500/10 border-green-500/20", icon: "text-green-600 dark:text-green-400" };
    case "cancelled": return { card: "bg-red-50/40 dark:bg-red-950/15 border-red-200 dark:border-red-800/40", header: "bg-red-500/10 border-red-500/20", icon: "text-red-600 dark:text-red-400" };
    default: return { card: "bg-card border-green-500/30", header: "bg-green-500/10 border-green-500/20", icon: "text-green-600 dark:text-green-400" };
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "pending": return "Neu";
    case "confirmed": return "Bestätigt";
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
    default: return status;
  }
};

const getComplaintStatusColor = (status: string) => {
  switch (status) {
    case "open": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "in_progress": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "resolved": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "closed": return "bg-muted text-muted-foreground";
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
  const { currentUser } = useUser();
  const { setIsInChat } = useChat();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateLocale = lang === "it" ? it : de;
  const [location, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionMode, setActionMode] = useState<ActionMode>("none");
  const [inboxDetailProduct, setInboxDetailProduct] = useState<any>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [openActionsPopover, setOpenActionsPopover] = useState(false);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
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
  const [complaintDescription, setComplaintDescription] = useState("");
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [showComplaintDetail, setShowComplaintDetail] = useState(false);
  const [loadingComplaintDetail, setLoadingComplaintDetail] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchString = useSearch();

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setIsInChat(isMobile && selectedConversation !== null);
    return () => setIsInChat(false);
  }, [selectedConversation, setIsInChat]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const toSupplierId = params.get("to");
    if (toSupplierId && currentUser?.id) {
      setPendingSupplierRedirect(toSupplierId);
    }
    const conversationIdParam = params.get("conversationId");
    if (conversationIdParam) {
      setSelectedConversation(conversationIdParam);
    }
    const complaintIdParam = params.get("complaintId");
    if (complaintIdParam) {
      setSelectedComplaintId(complaintIdParam);
      setShowComplaintDetail(true);
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
    return addableProductsInbox.filter(p => p.name.toLowerCase().includes(search));
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
      toast({ title: t("orders", "orderUpdated"), description: t("orders", "orderUpdatedDesc") });
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const { data: conversations, isLoading: conversationsLoading } = useQuery<ConversationWithUser[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: [`/api/conversations/${selectedConversation}/messages`],
    enabled: !!selectedConversation,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });

  const prevMessageCountRef = useRef<number>(0);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (messages && messages.length > 0) {
      const currentCount = messages.length;
      if (prevMessageCountRef.current > 0 && currentCount > prevMessageCountRef.current) {
        const newIds = new Set<string>();
        const newMessages = messages.slice(prevMessageCountRef.current);
        newMessages.forEach(m => {
          if (m.senderId !== currentUser?.id) {
            newIds.add(m.id);
          }
        });
        if (newIds.size > 0) {
          setNewMessageIds(newIds);
          setTimeout(() => setNewMessageIds(new Set()), 2000);
        }
      }
      prevMessageCountRef.current = currentCount;
    }
  }, [messages, currentUser?.id]);

  useEffect(() => {
    prevMessageCountRef.current = 0;
    setNewMessageIds(new Set());
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
    (o: any) => o.supplierId === supplierId && ["pending", "confirmed", "in_delivery"].includes(o.status)
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
    if (currentUser?.id) {
      markAsReadMutation.mutate(conversationId);
      apiRequest("PATCH", `/api/notifications/read-by-reference?userId=${currentUser.id}&referenceId=${conversationId}&type=new_message`).then(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/notifications?userId=${currentUser.id}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/notifications/count?userId=${currentUser.id}`] });
      }).catch(() => {});
    }
  };

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, messageType = "text" }: { content: string; messageType?: string }) => {
      return apiRequest("POST", `/api/conversations/${selectedConversation}/messages`, {
        content,
        messageType,
        senderId: currentUser?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      setMessageText("");
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
      return apiRequest("POST", "/api/orders/direct", {
        restaurantId: currentUser?.id,
        supplierId,
        items,
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
      toast({
        title: t("orders", "orderPlaced"),
        description: t("orders", "orderPlacedDesc"),
      });
      setOrderItems({});
      setActionMode("none");
      setTimeout(scrollToBottom, 200);
    },
    onError: () => {
      toast({
        title: t("common", "error"),
        description: t("orders", "orderPlaceError"),
        variant: "destructive",
      });
    },
  });

  const createComplaintMutation = useMutation({
    mutationFn: async (data: { orderId: string; restaurantId: string; supplierId: string; title: string; description: string }) => {
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
      setActionMode("none");
    },
    onError: () => {
      toast({
        title: t("common", "error"),
        description: t("complaints", "complaintSendError"),
        variant: "destructive",
      });
    },
  });

  const handleSubmitComplaint = () => {
    if (!complaintOrderId || !complaintTitle.trim() || !complaintDescription.trim() || !supplierId) return;
    createComplaintMutation.mutate({
      orderId: complaintOrderId,
      restaurantId: currentUser!.id,
      supplierId,
      title: complaintTitle.trim(),
      description: complaintDescription.trim(),
    });
  };

  const [showCancelOrderConfirm, setShowCancelOrderConfirm] = useState(false);
  const [showWithdrawComplaintConfirm, setShowWithdrawComplaintConfirm] = useState(false);
  const [newComplaintComment, setNewComplaintComment] = useState("");

  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, { status: "cancelled", changedBy: currentUser?.id });
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
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
      setShowCancelOrderConfirm(false);
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
      toast({ title: lang === "it" ? "Richiesta inviata" : "Anfrage gesendet", description: lang === "it" ? "La richiesta di modifica è stata inviata al fornitore." : "Die Änderungsanfrage wurde an den Lieferanten gesendet." });
      setCardWizard(null);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'messages'] });
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
    },
    onError: () => {
      toast({ title: t("common", "error"), description: lang === "it" ? "La richiesta non è stata inviata." : "Die Anfrage konnte nicht gesendet werden.", variant: "destructive" });
    },
  });

  const withdrawComplaintMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, { status: "closed", changedBy: currentUser?.id });
    },
    onSuccess: () => {
      toast({ title: t("complaints", "complaintWithdrawn"), description: t("complaints", "complaintWithdrawnDesc") });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId] });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId, "status-history"] });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
      setShowWithdrawComplaintConfirm(false);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("complaints", "withdrawError"), variant: "destructive" });
    },
  });

  const reopenComplaintMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, { status: "open", changedBy: currentUser?.id });
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
    conv.otherUser.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.otherUser.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = () => {
    if (messageText.trim() && selectedConversation) {
      sendMessageMutation.mutate({ content: messageText.trim(), messageType: "text" });
    }
  };

  const handleSendAttachment = (content: string) => {
    if (selectedConversation) {
      sendMessageMutation.mutate({ content, messageType: "attachment" });
    }
  };

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
    const items = Object.entries(orderItems).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
    if (items.length > 0) {
      createOrderMutation.mutate(items);
    }
  };

  const totalOrderItems = Object.values(orderItems).reduce((sum, qty) => sum + qty, 0);

  const handleBackToList = () => {
    setSelectedConversation(null);
  };

  return (
    <div className={`${selectedConversation ? 'h-dvh md:h-[calc(100dvh-8rem)]' : 'h-[calc(100dvh-8rem)]'} flex flex-col`}>
      <div className={`mb-3 md:mb-4 shrink-0 ${selectedConversation ? 'hidden md:block' : ''}`}>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">{t("inbox", "title")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground">{t("inbox", "subtitle")}</p>
      </div>

      <Card className={`${selectedConversation ? 'flex-1 border-0 md:border rounded-none md:rounded-lg' : 'flex-1'} flex flex-col overflow-hidden`}>
        <div className="flex flex-1 min-h-0">
          <div className={`w-full md:w-72 lg:w-80 border-r border-border flex flex-col min-h-0 ${selectedConversation ? 'hidden md:flex' : 'flex'}`}>
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
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-2 pb-2">
                {conversationsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : filteredConversations && filteredConversations.length > 0 ? (
                  <div className="space-y-0.5">
                    {filteredConversations.map((conv) => {
                      const lastMessageTime = conv.lastMessage?.createdAt 
                        ? format(new Date(conv.lastMessage.createdAt), isToday(new Date(conv.lastMessage.createdAt)) ? "HH:mm" : "dd.MM.")
                        : "";
                      let msgPreviewText = conv.lastMessage?.content || t("inbox", "noConversations");
                      try {
                        const parsed = JSON.parse(conv.lastMessage?.content || "");
                        if (parsed.refType && parsed.text) msgPreviewText = parsed.text;
                      } catch {}
                      const messagePreview = conv.lastMessage?.messageType === "order" 
                        ? t("inbox", "orderMessage") 
                        : conv.lastMessage?.messageType === "complaint"
                        ? t("inbox", "complaintMessage")
                        : conv.lastMessage?.messageType === "document"
                        ? t("inbox", "documentMessage")
                        : conv.lastMessage?.messageType === "order_change_request"
                        ? t("inbox", "changeRequest")
                        : conv.lastMessage?.messageType === "promotion"
                        ? t("promotionsPage", "promotionMessage")
                        : conv.lastMessage?.messageType === "attachment"
                        ? t("inbox", "file")
                        : msgPreviewText;
                      const hasUnread = conv.unreadCount > 0;
                      return (
                        <button
                          key={conv.id}
                          onClick={() => {
                            handleSelectConversation(conv.id);
                            setActionMode("none");
                            setOrderItems({});
                          }}
                          className={`w-full p-2.5 rounded-md text-left transition-colors hover-elevate overflow-hidden ${
                            selectedConversation === conv.id
                              ? "bg-primary/10"
                              : hasUnread
                              ? "bg-primary/5"
                              : ""
                          }`}
                          data-testid={`conversation-${conv.id}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="relative shrink-0">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={conv.otherUser.profileImageUrl || undefined} alt={conv.otherUser.name} />
                                <AvatarFallback className="bg-secondary/20 text-secondary text-sm">
                                  {conv.otherUser.companyName?.charAt(0) || conv.otherUser.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              {hasUnread && (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background animate-pulse" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-sm truncate flex-1 min-w-0 ${hasUnread ? "font-bold text-foreground" : "font-medium"}`}>
                                  {conv.otherUser.companyName || conv.otherUser.name}
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {lastMessageTime && (
                                    <span className={`text-[10px] ${hasUnread ? "text-primary font-semibold" : "text-muted-foreground"}`}>{lastMessageTime}</span>
                                  )}
                                  {hasUnread && (
                                    <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                                      {conv.unreadCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className={`text-xs truncate max-w-full ${hasUnread ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                                {messagePreview}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                    <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">{t("inbox", "noConversations")}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`flex-1 flex flex-col ${selectedConversation ? 'flex' : 'hidden md:flex'}`}>
            {selectedConversation && selectedConv ? (
              <>
                <div className="border-b border-border px-3 py-2.5 md:p-4 bg-background">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 md:gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden h-8 w-8"
                        onClick={handleBackToList}
                        data-testid="button-back-to-list"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Avatar className="h-9 w-9 md:h-10 md:w-10">
                        <AvatarImage src={selectedConv.otherUser.profileImageUrl || undefined} alt={selectedConv.otherUser.name} />
                        <AvatarFallback className="bg-secondary/20 text-secondary">
                          {selectedConv.otherUser.companyName?.charAt(0) || selectedConv.otherUser.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm md:text-base" data-testid="text-conversation-partner">
                          {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                        </p>
                        <p className="text-xs text-muted-foreground hidden sm:block">
                          {selectedConv.otherUser.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Popover open={openActionsPopover} onOpenChange={setOpenActionsPopover}>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid="button-open-actions">
                            <ClipboardList className="h-5 w-5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-96 p-0" align="end">
                          <div className="p-3 border-b border-border">
                            <p className="font-medium text-sm">{t("inbox", "openActions")}</p>
                            <p className="text-xs text-muted-foreground">{selectedConv.otherUser.companyName || selectedConv.otherUser.name}</p>
                          </div>
                          <div className="max-h-[420px] overflow-y-auto p-2 space-y-3">
                            {openActionsOrders && openActionsOrders.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5" data-testid="text-open-orders-header">{t("inbox", "openOrders")} ({openActionsOrders.length})</p>
                                <div className="space-y-2">
                                  {openActionsOrders.map((order: any) => {
                                    const cardBg = order.status === "pending"
                                      ? "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40"
                                      : order.status === "confirmed"
                                      ? "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40"
                                      : "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40";
                                    const StatusIcon = order.status === "pending" ? Clock : order.status === "confirmed" ? CheckCircle : Package;
                                    return (
                                      <div
                                        key={order.id}
                                        className={`rounded-md border p-2.5 space-y-2 cursor-pointer ${cardBg}`}
                                        onClick={() => { setOrderDetailId(order.id); setOpenActionsPopover(false); }}
                                        data-testid={`open-action-order-${order.id}`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <StatusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            <span className="text-xs font-mono truncate">#{order.id.slice(0, 8)}</span>
                                          </div>
                                          <Badge variant="secondary" className={`text-[10px] shrink-0 ${getStatusColor(order.status)}`}>
                                            {getOrderStatus(order.status, lang)}
                                          </Badge>
                                        </div>
                                        {order.items && order.items.length > 0 && (
                                          <div className="space-y-0.5">
                                            {order.items.slice(0, 3).map((item: any, idx: number) => (
                                              <div key={idx} className="flex items-center justify-between text-[10px] text-muted-foreground">
                                                <span className="truncate mr-2">{item.quantity}x {item.productName}</span>
                                                <span className="shrink-0 font-medium text-foreground">€{Number(item.totalPrice).toFixed(2)}</span>
                                              </div>
                                            ))}
                                            {order.items.length > 3 && (
                                              <p className="text-[10px] text-muted-foreground">+{order.items.length - 3} {t("orders", "moreItems")}</p>
                                            )}
                                          </div>
                                        )}
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                          <span>{format(new Date(order.createdAt), "dd.MM.yy", { locale: dateLocale })}</span>
                                          <span className="font-semibold text-xs text-foreground">{order.totalAmount ? `€${Number(order.totalAmount).toFixed(2)}` : ""}</span>
                                        </div>
                                        {order.requestedDeliveryDate && (
                                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                            <Truck className="h-3 w-3" />
                                            <span>{t("cart", "deliveryDate")}: {format(new Date(order.requestedDeliveryDate), "dd.MM.yyyy", { locale: dateLocale })}</span>
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
                                    const cardBg = complaint.status === "open"
                                      ? "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40"
                                      : "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
                                    const StatusIcon = complaint.status === "open" ? AlertCircle : Clock;
                                    return (
                                      <div
                                        key={complaint.id}
                                        className={`rounded-md border p-2.5 space-y-2 cursor-pointer ${cardBg}`}
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
                                          <span>{t("orders", "order")} #{complaint.orderId?.slice(0, 8)}</span>
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
                              <div className="flex flex-col items-center justify-center py-6 text-center">
                                <CheckCircle className="h-8 w-8 text-muted-foreground/40 mb-2" />
                                <p className="text-sm text-muted-foreground" data-testid="text-no-open-actions">{t("inbox", "noOpenActions")}</p>
                              </div>
                            )}
                          </div>
                          <div className="border-t border-border p-2 space-y-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start text-xs"
                              onClick={() => { setOpenActionsPopover(false); setLocation(`/restaurant/orders?supplierId=${selectedConv.otherUser.id}`); }}
                              data-testid="button-view-all-orders"
                            >
                              <ShoppingBag className="h-3.5 w-3.5 mr-2" />
                              {t("inbox", "viewAllOrders")}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start text-xs"
                              onClick={() => { setOpenActionsPopover(false); setLocation(`/restaurant/complaints?supplierId=${selectedConv.otherUser.id}`); }}
                              data-testid="button-view-all-complaints"
                            >
                              <AlertCircle className="h-3.5 w-3.5 mr-2" />
                              {t("inbox", "viewAllComplaints")}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
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

                {actionMode === "none" ? (
                  <ScrollArea className="flex-1 p-4 h-full">
                    {messagesLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-16 w-3/4" />
                        ))}
                      </div>
                    ) : messages && messages.length > 0 ? (
                      <div className="space-y-3">
                        {messages.map((message, index) => {
                          const isOwn = message.senderId === currentUser?.id;
                          const messageDate = new Date(message.createdAt);
                          const prevMessage = index > 0 ? messages[index - 1] : null;
                          const showDateDivider = !prevMessage || !isSameDay(messageDate, new Date(prevMessage.createdAt));
                          
                          const isNewMessage = newMessageIds.has(message.id);
                          return (
                            <div key={message.id} className={isNewMessage ? "animate-slide-in-message" : ""}>
                              {showDateDivider && (
                                <div className="flex justify-center my-4">
                                  <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                                    {formatDateDivider(messageDate, lang)}
                                  </span>
                                </div>
                              )}
                              <div
                                className={`flex ${message.messageType === "order" || message.messageType === "complaint" || message.messageType === "document" || message.messageType === "order_change_request" || message.messageType === "promotion" ? "justify-center" : message.messageType === "attachment" ? (isOwn ? "justify-end" : "justify-start") : isOwn ? "justify-end" : "justify-start"}`}
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
                                      <div className={`w-[92%] rounded-lg border-2 shadow-sm overflow-hidden ${isExpired ? "border-muted bg-muted/20 opacity-60" : "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"}`} data-testid={`promotion-card-${message.id}`}>
                                        <div className={`flex items-center justify-between px-4 py-2.5 border-b ${isExpired ? "border-muted bg-muted/30" : "border-green-200 dark:border-green-800 bg-green-100/50 dark:bg-green-900/30"}`}>
                                          <div className="flex items-center gap-2">
                                            <Tag className={`h-4 w-4 ${isExpired ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`} />
                                            <span className={`text-sm font-semibold ${isExpired ? "text-muted-foreground" : "text-green-700 dark:text-green-300"}`}>{promoData.name}</span>
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
                                                {prod.imageUrl ? (
                                                  <div className="w-6 h-6 rounded overflow-hidden bg-muted shrink-0">
                                                    <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover" />
                                                  </div>
                                                ) : (
                                                  <div className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                                                    <Package className="h-3 w-3 text-muted-foreground/30" />
                                                  </div>
                                                )}
                                                <span className="font-medium flex-1">{prod.name}</span>
                                                <span className="text-muted-foreground line-through">{prod.originalPrice}€</span>
                                                <span className="font-semibold text-green-600 dark:text-green-400">{prod.discountedPrice}€/{prod.unit}</span>
                                              </div>
                                            ))}
                                          </div>
                                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                            <Calendar className="h-3 w-3" />
                                            <span>{t("promotionsPage", "validUntil")} {format(endDate, "dd.MM.yyyy")}</span>
                                          </div>
                                          {!isExpired && (
                                            <div className="flex gap-2 pt-1">
                                              <Button
                                                size="sm"
                                                className="flex-1 h-8 text-xs"
                                                onClick={() => setLocation(`/restaurant/catalog?supplierId=${promoData.supplierId}`)}
                                                data-testid={`button-order-promo-${message.id}`}
                                              >
                                                <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                                                {t("promotionsPage", "orderNow")}
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-xs"
                                                onClick={async () => {
                                                  try {
                                                    await apiRequest("PATCH", `/api/messages/${message.id}/dismiss`);
                                                    queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
                                                  } catch {}
                                                }}
                                                data-testid={`button-dismiss-promo-${message.id}`}
                                              >
                                                <X className="h-3.5 w-3.5 mr-1" />
                                                {t("promotionsPage", "notInterested")}
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
                                        <div className="w-[85%] rounded-lg border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`inactive-order-${message.id}`}>
                                          <div className="flex items-center justify-between px-3 py-2 gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                              <span className="text-xs text-muted-foreground truncate">{t("inbox", "orderMessage")}</span>
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
                                      <div className={`w-[92%] rounded-lg border-2 shadow-sm overflow-hidden ${statusStyle.card}`}>
                                        <div className={`flex items-center justify-between px-4 py-2.5 border-b ${statusStyle.header}`}>
                                          <div className="flex items-center gap-2">
                                            <ClipboardList className={`h-4 w-4 ${statusStyle.icon}`} />
                                            <span className={`text-sm font-semibold ${statusStyle.icon}`}>{t("inbox", "orderMessage")}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {orderStatus && (
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusColor(orderStatus)}`} data-testid={`order-status-${message.id}`}>
                                                {getOrderStatus(orderStatus, lang)}
                                              </span>
                                            )}
                                            <span className="text-xs text-muted-foreground">
                                              {format(messageDate, "HH:mm")}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="px-4 py-3">
                                          {orderData ? (
                                            <div className="space-y-2">
                                              {orderData.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-sm">
                                                  <span>{item.quantity}x {item.name}</span>
                                                  <span className="text-muted-foreground">{item.price}€</span>
                                                </div>
                                              ))}
                                              <Separator className="my-2" />
                                              <div className="flex justify-between items-center font-semibold">
                                                <span>{t("common", "total")}</span>
                                                <span>{orderData.total}€</span>
                                              </div>
                                            </div>
                                          ) : (
                                            <p className="text-sm">{message.content}</p>
                                          )}
                                        </div>
                                        {message.orderId && (
                                          <div className="px-4 py-2.5 border-t border-green-500/20 bg-green-500/5 space-y-2">
                                            {cardWizard?.orderId === message.orderId ? (
                                              <div className="p-3 rounded-lg border bg-card space-y-3" data-testid={`wizard-confirm-${message.orderId}`}>
                                                {cardWizard.action === "change_request" ? (
                                                  <>
                                                    <div className="flex items-center gap-2">
                                                      <Pencil className="h-4 w-4 text-amber-600" />
                                                      <span className="text-sm font-medium">{lang === "it" ? "Richiedi modifica ordine" : "Änderung anfragen"}</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{lang === "it" ? "Descrivi le modifiche desiderate. Il fornitore dovrà approvare la richiesta." : "Beschreiben Sie die gewünschten Änderungen. Der Lieferant muss die Anfrage genehmigen."}</p>
                                                    <Textarea
                                                      placeholder={lang === "it" ? "Motivo della modifica..." : "Grund der Änderung..."}
                                                      value={cardWizard.reason || ""}
                                                      onChange={(e) => setCardWizard({ ...cardWizard, reason: e.target.value })}
                                                      className="min-h-[60px] text-sm"
                                                      data-testid={`wizard-reason-${message.orderId}`}
                                                    />
                                                    <div className="flex gap-2">
                                                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setCardWizard(null)} data-testid={`wizard-cancel-${message.orderId}`}>
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
                                                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setCardWizard(null)} data-testid={`wizard-cancel-${message.orderId}`}>
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
                                                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setCardWizard(null)} data-testid={`wizard-cancel-${message.orderId}`}>
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
                                              <>
                                                <div className="flex gap-2">
                                                  {orderStatus === "pending" && (
                                                    <Button size="sm" variant="outline" className="flex-1 text-xs px-2" onClick={() => setCardWizard({ orderId: message.orderId!, action: "edit" })} data-testid={`button-card-edit-${message.id}`}>
                                                      <Pencil className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                      {lang === "it" ? "Modifica" : "Bearbeiten"}
                                                    </Button>
                                                  )}
                                                  {orderStatus === "confirmed" && (
                                                    <Button size="sm" variant="outline" className="flex-1 text-xs px-2" onClick={() => setCardWizard({ orderId: message.orderId!, action: "change_request", reason: "" })} data-testid={`button-card-change-request-${message.id}`}>
                                                      <Pencil className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                      {lang === "it" ? "Modifica" : "Ändern"}
                                                    </Button>
                                                  )}
                                                  {orderStatus && !["delivered", "cancelled"].includes(orderStatus) && (
                                                    <Button size="sm" variant="outline" className="flex-1 text-xs px-2" onClick={() => setCardWizard({ orderId: message.orderId!, action: "cancel" })} data-testid={`button-card-cancel-${message.id}`}>
                                                      <XCircle className="h-3.5 w-3.5 mr-1 shrink-0 text-destructive" />
                                                      {lang === "it" ? "Annulla" : "Stornieren"}
                                                    </Button>
                                                  )}
                                                </div>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="w-full text-muted-foreground text-xs"
                                                  onClick={() => setOrderDetailId(message.orderId)}
                                                  data-testid={`button-order-details-${message.id}`}
                                                >
                                                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                                                  {t("inbox", "showOrderDetails")}
                                                </Button>
                                              </>
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
                                        <div className="w-[85%] rounded-lg border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`inactive-complaint-${message.id}`}>
                                          <div className="flex items-center justify-between px-3 py-2 gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                              <span className="text-xs text-muted-foreground truncate">{complaintData?.title || t("inbox", "complaintMessage")}</span>
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
                                      <div className="w-[85%] rounded-lg border bg-card shadow-sm overflow-hidden border-2 border-red-500/30 shadow-lg">
                                        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-red-500/10 border-red-500/20">
                                          <div className="flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                            <span className="text-sm font-semibold text-red-600 dark:text-red-400">{t("inbox", "complaintMessage")}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {complaintStatus && (
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getComplaintStatusColor(complaintStatus)}`} data-testid={`complaint-status-${message.id}`}>
                                                {getComplaintStatus(complaintStatus, lang)}
                                              </span>
                                            )}
                                            <span className="text-xs text-muted-foreground">
                                              {format(messageDate, "HH:mm")}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="px-4 py-3">
                                          {complaintData ? (
                                            <div className="space-y-2">
                                              <div className="flex items-center justify-between flex-wrap gap-1">
                                                <span className="font-medium">{complaintData.title}</span>
                                                <Badge variant="outline" className="text-xs">
                                                  {t("orders", "order")} #{complaintData.orderId?.substring(0, 8)}
                                                </Badge>
                                              </div>
                                              <p className="text-sm text-muted-foreground">{complaintData.description}</p>
                                            </div>
                                          ) : (
                                            <p className="text-sm">{message.content}</p>
                                          )}
                                        </div>
                                        {(complaintData?.complaintId || complaintData?.orderId) && (
                                          <div className="px-4 py-2.5 border-t border-red-500/20 bg-red-500/5">
                                            <Button
                                              variant="destructive"
                                              size="sm"
                                              className="w-full"
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
                                  (() => {
                                    let docData: { title?: string; orderId?: string; fileUrl?: string } = {};
                                    try { docData = JSON.parse(message.content); } catch {}
                                    return (
                                      <div className="w-[85%] rounded-lg border bg-card shadow-sm overflow-hidden border-2 border-blue-500/30 shadow-lg">
                                        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-blue-500/10 border-blue-500/20">
                                          <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{t("inbox", "deliveryNote")}</span>
                                          </div>
                                          <span className="text-xs text-muted-foreground">
                                            {format(messageDate, "HH:mm")}
                                          </span>
                                        </div>
                                        <div className="px-4 py-3">
                                          <p className="text-sm font-medium">{docData.title || t("inbox", "documentMessage")}</p>
                                          {docData.orderId && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                              {t("orders", "order")} #{docData.orderId.slice(0, 8)}
                                            </p>
                                          )}
                                        </div>
                                        {docData.orderId && (
                                          <div className="px-4 py-2.5 border-t border-blue-500/20 bg-blue-500/5">
                                            <Button
                                              variant="default"
                                              size="sm"
                                              className="w-full"
                                              onClick={() => {
                                                const a = document.createElement("a"); a.href = `/api/orders/${docData.orderId}/delivery-note/download`; a.setAttribute("download", ""); document.body.appendChild(a); a.click(); document.body.removeChild(a);
                                              }}
                                              data-testid={`button-download-doc-${message.id}`}
                                            >
                                              <Download className="h-4 w-4 mr-2" />
                                              {t("inbox", "downloadDeliveryNote")}
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()
                                ) : message.messageType === "order_change_request" ? (
                                  (() => {
                                    let changeData: { type?: string; orderId?: string; message?: string; reason?: string; approved?: boolean; items?: { name: string; quantity: number; price: string }[]; total?: string; status?: string } = {};
                                    try { changeData = JSON.parse(message.content); } catch {}
                                    const isResponse = changeData.type === "change_request_response";
                                    const isEdited = changeData.type === "order_edited";
                                    const isChangeRequest = changeData.type === "change_request";
                                    const changeInactive = isResponse || isEdited || (isChangeRequest && changeData.status !== "pending");
                                    const label = isEdited ? t("inbox", "orderEdited") : isResponse ? (changeData.approved ? t("inbox", "changeApproved") : t("inbox", "changeRejected")) : t("inbox", "changeRequest");
                                    if (changeInactive) {
                                      return (
                                        <div className="w-[85%] rounded-lg border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`inactive-change-${message.id}`}>
                                          <div className="flex items-center justify-between px-3 py-2 gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                              <span className="text-xs text-muted-foreground truncate">{label}</span>
                                              {changeData.orderId && (
                                                <span className="text-[10px] text-muted-foreground shrink-0">#{changeData.orderId.slice(0, 8)}</span>
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
                                      <div className="w-[85%] rounded-lg border bg-card shadow-sm overflow-hidden border-2 border-amber-500/30">
                                        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-amber-500/10 border-amber-500/20">
                                          <div className="flex items-center gap-2">
                                            <Pencil className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{label}</span>
                                          </div>
                                          <span className="text-xs text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                        </div>
                                        <div className="px-4 py-3">
                                          {changeData.orderId && (
                                            <p className="text-xs text-muted-foreground mb-2">{t("orders", "order")} #{changeData.orderId.slice(0, 8)}</p>
                                          )}
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
                                ) : (
                                  (() => {
                                    let refData: { refType?: string; refId?: string; refLabel?: string; text?: string } | null = null;
                                    try {
                                      const parsed = JSON.parse(message.content);
                                      if (parsed.refType && parsed.refId && parsed.text) refData = parsed;
                                    } catch {}
                                    return (
                                      <div
                                        className={`max-w-[70%] rounded-lg px-3 py-2 shadow-lg ${
                                          isOwn
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted"
                                        }`}
                                      >
                                        {refData && (
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
                                                <ShoppingBag className={`h-3 w-3 shrink-0 ${isOwn ? "text-primary-foreground/70" : "text-primary"}`} />
                                              ) : (
                                                <AlertCircle className={`h-3 w-3 shrink-0 ${isOwn ? "text-primary-foreground/70" : "text-primary"}`} />
                                              )}
                                              <span className={`text-[11px] font-medium truncate ${isOwn ? "text-primary-foreground/80" : "text-foreground/80"}`}>
                                                {refData.refLabel || (refData.refType === "order" ? t("inbox", "orderMessage") : t("inbox", "complaintMessage"))}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                        <p className="text-sm">{refData ? refData.text : message.content}</p>
                                        <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                                          <span className={`text-[10px] ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                            {format(messageDate, "HH:mm")}
                                          </span>
                                          {isOwn && (
                                            message.isRead 
                                              ? <CheckCheck className="h-3 w-3 text-primary-foreground/70" />
                                              : <Check className="h-3 w-3 text-primary-foreground/70" />
                                          )}
                                        </div>
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
                        <p className="text-sm text-muted-foreground">{t("inbox", "noConversations")}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t("inbox", "startConversation")}</p>
                      </div>
                    )}
                  </ScrollArea>
                ) : actionMode === "order" ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 pb-0">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold flex items-center gap-2">
                          <ShoppingCart className="h-5 w-5" />
                          {t("inbox", "orderMessage")}
                        </h3>
                        <Button variant="ghost" size="icon" onClick={() => { setActionMode("none"); setTimeout(scrollToBottom, 100); }} data-testid="button-close-order">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t("inbox", "productsFrom")} {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                      </p>
                    </div>
                    <ScrollArea className="flex-1 px-4">
                      <div className="space-y-2 pb-4">
                        {supplierProducts?.filter(p => p.inStock).map((product) => (
                          <div key={product.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            {product.imageUrl ? (
                              <div className="w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0 cursor-pointer" onClick={() => setInboxDetailProduct(product)} data-testid={`button-product-detail-${product.id}`}>
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0 cursor-pointer" onClick={() => setInboxDetailProduct(product)} data-testid={`button-product-detail-${product.id}`}>
                                <Package className="h-5 w-5 text-muted-foreground/50" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setInboxDetailProduct(product)} data-testid={`text-product-info-${product.id}`}>
                              <p className="text-sm font-medium truncate">{product.name}</p>
                              <p className="text-xs text-muted-foreground">{product.price}€/{product.unit}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => updateOrderQuantity(product.id, -1)}
                                disabled={!orderItems[product.id]}
                                data-testid={`button-decrease-${product.id}`}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center text-sm">{orderItems[product.id] || 0}</span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => updateOrderQuantity(product.id, 1)}
                                data-testid={`button-increase-${product.id}`}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {(!supplierProducts || supplierProducts.filter(p => p.inStock).length === 0) && (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            {t("inbox", "noProductsAvailable")}
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                    <div className="p-4 border-t border-border bg-background shrink-0">
                      <Button
                        className="w-full gap-2"
                        disabled={totalOrderItems === 0 || createOrderMutation.isPending}
                        onClick={handleSubmitOrder}
                        data-testid="button-submit-order"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        {t("inbox", "placeOrderItems")} ({totalOrderItems} {t("common", "items")})
                      </Button>
                    </div>
                  </div>
                ) : actionMode === "complaint" ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 pb-0">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-red-500" />
                          {t("complaints", "newComplaint")}
                        </h3>
                        <Button variant="ghost" size="icon" onClick={() => { setActionMode("none"); setTimeout(scrollToBottom, 100); }} data-testid="button-close-complaint">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        {t("inbox", "complaintTo")} {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                      </p>
                    </div>
                    <ScrollArea className="flex-1 px-6">
                      <div className="space-y-4 pb-4 px-1">
                        <div className="space-y-2">
                          <Label>{t("complaints", "selectOrder")}</Label>
                          <Select
                            value={complaintOrderId}
                            onValueChange={setComplaintOrderId}
                            data-testid="select-complaint-order"
                          >
                            <SelectTrigger data-testid="trigger-complaint-order">
                              <SelectValue placeholder={t("complaints", "selectOrderPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {supplierOrders && supplierOrders.length > 0 ? (
                                supplierOrders.map((order) => (
                                  <SelectItem key={order.id} value={order.id} data-testid={`option-complaint-order-${order.id}`}>
                                    <div className="flex items-center gap-2">
                                      <Package className="h-4 w-4 text-muted-foreground" />
                                      <span>{formatOrderDate(order.createdAt)}</span>
                                      <span className="text-muted-foreground">-</span>
                                      <span>{parseFloat(order.totalAmount).toFixed(2)} €</span>
                                    </div>
                                  </SelectItem>
                                ))
                              ) : (
                                <div className="p-2 text-sm text-muted-foreground">{t("complaints", "noOrdersForSupplier")}</div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="complaint-title">{t("complaints", "subject")}</Label>
                          <Input
                            id="complaint-title"
                            placeholder={t("complaints", "subjectPlaceholder")}
                            value={complaintTitle}
                            onChange={(e) => setComplaintTitle(e.target.value)}
                            disabled={!complaintOrderId}
                            data-testid="input-complaint-title"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="complaint-description">{t("common", "description")}</Label>
                          <Textarea
                            id="complaint-description"
                            placeholder={t("complaints", "descriptionPlaceholder")}
                            value={complaintDescription}
                            onChange={(e) => setComplaintDescription(e.target.value)}
                            rows={4}
                            disabled={!complaintOrderId}
                            data-testid="textarea-complaint-description"
                          />
                        </div>
                      </div>
                    </ScrollArea>
                    <div className="p-4 border-t border-border bg-background shrink-0">
                      <Button
                        className="w-full gap-2"
                        variant="destructive"
                        disabled={!complaintOrderId || !complaintTitle.trim() || !complaintDescription.trim() || createComplaintMutation.isPending}
                        onClick={handleSubmitComplaint}
                        data-testid="button-submit-complaint"
                      >
                        <AlertCircle className="h-4 w-4" />
                        {createComplaintMutation.isPending ? t("complaints", "sending") : t("complaints", "submitComplaint")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-border p-4 md:rounded-none rounded-2xl md:mb-0 mb-2 mx-2 md:mx-0 floating-message-bar">
                  <div className="flex gap-2">
                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" data-testid="button-quick-actions">
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
                            setPopoverOpen(false);
                          }}
                          data-testid="button-new-complaint"
                        >
                          <AlertCircle className="h-4 w-4" />
                          {t("complaints", "newComplaint")}
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
                      placeholder={t("inbox", "typeMessage")}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      data-testid="input-message"
                    />
                    <Button 
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() || sendMessageMutation.isPending}
                      data-testid="button-send-message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center h-full min-h-[calc(100dvh-200px)]">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-lg font-medium">{t("inbox", "selectConversation")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("inbox", "selectConversationDesc")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={!!orderDetailId} onOpenChange={(open) => !open && setOrderDetailId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-green-600" />
              {t("orders", "orderDetails")}
            </DialogTitle>
          </DialogHeader>
          {orderDetail && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("orders", "orderNumber")}</div>
                  <span className="font-mono text-sm font-semibold" data-testid="text-order-id">#{orderDetail.id.slice(0, 8)}</span>
                </div>
                <Badge className={getStatusColor(orderDetail.status)} data-testid="badge-order-status">
                  {getOrderStatus(orderDetail.status, lang)}
                </Badge>
              </div>

              {orderDetail.supplier && (
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={orderDetail.supplier.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {orderDetail.supplier.companyName?.substring(0, 2).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-sm">{orderDetail.supplier.companyName || t("common", "supplier")}</div>
                    <div className="text-xs text-muted-foreground">{t("common", "supplier")}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border">
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
              
              <Separator />

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  {t("orders", "statusHistory")}
                </h4>
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <StatusTimeline
                    history={orderStatusHistory || []}
                    type="order"
                    createdAt={orderDetail.createdAt}
                    currentStatus={orderDetail.status}
                  />
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4" />
                  {t("common", "products")} ({orderDetail.items.length})
                </h4>
                <div className="rounded-lg border overflow-hidden">
                  {orderDetail.items.map((item, idx) => (
                    <div key={item.id} className={`flex justify-between items-center gap-2 px-3 py-2.5 ${idx < orderDetail.items.length - 1 ? "border-b" : ""}`} data-testid={`order-item-${item.id}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} x {parseFloat(item.unitPrice).toFixed(2)}€
                        </p>
                      </div>
                      <span className="text-sm font-semibold whitespace-nowrap">{parseFloat(item.totalPrice).toFixed(2)}€</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center gap-2 px-3 py-3 bg-green-500/10 border-t">
                    <span className="text-sm font-bold">{t("orders", "totalAmount")}</span>
                    <span className="text-base font-bold text-green-700 dark:text-green-400">{parseFloat(orderDetail.totalAmount).toFixed(2)}€</span>
                  </div>
                </div>
              </div>

              {orderDetail.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2 text-sm">{t("orders", "notes")}</h4>
                    <p className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/30 border">{orderDetail.notes}</p>
                  </div>
                </>
              )}

              {orderDetail.status === "in_delivery" && (
                <>
                  <Separator />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const a = document.createElement("a"); a.href = `/api/orders/${orderDetail.id}/delivery-note/download`; a.setAttribute("download", ""); document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    }}
                    data-testid="button-download-delivery-note"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Lieferschein herunterladen
                  </Button>
                </>
              )}

              {orderDetail.status === "pending" && (
                <>
                  <Separator />
                  <Button
                    className="w-full"
                    onClick={() => openEditOrderInbox(orderDetail)}
                    data-testid="button-edit-order-inbox"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    {t("orders", "editOrder")}
                  </Button>
                </>
              )}

              {(orderDetail.status === "pending" || orderDetail.status === "confirmed") && (
                <>
                  <Separator />
                  {!showCancelOrderConfirm ? (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => setShowCancelOrderConfirm(true)}
                      data-testid="button-cancel-order-inbox"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {t("orders", "cancelOrder")}
                    </Button>
                  ) : (
                    <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
                      <p className="text-sm font-medium text-destructive">{t("orders", "confirmCancel")}</p>
                      <p className="text-xs text-muted-foreground">{t("orders", "cancelWarning")}</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setShowCancelOrderConfirm(false)}
                          data-testid="button-cancel-order-abort"
                        >
                          {t("common", "cancel")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1"
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              {t("complaints", "complaintDetails")}
            </DialogTitle>
          </DialogHeader>
          
          {(loadingComplaintDetail || isLoadingComplaintDetail) ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : isComplaintDetailError ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 mb-2 text-destructive" />
              <p className="text-sm font-medium text-destructive">{t("inbox", "loadError")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("inbox", "complaintLoadError")}</p>
            </div>
          ) : complaintDetail ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                {(() => {
                  const statusInfo = formatComplaintStatus(complaintDetail.status);
                  const StatusIcon = statusInfo.icon;
                  return (
                    <>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">{t("inbox", "complaintMessage")}</div>
                        <span className="font-mono text-sm font-semibold" data-testid="text-complaint-id">#{complaintDetail.id.slice(0, 8)}</span>
                      </div>
                      <Badge variant={statusInfo.variant} className="flex items-center gap-1" data-testid="badge-complaint-status">
                        <StatusIcon className="h-3 w-3" />
                        {statusInfo.label}
                      </Badge>
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={complaintDetail.supplier?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {complaintDetail.supplier?.companyName?.substring(0, 2).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium text-sm">{complaintDetail.supplier?.companyName || t("common", "supplier")}</div>
                  <div className="text-xs text-muted-foreground">{complaintDetail.supplier?.email}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border">
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

              <Separator />

              <div>
                <h4 className="font-semibold text-base mb-2" data-testid="text-complaint-title">{complaintDetail.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed p-3 rounded-lg bg-muted/30 border" data-testid="text-complaint-description">{complaintDetail.description}</p>
              </div>

              {complaintDetail.mediaUrls && complaintDetail.mediaUrls.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">{t("complaints", "attachments")}</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {complaintDetail.mediaUrls.map((url: string, idx: number) => (
                      <a key={idx} href={getMediaSrc(url)} rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border hover-elevate">
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

              <Separator />

              <div className="p-3 rounded-lg border">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <span className="text-sm font-medium">{t("complaints", "affectedOrder")}</span>
                  <Badge variant="outline">#{complaintDetail.orderId.substring(0, 8)}</Badge>
                </div>
                {complaintDetail.order && (
                  <div className="text-sm text-muted-foreground">
                    {t("orders", "totalAmount")}: {parseFloat(complaintDetail.order.totalAmount).toFixed(2)}€
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  {t("orders", "statusHistory")}
                </h4>
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <StatusTimeline
                    history={complaintStatusHistoryData || []}
                    type="complaint"
                    createdAt={complaintDetail.createdAt}
                    currentStatus={complaintDetail.status}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
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
                      <div key={comment.id} className="p-3 rounded-lg bg-muted/30 border" data-testid={`comment-${comment.id}`}>
                        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={comment.user?.profileImageUrl || undefined} />
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {comment.user?.companyName?.substring(0, 2).toUpperCase() || comment.user?.name?.substring(0, 2).toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{comment.user?.companyName || comment.user?.name || t("common", "unknown")}</span>
                            <Badge variant="outline" className="text-xs">
                              {comment.user?.role === "supplier" ? t("common", "supplier") : "Restaurant"}
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
                <div className="space-y-2 border-t pt-4">
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
                <>
                  <Separator />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => selectedComplaintId && reopenComplaintMutation.mutate(selectedComplaintId)}
                    disabled={reopenComplaintMutation.isPending}
                    data-testid="button-reopen-complaint"
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {lang === "de" ? "Reklamation wieder öffnen" : "Riapri reclamo"}
                  </Button>
                </>
              )}

              {complaintDetail.status === "open" && (
                <>
                  <Separator />
                  {!showWithdrawComplaintConfirm ? (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => setShowWithdrawComplaintConfirm(true)}
                      data-testid="button-withdraw-complaint-inbox"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {t("complaints", "withdrawComplaint")}
                    </Button>
                  ) : (
                    <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
                      <p className="text-sm font-medium text-destructive">{t("complaints", "confirmWithdraw")}</p>
                      <p className="text-xs text-muted-foreground">{t("complaints", "withdrawWarning")}</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setShowWithdrawComplaintConfirm(false)}
                          data-testid="button-withdraw-complaint-abort"
                        >
                          {t("common", "cancel")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1"
                          onClick={() => selectedComplaintId && withdrawComplaintMutation.mutate(selectedComplaintId)}
                          disabled={withdrawComplaintMutation.isPending}
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
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">{t("inbox", "complaintNotFound")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOrderInbox} onOpenChange={(open) => !open && setEditingOrderInbox(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              {t("orders", "editOrder")}
            </DialogTitle>
            <DialogDescription>
              {t("orders", "order")} #{editingOrderInbox?.id.slice(0, 8)} - {t("inbox", "editOrderDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">{t("orders", "orderItems")}</Label>
              <div className="space-y-2">
                {editItemsInbox.map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50" data-testid={`inbox-edit-item-${item.productId}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{parseFloat(item.unitPrice).toFixed(2)}€ {t("orders", "perUnit")}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => updateEditItemQuantityInbox(index, -1)}
                        disabled={item.quantity <= 1}
                        data-testid={`inbox-button-decrease-${item.productId}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium" data-testid={`inbox-text-quantity-${item.productId}`}>{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => updateEditItemQuantityInbox(index, 1)}
                        data-testid={`inbox-button-increase-${item.productId}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
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
                    editDeliveryOptionInbox === "asap" ? "border-primary bg-primary/5" : "border-border"
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
                    editDeliveryOptionInbox === "date" ? "border-primary bg-primary/5" : "border-border"
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
                              ? "border-primary bg-primary/5"
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

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("orders", "totalAmount")}</span>
              <span className="text-lg font-bold" data-testid="inbox-text-edit-total">{editTotalInbox}€</span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingOrderInbox(null)} data-testid="inbox-button-cancel-edit">
              {t("common", "cancel")}
            </Button>
            <Button
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
          </DialogFooter>
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
