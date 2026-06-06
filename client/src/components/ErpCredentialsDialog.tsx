import { useState, useEffect, useMemo } from "react";
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
  providerSlug?: string | null;
}

// Field definition for an API-method credential input.
interface FieldDef {
  key: string;
  labelKey: string;
  type?: "text" | "password";
  required?: boolean;
}

// Vendor-specific API credential fields. Each named provider exposes only the
// inputs its adapter actually needs (matching server/erpProviders.ts).
const VENDOR_FIELDS: Record<string, FieldDef[]> = {
  dynamics365: [
    { key: "tenantId", labelKey: "erpCredTenantId", required: true },
    { key: "clientId", labelKey: "erpCredClientId", required: true },
    { key: "clientSecret", labelKey: "erpCredClientSecret", type: "password", required: true },
    { key: "environment", labelKey: "erpCredEnvironment" },
    { key: "companyId", labelKey: "erpCredCompanyId", required: true },
  ],
  "sap-b1": [
    { key: "serviceLayerUrl", labelKey: "erpCredServiceLayerUrl", required: true },
    { key: "companyDb", labelKey: "erpCredCompanyDb", required: true },
    { key: "username", labelKey: "erpCredUsername", required: true },
    { key: "password", labelKey: "erpCredPassword", type: "password", required: true },
  ],
  weclapp: [
    { key: "apiBaseUrl", labelKey: "erpCredBaseUrl", required: true },
    { key: "apiKey", labelKey: "erpCredApiToken", type: "password", required: true },
  ],
  datev: [
    { key: "apiBaseUrl", labelKey: "erpCredCatalogUrl", required: true },
    { key: "apiKey", labelKey: "erpCredApiKeyOptional", type: "password" },
    { key: "clientId", labelKey: "erpCredClientId" },
    { key: "clientSecret", labelKey: "erpCredClientSecret", type: "password" },
    { key: "tokenUrl", labelKey: "erpCredTokenUrl" },
    { key: "scope", labelKey: "erpCredScope" },
  ],
  xentral: [
    { key: "apiBaseUrl", labelKey: "erpCredCatalogUrl", required: true },
    { key: "apiKey", labelKey: "erpCredApiKey", type: "password", required: true },
  ],
  sage: [
    { key: "apiBaseUrl", labelKey: "erpCredCatalogUrl", required: true },
    { key: "apiKey", labelKey: "erpCredApiKey", type: "password", required: true },
  ],
  lexware: [
    { key: "apiKey", labelKey: "erpCredApiKey", type: "password", required: true },
    { key: "apiBaseUrl", labelKey: "erpCredApiBaseUrl" },
  ],
};

const DEFAULT_FIELDS: FieldDef[] = [
  { key: "apiKey", labelKey: "erpCredApiKey", type: "password", required: true },
  { key: "apiBaseUrl", labelKey: "erpCredApiBaseUrl" },
  { key: "externalSupplierId", labelKey: "erpCredExternalId" },
];

export function ErpCredentialsDialog({
  open,
  onOpenChange,
  supplierId,
  defaultType = "api",
  existingMeta = null,
  providerSlug = null,
}: ErpCredentialsDialogProps) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();

  const [credentialType, setCredentialType] = useState<ErpCredentialType>(defaultType);
  const [apiValues, setApiValues] = useState<Record<string, string>>({});
  const [mailboxHost, setMailboxHost] = useState("");
  const [mailboxPort, setMailboxPort] = useState("");
  const [mailboxUser, setMailboxUser] = useState("");
  const [mailboxPassword, setMailboxPassword] = useState("");

  const apiFields = useMemo<FieldDef[]>(
    () => (providerSlug && VENDOR_FIELDS[providerSlug]) || DEFAULT_FIELDS,
    [providerSlug],
  );
  const isVendorSpecific = !!(providerSlug && VENDOR_FIELDS[providerSlug]);

  useEffect(() => {
    if (open) {
      setCredentialType(existingMeta?.credentialType ?? defaultType);
      setApiValues({});
      setMailboxHost("");
      setMailboxPort("");
      setMailboxUser("");
      setMailboxPassword("");
    }
  }, [open, defaultType, existingMeta]);

  const setApiValue = (key: string, value: string) =>
    setApiValues((prev) => ({ ...prev, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { supplierId, credentialType };
      if (credentialType === "api") {
        for (const field of apiFields) {
          const value = (apiValues[field.key] ?? "").trim();
          if (value) body[field.key] = value;
        }
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

  const apiValid = apiFields
    .filter((f) => f.required)
    .every((f) => (apiValues[f.key] ?? "").trim().length > 0);
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
              {isVendorSpecific && (
                <p className="text-xs text-muted-foreground">{t("supplierErp", "erpCredVendorHint")}</p>
              )}
              {apiFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`cred-${field.key}`}>{t("supplierErp", field.labelKey as any)}</Label>
                  <Input
                    id={`cred-${field.key}`}
                    type={field.type === "password" ? "password" : "text"}
                    autoComplete="off"
                    value={apiValues[field.key] ?? ""}
                    onChange={(e) => setApiValue(field.key, e.target.value)}
                    data-testid={`input-cred-${field.key}`}
                  />
                </div>
              ))}
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
