import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, X } from "lucide-react";
import { INVENTORY_RISK_QUALITY } from "@shared/schema";
import type { Product, InventoryRiskRecordWithDetails } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  /** When set, the dialog edits an existing record; otherwise it creates one. */
  record?: InventoryRiskRecordWithDetails | null;
  /** Preselect a product (used from the Products page "report risk" action). */
  defaultProductId?: string;
}

export function InventoryRiskFormDialog({ open, onOpenChange, products, record, defaultProductId }: Props) {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();
  const isEdit = !!record;

  const [productId, setProductId] = useState("");
  const [flaggedQuantity, setFlaggedQuantity] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [qualityStatus, setQualityStatus] = useState<string>("Risk");
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (record) {
      setProductId(record.productId);
      setFlaggedQuantity(String(record.flaggedQuantity));
      setExpiryDate(record.expiryDate ? new Date(record.expiryDate).toISOString().slice(0, 10) : "");
      setQualityStatus(record.qualityStatus);
      setNote(record.note ?? "");
      setPhotoUrl(record.photoUrl ?? null);
    } else {
      setProductId(defaultProductId ?? "");
      setFlaggedQuantity("");
      setExpiryDate("");
      setQualityStatus("Risk");
      setNote("");
      setPhotoUrl(null);
    }
  }, [open, record, defaultProductId]);

  const { uploadFile, isUploading } = useUpload({
    onSuccess: (res) => setPhotoUrl(res.objectPath),
    onError: () => toast({ title: t("inventoryRisk", "riskError"), variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        productId,
        flaggedQuantity: Number(flaggedQuantity),
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
        qualityStatus,
        note: note.trim() || null,
        photoUrl: photoUrl || null,
      };
      if (isEdit && record) {
        return apiRequest("PATCH", `/api/inventory-risks/${record.id}`, payload);
      }
      return apiRequest("POST", "/api/inventory-risks", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-risks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-risks/open-count", currentUser?.id] });
      toast({ title: t("inventoryRisk", isEdit ? "updateRiskSuccess" : "createRiskSuccess") });
      onOpenChange(false);
    },
    onError: () => toast({ title: t("inventoryRisk", "riskError"), variant: "destructive" }),
  });

  const canSubmit = !!productId && Number(flaggedQuantity) > 0 && !isUploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-inventory-risk-form">
        <DialogHeader>
          <DialogTitle>{t("inventoryRisk", isEdit ? "editRisk" : "reportRisk")}</DialogTitle>
          <DialogDescription>{t("inventoryRisk", "subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("inventoryRisk", "product")}</Label>
            <Select value={productId} onValueChange={setProductId} disabled={isEdit}>
              <SelectTrigger data-testid="select-risk-product">
                <SelectValue placeholder={t("inventoryRisk", "selectProduct")} />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id} data-testid={`option-risk-product-${p.id}`}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("inventoryRisk", "flaggedQuantity")}</Label>
              <Input
                type="number"
                min={1}
                value={flaggedQuantity}
                onChange={(e) => setFlaggedQuantity(e.target.value)}
                data-testid="input-risk-quantity"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("inventoryRisk", "expiryDate")}</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                data-testid="input-risk-expiry"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("inventoryRisk", "quality")}</Label>
            <Select value={qualityStatus} onValueChange={setQualityStatus}>
              <SelectTrigger data-testid="select-risk-quality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVENTORY_RISK_QUALITY.map((q) => (
                  <SelectItem key={q} value={q} data-testid={`option-risk-quality-${q}`}>
                    {t("inventoryRisk", `quality_${q}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("inventoryRisk", "note")}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("inventoryRisk", "notePlaceholder")}
              rows={2}
              data-testid="input-risk-note"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("inventoryRisk", "photo")}</Label>
            {photoUrl ? (
              <div className="flex items-center gap-3">
                <img src={photoUrl} alt="" className="h-16 w-16 rounded-lg object-cover border border-border" data-testid="img-risk-photo" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setPhotoUrl(null)} data-testid="button-remove-risk-photo">
                  <X className="h-4 w-4 mr-1" />{t("common", "delete")}
                </Button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer text-sm text-muted-foreground hover:bg-muted/50" data-testid="label-upload-risk-photo">
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t("inventoryRisk", "uploadPhoto")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile(file);
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-risk">
            {t("common", "cancel")}
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!canSubmit || saveMutation.isPending} data-testid="button-save-risk">
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("common", "save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
