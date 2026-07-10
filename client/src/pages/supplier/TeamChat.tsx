import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Paperclip, CheckCheck, Loader2, X, Users } from "lucide-react";
import { roleLabel } from "@shared/permissions";
import type { InternalMessageWithSender } from "@shared/schema";

// Company-internal chat for supplier teams: office, warehouse and drivers all
// share ONE room per organization. Read receipts (readByAll) come from per-
// member read cursors on the server.
export default function TeamChat() {
  const { currentMember } = useUser();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const { data: messages = [], isLoading } = useQuery<InternalMessageWithSender[]>({
    queryKey: ["/api/internal-chat/messages"],
    refetchInterval: 4000,
  });

  // Mark read whenever new messages arrive while the page is open.
  useEffect(() => {
    if (messages.length === 0 || messages.length === lastCountRef.current) return;
    lastCountRef.current = messages.length;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    apiRequest("POST", "/api/internal-chat/read", {})
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/internal-chat/unread-count"] }))
      .catch(() => {});
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { content: text.trim() };
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
      queryClient.invalidateQueries({ queryKey: ["/api/internal-chat/messages"] });
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

  // Group consecutive day changes for date separators.
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
    <div className="flex flex-col pb-[var(--mobile-bottom-pad)] md:pb-0" data-testid="page-team-chat">
      <HeroPortal>
        <div className="bg-[#161921] px-3 md:px-6 pt-4 md:pt-6 pb-5 md:pb-7" data-testid="team-chat-hero">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-white/80" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-white truncate" data-testid="text-page-title">
                {lang === "de" ? "Team-Chat" : "Chat del team"}
              </h1>
              <p className="text-sm text-white/60 truncate">
                {lang === "de"
                  ? "Büro, Lager und Fahrer in einem Kanal"
                  : "Ufficio, magazzino e autisti in un unico canale"}
              </p>
            </div>
          </div>
        </div>
      </HeroPortal>

      <div className="flex flex-col rounded-2xl border bg-card overflow-hidden min-h-[60vh]">
        <div className="flex-1 overflow-y-auto px-3 md:px-5 py-4 space-y-2" data-testid="team-chat-messages">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
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
              const own = m.senderMemberId === currentMember?.id;
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
                    {!own && m.sender && (
                      <p className="text-[11px] font-semibold opacity-80 mb-0.5">
                        {m.sender.name}
                        <span className="font-normal opacity-70"> · {roleLabel(m.sender.role, lang)}</span>
                      </p>
                    )}
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
                          className={`h-3.5 w-3.5 ${m.readByAll ? "text-sky-300" : "opacity-50"}`}
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
              placeholder={lang === "de" ? "Nachricht an das Team…" : "Messaggio al team…"}
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
    </div>
  );
}
