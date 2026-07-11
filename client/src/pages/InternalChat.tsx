import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Send, Paperclip, CheckCheck, Loader2, X, MessageCircle, Search,
  ArrowLeft, Plus, Users,
} from "lucide-react";
import { roleLabel } from "@shared/permissions";
import type { SafeMember, InternalThread, InternalMessageWithSender } from "@shared/schema";

// Company-internal 1:1 chat inbox: every member can message every other
// member of their own organization (office, warehouse, drivers — restaurants
// and suppliers alike). Thread list + member directory + direct chat.
export default function InternalChat() {
  const { currentMember } = useUser();
  const { lang } = useLanguage();
  const [partner, setPartner] = useState<SafeMember | null>(null);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");

  const { data: threads = [], isLoading: threadsLoading } = useQuery<InternalThread[]>({
    queryKey: ["/api/internal-chat/threads"],
    refetchInterval: 10000,
    enabled: !partner,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<SafeMember[]>({
    queryKey: ["/api/internal-chat/members"],
  });

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) =>
      t.partner.name.toLowerCase().includes(q) ||
      roleLabel(t.partner.role, lang).toLowerCase().includes(q));
  }, [threads, search, lang]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      roleLabel(m.role, lang).toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q));
  }, [members, search, lang]);

  const openChat = (m: SafeMember) => {
    setPartner(m);
    setPicking(false);
    setSearch("");
  };

  const formatWhen = (d: string | Date) => {
    const date = new Date(d);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString(lang === "de" ? "de-DE" : "it-IT", { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "2-digit" });
  };

  return (
    <div className="flex flex-col pb-[var(--mobile-bottom-pad)] md:pb-0" data-testid="page-internal-chat">
      <HeroPortal>
        <div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-5 md:pb-7" data-testid="internal-chat-hero">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-white/80" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-white truncate" data-testid="text-page-title">
                {lang === "de" ? "Interner Chat" : "Chat interno"}
              </h1>
              <p className="text-sm text-white/60 truncate">
                {lang === "de"
                  ? "Direktnachrichten an alle Mitglieder Ihres Teams"
                  : "Messaggi diretti a tutti i membri del tuo team"}
              </p>
            </div>
          </div>
        </div>
      </HeroPortal>

      {partner ? (
        <ChatView
          partner={partner}
          meId={currentMember?.id}
          lang={lang}
          onBack={() => setPartner(null)}
        />
      ) : (
        <div className="flex flex-col rounded-2xl border bg-card overflow-hidden min-h-[60vh]">
          <div className="px-3 md:px-4 pt-3 pb-2 space-y-2 border-b">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    picking
                      ? (lang === "de" ? "Mitglied suchen…" : "Cerca membro…")
                      : (lang === "de" ? "Chats durchsuchen…" : "Cerca nelle chat…")
                  }
                  className="pl-9 rounded-full bg-muted/40"
                  data-testid="input-chat-search"
                />
              </div>
              {picking ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full shrink-0"
                  onClick={() => { setPicking(false); setSearch(""); }}
                  data-testid="button-cancel-new-chat"
                >
                  {lang === "de" ? "Abbrechen" : "Annulla"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="rounded-full shrink-0 gap-1.5"
                  onClick={() => { setPicking(true); setSearch(""); }}
                  data-testid="button-new-chat"
                >
                  <Plus className="h-4 w-4" />
                  {lang === "de" ? "Neuer Chat" : "Nuova chat"}
                </Button>
              )}
            </div>
            {picking && (
              <p className="text-xs text-muted-foreground px-1" data-testid="text-pick-hint">
                {lang === "de"
                  ? "Wählen Sie ein Mitglied Ihrer Organisation aus."
                  : "Seleziona un membro della tua organizzazione."}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y" data-testid="internal-chat-list">
            {picking ? (
              membersLoading ? (
                <ListSpinner />
              ) : filteredMembers.length === 0 ? (
                <EmptyHint text={lang === "de" ? "Keine Mitglieder gefunden." : "Nessun membro trovato."} />
              ) : (
                filteredMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => openChat(m)}
                    className="w-full flex items-center gap-3 px-3 md:px-4 py-3 text-left hover:bg-muted/40 active:bg-muted/60"
                    data-testid={`member-row-${m.id}`}
                  >
                    <MemberAvatar member={m} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{roleLabel(m.role, lang)}</p>
                    </div>
                    <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))
              )
            ) : threadsLoading ? (
              <ListSpinner />
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <MessageCircle className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-empty-threads">
                  {lang === "de"
                    ? "Noch keine Chats. Starten Sie eine Unterhaltung mit einem Teammitglied."
                    : "Ancora nessuna chat. Inizia una conversazione con un membro del team."}
                </p>
                <Button
                  size="sm"
                  className="rounded-full gap-1.5"
                  onClick={() => setPicking(true)}
                  data-testid="button-empty-new-chat"
                >
                  <Plus className="h-4 w-4" />
                  {lang === "de" ? "Neuer Chat" : "Nuova chat"}
                </Button>
              </div>
            ) : (
              filteredThreads.map((t) => (
                <button
                  key={t.partner.id}
                  onClick={() => openChat(t.partner)}
                  className="w-full flex items-center gap-3 px-3 md:px-4 py-3 text-left hover:bg-muted/40 active:bg-muted/60"
                  data-testid={`thread-row-${t.partner.id}`}
                >
                  <MemberAvatar member={t.partner} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${t.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>
                        {t.partner.name}
                        <span className="font-normal text-muted-foreground"> · {roleLabel(t.partner.role, lang)}</span>
                      </p>
                      {t.lastMessage && (
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatWhen(t.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs truncate ${t.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {t.lastMessage
                          ? (t.lastMessage.content.trim().length > 0
                              ? t.lastMessage.content
                              : (lang === "de" ? "📎 Anhang" : "📎 Allegato"))
                          : ""}
                      </p>
                      {t.unreadCount > 0 && (
                        <span
                          className="shrink-0 min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center px-1.5"
                          data-testid={`badge-unread-${t.partner.id}`}
                        >
                          {t.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ListSpinner() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-center text-sm text-muted-foreground py-10">{text}</p>;
}

function MemberAvatar({ member }: { member: SafeMember }) {
  return (
    <Avatar className="h-10 w-10 shrink-0">
      {member.profileImageUrl && <AvatarImage src={member.profileImageUrl} />}
      <AvatarFallback className="text-xs">
        {member.name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function ChatView({
  partner, meId, lang, onBack,
}: {
  partner: SafeMember;
  meId: string | undefined;
  lang: "de" | "it";
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const { data: messages = [], isLoading } = useQuery<InternalMessageWithSender[]>({
    queryKey: ["/api/internal-chat/messages", partner.id],
    queryFn: async () => {
      const r = await fetch(`/api/internal-chat/messages?with=${encodeURIComponent(partner.id)}`, { credentials: "include" });
      if (!r.ok) throw new Error("load-failed");
      return r.json();
    },
    refetchInterval: 4000,
  });

  // Mark thread read whenever new messages arrive while the chat is open.
  useEffect(() => {
    if (messages.length === 0 || messages.length === lastCountRef.current) return;
    lastCountRef.current = messages.length;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    apiRequest("POST", "/api/internal-chat/read", { with: partner.id })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/internal-chat/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/internal-chat/threads"] });
      })
      .catch(() => {});
  }, [messages.length, partner.id]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        recipientMemberId: partner.id,
        content: text.trim(),
      };
      if (attachment) {
        payload.messageType = "image";
        payload.attachmentUrl = attachment.url;
        payload.attachmentName = attachment.name;
      }
      const r = await apiRequest("POST", "/api/internal-chat/messages", payload);
      return r.json();
    },
    onSuccess: () => {
      setText("");
      setAttachment(null);
      queryClient.invalidateQueries({ queryKey: ["/api/internal-chat/messages", partner.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/internal-chat/threads"] });
    },
    onError: () => {
      toast({
        title: lang === "de" ? "Senden fehlgeschlagen" : "Invio non riuscito",
        variant: "destructive",
      });
    },
  });

  const canSend = (text.trim().length > 0 || !!attachment) && !sendMutation.isPending && !uploading;

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const r = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type || "image/jpeg",
        prefix: "team-chat",
      });
      const { uploadURL, objectPath } = await r.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      if (!putRes.ok) throw new Error("upload-failed");
      setAttachment({ url: objectPath, name: file.name });
    } catch {
      toast({ title: lang === "de" ? "Upload-Fehler" : "Errore upload", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const dayOf = (d: string | Date) => new Date(d).toDateString();
  const formatTime = (d: string | Date) =>
    new Date(d).toLocaleTimeString(lang === "de" ? "de-DE" : "it-IT", { hour: "2-digit", minute: "2-digit" });
  const formatDay = (d: string | Date) =>
    new Date(d).toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "long", day: "numeric", month: "long" });

  const rows = useMemo(() => {
    const out: Array<{ type: "day"; label: string; key: string } | { type: "msg"; msg: InternalMessageWithSender }> = [];
    let prevDay = "";
    for (const m of messages) {
      const day = dayOf(m.createdAt);
      if (day !== prevDay) {
        out.push({ type: "day", label: formatDay(m.createdAt), key: `day-${day}` });
        prevDay = day;
      }
      out.push({ type: "msg", msg: m });
    }
    return out;
  }, [messages, lang]);

  return (
    <div className="flex flex-col rounded-2xl border bg-card overflow-hidden min-h-[60vh]">
      <div className="flex items-center gap-2.5 px-2.5 md:px-4 py-2.5 border-b bg-background">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full shrink-0"
          onClick={onBack}
          data-testid="button-back-to-threads"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <MemberAvatar member={partner} />
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" data-testid="text-chat-partner-name">{partner.name}</p>
          <p className="text-xs text-muted-foreground truncate">{roleLabel(partner.role, lang)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 md:px-5 py-4 space-y-2" data-testid="internal-chat-messages">
        {isLoading ? (
          <ListSpinner />
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10" data-testid="text-empty-chat">
            {lang === "de"
              ? "Noch keine Nachrichten. Schreiben Sie die erste!"
              : "Ancora nessun messaggio. Scrivi il primo!"}
          </p>
        ) : (
          rows.map((row) => {
            if (row.type === "day") {
              return (
                <div key={row.key} className="flex justify-center py-2">
                  <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 rounded-full px-3 py-1">
                    {row.label}
                  </span>
                </div>
              );
            }
            const m = row.msg;
            const own = m.senderMemberId === meId;
            return (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${own ? "justify-end" : "justify-start"}`}
                data-testid={`message-internal-${m.id}`}
              >
                {!own && (
                  <Avatar className="h-7 w-7 shrink-0">
                    {m.sender?.profileImageUrl && <AvatarImage src={m.sender.profileImageUrl} />}
                    <AvatarFallback className="text-[10px]">
                      {(m.sender?.name ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[78%] md:max-w-[60%] rounded-2xl px-3.5 py-2 ${
                    own
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md"
                  }`}
                >
                  {m.attachmentUrl && (
                    <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="block mb-1">
                      <img
                        src={m.attachmentUrl}
                        alt={m.attachmentName ?? "Foto"}
                        className="rounded-xl max-h-56 object-cover"
                        data-testid={`img-attachment-${m.id}`}
                      />
                    </a>
                  )}
                  {m.content.trim().length > 0 && (
                    <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                  <div className={`flex items-center gap-1 mt-0.5 ${own ? "justify-end" : ""}`}>
                    <span className={`text-[10px] ${own ? "opacity-70" : "text-muted-foreground"}`}>
                      {formatTime(m.createdAt)}
                    </span>
                    {own && (
                      <CheckCheck
                        className={`h-3.5 w-3.5 ${m.readByPartner ? "text-sky-300" : "opacity-50"}`}
                        data-testid={`receipt-${m.id}`}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t px-3 py-2.5 space-y-2 bg-background">
        {attachment && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1.5">
            <Paperclip className="h-3.5 w-3.5" />
            <span className="truncate flex-1">{attachment.name}</span>
            <button onClick={() => setAttachment(null)} data-testid="button-remove-attachment">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            data-testid="input-chat-file"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-attach-photo"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
          </Button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) sendMutation.mutate();
              }
            }}
            rows={1}
            placeholder={
              lang === "de"
                ? `Nachricht an ${partner.name}…`
                : `Messaggio a ${partner.name}…`
            }
            className="flex-1 resize-none rounded-2xl border bg-muted/40 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
            data-testid="input-chat-message"
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0 rounded-full"
            disabled={!canSend}
            onClick={() => sendMutation.mutate()}
            data-testid="button-send-message"
          >
            {sendMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
