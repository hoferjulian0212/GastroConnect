import { Link } from "wouter";
import { ProductImage } from "@/components/ProductImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { format } from "date-fns";
import { de, it } from "date-fns/locale";
import { Tag, Pencil, CalendarClock, User as UserIcon, MoreHorizontal, Percent } from "lucide-react";
import type { InventoryRiskRecordWithDetails } from "@shared/schema";

const QUALITY_COLORS: Record<string, string> = {
  Premium: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
  OK: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 border-sky-200 dark:border-sky-500/30",
  Risk: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  Bad: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300 border-red-200 dark:border-red-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "Action Taken": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Sold: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  Expired: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  Dismissed: "bg-muted text-muted-foreground",
};

interface Props {
  record: InventoryRiskRecordWithDetails;
  canManage: boolean;
  canEdit: boolean;
  onCreatePromotion: (record: InventoryRiskRecordWithDetails) => void;
  onEdit: (record: InventoryRiskRecordWithDetails) => void;
  onStatusChange?: (status: string) => void;
  statusChanging?: boolean;
}

export function InventoryRiskCard({ record, canManage, canEdit, onCreatePromotion, onEdit, onStatusChange, statusChanging }: Props) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const locale = lang === "de" ? de : it;
  const canTransition = canManage && record.status === "Action Taken" && !!onStatusChange;

  return (
    <div
      className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-3"
      data-testid={`card-inventory-risk-${record.id}`}
    >
      <div className="flex items-start gap-3">
        <ProductImage
          src={record.photoUrl || record.product?.imageUrl}
          className="h-14 w-14 rounded-xl"
          testId={`img-risk-${record.id}`}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight truncate" data-testid={`text-risk-product-${record.id}`}>
            {record.product?.name ?? "—"}
          </p>
          <p className="text-sm text-muted-foreground">
            {record.flaggedQuantity} {record.product?.unit ?? ""}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Badge variant="outline" className={`text-[11px] ${QUALITY_COLORS[record.qualityStatus] ?? ""}`} data-testid={`badge-risk-quality-${record.id}`}>
              {t("inventoryRisk", `quality_${record.qualityStatus}` as any)}
            </Badge>
            {record.riskReason && (
              <Badge variant="outline" className="text-[11px]" data-testid={`badge-risk-reason-${record.id}`}>
                {t("inventoryRisk", `reason_${record.riskReason}` as any)}
              </Badge>
            )}
            <Badge variant="secondary" className={`text-[11px] ${STATUS_COLORS[record.status] ?? ""}`} data-testid={`badge-risk-status-${record.id}`}>
              {t("inventoryRisk", `status_${record.status}` as any)}
            </Badge>
          </div>
        </div>
      </div>

      {(record.expiryDate || record.creator?.name) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {record.expiryDate && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {format(new Date(record.expiryDate), "dd.MM.yyyy", { locale })}
            </span>
          )}
          {record.creator?.name && (
            <span className="inline-flex items-center gap-1" data-testid={`text-risk-creator-${record.id}`}>
              <UserIcon className="h-3.5 w-3.5" />
              {record.creator.name}
            </span>
          )}
        </div>
      )}

      {record.note && (
        <p className="text-sm text-foreground/80 bg-muted/40 rounded-lg px-3 py-2" data-testid={`text-risk-note-${record.id}`}>
          {record.note}
        </p>
      )}

      {record.linkedPromotion && (
        <Link
          href="/supplier/promotions"
          className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition-colors"
          data-testid={`link-promotion-${record.id}`}
        >
          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
            <Percent className="h-3.5 w-3.5" />
            {record.linkedPromotion.discountPercent}% · {t("inventoryRisk", "viewPromotion")}
          </span>
        </Link>
      )}

      {(canEdit || (canManage && record.status === "Open") || canTransition) && (
        <div className="flex items-center gap-2 pt-1">
          {canManage && record.status === "Open" && (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onCreatePromotion(record)}
              data-testid={`button-create-promotion-${record.id}`}
            >
              <Tag className="h-4 w-4 mr-1.5" />
              {t("inventoryRisk", "createPromotion")}
            </Button>
          )}
          {canTransition && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={statusChanging}
                  data-testid={`button-change-status-${record.id}`}
                >
                  <MoreHorizontal className="h-4 w-4 mr-1.5" />
                  {t("inventoryRisk", "changeStatus")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onStatusChange?.("Sold")} data-testid={`menu-mark-sold-${record.id}`}>
                  {t("inventoryRisk", "markSold")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStatusChange?.("Expired")} data-testid={`menu-mark-expired-${record.id}`}>
                  {t("inventoryRisk", "markExpired")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStatusChange?.("Dismissed")} data-testid={`menu-mark-dismissed-${record.id}`}>
                  {t("inventoryRisk", "markDismissed")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onEdit(record)}
              data-testid={`button-edit-risk-${record.id}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
