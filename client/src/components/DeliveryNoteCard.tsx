import { useEffect, useRef, useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { format } from "date-fns";
import { de, it } from "date-fns/locale";
import { formatOrderNumber } from "@shared/schema";
import DeliveryNoteViewer from "./DeliveryNoteViewer";

import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (typeof window !== "undefined" && !(pdfjsLib as any).GlobalWorkerOptions.workerSrc) {
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;
}

interface DeliveryNoteDocData {
  documentId?: string;
  title?: string;
  type?: string;
  orderId?: string;
  orderNumber?: string;
  fileUrl?: string;
  supplierName?: string;
  totalAmount?: string;
  itemCount?: number;
  deliveryDate?: string;
}

interface DeliveryNoteCardProps {
  content: string;
  timestamp: Date;
  conversationId?: string;
}

const thumbnailCache = new Map<string, string>();

export function DeliveryNoteCard({ content, timestamp, conversationId }: DeliveryNoteCardProps) {
  const { lang } = useLanguage();
  const dateLocale = lang === "it" ? it : de;
  const [viewerOpen, setViewerOpen] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(true);
  const [thumbError, setThumbError] = useState(false);
  const cancelledRef = useRef(false);

  let docData: DeliveryNoteDocData = {};
  try { docData = JSON.parse(content); } catch {}

  const orderId = docData.orderId;
  const orderNumber = docData.orderNumber || (orderId ? formatOrderNumber({ orderNumber: null, id: orderId }) : "");
  const cacheKey = orderId ? `dn:${orderId}` : null;

  useEffect(() => {
    cancelledRef.current = false;
    if (!orderId || !cacheKey) {
      setThumbLoading(false);
      return;
    }
    const cached = thumbnailCache.get(cacheKey);
    if (cached) {
      setThumbUrl(cached);
      setThumbLoading(false);
      return;
    }

    (async () => {
      try {
        setThumbLoading(true);
        const url = `/api/orders/${orderId}/delivery-note/download?inline=1`;
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error("fetch failed");
        const buf = await res.arrayBuffer();
        if (cancelledRef.current) return;
        const loadingTask = (pdfjsLib as any).getDocument({ data: buf });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const targetWidth = 420;
        const scale = targetWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(scaledViewport.width);
        canvas.height = Math.ceil(scaledViewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no ctx");
        await page.render({ canvasContext: ctx, viewport: scaledViewport, canvas } as any).promise;
        const dataUrl = canvas.toDataURL("image/png");
        try { pdf.destroy?.(); } catch {}
        if (cancelledRef.current) return;
        thumbnailCache.set(cacheKey, dataUrl);
        setThumbUrl(dataUrl);
        setThumbError(false);
      } catch (err) {
        if (!cancelledRef.current) setThumbError(true);
      } finally {
        if (!cancelledRef.current) setThumbLoading(false);
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [orderId, cacheKey]);

  const formattedDeliveryDate = (() => {
    if (!docData.deliveryDate) return null;
    try {
      const d = new Date(docData.deliveryDate + "T00:00:00");
      return format(d, "dd. MMM yyyy", { locale: dateLocale });
    } catch { return null; }
  })();

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!orderId) return;
    const a = document.createElement("a");
    a.href = `/api/orders/${orderId}/delivery-note/download`;
    a.setAttribute("download", "");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <div
        className="w-[75%] max-w-sm rounded-2xl border bg-white dark:bg-card shadow-sm overflow-hidden border-border cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => orderId && setViewerOpen(true)}
        data-testid={`card-delivery-note-${orderId || "unknown"}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-3.5 w-3.5 text-foreground shrink-0" />
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 truncate">
              {lang === "it" ? "Bolla" : "Lieferschein"}{orderNumber ? ` #${orderNumber}` : ""}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {format(timestamp, "HH:mm")}
          </span>
        </div>

        <div className="px-3 pt-2 pb-3">
          <div className="relative w-full aspect-[3/4] bg-muted/50 rounded-lg overflow-hidden border border-border">
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt={lang === "it" ? "Anteprima bolla" : "Lieferschein-Vorschau"}
                className="absolute inset-0 w-full h-full object-cover object-top"
                data-testid={`img-delivery-note-thumb-${orderId}`}
              />
            ) : thumbLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <FileText className="h-10 w-10" />
                <span className="text-xs">PDF</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-3 space-y-1">
          {docData.supplierName && (
            <p className="text-sm font-medium truncate" data-testid={`text-delivery-note-supplier-${orderId}`}>
              {docData.supplierName}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {formattedDeliveryDate || (lang === "it" ? "Bolla" : "Lieferschein")}
              {typeof docData.itemCount === "number" ? ` · ${docData.itemCount} ${lang === "it" ? "pos." : "Pos."}` : ""}
            </span>
            {docData.totalAmount && (
              <span className="font-semibold text-foreground" data-testid={`text-delivery-note-total-${orderId}`}>
                CHF {Number(docData.totalAmount).toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {orderId && (
          <div className="px-4 pb-3 pt-0 flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={(e) => { e.stopPropagation(); setViewerOpen(true); }}
              data-testid={`button-open-delivery-note-${orderId}`}
            >
              {lang === "it" ? "Apri" : "Öffnen"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              data-testid={`button-download-doc-${orderId}`}
              aria-label={lang === "it" ? "Scarica" : "Download"}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {orderId && (
        <DeliveryNoteViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          orderId={orderId}
          orderNumber={orderNumber}
          conversationId={conversationId}
        />
      )}
    </>
  );
}

export default DeliveryNoteCard;
