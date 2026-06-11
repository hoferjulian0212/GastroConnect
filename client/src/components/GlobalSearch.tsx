import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ShoppingBag,
  Package,
  Users,
  MessageSquare,
  AlertCircle,
  FileText,
  Search as SearchIcon,
  ArrowRight,
  Home,
  ShoppingCart,
  BarChart3,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { openAiAssistant, SupportChatIcon } from "@/components/AiAssistant";

const OPEN_EVENT = "gc:open-search";

export function openGlobalSearch() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  }
}

interface SearchResults {
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string;
    createdAt: string;
    snippet: string | null;
  }>;
  products: Array<{
    id: string;
    name: string;
    articleNumber: string | null;
    supplierId: string;
    category: string | null;
    price: string;
  }>;
  partners: Array<{
    id: string;
    name: string;
    companyName: string | null;
    profileImageUrl: string | null;
  }>;
  messages: Array<{
    id: string;
    conversationId: string;
    content: string;
    createdAt: string;
    partnerId: string;
    partnerName: string;
    partnerCompany: string | null;
  }>;
  complaints: Array<{
    id: string;
    complaintNumber: string;
    title: string;
    description: string;
    status: string;
    createdAt: string;
  }>;
  documents: Array<{
    id: string;
    title: string;
    type: string;
    orderId: string;
    fileUrl: string;
    createdAt: string;
  }>;
}

interface AiAction {
  kind: "open_inbox" | "open_order";
  label: string;
  href: string;
  orderId?: string;
  orderNumber?: string;
  partnerId?: string;
  suggestedMessage?: string;
}

const PER_GROUP = 5;

