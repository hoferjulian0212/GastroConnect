import { useState } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { SectionTabs } from "@/components/SectionTabs";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { can } from "@shared/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, AlertTriangle, Loader2 } from "lucide-react";
import { InventoryRiskCard } from "@/components/InventoryRiskCard";
import { InventoryRiskFormDialog } from "@/components/InventoryRiskFormDialog";
import { INVENTORY_RISK_STATUSES, INVENTORY_RISK_QUALITY } from "@shared/schema";
import type { Product, InventoryRiskRecordWithDetails } from "@shared/schema";

export default function SupplierInventoryRisk() {
  const { currentUser, currentMember } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();

  const canCreate = !currentMember || can(currentMember.role, "inventory_risk.create");
  const canManage = !currentMember || can(currentMember.role, "inventory_risk.manage");

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [qualityFilter, setQualityFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<InventoryRiskRecordWithDetails | null>(null);
  const [actionRecord, setActionRecord] = useState<InventoryRiskRecordWithDetails | null>(null);

  const qs = new URLSearchParams();
  if (statusFilter !== "all") qs.set("status", statusFilter);
  if (qualityFilter !== "all") qs.set("qualityStatus", qualityFilter);
  const query = qs.toString();

  const { data: records, isLoading } = useQuery<InventoryRiskRecordWithDetails[]>({
    queryKey: query ? ["/api/inventory-risks", query] : ["/api/inventory-risks"],
    queryFn: async () => {
      const r = await fetch(`/api/inventory-risks${query ? `?${query}` : ""}`);
      if (!r.ok) throw new Error("fail");
      return r.json();
    },
    enabled: !!currentUser?.id && canCreate,
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const openForm = (record?: InventoryRiskRecordWithDetails) => {
    setEditRecord(record ?? null);
    setFormOpen(true);
  };

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/inventory-risks"] });

  return (
    <PullToRefreshWrapper onRefresh={async () => { await refresh(); }}>
      <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
        <HeroPortal>
          <div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-4" data-testid="inventory-risk-hero">
            <SectionTabs />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold text-white truncate" data-testid="text-page-title">
                  {t("inventoryRisk", "title")}
                </h1>
                <p className="text-sm text-white/60 hidden md:block">{t("inventoryRisk", "subtitle")}</p>
              </div>
              {canCreate && (
                <Button onClick={() => openForm()} className="shrink-0" data-testid="button-report-risk">
                  <Plus className="h-4 w-4 mr-1.5" />
                  {t("inventoryRisk", "reportRisk")}
                </Button>
              )}
            </div>
          </div>
        </HeroPortal>

        <div className="space-y-4 px-3 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-auto min-w-[140px]" data-testid="select-filter-status">
                <SelectValue placeholder={t("inventoryRisk", "filterStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("inventoryRisk", "allStatuses")}</SelectItem>
                {INVENTORY_RISK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{t("inventoryRisk", `status_${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={qualityFilter} onValueChange={setQualityFilter}>
              <SelectTrigger className="w-auto min-w-[140px]" data-testid="select-filter-quality">
                <SelectValue placeholder={t("inventoryRisk", "filterQuality")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("inventoryRisk", "allQualities")}</SelectItem>
                {INVENTORY_RISK_QUALITY.map((q) => (
                  <SelectItem key={q} value={q}>{t("inventoryRisk", `quality_${q}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
            </div>
          ) : !records || records.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 md:p-14">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                  <AlertTriangle className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="font-semibold" data-testid="text-no-risks">{t("inventoryRisk", "noRisks")}</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">{t("inventoryRisk", "noRisksDesc")}</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2" data-testid="list-inventory-risks">
              {records.map((record) => {
                const canEditThis =
                  canManage ||
                  (currentMember ? record.createdBy === currentMember.id : true);
                return (
                  <InventoryRiskCard
                    key={record.id}
                    record={record}
                    canManage={canManage}
                    canEdit={canEditThis}
                    onCreatePromotion={setActionRecord}
                    onEdit={openForm}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <InventoryRiskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        products={products ?? []}
        record={editRecord}
      />

      <CreatePromotionDialog
        record={actionRecord}
        onOpenChange={(open) => { if (!open) setActionRecord(null); }}
        onSuccess={() => { setActionRecord(null); refresh(); }}
      />
    </PullToRefreshWrapper>
  );
}

function CreatePromotionDialog({
  record,
  onOpenChange,
  onSuccess,
}: {
  record: InventoryRiskRecordWithDetails | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();

  const [discountPercent, setDiscountPercent] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!record) throw new Error("no record");
      return apiRequest("POST", `/api/inventory-risks/${record.id}/action`, {
        discountPercent: Number(discountPercent),
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      toast({ title: t("inventoryRisk", "actionSuccess") });
      setDiscountPercent("");
      setStartDate("");
      setEndDate("");
      onSuccess();
    },
    onError: () => toast({ title: t("inventoryRisk", "actionError"), variant: "destructive" }),
  });

  const canSubmit = Number(discountPercent) > 0 && Number(discountPercent) <= 100 && !!startDate && !!endDate;

  return (
    <Dialog open={!!record} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-create-promotion">
        <DialogHeader>
          <DialogTitle>{t("inventoryRisk", "createPromotion")}</DialogTitle>
          <DialogDescription>{record?.product?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("inventoryRisk", "discount")}</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              data-testid="input-promo-discount"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("inventoryRisk", "startDate")}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-promo-start" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("inventoryRisk", "endDate")}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-promo-end" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-promo">
            {t("common", "cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending} data-testid="button-confirm-promo">
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("inventoryRisk", "createPromotion")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
