import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Send, MessageSquare, Search, Check, CheckCheck, Plus, ShoppingCart, X, Minus, Package, Phone, ClipboardList, Eye, AlertCircle } from "lucide-react";
import type { ConversationWithUser, Message, Product, Order } from "@shared/schema";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ActionMode = "none" | "order";

interface OrderContent {
  items: { name: string; quantity: number; price: string }[];
  total: string;
}

interface ComplaintContent {
  title: string;
  description: string;
  orderId: string;
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
    case "pending": return "Ausstehend";
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

interface OrderWithDetails extends Order {
  items: { id: string; productName: string; quantity: number; unitPrice: string; totalPrice: string }[];
  restaurant?: { companyName: string };
  supplier?: { companyName: string };
}

export default function RestaurantInbox() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionMode, setActionMode] = useState<ActionMode>("none");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [orderItems, setOrderItems] = useState<Record<string, number>>({});
  const [orderDetailId, setOrderDetailId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: orderDetail } = useQuery<OrderWithDetails>({
    queryKey: ["/api/orders", orderDetailId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderDetailId}`);
      return res.json();
    },
    enabled: !!orderDetailId,
  });

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

  const filteredConversations = conversations?.filter(conv => 
    conv.otherUser.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.otherUser.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = () => {
    if (messageText.trim() && selectedConversation) {
      sendMessageMutation.mutate(messageText.trim());
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

  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Inbox</h1>
        <p className="text-muted-foreground">Kommunizieren Sie mit Ihren Lieferanten</p>
      </div>

      <Card className="h-[calc(100%-4rem)]">
        <div className="flex h-full">
          <div className="w-80 border-r border-border flex flex-col">
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suche..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-conversations"
                />
              </div>
            </CardHeader>
            <ScrollArea className="flex-1">
              <div className="px-2 pb-2">
                {conversationsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : filteredConversations && filteredConversations.length > 0 ? (
                  <div className="space-y-1">
                    {filteredConversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          handleSelectConversation(conv.id);
                          setActionMode("none");
                          setOrderItems({});
                        }}
                        className={`w-full p-3 rounded-md text-left transition-colors hover-elevate overflow-hidden ${
                          selectedConversation === conv.id
                            ? "bg-primary/10"
                            : ""
                        }`}
                        data-testid={`conversation-${conv.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarFallback className="bg-secondary/20 text-secondary">
                              {conv.otherUser.companyName?.charAt(0) || conv.otherUser.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate max-w-[140px]">
                                {conv.otherUser.companyName || conv.otherUser.name}
                              </p>
                              {conv.unreadCount > 0 && (
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-medium">
                                  {conv.unreadCount}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {conv.lastMessage?.content || "Keine Nachrichten"}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                    <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">Keine Konversationen</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex-1 flex flex-col">
            {selectedConversation && selectedConv ? (
              <>
                <div className="border-b border-border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-secondary/20 text-secondary">
                          {selectedConv.otherUser.companyName?.charAt(0) || selectedConv.otherUser.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium" data-testid="text-conversation-partner">
                          {selectedConv.otherUser.companyName || selectedConv.otherUser.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
                                      <div className="w-[85%] rounded-lg border bg-card shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2 bg-green-500/10 border-b border-green-500/20">
                                          <div className="flex items-center gap-2">
                                            <ClipboardList className="h-4 w-4 text-green-600 dark:text-green-400" />
                                            <span className="text-sm font-medium text-green-600 dark:text-green-400">Bestellung</span>
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
                                      <div className="w-[85%] rounded-lg border bg-card shadow-sm overflow-hidden">
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
                                                <div className="flex">
                                                  {[1, 2, 3, 4, 5].map((star) => (
                                                    <Star
                                                      key={star}
                                                      className={`h-4 w-4 ${
                                                        star <= complaintData.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                                                      }`}
                                                    />
                                                  ))}
                                                </div>
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
                                    className={`max-w-[70%] rounded-lg px-3 py-2 ${
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
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 pb-0">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold flex items-center gap-2">
                          <ShoppingCart className="h-5 w-5" />
                          Neue Bestellung
                        </h3>
                        <Button variant="ghost" size="icon" onClick={() => setActionMode("none")} data-testid="button-close-order">
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
                              <div className="w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0">
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <Package className="h-5 w-5 text-muted-foreground/50" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
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
                )}

                <div className="border-t border-border p-4">
                  <div className="flex gap-2">
                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" data-testid="button-quick-actions">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-2" align="start">
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
                      </PopoverContent>
                    </Popover>
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
              <div className="flex-1 flex items-center justify-center">
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
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge className={getStatusColor(orderDetail.status)} variant="outline">
                  {getStatusLabel(orderDetail.status)}
                </Badge>
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
