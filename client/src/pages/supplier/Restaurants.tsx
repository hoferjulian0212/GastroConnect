import { useState } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getWeekdays, getWeekdayLabel } from "@/lib/translations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ArrowLeft, MessageSquare, Phone, ClipboardList, CalendarDays, Tag, Package, Save, Loader2, Trash2, MapPin, Mail, Euro, Plus, Minus, Clock } from "lucide-react";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PartnerMap } from "@/components/PartnerMap";
import { useToast } from "@/hooks/use-toast";
import type { User, Product, CustomMinOrderQuantity, DeliverySchedule, CustomPrice, MinimumOrderValue } from "@shared/schema";

type CustomPriceWithJoins = CustomPrice & { product: Product; restaurant: User };

export default function SupplierRestaurants() {
  const { currentUser } = useUser();
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<User | null>(null);

  const { data: restaurants, isLoading } = useQuery<User[]>({
    queryKey: [`/api/supplier/customers?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const filteredRestaurants = restaurants?.filter(r =>
    r.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (selectedRestaurant && currentUser?.id) {
    return (
      <RestaurantDetail
        restaurant={selectedRestaurant}
        onBack={() => setSelectedRestaurant(null)}
        supplierId={currentUser.id}
        lang={lang}
        t={t}
        toast={toast}
        setLocation={setLocation}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
      <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-6">
        <h1 className="text-xl md:text-3xl font-bold text-white mb-3 md:mb-4" data-testid="text-page-title">
          {t("supplierRestaurants", "title")}
        </h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
          <Input
            placeholder={t("supplierRestaurants", "searchRestaurants")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white/[0.07] border-white/[0.12] text-white placeholder:text-white/40 focus-visible:ring-white/20 focus-visible:border-white/30 rounded-full h-10"
            data-testid="input-search-restaurants"
          />
        </div>
      </div></HeroPortal>

      <div className="px-3 md:px-6 max-w-6xl mx-auto w-full space-y-4 md:space-y-6">

      <PartnerMap
        partners={filteredRestaurants ?? []}
        lang={lang}
        messageLabel={lang === "de" ? "Nachricht" : "Messaggio"}
        onMessage={(id) => setLocation(`/supplier/inbox?to=${id}`)}
        primaryActionLabel={lang === "de" ? "Verwalten" : "Gestisci"}
        primaryActionIcon={<Settings2Icon className="mr-1.5 h-3.5 w-3.5" />}
        onPrimaryAction={(id) => {
          const r = restaurants?.find((x) => x.id === id);
          if (r) setSelectedRestaurant(r);
        }}
        onBackfilled={() =>
          queryClient.invalidateQueries({
            queryKey: [`/api/supplier/customers?supplierId=${currentUser?.id}`],
          })
        }
        testIdPrefix="restaurants"
      />

      {isLoading ? (
        <div className="grid gap-2.5 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : filteredRestaurants && filteredRestaurants.length > 0 ? (
        <div className="grid gap-2.5 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRestaurants.map((restaurant) => (
            <Card
              key={restaurant.id}
              className="cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-px overflow-hidden"
              onClick={() => setSelectedRestaurant(restaurant)}
              data-testid={`restaurant-card-${restaurant.id}`}
            >
              <CardContent className="p-3 md:p-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={restaurant.profileImageUrl || undefined} alt={restaurant.companyName || restaurant.name} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                      {(restaurant.companyName || restaurant.name).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm truncate leading-tight" data-testid={`text-restaurant-name-${restaurant.id}`}>
                      {restaurant.companyName || restaurant.name}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {restaurant.name}{restaurant.city ? ` · ${restaurant.city}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {restaurant.phone && (
                      <a
                        href={`tel:${restaurant.phone}`}
                        data-testid={`button-call-${restaurant.id}`}
                      >
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary">
                          <Phone className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
                      onClick={() => setLocation(`/supplier/inbox?to=${restaurant.id}`)}
                      data-testid={`button-message-${restaurant.id}`}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
                      onClick={() => setSelectedRestaurant(restaurant)}
                      data-testid={`button-manage-${restaurant.id}`}
                    >
                      <Settings2Icon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Package className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-lg font-medium mb-1">
            {searchQuery ? t("supplierRestaurants", "noRestaurantsFound") : t("supplierRestaurants", "noCustomersYet")}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {searchQuery
              ? t("supplierRestaurants", "tryDifferentSearch")
              : t("supplierRestaurants", "noCustomersDesc")}
          </p>
        </div>
      )}
      </div>
    </div>
  );
}

import { Settings2 as Settings2Icon } from "lucide-react";

function RestaurantDetail({
  restaurant,
  onBack,
  supplierId,
  lang,
  t,
  toast,
  setLocation,
}: {
  restaurant: User;
  onBack: () => void;
  supplierId: string;
  lang: "de" | "it";
  t: ReturnType<typeof useT>;
  toast: (opts: any) => void;
  setLocation: (url: string) => void;
}) {
  const WEEKDAYS = getWeekdays(lang);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [dayTimeWindows, setDayTimeWindows] = useState<Record<number, { from: string; to: string }>>({});
  const [daysLoaded, setDaysLoaded] = useState(false);

  const [priceProduct, setPriceProduct] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [moqProduct, setMoqProduct] = useState("");
  const [moqValue, setMoqValue] = useState<number>(1);
  const [movZone, setMovZone] = useState("");
  const [movValue, setMovValue] = useState("");
  const [showMovForm, setShowMovForm] = useState(false);

  const { data: supplierProducts } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${supplierId}`],
    enabled: !!supplierId,
  });

  const { data: deliverySchedules } = useQuery<(DeliverySchedule & { restaurant: User })[]>({
    queryKey: [`/api/delivery-schedules?supplierId=${supplierId}`],
    enabled: !!supplierId,
  });

  const restaurantSchedules = deliverySchedules?.filter(s => s.restaurantId === restaurant.id) || [];
  const existingDays = restaurantSchedules.map(s => s.dayOfWeek);
  if (!daysLoaded && deliverySchedules) {
    setSelectedDays(existingDays);
    const windows: Record<number, { from: string; to: string }> = {};
    for (const s of restaurantSchedules) {
      if (s.deliveryTimeFrom && s.deliveryTimeTo) {
        windows[s.dayOfWeek] = { from: s.deliveryTimeFrom, to: s.deliveryTimeTo };
      }
    }
    setDayTimeWindows(windows);
    setDaysLoaded(true);
  }

  const { data: customPrices } = useQuery<CustomPriceWithJoins[]>({
    queryKey: [`/api/custom-prices?supplierId=${supplierId}`],
    enabled: !!supplierId,
  });

  const { data: customMoqs } = useQuery<(CustomMinOrderQuantity & { product: Product; restaurant: User })[]>({
    queryKey: [`/api/custom-moq?supplierId=${supplierId}`],
    enabled: !!supplierId,
  });

  const { data: movEntries } = useQuery<MinimumOrderValue[]>({
    queryKey: [`/api/minimum-order-values?supplierId=${supplierId}`],
    enabled: !!supplierId,
  });

  const restaurantPrices = customPrices?.filter(p => p.restaurantId === restaurant.id) || [];
  const restaurantMoqs = customMoqs?.filter(m => m.restaurantId === restaurant.id) || [];

  const toggleDay = (day: number) => {
    setSelectedDays(prev => {
      if (prev.includes(day)) {
        setDayTimeWindows(w => { const next = { ...w }; delete next[day]; return next; });
        return prev.filter(d => d !== day);
      }
      return [...prev, day];
    });
  };

  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/delivery-schedules", {
        supplierId,
        restaurantId: restaurant.id,
        days: selectedDays.map(day => ({
          day,
          timeFrom: dayTimeWindows[day]?.from || null,
          timeTo: dayTimeWindows[day]?.to || null,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/delivery-schedules?supplierId=${supplierId}`] });
      toast({ title: t("supplierRestaurants", "deliveryDaysSaved") });
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const savePriceMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/custom-prices", {
        productId: priceProduct,
        supplierId,
        restaurantId: restaurant.id,
        customPrice: priceValue,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-prices?supplierId=${supplierId}`] });
      toast({ title: t("supplierRestaurants", "priceSaved") });
      setPriceProduct("");
      setPriceValue("");
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const deletePriceMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/custom-prices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-prices?supplierId=${supplierId}`] });
      toast({ title: t("supplierRestaurants", "priceDeleted") });
    },
  });

  const saveMoqMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/custom-moq", {
        productId: moqProduct,
        supplierId,
        restaurantId: restaurant.id,
        minOrderQuantity: moqValue,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-moq?supplierId=${supplierId}`] });
      toast({ title: t("supplierRestaurants", "moqSaved") });
      setMoqProduct("");
      setMoqValue(1);
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const deleteMoqMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/custom-moq/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/custom-moq?supplierId=${supplierId}`] });
      toast({ title: t("supplierRestaurants", "moqDeleted") });
    },
  });

  const saveMovMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/minimum-order-values", {
        supplierId,
        zone: movZone || null,
        minimumValue: parseFloat(movValue),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/minimum-order-values?supplierId=${supplierId}`] });
      toast({ title: t("supplierRestaurants", "movSaved") });
      setMovZone("");
      setMovValue("");
      setShowMovForm(false);
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const deleteMovMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/minimum-order-values/${id}?supplierId=${supplierId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/minimum-order-values?supplierId=${supplierId}`] });
      toast({ title: t("supplierRestaurants", "movDeleted") });
    },
  });

  const handleMessage = () => {
    setLocation(`/supplier/inbox?to=${restaurant.id}`);
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-4xl mx-auto pb-[var(--mobile-bottom-pad)] md:pb-0">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-1 px-1"
        data-testid="button-back-to-list"
      >
        <ArrowLeft className="h-4 w-4" />
        {lang === "de" ? "Zurück" : "Indietro"}
      </button>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate" data-testid="text-restaurant-detail-name">
            {restaurant.companyName || restaurant.name}
          </h1>
          <p className="text-sm text-muted-foreground">{t("supplierRestaurants", "customerDetails")}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="flex items-start gap-4 flex-wrap">
            <Avatar className="h-14 w-14">
              <AvatarImage src={restaurant.profileImageUrl || undefined} alt={restaurant.companyName || restaurant.name} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                {(restaurant.companyName || restaurant.name).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
              <h2 className="font-semibold text-lg">{restaurant.companyName || restaurant.name}</h2>
              <p className="text-sm text-muted-foreground">{restaurant.name}</p>
              {restaurant.email && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{restaurant.email}</p>}
              {restaurant.phone && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{restaurant.phone}</p>}
              {restaurant.address && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{restaurant.address}, {restaurant.postalCode} {restaurant.city}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" className="gap-2" onClick={handleMessage} data-testid="button-send-message">
                <MessageSquare className="h-4 w-4" />
                {t("supplierRestaurants", "sendMessage")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <CalendarDays className="h-4 w-4 md:h-5 md:w-5" />
            {t("supplierRestaurants", "deliveryDays")}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {t("supplierRestaurants", "deliveryDaysDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-0 md:pt-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {WEEKDAYS.map(day => (
              <div key={day.value} className="space-y-1.5">
                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                    selectedDays.includes(day.value)
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                  data-testid={`checkbox-day-${day.value}`}
                >
                  <Checkbox
                    checked={selectedDays.includes(day.value)}
                    onCheckedChange={() => toggleDay(day.value)}
                  />
                  <span className="text-sm">{day.label}</span>
                </label>
                {selectedDays.includes(day.value) && (
                  <div className="flex items-center gap-1.5 pl-2">
                    <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    <input
                      type="time"
                      value={dayTimeWindows[day.value]?.from || ""}
                      onChange={(e) => setDayTimeWindows(prev => ({
                        ...prev,
                        [day.value]: { from: e.target.value, to: prev[day.value]?.to || "" }
                      }))}
                      className="text-xs border border-border rounded px-1.5 py-1 bg-background w-[80px]"
                      data-testid={`input-time-from-${day.value}`}
                    />
                    <span className="text-xs text-muted-foreground">-</span>
                    <input
                      type="time"
                      value={dayTimeWindows[day.value]?.to || ""}
                      onChange={(e) => setDayTimeWindows(prev => ({
                        ...prev,
                        [day.value]: { from: prev[day.value]?.from || "", to: e.target.value }
                      }))}
                      className="text-xs border border-border rounded px-1.5 py-1 bg-background w-[80px]"
                      data-testid={`input-time-to-${day.value}`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button
            onClick={() => saveScheduleMutation.mutate()}
            disabled={saveScheduleMutation.isPending}
            className="gap-2"
            data-testid="button-save-delivery-days"
          >
            {saveScheduleMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("common", "save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Tag className="h-4 w-4 md:h-5 md:w-5" />
            {t("supplierRestaurants", "customPrices")}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {t("supplierRestaurants", "customPricesDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-0 md:pt-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={priceProduct} onValueChange={setPriceProduct}>
              <SelectTrigger data-testid="select-price-product">
                <SelectValue placeholder={t("supplierRestaurants", "selectProduct")} />
              </SelectTrigger>
              <SelectContent>
                {supplierProducts?.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.unit}) — {t("supplierRestaurants", "standardPrice")}: {parseFloat(p.price).toFixed(2)}€
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="0.01"
              min={0.01}
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              placeholder={t("supplierRestaurants", "customPrice") + " (€)"}
              data-testid="input-custom-price"
            />
            <Button
              onClick={() => savePriceMutation.mutate()}
              disabled={!priceProduct || !priceValue || parseFloat(priceValue) <= 0 || savePriceMutation.isPending}
              className="gap-2"
              data-testid="button-save-price"
            >
              {savePriceMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("supplierRestaurants", "addPrice")}
            </Button>
          </div>

          {restaurantPrices.length > 0 ? (
            <div className="space-y-2 pt-2 border-t border-border">
              {restaurantPrices.map(cp => (
                <div key={cp.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/50" data-testid={`price-entry-${cp.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cp.product?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("supplierRestaurants", "standardPrice")}: {parseFloat(cp.product?.price || "0").toFixed(2)}€ → {t("supplierRestaurants", "customPrice")}: {parseFloat(cp.customPrice).toFixed(2)}€/{cp.product?.unit}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deletePriceMutation.mutate(cp.id)}
                    disabled={deletePriceMutation.isPending}
                    data-testid={`button-delete-price-${cp.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-sm text-muted-foreground">{t("supplierRestaurants", "noCustomPrices")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Package className="h-4 w-4 md:h-5 md:w-5" />
            {t("supplierRestaurants", "customMoq")}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {t("supplierRestaurants", "customMoqDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-0 md:pt-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={moqProduct} onValueChange={setMoqProduct}>
              <SelectTrigger data-testid="select-moq-product">
                <SelectValue placeholder={t("supplierRestaurants", "selectProduct")} />
              </SelectTrigger>
              <SelectContent>
                {supplierProducts?.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              value={moqValue}
              onChange={(e) => setMoqValue(parseInt(e.target.value) || 1)}
              placeholder={t("supplierRestaurants", "moqValue")}
              data-testid="input-moq-value"
            />
            <Button
              onClick={() => saveMoqMutation.mutate()}
              disabled={!moqProduct || moqValue < 1 || saveMoqMutation.isPending}
              className="gap-2"
              data-testid="button-save-moq"
            >
              {saveMoqMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t("supplierRestaurants", "addMoq")}
            </Button>
          </div>

          {restaurantMoqs.length > 0 ? (
            <div className="space-y-2 pt-2 border-t border-border">
              {restaurantMoqs.map(moq => (
                <div key={moq.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/50" data-testid={`moq-entry-${moq.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{moq.product?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("supplierRestaurants", "moqValue")}: {moq.minOrderQuantity} {moq.product?.unit}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMoqMutation.mutate(moq.id)}
                    disabled={deleteMoqMutation.isPending}
                    data-testid={`button-delete-moq-${moq.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-sm text-muted-foreground">{t("supplierRestaurants", "noCustomMoq")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 md:p-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Euro className="h-4 w-4 md:h-5 md:w-5" />
                {t("supplierRestaurants", "minimumOrderValue")}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {t("supplierRestaurants", "minimumOrderValueDesc")}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMovForm(!showMovForm)}
              data-testid="button-toggle-mov-form"
            >
              {showMovForm ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4 mr-1" />}
              {!showMovForm && t("supplierRestaurants", "addMov")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-0 md:pt-0 space-y-4">
          {showMovForm && (
            <div className="grid gap-3 sm:grid-cols-3 pb-3 border-b">
              <Input
                value={movZone}
                onChange={(e) => setMovZone(e.target.value)}
                placeholder={t("supplierRestaurants", "zone")}
                data-testid="input-mov-zone"
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                value={movValue}
                onChange={(e) => setMovValue(e.target.value)}
                placeholder={t("supplierRestaurants", "amount")}
                data-testid="input-mov-value"
              />
              <Button
                onClick={() => saveMovMutation.mutate()}
                disabled={!movValue || parseFloat(movValue) <= 0 || saveMovMutation.isPending}
                className="gap-2"
                data-testid="button-save-mov"
              >
                {saveMovMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("common", "save")}
              </Button>
            </div>
          )}

          {movEntries && movEntries.length > 0 ? (
            <div className="space-y-2">
              {movEntries.map(mov => (
                <div key={mov.id} className="flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/50" data-testid={`mov-entry-${mov.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {mov.zone || t("supplierRestaurants", "allZones")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("supplierRestaurants", "minimumOrderValue")}: {parseFloat(mov.minimumValue).toFixed(2)} EUR
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMovMutation.mutate(mov.id)}
                    disabled={deleteMovMutation.isPending}
                    data-testid={`button-delete-mov-${mov.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-sm text-muted-foreground">{t("supplierRestaurants", "noMov")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
