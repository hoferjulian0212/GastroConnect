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
import { Checkbox } from "@/components/ui/checkbox";
import { Check } from "lucide-react";
import type { PmsProvider } from "@shared/schema";

type SyncFeature = "guests" | "occupancy" | "forecast";

interface ConnectPmsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
}

export function ConnectPmsDialog({ open, onOpenChange, restaurantId }: ConnectPmsDialogProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [isOther, setIsOther] = useState(false);
  const [pmsName, setPmsName] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [roomCount, setRoomCount] = useState("");
  const [message, setMessage] = useState("");
  const [features, setFeatures] = useState<SyncFeature[]>(["guests"]);

  const resetForm = () => {
    setStep(1);
    setProviderId(null);
    setIsOther(false);
    setPmsName("");
    setHotelName("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setRoomCount("");
    setMessage("");
    setFeatures(["guests"]);
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const { data: providers } = useQuery<PmsProvider[]>({
    queryKey: ["/api/pms/providers"],
    enabled: open,
  });

  const submitMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/pms/connection-requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/restaurant/pms/connection");
        },
      });
      toast({
        title: t("costAnalysis", "pmsRequestSent"),
        description: t("costAnalysis", "pmsRequestSentDesc"),
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: t("costAnalysis", "pmsRequestError"),
        variant: "destructive",
      });
    },
  });

  const toggleFeature = (f: SyncFeature) => {
    setFeatures((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  };

  const handleSelectProvider = (p: PmsProvider) => {
    setProviderId(p.id);
    setIsOther(false);
    setPmsName(p.name);
  };

  const handleSelectOther = () => {
    setProviderId(null);
    setIsOther(true);
    setPmsName("");
  };

  const canProceedStep1 = isOther ? pmsName.trim().length > 0 : !!providerId;
  const canProceedStep2 =
    hotelName.trim().length > 0 &&
    contactName.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(contactEmail);
  const canSubmit = features.length > 0 && canProceedStep1 && canProceedStep2;

  const handleSubmit = () => {
    if (!canSubmit) return;
    submitMutation.mutate({
      restaurantId,
      providerId: providerId ?? undefined,
      pmsName: pmsName.trim(),
      hotelName: hotelName.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim() || undefined,
      roomCount: roomCount.trim() ? parseInt(roomCount, 10) : undefined,
      requestedFeatures: features,
      message: message.trim() || undefined,
    });
  };

  const featureLabels: Record<SyncFeature, string> = {
    guests: t("costAnalysis", "pmsFeatureGuests"),
    occupancy: t("costAnalysis", "pmsFeatureOccupancy"),
    forecast: t("costAnalysis", "pmsFeatureForecast"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-connect-pms">
        <DialogHeader>
          <DialogTitle>{t("costAnalysis", "pmsWizardTitle")}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`}
              data-testid={`step-indicator-${s}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3" data-testid="pms-step-1">
            <p className="text-sm text-muted-foreground">{t("costAnalysis", "pmsSelectProvider")}</p>
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
                    data-testid={`button-provider-${p.slug}`}
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
                data-testid="button-provider-other"
              >
                <span className="font-medium">{t("costAnalysis", "pmsOtherProvider")}</span>
                {isOther && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            </div>
            {isOther && (
              <div>
                <Label className="text-sm">{t("costAnalysis", "pmsOtherName")}</Label>
                <Input
                  value={pmsName}
                  onChange={(e) => setPmsName(e.target.value)}
                  className="mt-1"
                  data-testid="input-pms-other-name"
                />
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3" data-testid="pms-step-2">
            <div>
              <Label className="text-sm">{t("costAnalysis", "hotelName")}</Label>
              <Input value={hotelName} onChange={(e) => setHotelName(e.target.value)} className="mt-1" data-testid="input-hotel-name" />
            </div>
            <div>
              <Label className="text-sm">{t("costAnalysis", "contactName")}</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1" data-testid="input-contact-name" />
            </div>
            <div>
              <Label className="text-sm">{t("costAnalysis", "contactEmail")}</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1" data-testid="input-contact-email" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-sm">{t("costAnalysis", "contactPhone")}</Label>
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1" data-testid="input-contact-phone" />
              </div>
              <div className="w-28">
                <Label className="text-sm">{t("costAnalysis", "roomCount")}</Label>
                <Input type="number" min="0" value={roomCount} onChange={(e) => setRoomCount(e.target.value)} className="mt-1" data-testid="input-room-count" />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3" data-testid="pms-step-3">
            <p className="text-sm text-muted-foreground">{t("costAnalysis", "pmsSelectFeatures")}</p>
            <div className="space-y-2">
              {(["guests", "occupancy", "forecast"] as SyncFeature[]).map((f) => (
                <label
                  key={f}
                  className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50"
                  data-testid={`feature-${f}`}
                >
                  <Checkbox checked={features.includes(f)} onCheckedChange={() => toggleFeature(f)} data-testid={`checkbox-feature-${f}`} />
                  <span className="text-sm font-medium">{featureLabels[f]}</span>
                </label>
              ))}
            </div>
            <div>
              <Label className="text-sm">{t("costAnalysis", "pmsMessage")}</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1" rows={3} data-testid="input-pms-message" />
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 mt-2">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)} data-testid="button-pms-back">
              {t("costAnalysis", "back")}
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              data-testid="button-pms-next"
            >
              {t("costAnalysis", "next")}
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canSubmit || submitMutation.isPending} data-testid="button-pms-submit">
              {t("costAnalysis", "submitRequest")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
