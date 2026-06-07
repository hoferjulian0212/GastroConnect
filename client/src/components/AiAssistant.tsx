import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  X,
  Plus,
  History as HistoryIcon,
  Send,
  Trash2,
  Maximize2,
  Minimize2,
  ArrowLeft,
  Loader2,
  ArrowRight,
  MessageSquare,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AiChatAction } from "@shared/schema";

const OPEN_EVENT = "gc:open-ai";

// Support-chat style icon: a message bubble with a person inside, so the
// assistant reads as a friendly support chat rather than an "AI" feature.
export function SupportChatIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="8.5" r="1.8" />
      <path d="M8.4 14.6v-.3a3.6 3.6 0 0 1 7.2 0v.3" />
    </svg>
  );
}

export function openAiAssistant(seed?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { seed: seed || "" } }));
  }
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AiChatAction[];
  isError?: boolean;
}

interface ChatSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

type View = "chat" | "history";

export function AiAssistant() {
  const { currentUser, currentRole } = useUser();
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const userId = currentUser?.id;
  const t = (de: string, it: string) => (lang === "it" ? it : de);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const sendRef = useRef<(text: string) => void>(() => {});

  const newChat = () => {
    setChatId(null);
    setMessages([]);
    setView("chat");
    setInput("");
  };

  // Global open helper (from ⌘K "Ask AI" and the mobile more-menu).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const seed = (e as CustomEvent).detail?.seed as string | undefined;
      setOpen(true);
      if (seed && seed.trim()) {
        // Start a fresh conversation seeded with the typed question.
        setChatId(null);
        setMessages([]);
        setView("chat");
        setInput("");
        setTimeout(() => sendRef.current(seed.trim()), 0);
      } else {
        setView("chat");
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(OPEN_EVENT, onOpen as EventListener);
  }, []);

  // Auto-scroll the thread to the bottom on new messages / loading.
  useEffect(() => {
    if (view !== "chat") return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, view, open]);

  const { data: chats = [], isLoading: chatsLoading } = useQuery<ChatSummary[]>({
    queryKey: ["/api/ai/chats", userId, currentRole],
    queryFn: async () => {
      const sp = new URLSearchParams({ userId: userId || "", role: currentRole });
      const res = await fetch(`/api/ai/chats?${sp.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: open && !!userId,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || !userId || sending) return;
    setInput("");
    const localUser: ChatMessage = { id: `local-${Date.now()}`, role: "user", content: q };
    setMessages((m) => [...m, localUser]);
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/ai/chat", {
        question: q,
        userId,
        role: currentRole,
        lang,
        chatId,
      });
      const data = (await res.json()) as {
        chatId: string;
        messageId: string;
        answer: string;
        actions?: AiChatAction[];
      };
      setChatId(data.chatId);
      setMessages((m) => [
        ...m,
        {
          id: data.messageId || `a-${Date.now()}`,
          role: "assistant",
          content: data.answer || "",
          actions: Array.isArray(data.actions) ? data.actions : [],
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/chats", userId, currentRole] });
    } catch (e) {
      const msg = String((e as Error)?.message || "");
      let friendly = t(
        "Es ist ein Fehler aufgetreten. Bitte erneut versuchen.",
        "Si è verificato un errore. Riprova.",
      );
      if (msg.startsWith("503")) {
        friendly = t(
          "Der KI-Assistent ist noch nicht eingerichtet.",
          "L'assistente AI non è ancora configurato.",
        );
      } else if (msg.startsWith("429")) {
        friendly = t(
          "Zu viele Anfragen. Bitte in ein paar Minuten erneut versuchen.",
          "Troppe richieste. Riprova tra qualche minuto.",
        );
      }
      setMessages((m) => [
        ...m,
        { id: `err-${Date.now()}`, role: "assistant", content: friendly, isError: true },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };
  sendRef.current = send;

  const openChat = async (id: string) => {
    if (!userId) return;
    setView("chat");
    setChatId(id);
    setMessages([]);
    setSending(true);
    try {
      const sp = new URLSearchParams({ userId, role: currentRole });
      const res = await fetch(`/api/ai/chats/${id}?${sp.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as {
        messages: Array<{ id: string; role: string; content: string; actions?: AiChatAction[] }>;
      };
      setMessages(
        (data.messages || []).map((m) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          actions: Array.isArray(m.actions) ? m.actions : [],
        })),
      );
    } catch {
      setMessages([
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: t("Konversation konnte nicht geladen werden.", "Impossibile caricare la conversazione."),
          isError: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const deleteChat = async (id: string) => {
    if (!userId) return;
    try {
      const sp = new URLSearchParams({ userId, role: currentRole });
      await apiRequest("DELETE", `/api/ai/chats/${id}?${sp.toString()}`);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/chats", userId, currentRole] });
      if (chatId === id) newChat();
    } catch {
      /* no-op; list will simply not change */
    }
  };

  const runAction = (action: AiChatAction) => {
    setOpen(false);
    setLocation(action.href);
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "it" ? "it-IT" : "de-DE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const suggestions =
    currentRole === "restaurant"
      ? [
          t("Wann habe ich zuletzt Tomaten bestellt?", "Quando ho ordinato i pomodori l'ultima volta?"),
          t("Wie ist der Status meiner letzten Bestellung?", "Qual è lo stato del mio ultimo ordine?"),
        ]
      : [
          t("Welche Bestellungen sind noch offen?", "Quali ordini sono ancora aperti?"),
          t("Zeig mir die letzten Bestellungen von …", "Mostrami gli ultimi ordini di …"),
        ];

  if (!userId) return null;

  const panelSize = expanded
    ? "md:w-[640px] md:h-[80vh]"
    : "md:w-[400px] md:h-[600px]";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setView("chat");
          }}
          className="hidden md:inline-flex fixed bottom-6 right-6 z-[55] h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/20 hover:scale-105 active:scale-95 transition-transform"
          aria-label={t("KI-Assistent öffnen", "Apri assistente AI")}
          data-testid="button-ai-fab"
        >
          <SupportChatIcon className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div
          className={`fixed z-[70] inset-0 md:inset-auto md:bottom-6 md:right-6 flex flex-col bg-background border-border md:rounded-2xl md:border md:shadow-2xl overflow-hidden ${panelSize}`}
          data-testid="ai-assistant-panel"
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0"
            style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top, 0px))" }}
          >
            {view === "history" ? (
              <button
                type="button"
                onClick={() => setView("chat")}
                className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground"
                aria-label={t("Zurück", "Indietro")}
                data-testid="button-ai-history-back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary shrink-0">
                <SupportChatIcon className="h-4 w-4" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" data-testid="text-ai-panel-title">
                {view === "history"
                  ? t("Verlauf", "Cronologia")
                  : t("KI-Assistent", "Assistente AI")}
              </p>
            </div>
            {view === "chat" && (
              <>
                <button
                  type="button"
                  onClick={newChat}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground"
                  aria-label={t("Neuer Chat", "Nuova chat")}
                  data-testid="button-ai-new-chat"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setView("history")}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground"
                  aria-label={t("Verlauf", "Cronologia")}
                  data-testid="button-ai-history"
                >
                  <HistoryIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="hidden md:inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground"
                  aria-label={expanded ? t("Verkleinern", "Riduci") : t("Vergrößern", "Ingrandisci")}
                  data-testid="button-ai-expand"
                >
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground"
              aria-label={t("Schließen", "Chiudi")}
              data-testid="button-ai-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          {view === "history" ? (
            <div className="flex-1 overflow-y-auto p-2" data-testid="ai-history-list">
              <button
                type="button"
                onClick={newChat}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-primary hover:bg-primary/5 mb-1"
                data-testid="button-ai-history-new"
              >
                <Plus className="h-4 w-4" />
                {t("Neuer Chat", "Nuova chat")}
              </button>
              {chatsLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : chats.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10" data-testid="text-ai-history-empty">
                  {t("Noch keine Unterhaltungen.", "Ancora nessuna conversazione.")}
                </p>
              ) : (
                chats.map((c) => (
                  <div
                    key={c.id}
                    className="group flex items-center gap-2 rounded-xl hover:bg-muted/60 transition-colors"
                    data-testid={`ai-history-item-${c.id}`}
                  >
                    <button
                      type="button"
                      onClick={() => openChat(c.id)}
                      className="flex-1 min-w-0 flex items-start gap-2.5 px-3 py-2.5 text-left"
                      data-testid={`button-ai-open-chat-${c.id}`}
                    >
                      <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">{c.title}</span>
                        <span className="block text-[11px] text-muted-foreground">{fmtDate(c.updatedAt)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteChat(c.id)}
                      className="shrink-0 mr-1.5 inline-flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      aria-label={t("Löschen", "Elimina")}
                      data-testid={`button-ai-delete-chat-${c.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4" data-testid="ai-thread">
                {messages.length === 0 && !sending ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4" data-testid="ai-empty-state">
                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 text-primary mb-3">
                      <SupportChatIcon className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold mb-1">
                      {t("Wie kann ich helfen?", "Come posso aiutarti?")}
                    </p>
                    <p className="text-xs text-muted-foreground mb-4 max-w-[260px]">
                      {t(
                        "Frag mich zu deinen Bestellungen, Lieferungen und Partnern.",
                        "Chiedimi dei tuoi ordini, consegne e partner.",
                      )}
                    </p>
                    <div className="flex flex-col gap-2 w-full max-w-[300px]">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => send(s)}
                          className="text-left text-xs px-3 py-2 rounded-xl border border-border hover:bg-muted/60 transition-colors"
                          data-testid={`button-ai-suggestion-${i}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((m) =>
                      m.role === "user" ? (
                        <div key={m.id} className="flex justify-end" data-testid={`ai-msg-user-${m.id}`}>
                          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2 text-sm whitespace-pre-wrap break-words">
                            {m.content}
                          </div>
                        </div>
                      ) : (
                        <div key={m.id} className="flex items-start gap-2.5" data-testid={`ai-msg-assistant-${m.id}`}>
                          <div className="mt-0.5 shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary">
                            <SupportChatIcon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div
                              className={`inline-block max-w-full rounded-2xl rounded-tl-md px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                                m.isError
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-muted text-foreground"
                              }`}
                            >
                              {m.content}
                            </div>
                            {m.actions && m.actions.length > 0 && (
                              <div className="flex flex-col gap-1.5 mt-2" data-testid={`ai-actions-${m.id}`}>
                                {m.actions.map((a, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => runAction(a)}
                                    className="inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                                    data-testid={`button-ai-action-${m.id}-${i}`}
                                  >
                                    <span className="truncate max-w-[220px]">{a.label}</span>
                                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ),
                    )}
                    {sending && (
                      <div className="flex items-start gap-2.5" data-testid="ai-typing">
                        <div className="mt-0.5 shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary/10 text-primary">
                          <SupportChatIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Composer */}
              <div
                className="border-t border-border p-2.5 shrink-0"
                style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom, 0px))" }}
              >
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(input);
                      }
                    }}
                    rows={1}
                    placeholder={t("Frage stellen…", "Fai una domanda…")}
                    maxLength={500}
                    className="flex-1 resize-none max-h-32 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                    data-testid="input-ai-message"
                  />
                  <button
                    type="button"
                    onClick={() => send(input)}
                    disabled={!input.trim() || sending}
                    className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
                    aria-label={t("Senden", "Invia")}
                    data-testid="button-ai-send"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
