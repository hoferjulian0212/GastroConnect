import { useState, useMemo } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { SectionTabs } from "@/components/SectionTabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tag, Plus, Trash2, Package, Calendar, Percent, Loader2, Send, Check, ChevronRight, ChevronLeft, ChevronDown, Users, MessageSquare, Search, X, AlertTriangle, Clock, Hourglass, Archive, Flame } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { Product, PromotionWithProduct, User } from "@shared/schema";
import { format } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { ProductImage } from "@/components/ProductImage";

type PromotionGroup = {
  groupId: string | null;
  name: string | null;
  description: string | null;
  discountPercent: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  targetRestaurantIds: string[] | null;
  promotions: PromotionWithProduct[];
};

export default function SupplierPromotions() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  const [promoName, setPromoName] = useState("");
  const [promoDescription, setPromoDescription] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [targetMode, setTargetMode] = useState<"all" | "specific">("all");
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([]);
  const [notifyChat, setNotifyChat] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [overwriteProduct, setOverwriteProduct] = useState<Product | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "scheduled" | "expired">("all");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({ expired: true });
  const toggleSection = (key: string) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const { data: promotions, isLoading } = useQuery<PromotionWithProduct[]>({
    queryKey: [`/api/promotions?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: restaurants } = useQuery<User[]>({
    queryKey: [`/api/supplier/restaurants?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const activePromoByProductId = useMemo(() => {
    const map = new Map<string, PromotionWithProduct>();
    if (!promotions) return map;
    const now = new Date();
    for (const promo of promotions) {
      if (promo.isActive && new Date(promo.startDate as any) <= now && new Date(promo.endDate as any) >= now) {
        map.set(promo.productId, promo);
      }
    }
    return map;
  }, [promotions]);

  const bulkCreateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/promotions/bulk", data);
    },
    onSuccess: async (_data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: t("promotionsPage", "promotionCreated") });

      if (notifyChat && currentUser) {
        const targetIds = targetMode === "all"
          ? (restaurants?.map(r => r.id) || [])
          : selectedRestaurantIds;
        if (targetIds.length > 0) {
          const promoProducts = selectedProductIds.map(id => {
            const p = products?.find(pr => pr.id === id);
            if (!p) return null;
            const orig = parseFloat(p.price);
            const disc = orig * (1 - (parseInt(discountPercent) || 0) / 100);
            return { id: p.id, name: p.name, originalPrice: orig.toFixed(2), discountedPrice: disc.toFixed(2), unit: p.unit, imageUrl: p.imageUrl };
          }).filter(Boolean);
          const promotionData = {
            name: promoName || (lang === "de" ? "Neue Aktion" : "Nuova promozione"),
            description: promoDescription || null,
            discountPercent: parseInt(discountPercent),
            startDate,
            endDate,
            products: promoProducts,
            supplierId: currentUser.id,
          };
          try {
            await apiRequest("POST", "/api/promotions/notify", {
              supplierId: currentUser.id,
              restaurantIds: targetIds,
              promotionData,
            });
            toast({ title: t("promotionsPage", "notificationSent"), description: t("promotionsPage", "notificationSentDesc") });
          } catch {
          }
        }
      }
      resetForm();
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("promotionsPage", "promotionError"), variant: "destructive" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return apiRequest("DELETE", `/api/promotions/group/${groupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: t("promotionsPage", "promotionDeleted") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/promotions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: t("promotionsPage", "promotionDeleted") });
    },
  });

  const resetForm = () => {
    setIsDialogOpen(false);
    setWizardStep(1);
    setPromoName("");
    setPromoDescription("");
    setDiscountPercent("");
    setStartDate("");
    setEndDate("");
    setSelectedProductIds([]);
    setTargetMode("all");
    setSelectedRestaurantIds([]);
    setNotifyChat(false);
    setProductSearch("");
    setRestaurantSearch("");
  };

  const handleSubmit = () => {
    const discount = parseInt(discountPercent);
    const validProductIds = products
      ? selectedProductIds.filter(id => { const p = products.find(pr => pr.id === id); return p && p.inStock !== false; })
      : selectedProductIds;
    if (validProductIds.length === 0 || !discount || discount < 1 || discount > 99 || !startDate || !endDate) {
      toast({ title: t("common", "error"), variant: "destructive" });
      return;
    }

    bulkCreateMutation.mutate({
      productIds: validProductIds,
      supplierId: currentUser!.id,
      discountPercent: discount,
      startDate,
      endDate,
      name: promoName || null,
      description: promoDescription || null,
      targetRestaurantIds: targetMode === "specific" ? selectedRestaurantIds : null,
    });
  };

  const toggleProduct = (productId: string) => {
    if (selectedProductIds.includes(productId)) {
      setSelectedProductIds(prev => prev.filter(id => id !== productId));
      return;
    }
    const existingPromo = activePromoByProductId.get(productId);
    if (existingPromo) {
      const product = products?.find(p => p.id === productId);
      if (product) {
        setOverwriteProduct(product);
        return;
      }
    }
    setSelectedProductIds(prev => [...prev, productId]);
  };

  const confirmOverwrite = () => {
    if (overwriteProduct) {
      setSelectedProductIds(prev => [...prev, overwriteProduct.id]);
      setOverwriteProduct(null);
    }
  };

  const toggleRestaurant = (restaurantId: string) => {
    setSelectedRestaurantIds(prev =>
      prev.includes(restaurantId) ? prev.filter(id => id !== restaurantId) : [...prev, restaurantId]
    );
  };

  const promotionGroups = useMemo(() => {
    if (!promotions) return [];
    const groupMap = new Map<string, PromotionGroup>();
    for (const promo of promotions) {
      const key = promo.groupId || promo.id;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          groupId: promo.groupId,
          name: promo.name,
          description: promo.description,
          discountPercent: promo.discountPercent,
          startDate: promo.startDate as any,
          endDate: promo.endDate as any,
          isActive: promo.isActive,
          targetRestaurantIds: promo.targetRestaurantIds,
          promotions: [],
        });
      }
      groupMap.get(key)!.promotions.push(promo);
    }
    return Array.from(groupMap.values());
  }, [promotions]);

  const getGroupStatus = (group: PromotionGroup) => {
    const now = new Date();
    const start = new Date(group.startDate);
    const end = new Date(group.endDate);
    if (!group.isActive) return { label: lang === "de" ? "Deaktiviert" : "Disattivato", variant: "secondary" as const, color: "text-muted-foreground" };
    if (now < start) return { label: lang === "de" ? "Geplant" : "Pianificato", variant: "outline" as const, color: "text-blue-600" };
    if (now > end) return { label: t("promotionsPage", "expired"), variant: "secondary" as const, color: "text-muted-foreground" };
    return { label: t("promotionsPage", "active"), variant: "default" as const, color: "text-green-600" };
  };

  const isPending = bulkCreateMutation.isPending;
  const dateFnsLocale = lang === "de" ? de : it;

  const filteredProducts = products?.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.category?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredRestaurants = restaurants?.filter(r =>
    r.companyName?.toLowerCase().includes(restaurantSearch.toLowerCase()) ||
    r.name.toLowerCase().includes(restaurantSearch.toLowerCase())
  );

  const canGoToStep2 = promoName.trim().length > 0 && discountPercent && parseInt(discountPercent) >= 1 && parseInt(discountPercent) <= 99 && startDate && endDate && new Date(endDate) > new Date(startDate);
  const canGoToStep3 = selectedProductIds.length > 0;
  const canSubmit = canGoToStep3 && (targetMode === "all" || selectedRestaurantIds.length > 0);

  return (
    <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
      <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-4" data-testid="promotions-hero"><SectionTabs />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">{t("common", "promotions")}</h1>
            <p className="text-sm text-white/50 mt-1">{lang === "de" ? "Rabattaktionen für Ihre Produkte verwalten" : "Gestisci le promozioni per i tuoi prodotti"}</p>
          </div>
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} className="hidden md:inline-flex rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15 gap-1.5" size="sm" data-testid="button-create-promotion">
            <Plus className="h-4 w-4" />
            {t("promotionsPage", "createPromotion")}
          </Button>
        </div>

        <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} className="md:hidden w-full gap-2" size="sm" data-testid="button-create-promotion-mobile">
          <Plus className="h-4 w-4" />
          {t("promotionsPage", "createPromotion")}
        </Button>

        {(() => {
          const now = new Date();
          const counts = {
            all: promotionGroups.length,
            active: promotionGroups.filter(g => g.isActive && new Date(g.startDate) <= now && new Date(g.endDate) >= now).length,
            scheduled: promotionGroups.filter(g => g.isActive && new Date(g.startDate) > now).length,
            expired: promotionGroups.filter(g => new Date(g.endDate) < now || !g.isActive).length,
          };
          const filterPills: { key: typeof statusFilter; label: string; count: number; icon: typeof Tag; activeBg: string; activeText: string; dot: string }[] = [
            { key: "all", label: lang === "de" ? "Alle" : "Tutte", count: counts.all, icon: Tag, activeBg: "bg-white text-[#161921]", activeText: "text-[#161921]", dot: "bg-white/60" },
            { key: "active", label: t("promotionsPage", "active"), count: counts.active, icon: Flame, activeBg: "bg-emerald-500/90 text-white", activeText: "text-white", dot: "bg-emerald-400" },
            { key: "scheduled", label: lang === "de" ? "Geplant" : "Pianificate", count: counts.scheduled, icon: Hourglass, activeBg: "bg-blue-500/90 text-white", activeText: "text-white", dot: "bg-blue-400" },
            { key: "expired", label: t("promotionsPage", "expired"), count: counts.expired, icon: Archive, activeBg: "bg-white/15 text-white", activeText: "text-white", dot: "bg-white/40" },
          ];
          return (
            <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto -mx-1 px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filterPills.map(pill => {
                const isActive = statusFilter === pill.key;
                const Icon = pill.icon;
                return (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setStatusFilter(pill.key)}
                    className={`group shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium transition-all duration-200 border ${
                      isActive
                        ? `${pill.activeBg} border-transparent shadow-sm scale-[1.02]`
                        : "bg-white/[0.06] text-white/70 border-white/10 hover:bg-white/[0.11] hover:text-white"
                    }`}
                    data-testid={`filter-pill-${pill.key}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{pill.label}</span>
                    <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ${
                      isActive ? "bg-black/15 dark:bg-black/25" : "bg-white/10 text-white/80"
                    }`} data-testid={`filter-pill-count-${pill.key}`}>
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div></HeroPortal>

      <div className="space-y-4 px-3 md:px-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
          </div>
        ) : promotionGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 md:p-14">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <Tag className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-semibold">{t("promotionsPage", "noPromotions")}</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">{t("promotionsPage", "noPromotionsDesc")}</p>
              <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} className="mt-4 rounded-full gap-1.5" size="sm" data-testid="button-create-promotion-empty">
                <Plus className="h-4 w-4" />
                {t("promotionsPage", "createPromotion")}
              </Button>
            </div>
          </div>
        ) : (() => {
          const now = new Date();
          const sectionDefs: { key: "active" | "scheduled" | "expired"; titleDe: string; titleIt: string; icon: typeof Flame; accentText: string; accentBg: string; accentDot: string; railColor: string; medallionBg: string }[] = [
            { key: "active",    titleDe: "Aktiv",      titleIt: "Attive",      icon: Flame,     accentText: "text-emerald-700 dark:text-emerald-400", accentBg: "bg-emerald-50 dark:bg-emerald-950/30", accentDot: "bg-emerald-500", railColor: "before:bg-gradient-to-b before:from-emerald-400 before:to-emerald-600", medallionBg: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-emerald-500/30" },
            { key: "scheduled", titleDe: "Geplant",    titleIt: "Pianificate", icon: Hourglass, accentText: "text-blue-700 dark:text-blue-400",       accentBg: "bg-blue-50 dark:bg-blue-950/30",       accentDot: "bg-blue-500",    railColor: "before:bg-gradient-to-b before:from-blue-400 before:to-blue-600",       medallionBg: "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-blue-500/30" },
            { key: "expired",   titleDe: "Abgelaufen", titleIt: "Scadute",     icon: Archive,   accentText: "text-muted-foreground",                  accentBg: "bg-muted/40",                          accentDot: "bg-muted-foreground/40", railColor: "before:bg-gradient-to-b before:from-muted-foreground/30 before:to-muted-foreground/40", medallionBg: "bg-muted text-muted-foreground" },
          ];
          const grouped: Record<"active" | "scheduled" | "expired", PromotionGroup[]> = { active: [], scheduled: [], expired: [] };
          for (const g of promotionGroups) {
            const start = new Date(g.startDate);
            const end = new Date(g.endDate);
            if (!g.isActive || end < now) grouped.expired.push(g);
            else if (start > now) grouped.scheduled.push(g);
            else grouped.active.push(g);
          }

          const renderCard = (group: PromotionGroup, sectionKey: "active" | "scheduled" | "expired", section: typeof sectionDefs[number]) => {
            const start = new Date(group.startDate);
            const end = new Date(group.endDate);
            const isGroup = group.promotions.length > 1;
            const totalMs = Math.max(1, end.getTime() - start.getTime());
            const elapsedMs = Math.min(totalMs, Math.max(0, now.getTime() - start.getTime()));
            const progress = sectionKey === "active" ? Math.round((elapsedMs / totalMs) * 100) : sectionKey === "scheduled" ? 0 : 100;
            const daysLeft = sectionKey === "active" ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;
            const daysUntilStart = sectionKey === "scheduled" ? Math.max(0, Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;
            const previewProducts = group.promotions.slice(0, 4);
            const remainingCount = group.promotions.length - previewProducts.length;
            const totalSavings = group.promotions.reduce((sum, p) => sum + (parseFloat(p.product.price) * group.discountPercent / 100), 0);
            const isExpired = sectionKey === "expired";

            return (
              <div
                key={group.groupId || group.promotions[0].id}
                className={`relative rounded-2xl border border-border bg-card overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${section.railColor} ${isExpired ? "opacity-80" : ""}`}
                data-testid={`promotion-group-${group.groupId || group.promotions[0].id}`}
              >
                <div className="p-3 md:p-4 pl-4 md:pl-5">
                  <div className="flex items-start gap-3 md:gap-4">
                    {/* Discount medallion */}
                    <div className={`shrink-0 h-16 w-16 md:h-20 md:w-20 rounded-2xl flex flex-col items-center justify-center shadow-lg ${section.medallionBg}`}>
                      <span className="text-xl md:text-2xl font-black leading-none tabular-nums">−{group.discountPercent}</span>
                      <span className="text-[10px] md:text-xs font-semibold opacity-90 mt-0.5">%</span>
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm md:text-base leading-tight truncate" data-testid={`text-promo-name-${group.groupId || group.promotions[0].id}`}>
                            {group.name || group.promotions[0].product.name}
                          </h3>
                          {group.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{group.description}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-7 w-7 -mr-1 -mt-1 opacity-60 hover:opacity-100 hover:text-destructive"
                          onClick={() => {
                            if (group.groupId) deleteGroupMutation.mutate(group.groupId);
                            else deleteMutation.mutate(group.promotions[0].id);
                          }}
                          disabled={deleteGroupMutation.isPending || deleteMutation.isPending}
                          data-testid={`button-delete-group-${group.groupId || group.promotions[0].id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Product image stack + meta */}
                      <div className="flex items-center gap-3 mt-2.5">
                        <div className="flex -space-x-2">
                          {previewProducts.map(promo => (
                            <div key={promo.id} className="ring-2 ring-card rounded-lg overflow-hidden">
                              <ProductImage
                                src={promo.product.imageUrl}
                                alt={promo.product.name}
                                className="w-8 h-8 md:w-9 md:h-9 rounded-lg"
                                iconClassName="h-3.5 w-3.5"
                                fallbackBg="bg-muted"
                                fallbackIconColor="text-muted-foreground/40"
                              />
                            </div>
                          ))}
                          {remainingCount > 0 && (
                            <div className="ring-2 ring-card w-8 h-8 md:w-9 md:h-9 rounded-lg bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              +{remainingCount}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground min-w-0">
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <Package className="h-3 w-3" />
                            {group.promotions.length} {group.promotions.length === 1 ? (lang === "de" ? "Produkt" : "prodotto") : (lang === "de" ? "Produkte" : "prodotti")}
                          </span>
                          {group.targetRestaurantIds && group.targetRestaurantIds.length > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {group.targetRestaurantIds.length} {lang === "de" ? "ausgewählt" : "selezionati"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {lang === "de" ? "Alle Betriebe" : "Tutti i ristoranti"}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(start, "dd.MM.", { locale: dateFnsLocale })} – {format(end, "dd.MM.yyyy", { locale: dateFnsLocale })}
                          </span>
                        </div>
                      </div>

                      {/* Status row: progress / countdown */}
                      <div className="mt-3">
                        {sectionKey === "active" ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
                                style={{ width: `${progress}%` }}
                                data-testid={`progress-bar-${group.groupId || group.promotions[0].id}`}
                              />
                            </div>
                            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 tabular-nums">
                              {daysLeft === 0 ? (lang === "de" ? "endet heute" : "termina oggi") : `${daysLeft} ${daysLeft === 1 ? (lang === "de" ? "Tag" : "giorno") : (lang === "de" ? "Tage" : "giorni")}`}
                            </span>
                          </div>
                        ) : sectionKey === "scheduled" ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-[11px] font-semibold">
                            <Clock className="h-3 w-3" />
                            {daysUntilStart === 0
                              ? (lang === "de" ? "Startet heute" : "Inizia oggi")
                              : (lang === "de" ? `Startet in ${daysUntilStart} ${daysUntilStart === 1 ? "Tag" : "Tagen"}` : `Inizia tra ${daysUntilStart} ${daysUntilStart === 1 ? "giorno" : "giorni"}`)}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Archive className="h-3 w-3" />
                            {!group.isActive
                              ? (lang === "de" ? "Deaktiviert" : "Disattivata")
                              : (lang === "de" ? `Beendet am ${format(end, "dd.MM.yyyy")}` : `Terminata il ${format(end, "dd.MM.yyyy")}`)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          };

          const sectionsToRender = statusFilter === "all"
            ? sectionDefs.filter(s => grouped[s.key].length > 0)
            : sectionDefs.filter(s => s.key === statusFilter);

          if (sectionsToRender.length === 0) {
            return (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
                <Tag className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {lang === "de" ? "Keine Aktionen in dieser Kategorie." : "Nessuna promozione in questa categoria."}
                </p>
              </div>
            );
          }

          return sectionsToRender.map(section => {
            const items = grouped[section.key];
            if (items.length === 0) return null;
            const Icon = section.icon;
            const collapsed = !!collapsedSections[section.key];
            const showHeader = statusFilter === "all";
            return (
              <div key={section.key} className="space-y-2.5" data-testid={`section-${section.key}`}>
                {showHeader && (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.key)}
                    aria-expanded={!collapsed}
                    aria-controls={`section-content-${section.key}`}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl ${section.accentBg} hover:opacity-90 transition-opacity`}
                    data-testid={`section-header-${section.key}`}
                  >
                    {collapsed ? <ChevronRight className={`h-4 w-4 ${section.accentText}`} /> : <ChevronDown className={`h-4 w-4 ${section.accentText}`} />}
                    <span className={`h-1.5 w-1.5 rounded-full ${section.accentDot}`} />
                    <Icon className={`h-4 w-4 ${section.accentText}`} />
                    <span className={`text-sm font-semibold ${section.accentText}`}>
                      {lang === "de" ? section.titleDe : section.titleIt}
                    </span>
                    <Badge variant="outline" className={`ml-1 text-[10px] px-1.5 py-0 rounded-full font-medium ${section.accentText} border-current/20`}>
                      {items.length}
                    </Badge>
                  </button>
                )}
                {(!showHeader || !collapsed) && (
                  <div id={`section-content-${section.key}`} className="space-y-2.5">
                    {items.map(group => renderCard(group, section.key, section))}
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="p-0 gap-0 max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("promotionsPage", "createPromotion")}</DialogTitle>
          </DialogHeader>

          <div className="px-5 pt-5 pb-2 space-y-2">
            <h3 className="text-sm font-semibold">{t("promotionsPage", "createPromotion")}</h3>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(step => (
                <div key={step} className="flex items-center gap-1.5">
                  <div className={`flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold ${
                    wizardStep === step ? "bg-primary text-primary-foreground" :
                    wizardStep > step ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {wizardStep > step ? <Check className="h-3 w-3" /> : step}
                  </div>
                  <span className={`text-xs hidden md:block ${wizardStep === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {t("promotionsPage", step === 1 ? "step1" : step === 2 ? "step2" : "step3")}
                  </span>
                  {step < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-5">
            {wizardStep === 1 && (
              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-sm">{t("promotionsPage", "promotionName")} *</Label>
                  <Input
                    value={promoName}
                    onChange={e => setPromoName(e.target.value)}
                    placeholder={t("promotionsPage", "promotionNamePlaceholder")}
                    className="mt-1"
                    data-testid="input-promo-name"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("promotionsPage", "promotionDescription")}</Label>
                  <Textarea
                    value={promoDescription}
                    onChange={e => setPromoDescription(e.target.value)}
                    placeholder={t("promotionsPage", "promotionDescPlaceholder")}
                    className="mt-1 resize-none"
                    rows={2}
                    data-testid="input-promo-description"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("promotionsPage", "discount")} *</Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={discountPercent}
                      onChange={e => setDiscountPercent(e.target.value)}
                      placeholder={lang === "de" ? "z.B. 15" : "es. 15"}
                      data-testid="input-discount-percent"
                    />
                    <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">{t("promotionsPage", "startDate")} *</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd")}
                      className="mt-1"
                      data-testid="input-start-date"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">{t("promotionsPage", "endDate")} *</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      min={startDate || format(new Date(), "yyyy-MM-dd")}
                      className="mt-1"
                      data-testid="input-end-date"
                    />
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">{t("promotionsPage", "selectProducts")} *</Label>
                  <Badge variant="secondary" className="text-xs">{selectedProductIds.length} {t("promotionsPage", "selectedProducts")}</Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("common", "search") + "..."}
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="pl-9 text-sm"
                    data-testid="input-search-products"
                  />
                </div>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {filteredProducts?.map(product => {
                    const isSelected = selectedProductIds.includes(product.id);
                    const orig = parseFloat(product.price);
                    const disc = orig * (1 - (parseInt(discountPercent) || 0) / 100);
                    const outOfStock = product.inStock === false;
                    const existingPromo = activePromoByProductId.get(product.id);
                    const hasActivePromo = !!existingPromo && !isSelected;
                    return (
                      <div
                        key={product.id}
                        onClick={() => !outOfStock && toggleProduct(product.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                          outOfStock ? "opacity-60 cursor-not-allowed bg-muted/30" :
                          isSelected ? "border-primary bg-primary/5 cursor-pointer" :
                          hasActivePromo ? "border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20 cursor-pointer" :
                          "border-border hover:bg-muted/50 cursor-pointer"
                        }`}
                        data-testid={`product-option-${product.id}`}
                      >
                        <Checkbox checked={isSelected} disabled={outOfStock} className="pointer-events-none" />
                        <ProductImage src={product.imageUrl} alt={product.name} className="w-8 h-8 rounded-md" iconClassName="h-3.5 w-3.5" fallbackIconColor="text-muted-foreground/30" imgClassName={outOfStock ? "grayscale" : undefined} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{product.name}</p>
                            {existingPromo && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 shrink-0 whitespace-nowrap">
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                {lang === "de" ? "Bereits aktive Aktion" : "Promozione già attiva"}
                              </Badge>
                            )}
                          </div>
                          {outOfStock ? (
                            <p className="text-[11px] text-red-500 font-medium">{t("promotionsPage", "noStockAvailable")}</p>
                          ) : existingPromo && !isSelected ? (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-amber-600 dark:text-amber-400 font-medium">-{existingPromo.discountPercent}%</span>
                              <span className="text-muted-foreground">{existingPromo.name || (lang === "de" ? "Aktive Aktion" : "Promozione attiva")}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-muted-foreground line-through">{orig.toFixed(2)}€</span>
                              <span className="font-medium text-green-600 dark:text-green-400">{disc.toFixed(2)}€</span>
                              <span className="text-muted-foreground">/{product.unit}</span>
                            </div>
                          )}
                        </div>
                        {product.category && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">{product.category}</Badge>
                        )}
                      </div>
                    );
                  })}
                  {filteredProducts?.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("supplierProducts", "noProducts")}</p>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-sm font-medium">{t("promotionsPage", "targetRestaurants")}</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={() => { setTargetMode("all"); setSelectedRestaurantIds([]); }}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                        targetMode === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      data-testid="button-target-all"
                    >
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t("promotionsPage", "allRestaurants")}</span>
                    </button>
                    <button
                      onClick={() => setTargetMode("specific")}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                        targetMode === "specific" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      data-testid="button-target-specific"
                    >
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t("promotionsPage", "specificRestaurants")}</span>
                    </button>
                  </div>
                </div>

                {targetMode === "specific" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm">{t("promotionsPage", "selectRestaurants")}</Label>
                      <Badge variant="secondary" className="text-xs">{selectedRestaurantIds.length}</Badge>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t("common", "search") + "..."}
                        value={restaurantSearch}
                        onChange={e => setRestaurantSearch(e.target.value)}
                        className="pl-9 text-sm"
                        data-testid="input-search-restaurants"
                      />
                    </div>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {filteredRestaurants?.map(restaurant => {
                        const isSelected = selectedRestaurantIds.includes(restaurant.id);
                        return (
                          <div
                            key={restaurant.id}
                            onClick={() => toggleRestaurant(restaurant.id)}
                            className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                              isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                            }`}
                            data-testid={`restaurant-option-${restaurant.id}`}
                          >
                            <Checkbox checked={isSelected} className="pointer-events-none" />
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={restaurant.profileImageUrl || undefined} />
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {(restaurant.companyName || restaurant.name).substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{restaurant.companyName || restaurant.name}</p>
                              {restaurant.city && <p className="text-[11px] text-muted-foreground">{restaurant.city}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <div
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      notifyChat ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                    onClick={() => setNotifyChat(!notifyChat)}
                    data-testid="checkbox-notify-chat"
                  >
                    <Checkbox checked={notifyChat} className="pointer-events-none" />
                    <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{t("promotionsPage", "notifyRestaurants")}</p>
                      <p className="text-[11px] text-muted-foreground">{t("promotionsPage", "notifyDesc")}</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-muted/30 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{lang === "de" ? "Zusammenfassung" : "Riepilogo"}</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{t("promotionsPage", "promotionName")}:</span>
                      <span className="font-medium text-right truncate">{promoName || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{t("promotionsPage", "discount")}:</span>
                      <span className="font-medium text-green-600 shrink-0">-{discountPercent}%</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{t("promotionsPage", "products")}:</span>
                      <span className="font-medium shrink-0">{selectedProductIds.length}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{t("promotionsPage", "targetRestaurants")}:</span>
                      <span className="font-medium text-right truncate">{targetMode === "all" ? t("promotionsPage", "allRestaurants") : `${selectedRestaurantIds.length} ${t("promotionsPage", "specificRestaurants")}`}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{lang === "de" ? "Zeitraum" : "Periodo"}:</span>
                      <span className="font-medium text-xs shrink-0">{startDate && endDate ? `${format(new Date(startDate), "dd.MM.yy")} - ${format(new Date(endDate), "dd.MM.yy")}` : "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 px-5 pb-5">
            {wizardStep > 1 && (
              <Button variant="outline" className="rounded-lg" onClick={() => setWizardStep(wizardStep - 1)} data-testid="button-wizard-back">
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("promotionsPage", "back")}
              </Button>
            )}
            <div className="flex-1" />
            {wizardStep < 3 ? (
              <Button
                className="rounded-lg"
                onClick={() => setWizardStep(wizardStep + 1)}
                disabled={wizardStep === 1 ? !canGoToStep2 : !canGoToStep3}
                data-testid="button-wizard-next"
              >
                {t("promotionsPage", "next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                className="rounded-lg"
                onClick={handleSubmit}
                disabled={isPending || !canSubmit}
                data-testid="button-save-promotion"
              >
                {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                {t("common", "create")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!overwriteProduct} onOpenChange={(open) => { if (!open) setOverwriteProduct(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {lang === "de" ? "Bereits aktive Aktion" : "Promozione già attiva"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {overwriteProduct && (() => {
                const existingPromo = activePromoByProductId.get(overwriteProduct.id);
                return lang === "de"
                  ? `"${overwriteProduct.name}" hat bereits eine aktive Aktion${existingPromo?.name ? ` ("${existingPromo.name}", -${existingPromo.discountPercent}%)` : ` (-${existingPromo?.discountPercent}%)`}. Wenn Sie fortfahren, wird die bestehende Aktion durch die neue ersetzt.`
                  : `"${overwriteProduct.name}" ha già una promozione attiva${existingPromo?.name ? ` ("${existingPromo.name}", -${existingPromo.discountPercent}%)` : ` (-${existingPromo?.discountPercent}%)`}. Se continui, la promozione esistente verrà sostituita dalla nuova.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-overwrite">
              {t("common", "cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmOverwrite}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-overwrite"
            >
              {lang === "de" ? "Überschreiben" : "Sovrascrivi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
