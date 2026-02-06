import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useChat } from "@/context/ChatContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, MessageSquare, Search, Check, CheckCheck, ClipboardList, Eye, AlertCircle, ArrowLeft, Settings, Clock, Loader2, CheckCircle, XCircle, FileVideo, FileImage, Package } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { ConversationWithUser, Message, Order, ComplaintWithDetails, ComplaintCommentWithUser } from "@shared/schema";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

export default function SupplierInbox() {
  const { currentUser } = useUser();
  const { setIsInChat } = useChat();
  const { toast } = useToast();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [orderDetailId, setOrderDetailId] = useState<string | null>(null);
  
  // Complaint management state
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [showComplaintDetail, setShowComplaintDetail] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setIsInChat(isMobile && selectedConversation !== null);
    return () => setIsInChat(false);
  }, [selectedConversation, setIsInChat]);

  const { data: orderDetail, refetch: refetchOrderDetail } = useQuery<OrderWithDetails>({
    queryKey: ["/api/orders", orderDetailId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderDetailId}`);
      return res.json();
    },
    enabled: !!orderDetailId,
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      return await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      toast({ title: "Status aktualisiert", description: "Der Bestellstatus wurde erfolgreich geändert." });
      refetchOrderDetail();
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
    },
    onError: () => {
      toast({ title: "Fehler", description: "Status konnte nicht aktualisiert werden.", variant: "destructive" });
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
      return apiRequest("PATCH", `/api/complaints/${id}`, { status });
    },
    onSuccess: () => {
      toast({ title: "Status aktualisiert", description: "Der Reklamationsstatus wurde erfolgreich geändert." });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaintId] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'statuses'] });
      }
      setShowStatusDialog(false);
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

  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    if (currentUser?.id) {
      markAsReadMutation.mutate(conversationId);
    }
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/conversations/${selectedConversation}/messages`, {
        content,
        messageType: "text",
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

  const handleSendMessage = () => {
    if (messageText.trim() && selectedConversation) {
      sendMessageMutation.mutate(messageText.trim());
    }
  };

  const handleBackToList = () => {
    setSelectedConversation(null);
  };

  return (
    <div className={`${selectedConversation ? 'h-screen md:max-h-[calc(100vh-8rem)]' : 'max-h-[calc(100vh-8rem)]'} flex flex-col`}>
      <div className={`mb-3 md:mb-4 ${selectedConversation ? 'hidden md:block' : ''}`}>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Inbox</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Kommunizieren Sie mit Ihren Kunden</p>
      </div>

      <Card className={`${selectedConversation ? 'flex-1 md:flex-none md:max-h-[calc(100%-4rem)] border-0 md:border rounded-none md:rounded-lg' : 'md:max-h-[calc(100%-4rem)]'} flex flex-col overflow-hidden`}>
        <div className="flex flex-1 min-h-0">
          <div className={`w-full md:w-72 lg:w-80 border-r border-border flex flex-col ${selectedConversation ? 'hidden md:flex' : 'flex'}`}>
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
                        ? "📦 Neue Bestellung" 
                        : conv.lastMessage?.messageType === "complaint"
                        ? "⚠️ Reklamation"
                        : conv.lastMessage?.content || "Keine Nachrichten";
                      return (
                        <button
                          key={conv.id}
                          onClick={() => handleSelectConversation(conv.id)}
                          className={`w-full p-2.5 rounded-md text-left transition-colors hover-elevate overflow-hidden ${
                            selectedConversation === conv.id
                              ? "bg-secondary/10"
                              : ""
                          }`}
                          data-testid={`conversation-${conv.id}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarImage src={conv.otherUser.profileImageUrl || undefined} alt={conv.otherUser.name} />
                              <AvatarFallback className="bg-primary/20 text-primary text-sm">
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
                                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[9px] text-secondary-foreground font-medium">
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
                    <Avatar className="h-8 w-8 md:h-10 md:w-10">
                      <AvatarImage src={selectedConv.otherUser.profileImageUrl || undefined} alt={selectedConv.otherUser.name} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm">
                        {selectedConv.otherUser.companyName?.charAt(0) || selectedConv.otherUser.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm md:text-base truncate" data-testid="text-conversation-partner">
                        {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                      </p>
                      <p className="text-[10px] md:text-xs text-muted-foreground truncate">
                        {selectedConv.otherUser.email}
                      </p>
                    </div>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4">
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
                              className={`flex ${message.messageType === "order" || message.messageType === "complaint" ? "justify-center" : isOwn ? "justify-end" : "justify-start"}`}
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
                                            <p className="text-sm text-muted-foreground line-clamp-2">{complaintData.description}</p>
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
                                            Details & Aktionen
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              ) : (
                                <div
                                  className={`max-w-[70%] rounded-lg px-3 py-2 shadow-lg ${
                                    isOwn
                                      ? "bg-secondary text-secondary-foreground"
                                      : "bg-muted"
                                  }`}
                                >
                                  <p className="text-sm">{message.content}</p>
                                  <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                                    <span className={`text-[10px] ${isOwn ? "text-secondary-foreground/70" : "text-muted-foreground"}`}>
                                      {format(messageDate, "HH:mm")}
                                    </span>
                                    {isOwn && (
                                      message.isRead 
                                        ? <CheckCheck className="h-3 w-3 text-secondary-foreground/70" />
                                        : <Check className="h-3 w-3 text-secondary-foreground/70" />
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

                <div className="border-t border-border p-2 md:p-4">
                  <div className="flex gap-2">
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
                      className="text-sm"
                      data-testid="input-message"
                    />
                    <Button 
                      variant="secondary"
                      size="icon"
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
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-lg font-medium">Wählen Sie eine Konversation</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Wählen Sie ein Restaurant aus der Liste
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
                <Select
                  value={orderDetail.status}
                  onValueChange={(value) => {
                    updateOrderStatusMutation.mutate({ orderId: orderDetail.id, status: value });
                  }}
                  disabled={updateOrderStatusMutation.isPending}
                >
                  <SelectTrigger className="w-[160px]" data-testid="select-order-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Neu</SelectItem>
                    <SelectItem value="confirmed">Bestätigt</SelectItem>
                    <SelectItem value="in_delivery">In Lieferung</SelectItem>
                    <SelectItem value="delivered">Geliefert</SelectItem>
                    <SelectItem value="cancelled">Storniert</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {orderDetail.restaurant && (
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={orderDetail.restaurant.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {orderDetail.restaurant.companyName?.substring(0, 2).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-sm">{orderDetail.restaurant.companyName || "Restaurant"}</div>
                    <div className="text-xs text-muted-foreground">Restaurant</div>
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
              {/* Status Badge */}
              {(() => {
                const statusInfo = formatComplaintStatus(complaintDetail.status);
                const StatusIcon = statusInfo.icon;
                return (
                  <div className="flex items-center justify-between">
                    <Badge variant={statusInfo.variant} className="text-sm">
                      <StatusIcon className="h-3.5 w-3.5 mr-1.5" />
                      {statusInfo.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(complaintDetail.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                    </span>
                  </div>
                );
              })()}

              <Separator />

              {/* Restaurant info */}
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={complaintDetail.restaurant?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {complaintDetail.restaurant?.companyName?.substring(0, 2).toUpperCase() || "??"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{complaintDetail.restaurant?.companyName || "Unbekannt"}</div>
                  <div className="text-sm text-muted-foreground">{complaintDetail.restaurant?.email}</div>
                </div>
              </div>

              <Separator />

              {/* Title and description */}
              <div>
                <h4 className="font-semibold text-lg mb-2">{complaintDetail.title}</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{complaintDetail.description}</p>
              </div>

              {/* Media attachments */}
              {complaintDetail.mediaUrls && complaintDetail.mediaUrls.length > 0 && (
                <div className="space-y-2">
                  <Label>Anhänge ({complaintDetail.mediaUrls.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {complaintDetail.mediaUrls.map((url, idx) => (
                      <a 
                        key={idx} 
                        href={getMediaSrc(url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-20 w-20 rounded-lg overflow-hidden border hover:opacity-80 transition-opacity"
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

              {/* Order info */}
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Betroffene Bestellung</span>
                  <Badge variant="outline">#{complaintDetail.orderId.substring(0, 8)}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Gesamtbetrag: {complaintDetail.order?.totalAmount}€
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
                  <div className="space-y-3 max-h-48 overflow-y-auto">
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

              {/* Action buttons */}
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

              <div className="space-y-2">
                <Label>Neuer Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger data-testid="select-inbox-complaint-status">
                    <SelectValue placeholder="Status wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Offen
                      </div>
                    </SelectItem>
                    <SelectItem value="in_progress">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4" />
                        In Bearbeitung
                      </div>
                    </SelectItem>
                    <SelectItem value="resolved">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Gelöst
                      </div>
                    </SelectItem>
                    <SelectItem value="closed">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Geschlossen
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
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleComplaintStatusSubmit}
              disabled={!newStatus || updateComplaintStatusMutation.isPending}
            >
              {updateComplaintStatusMutation.isPending ? "Wird gespeichert..." : "Speichern"}
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
    </div>
  );
}
