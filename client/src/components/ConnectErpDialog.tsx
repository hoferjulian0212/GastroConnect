import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, Plug, FileSpreadsheet, HelpCircle } from "lucide-react";
import type { ErpProvider } from "@shared/schema";

type ConnectionMethod = "api" | "excel_email" | "unsure";

interface ConnectErpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
}

export function ConnectErpDialog({ open, onOpenChange, supplierId }: ConnectErpDialogProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [isOther, setIsOther] = useState(false);
  const [erpName, setErpName] = useState("");
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>("unsure");
  const [preferredSyncTime, setPreferredSyncTime] = useState("06:00");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [productCount, setProductCount] = useState("");
  const [message, setMessage] = useState("");

  const resetForm = () => {
    setStep(1);
    setProviderId(null);
    setIsOther(false);
    setErpName("");
    setConnectionMethod("unsure");
    setPreferredSyncTime("06:00");
    setCompanyName("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setProductCount("");
    setMessage("");
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const { data: providers } = useQuery<ErpProvider[]>({
    queryKey: ["/api/erp/providers"],
    enabled: open,
  });

  const submitMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/erp/connection-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/supplier/erp/connection");
        },
      });
      toast({
        title: t("supplierErp", "erpRequestSent"),
        description: t("supplierErp", "erpRequestSentDesc"),
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: t("supplierErp", "erpRequestError"),
        variant: "destructive",
      });
    },
  });

  const handleSelectProvider = (p: ErpProvider) => {
    setProviderId(p.id);
    setIsOther(false);
    setErpName(p.name);
  };

  const handleSelectOther = () => {
    setProviderId(null);
    setIsOther(true);
    setErpName("");
  };

  const canProceedStep1 = isOther ? erpName.trim().length > 0 : !!providerId;
  const canProceedStep2 = !!connectionMethod;
  const canProceedStep3 =
    companyName.trim().length > 0 &&
    contactName.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(contactEmail);
  const canSubmit = canProceedStep1 && canProceedStep2 && canProceedStep3;

  const handleSubmit = () => {
    if (!canSubmit) return;
    submitMutation.mutate({
      supplierId,
      providerId: providerId ?? undefined,
      erpName: erpName.trim(),
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim() || undefined,
      productCount: productCount.trim() ? parseInt(productCount, 10) : undefined,
      connectionMethod,
      preferredSyncTime: preferredSyncTime.trim() || undefined,
      message: message.trim() || undefined,
    });
  };

  const methodOptions: { value: ConnectionMethod; label: string; desc: string; icon: typeof Plug }[] = [
    { value: "api", label: t("supplierErp", "erpMethodApi"), desc: t("supplierErp", "erpMethodApiDesc"), icon: Plug },
    { value: "excel_email", label: t("supplierErp", "erpMethodExcel"), desc: t("supplierErp", "erpMethodExcelDesc"), icon: FileSpreadsheet },
    { value: "unsure", label: t("supplierErp", "erpMethodUnsure"), desc: t("supplierErp", "erpMethodUnsureDesc"), icon: HelpCircle },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-connect-erp">
        <DialogHeader>
          <DialogTitle>{t("supplierErp", "erpWizardTitle")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`}
              data-testid={`erp-step-indicator-${s}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3" data-testid="erp-step-1">
            <p className="text-sm text-muted-foreground">{t("supplierErp", "erpSelectProvider")}</p>
            <div className="grid grid-cols-2 gap-2">
              {providers
                ?.filter((p) => p.slug !== "other")
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProvider(p)}
                    className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                      providerId === p.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                    data-testid={`button-erp-provider-${p.slug}`}
                  >
                    <span className="font-medium">{p.name}</span>
                    {providerId === p.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                ))}
              <button
                onClick={handleSelectOther}
                className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                  isOther ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
                data-testid="button-erp-provider-other"
              >
                <span className="font-medium">{t("supplierErp", "erpOtherProvider")}</span>
                {isOther && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            </div>
            {isOther && (
              <div>
                <Label className="text-sm">{t("supplierErp", "erpOtherName")}</Label>
                <Input
                  value={erpName}
                  onChange={(e) => setErpName(e.target.value)}
                  className="mt-1"
                  data-testid="input-erp-other-name"
                />
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3" data-testid="erp-step-2">
            <p className="text-sm text-muted-foreground">{t("supplierErp", "erpSelectMethod")}</p>
            <div className="space-y-2">
              {methodOptions.map((m) => {
                const Icon = m.icon;
                const selected = connectionMethod === m.value;
                return (
                  <button
                    key={m.value}
                    onClick={() => setConnectionMethod(m.value)}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                    data-testid={`button-erp-method-${m.value}`}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{m.label}</span>
                      <span className="block text-xs text-muted-foreground">{m.desc}</span>
                    </span>
                    {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div>
              <Label className="text-sm">{t("supplierErp", "erpSyncTime")}</Label>
              <Input
                type="time"
                value={preferredSyncTime}
                onChange={(e) => setPreferredSyncTime(e.target.value)}
                className="mt-1"
                data-testid="input-erp-sync-time"
              />
              <p className="text-xs text-muted-foreground mt-1">{t("supplierErp", "erpSyncTimeDesc")}</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3" data-testid="erp-step-3">
            <div>
              <Label className="text-sm">{t("supplierErp", "companyName")}</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1" data-testid="input-erp-company-name" />
            </div>
            <div>
              <Label className="text-sm">{t("supplierErp", "contactName")}</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1" data-testid="input-erp-contact-name" />
            </div>
            <div>
              <Label className="text-sm">{t("supplierErp", "contactEmail")}</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1" data-testid="input-erp-contact-email" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-sm">{t("supplierErp", "contactPhone")}</Label>
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1" data-testid="input-erp-contact-phone" />
              </div>
              <div className="w-32">
                <Label className="text-sm">{t("supplierErp", "productCount")}</Label>
                <Input type="number" min="0" value={productCount} onChange={(e) => setProductCount(e.target.value)} className="mt-1" data-testid="input-erp-product-count" />
              </div>
            </div>
            <div>
              <Label className="text-sm">{t("supplierErp", "erpMessage")}</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1" rows={3} data-testid="input-erp-message" />
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 mt-2">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)} data-testid="button-erp-back">
              {t("supplierErp", "back")}
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              data-testid="button-erp-next"
            >
              {t("supplierErp", "next")}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canSubmit || submitMutation.isPending} data-testid="button-erp-submit">
              {t("supplierErp", "submitRequest")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
