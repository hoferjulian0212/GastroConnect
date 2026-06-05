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
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Lock } from "lucide-react";
import type { ErpCredentialType, ErpCredentialPublicMeta } from "@shared/schema";

interface ErpCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  defaultType?: ErpCredentialType;
  existingMeta?: ErpCredentialPublicMeta | null;
}

export function ErpCredentialsDialog({
  open,
  onOpenChange,
  supplierId,
  defaultType = "api",
  existingMeta = null,
}: ErpCredentialsDialogProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();

  const [credentialType, setCredentialType] = useState<ErpCredentialType>(defaultType);
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [externalSupplierId, setExternalSupplierId] = useState("");
  const [mailboxHost, setMailboxHost] = useState("");
  const [mailboxPort, setMailboxPort] = useState("");
  const [mailboxUser, setMailboxUser] = useState("");
  const [mailboxPassword, setMailboxPassword] = useState("");

  useEffect(() => {
    if (open) {
      setCredentialType(existingMeta?.credentialType ?? defaultType);
      setApiKey("");
      setApiBaseUrl("");
      setExternalSupplierId("");
      setMailboxHost("");
      setMailboxPort("");
      setMailboxUser("");
      setMailboxPassword("");
    }
  }, [open, defaultType, existingMeta]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { supplierId, credentialType };
      if (credentialType === "api") {
        body.apiKey = apiKey.trim();
        if (apiBaseUrl.trim()) body.apiBaseUrl = apiBaseUrl.trim();
        if (externalSupplierId.trim()) body.externalSupplierId = externalSupplierId.trim();
      } else {
        body.mailboxHost = mailboxHost.trim();
        if (mailboxPort.trim()) body.mailboxPort = mailboxPort.trim();
        body.mailboxUser = mailboxUser.trim();
        body.mailboxPassword = mailboxPassword.trim();
      }
      return apiRequest("PUT", "/api/supplier/erp/credentials", body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/supplier/erp/");
        },
      });
      toast({
        title: t("supplierErp", "erpCredSaved"),
        description: t("supplierErp", "erpCredSavedDesc"),
      });
      onOpenChange(false);
    },
    onError: async (error: any) => {
      let message = t("supplierErp", "erpCredError");
      try {
        const parsed = JSON.parse(error?.message?.replace(/^\d+:\s*/, "") ?? "{}");
        if (parsed?.code === "ERP_CREDENTIALS_KEY_MISSING") {
          message = t("supplierErp", "erpCredNotConfigured");
        }
      } catch {
        // keep generic message
      }
      toast({ title: message, variant: "destructive" });
    },
  });

  const apiValid = apiKey.trim().length > 0;
  const emailValid =
    mailboxHost.trim().length > 0 && mailboxUser.trim().length > 0 && mailboxPassword.trim().length > 0;
  const canSave = credentialType === "api" ? apiValid : emailValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-erp-credentials">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {t("supplierErp", "erpCredentialsTitle")}
          </DialogTitle>
          <DialogDescription>{t("supplierErp", "erpCredentialsDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("supplierErp", "erpCredMethodLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={credentialType === "api" ? "default" : "outline"}
                onClick={() => setCredentialType("api")}
                data-testid="button-cred-method-api"
              >
                {t("supplierErp", "erpMethodApi")}
              </Button>
              <Button
                type="button"
                variant={credentialType === "excel_email" ? "default" : "outline"}
                onClick={() => setCredentialType("excel_email")}
                data-testid="button-cred-method-email"
              >
                {t("supplierErp", "erpMethodExcel")}
              </Button>
            </div>
          </div>

          {credentialType === "api" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cred-api-key">{t("supplierErp", "erpCredApiKey")}</Label>
                <Input
                  id="cred-api-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  data-testid="input-cred-api-key"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cred-api-base">{t("supplierErp", "erpCredApiBaseUrl")}</Label>
                <Input
                  id="cred-api-base"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  data-testid="input-cred-api-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cred-external-id">{t("supplierErp", "erpCredExternalId")}</Label>
                <Input
                  id="cred-external-id"
                  value={externalSupplierId}
                  onChange={(e) => setExternalSupplierId(e.target.value)}
                  data-testid="input-cred-external-id"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cred-mail-host">{t("supplierErp", "erpCredMailHost")}</Label>
                <Input
                  id="cred-mail-host"
                  value={mailboxHost}
                  onChange={(e) => setMailboxHost(e.target.value)}
                  data-testid="input-cred-mail-host"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cred-mail-port">{t("supplierErp", "erpCredMailPort")}</Label>
                <Input
                  id="cred-mail-port"
                  value={mailboxPort}
                  onChange={(e) => setMailboxPort(e.target.value)}
                  data-testid="input-cred-mail-port"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cred-mail-user">{t("supplierErp", "erpCredMailUser")}</Label>
                <Input
                  id="cred-mail-user"
                  autoComplete="off"
                  value={mailboxUser}
                  onChange={(e) => setMailboxUser(e.target.value)}
                  data-testid="input-cred-mail-user"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cred-mail-password">{t("supplierErp", "erpCredMailPassword")}</Label>
                <Input
                  id="cred-mail-password"
                  type="password"
                  autoComplete="off"
                  value={mailboxPassword}
                  onChange={(e) => setMailboxPassword(e.target.value)}
                  data-testid="input-cred-mail-password"
                />
              </div>
            </div>
          )}

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            {t("supplierErp", "erpCredentialsDesc")}
          </p>

          <Button
            className="w-full"
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            data-testid="button-save-credentials"
          >
            {t("supplierErp", "erpCredSave")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
