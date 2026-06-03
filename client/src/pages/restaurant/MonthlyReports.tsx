import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDownRight, ArrowUpRight, Download, FileText, Loader2, TrendingDown, TrendingUp, Plus, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import type { MonthlyReport, MonthlyReportPayload } from "@shared/schema";

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function fmtEuro(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function RestaurantMonthlyReports() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const restaurantId = currentUser?.id;
  const [selectedMonth, setSelectedMonth] = useState<string>(lastNMonths(1)[0]);
  const [openReportId, setOpenReportId] = useState<string | null>(null);

  const { data: reports = [], isLoading } = useQuery<MonthlyReport[]>({
    queryKey: ["/api/restaurant/monthly-reports", restaurantId],
    queryFn: async () => {
      const res = await fetch(`/api/restaurant/monthly-reports?restaurantId=${restaurantId}`);
      if (!res.ok) throw new Error("Failed to load reports");
      return res.json();
    },
    enabled: !!restaurantId,
  });

  // Open via ?reportId=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("reportId");
    if (id) setOpenReportId(id);
  }, [location]);

  const generateMutation = useMutation({
    mutationFn: async (month: string) => {
      const res = await apiRequest("POST", "/api/restaurant/monthly-reports/generate", { restaurantId, month });
      return res.json();
    },
    onSuccess: (created: any) => {
      toast({ title: "Bericht erstellt", description: `Vergleichsbericht für ${formatMonthLabel(created.month)} ist verfügbar.` });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/monthly-reports", restaurantId] });
      if (created?.id) setOpenReportId(created.id);
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err?.message || "Bericht konnte nicht erstellt werden.", variant: "destructive" });
    },
  });

  const existingMonths = useMemo(() => new Set(reports.map(r => r.month)), [reports]);
  const backfillOptions = useMemo(() => lastNMonths(12).filter(m => !existingMonths.has(m)), [existingMonths]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/restaurant/monthly-reports", restaurantId] });
  };

  return (
    <PullToRefreshWrapper onRefresh={handleRefresh}>
      <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
        <HeroPortal>
          <div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-6">
            <div className="flex items-start justify-between gap-3 mb-3 md:mb-4">
              <div>
                <h1 className="text-xl md:text-3xl font-bold text-white" data-testid="text-page-title">Monatsberichte</h1>
                <p className="text-xs md:text-sm text-white/60 mt-1">Vergleich, Einsparpotenzial & verpasste Aktionen</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/restaurant/documents")}
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 px-3"
                data-testid="button-back-documents"
              >
                ← Dokumente
              </Button>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 p-3 md:p-4 rounded-2xl bg-white/[0.06] border border-white/[0.08]">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="h-4 w-4 text-white/70 shrink-0" />
                <span className="text-sm text-white/90">Neuen Bericht erstellen für:</span>
              </div>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white h-9 md:w-56" data-testid="select-backfill-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {backfillOptions.length === 0 ? (
                    <SelectItem value="__none" disabled>Alle 12 Monate vorhanden</SelectItem>
                  ) : (
                    backfillOptions.map(m => (
                      <SelectItem key={m} value={m} data-testid={`option-month-${m}`}>{formatMonthLabel(m)}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={() => generateMutation.mutate(selectedMonth)}
                disabled={generateMutation.isPending || backfillOptions.length === 0 || !backfillOptions.includes(selectedMonth)}
                className="bg-white text-[#161921] hover:bg-white/90 h-9"
                data-testid="button-generate-report"
              >
                {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Erstellen</>}
              </Button>
            </div>
          </div>
        </HeroPortal>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-semibold mb-1">Noch keine Berichte</h3>
              <p className="text-sm text-muted-foreground">
                Wähle oben einen Monat und erstelle deinen ersten Vergleichsbericht. Neue Berichte werden automatisch am 1. des Monats für den Vormonat generiert.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:gap-4">
            {reports.map(r => {
              const total = Number(r.totalSpent);
              const prev = Number(r.prevMonthTotal);
              const savings = Number(r.savingsPotential);
              const trend = prev > 0 ? ((total - prev) / prev) * 100 : 0;
              const TrendIcon = trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : TrendingUp;
              const trendColor = trend > 0 ? "text-red-500" : trend < 0 ? "text-green-600" : "text-muted-foreground";
              return (
                <Card
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setOpenReportId(r.id)}
                  data-testid={`card-report-${r.month}`}
                >
                  <CardContent className="p-4 md:p-5 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base md:text-lg" data-testid={`text-month-${r.month}`}>
                          {formatMonthLabel(r.month)}
                        </h3>
                        {savings > 0 && (
                          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            -{fmtEuro(savings)} möglich
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:text-sm text-muted-foreground mt-1">
                        <span>Ausgabe: <strong className="text-foreground">{fmtEuro(total)}</strong></span>
                        {prev > 0 && (
                          <span className={`flex items-center gap-0.5 ${trendColor}`}>
                            <TrendIcon className="h-3.5 w-3.5" />
                            {trend > 0 ? "+" : ""}{trend.toFixed(1)}% ggü. Vormonat
                          </span>
                        )}
                      </div>
                    </div>
                    {r.fileUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/api/restaurant/monthly-reports/${r.id}/download`, "_blank");
                        }}
                        data-testid={`button-download-${r.month}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <ReportDetailDialog reportId={openReportId} onClose={() => setOpenReportId(null)} />
      </div>
    </PullToRefreshWrapper>
  );
}

function ReportDetailDialog({ reportId, onClose }: { reportId: string | null; onClose: () => void }) {
  const { data: report, isLoading } = useQuery<MonthlyReport>({
    queryKey: ["/api/restaurant/monthly-reports/detail", reportId],
    queryFn: async () => {
      const res = await fetch(`/api/restaurant/monthly-reports/${reportId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!reportId,
  });

  const payload: MonthlyReportPayload | undefined = report?.payload as any;

  return (
    <Dialog open={!!reportId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-report-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>{report ? formatMonthLabel(report.month) : "Bericht"}</span>
            {report?.fileUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/restaurant/monthly-reports/${report.id}/download`, "_blank")}
                data-testid="button-download-pdf"
              >
                <Download className="h-4 w-4 mr-1" />PDF
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !payload ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard label="Ausgaben" value={fmtEuro(payload.totalSpent)} hint={`${payload.orderCount} Bestellungen`} />
              <SummaryCard
                label="Vormonat"
                value={fmtEuro(payload.prevMonthTotal)}
                hint={payload.prevMonthTotal > 0 ? `${payload.trendPercent > 0 ? "+" : ""}${payload.trendPercent}%` : "—"}
                hintClass={payload.trendPercent > 0 ? "text-red-500" : payload.trendPercent < 0 ? "text-green-600" : ""}
              />
              <SummaryCard label="Einsparpotenzial" value={fmtEuro(payload.totalSavingPotential)} hint="bei optimalen Lieferanten" valueClass="text-green-600" />
            </div>

            {/* Top 5 */}
            <section>
              <h3 className="font-semibold mb-2 text-sm">Top 5 Produkte</h3>
              {payload.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Bestellungen in diesem Monat.</p>
              ) : (
                <div className="rounded-2xl border bg-muted/20 divide-y">
                  {payload.topProducts.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 p-3" data-testid={`row-top-product-${i}`}>
                      <span className="font-bold text-muted-foreground text-sm w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.supplierName} · {p.totalQuantity} {p.unit}</p>
                      </div>
                      <span className="text-sm font-semibold">{fmtEuro(p.totalSpent)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Switches */}
            <section>
              <h3 className="font-semibold mb-2 text-sm">Empfohlene Lieferantenwechsel</h3>
              {payload.recommendedSwitches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Du bestellst bereits beim günstigsten Anbieter.</p>
              ) : (
                <div className="space-y-2">
                  {payload.recommendedSwitches.map((sw, i) => (
                    <div key={i} className="rounded-2xl border border-green-200 dark:border-green-900/40 bg-green-50/50 dark:bg-green-900/10 p-3" data-testid={`row-switch-${i}`}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="text-sm font-semibold">
                          {sw.fromSupplierName} <ChevronRight className="inline h-3 w-3" /> {sw.toSupplierName}
                        </div>
                        <Badge className="bg-green-600 hover:bg-green-600">Spare {fmtEuro(sw.expectedMonthlySaving)}/Mo</Badge>
                      </div>
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {sw.products.slice(0, 5).map((p, j) => (
                          <li key={j} className="flex justify-between gap-2">
                            <span className="truncate">• {p.name} ({p.unit})</span>
                            <span className="text-green-700 dark:text-green-400 font-medium">+{fmtEuro(p.saving)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Missed promotions */}
            <section>
              <h3 className="font-semibold mb-2 text-sm">Verpasste Aktionen</h3>
              {payload.missedPromotions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine relevanten Aktionen verpasst.</p>
              ) : (
                <div className="rounded-2xl border bg-muted/20 divide-y">
                  {payload.missedPromotions.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 text-sm" data-testid={`row-missed-promo-${i}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{p.productName} ({p.unit})</p>
                        <p className="text-xs text-muted-foreground truncate">{p.supplierName} · -{p.discountPercent}% · {p.startDate} – {p.endDate}</p>
                      </div>
                      <span className="text-green-700 dark:text-green-400 font-semibold">{fmtEuro(p.estimatedMissedSaving)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Savings table */}
            {payload.productRows.filter(r => r.potentialSaving > 0).length > 0 && (
              <section>
                <h3 className="font-semibold mb-2 text-sm">Alle Ersparnis-Chancen</h3>
                <div className="rounded-2xl border overflow-hidden">
                  <table className="w-full text-xs md:text-sm">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Produkt</th>
                        <th className="px-3 py-2 font-medium">Aktuell</th>
                        <th className="px-3 py-2 font-medium">Günstigster</th>
                        <th className="px-3 py-2 font-medium text-right">Spare</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {payload.productRows.filter(r => r.potentialSaving > 0).map((r, i) => (
                        <tr key={i} data-testid={`row-saving-${i}`}>
                          <td className="px-3 py-2 truncate max-w-[150px]">{r.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.currentSupplierName} · {fmtEuro(r.currentUnitPrice)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.cheapestSupplierName} · {r.cheapestUnitPrice !== null ? fmtEuro(r.cheapestUnitPrice) : "—"}</td>
                          <td className="px-3 py-2 text-right text-green-700 dark:text-green-400 font-semibold">{fmtEuro(r.potentialSaving)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, hint, valueClass, hintClass }: { label: string; value: string; hint?: string; valueClass?: string; hintClass?: string }) {
  return (
    <div className="rounded-2xl bg-muted/30 p-3 md:p-4">
      <p className="text-[10px] md:text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-base md:text-xl font-bold mt-1 ${valueClass || ""}`}>{value}</p>
      {hint && <p className={`text-xs mt-0.5 text-muted-foreground ${hintClass || ""}`}>{hint}</p>}
    </div>
  );
}
