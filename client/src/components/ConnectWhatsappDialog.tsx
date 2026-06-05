import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Check, MessageCircle, Inbox } from "lucide-react";

type UsagePreference = "alongside" | "whatsapp_only";

interface ConnectWhatsappDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function ConnectWhatsappDialog({ open, onOpenChange, userId }: ConnectWhatsappDialogProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [usagePreference, setUsagePreference] = useState<UsagePreference>("alongside");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [message, setMessage] = useState("");

  const resetForm = () => {
    setStep(1);
    setWhatsappNumber("");
    setUsagePreference("alongside");
    setCompanyName("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setMessage("");
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const submitMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/whatsapp/connection-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/whatsapp/connection");
        },
      });
      toast({
        title: t("whatsapp", "whatsappRequestSent"),
        description: t("whatsapp", "whatsappRequestSentDesc"),
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: t("whatsapp", "whatsappRequestError"),
        variant: "destructive",
      });
    },
  });

  const phoneValid = /^\+?[0-9\s().-]{5,}$/.test(whatsappNumber.trim());
  const canProceedStep1 = phoneValid && !!usagePreference;
  const canProceedStep2 =
    companyName.trim().length > 0 &&
    contactName.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(contactEmail);
  const canSubmit = canProceedStep1 && canProceedStep2;

  const handleSubmit = () => {
    if (!canSubmit) return;
    submitMutation.mutate({
      userId,
      whatsappNumber: whatsappNumber.trim(),
      companyName: companyName.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim() || undefined,
      usagePreference,
      message: message.trim() || undefined,
    });
  };

  const usageOptions: { value: UsagePreference; label: string; desc: string; icon: typeof Inbox }[] = [
    { value: "alongside", label: t("whatsapp", "whatsappUsageAlongside"), desc: t("whatsapp", "whatsappUsageAlongsideDesc"), icon: Inbox },
    { value: "whatsapp_only", label: t("whatsapp", "whatsappUsageOnly"), desc: t("whatsapp", "whatsappUsageOnlyDesc"), icon: MessageCircle },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-connect-whatsapp">
        <DialogHeader>
          <DialogTitle>{t("whatsapp", "whatsappWizardTitle")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`}
              data-testid={`whatsapp-step-indicator-${s}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3" data-testid="whatsapp-step-1">
            <div>
              <Label className="text-sm">{t("whatsapp", "whatsappNumberLabel")}</Label>
              <Input
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder={t("whatsapp", "whatsappNumberPlaceholder")}
                className="mt-1"
                data-testid="input-whatsapp-number"
              />
              <p className="text-xs text-muted-foreground mt-1">{t("whatsapp", "whatsappNumberDesc")}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t("whatsapp", "whatsappSelectUsage")}</p>
              {usageOptions.map((m) => {
                const Icon = m.icon;
                const selected = usagePreference === m.value;
                return (
                  <button
                    key={m.value}
                    onClick={() => setUsagePreference(m.value)}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                    data-testid={`button-whatsapp-usage-${m.value}`}
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
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3" data-testid="whatsapp-step-2">
            <div>
              <Label className="text-sm">{t("whatsapp", "companyName")}</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1" data-testid="input-whatsapp-company-name" />
            </div>
            <div>
              <Label className="text-sm">{t("whatsapp", "contactName")}</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1" data-testid="input-whatsapp-contact-name" />
            </div>
            <div>
              <Label className="text-sm">{t("whatsapp", "contactEmail")}</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1" data-testid="input-whatsapp-contact-email" />
            </div>
            <div>
              <Label className="text-sm">{t("whatsapp", "contactPhone")}</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1" data-testid="input-whatsapp-contact-phone" />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3" data-testid="whatsapp-step-3">
            <div>
              <Label className="text-sm">{t("whatsapp", "whatsappMessage")}</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1" rows={3} data-testid="input-whatsapp-message" />
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 mt-2">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)} data-testid="button-whatsapp-back">
              {t("whatsapp", "back")}
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              data-testid="button-whatsapp-next"
            >
              {t("whatsapp", "next")}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canSubmit || submitMutation.isPending} data-testid="button-whatsapp-submit">
              {t("whatsapp", "submitRequest")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
