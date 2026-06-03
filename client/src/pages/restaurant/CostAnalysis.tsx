import { useState, useMemo } from "react";
import { Link } from "wouter";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConnectPmsDialog } from "@/components/ConnectPmsDialog";
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  Target,
  Users,
  Euro,
  ChevronLeft,
  ChevronRight,
  Settings,
  CalendarDays,
  Check,
  Building2,
  Link2,
  RefreshCw,
  AlertCircle,
  Clock,
  PencilLine,
} from "lucide-react";
import type { HotelPmsConnection, PmsProvider } from "@shared/schema";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type CostAnalysisData = {
  month: string;
  totalOvernights: number;
  totalCosts: string;
  costPerGuest: string;
  targetCost: string;
  difference: string;
  percentageDeviation: string;
  orderCount: number;
  daysWithData: number;
};

type HistoryEntry = {
  month: string;
  costPerGuest: number;
  totalOvernights: number;
  totalCosts: number;
  targetCost: number;
};

type CostSettingsData = {
  id: string;
  restaurantId: string;
  targetCostPerGuest: string;
} | null;

export default function CostAnalysis() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [showSettings, setShowSettings] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [showPmsDialog, setShowPmsDialog] = useState(false);

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    const monthNames = lang === "de"
      ? ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
      : ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  const navigateMonth = (dir: number) => {
    const [year, month] = currentMonth.split("-").map(Number);
    const d = new Date(year, month - 1 + dir, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const { data: pmsData } = useQuery<{
    connection: (HotelPmsConnection & { provider: PmsProvider | null }) | null;
    importedDays: number;
    lastImport: { date: string; guestCount: number } | null;
  }>({
    queryKey: [`/api/restaurant/pms/connection?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const conn = pmsData?.connection ?? null;
  const status = conn?.status;
  const isActive = status === "active";
  const isPending = status === "pending";
  const isError = status === "error";

  const { data: analysis, isLoading: analysisLoading } = useQuery<CostAnalysisData>({
    queryKey: [`/api/restaurant/cost-analysis?restaurantId=${currentUser?.id}&month=${currentMonth}`],
    enabled: !!currentUser?.id && isActive,
  });

  const { data: settings } = useQuery<CostSettingsData>({
    queryKey: [`/api/restaurant/cost-settings?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id && isActive,
  });

  const { data: history } = useQuery<HistoryEntry[]>({
    queryKey: [`/api/restaurant/cost-analysis/history?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id && isActive,
  });

  const invalidateCostQueries = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && (
          key.startsWith("/api/restaurant/overnight-stays") ||
          key.startsWith("/api/restaurant/cost-analysis") ||
          key.startsWith("/api/restaurant/cost-settings")
        );
      },
    });
  };

  const saveSettingsMutation = useMutation({
    mutationFn: (data: { restaurantId: string; targetCostPerGuest: number }) =>
      apiRequest("POST", "/api/restaurant/cost-settings", data),
    onSuccess: () => {
      invalidateCostQueries();
      setShowSettings(false);
    },
  });

  const handleSaveTarget = () => {
    if (!targetInput || !currentUser?.id) return;
    saveSettingsMutation.mutate({
      restaurantId: currentUser.id,
      targetCostPerGuest: parseFloat(targetInput),
    });
  };

  const costPerGuest = analysis ? parseFloat(analysis.costPerGuest) : 0;
  const target = analysis ? parseFloat(analysis.targetCost) : 0;
  const difference = analysis ? parseFloat(analysis.difference) : 0;
  const deviation = analysis ? parseFloat(analysis.percentageDeviation) : 0;

  const getStatusLabel = () => {
    if (!target || !costPerGuest) return "";
    if (Math.abs(deviation) <= 5) return t("costAnalysis", "onTarget");
    if (difference > 0) return t("costAnalysis", "aboveTarget");
    return t("costAnalysis", "belowTarget");
  };

  const getStatusIcon = () => {
    if (!target || !costPerGuest) return null;
    if (difference > 0) return <TrendingUp className="w-4 h-4" />;
    if (difference < 0) return <TrendingDown className="w-4 h-4" />;
    return <Check className="w-4 h-4" />;
  };

  const chartData = useMemo(() => {
    if (!history) return [];
    return history.map(h => ({
      name: formatMonth(h.month),
      costPerGuest: h.costPerGuest,
      target: h.targetCost,
    }));
  }, [history, lang]);

  const providerName = conn?.provider?.name;

  const manualEntryLink = (
    <Link href="/restaurant/cost-analysis/manual">
      <button
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        data-testid="link-manual-entry"
      >
        <PencilLine className="w-3.5 h-3.5" />
        {t("costAnalysis", "enterDataManually")}
      </button>
    </Link>
  );

  return (
    <div>
      <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-6">
        <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-4" data-testid="cost-analysis-hero">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="cost-analysis-title">
                {t("costAnalysis", "title")}
              </h1>
            </div>
            {isActive && (
              <Button
                size="sm"
                className="hidden md:inline-flex rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15"
                onClick={() => {
                  setShowSettings(!showSettings);
                  if (!showSettings && settings) {
                    setTargetInput(settings.targetCostPerGuest || "");
                  }
                }}
                data-testid="button-settings"
              >
                <Settings className="w-4 h-4 mr-1" />
                {t("costAnalysis", "settings")}
              </Button>
            )}
          </div>

          {isActive && showSettings && (
            <div className="rounded-xl border border-white/10 bg-white/[0.07] p-4" data-testid="settings-card">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="text-sm font-medium text-white/70">{t("costAnalysis", "targetPerGuest")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={targetInput}
                    onChange={e => setTargetInput(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 bg-white/10 border-white/20 text-white placeholder:text-white/30"
                    data-testid="input-target-cost"
                  />
                </div>
                <Button
                  onClick={handleSaveTarget}
                  disabled={saveSettingsMutation.isPending}
                  size="sm"
                  className="rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15"
                  data-testid="button-save-target"
                >
                  {t("costAnalysis", "save")}
                </Button>
              </div>
            </div>
          )}

          {isActive && (
            <div className="flex items-center justify-center gap-4">
              <button className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors" onClick={() => navigateMonth(-1)} data-testid="button-prev-month">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-lg font-semibold min-w-[120px] text-center text-white" data-testid="text-current-month">
                {formatMonth(currentMonth)}
              </span>
              <button className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors" onClick={() => navigateMonth(1)} data-testid="button-next-month">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {isActive && (analysisLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.07] p-4">
                  <div className="h-16 animate-pulse bg-white/10 rounded" />
                </div>
              ))}
            </div>
          ) : analysis && analysis.totalOvernights > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.07] p-4" data-testid="card-cost-per-guest">
                <div className="flex items-center gap-2 text-sm text-white/50 mb-1">
                  <Calculator className="w-4 h-4" />
                  {t("costAnalysis", "costPerGuest")}
                </div>
                <div className="text-2xl font-bold text-white">{Number(analysis.costPerGuest).toFixed(2)} EUR</div>
                {target > 0 && (
                  <div className={`flex items-center gap-1 text-xs mt-1 ${difference > 0 ? "text-red-400" : difference < 0 ? "text-green-400" : "text-white/40"}`}>
                    {getStatusIcon()}
                    {getStatusLabel()} ({deviation > 0 ? "+" : ""}{deviation.toFixed(1)}%)
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.07] p-4" data-testid="card-target">
                <div className="flex items-center gap-2 text-sm text-white/50 mb-1">
                  <Target className="w-4 h-4" />
                  {t("costAnalysis", "targetCost")}
                </div>
                <div className="text-2xl font-bold text-white">{target > 0 ? `${target.toFixed(2)} EUR` : "--"}</div>
                {target > 0 && (
                  <div className={`text-xs mt-1 ${difference > 0 ? "text-red-400" : difference < 0 ? "text-green-400" : "text-white/40"}`}>
                    {difference > 0 ? "+" : ""}{difference.toFixed(2)} EUR
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.07] p-4" data-testid="card-total-costs">
                <div className="flex items-center gap-2 text-sm text-white/50 mb-1">
                  <Euro className="w-4 h-4" />
                  {t("costAnalysis", "totalCosts")}
                </div>
                <div className="text-2xl font-bold text-white">{Number(analysis.totalCosts).toFixed(2)}</div>
                <div className="text-xs text-white/40 mt-1">
                  {analysis.orderCount} {t("costAnalysis", "orderCount")}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.07] p-4" data-testid="card-overnights">
                <div className="flex items-center gap-2 text-sm text-white/50 mb-1">
                  <Users className="w-4 h-4" />
                  {t("costAnalysis", "totalOvernights")}
                </div>
                <div className="text-2xl font-bold text-white">{analysis.totalOvernights}</div>
                <div className="text-xs text-white/40 mt-1">
                  {analysis.daysWithData} {t("costAnalysis", "daysRecorded")}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.07] p-8 text-center" data-testid="card-no-data">
              <Users className="w-12 h-12 mx-auto text-white/30 mb-3" />
              <h3 className="font-semibold text-lg text-white">{t("costAnalysis", "noData")}</h3>
              <p className="text-white/50 text-sm mt-1">{t("costAnalysis", "noDataDesc")}</p>
            </div>
          ))}
        </div></HeroPortal>

        <div className="px-4 md:px-6 space-y-4 md:space-y-6">

        {!isActive && (
          <Card data-testid="card-connect-pms-cta">
            <CardContent className="flex flex-col items-center text-center py-10 px-6">
              <div className={`flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
                isError
                  ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                  : isPending
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
                  : "bg-primary/10 text-primary"
              }`}>
                {isError ? <AlertCircle className="w-8 h-8" /> : isPending ? <Clock className="w-8 h-8" /> : <Building2 className="w-8 h-8" />}
              </div>

              <h2 className="text-xl md:text-2xl font-bold" data-testid="text-cta-headline">
                {isError
                  ? t("costAnalysis", "pmsErrorHeadline")
                  : isPending
                  ? t("costAnalysis", "pmsPendingHeadline")
                  : t("costAnalysis", "pmsFirstHeadline")}
              </h2>

              <p className="text-muted-foreground text-sm md:text-base mt-2 max-w-xl" data-testid="text-cta-desc">
                {isError
                  ? t("costAnalysis", "pmsErrorHeadlineDesc")
                  : isPending
                  ? t("costAnalysis", "pmsPendingHeadlineDesc")
                  : t("costAnalysis", "pmsFirstDesc")}
              </p>

              {conn && (providerName || conn.lastSyncAt) && (
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm mt-4">
                  {providerName && (
                    <span className="flex items-center gap-1.5 font-medium" data-testid="text-pms-provider">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      {providerName}
                    </span>
                  )}
                  {conn.lastSyncAt && (
                    <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="text-pms-last-sync">
                      <RefreshCw className="w-3.5 h-3.5" />
                      {t("costAnalysis", "lastSync")}: {new Date(conn.lastSyncAt).toLocaleDateString(lang === "de" ? "de-DE" : "it-IT")}
                    </span>
                  )}
                </div>
              )}

              <Button
                size="lg"
                className="mt-6"
                onClick={() => setShowPmsDialog(true)}
                data-testid="button-connect-pms"
              >
                <Building2 className="w-4 h-4 mr-2" />
                {isPending
                  ? t("costAnalysis", "managePms")
                  : isError
                  ? t("costAnalysis", "retry")
                  : t("costAnalysis", "connectPms")}
              </Button>

              <div className="mt-5">
                {manualEntryLink}
              </div>
            </CardContent>
          </Card>
        )}

        {isActive && chartData.length > 1 && (
          <Card data-testid="card-chart">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("costAnalysis", "monthlyTrend")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value.toFixed(2)} EUR`, t("costAnalysis", "costPerGuest")]}
                    />
                    <Bar dataKey="costPerGuest" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    {target > 0 && (
                      <ReferenceLine y={target} stroke="#ef4444" strokeDasharray="5 5" label={{ value: t("costAnalysis", "targetCost"), position: "right", fontSize: 11, fill: "#ef4444" }} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {isActive && (
          <Card data-testid="card-guest-data-source">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  {t("costAnalysis", "guestDataSource")}
                </CardTitle>
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" data-testid="badge-pms-status">
                  {t("costAnalysis", "pmsConnected")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("costAnalysis", "pmsActivePrimary")}
              </p>

              {conn && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  {providerName && (
                    <span className="flex items-center gap-1.5 font-medium" data-testid="text-pms-provider">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      {providerName}
                    </span>
                  )}
                  {conn.lastSyncAt && (
                    <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="text-pms-last-sync">
                      <RefreshCw className="w-3.5 h-3.5" />
                      {t("costAnalysis", "lastSync")}: {new Date(conn.lastSyncAt).toLocaleDateString(lang === "de" ? "de-DE" : "it-IT")}
                    </span>
                  )}
                  {!!pmsData?.importedDays && (
                    <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="text-pms-imported-days">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {pmsData.importedDays} {t("costAnalysis", "importedDays")}
                    </span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPmsDialog(true)}
                  data-testid="button-connect-pms"
                >
                  <Building2 className="w-4 h-4 mr-1.5" />
                  {t("costAnalysis", "managePms")}
                </Button>
                {manualEntryLink}
              </div>
            </CardContent>
          </Card>
        )}

        </div>
      </div>

      {currentUser?.id && (
        <ConnectPmsDialog
          open={showPmsDialog}
          onOpenChange={setShowPmsDialog}
          restaurantId={currentUser.id}
        />
      )}
    </div>
  );
}