export function GlobalSearch() {
  const { currentUser, currentRole } = useUser();
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiActions, setAiActions] = useState<AiAction[]>([]);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key === "k" || e.key === "K";
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpenEvt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpenEvt as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpenEvt as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
      setAiMode(false);
      setAiQuestion("");
      setAiLoading(false);
      setAiAnswer("");
      setAiActions([]);
      setAiError("");
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = !!currentUser?.id && debounced.length >= 2 && open;
  const { data, isFetching } = useQuery<SearchResults>({
    queryKey: ["/api/search", debounced, currentUser?.id, currentRole],
    queryFn: async () => {
      const sp = new URLSearchParams({
        q: debounced,
        userId: currentUser?.id || "",
        role: currentRole,
      });
      const res = await fetch(`/api/search?${sp.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const t = (de: string, it: string) => (lang === "it" ? it : de);
  const role = currentRole;

  const go = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  const exitAiMode = () => {
    setAiMode(false);
    setAiAnswer("");
    setAiActions([]);
    setAiError("");
    setAiLoading(false);
  };

  const runAi = async (question: string) => {
    const q = question.trim();
    if (!q || !currentUser?.id) return;
    setAiMode(true);
    setAiQuestion(q);
    setAiLoading(true);
    setAiAnswer("");
    setAiActions([]);
    setAiError("");
    try {
      const res = await fetch("/api/search/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: q, userId: currentUser.id, role: currentRole, lang }),
      });
      if (!res.ok) {
        if (res.status === 503) {
          setAiError(t("Der KI-Assistent ist noch nicht eingerichtet.", "L'assistente AI non è ancora configurato."));
        } else if (res.status === 429) {
          setAiError(t("Zu viele Anfragen. Bitte in ein paar Minuten erneut versuchen.", "Troppe richieste. Riprova tra qualche minuto."));
        } else {
          setAiError(t("Es ist ein Fehler aufgetreten. Bitte erneut versuchen.", "Si è verificato un errore. Riprova."));
        }
        return;
      }
      const result = (await res.json()) as { answer?: string; actions?: AiAction[] };
      setAiAnswer(result.answer || "");
      setAiActions(Array.isArray(result.actions) ? result.actions : []);
    } catch {
      setAiError(t("Es ist ein Fehler aufgetreten. Bitte erneut versuchen.", "Si è verificato un errore. Riprova."));
    } finally {
      setAiLoading(false);
    }
  };

  const actions =
    role === "restaurant"
      ? [
          { icon: Home, label: t("Startseite", "Home"), path: "/restaurant", testid: "action-home" },
          { icon: ShoppingBag, label: t("Bestellungen", "Ordini"), path: "/restaurant/orders", testid: "action-orders" },
          { icon: ShoppingCart, label: t("Warenkorb", "Carrello"), path: "/restaurant/cart", testid: "action-cart" },
          { icon: Package, label: t("Katalog", "Catalogo"), path: "/restaurant/catalog", testid: "action-catalog" },
          { icon: BarChart3, label: t("Preisvergleich", "Confronto prezzi"), path: "/restaurant/price-comparison", testid: "action-price-comparison" },
          { icon: MessageSquare, label: t("Posteingang", "Posta in arrivo"), path: "/restaurant/inbox", testid: "action-inbox" },
          { icon: AlertCircle, label: t("Reklamationen", "Reclami"), path: "/restaurant/complaints", testid: "action-complaints" },
          { icon: FileText, label: t("Dokumente", "Documenti"), path: "/restaurant/documents", testid: "action-documents" },
        ]
      : [
          { icon: Home, label: t("Startseite", "Home"), path: "/supplier", testid: "action-home" },
          { icon: ShoppingBag, label: t("Bestellungen", "Ordini"), path: "/supplier/orders", testid: "action-orders" },
          { icon: Package, label: t("Produkte", "Prodotti"), path: "/supplier/products", testid: "action-products" },
          { icon: MessageSquare, label: t("Posteingang", "Posta in arrivo"), path: "/supplier/inbox", testid: "action-inbox" },
          { icon: AlertCircle, label: t("Reklamationen", "Reclami"), path: "/supplier/complaints", testid: "action-complaints" },
          { icon: FileText, label: t("Dokumente", "Documenti"), path: "/supplier/documents", testid: "action-documents" },
        ];

  const hasAny =
    !!data &&
    (data.orders.length ||
      data.products.length ||
      data.partners.length ||
      data.messages.length ||
      data.complaints.length ||
      data.documents.length);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="overflow-hidden p-0 shadow-xl max-w-2xl gap-0 top-[15%] translate-y-0"
        data-testid="dialog-global-search"
      >
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <CommandInput
            placeholder={t(
              "Suchen oder eine Frage stellen…",
              "Cerca o fai una domanda…",
            )}
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              if (aiMode) exitAiMode();
            }}
            data-testid="input-global-search"
          />
          <CommandList className="max-h-[60vh]">
            {aiMode ? (
              <div className="p-4" data-testid="ai-answer-panel">
                <button
                  type="button"
                  onClick={exitAiMode}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3"
                  data-testid="button-ai-back"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t("Zurück zur Suche", "Torna alla ricerca")}
                </button>
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0 rounded-full bg-primary/10 p-1.5 text-primary">
                    <SupportChatIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1 truncate" data-testid="text-ai-question">
                      {aiQuestion}
                    </p>
                    {aiLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2" data-testid="ai-loading">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("Denke nach…", "Sto pensando…")}
                      </div>
                    ) : aiError ? (
                      <p className="text-sm text-destructive" data-testid="text-ai-error">
                        {aiError}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-foreground whitespace-pre-wrap" data-testid="text-ai-answer">
                          {aiAnswer}
                        </p>
                        {aiActions.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3" data-testid="ai-actions">
                            {aiActions.map((a, i) => (
                              <Button
                                key={i}
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-full h-8 px-3 text-xs gap-1.5"
                                onClick={() => go(a.href)}
                                data-testid={`button-ai-action-${i}`}
                              >
                                {a.kind === "open_inbox" ? (
                                  <MessageSquare className="h-3.5 w-3.5" />
                                ) : (
                                  <ShoppingBag className="h-3.5 w-3.5" />
                                )}
                                {a.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
            {debounced.length >= 2 && (
              <CommandGroup heading={t("KI-Assistent", "Assistente AI")}>
                <CommandItem
                  value="ask-ai"
                  onSelect={() => {
                    const q = debounced;
                    setOpen(false);
                    openAiAssistant(q);
                  }}
                  data-testid="search-ask-ai"
                >
                  <SupportChatIcon className="text-primary h-4 w-4" />
                  <span className="flex-1 min-w-0 truncate">
                    {t(`KI fragen: „${debounced}"`, `Chiedi all'AI: "${debounced}"`)}
                  </span>
                  <ArrowRight className="text-muted-foreground" />
                </CommandItem>
              </CommandGroup>
            )}
            {debounced.length < 2 ? (
              <CommandGroup heading={t("Aktionen", "Azioni")}>
                {actions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <CommandItem
                      key={a.path}
                      value={a.testid}
                      onSelect={() => go(a.path)}
                      data-testid={a.testid}
                    >
                      <Icon className="text-muted-foreground" />
                      <span className="flex-1 min-w-0 font-medium truncate">
                        {a.label}
                      </span>
                      <ArrowRight className="text-muted-foreground" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : isFetching && !data ? (
              <div className="py-10 px-4 text-center text-sm text-muted-foreground">
                {t("Suche…", "Ricerca…")}
              </div>
            ) : !hasAny ? (
              <div className="py-10 px-4 text-center text-sm text-muted-foreground" data-testid="search-empty">
                {t("Keine Ergebnisse", "Nessun risultato")}
              </div>
            ) : (
              <>
                {data!.orders.length > 0 && (
                  <CommandGroup heading={t("Bestellungen", "Ordini")}>
                    {data!.orders.map((o) => (
                      <CommandItem
                        key={o.id}
                        value={`order-${o.id}`}
                        onSelect={() => go(`/${role}/orders/${o.id}`)}
                        data-testid={`search-order-${o.id}`}
                      >
                        <ShoppingBag className="text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {o.orderNumber}
                            </span>
                            <span className="text-xs text-muted-foreground capitalize">
                              · {o.status.replace(/_/g, " ")}
                            </span>
                          </div>
                          {o.snippet && (
                            <p className="text-xs text-muted-foreground truncate">
                              {o.snippet}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          €{Number(o.totalAmount).toFixed(2)}
                        </span>
                      </CommandItem>
                    ))}
                    {data!.orders.length === PER_GROUP && (
                      <CommandItem
                        value="more-orders"
                        onSelect={() => go(`/${role}/orders`)}
                        data-testid="search-more-orders"
                      >
                        <ArrowRight className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {t("Alle Bestellungen anzeigen", "Mostra tutti gli ordini")}
                        </span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}

                {data!.products.length > 0 && (
                  <CommandGroup heading={t("Produkte", "Prodotti")}>
                    {data!.products.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`product-${p.id}`}
                        onSelect={() =>
                          go(
                            role === "restaurant"
                              ? `/restaurant/product/${p.id}`
                              : `/supplier/products`,
                          )
                        }
                        data-testid={`search-product-${p.id}`}
                      >
                        <Package className="text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {p.articleNumber ? `${p.articleNumber}` : ""}
                            {p.articleNumber && p.category ? " · " : ""}
                            {p.category || ""}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          €{Number(p.price).toFixed(2)}
                        </span>
                      </CommandItem>
                    ))}
                    {data!.products.length === PER_GROUP && (
                      <CommandItem
                        value="more-products"
                        onSelect={() => {
                          if (role !== "restaurant") {
                            go("/supplier/products");
                            return;
                          }
                          const counts = new Map<string, number>();
                          for (const p of data!.products) {
                            if (p.category) {
                              counts.set(p.category, (counts.get(p.category) || 0) + 1);
                            }
                          }
                          let topCategory: string | null = null;
                          let topCount = 0;
                          for (const [cat, c] of counts) {
                            if (c > topCount) {
                              topCount = c;
                              topCategory = cat;
                            }
                          }
                          go(
                            topCategory
                              ? `/restaurant/catalog?category=${encodeURIComponent(topCategory)}`
                              : "/restaurant/catalog",
                          );
                        }}
                        data-testid="search-more-products"
                      >
                        <ArrowRight className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {t("Alle Produkte anzeigen", "Mostra tutti i prodotti")}
                        </span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}

                {data!.partners.length > 0 && (
                  <CommandGroup
                    heading={
                      role === "restaurant"
                        ? t("Lieferanten", "Fornitori")
                        : t("Kunden", "Clienti")
                    }
                  >
                    {data!.partners.map((u) => (
                      <CommandItem
                        key={u.id}
                        value={`partner-${u.id}`}
                        onSelect={() => go(`/${role}/inbox`)}
                        data-testid={`search-partner-${u.id}`}
                      >
                        <Users className="text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {u.companyName || u.name}
                          </p>
                          {u.companyName && (
                            <p className="text-xs text-muted-foreground truncate">
                              {u.name}
                            </p>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                    {data!.partners.length === PER_GROUP && (
                      <CommandItem
                        value="more-partners"
                        onSelect={() =>
                          go(
                            role === "restaurant"
                              ? "/restaurant/suppliers"
                              : "/supplier/restaurants",
                          )
                        }
                        data-testid="search-more-partners"
                      >
                        <ArrowRight className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {role === "restaurant"
                            ? t("Alle Lieferanten", "Tutti i fornitori")
                            : t("Alle Kunden", "Tutti i clienti")}
                        </span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}

                {data!.messages.length > 0 && (
                  <CommandGroup heading={t("Nachrichten", "Messaggi")}>
                    {data!.messages.map((m) => (
                      <CommandItem
                        key={m.id}
                        value={`message-${m.id}`}
                        onSelect={() =>
                          go(
                            `/${role}/inbox?conversationId=${m.conversationId}`,
                          )
                        }
                        data-testid={`search-message-${m.id}`}
                      >
                        <MessageSquare className="text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {m.partnerCompany || m.partnerName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {m.content}
                          </p>
                        </div>
                      </CommandItem>
                    ))}
                    {data!.messages.length === PER_GROUP && (
                      <CommandItem
                        value="more-messages"
                        onSelect={() => go(`/${role}/inbox`)}
                        data-testid="search-more-messages"
                      >
                        <ArrowRight className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {t("Inbox öffnen", "Apri inbox")}
                        </span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}

                {data!.complaints.length > 0 && (
                  <CommandGroup heading={t("Reklamationen", "Reclami")}>
                    {data!.complaints.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`complaint-${c.id}`}
                        onSelect={() => go(`/${role}/complaints/${c.id}`)}
                        data-testid={`search-complaint-${c.id}`}
                      >
                        <AlertCircle className="text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {c.complaintNumber}
                            </span>
                            <span className="text-xs text-muted-foreground capitalize">
                              · {c.status.replace(/_/g, " ")}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {c.title}
                          </p>
                        </div>
                      </CommandItem>
                    ))}
                    {data!.complaints.length === PER_GROUP && (
                      <CommandItem
                        value="more-complaints"
                        onSelect={() => go(`/${role}/complaints`)}
                        data-testid="search-more-complaints"
                      >
                        <ArrowRight className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {t("Alle Reklamationen", "Tutti i reclami")}
                        </span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}

                {data!.documents.length > 0 && (
                  <CommandGroup heading={t("Dokumente", "Documenti")}>
                    {data!.documents.map((d) => (
                      <CommandItem
                        key={d.id}
                        value={`doc-${d.id}`}
                        onSelect={() => go(`/${role}/documents`)}
                        data-testid={`search-document-${d.id}`}
                      >
                        <FileText className="text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{d.title}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {d.type.replace(/_/g, " ")}
                          </p>
                        </div>
                      </CommandItem>
                    ))}
                    {data!.documents.length === PER_GROUP && (
                      <CommandItem
                        value="more-documents"
                        onSelect={() => go(`/${role}/documents`)}
                        data-testid="search-more-documents"
                      >
                        <ArrowRight className="text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {t("Alle Dokumente", "Tutti i documenti")}
                        </span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                )}
              </>
            )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

interface DesktopSearchButtonProps {
  className?: string;
}

export function DesktopSearchButton({ className }: DesktopSearchButtonProps) {
  const { lang } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => openGlobalSearch()}
      className={
        className ??
        "hidden md:flex items-center gap-2 h-9 px-3 rounded-full border border-white/20 bg-white/[0.07] hover:bg-white/15 transition-colors text-xs text-white/70"
      }
      data-testid="button-open-search"
      aria-label={lang === "it" ? "Cerca" : "Suchen"}
    >
      <SearchIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden 2xl:inline">
        {lang === "it" ? "Cerca…" : "Suchen…"}
      </span>
      <kbd className="hidden 2xl:inline-flex items-center gap-0.5 ml-1 px-1.5 h-5 rounded border border-white/15 bg-white/[0.06] text-[10px] text-white/60 font-sans">
        ⌘K
      </kbd>
    </button>
  );
}
