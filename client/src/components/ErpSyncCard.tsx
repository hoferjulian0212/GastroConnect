import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Eye, AlertCircle, CheckCircle2, PlusCircle, Pencil, Ban } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { useT } from "@/lib/translations";
import type { SupplierErpConnection, ErpProvider } from "@shared/schema";

interface SyncPreviewItem {
  action: "create" | "update" | "deactivate";
  name: string;
  changes: string[];
}

interface SyncResult {
  dryRun: boolean;
  totalRows: number;
  created: number;
  updated: number;
  deactivated: number;
  reactivated: number;
  priceChanges: number;
  stockChanges: number;
  unchanged: number;
  errors: string[];
  preview: SyncPreviewItem[];
}

interface Props {
  connection: SupplierErpConnection & { provider: ErpProvider | null };
  supplierId: string;
  hasCredentials: boolean;
  lang: string;
  t: ReturnType<typeof useT>;
}

export function ErpSyncCard({ connection, supplierId, hasCredentials, lang, t }: Props) {
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<SyncResult | null>(null);
  const [time, setTime] = useState((connection.preferredSyncTime || "06:00").slice(0, 5));

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/supplier/erp/connection") });
    queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/supplier/products") });
  };

  const dryRunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/supplier/erp/sync", { supplierId, dryRun: true, userId: supplierId });
      return (await res.json()) as SyncResult;
    },
    onSuccess: (data) => {
      setPreview(data);
      setPreviewOpen(true);
    },
    onError: (e: Error) => {
      toast({ title: t("supplierErp", "syncError"), description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" });
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/supplier/erp/sync", { supplierId, userId: supplierId });
      return (await res.json()) as SyncResult;
    },
    onSuccess: (data) => {
      setPreviewOpen(false);
      setPreview(null);
      invalidate();
      const summary = `+${data.created} · ~${data.updated} · -${data.deactivated}`;
      toast({ title: t("supplierErp", "syncSuccess"), description: summary });
    },
    onError: (e: Error) => {
      toast({ title: t("supplierErp", "syncError"), description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" });
    },
  });

  const configMutation = useMutation({
    mutationFn: async (patch: { syncEnabled?: boolean; preferredSyncTime?: string }) => {
      await apiRequest("PATCH", "/api/supplier/erp/sync-config", { supplierId, ...patch });
    },
    onSuccess: () => invalidate(),
  });

  const running = connection.syncStatus === "running" || runMutation.isPending;
  const lastError = connection.syncStatus === "error" ? connection.lastSyncError : null;
  const dtLocale = lang === "de" ? "de-DE" : "it-IT";

  const actionMeta = (action: SyncPreviewItem["action"]) => {
    if (action === "create") return { icon: <PlusCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />, label: t("supplierErp", "syncActionCreate") };
    if (action === "deactivate") return { icon: <Ban className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />, label: t("supplierErp", "syncActionDeactivate") };
    return { icon: <Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />, label: t("supplierErp", "syncActionUpdate") };
  };

  return (
    <Card data-testid="card-erp-sync">
      <CardContent className="p-5 md:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base md:text-lg font-bold" data-testid="text-sync-title">{t("supplierErp", "syncCardTitle")}</h2>
            <p className="text-muted-foreground text-sm mt-1">{t("supplierErp", "syncCardDesc")}</p>
          </div>
        </div>

        {!hasCredentials && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm p-3" data-testid="text-sync-no-credentials">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {t("supplierErp", "syncNoCredentials")}
          </div>
        )}

        {!connection.firstSyncConfirmed && hasCredentials && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-sm p-3" data-testid="text-sync-first-hint">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {t("supplierErp", "syncFirstHint")}
          </div>
        )}

        {/* Last-run status */}
        {connection.syncStatus === "success" && connection.lastSyncAt && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2" data-testid="status-sync-last">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              {t("supplierErp", "syncLastRun")}: {new Date(connection.lastSyncAt).toLocaleString(dtLocale)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span data-testid="text-sync-created">{t("supplierErp", "syncCreated")}: <b className="text-foreground">{connection.lastSyncCreated}</b></span>
              <span data-testid="text-sync-updated">{t("supplierErp", "syncUpdated")}: <b className="text-foreground">{connection.lastSyncUpdated}</b></span>
              <span data-testid="text-sync-deactivated">{t("supplierErp", "syncDeactivated")}: <b className="text-foreground">{connection.lastSyncDeactivated}</b></span>
            </div>
          </div>
        )}

        {lastError && (
          <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400" data-testid="text-sync-error">
            <div className="flex items-center gap-2 font-medium"><AlertCircle className="w-4 h-4" />{t("supplierErp", "syncError")}</div>
            <p className="mt-1 break-words">{lastError}</p>
          </div>
        )}

        {/* Daily schedule */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={connection.syncEnabled}
              onCheckedChange={(v) => configMutation.mutate({ syncEnabled: v })}
              disabled={!hasCredentials || configMutation.isPending}
              data-testid="switch-sync-enabled"
            />
            <div>
              <div className="text-sm font-medium">{t("supplierErp", "syncSchedule")}</div>
              <div className="text-xs text-muted-foreground">
                {connection.syncEnabled ? t("supplierErp", "syncScheduleOn") : t("supplierErp", "syncScheduleOff")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t("supplierErp", "syncTime")}</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onBlur={() => { if (time && time !== (connection.preferredSyncTime || "").slice(0, 5)) configMutation.mutate({ preferredSyncTime: time }); }}
              disabled={!hasCredentials}
              className="rounded-md border bg-background px-2 py-1 text-sm"
              data-testid="input-sync-time"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => dryRunMutation.mutate()}
            disabled={!hasCredentials || running || dryRunMutation.isPending}
            data-testid="button-sync-preview"
          >
            <Eye className="w-4 h-4 mr-2" />
            {t("supplierErp", "syncPreviewBtn")}
          </Button>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={!hasCredentials || running}
            data-testid="button-sync-now"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${running ? "animate-spin" : ""}`} />
            {running ? t("supplierErp", "syncRunning") : t("supplierErp", "syncNow")}
          </Button>
        </div>
      </CardContent>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-sync-preview">
          <DialogHeader>
            <DialogTitle>{t("supplierErp", "syncPreviewTitle")}</DialogTitle>
            <DialogDescription>{t("supplierErp", "syncPreviewDesc")}</DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-2">
                  <div className="text-lg font-bold text-green-700 dark:text-green-400" data-testid="preview-created">{preview.created}</div>
                  <div className="text-[11px] text-muted-foreground">{t("supplierErp", "syncCreated")}</div>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-2">
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-400" data-testid="preview-updated">{preview.updated}</div>
                  <div className="text-[11px] text-muted-foreground">{t("supplierErp", "syncUpdated")}</div>
                </div>
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-2">
                  <div className="text-lg font-bold text-red-700 dark:text-red-400" data-testid="preview-deactivated">{preview.deactivated}</div>
                  <div className="text-[11px] text-muted-foreground">{t("supplierErp", "syncDeactivated")}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{t("supplierErp", "syncPriceChanges")}: <b className="text-foreground">{preview.priceChanges}</b></span>
                <span>{t("supplierErp", "syncStockChanges")}: <b className="text-foreground">{preview.stockChanges}</b></span>
                <span>{t("supplierErp", "syncUnchanged")}: <b className="text-foreground">{preview.unchanged}</b></span>
              </div>

              {preview.preview.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("supplierErp", "syncNoChanges")}</p>
              ) : (
                <div className="space-y-1.5">
                  {preview.preview.map((item, i) => {
                    const meta = actionMeta(item.action);
                    return (
                      <div key={i} className="flex items-center gap-2 rounded-md border p-2 text-sm" data-testid={`preview-item-${i}`}>
                        {meta.icon}
                        <span className="font-medium truncate flex-1">{item.name}</span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{meta.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} data-testid="button-sync-cancel">
              {t("supplierErp", "syncCancel")}
            </Button>
            <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} data-testid="button-sync-confirm">
              <RefreshCw className={`w-4 h-4 mr-2 ${runMutation.isPending ? "animate-spin" : ""}`} />
              {t("supplierErp", "syncConfirmApply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
