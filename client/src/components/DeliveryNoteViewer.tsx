import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Check, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";

interface DeliveryNoteViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber?: string;
  conversationId?: string;
}

export function DeliveryNoteViewer({ open, onOpenChange, orderId, orderNumber, conversationId }: DeliveryNoteViewerProps) {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const isRestaurant = currentUser?.role === "restaurant";

  const pdfUrl = `/api/orders/${orderId}/delivery-note/download?inline=1`;
  const downloadUrl = `/api/orders/${orderId}/delivery-note/download`;

  const { data: order } = useQuery<{ id: string; status: string }>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error("Failed to load order");
      return res.json();
    },
    enabled: open && !!orderId,
  });

  const canQuittieren = isRestaurant && order && order.status === "in_delivery";

  const quittierenMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, {
        status: "delivered",
        changedBy: currentUser?.id,
      });
    },
    onSuccess: () => {
      toast({
        title: lang === "it" ? "Quietanzato" : "Quittiert",
        description: lang === "it" ? "L'ordine è stato confermato come consegnato." : "Die Bestellung wurde als geliefert bestätigt.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: [`/api/conversations/${conversationId}/messages`] });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "statuses"] });
      }
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: lang === "it" ? "Errore" : "Fehler",
        description: lang === "it" ? "Quietanza non riuscita." : "Quittierung fehlgeschlagen.",
        variant: "destructive",
      });
    },
  });

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.setAttribute("download", "");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-none w-screen h-screen sm:w-screen sm:h-screen sm:rounded-none border-0 bg-background flex flex-col"
        data-testid="dialog-delivery-note-viewer"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-background shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {lang === "it" ? "Bolla di consegna" : "Lieferschein"}
              {orderNumber ? ` #${orderNumber}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              data-testid="button-viewer-download"
            >
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{lang === "it" ? "Scarica" : "Download"}</span>
            </Button>
            {canQuittieren && (
              <Button
                variant="default"
                size="sm"
                onClick={() => quittierenMutation.mutate()}
                disabled={quittierenMutation.isPending}
                data-testid="button-viewer-quittieren"
              >
                {quittierenMutation.isPending ? (
                  <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 sm:mr-2" />
                )}
                <span className="hidden sm:inline">{lang === "it" ? "Quietanza" : "Quittieren"}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              data-testid="button-viewer-close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-muted/30">
          {open && (
            <iframe
              src={pdfUrl}
              title={lang === "it" ? "Bolla di consegna" : "Lieferschein"}
              className="w-full h-full border-0"
              data-testid="iframe-delivery-note"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DeliveryNoteViewer;
