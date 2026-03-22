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

import { Send, MessageSquare, Search, Check, CheckCheck, ClipboardList, Eye, AlertCircle, AlertTriangle, ArrowLeft, Settings, Clock, Loader2, CheckCircle, XCircle, FileVideo, FileImage, Package, FileText, Download, Paperclip, Pencil, Truck, ShoppingBag, Tag, Calendar, CalendarDays, Phone, RotateCcw, X, Reply, User as UserIcon, ChevronDown, ChevronUp, CircleAlert, Plus, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AttachmentPopover, AttachmentMessageCard } from "@/components/ChatAttachment";
import OnlineStatus from "@/components/OnlineStatus";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { StatusTimeline } from "@/components/StatusTimeline";
import DeliveryDatePicker from "@/components/DeliveryDatePicker";
import { PartialConfirmationDialog } from "@/components/PartialConfirmationDialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { ConversationWithUser, Message, Order, ComplaintWithDetails, ComplaintCommentWithUser, OrderStatusHistoryWithUser, ComplaintStatusHistoryWithUser } from "@shared/schema";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { de, it } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OrderContent {
  items: { name: string; quantity: number; price: string }[];
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

const getStatusCardBg = (status: string) => {
  switch (status) {
    case "pending": return { card: "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40", header: "bg-yellow-500/10 border-yellow-500/20", icon: "text-yellow-600 dark:text-yellow-400" };
    case "confirmed": return { card: "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40", header: "bg-blue-500/10 border-blue-500/20", icon: "text-blue-600 dark:text-blue-400" };
    case "partially_confirmed": return { card: "bg-orange-50/60 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/40", header: "bg-orange-500/10 border-orange-500/20", icon: "text-orange-600 dark:text-orange-400" };
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
  const [orderDetailId, setOrderDetailId] = useState<string | null>(null);
  const [cardWizard, setCardWizard] = useState<{ orderId: string; action: string } | null>(null);
  const [deliveryDatePicker, setDeliveryDatePicker] = useState<{ orderId: string; restaurantId: string } | null>(null);
  const [confirmOrderForDialog, setConfirmOrderForDialog] = useState<any | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<{ id: string; senderName: string; preview: string } | null>(null);
  const [messagePriority, setMessagePriority] = useState<"standard" | "important">("standard");
  const [priorityPopoverOpen, setPriorityPopoverOpen] = useState(false);

  // Complaint management state
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [showComplaintDetail, setShowComplaintDetail] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [newComment, setNewComment] = useState("");
  const searchString = useSearch();

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setIsInChat(isMobile && selectedConversation !== null);
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
  }, [searchString, currentUser?.id]);

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
    mutationFn: async ({ orderId, status, requestedDeliveryDate }: { orderId: string; status: string; requestedDeliveryDate?: string }) => {
      return await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status, changedBy: currentUser?.id, requestedDeliveryDate: requestedDeliveryDate || undefined });
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
      return apiRequest("PATCH", `/api/complaints/${id}`, { status, changedBy: currentUser?.id });
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
    if (currentUser?.id) {
      markAsReadMutation.mutate(conversationId);
      apiRequest("PATCH", `/api/notifications/read-by-reference?userId=${currentUser.id}&referenceId=${conversationId}&type=new_message`).then(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/notifications?userId=${currentUser.id}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/notifications/count?userId=${currentUser.id}`] });
      }).catch(() => {});
    }
  };

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, messageType = "text", priority = "standard" }: { content: string; messageType?: string; priority?: string }) => {
      return apiRequest("POST", `/api/conversations/${selectedConversation}/messages`, {
        content,
        messageType,
        senderId: currentUser?.id,
        priority,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      setMessageText("");
      setMessagePriority("standard");
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
      if (replyToMessage) {
        content = JSON.stringify({
          refType: "reply",
          refId: replyToMessage.id,
          refLabel: replyToMessage.senderName,
          refPreview: replyToMessage.preview,
          text: messageText.trim(),
        });
        setReplyToMessage(null);
      }
      sendMessageMutation.mutate({ content, messageType: "text", priority: messagePriority });
    }
  };

  const handleSendAttachment = (content: string) => {
    if (selectedConversation) {
      sendMessageMutation.mutate({ content, messageType: "attachment", priority: messagePriority });
    }
  };

  const handleBackToList = () => {
    setSelectedConversation(null);
    setReplyToMessage(null);
  };

  return (
    <div className={`${selectedConversation ? 'h-dvh md:h-[calc(100dvh-8rem)]' : 'h-[calc(100dvh-8rem)]'} flex flex-col`}>
      <div className={`mb-3 md:mb-4 shrink-0 ${selectedConversation ? 'hidden md:block' : ''}`}>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Inbox</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Kommunizieren Sie mit Ihren Kunden</p>
      </div>

      <Card className={`${selectedConversation ? 'flex-1 border-0 md:border rounded-none md:rounded-lg' : 'flex-1'} flex flex-col overflow-hidden`}>
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
                      let messagePreviewText = conv.lastMessage?.content || (lang === "de" ? "Keine Nachrichten" : "Nessun messaggio");
                      try {
                        const parsed = JSON.parse(conv.lastMessage?.content || "");
                        if (parsed.refType && parsed.text) messagePreviewText = parsed.text;
                      } catch {}
                      const messagePreview = conv.lastMessage?.messageType === "order" 
                        ? (lang === "de" ? "Neue Bestellung" : "Nuovo ordine")
                        : conv.lastMessage?.messageType === "complaint"
                        ? (lang === "de" ? "Reklamation" : "Reclamo")
                        : conv.lastMessage?.messageType === "document"
                        ? (lang === "de" ? "Lieferschein" : "Bolla di consegna")
                        : conv.lastMessage?.messageType === "attachment"
                        ? (lang === "de" ? "Anhang" : "Allegato")
                        : conv.lastMessage?.messageType === "order_change_request"
                        ? (lang === "de" ? "Änderungsanfrage" : "Richiesta modifica")
                        : conv.lastMessage?.messageType === "promotion"
                        ? (lang === "de" ? "Aktion" : "Promozione")
                        : messagePreviewText;
                      const hasUnread = conv.unreadCount > 0;
                      return (
                        <button
                          key={conv.id}
                          onClick={() => handleSelectConversation(conv.id)}
                          className={`w-full p-2.5 rounded-md text-left transition-colors hover-elevate overflow-hidden ${
                            selectedConversation === conv.id
                              ? "bg-secondary/10"
                              : hasUnread
                              ? "bg-primary/5"
                              : ""
                          } ${flashingConvIds.has(conv.id) ? "animate-flash-new" : ""}`}
                          data-testid={`conversation-${conv.id}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="relative shrink-0">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={conv.otherUser.profileImageUrl || undefined} alt={conv.otherUser.name} />
                                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                                  {conv.otherUser.companyName?.charAt(0) || conv.otherUser.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              {hasUnread ? (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background animate-pulse" />
                              ) : conv.otherUser.lastSeenAt && (Date.now() - new Date(conv.otherUser.lastSeenAt).getTime()) < 120000 ? (
                                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
                              ) : null}
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
                      <DialogContent className="max-w-[92vw] md:max-w-md p-0 gap-0 rounded-xl">
                        <DialogHeader className="p-4 pb-2 border-b border-border">
                          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                            <ClipboardList className="h-4 w-4" />
                            {t("inbox", "openActions")}
                          </DialogTitle>
                          <DialogDescription className="text-xs text-muted-foreground">
                            {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-3">
                          {openActionsOrders && openActionsOrders.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5" data-testid="text-open-orders-header">Offene Bestellungen ({openActionsOrders.length})</p>
                              <div className="space-y-2">
                                {openActionsOrders.map((order: any) => {
                                  const cardBg = order.status === "pending"
                                    ? "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40"
                                    : order.status === "confirmed" || order.status === "partially_confirmed"
                                    ? (order.status === "partially_confirmed" ? "bg-orange-50/60 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/40" : "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40")
                                    : "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40";
                                  const StatusIcon = order.status === "pending" ? Clock : order.status === "partially_confirmed" ? AlertTriangle : order.status === "confirmed" ? CheckCircle : Package;
                                  const nextStatus = order.status === "pending" ? "confirmed" : (order.status === "confirmed" || order.status === "partially_confirmed") ? "in_delivery" : "delivered";
                                  const nextLabel = order.status === "pending" ? "Bestätigen" : (order.status === "confirmed" || order.status === "partially_confirmed") ? "In Lieferung" : "Geliefert";
                                  const NextIcon = order.status === "pending" ? CheckCircle : (order.status === "confirmed" || order.status === "partially_confirmed") ? Truck : Check;
                                  return (
                                    <div
                                      key={order.id}
                                      className={`rounded-md border p-2.5 space-y-2 ${cardBg}`}
                                      data-testid={`open-action-order-${order.id}`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0 cursor-pointer" onClick={() => { setOrderDetailId(order.id); setOpenActionsPopover(false); }}>
                                          <StatusIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                          <span className="text-xs font-mono truncate">#{order.id.slice(0, 8)}</span>
                                        </div>
                                        <Badge variant="secondary" className={`text-[10px] shrink-0 ${getStatusColor(order.status)}`}>
                                          {getStatusLabel(order.status)}
                                        </Badge>
                                      </div>
                                      {order.items && order.items.length > 0 && (
                                        <div className="space-y-0.5">
                                          {order.items.slice(0, 3).map((item: any, idx: number) => (
                                            <div key={idx} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                              {item.productImageUrl ? (
                                                <img src={item.productImageUrl} alt="" className="h-4 w-4 rounded object-cover shrink-0" />
                                              ) : (
                                                <div className="h-4 w-4 rounded bg-muted flex items-center justify-center shrink-0">
                                                  <Package className="h-2 w-2 text-muted-foreground" />
                                                </div>
                                              )}
                                              <span className="truncate flex-1">{item.quantity}x {item.productName}</span>
                                              <span className="shrink-0 font-medium text-foreground">€{Number(item.totalPrice).toFixed(2)}</span>
                                            </div>
                                          ))}
                                          {order.items.length > 3 && (
                                            <p className="text-[10px] text-muted-foreground">+{order.items.length - 3} weitere</p>
                                          )}
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                        <span>
                                          {format(new Date(order.createdAt), "dd.MM.yy", { locale: de })}
                                          {order.createdByUser && (
                                            <span className="ml-1" data-testid={`text-created-by-${order.id}`}>· {order.createdByUser.name}</span>
                                          )}
                                        </span>
                                        <span className="font-semibold text-xs text-foreground">{order.totalAmount ? `€${Number(order.totalAmount).toFixed(2)}` : ""}</span>
                                      </div>
                                      {order.status === "in_delivery" && order.requestedDeliveryDate && (
                                        <div className="flex items-center gap-1.5 rounded bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 px-2 py-1">
                                          <Truck className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
                                          <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300">
                                            {t("orders", "deliveryOn")} {new Date(order.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "long" })}
                                          </span>
                                        </div>
                                      )}
                                      {order.status === "delivered" && (
                                        <div className="flex items-center gap-1.5 rounded bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-2 py-1">
                                          <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
                                          <span className="text-[10px] font-bold text-green-700 dark:text-green-300">
                                            {t("orders", "deliveredOn")} {format(new Date(order.updatedAt || order.createdAt), "dd.MM.yyyy", { locale: dateFnsLocale })}
                                          </span>
                                        </div>
                                      )}
                                      {order.status !== "in_delivery" && order.status !== "delivered" && order.requestedDeliveryDate && (
                                        <div className="flex items-center gap-1 rounded bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5">
                                          <CalendarDays className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" />
                                          <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                            {t("orders", "deliveryOn")} {new Date(order.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "long" })}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex items-center gap-1.5 pt-0.5">
                                        <Button
                                          size="sm"
                                          className="text-xs flex-1"
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
                                                toast({ title: "Status aktualisiert", description: `Bestellung #${order.id.slice(0, 8)} → ${nextLabel}` });
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
                                          className="text-xs"
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
                                  const cardBg = complaint.status === "open"
                                    ? "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40"
                                    : "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
                                  const StatusIcon = complaint.status === "open" ? AlertCircle : Clock;
                                  const nextStatus = complaint.status === "open" ? "in_progress" : "resolved";
                                  const nextLabel = complaint.status === "open" ? "In Bearbeitung" : "Gelöst";
                                  const NextIcon = complaint.status === "open" ? Settings : CheckCircle;
                                  return (
                                    <div
                                      key={complaint.id}
                                      className={`rounded-md border p-2.5 space-y-2 ${cardBg}`}
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
                                        <span>Bestellung #{complaint.orderId?.slice(0, 8)}</span>
                                        <span>•</span>
                                        <span>{format(new Date(complaint.createdAt), "dd.MM.yy", { locale: de })}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 pt-0.5">
                                        <Button
                                          size="sm"
                                          className="text-xs flex-1"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            apiRequest("PATCH", `/api/complaints/${complaint.id}`, { status: nextStatus, changedBy: currentUser?.id })
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
                                          className="text-xs"
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
                            onClick={() => { setOpenActionsPopover(false); setLocation(`/supplier/orders?restaurantId=${selectedConv.otherUser.id}`); }}
                            data-testid="button-view-all-orders"
                          >
                            <ShoppingBag className="h-3.5 w-3.5 mr-2" />
                            {t("inbox", "viewAllOrders")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs"
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
                      className="w-full flex items-center justify-between px-4 py-2 text-xs hover:bg-muted/50 transition-colors"
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
                            className="flex items-center justify-between rounded-md bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 px-3 py-1.5"
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
                        return (
                          <div key={message.id} className={isNewMessage ? "animate-slide-in-message" : ""}>
                            {showDateDivider && (
                              <div className="flex justify-center my-4">
                                <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                                  {formatDateDivider(messageDate)}
                                </span>
                              </div>
                            )}
                            <div
                              className={`flex ${message.messageType === "order" || message.messageType === "complaint" || message.messageType === "document" || message.messageType === "order_change_request" || message.messageType === "promotion" ? "justify-center" : message.messageType === "attachment" ? (isOwn ? "justify-end" : "justify-start") : isOwn ? "justify-end" : "justify-start"}`}
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
                                      <div className="w-[75%] max-w-sm rounded-lg border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`promotion-dismissed-${message.id}`}>
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
                                    <div className={`w-[75%] max-w-sm rounded-lg border-2 shadow-sm overflow-hidden ${isExpired ? "border-muted bg-muted/20 opacity-60" : "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"}`} data-testid={`promotion-card-${message.id}`}>
                                      <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isExpired ? "border-muted bg-muted/30" : "border-green-200 dark:border-green-800 bg-green-100/50 dark:bg-green-900/30"}`}>
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
                                      <div className="w-[75%] max-w-sm rounded-lg border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`inactive-order-${message.id}`}>
                                        <div className="flex items-center justify-between px-3 py-2 gap-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-xs text-muted-foreground truncate">Bestellung</span>
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
                                    <div className={`w-[75%] max-w-sm rounded-lg border-2 shadow-sm overflow-hidden ${statusStyle.card}`}>
                                      <div className={`flex items-center justify-between px-3 py-1.5 border-b ${statusStyle.header}`}>
                                        <div className="flex items-center gap-2">
                                          <ClipboardList className={`h-3.5 w-3.5 ${statusStyle.icon}`} />
                                          <span className={`text-xs font-semibold ${statusStyle.icon}`}>Bestellung</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {orderStatus && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusColor(orderStatus)}`} data-testid={`order-status-${message.id}`}>
                                              {getStatusLabel(orderStatus)}
                                            </span>
                                          )}
                                          <span className="text-xs text-muted-foreground">
                                            {format(messageDate, "HH:mm")}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="px-3 py-2">
                                        {orderData ? (
                                          <div className="space-y-2">
                                            {orderData.items.map((item, idx) => (
                                              <div key={idx} className="flex justify-between items-center text-xs">
                                                <span>{item.quantity}x {item.name}</span>
                                                <span className="text-muted-foreground">{item.price}€</span>
                                              </div>
                                            ))}
                                            <Separator className="my-1" />
                                            <div className="flex justify-between items-center text-xs font-semibold">
                                              <span>Gesamt</span>
                                              <span>{orderData.total}€</span>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-sm">{message.content}</p>
                                        )}
                                      </div>
                                      {message.orderId && (
                                        <div className="px-3 py-2 border-t border-green-500/20 bg-green-500/5 space-y-2">
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
                                                <Button variant="outline" size="sm" className="flex-1" onClick={() => setCardWizard(null)} data-testid={`wizard-cancel-${message.orderId}`}>
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
                                            <>
                                              <div className="flex gap-2">
                                                {orderStatus === "pending" && (
                                                  <Button size="sm" className="flex-1 text-xs px-2" onClick={async () => {
                                                    try {
                                                      const res = await fetch(`/api/orders/${message.orderId}`);
                                                      if (res.ok) {
                                                        const orderData = await res.json();
                                                        setConfirmOrderForDialog(orderData);
                                                      }
                                                    } catch {}
                                                  }} data-testid={`button-card-confirm-${message.id}`}>
                                                    <CheckCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                    {lang === "it" ? "Conferma" : "Bestätigen"}
                                                  </Button>
                                                )}
                                                {(orderStatus === "confirmed" || orderStatus === "partially_confirmed") && (
                                                  <Button size="sm" className="flex-1 text-xs px-2" onClick={() => setCardWizard({ orderId: message.orderId!, action: "in_delivery" })} data-testid={`button-card-in_delivery-${message.id}`}>
                                                    <Truck className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                    {lang === "it" ? "Consegna" : "Lieferung"}
                                                  </Button>
                                                )}
                                                {orderStatus === "in_delivery" && (
                                                  <Button size="sm" className="flex-1 text-xs px-2" onClick={() => setCardWizard({ orderId: message.orderId!, action: "delivered" })} data-testid={`button-card-delivered-${message.id}`}>
                                                    <Package className="h-3.5 w-3.5 mr-1 shrink-0" />
                                                    {lang === "it" ? "Consegnato" : "Geliefert"}
                                                  </Button>
                                                )}
                                                {orderStatus && !["delivered", "cancelled", "in_delivery"].includes(orderStatus) && (
                                                  <Button size="sm" variant="outline" className="flex-1 text-xs px-2" onClick={() => setCardWizard({ orderId: message.orderId!, action: "cancelled" })} data-testid={`button-card-cancel-${message.id}`}>
                                                    <XCircle className="h-3.5 w-3.5 mr-1 shrink-0 text-destructive" />
                                                    {lang === "it" ? "Annulla" : "Stornieren"}
                                                  </Button>
                                                )}
                                              </div>
                                              <div className="flex gap-2">
                                                {orderStatus && !["delivered", "cancelled", "pending"].includes(orderStatus) && selectedConv && (
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex-1 text-xs px-2"
                                                    onClick={() => setDeliveryDatePicker({ orderId: message.orderId!, restaurantId: selectedConv.restaurantId })}
                                                    data-testid={`button-set-date-${message.id}`}
                                                  >
                                                    <CalendarDays className="h-3.5 w-3.5 mr-1 shrink-0 text-purple-600" />
                                                    {lang === "it" ? "Imposta data" : "Datum setzen"}
                                                  </Button>
                                                )}
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="flex-1 text-muted-foreground text-xs"
                                                  onClick={() => setOrderDetailId(message.orderId)}
                                                  data-testid={`button-order-details-${message.id}`}
                                                >
                                                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                                                  {lang === "it" ? "Dettagli ordine" : "Details anzeigen"}
                                                </Button>
                                              </div>
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
                                      <div className="w-[75%] max-w-sm rounded-lg border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`inactive-complaint-${message.id}`}>
                                        <div className="flex items-center justify-between px-3 py-2 gap-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-xs text-muted-foreground truncate">{complaintData?.title || "Reklamation"}</span>
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
                                    <div className="w-[75%] max-w-sm rounded-lg border bg-card shadow-sm overflow-hidden border-2 border-red-500/30 shadow-lg">
                                      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-red-500/10 border-red-500/20">
                                        <div className="flex items-center gap-2">
                                          <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                                          <span className="text-xs font-semibold text-red-600 dark:text-red-400">Reklamation</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {complaintStatus && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getComplaintStatusColor(complaintStatus)}`} data-testid={`complaint-status-${message.id}`}>
                                              {getComplaintStatusLabel(complaintStatus)}
                                            </span>
                                          )}
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
                                                  <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 text-[9px] px-1.5 py-0 h-4 shrink-0 font-bold" variant="outline">
                                                    PRIORIT&Auml;T
                                                  </Badge>
                                                )}
                                                <span className="font-medium">{complaintData.title}</span>
                                              </div>
                                              <Badge variant="outline" className="text-xs">
                                                Bestellung #{complaintData.orderId?.substring(0, 8)}
                                              </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground line-clamp-2">{complaintData.description}</p>
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
                                                    <div key={idx} className="flex items-center justify-between text-xs">
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
                                        <div className="px-3 py-2 border-t border-red-500/20 bg-red-500/5">
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
                                            Details & Aktionen
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
                                    <div className="w-[75%] max-w-sm rounded-lg border bg-card shadow-sm overflow-hidden border-2 border-blue-500/30 shadow-lg">
                                      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-blue-500/10 border-blue-500/20">
                                        <div className="flex items-center gap-2">
                                          <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Lieferschein</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                          {format(messageDate, "HH:mm")}
                                        </span>
                                      </div>
                                      <div className="px-3 py-2">
                                        <p className="text-sm font-medium">{docData.title || "Dokument"}</p>
                                        {docData.orderId && (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            Bestellung #{docData.orderId.slice(0, 8)}
                                          </p>
                                        )}
                                      </div>
                                      {docData.orderId && (
                                        <div className="px-3 py-2 border-t border-blue-500/20 bg-blue-500/5">
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
                                            Lieferschein herunterladen
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
                                      <div className="w-[75%] max-w-sm rounded-lg border bg-card shadow-sm overflow-hidden border-orange-300" data-testid={`partial-confirmation-${message.id}`}>
                                        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-orange-500/10 border-orange-500/20">
                                          <div className="flex items-center gap-2">
                                            <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                                            <span className="text-xs font-semibold text-orange-600">
                                              {pcData.status === "partially_confirmed"
                                                ? (lang === "it" ? "Parzialmente confermato" : "Teilbestatigt")
                                                : (lang === "it" ? "Confermato" : "Bestatigt")}
                                            </span>
                                          </div>
                                          <span className="text-xs text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                        </div>
                                        <div className="px-3 py-2 space-y-1.5">
                                          {pcData.orderId && (
                                            <p className="text-xs text-muted-foreground">
                                              {lang === "it" ? "Ordine" : "Bestellung"} #{pcData.orderId.slice(0, 8)}
                                            </p>
                                          )}
                                          {pcData.items?.map((item, idx) => (
                                            <div key={idx} className={`flex items-center justify-between text-xs ${item.rejected > 0 ? "text-orange-700" : "text-foreground"}`}>
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
                                            <div className="flex items-center justify-between text-xs font-semibold pt-1 border-t">
                                              <span>{lang === "it" ? "Totale" : "Gesamt"}</span>
                                              <span>{pcData.total}</span>
                                            </div>
                                          )}
                                        </div>
                                        {pcData.orderId && (
                                          <div className="px-3 py-1.5 border-t bg-muted/30">
                                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] w-full" onClick={() => setOrderDetailId(pcData.orderId!)} data-testid={`button-pc-details-${message.id}`}>
                                              <Eye className="h-3 w-3 mr-1" />
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
                                      <div className="w-[75%] max-w-sm rounded-lg border border-muted bg-muted/20 opacity-50 overflow-hidden" data-testid={`inactive-change-${message.id}`}>
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
                                    <div className="w-[75%] max-w-sm rounded-lg border bg-card shadow-sm overflow-hidden border-2 border-amber-500/30">
                                      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-amber-500/10 border-amber-500/20">
                                        <div className="flex items-center gap-2">
                                          <Pencil className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{label}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">{format(messageDate, "HH:mm")}</span>
                                      </div>
                                      <div className="px-3 py-2">
                                        {changeData.orderId && (
                                          <p className="text-xs text-muted-foreground mb-2">Bestellung #{changeData.orderId.slice(0, 8)}</p>
                                        )}
                                        <p className="text-sm">{changeData.message}</p>
                                        {isRequest && changeData.reason && (
                                          <p className="text-sm text-muted-foreground mt-1">Grund: {changeData.reason}</p>
                                        )}
                                      </div>
                                      {isPendingRequest && !isOwn && changeData.orderId && (
                                        <div className="px-3 py-2 border-t border-amber-500/20 bg-amber-500/5 flex gap-2">
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
                                    <div className={`max-w-[70%] group/msg flex items-center gap-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                                      <div className="flex-1 min-w-0">
                                        {isImportant && (
                                          <div className={`flex items-center gap-1 mb-0.5 px-1 ${isOwn ? "justify-end" : ""}`}>
                                            <span className="text-[11px] font-bold text-red-500 uppercase">IMPORTANT</span>
                                          </div>
                                        )}
                                        {showSenderName && !isImportant && (
                                          <p className={`text-[11px] font-semibold mb-0.5 px-1 ${isOwn ? "text-right text-secondary-foreground/70" : "text-indigo-600 dark:text-indigo-400"}`}>
                                            {senderName}
                                          </p>
                                        )}
                                        {showSenderName && isImportant && (
                                          <p className={`text-[11px] font-semibold mb-0.5 px-1 ${isOwn ? "text-right text-red-400" : "text-red-500"}`}>
                                            {senderName}
                                          </p>
                                        )}
                                        <div className={`flex items-start gap-1.5 ${isOwn ? "flex-row-reverse" : ""}`}>
                                          {isImportant && (
                                            <div className="shrink-0 mt-2">
                                              <CircleAlert className="h-4 w-4 text-red-500" />
                                            </div>
                                          )}
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
                                                  {refData.refLabel || (refData.refType === "order" ? (lang === "de" ? "Bestellung" : "Ordine") : (lang === "de" ? "Reklamation" : "Reclamo"))}
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
                                                ? <CheckCheck className={`h-3 w-3 ${isImportant ? "text-muted-foreground" : "text-secondary-foreground/70"}`} />
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
                    <div className="flex items-center gap-2 mb-2 px-1" data-testid="attached-reply-ref">
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
                  {messagePriority === "important" && (
                    <div className="flex items-center justify-between mb-2 px-1" data-testid="priority-important-banner">
                      <div className="flex items-center gap-1.5">
                        <CircleAlert className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-bold text-red-500">IMPORTANT!</span>
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
                            <CircleAlert className="h-4 w-4 text-red-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">Important</p>
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
                      className="text-sm rounded-full"
                      data-testid="input-message"
                    />
                    <Button 
                      variant="secondary"
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() || sendMessageMutation.isPending}
                      className="rounded-full shrink-0"
                      data-testid="button-send-message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
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

      <Dialog open={!!orderDetailId} onOpenChange={(open) => !open && setOrderDetailId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-green-600" />
              Bestelldetails
            </DialogTitle>
          </DialogHeader>
          {orderDetail && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Bestellnummer</div>
                  <span className="font-mono text-sm font-semibold" data-testid="text-order-id">#{orderDetail.id.slice(0, 8)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge className={`${getStatusColor(orderDetail.status)} text-xs`} variant="outline">
                    {getStatusLabel(orderDetail.status)}
                  </Badge>
                  {orderDetail.status !== "delivered" && orderDetail.status !== "cancelled" && (
                    <>
                      {orderDetail.status === "pending" && (
                        <Button size="sm" onClick={() => { setOrderDetailId(null); setConfirmOrderForDialog(orderDetail); }} data-testid="button-status-confirmed">
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />
                          {lang === "it" ? "Conferma" : "Bestätigen"}
                        </Button>
                      )}
                      {(orderDetail.status === "confirmed" || orderDetail.status === "partially_confirmed") && (
                        <Button size="sm" onClick={() => updateOrderStatusMutation.mutate({ orderId: orderDetail.id, status: "in_delivery" })} disabled={updateOrderStatusMutation.isPending} data-testid="button-status-in_delivery">
                          <Truck className="h-3.5 w-3.5 mr-1" />
                          {lang === "it" ? "In consegna" : "In Lieferung"}
                        </Button>
                      )}
                      {orderDetail.status === "in_delivery" && (
                        <Button size="sm" onClick={() => updateOrderStatusMutation.mutate({ orderId: orderDetail.id, status: "delivered" })} disabled={updateOrderStatusMutation.isPending} data-testid="button-status-delivered">
                          <Package className="h-3.5 w-3.5 mr-1" />
                          Geliefert
                        </Button>
                      )}
                      {orderDetail.status !== "in_delivery" && (
                        <Button size="sm" variant="outline" onClick={() => updateOrderStatusMutation.mutate({ orderId: orderDetail.id, status: "cancelled" })} disabled={updateOrderStatusMutation.isPending} data-testid="button-status-cancelled">
                          <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                          {lang === "it" ? "Annulla" : "Stornieren"}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {orderDetail.status !== "cancelled" && (
                <div className="border rounded-lg p-3 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">
                      {lang === "it" ? "Correggi stato" : "Status korrigieren"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Select
                      onValueChange={(value) => {
                        if (value && value !== orderDetail.status) {
                          updateOrderStatusMutation.mutate({ orderId: orderDetail.id, status: value });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-status-correction">
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
                </div>
              )}

              {orderDetail.restaurant && (
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={orderDetail.restaurant.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {orderDetail.restaurant.companyName?.substring(0, 2).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-sm">{orderDetail.restaurant.companyName || t("common", "restaurant")}</div>
                    <div className="text-xs text-muted-foreground">{t("common", "restaurant")}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Erstellt am</div>
                  <div className="text-sm font-medium">{format(new Date(orderDetail.createdAt), "dd.MM.yyyy", { locale: de })}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(orderDetail.createdAt), "HH:mm", { locale: de })} Uhr</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Letzte Änderung</div>
                  <div className="text-sm font-medium">{format(new Date(orderDetail.updatedAt), "dd.MM.yyyy", { locale: de })}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(orderDetail.updatedAt), "HH:mm", { locale: de })} Uhr</div>
                </div>
              </div>
              {orderDetail.createdByUser && (
                <div className="flex items-center gap-2 p-3 rounded-lg border" data-testid="detail-created-by">
                  <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">{t("orders", "createdBy")}</div>
                    <div className="text-sm font-medium">{orderDetail.createdByUser.name}</div>
                  </div>
                </div>
              )}
              
              <Separator />

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  Statusverlauf
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
                  Produkte ({orderDetail.items.length})
                </h4>
                <div className="rounded-lg border overflow-hidden">
                  {orderDetail.items.map((item: any, idx: number) => (
                    <div key={item.id} className={`flex items-center gap-2.5 px-3 py-2.5 ${idx < orderDetail.items.length - 1 ? "border-b" : ""}`} data-testid={`order-item-${item.id}`}>
                      {item.productImageUrl ? (
                        <img src={item.productImageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
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
                  <div className="flex justify-between items-center gap-2 px-3 py-3 bg-green-500/10 border-t">
                    <span className="text-sm font-bold">{lang === "it" ? "Totale" : "Gesamtbetrag"}</span>
                    <span className="text-base font-bold text-green-700 dark:text-green-400">{parseFloat(orderDetail.totalAmount).toFixed(2)}€</span>
                  </div>
                </div>
              </div>

              {orderDetail.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2 text-sm">Notizen</h4>
                    <p className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/30 border">{orderDetail.notes}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Complaint Detail Dialog */}
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
              Reklamationsdetails
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
              <p className="text-sm font-medium text-destructive">Fehler beim Laden</p>
              <p className="text-xs text-muted-foreground mt-1">Die Reklamation konnte nicht geladen werden.</p>
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
                        <div className="text-xs text-muted-foreground mb-1">Reklamation</div>
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
                  <AvatarImage src={complaintDetail.restaurant?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {complaintDetail.restaurant?.companyName?.substring(0, 2).toUpperCase() || "??"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium text-sm">{complaintDetail.restaurant?.companyName || "Unbekannt"}</div>
                  <div className="text-xs text-muted-foreground">{complaintDetail.restaurant?.email}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Erstellt am</div>
                  <div className="text-sm font-medium">{format(new Date(complaintDetail.createdAt), "dd.MM.yyyy", { locale: de })}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(complaintDetail.createdAt), "HH:mm", { locale: de })} Uhr</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Letzte Änderung</div>
                  <div className="text-sm font-medium">{format(new Date(complaintDetail.updatedAt), "dd.MM.yyyy", { locale: de })}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(complaintDetail.updatedAt), "HH:mm", { locale: de })} Uhr</div>
                </div>
              </div>

              <Separator />

              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  {(complaintDetail as any).priority === "urgent" && (
                    <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 text-[9px] px-1.5 py-0 h-4 shrink-0 font-bold" variant="outline">
                      PRIORIT&Auml;T
                    </Badge>
                  )}
                  <h4 className="font-semibold text-base" data-testid="text-complaint-title">{complaintDetail.title}</h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap p-3 rounded-lg bg-muted/30 border" data-testid="text-complaint-description">{complaintDetail.description}</p>

                {complaintDetail.affectedItems && (() => {
                  try {
                    const items = JSON.parse(complaintDetail.affectedItems);
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
                              <div key={idx} className="flex items-center justify-between text-sm">
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
                  <h4 className="font-medium text-sm mb-2">Anhänge</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {complaintDetail.mediaUrls.map((url, idx) => (
                      <a 
                        key={idx} 
                        href={getMediaSrc(url)}
                        rel="noopener noreferrer"
                        className="block aspect-square rounded-lg overflow-hidden border hover-elevate"
                      >
                        {isVideoFile(url) ? (
                          <div className="h-full w-full flex items-center justify-center bg-muted">
                            <FileVideo className="h-6 w-6 text-muted-foreground" />
                          </div>
                        ) : (
                          <img 
                            src={getMediaSrc(url)} 
                            alt={`Anhang ${idx + 1}`}
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
                  <span className="text-sm font-medium">Betroffene Bestellung</span>
                  <Badge variant="outline">#{complaintDetail.orderId.substring(0, 8)}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Gesamtbetrag: {complaintDetail.order?.totalAmount ? parseFloat(complaintDetail.order.totalAmount).toFixed(2) : "0.00"}€
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  Statusverlauf
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
                  Kommentare ({complaintComments?.length || 0})
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
                            <span className="text-sm font-medium">{comment.user?.companyName || comment.user?.name || "Unbekannt"}</span>
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
                  <p className="text-sm text-muted-foreground text-center py-4">Noch keine Kommentare vorhanden</p>
                )}
              </div>

              {complaintDetail.status !== "closed" && complaintDetail.status !== "resolved" && (
                <div className="space-y-2 border-t pt-4">
                  <Label className="text-sm">Kommentar hinzufügen</Label>
                  <div className="flex gap-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Schreiben Sie einen Kommentar..."
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

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={openComplaintStatusDialog}
                  data-testid="button-change-complaint-status"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Status ändern
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">Reklamation nicht gefunden</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Complaint Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Status ändern</DialogTitle>
            <DialogDescription>
              Wählen Sie den neuen Status für diese Reklamation
            </DialogDescription>
          </DialogHeader>
          
          {complaintDetail && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium text-sm">{complaintDetail.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {complaintDetail.restaurant?.companyName}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {complaintDetail.status === "open" && (
                  <>
                    <Button size="sm" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "in_progress" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-in_progress">
                      <Loader2 className="h-3.5 w-3.5 mr-1" />
                      In Bearbeitung
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "closed" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-closed">
                      <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                      Schließen
                    </Button>
                  </>
                )}
                {complaintDetail.status === "in_progress" && (
                  <>
                    <Button size="sm" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "resolved" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-resolved">
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Gelöst
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "closed" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-closed">
                      <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                      Schließen
                    </Button>
                  </>
                )}
                {complaintDetail.status === "resolved" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "closed" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-closed">
                      <XCircle className="h-3.5 w-3.5 mr-1 text-destructive" />
                      Schließen
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "open" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-open">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      Wieder öffnen
                    </Button>
                  </>
                )}
                {complaintDetail.status === "closed" && (
                  <Button size="sm" variant="outline" onClick={() => updateComplaintStatusMutation.mutate({ id: selectedComplaintId!, status: "open" })} disabled={updateComplaintStatusMutation.isPending} data-testid="button-status-open">
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    Wieder öffnen
                  </Button>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowStatusDialog(false)}
            >
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complaint Comment Dialog */}
      <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Kommentare</DialogTitle>
            <DialogDescription>
              Kommentare zur Reklamation anzeigen und hinzufügen
            </DialogDescription>
          </DialogHeader>
          
          {complaintDetail && (
            <div className="flex flex-col flex-1 min-h-0 space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 shrink-0">
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
        onConfirm={(date) => {
          if (deliveryDatePicker) {
            if (cardWizard?.action === "in_delivery") {
              updateOrderStatusMutation.mutate(
                { orderId: deliveryDatePicker.orderId, status: "in_delivery", requestedDeliveryDate: date },
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
    </div>
  );
}
