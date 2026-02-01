import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageSquare, Search, Check, CheckCheck } from "lucide-react";
import type { ConversationWithUser, Message } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";

export default function SupplierInbox() {
  const { currentUser } = useUser();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
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

  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Inbox</h1>
        <p className="text-muted-foreground">Kommunizieren Sie mit Ihren Kunden</p>
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
                        onClick={() => handleSelectConversation(conv.id)}
                        className={`w-full p-3 rounded-md text-left transition-colors hover-elevate overflow-hidden ${
                          selectedConversation === conv.id
                            ? "bg-secondary/10"
                            : ""
                        }`}
                        data-testid={`conversation-${conv.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 shrink-0">
                            <AvatarFallback className="bg-primary/20 text-primary">
                              {conv.otherUser.companyName?.charAt(0) || conv.otherUser.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate max-w-[140px]">
                                {conv.otherUser.companyName || conv.otherUser.name}
                              </p>
                              {conv.unreadCount > 0 && (
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] text-secondary-foreground font-medium">
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
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/20 text-primary">
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
                </div>

                <ScrollArea className="flex-1 p-4">
                  {messagesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16 w-3/4" />
                      ))}
                    </div>
                  ) : messages && messages.length > 0 ? (
                    <div className="space-y-4">
                      {messages.map((message) => {
                        const isOwn = message.senderId === currentUser?.id;
                        return (
                          <div
                            key={message.id}
                            className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                            data-testid={`message-${message.id}`}
                          >
                            <div
                              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                                isOwn
                                  ? "bg-secondary text-secondary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <p className="text-sm">{message.content}</p>
                              <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                                <span className={`text-[10px] ${isOwn ? "text-secondary-foreground/70" : "text-muted-foreground"}`}>
                                  {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true, locale: de })}
                                </span>
                                {isOwn && (
                                  message.isRead 
                                    ? <CheckCheck className="h-3 w-3 text-secondary-foreground/70" />
                                    : <Check className="h-3 w-3 text-secondary-foreground/70" />
                                )}
                              </div>
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

                <div className="border-t border-border p-4">
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
                      data-testid="input-message"
                    />
                    <Button 
                      variant="secondary"
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
    </div>
  );
}
