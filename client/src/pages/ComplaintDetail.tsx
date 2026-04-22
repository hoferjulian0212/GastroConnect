import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getComplaintStatus } from "@/lib/translations";
import { format } from "date-fns";
import { de, it } from "date-fns/locale";
import { ArrowLeft, Clock, Loader2, CheckCircle, XCircle, AlertTriangle, Flame, Check, MoreHorizontal, Package, Image as ImageIcon, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ProductImage } from "@/components/ProductImage";
import type { ComplaintWithDetails, ComplaintStatusHistoryWithUser, ComplaintCommentWithUser } from "@shared/schema";

export default function ComplaintDetail() {
  const [, setLocation] = useLocation();
  const [matchRestaurant, paramsR] = useRoute("/restaurant/complaints/:id");
  const [matchSupplier, paramsS] = useRoute("/supplier/complaints/:id");
  const params = matchRestaurant ? paramsR : paramsS;
  const complaintId = params?.id;
  const { currentRole } = useUser();
  const { lang } = useLanguage();
  const t = useT();
  const dateLocale = lang === "de" ? de : it;
  const isSupplier = currentRole === "supplier";

  const [activeTab, setActiveTab] = useState<"updates" | "details">("updates");

  const { data: complaint, isLoading } = useQuery<ComplaintWithDetails>({
    queryKey: ["/api/complaints", complaintId],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${complaintId}`);
      if (!res.ok) throw new Error("Failed to fetch complaint");
      return res.json();
    },
    enabled: !!complaintId,
  });

  const { data: statusHistory } = useQuery<ComplaintStatusHistoryWithUser[]>({
    queryKey: ["/api/complaints", complaintId, "status-history"],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${complaintId}/status-history`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!complaintId,
  });

  const { data: comments } = useQuery<ComplaintCommentWithUser[]>({
    queryKey: ["/api/complaints", complaintId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${complaintId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!complaintId,
  });

  const goBack = () => {
    setLocation(`/${currentRole}/complaints`);
  };

  const getStatusIcon = (status: string, size = "h-5 w-5") => {
    switch (status) {
      case "open": return <Clock className={size} />;
      case "in_progress": return <Loader2 className={size} />;
      case "resolved": return <CheckCircle className={size} />;
      case "closed": return <XCircle className={size} />;
      default: return <AlertTriangle className={size} />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-100 dark:bg-yellow-900/40";
      case "in_progress": return "bg-blue-100 dark:bg-blue-900/40";
      case "resolved": return "bg-green-100 dark:bg-green-900/40";
      case "closed": return "bg-muted";
      default: return "bg-muted";
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case "open": return "text-yellow-700 dark:text-yellow-400";
      case "in_progress": return "text-blue-700 dark:text-blue-400";
      case "resolved": return "text-green-700 dark:text-green-400";
      case "closed": return "text-muted-foreground";
      default: return "text-muted-foreground";
    }
  };

  const getTimelineDotColor = (status: string) => {
    switch (status) {
      case "open": return "border-yellow-500 bg-yellow-500";
      case "in_progress": return "border-blue-500 bg-blue-500";
      case "resolved": return "border-green-500 bg-green-500";
      case "closed": return "border-muted-foreground bg-muted-foreground";
      default: return "border-muted-foreground bg-muted-foreground";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "in_progress": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "resolved": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "closed": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getTimelineDescription = (toStatus: string) => {
    if (lang === "de") {
      switch (toStatus) {
        case "open": return "Reklamation wurde erstellt";
        case "in_progress": return "Reklamation wird bearbeitet";
        case "resolved": return "Reklamation wurde gelöst";
        case "closed": return "Reklamation wurde geschlossen";
        default: return "";
      }
    }
    switch (toStatus) {
      case "open": return "Reclamo creato";
      case "in_progress": return "Reclamo in lavorazione";
      case "resolved": return "Reclamo risolto";
      case "closed": return "Reclamo chiuso";
      default: return "";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-4 w-full max-w-sm px-6">
            <Skeleton className="h-20 w-20 rounded-full mx-auto" />
            <Skeleton className="h-6 w-32 mx-auto" />
            <Skeleton className="h-10 w-48 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="px-4 md:px-6 lg:px-8 pt-4">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-1 px-1" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            {lang === "de" ? "Zurück" : "Indietro"}
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">{lang === "de" ? "Reklamation nicht gefunden" : "Reclamo non trovato"}</p>
        </div>
      </div>
    );
  }

  const isUrgent = (complaint as any).priority === "urgent";
  const counterpartyName = isSupplier
    ? (complaint.restaurant?.companyName || complaint.restaurant?.name || "")
    : (complaint.supplier?.companyName || complaint.supplier?.name || "");

  const timeline = statusHistory && statusHistory.length > 0
    ? statusHistory
    : [{ id: "created", complaintId: complaint.id, fromStatus: null, toStatus: "open", changedBy: null, createdAt: complaint.createdAt }];

  let affectedItems: any[] = [];
  try {
    if (complaint.affectedItems) {
      affectedItems = JSON.parse(complaint.affectedItems as string);
    }
  } catch {}

  const getMediaSrc = (url: string) => {
    if (url.startsWith("/objects/")) return url;
    if (url.startsWith("http")) return url;
    return `/objects/${url}`;
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col" data-testid="page-complaint-detail">
      <div className="w-full">
        <div className="px-4 md:px-6 lg:px-8 pt-4">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-1 px-1" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            {lang === "de" ? "Zurück" : "Indietro"}
          </button>
        </div>

        {/* Hero: counterparty header + status — same layout as OrderDetail */}
        <div className="px-4 md:px-6 lg:px-8 pt-5 pb-6">
          <div className="relative flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-12 w-12 rounded-2xl ${isUrgent ? "bg-red-100 dark:bg-red-900/40" : getStatusBg(complaint.status)} flex items-center justify-center shrink-0`}>
                <div className={isUrgent ? "text-red-600 dark:text-red-400" : getStatusTextColor(complaint.status)}>
                  {isUrgent ? <Flame className="h-6 w-6" /> : getStatusIcon(complaint.status, "h-6 w-6")}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider" data-testid="text-complaint-id">
                  {lang === "de" ? "Reklamation" : "Reclamo"} · #{complaint.id.slice(0, 8)}
                </p>
                <p className="text-xl md:text-2xl font-semibold truncate" data-testid="text-complaint-title">{complaint.title}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5" data-testid="text-counterparty">{counterpartyName}</p>
              </div>
            </div>
            {/* Status badge: centered horizontally on the page on md+ */}
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <Badge className={`${getStatusBadgeColor(complaint.status)} rounded-full px-3 py-1.5 text-xs font-medium pointer-events-auto`} variant="outline">
                <span className="inline-flex items-center gap-1">
                  {getStatusIcon(complaint.status, "h-3.5 w-3.5")}
                  {getComplaintStatus(complaint.status, lang)}
                </span>
              </Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={`md:hidden ${getStatusBadgeColor(complaint.status)} rounded-full px-3 py-1.5 text-xs font-medium`} variant="outline">
                <span className="inline-flex items-center gap-1">
                  {getStatusIcon(complaint.status, "h-3.5 w-3.5")}
                  {getComplaintStatus(complaint.status, lang)}
                </span>
              </Badge>
              {isUrgent && (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded-full px-2.5 py-1 text-[11px] font-medium" variant="outline">
                  <Flame className="h-3 w-3 mr-1" />
                  {lang === "de" ? "Dringend" : "Urgente"}
                </Badge>
              )}
              <button className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors" data-testid="button-more-options">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-border/40" />

      <div className="flex-1 px-6 pt-5 pb-8 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          <div className="rounded-2xl border border-border bg-card shadow-sm p-5" data-testid="card-updates">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">{lang === "de" ? "Updates" : "Aggiornamenti"}</p>
            </div>
            <div className="space-y-0" data-testid="section-updates">
            {timeline.map((entry: any, index: number) => {
              const isLast = index === timeline.length - 1 && (!comments || comments.length === 0);

              return (
                <div key={entry.id} className="flex gap-3" data-testid={`timeline-entry-${index}`}>
                  <div className="flex flex-col items-center">
                    <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 ${getTimelineDotColor(entry.toStatus)}`}>
                      <Check className="h-3 w-3 text-white" />
                    </div>
                    {!isLast && (
                      <div className="w-0.5 h-12 bg-border/60 my-1" />
                    )}
                  </div>
                  <div className="pb-6">
                    <p className={`text-sm font-medium ${getStatusTextColor(entry.toStatus)}`}>
                      {format(new Date(entry.createdAt), "EEEE, dd. MMMM yyyy, HH:mm", { locale: dateLocale })}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {getTimelineDescription(entry.toStatus)}
                    </p>
                    {entry.changedByUser && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {lang === "de" ? "von" : "da"} {entry.changedByUser.name}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {comments && comments.length > 0 && (
              <>
                <div className="flex items-center gap-2 pb-4 pt-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-muted-foreground">
                    {lang === "de" ? "Kommentare" : "Commenti"} ({comments.length})
                  </p>
                </div>
                {comments.map((comment: ComplaintCommentWithUser, index: number) => {
                  const initials = comment.user?.name
                    ? comment.user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
                    : "?";
                  return (
                    <div key={comment.id} className="flex gap-3 pb-4" data-testid={`comment-${index}`}>
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={comment.user?.profileImageUrl || undefined} />
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{comment.user?.name}</p>
                          <p className="text-xs text-muted-foreground shrink-0">
                            {format(new Date(comment.createdAt), "dd.MM.yy HH:mm", { locale: dateLocale })}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{comment.content}</p>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm p-5" data-testid="card-details">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">{lang === "de" ? "Details" : "Dettagli"}</p>
            </div>
            <div className="space-y-5" data-testid="section-details">
            <div className="rounded-2xl bg-muted/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/30">
                <p className="text-sm font-semibold">{lang === "de" ? "Beschreibung" : "Descrizione"}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-sm leading-relaxed">{complaint.description}</p>
              </div>
            </div>

            {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
              <div className="rounded-2xl bg-muted/30 overflow-hidden">
                <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">{lang === "de" ? "Anhänge" : "Allegati"} ({complaint.mediaUrls.length})</p>
                </div>
                <div className="p-3 flex gap-2 overflow-x-auto">
                  {complaint.mediaUrls.map((url: string, i: number) => (
                    <img
                      key={i}
                      src={getMediaSrc(url)}
                      alt=""
                      className="h-24 w-24 rounded-xl object-cover shrink-0"
                      data-testid={`media-${i}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {affectedItems.length > 0 && (
              <div className="rounded-2xl bg-muted/30 overflow-hidden">
                <div className="px-4 py-3 border-b border-border/30">
                  <p className="text-sm font-semibold">{lang === "de" ? "Betroffene Produkte" : "Prodotti interessati"}</p>
                </div>
                <div className="divide-y divide-border/20">
                  {affectedItems.map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3" data-testid={`affected-item-${i}`}>
                      <ProductImage src={item.imageUrl} className="h-10 w-10 rounded-xl" iconClassName="h-5 w-5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name || item.productName}</p>
                        {item.quantity && (
                          <p className="text-xs text-muted-foreground">{lang === "de" ? "Menge" : "Quantità"}: {item.quantity}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-muted/30 overflow-hidden">
              <div className="divide-y divide-border/20">
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Reklamations-Nr." : "Nr. Reclamo"}</p>
                  <p className="text-sm font-medium truncate text-right">#{complaint.id.slice(0, 8)}</p>
                </div>
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{isSupplier ? (lang === "de" ? "Betrieb" : "Azienda") : (lang === "de" ? "Händler" : "Commerciante")}</p>
                  <p className="text-sm font-medium truncate text-right">{counterpartyName}</p>
                </div>
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Bestellung" : "Ordine"}</p>
                  <p className="text-sm font-medium truncate text-right">#{complaint.orderId.slice(0, 8)}</p>
                </div>
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Erstellt am" : "Creato il"}</p>
                  <p className="text-sm font-medium shrink-0">{format(new Date(complaint.createdAt), "dd.MM.yyyy, HH:mm", { locale: dateLocale })}</p>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
