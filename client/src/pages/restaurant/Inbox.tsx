import { useState, useRef, useEffect } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Send, MessageSquare, Search, Check, CheckCheck, Plus, ShoppingCart, X, Minus, Package, Phone, ClipboardList, Eye, AlertCircle, ArrowLeft, Settings, Clock, Loader2, CheckCircle, XCircle, FileText, Download, Paperclip } from "lucide-react";
import { AttachmentPopover, AttachmentMessageCard } from "@/components/ChatAttachment";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConversationWithUser, Message, Product, Order, ComplaintWithDetails, ComplaintCommentWithUser } from "@shared/schema";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProductDetailDialog from "@/components/ProductDetailDialog";

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

const formatDateDivider = (date: Date) => {
  if (isToday(date)) return "Heute";
  if (isYesterday(date)) return "Gestern";
  return format(date, "dd. MMMM yyyy", { locale: de });
};

interface OrderWithDetails extends Order {
  items: { id: string; productName: string; quantity: number; unitPrice: string; totalPrice: string }[];
  restaurant?: { companyName: string; profileImageUrl?: string | null };
  supplier?: { companyName: string; profileImageUrl?: string | null };
}

export default function RestaurantInbox() {
  const { currentUser } = useUser();
  const { setIsInChat } = useChat();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionMode, setActionMode] = useState<ActionMode>("none");
  const [inboxDetailProduct, setInboxDetailProduct] = useState<Product | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [orderDetailId, setOrderDetailId] = useState<string | null>(null);
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

  const formatComplaintStatus = (status: string) => {
    const statusMap: Record<string, { label: string; icon: any; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      open: { label: "Offen", icon: Clock, variant: "destructive" },
      in_progress: { label: "In Bearbeitung", icon: Loader2, variant: "default" },
      resolved: { label: "Gelöst", icon: CheckCircle, variant: "secondary" },
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const { data: conversations, isLoading: conversationsLoading } = useQuery<ConversationWithUser[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: [`/api/conversations/${selectedConversation}/messages`],
    enabled: !!selectedConversation,
  });

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
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      toast({
        title: "Bestellung aufgegeben",
        description: "Ihre Bestellung wurde erfolgreich übermittelt.",
      });
      setOrderItems({});
      setActionMode("none");
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Bestellung konnte nicht aufgegeben werden.",
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
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations/${selectedConversation}/messages`] });
      toast({
        title: "Reklamation gesendet",
        description: "Ihre Reklamation wurde erfolgreich übermittelt.",
      });
      setComplaintOrderId("");
      setComplaintTitle("");
      setComplaintDescription("");
      setActionMode("none");
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Reklamation konnte nicht gesendet werden.",
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
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, { status: "cancelled" });
    },
    onSuccess: () => {
      toast({ title: "Bestellung storniert", description: "Die Bestellung wurde erfolgreich storniert." });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderDetailId] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
      setShowCancelOrderConfirm(false);
    },
    onError: () => {
      toast({ title: "Fehler", description: "Bestellung konnte nicht storniert werden.", variant: "destructive" });
    },
  });

  const withdrawComplaintMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, { status: "closed" });
    },
    onSuccess: () => {
      toast({ title: "Reklamation zurückgezogen", description: "Die Reklamation wurde geschlossen." });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId] });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
      setShowWithdrawComplaintConfirm(false);
    },
    onError: () => {
      toast({ title: "Fehler", description: "Reklamation konnte nicht zurückgezogen werden.", variant: "destructive" });
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
      setNewComplaintComment("");
    },
    onError: () => {
      toast({ title: "Fehler", description: "Kommentar konnte nicht gespeichert werden.", variant: "destructive" });
    },
  });

  const formatOrderDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("de-DE", {
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
    <div className={`${selectedConversation ? 'h-screen md:h-[calc(100vh-8rem)]' : 'h-[calc(100vh-8rem)]'} flex flex-col`}>
      <div className={`mb-3 md:mb-4 ${selectedConversation ? 'hidden md:block' : ''}`}>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Inbox</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Kommunizieren Sie mit Ihren Lieferanten</p>
      </div>

      <Card className={`${selectedConversation ? 'flex-1 border-0 md:border rounded-none md:rounded-lg' : 'flex-1'} flex flex-col overflow-hidden`}>
        <div className="flex flex-1 min-h-0">
          <div className={`w-full md:w-72 lg:w-80 border-r border-border flex flex-col max-h-[calc(100vh-12rem)] md:max-h-none ${selectedConversation ? 'hidden md:flex' : 'flex'}`}>
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
            <div className="overflow-y-auto">
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
                      const messagePreview = conv.lastMessage?.messageType === "order" 
                        ? "Bestellung" 
                        : conv.lastMessage?.messageType === "complaint"
                        ? "Reklamation"
                        : conv.lastMessage?.messageType === "document"
                        ? "Lieferschein"
                        : conv.lastMessage?.messageType === "attachment"
                        ? "Anhang"
                        : conv.lastMessage?.content || "Keine Nachrichten";
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
                              : ""
                          }`}
                          data-testid={`conversation-${conv.id}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarImage src={conv.otherUser.profileImageUrl || undefined} alt={conv.otherUser.name} />
                              <AvatarFallback className="bg-secondary/20 text-secondary text-sm">
                                {conv.otherUser.companyName?.charAt(0) || conv.otherUser.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium truncate flex-1 min-w-0">
                                  {conv.otherUser.companyName || conv.otherUser.name}
                                </p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {lastMessageTime && (
                                    <span className="text-[10px] text-muted-foreground">{lastMessageTime}</span>
                                  )}
                                  {conv.unreadCount > 0 && (
                                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-medium">
                                      {conv.unreadCount}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground truncate max-w-full">
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

          <div className={`flex-1 flex flex-col ${selectedConversation ? 'flex' : 'hidden md:flex'}`}>
            {selectedConversation && selectedConv ? (
              <>
                <div className="border-b border-border p-2.5 md:p-4 bg-background">
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
                          
                          return (
                            <div key={message.id}>
                              {showDateDivider && (
                                <div className="flex justify-center my-4">
                                  <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                                    {formatDateDivider(messageDate)}
                                  </span>
                                </div>
                              )}
                              <div
                                className={`flex ${message.messageType === "order" || message.messageType === "complaint" || message.messageType === "document" ? "justify-center" : message.messageType === "attachment" ? (isOwn ? "justify-end" : "justify-start") : isOwn ? "justify-end" : "justify-start"}`}
                                data-testid={`message-${message.id}`}
                              >
                                {message.messageType === "order" ? (
                                  (() => {
                                    const orderData = parseOrderContent(message.content);
                                    const orderStatus = message.orderId ? conversationStatuses?.orderStatuses?.[message.orderId] : undefined;
                                    const inactive = orderStatus ? isOrderInactive(orderStatus) : false;
                                    return (
                                      <div className={`w-[85%] rounded-lg border bg-card shadow-sm overflow-hidden ${inactive ? "border-muted opacity-60" : "border-2 border-green-500/30 shadow-lg"}`}>
                                        <div className={`flex items-center justify-between px-4 py-2.5 border-b ${inactive ? "bg-muted/30 border-muted" : "bg-green-500/10 border-green-500/20"}`}>
                                          <div className="flex items-center gap-2">
                                            <ClipboardList className={`h-4 w-4 ${inactive ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`} />
                                            <span className={`text-sm font-semibold ${inactive ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>Bestellung</span>
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
                                                <span>Gesamt</span>
                                                <span>{orderData.total}€</span>
                                              </div>
                                            </div>
                                          ) : (
                                            <p className="text-sm">{message.content}</p>
                                          )}
                                        </div>
                                        {message.orderId && (
                                          <div className={`px-4 py-2.5 border-t ${inactive ? "border-muted bg-muted/20" : "border-green-500/20 bg-green-500/5"}`}>
                                            <Button
                                              variant={inactive ? "outline" : "default"}
                                              size="sm"
                                              className="w-full"
                                              onClick={() => setOrderDetailId(message.orderId)}
                                              data-testid={`button-order-details-${message.id}`}
                                            >
                                              <Eye className="h-4 w-4 mr-2" />
                                              Bestelldetails anzeigen
                                            </Button>
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
                                    return (
                                      <div className={`w-[85%] rounded-lg border bg-card shadow-sm overflow-hidden ${inactive ? "border-muted opacity-60" : "border-2 border-red-500/30 shadow-lg"}`}>
                                        <div className={`flex items-center justify-between px-4 py-2.5 border-b ${inactive ? "bg-muted/30 border-muted" : "bg-red-500/10 border-red-500/20"}`}>
                                          <div className="flex items-center gap-2">
                                            <AlertCircle className={`h-4 w-4 ${inactive ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`} />
                                            <span className={`text-sm font-semibold ${inactive ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>Reklamation</span>
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
                                        <div className="px-4 py-3">
                                          {complaintData ? (
                                            <div className="space-y-2">
                                              <div className="flex items-center justify-between flex-wrap gap-1">
                                                <span className="font-medium">{complaintData.title}</span>
                                                <Badge variant="outline" className="text-xs">
                                                  Bestellung #{complaintData.orderId?.substring(0, 8)}
                                                </Badge>
                                              </div>
                                              <p className="text-sm text-muted-foreground">{complaintData.description}</p>
                                            </div>
                                          ) : (
                                            <p className="text-sm">{message.content}</p>
                                          )}
                                        </div>
                                        {(complaintData?.complaintId || complaintData?.orderId) && (
                                          <div className={`px-4 py-2.5 border-t ${inactive ? "border-muted bg-muted/20" : "border-red-500/20 bg-red-500/5"}`}>
                                            <Button
                                              variant={inactive ? "outline" : "destructive"}
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
                                              Reklamation anzeigen
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
                                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">Lieferschein</span>
                                          </div>
                                          <span className="text-xs text-muted-foreground">
                                            {format(messageDate, "HH:mm")}
                                          </span>
                                        </div>
                                        <div className="px-4 py-3">
                                          <p className="text-sm font-medium">{docData.title || "Dokument"}</p>
                                          {docData.orderId && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                              Bestellung #{docData.orderId.slice(0, 8)}
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
                                                window.open(`/api/orders/${docData.orderId}/delivery-note/download`, "_blank");
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
                                ) : message.messageType === "attachment" ? (
                                  <AttachmentMessageCard
                                    content={message.content}
                                    timestamp={format(messageDate, "HH:mm")}
                                    isOwn={isOwn}
                                    conversationId={selectedConversation || undefined}
                                    userId={currentUser?.id}
                                  />
                                ) : (
                                  <div
                                    className={`max-w-[70%] rounded-lg px-3 py-2 shadow-lg ${
                                      isOwn
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted"
                                    }`}
                                  >
                                    <p className="text-sm">{message.content}</p>
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
                  </ScrollArea>
                ) : actionMode === "order" ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 pb-0">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold flex items-center gap-2">
                          <ShoppingCart className="h-5 w-5" />
                          Neue Bestellung
                        </h3>
                        <Button variant="ghost" size="icon" onClick={() => { setActionMode("none"); setTimeout(scrollToBottom, 100); }} data-testid="button-close-order">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Produkte von {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
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
                            Keine Produkte verfügbar
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
                        Bestellung aufgeben ({totalOrderItems} Artikel)
                      </Button>
                    </div>
                  </div>
                ) : actionMode === "complaint" ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 pb-0">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-red-500" />
                          Reklamation erstellen
                        </h3>
                        <Button variant="ghost" size="icon" onClick={() => { setActionMode("none"); setTimeout(scrollToBottom, 100); }} data-testid="button-close-complaint">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Reklamation an {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                      </p>
                    </div>
                    <ScrollArea className="flex-1 px-6">
                      <div className="space-y-4 pb-4 px-1">
                        <div className="space-y-2">
                          <Label>Bestellung auswählen</Label>
                          <Select
                            value={complaintOrderId}
                            onValueChange={setComplaintOrderId}
                            data-testid="select-complaint-order"
                          >
                            <SelectTrigger data-testid="trigger-complaint-order">
                              <SelectValue placeholder="Bestellung wählen..." />
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
                                <div className="p-2 text-sm text-muted-foreground">Keine Bestellungen gefunden</div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="complaint-title">Betreff</Label>
                          <Input
                            id="complaint-title"
                            placeholder="Kurze Beschreibung des Problems..."
                            value={complaintTitle}
                            onChange={(e) => setComplaintTitle(e.target.value)}
                            disabled={!complaintOrderId}
                            data-testid="input-complaint-title"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="complaint-description">Beschreibung</Label>
                          <Textarea
                            id="complaint-description"
                            placeholder="Detaillierte Beschreibung Ihrer Reklamation..."
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
                        {createComplaintMutation.isPending ? "Wird gesendet..." : "Reklamation senden"}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-border p-4">
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
                          Neue Bestellung
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
                          Reklamation erstellen
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
                      placeholder="Nachricht schreiben..."
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
              <div className="flex-1 flex items-center justify-center h-full min-h-[calc(100vh-200px)]">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-lg font-medium">Wählen Sie eine Konversation</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Wählen Sie einen Lieferanten aus der Liste
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
              Bestelldetails
            </DialogTitle>
          </DialogHeader>
          {orderDetail && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Bestellnummer</div>
                  <span className="font-mono text-sm font-semibold">#{orderDetail.id.slice(0, 8)}</span>
                </div>
                <Badge className={getStatusColor(orderDetail.status)} data-testid="badge-order-status">
                  {getStatusLabel(orderDetail.status)}
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
                    <div className="font-medium text-sm">{orderDetail.supplier.companyName || "Lieferant"}</div>
                    <div className="text-xs text-muted-foreground">Lieferant</div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Datum</span>
                <span className="text-sm">{format(new Date(orderDetail.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}</span>
              </div>
              
              <Separator />
              
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Produkte ({orderDetail.items.length})
                </h4>
                <div className="space-y-2">
                  {orderDetail.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.quantity} x {item.unitPrice}€
                        </p>
                      </div>
                      <span className="font-medium">{item.totalPrice}€</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <Separator />
              
              <div className="flex justify-between items-center p-3 rounded-lg bg-green-500/10 text-lg font-bold">
                <span>Gesamtbetrag</span>
                <span className="text-green-700 dark:text-green-400">{orderDetail.totalAmount}€</span>
              </div>

              {orderDetail.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2">Notizen</h4>
                    <p className="text-sm text-muted-foreground">{orderDetail.notes}</p>
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
                      window.open(`/api/orders/${orderDetail.id}/delivery-note/download`, "_blank");
                    }}
                    data-testid="button-download-delivery-note"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Lieferschein herunterladen
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
                      Bestellung stornieren
                    </Button>
                  ) : (
                    <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
                      <p className="text-sm font-medium text-destructive">Bestellung wirklich stornieren?</p>
                      <p className="text-xs text-muted-foreground">Diese Aktion kann nicht rückgängig gemacht werden.</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setShowCancelOrderConfirm(false)}
                          data-testid="button-cancel-order-abort"
                        >
                          Abbrechen
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1"
                          onClick={() => cancelOrderMutation.mutate(orderDetail.id)}
                          disabled={cancelOrderMutation.isPending}
                          data-testid="button-cancel-order-confirm"
                        >
                          {cancelOrderMutation.isPending ? "Wird storniert..." : "Ja, stornieren"}
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
              {(() => {
                const statusInfo = formatComplaintStatus(complaintDetail.status);
                const StatusIcon = statusInfo.icon;
                return (
                  <div className="flex items-center gap-2">
                    <Badge variant={statusInfo.variant} className="flex items-center gap-1" data-testid="badge-complaint-status">
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Erstellt am {format(new Date(complaintDetail.createdAt), "dd.MM.yyyy", { locale: de })}
                    </span>
                  </div>
                );
              })()}

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={complaintDetail.supplier?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {complaintDetail.supplier?.companyName?.substring(0, 2).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium text-sm">{complaintDetail.supplier?.companyName || "Lieferant"}</div>
                  <div className="text-xs text-muted-foreground">{complaintDetail.supplier?.email}</div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold text-base mb-2" data-testid="text-complaint-title">{complaintDetail.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-complaint-description">{complaintDetail.description}</p>
              </div>

              {complaintDetail.mediaUrls && complaintDetail.mediaUrls.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Anhänge</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {complaintDetail.mediaUrls.map((url: string, idx: number) => (
                      <a key={idx} href={getMediaSrc(url)} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border hover-elevate">
                        {isVideoFile(url) ? (
                          <div className="h-full w-full flex items-center justify-center bg-muted">
                            <Package className="h-6 w-6 text-muted-foreground" />
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

              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Betroffene Bestellung</span>
                  <Badge variant="outline">#{complaintDetail.orderId.substring(0, 8)}</Badge>
                </div>
                {complaintDetail.order && (
                  <div className="text-sm text-muted-foreground">
                    Gesamtbetrag: {complaintDetail.order.totalAmount}€
                  </div>
                )}
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
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={comment.user?.profileImageUrl || undefined} />
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {comment.user?.companyName?.substring(0, 2).toUpperCase() || comment.user?.name?.substring(0, 2).toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{comment.user?.companyName || comment.user?.name || "Unbekannt"}</span>
                            <Badge variant="outline" className="text-xs">
                              {comment.user?.role === "supplier" ? "Lieferant" : "Restaurant"}
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
                      value={newComplaintComment}
                      onChange={(e) => setNewComplaintComment(e.target.value)}
                      placeholder="Schreiben Sie einen Kommentar..."
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
                      Reklamation zurückziehen
                    </Button>
                  ) : (
                    <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3">
                      <p className="text-sm font-medium text-destructive">Reklamation wirklich zurückziehen?</p>
                      <p className="text-xs text-muted-foreground">Die Reklamation wird geschlossen und kann nicht erneut geöffnet werden.</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setShowWithdrawComplaintConfirm(false)}
                          data-testid="button-withdraw-complaint-abort"
                        >
                          Abbrechen
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1"
                          onClick={() => selectedComplaintId && withdrawComplaintMutation.mutate(selectedComplaintId)}
                          disabled={withdrawComplaintMutation.isPending}
                          data-testid="button-withdraw-complaint-confirm"
                        >
                          {withdrawComplaintMutation.isPending ? "Wird geschlossen..." : "Ja, zurückziehen"}
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
              <p className="text-sm">Reklamation nicht gefunden</p>
            </div>
          )}
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
