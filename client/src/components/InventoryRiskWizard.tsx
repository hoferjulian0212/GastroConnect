import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProductImage } from "@/components/ProductImage";
import {
  Camera, X, ChevronLeft, Check, Loader2, Package, Search,
  AlertTriangle, Clock, ThermometerSnowflake, PackageX, CalendarClock, Boxes, HelpCircle,
} from "lucide-react";
import { INVENTORY_RISK_QUALITY, INVENTORY_RISK_REASONS } from "@shared/schema";
import type { Product, InventoryRiskReason } from "@shared/schema";

type Step = "photo" | "product" | "reason" | "details" | "review";
const STEPS: Step[] = ["photo", "product", "reason", "details", "review"];

const REASON_ICONS: Record<InventoryRiskReason, typeof AlertTriangle> = {
  "Poorly Stored": ThermometerSnowflake,
  "Poor Quality": AlertTriangle,
  "Stored Too Long": Clock,
  "Damaged": PackageX,
  "Near Expiry": CalendarClock,
  "Overstock": Boxes,
  "Other": HelpCircle,
};

const QUALITY_STYLES: Record<string, string> = {
  Premium: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
  OK: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300",
  Risk: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
  Bad: "border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  /** Preselect a product (used from the Stock / Products "report risk" action). */
  defaultProductId?: string;
}

