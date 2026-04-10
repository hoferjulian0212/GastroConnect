import { useState, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  Target,
  Users,
  Euro,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Settings,
  CalendarDays,
  ShoppingBag,
  Minus,
  Check,
} from "lucide-react";
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

type OvernightStayEntry = {
  id: string;
  restaurantId: string;
  date: string;
  overnightStays: number;
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

  const [newDate, setNewDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [newGuests, setNewGuests] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [targetInput, setTargetInput] = useState("");

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

  const { data: analysis, isLoading: analysisLoading } = useQuery<CostAnalysisData>({
    queryKey: [`/api/restaurant/cost-analysis?restaurantId=${currentUser?.id}&month=${currentMonth}`],
    enabled: !!currentUser?.id,
  });

  const { data: settings } = useQuery<CostSettingsData>({
    queryKey: [`/api/restaurant/cost-settings?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: overnightEntries } = useQuery<OvernightStayEntry[]>({
    queryKey: [`/api/restaurant/overnight-stays?restaurantId=${currentUser?.id}&month=${currentMonth}`],
    enabled: !!currentUser?.id,
  });

  const { data: history } = useQuery<HistoryEntry[]>({
    queryKey: [`/api/restaurant/cost-analysis/history?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
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

  const saveOvernightMutation = useMutation({
    mutationFn: (data: { restaurantId: string; date: string; overnightStays: number }) =>
      apiRequest("POST", "/api/restaurant/overnight-stays", data),
    onSuccess: () => {
      invalidateCostQueries();
      setNewDate("");
      setNewGuests("");
      setShowAddForm(false);
    },
  });

  const deleteOvernightMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/restaurant/overnight-stays/${id}?restaurantId=${currentUser?.id}`),
    onSuccess: () => {
      invalidateCostQueries();
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (data: { restaurantId: string; targetCostPerGuest: number }) =>
      apiRequest("POST", "/api/restaurant/cost-settings", data),
    onSuccess: () => {
      invalidateCostQueries();
      setShowSettings(false);
    },
  });

  const handleAddEntry = () => {
    if (!newDate || !newGuests || !currentUser?.id) return;
    saveOvernightMutation.mutate({
      restaurantId: currentUser.id,
      date: newDate,
      overnightStays: parseInt(newGuests),
    });
  };

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

  const getStatusColor = () => {
    if (!target || !costPerGuest) return "text-gray-500";
    if (Math.abs(deviation) <= 5) return "text-green-600";
    if (difference > 0) return "text-red-600";
    return "text-green-600";
  };

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

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    return `${d}.${m}.${y}`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-4 md:space-y-6 pb-24 md:pb-6 overflow-y-auto">
        <div className="dark bg-[#161921] px-4 md:px-6 pt-4 pb-5 rounded-b-3xl space-y-4" data-testid="cost-analysis-hero">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="cost-analysis-title">
                {t("costAnalysis", "title")}
              </h1>
            </div>
            <Button
              size="sm"
              className="rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15"
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
          </div>

          {showSettings && (
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

          {analysisLoading ? (
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
          )}
        </div>

        <div className="px-4 md:px-6 space-y-4 md:space-y-6">

        {chartData.length > 1 && (
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

        <Card data-testid="card-overnight-entries">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                {t("costAnalysis", "overnightStays")}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
                data-testid="button-add-entry"
              >
                {showAddForm ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4 mr-1" />}
                {!showAddForm && t("costAnalysis", "addEntry")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showAddForm && (
              <div className="flex items-end gap-2 mb-4 pb-4 border-b">
                <div className="flex-1">
                  <Label className="text-sm">{t("costAnalysis", "date")}</Label>
                  <Input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="mt-1"
                    data-testid="input-overnight-date"
                  />
                </div>
                <div className="w-28">
                  <Label className="text-sm">{t("costAnalysis", "guests")}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={newGuests}
                    onChange={e => setNewGuests(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                    data-testid="input-overnight-guests"
                  />
                </div>
                <Button
                  onClick={handleAddEntry}
                  disabled={saveOvernightMutation.isPending || !newDate || !newGuests}
                  size="sm"
                  data-testid="button-save-overnight"
                >
                  {t("costAnalysis", "save")}
                </Button>
              </div>
            )}

            {overnightEntries && overnightEntries.length > 0 ? (
              <div className="space-y-2">
                {overnightEntries
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map(entry => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 py-2 px-3 bg-gray-50 rounded-lg"
                      data-testid={`overnight-entry-${entry.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{formatDate(entry.date)}</span>
                        <span className="text-sm text-muted-foreground">
                          {entry.overnightStays} {t("costAnalysis", "guests")}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600"
                        onClick={() => deleteOvernightMutation.mutate(entry.id)}
                        data-testid={`button-delete-overnight-${entry.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("costAnalysis", "noData")}
              </p>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
