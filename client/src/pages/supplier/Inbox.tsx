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
import { Send, MessageSquare, Search, Check, CheckCheck, ClipboardList, Eye, AlertCircle, ArrowLeft } from "lucide-react";
import type { ConversationWithUser, Message, Order } from "@shared/schema";
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
}

interface OrderWithDetails extends Order {
  items: { id: string; productName: string; quantity: number; unitPrice: string; totalPrice: string }[];
  restaurant?: { companyName: string };
  supplier?: { companyName: string };
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
    },
    onError: () => {
      toast({ title: "Fehler", description: "Status konnte nicht aktualisiert werden.", variant: "destructive" });
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
                                  return (
                                    <div className="w-[85%] rounded-lg border bg-card shadow-lg overflow-hidden">
                                      <div className="flex items-center justify-between px-4 py-2 bg-green-500/10 border-b border-green-500/20">
                                        <div className="flex items-center gap-2">
                                          <ClipboardList className="h-4 w-4 text-green-600 dark:text-green-400" />
                                          <span className="text-sm font-medium text-green-600 dark:text-green-400">Neue Bestellung</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                          {format(messageDate, "HH:mm")}
                                        </span>
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
                                        <div className="px-4 py-2 border-t bg-muted/30">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full"
                                            onClick={() => setOrderDetailId(message.orderId)}
                                            data-testid={`button-order-details-${message.id}`}
                                          >
                                            <Eye className="h-4 w-4 mr-2" />
                                            Details anzeigen
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              ) : message.messageType === "complaint" ? (
                                (() => {
                                  const complaintData = parseComplaintContent(message.content);
                                  return (
                                    <div className="w-[85%] rounded-lg border bg-card shadow-lg overflow-hidden">
                                      <div className="flex items-center justify-between px-4 py-2 bg-red-500/10 border-b border-red-500/20">
                                        <div className="flex items-center gap-2">
                                          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                          <span className="text-sm font-medium text-red-600 dark:text-red-400">Reklamation</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                          {format(messageDate, "HH:mm")}
                                        </span>
                                      </div>
                                      <div className="px-4 py-3">
                                        {complaintData ? (
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between">
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Bestelldetails
            </DialogTitle>
          </DialogHeader>
          {orderDetail && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Bestellnummer</span>
                <span className="font-mono text-sm">#{orderDetail.id.slice(0, 8)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Restaurant</span>
                <span className="text-sm">{orderDetail.restaurant?.companyName || "Unbekannt"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
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
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Datum</span>
                <span className="text-sm">{format(new Date(orderDetail.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}</span>
              </div>
              
              <Separator />
              
              <div>
                <h4 className="font-medium mb-3">Produkte</h4>
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
              
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Gesamtbetrag</span>
                <span>{orderDetail.totalAmount}€</span>
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
    </div>
  );
}
