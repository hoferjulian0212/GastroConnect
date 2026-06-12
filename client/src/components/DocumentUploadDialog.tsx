import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Camera, Upload, FileText } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  formatOrderNumber,
  formatComplaintNumber,
  type OrderWithDetails,
  type ComplaintWithDetails,
  type Document,
} from "@shared/schema";

type TargetType = "order" | "complaint";

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetOrderId?: string;
  presetComplaintId?: string;
  /** When true, the target (order/complaint) is fixed and cannot be changed. */
  lockTarget?: boolean;
  /** Human-readable label of the locked target (e.g. order number). */
  lockedLabel?: string;
  onUploaded?: (doc: Document) => void;
}

const ALLOWED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function DocumentUploadDialog({
  open,
  onOpenChange,
  presetOrderId,
  presetComplaintId,
  lockTarget,
  lockedLabel,
  onUploaded,
}: DocumentUploadDialogProps) {
  const { currentUser, currentRole } = useUser();
  const { lang } = useLanguage();
  const { toast } = useToast();

  const [targetType, setTargetType] = useState<TargetType>(
    presetComplaintId ? "complaint" : "order",
  );
  const [orderId, setOrderId] = useState<string>(presetOrderId ?? "");
  const [complaintId, setComplaintId] = useState<string>(presetComplaintId ?? "");
  const [docType, setDocType] = useState<"delivery_note" | "invoice" | "other">(
    "delivery_note",
  );
  const [title, setTitle] = useState("");

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: assignable, isLoading: isLoadingAssignable } = useQuery<{
    orders: OrderWithDetails[];
    complaints: ComplaintWithDetails[];
  }>({
    queryKey: ["/api/documents/assignable", currentUser?.id, currentRole],
    queryFn: async () => {
      const res = await fetch(
        `/api/documents/assignable?userId=${currentUser?.id}&role=${currentRole}`,
      );
      if (!res.ok) throw new Error("Failed to fetch targets");
      return res.json();
    },
    enabled: !!currentUser?.id && open && !lockTarget,
  });

  const resolvedTargetId = useMemo(() => {
    if (lockTarget) return presetComplaintId ?? presetOrderId ?? "";
    return targetType === "order" ? orderId : complaintId;
  }, [lockTarget, presetComplaintId, presetOrderId, targetType, orderId, complaintId]);

  const effectiveTargetType: TargetType = lockTarget
    ? presetComplaintId
      ? "complaint"
      : "order"
    : targetType;

  const resetAndClose = () => {
    setTitle("");
    onOpenChange(false);
  };

  const invalidateForDoc = async (doc: Document) => {
    await queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    await queryClient.invalidateQueries({
      queryKey: ["/api/documents/eligible-orders"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["/api/documents/assignable"],
    });
    if (doc.orderId) {
      await queryClient.invalidateQueries({
        queryKey: ["/api/orders", doc.orderId, "documents"],
      });
    }
    if (doc.complaintId) {
      await queryClient.invalidateQueries({
        queryKey: ["/api/complaints", doc.complaintId, "documents"],
      });
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async (payload: {
      fileData: string;
      fileName: string;
      mimeType: string;
    }): Promise<Document> => {
      const body: Record<string, unknown> = {
        fileData: payload.fileData,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        type: docType,
        title: title.trim() || undefined,
      };
      if (effectiveTargetType === "complaint") {
        body.complaintId = resolvedTargetId;
      } else {
        body.orderId = resolvedTargetId;
      }
      const res = await apiRequest("POST", "/api/documents/upload", body);
      return res.json();
    },
    onSuccess: async (doc) => {
      await invalidateForDoc(doc);
      toast({
        title: lang === "de" ? "Dokument hochgeladen" : "Documento caricato",
      });
      onUploaded?.(doc);
      resetAndClose();
    },
    onError: () => {
      toast({
        title: lang === "de" ? "Fehler beim Hochladen" : "Errore nel caricamento",
        variant: "destructive",
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (targetOrderId: string): Promise<Document> => {
      const res = await apiRequest(
        "POST",
        `/api/orders/${targetOrderId}/delivery-note`,
      );
      return res.json();
    },
    onSuccess: async (doc) => {
      await invalidateForDoc(doc);
      toast({
        title: lang === "de" ? "Lieferschein erstellt" : "Bolla di consegna creata",
      });
      onUploaded?.(doc);
      resetAndClose();
    },
    onError: () => {
      toast({
        title: lang === "de" ? "Fehler beim Erstellen" : "Errore nella creazione",
        variant: "destructive",
      });
    },
  });

  const busy = uploadMutation.isPending || generateMutation.isPending;

  const handleFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!resolvedTargetId) {
      toast({
        title:
          lang === "de"
            ? "Bitte zuerst eine Bestellung oder Reklamation wählen"
            : "Seleziona prima un ordine o un reclamo",
        variant: "destructive",
      });
      return;
    }
    const mime = file.type || "";
    if (!ALLOWED_MIME.includes(mime)) {
      toast({
        title:
          lang === "de"
            ? "Nicht unterstützter Dateityp (nur Bild oder PDF)"
            : "Tipo di file non supportato (solo immagine o PDF)",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({
        title:
          lang === "de"
            ? "Datei zu groß (max. 15 MB)"
            : "File troppo grande (max 15 MB)",
        variant: "destructive",
      });
      return;
    }
    const dataUri = await fileToDataUri(file);
    uploadMutation.mutate({
      fileData: dataUri,
      fileName: file.name,
      mimeType: mime,
    });
  };

  const handleGenerate = () => {
    const targetOrderId =
      effectiveTargetType === "order"
        ? resolvedTargetId
        : assignable?.complaints.find((c) => c.id === resolvedTargetId)?.orderId;
    if (!targetOrderId) {
      toast({
        title:
          lang === "de"
            ? "Bitte zuerst eine Bestellung wählen"
            : "Seleziona prima un ordine",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate(targetOrderId);
  };

  const canGenerate =
    effectiveTargetType === "order" && docType === "delivery_note";

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-document-upload">
        <DialogHeader>
          <DialogTitle>
            {lang === "de" ? "Dokument hinzufügen" : "Aggiungi documento"}
          </DialogTitle>
          <DialogDescription>
            {lang === "de"
              ? "Foto aufnehmen, Datei wählen oder aus Bestelldaten generieren."
              : "Scatta una foto, scegli un file o genera dai dati dell'ordine."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Target selection */}
          {lockTarget ? (
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm" data-testid="text-locked-target">
              <span className="text-muted-foreground">
                {(presetComplaintId
                  ? lang === "de"
                    ? "Reklamation"
                    : "Reclamo"
                  : lang === "de"
                    ? "Bestellung"
                    : "Ordine") + ": "}
              </span>
              <span className="font-medium">{lockedLabel}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>
                {lang === "de" ? "Zuordnen zu" : "Assegna a"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={targetType === "order" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTargetType("order")}
                  data-testid="button-target-order"
                >
                  {lang === "de" ? "Bestellung" : "Ordine"}
                </Button>
                <Button
                  type="button"
                  variant={targetType === "complaint" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTargetType("complaint")}
                  data-testid="button-target-complaint"
                >
                  {lang === "de" ? "Reklamation" : "Reclamo"}
                </Button>
              </div>

              {targetType === "order" ? (
                <Select value={orderId} onValueChange={setOrderId}>
                  <SelectTrigger data-testid="select-order">
                    <SelectValue
                      placeholder={
                        isLoadingAssignable
                          ? lang === "de"
                            ? "Lädt…"
                            : "Caricamento…"
                          : lang === "de"
                            ? "Bestellung wählen"
                            : "Seleziona ordine"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {assignable?.orders.map((o) => (
                      <SelectItem key={o.id} value={o.id} data-testid={`option-order-${o.id}`}>
                        {`#${formatOrderNumber(o)} · ${
                          currentRole === "restaurant"
                            ? o.supplier?.companyName || o.supplier?.name || ""
                            : o.restaurant?.companyName || o.restaurant?.name || ""
                        }`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={complaintId} onValueChange={setComplaintId}>
                  <SelectTrigger data-testid="select-complaint">
                    <SelectValue
                      placeholder={
                        isLoadingAssignable
                          ? lang === "de"
                            ? "Lädt…"
                            : "Caricamento…"
                          : lang === "de"
                            ? "Reklamation wählen"
                            : "Seleziona reclamo"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {assignable?.complaints.map((c) => (
                      <SelectItem key={c.id} value={c.id} data-testid={`option-complaint-${c.id}`}>
                        {`#${formatComplaintNumber(c)} · ${c.title}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Document type */}
          <div className="space-y-2">
            <Label>{lang === "de" ? "Dokumententyp" : "Tipo di documento"}</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as typeof docType)}>
              <SelectTrigger data-testid="select-doc-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="delivery_note" data-testid="option-type-delivery-note">
                  {lang === "de" ? "Lieferschein" : "Bolla di consegna"}
                </SelectItem>
                <SelectItem value="invoice" data-testid="option-type-invoice">
                  {lang === "de" ? "Rechnung" : "Fattura"}
                </SelectItem>
                <SelectItem value="other" data-testid="option-type-other">
                  {lang === "de" ? "Sonstiges" : "Altro"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Optional title */}
          <div className="space-y-2">
            <Label>
              {lang === "de" ? "Titel (optional)" : "Titolo (opzionale)"}
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={lang === "de" ? "z. B. Lieferschein März" : "es. Bolla marzo"}
              data-testid="input-doc-title"
            />
          </div>

          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelected}
            data-testid="input-camera"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileSelected}
            data-testid="input-file"
          />

          {/* Actions */}
          <div className="grid grid-cols-1 gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
              data-testid="button-take-photo"
            >
              <Camera className="h-4 w-4 mr-2" />
              {lang === "de" ? "Foto aufnehmen" : "Scatta foto"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-pick-file"
            >
              <Upload className="h-4 w-4 mr-2" />
              {lang === "de" ? "Datei wählen (PDF/Bild)" : "Scegli file (PDF/immagine)"}
            </Button>
            {canGenerate && (
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                disabled={busy || !resolvedTargetId}
                onClick={handleGenerate}
                data-testid="button-generate-from-data"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                {lang === "de" ? "Aus Daten generieren" : "Genera dai dati"}
              </Button>
            )}
          </div>

          {uploadMutation.isPending && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" data-testid="status-uploading">
              <Loader2 className="h-4 w-4 animate-spin" />
              {lang === "de" ? "Wird hochgeladen…" : "Caricamento in corso…"}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