export function InventoryRiskWizard({ open, onOpenChange, products, defaultProductId }: Props) {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  const [step, setStep] = useState<Step>("photo");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [reason, setReason] = useState<InventoryRiskReason | "">("");
  const [qualityStatus, setQualityStatus] = useState<string>("Risk");
  const [flaggedQuantity, setFlaggedQuantity] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [note, setNote] = useState("");

  const reset = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setStep("photo");
    setPhotoUrl(null);
    setPhotoPreview(null);
    setUploading(false);
    setProductId(defaultProductId ?? "");
    setProductSearch("");
    setReason("");
    setQualityStatus("Risk");
    setFlaggedQuantity("");
    setExpiryDate("");
    setNote("");
  };

  useEffect(() => {
    if (open) {
      cancelledRef.current = false;
      reset();
    } else {
      cancelledRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultProductId]);

  useEffect(() => () => {
    cancelledRef.current = true;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const r = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type || "image/jpeg",
        prefix: "inventory-risk-photos",
      });
      const { uploadURL, objectPath } = await r.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      if (!putRes.ok) throw new Error("upload-failed");
      if (cancelledRef.current) return;
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoUrl(objectPath);
      setPhotoPreview(URL.createObjectURL(file));
    } catch {
      if (!cancelledRef.current) {
        toast({ title: t("inventoryRisk", "riskError"), variant: "destructive" });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        productId,
        flaggedQuantity: Number(flaggedQuantity),
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
        qualityStatus,
        riskReason: reason || null,
        note: note.trim() || null,
        photoUrl: photoUrl || null,
      };
      return apiRequest("POST", "/api/inventory-risks", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-risks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-risks/open-count", currentUser?.id] });
      toast({ title: t("inventoryRisk", "createRiskSuccess") });
      onOpenChange(false);
    },
    onError: () => toast({ title: t("inventoryRisk", "riskError"), variant: "destructive" }),
  });

  const stepIndex = STEPS.indexOf(step);
  const isFirst = stepIndex === 0;
  const isLast = step === "review";

  const canNext =
    (step === "photo" && !uploading) ||
    (step === "product" && !!productId) ||
    (step === "reason" && !!reason) ||
    (step === "details" && Number(flaggedQuantity) > 0) ||
    step === "review";

  const goNext = () => {
    if (!isLast) setStep(STEPS[stepIndex + 1]);
  };
  const goBack = () => {
    if (isFirst) onOpenChange(false);
    else setStep(STEPS[stepIndex - 1]);
  };

  const reasonLabel = (r: InventoryRiskReason) => t("inventoryRisk", `reason_${r}` as any);

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <DrawerContent className="max-h-[94vh]" data-testid="drawer-inventory-risk-wizard">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <button
              onClick={goBack}
              className="h-9 w-9 -ml-2 inline-flex items-center justify-center rounded-full hover-elevate"
              data-testid="button-risk-wizard-back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <DrawerTitle className="text-base font-semibold">
              {t("inventoryRisk", "reportRisk")}
            </DrawerTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="h-9 w-9 -mr-2 inline-flex items-center justify-center rounded-full hover-elevate"
              data-testid="button-risk-wizard-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex gap-1 mt-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {t("inventoryRisk", "wizardStep")} {stepIndex + 1} {t("inventoryRisk", "wizardOf")} {STEPS.length}
          </p>
        </DrawerHeader>

        <div className="px-4 pt-1 pb-5 overflow-y-auto">
          {step === "photo" && (
            <div className="space-y-3" data-testid="risk-step-photo">
              <div>
                <h3 className="text-base font-semibold">{t("inventoryRisk", "photoStepTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("inventoryRisk", "photoStepHint")}</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-risk-photo-capture"
              />
              {photoPreview ? (
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted" data-testid="risk-photo-preview">
                  <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => { if (photoPreview) URL.revokeObjectURL(photoPreview); setPhotoUrl(null); setPhotoPreview(null); }}
                    className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white inline-flex items-center justify-center"
                    data-testid="button-remove-risk-photo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground hover-elevate"
                  data-testid="button-take-risk-photo"
                >
                  {uploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Camera className="h-8 w-8" />}
                  <span className="text-sm font-medium">
                    {uploading ? t("inventoryRisk", "uploadingPhoto") : t("inventoryRisk", "takePhoto")}
                  </span>
                </button>
              )}
              {photoPreview && (
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full"
                  data-testid="button-retake-risk-photo"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {t("inventoryRisk", "retakePhoto")}
                </Button>
              )}
            </div>
          )}

          {step === "product" && (
            <div className="space-y-3" data-testid="risk-step-product">
              <div>
                <h3 className="text-base font-semibold">{t("inventoryRisk", "productStepTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("inventoryRisk", "productStepHint")}</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={t("inventoryRisk", "searchProduct")}
                  className="pl-9"
                  data-testid="input-risk-product-search"
                />
              </div>
              <div className="space-y-1.5 max-h-[46vh] overflow-y-auto -mx-1 px-1">
                {filteredProducts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    {t("inventoryRisk", "noProductsFound")}
                  </div>
                ) : (
                  filteredProducts.map((p) => {
                    const active = productId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setProductId(p.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
                        data-testid={`risk-product-card-${p.id}`}
                      >
                        <ProductImage src={p.imageUrl} className="h-11 w-11 rounded-lg shrink-0" testId={`img-risk-product-${p.id}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.name}</div>
                          {p.unit && <div className="text-xs text-muted-foreground">{p.unit}</div>}
                        </div>
                        {active && <Check className="h-5 w-5 text-primary shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {step === "reason" && (
            <div className="space-y-3" data-testid="risk-step-reason">
              <div>
                <h3 className="text-base font-semibold">{t("inventoryRisk", "reasonStepTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("inventoryRisk", "reasonStepHint")}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {INVENTORY_RISK_REASONS.map((r) => {
                  const Icon = REASON_ICONS[r];
                  const active = reason === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className={`flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
                      data-testid={`risk-reason-${r}`}
                    >
                      <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-sm font-medium leading-tight">{reasonLabel(r)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === "details" && (
            <div className="space-y-4" data-testid="risk-step-details">
              <div>
                <h3 className="text-base font-semibold">{t("inventoryRisk", "detailsStepTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("inventoryRisk", "detailsStepHint")}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("inventoryRisk", "quality")}</label>
                <div className="grid grid-cols-4 gap-2">
                  {INVENTORY_RISK_QUALITY.map((q) => {
                    const active = qualityStatus === q;
                    return (
                      <button
                        key={q}
                        onClick={() => setQualityStatus(q)}
                        className={`py-2 rounded-xl border text-xs font-medium transition-colors ${active ? QUALITY_STYLES[q] : "border-border text-muted-foreground hover-elevate"}`}
                        data-testid={`risk-quality-${q}`}
                      >
                        {t("inventoryRisk", `quality_${q}` as any)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("inventoryRisk", "flaggedQuantity")}</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={flaggedQuantity}
                  onChange={(e) => setFlaggedQuantity(e.target.value)}
                  placeholder="0"
                  className="h-12 text-base"
                  data-testid="input-risk-quantity"
                />
                {selectedProduct?.unit && (
                  <p className="text-xs text-muted-foreground">{selectedProduct.unit}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("inventoryRisk", "expiryDate")}</label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="h-12 text-base"
                  data-testid="input-risk-expiry"
                />
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4" data-testid="risk-step-review">
              <div>
                <h3 className="text-base font-semibold">{t("inventoryRisk", "reviewStepTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("inventoryRisk", "reviewStepHint")}</p>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
                <ProductImage src={photoPreview || selectedProduct?.imageUrl} className="h-14 w-14 rounded-xl shrink-0" testId="img-risk-summary" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{selectedProduct?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {flaggedQuantity || 0} {selectedProduct?.unit ?? ""}
                    {reason ? ` · ${reasonLabel(reason)}` : ""}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t("inventoryRisk", "note")}</label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={t("inventoryRisk", "notePlaceholder")}
                  data-testid="input-risk-note"
                />
              </div>
              <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-1">
                <div><span className="text-muted-foreground">{t("inventoryRisk", "reason")}:</span> {reason ? reasonLabel(reason) : "—"}</div>
                <div><span className="text-muted-foreground">{t("inventoryRisk", "quality")}:</span> {t("inventoryRisk", `quality_${qualityStatus}` as any)}</div>
                <div><span className="text-muted-foreground">{t("inventoryRisk", "summaryPhoto")}:</span> {photoUrl ? t("inventoryRisk", "summaryWithPhoto") : t("inventoryRisk", "summaryNoPhoto")}</div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-background p-3 pb-[max(env(safe-area-inset-bottom),12px)] flex gap-2">
          {step === "photo" && !photoUrl && (
            <Button
              variant="outline"
              onClick={goNext}
              disabled={uploading}
              className="flex-1 h-12 rounded-xl"
              data-testid="button-risk-skip-photo"
            >
              {t("inventoryRisk", "skipPhoto")}
            </Button>
          )}
          {!isLast ? (
            <Button
              onClick={goNext}
              disabled={!canNext}
              className="flex-1 h-12 rounded-xl"
              data-testid="button-risk-wizard-next"
            >
              {t("inventoryRisk", "wizardNext")}
            </Button>
          ) : (
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canNext || saveMutation.isPending || !productId || Number(flaggedQuantity) <= 0}
              className="flex-1 h-12 rounded-xl gap-2"
              data-testid="button-risk-wizard-submit"
            >
              {saveMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              {t("inventoryRisk", "wizardSend")}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
