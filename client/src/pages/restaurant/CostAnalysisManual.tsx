import { useState } from "react";
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
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Minus,
  Target,
  CalendarDays,
  ArrowLeft,
  FlaskConical,
} from "lucide-react";

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

export default function CostAnalysisManual() {
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

  const { data: settings } = useQuery<CostSettingsData>({
    queryKey: [`/api/restaurant/cost-settings?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: overnightEntries } = useQuery<OvernightStayEntry[]>({
    queryKey: [`/api/restaurant/overnight-stays?restaurantId=${currentUser?.id}&month=${currentMonth}`],
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

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    return `${d}.${m}.${y}`;
  };

  return (
    <div>
      <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-6">
        <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-3" data-testid="manual-entry-hero">
          <Link href="/restaurant/cost-analysis">
            <button
              className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
              data-testid="link-back-cost-analysis"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("costAnalysis", "backToCostAnalysis")}
            </button>
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="manual-entry-title">
              {t("costAnalysis", "manualEntryTitle")}
            </h1>
            <p className="text-sm text-white/50 mt-1 flex items-start gap-1.5 max-w-2xl" data-testid="manual-entry-desc">
              <FlaskConical className="w-4 h-4 mt-0.5 shrink-0" />
              {t("costAnalysis", "manualEntryPageDesc")}
            </p>
          </div>
        </div></HeroPortal>

        <div className="px-4 md:px-6 space-y-4 md:space-y-6">
          <Card data-testid="card-target-setting">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-4 h-4" />
                {t("costAnalysis", "targetPerGuest")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <div className="flex-1 max-w-xs">
                  <Label className="text-sm text-muted-foreground">{t("costAnalysis", "targetPerGuest")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={targetInput}
                    onChange={e => setTargetInput(e.target.value)}
                    placeholder={settings?.targetCostPerGuest || "0.00"}
                    className="mt-1"
                    data-testid="input-target-cost"
                  />
                </div>
                <Button
                  onClick={handleSaveTarget}
                  disabled={saveSettingsMutation.isPending || !targetInput}
                  data-testid="button-save-target"
                >
                  {t("costAnalysis", "save")}
                </Button>
              </div>
            </CardContent>
          </Card>

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
              <div className="flex items-center justify-center gap-4 mb-4">
                <button className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" onClick={() => navigateMonth(-1)} data-testid="button-prev-month">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-base font-semibold min-w-[120px] text-center" data-testid="text-current-month">
                  {formatMonth(currentMonth)}
                </span>
                <button className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" onClick={() => navigateMonth(1)} data-testid="button-next-month">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

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
                        className="flex items-center justify-between gap-2 py-2 px-3 bg-muted/40 rounded-lg"
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
