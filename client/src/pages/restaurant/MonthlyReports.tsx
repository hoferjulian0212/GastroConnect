import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowDownRight, ArrowUpRight, Download, FileText, Loader2, TrendingUp,
  Plus, ChevronRight, Printer, Mail, BarChart3, Tags, Truck, ArrowRight, PiggyBank, Sparkles,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import type { MonthlyReport, MonthlyReportPayload } from "@shared/schema";

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function shortMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("de-DE", { month: "short" });
}

function fmtEuro(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtEuroShort(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k €` : `${Math.round(n)} €`;
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

type ToastFn = (props: { title: string; description?: string }) => void;

function buildReportMail(report: MonthlyReport, payload: MonthlyReportPayload) {
  const monthLabel = formatMonthLabel(report.month);
  const subject = `Monatsbericht ${monthLabel} – ${payload.restaurantName}`;
  const body = [
    `Anbei der Monatsbericht für ${monthLabel}.`,
    "",
    `Gesamtausgaben: ${fmtEuro(payload.totalSpent)}`,
    `Bestellungen: ${payload.orderCount}`,
    `Einsparpotenzial: ${fmtEuro(payload.totalSavingPotential)}`,
    "",
    "Erstellt mit GastroConnect.",
  ].join("\n");
  return { subject, body };
}

// Share the report PDF via the native share sheet (mobile / supported browsers),
// falling back to a prefilled mailto draft. Used by both the list quick actions
// and the detail dialog toolbar.
async function shareOrMailReport(report: MonthlyReport, toast: ToastFn): Promise<void> {
  const payload = report.payload as MonthlyReportPayload | undefined;
  if (!payload) return;
  const { subject, body } = buildReportMail(report, payload);

  if (report.fileUrl && typeof navigator !== "undefined" && (navigator as any).canShare) {
    try {
      const res = await fetch(`/api/restaurant/monthly-reports/${report.id}/download?inline=1`);
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], `Monatsbericht_${report.month}.pdf`, { type: "application/pdf" });
        if ((navigator as any).canShare({ files: [file] })) {
          await (navigator as any).share({ files: [file], title: subject, text: body });
          return;
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      // fall through to mailto
    }
  }

  // Fallback: mailto cannot attach files, so trigger the PDF download and tell
  // the user to attach it to the draft.
  if (report.fileUrl) {
    window.open(`/api/restaurant/monthly-reports/${report.id}/download`, "_blank");
    toast({
      title: "PDF heruntergeladen",
      description: "Dein E-Mail-Entwurf wird geöffnet. Bitte hänge die soeben heruntergeladene PDF manuell an.",
    });
  }
  const mailtoBody = report.fileUrl
    ? body + "\n\n(Bitte die heruntergeladene PDF an diese E-Mail anhängen.)"
    : body;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailtoBody)}`;
}

export default function RestaurantMonthlyReports() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const restaurantId = currentUser?.id;
  const [selectedMonth, setSelectedMonth] = useState<string>(lastNMonths(1)[0]);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [emailingIds, setEmailingIds] = useState<Set<string>>(new Set());
  const [printTarget, setPrintTarget] = useState<MonthlyReport | null>(null);

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

  // Hero KPIs aggregated across all reports.
  const kpis = useMemo(() => {
    const totalSaving = reports.reduce((s, r) => s + Number(r.savingsPotential), 0);
    const sorted = [...reports].sort((a, b) => b.month.localeCompare(a.month));
    const latest = sorted[0];
    const latestSpent = latest ? Number(latest.totalSpent) : 0;
    const latestPrev = latest ? Number(latest.prevMonthTotal) : 0;
    const latestTrend = latestPrev > 0 ? ((latestSpent - latestPrev) / latestPrev) * 100 : 0;
    return { count: reports.length, totalSaving, latest, latestSpent, latestTrend };
  }, [reports]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/restaurant/monthly-reports", restaurantId] });
  };

  // Print a report straight from the list: mount its print-only portal, wait for
  // it to paint (double rAF), call print(), then tear down on `afterprint` (with
  // a long fallback) so the layout stays mounted until the browser is done.
  useEffect(() => {
    if (!printTarget) return;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let raf2 = 0;
    const cleanup = () => {
      window.removeEventListener("afterprint", cleanup);
      if (fallback) clearTimeout(fallback);
      setPrintTarget(null);
    };
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.addEventListener("afterprint", cleanup);
        window.print();
        fallback = setTimeout(cleanup, 60000);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("afterprint", cleanup);
      if (fallback) clearTimeout(fallback);
    };
  }, [printTarget]);

  const handleQuickEmail = async (r: MonthlyReport) => {
    setEmailingIds(prev => new Set(prev).add(r.id));
    try {
      await shareOrMailReport(r, toast);
    } finally {
      setEmailingIds(prev => {
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      });
    }
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
                className="text-white/80 hover:text-white hover:bg-white/10 h-8 px-3 shrink-0"
                data-testid="button-back-documents"
              >
                ← Dokumente
              </Button>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-2 md:gap-3 mb-3 md:mb-4">
              <HeroKpi
                icon={<FileText className="h-3.5 w-3.5" />}
                label="Berichte"
                value={String(kpis.count)}
                hint={kpis.latest ? `zuletzt ${formatMonthLabel(kpis.latest.month)}` : "noch keiner"}
                testId="kpi-report-count"
              />
              <HeroKpi
                icon={<PiggyBank className="h-3.5 w-3.5" />}
                label="Einsparpotenzial"
                value={fmtEuro(kpis.totalSaving)}
                hint="über alle Berichte"
                valueClass="text-green-400"
                testId="kpi-total-saving"
              />
              <HeroKpi
                icon={kpis.latestTrend > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                label="Letzte Ausgaben"
                value={kpis.latest ? fmtEuro(kpis.latestSpent) : "—"}
                hint={kpis.latest && Number(kpis.latest.prevMonthTotal) > 0
                  ? `${kpis.latestTrend > 0 ? "+" : ""}${kpis.latestTrend.toFixed(1)}% ggü. Vormonat`
                  : "—"}
                hintClass={kpis.latestTrend > 0 ? "text-red-400" : kpis.latestTrend < 0 ? "text-green-400" : ""}
                testId="kpi-latest-spend"
              />
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
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        disabled={!r.fileUrl}
                        title={r.fileUrl ? "Als PDF herunterladen" : "PDF nicht verfügbar"}
                        onClick={() => window.open(`/api/restaurant/monthly-reports/${r.id}/download`, "_blank")}
                        data-testid={`button-quick-download-${r.month}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        disabled={!r.fileUrl || emailingIds.has(r.id)}
                        title={r.fileUrl ? "Per E-Mail senden" : "PDF nicht verfügbar"}
                        onClick={() => handleQuickEmail(r)}
                        data-testid={`button-quick-email-${r.month}`}
                      >
                        {emailingIds.has(r.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        disabled={!r.payload}
                        title="Drucken"
                        onClick={() => setPrintTarget(r)}
                        data-testid={`button-quick-print-${r.month}`}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <ReportDetailDialog reportId={openReportId} reports={reports} onClose={() => setOpenReportId(null)} />

        {/* Print-only layout for the list quick-print action (hidden on screen). */}
        {printTarget && printTarget.payload && createPortal(
          <ReportPrintView report={printTarget} payload={printTarget.payload as MonthlyReportPayload} />,
          document.body,
        )}
      </div>
    </PullToRefreshWrapper>
  );
}

function HeroKpi({ icon, label, value, hint, valueClass, hintClass, testId }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; valueClass?: string; hintClass?: string; testId?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-2.5 md:p-3.5" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-white/60">
        {icon}
        <span className="text-[10px] md:text-xs font-medium uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className={`text-sm md:text-xl font-bold text-white mt-1 truncate ${valueClass || ""}`}>{value}</p>
      {hint && <p className={`text-[10px] md:text-xs mt-0.5 text-white/50 truncate ${hintClass || ""}`}>{hint}</p>}
    </div>
  );
}

function ReportDetailDialog({ reportId, reports, onClose }: { reportId: string | null; reports: MonthlyReport[]; onClose: () => void }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [sharing, setSharing] = useState(false);

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

  // Spend trend across recent months (from the reports list), ascending, last 6.
  const trend = useMemo(() => {
    const sorted = [...reports].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
    const max = Math.max(...sorted.map(r => Number(r.totalSpent)), 1);
    return { points: sorted, max };
  }, [reports]);

  // Category & supplier breakdown from payload.productRows.
  const breakdowns = useMemo(() => {
    const cat = new Map<string, number>();
    const sup = new Map<string, number>();
    for (const r of payload?.productRows ?? []) {
      const c = r.category?.trim() || "Ohne Kategorie";
      cat.set(c, (cat.get(c) ?? 0) + r.totalSpent);
      sup.set(r.currentSupplierName, (sup.get(r.currentSupplierName) ?? 0) + r.totalSpent);
    }
    const toSorted = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const catRows = toSorted(cat);
    const supRows = toSorted(sup);
    return {
      catRows, supRows,
      catMax: Math.max(...catRows.map(r => r[1]), 1),
      supMax: Math.max(...supRows.map(r => r[1]), 1),
    };
  }, [payload]);

  const navigate = (href: string) => { onClose(); setLocation(href); };

  const handleDownload = () => {
    if (!report) return;
    window.open(`/api/restaurant/monthly-reports/${report.id}/download`, "_blank");
  };

  const handlePrint = () => { window.print(); };

  const handleEmail = async () => {
    if (!report || !payload) return;
    setSharing(true);
    try {
      await shareOrMailReport(report, toast);
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <Dialog open={!!reportId} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-report-detail">
          <DialogHeader>
            <DialogTitle>{report ? formatMonthLabel(report.month) : "Bericht"}</DialogTitle>
          </DialogHeader>

          {/* Export toolbar */}
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <Button
              size="sm"
              onClick={handleDownload}
              disabled={!report?.fileUrl}
              title={!report?.fileUrl ? "PDF nicht verfügbar — bitte Bericht neu erstellen." : undefined}
              data-testid="button-download-pdf"
            >
              <Download className="h-4 w-4 mr-1.5" />Als PDF herunterladen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              disabled={!payload}
              data-testid="button-print-report"
            >
              <Printer className="h-4 w-4 mr-1.5" />Drucken
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleEmail}
              disabled={!payload || !report?.fileUrl || sharing}
              title={!report?.fileUrl ? "PDF nicht verfügbar — bitte Bericht neu erstellen." : undefined}
              data-testid="button-email-report"
            >
              {sharing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
              Per E-Mail senden
            </Button>
          </div>
          {!report?.fileUrl && !isLoading && (
            <p className="text-xs text-muted-foreground">PDF nicht verfügbar — bitte Bericht neu erstellen, um Download & E-Mail zu aktivieren.</p>
          )}

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

              {/* Spend trend */}
              {trend.points.length > 1 && (
                <section>
                  <h3 className="font-semibold mb-2 text-sm flex items-center gap-1.5">
                    <BarChart3 className="h-4 w-4 text-primary" />Ausgaben-Trend
                  </h3>
                  <div className="rounded-2xl border bg-muted/20 p-4">
                    <div className="flex items-end gap-2 h-28" data-testid="chart-spend-trend">
                      {trend.points.map((p) => {
                        const v = Number(p.totalSpent);
                        const isCurrent = report && p.month === report.month;
                        return (
                          <div key={p.id} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                            <span className="text-[9px] md:text-[10px] text-muted-foreground font-medium">{fmtEuroShort(v)}</span>
                            <div
                              className={`w-full rounded-t-md min-h-[3px] ${isCurrent ? "bg-primary" : "bg-primary/35"}`}
                              style={{ height: `${Math.max((v / trend.max) * 80, 3)}px` }}
                              data-testid={`bar-trend-${p.month}`}
                            />
                            <span className={`text-[9px] md:text-[10px] truncate w-full text-center ${isCurrent ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                              {shortMonthLabel(p.month)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {/* Breakdowns */}
              {(breakdowns.catRows.length > 0 || breakdowns.supRows.length > 0) && (
                <div className="grid md:grid-cols-2 gap-4">
                  <BreakdownCard
                    title="Nach Kategorie"
                    icon={<Tags className="h-4 w-4 text-primary" />}
                    rows={breakdowns.catRows}
                    max={breakdowns.catMax}
                    testIdPrefix="category"
                  />
                  <BreakdownCard
                    title="Nach Lieferant"
                    icon={<Truck className="h-4 w-4 text-primary" />}
                    rows={breakdowns.supRows}
                    max={breakdowns.supMax}
                    testIdPrefix="supplier"
                  />
                </div>
              )}

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

              {/* Switches — actionable */}
              <section>
                <h3 className="font-semibold mb-2 text-sm">Empfohlene Lieferantenwechsel</h3>
                {payload.recommendedSwitches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Du bestellst bereits beim günstigsten Anbieter.</p>
                ) : (
                  <div className="space-y-2">
                    {payload.recommendedSwitches.map((sw, i) => (
                      <div key={i} className="rounded-2xl border border-green-200 dark:border-green-900/40 bg-green-50/50 dark:bg-green-900/10 p-3" data-testid={`row-switch-${i}`}>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="text-sm font-semibold flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{sw.fromSupplierName}</span>
                            <ArrowRight className="inline h-3.5 w-3.5 shrink-0 text-green-600" />
                            <span className="truncate">{sw.toSupplierName}</span>
                          </div>
                          <Badge className="bg-green-600 hover:bg-green-600 shrink-0">Spare {fmtEuro(sw.expectedMonthlySaving)}/Mo</Badge>
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-0.5 mb-3">
                          {sw.products.slice(0, 5).map((p, j) => (
                            <li key={j} className="flex justify-between gap-2">
                              <span className="truncate">• {p.name} ({p.unit})</span>
                              <span className="text-green-700 dark:text-green-400 font-medium">+{fmtEuro(p.saving)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => navigate(`/restaurant/catalog?supplier=${sw.toSupplierId}`)}
                            data-testid={`button-switch-catalog-${i}`}
                          >
                            Zum Katalog<ChevronRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            onClick={() => navigate(`/restaurant/price-comparison`)}
                            data-testid={`button-switch-compare-${i}`}
                          >
                            Preisvergleich
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Missed promotions — actionable */}
              <section>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-sm">Verpasste Aktionen</h3>
                  {payload.missedPromotions.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => navigate(`/restaurant/catalog?promotions=true`)}
                      data-testid="button-view-promotions"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />Aktuelle Aktionen
                    </Button>
                  )}
                </div>
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

      {/* Print-only layout (hidden on screen, shown via @media print) */}
      {reportId && payload && report && createPortal(
        <ReportPrintView report={report} payload={payload} />,
        document.body,
      )}
    </>
  );
}

function BreakdownCard({ title, icon, rows, max, testIdPrefix }: {
  title: string; icon: React.ReactNode; rows: Array<[string, number]>; max: number; testIdPrefix: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border bg-muted/20 p-4">
      <h3 className="font-semibold mb-3 text-sm flex items-center gap-1.5">{icon}{title}</h3>
      <div className="space-y-2.5">
        {rows.map(([label, value], i) => (
          <div key={i} data-testid={`breakdown-${testIdPrefix}-${i}`}>
            <div className="flex items-center justify-between gap-2 text-xs mb-1">
              <span className="truncate text-foreground">{label}</span>
              <span className="font-semibold shrink-0">{fmtEuro(value)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((value / max) * 100, 3)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportPrintView({ report, payload }: { report: MonthlyReport; payload: MonthlyReportPayload }) {
  const savingsRows = payload.productRows.filter(r => r.potentialSaving > 0);
  return (
    <div className="print-report" data-testid="print-report">
      <div style={{ borderBottom: "2px solid #161921", paddingBottom: 10, marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Monatlicher Vergleichsbericht</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13 }}>{formatMonthLabel(report.month)} · {payload.restaurantName}</p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#666" }}>
          Erstellt am {new Date(payload.generatedAt).toLocaleDateString("de-DE")}
        </p>
      </div>

      <table style={{ width: "100%", marginBottom: 18, borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ width: "33%" }}>
              <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase" }}>Gesamtausgaben</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtEuro(payload.totalSpent)}</div>
              <div style={{ fontSize: 10, color: "#666" }}>{payload.orderCount} Bestellungen</div>
            </td>
            <td style={{ width: "33%" }}>
              <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase" }}>Vormonat</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtEuro(payload.prevMonthTotal)}</div>
              <div style={{ fontSize: 10, color: payload.trendPercent > 0 ? "#dc2626" : "#16a34a" }}>
                {payload.trendPercent > 0 ? "+" : ""}{payload.trendPercent}%
              </div>
            </td>
            <td style={{ width: "33%" }}>
              <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase" }}>Einsparpotenzial</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#16a34a" }}>{fmtEuro(payload.totalSavingPotential)}</div>
              <div style={{ fontSize: 10, color: "#666" }}>bei optimalen Lieferanten</div>
            </td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Top 5 Produkte</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 18, fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
            <th style={{ padding: "4px 0" }}>Produkt</th>
            <th style={{ padding: "4px 0" }}>Lieferant</th>
            <th style={{ padding: "4px 0", textAlign: "right" }}>Menge</th>
            <th style={{ padding: "4px 0", textAlign: "right" }}>Ausgabe</th>
          </tr>
        </thead>
        <tbody>
          {payload.topProducts.map((p, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "4px 0" }}>{p.name}</td>
              <td style={{ padding: "4px 0" }}>{p.supplierName}</td>
              <td style={{ padding: "4px 0", textAlign: "right" }}>{p.totalQuantity} {p.unit}</td>
              <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 700 }}>{fmtEuro(p.totalSpent)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {savingsRows.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Ersparnis-Potenzial pro Produkt</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                <th style={{ padding: "4px 0" }}>Produkt</th>
                <th style={{ padding: "4px 0" }}>Aktuell</th>
                <th style={{ padding: "4px 0" }}>Günstigster</th>
                <th style={{ padding: "4px 0", textAlign: "right" }}>Du sparst</th>
              </tr>
            </thead>
            <tbody>
              {savingsRows.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "4px 0" }}>{r.name} ({r.unit})</td>
                  <td style={{ padding: "4px 0" }}>{r.currentSupplierName} · {fmtEuro(r.currentUnitPrice)}</td>
                  <td style={{ padding: "4px 0" }}>{r.cheapestSupplierName ?? "—"} · {r.cheapestUnitPrice !== null ? fmtEuro(r.cheapestUnitPrice) : "—"}</td>
                  <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>{fmtEuro(r.potentialSaving)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
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
