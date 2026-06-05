import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { MessageCircle, Clock, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import type { WhatsappConnection } from "@shared/schema";
import { ConnectWhatsappDialog } from "@/components/ConnectWhatsappDialog";

interface WhatsappInboxCardProps {
  userId: string;
}

export function WhatsappInboxCard({ userId }: WhatsappInboxCardProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const [showDialog, setShowDialog] = useState(false);

  const { data } = useQuery<{ connection: WhatsappConnection | null; whatsappNumber: string | null }>({
    queryKey: [`/api/whatsapp/connection?userId=${userId}`],
    enabled: !!userId,
  });

  const conn = data?.connection ?? null;
  const status = conn?.status;
  const active = status === "active";
  const pending = status === "pending";
  const error = status === "error" || status === "disconnected";

  const headline = error
    ? t("whatsapp", "whatsappErrorHeadline")
    : pending
    ? t("whatsapp", "whatsappPendingHeadline")
    : active
    ? t("whatsapp", "whatsappActiveHeadline")
    : t("whatsapp", "whatsappFirstHeadline");

  const desc = error
    ? t("whatsapp", "whatsappErrorHeadlineDesc")
    : pending
    ? t("whatsapp", "whatsappPendingHeadlineDesc")
    : active
    ? t("whatsapp", "whatsappActiveHeadlineDesc")
    : t("whatsapp", "whatsappFirstDesc");

  const buttonLabel = pending
    ? t("whatsapp", "manageWhatsapp")
    : active
    ? t("whatsapp", "whatsappStatusActive")
    : t("whatsapp", "connectWhatsapp");

  return (
    <div className="rounded-xl border bg-card p-3 mb-2" data-testid="card-connect-whatsapp">
      <div className="flex items-start gap-2.5">
        <div
          className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 ${
            error
              ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
              : pending
              ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
              : active
              ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
              : "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
          }`}
        >
          {error ? (
            <AlertCircle className="w-5 h-5" />
          ) : pending ? (
            <Clock className="w-5 h-5" />
          ) : active ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <MessageCircle className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold leading-tight" data-testid="text-whatsapp-headline">{headline}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3" data-testid="text-whatsapp-desc">{desc}</p>
        </div>
      </div>

      {active && conn?.lastSyncAt && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2" data-testid="text-whatsapp-last-sync">
          <RefreshCw className="w-3.5 h-3.5" />
          {t("whatsapp", "lastSync")}: {new Date(conn.lastSyncAt).toLocaleDateString(lang === "de" ? "de-DE" : "it-IT")}
        </div>
      )}

      <Button
        size="sm"
        className="w-full mt-2.5"
        onClick={() => setShowDialog(true)}
        disabled={active}
        data-testid="button-connect-whatsapp"
      >
        <MessageCircle className="w-4 h-4 mr-2" />
        {buttonLabel}
      </Button>

      {userId && (
        <ConnectWhatsappDialog open={showDialog} onOpenChange={setShowDialog} userId={userId} />
      )}
    </div>
  );
}
