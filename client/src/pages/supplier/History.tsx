import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History as HistoryIcon, Clock, Search, Package, Building2, Filter, Euro, ArrowUpDown, ArrowUp, ArrowDown, X, CalendarDays } from "lucide-react";
import type { OrderWithDetails, User } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type SortField = "date" | "amount" | "status" | "restaurant";
type SortDirection = "asc" | "desc";

export default function SupplierHistory() {
  const { currentUser } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data: orders, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/supplier/orders/history?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: restaurants } = useQuery<User[]>({
    queryKey: [`/api/supplier/restaurants?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Neu";
      case "confirmed": return "Bestätigt";
      case "in_delivery": return "In Lieferung";
      case "delivered": return "Geliefert";
      case "cancelled": return "Storniert";
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusCardBg = (status: string) => {
    switch (status) {
      case "delivered": return "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40";
      case "cancelled": return "bg-red-50/40 dark:bg-red-950/15 border-red-200 dark:border-red-800/40";
      default: return "";
    }
  };

  const hasActiveFilters = selectedRestaurant !== "all" || selectedStatus !== "all" || dateFrom || dateTo || minAmount || maxAmount || searchQuery;

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedRestaurant("all");
    setSelectedStatus("all");
    setDateFrom("");
    setDateTo("");
    setMinAmount("");
    setMaxAmount("");
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "date" ? "desc" : "asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return ArrowUpDown;
    return sortDirection === "asc" ? ArrowUp : ArrowDown;
  };

  const filteredAndSortedOrders = useMemo(() => {
    if (!orders) return [];

    let result = orders.filter(order => {
      const matchesSearch =
        !searchQuery ||
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.restaurant?.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.restaurant?.name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRestaurant = selectedRestaurant === "all" || order.restaurantId === selectedRestaurant;

      const matchesStatus = selectedStatus === "all" || order.status === selectedStatus;

      const orderDate = new Date(order.createdAt);
      const matchesDateFrom = !dateFrom || orderDate >= new Date(dateFrom + "T00:00:00");
      const matchesDateTo = !dateTo || orderDate <= new Date(dateTo + "T23:59:59");

      const orderAmount = parseFloat(order.totalAmount);
      const matchesMinAmount = !minAmount || orderAmount >= parseFloat(minAmount);
      const matchesMaxAmount = !maxAmount || orderAmount <= parseFloat(maxAmount);

      return matchesSearch && matchesRestaurant && matchesStatus && matchesDateFrom && matchesDateTo && matchesMinAmount && matchesMaxAmount;
    });

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "date":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "amount":
          comparison = parseFloat(a.totalAmount) - parseFloat(b.totalAmount);
          break;
        case "status": {
          const statusOrder: Record<string, number> = { pending: 0, confirmed: 1, in_delivery: 2, delivered: 3, cancelled: 4 };
          comparison = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
          break;
        }
        case "restaurant": {
          const nameA = (a.restaurant?.companyName || a.restaurant?.name || "").toLowerCase();
          const nameB = (b.restaurant?.companyName || b.restaurant?.name || "").toLowerCase();
          comparison = nameA.localeCompare(nameB, "de");
          break;
        }
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [orders, searchQuery, selectedRestaurant, selectedStatus, dateFrom, dateTo, minAmount, maxAmount, sortField, sortDirection]);

  const totalRevenue = filteredAndSortedOrders.reduce(
    (sum, order) => sum + parseFloat(order.totalAmount),
    0
  ).toFixed(2);

  const totalOrders = filteredAndSortedOrders.length;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Bestellübersicht</h1>
        <p className="text-sm md:text-base text-muted-foreground">Historie und Statistiken</p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium">Umsatz</CardTitle>
            <Euro className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold" data-testid="text-total-revenue">{totalRevenue}€</div>
            <p className="text-[10px] md:text-xs text-muted-foreground">{totalOrders} Bestellungen</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2 gap-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium">Bestellungen</CardTitle>
            <HistoryIcon className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="text-xl md:text-2xl font-bold" data-testid="text-total-orders">{totalOrders}</div>
            <p className="text-[10px] md:text-xs text-muted-foreground">ausgewählter Zeitraum</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 md:gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-sm"
                  data-testid="input-search-history"
                />
              </div>
              <Select value={selectedRestaurant} onValueChange={setSelectedRestaurant}>
                <SelectTrigger className="w-full md:w-[200px] text-sm" data-testid="select-restaurant">
                  <Building2 className="h-3.5 w-3.5 mr-2 shrink-0" />
                  <SelectValue placeholder="Restaurant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Restaurants</SelectItem>
                  {restaurants?.map((restaurant) => (
                    <SelectItem key={restaurant.id} value={restaurant.id}>
                      {restaurant.companyName || restaurant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-full md:w-[180px] text-sm" data-testid="select-status">
                  <Filter className="h-3.5 w-3.5 mr-2 shrink-0" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="pending">Neu</SelectItem>
                  <SelectItem value="confirmed">Bestätigt</SelectItem>
                  <SelectItem value="in_delivery">In Lieferung</SelectItem>
                  <SelectItem value="delivered">Geliefert</SelectItem>
                  <SelectItem value="cancelled">Storniert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 md:gap-3 md:flex-row md:items-end">
              <div className="flex gap-2 flex-1">
                <div className="flex-1">
                  <label className="text-[10px] md:text-xs text-muted-foreground mb-1 block">Von</label>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="pl-9 text-sm"
                      data-testid="input-date-from"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] md:text-xs text-muted-foreground mb-1 block">Bis</label>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="pl-9 text-sm"
                      data-testid="input-date-to"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-1">
                <div className="flex-1">
                  <label className="text-[10px] md:text-xs text-muted-foreground mb-1 block">Min. Betrag</label>
                  <div className="relative">
                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      className="pl-9 text-sm"
                      min="0"
                      step="0.01"
                      data-testid="input-min-amount"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] md:text-xs text-muted-foreground mb-1 block">Max. Betrag</label>
                  <div className="relative">
                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      className="pl-9 text-sm"
                      min="0"
                      step="0.01"
                      data-testid="input-max-amount"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Sortieren:</span>
              {([
                { field: "date" as SortField, label: "Datum" },
                { field: "amount" as SortField, label: "Betrag" },
                { field: "status" as SortField, label: "Status" },
                { field: "restaurant" as SortField, label: "Restaurant" },
              ]).map(({ field, label }) => {
                const SortIcon = getSortIcon(field);
                const isActive = sortField === field;
                return (
                  <Button
                    key={field}
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    onClick={() => toggleSort(field)}
                    data-testid={`button-sort-${field}`}
                    className="text-xs"
                  >
                    <SortIcon className="h-3 w-3 mr-1" />
                    {label}
                  </Button>
                );
              })}
              {hasActiveFilters && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAllFilters}
                  className="text-xs text-destructive ml-auto"
                  data-testid="button-clear-filters"
                >
                  <X className="h-3 w-3 mr-1" />
                  Filter zurücksetzen
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {isLoading ? (
            <div className="space-y-3 md:space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 md:h-32" />
              ))}
            </div>
          ) : filteredAndSortedOrders.length > 0 ? (
            <div className="space-y-3 md:space-y-4">
              {filteredAndSortedOrders.map((order) => (
                <Card key={order.id} className={`hover-elevate ${getStatusCardBg(order.status)}`} data-testid={`history-order-${order.id}`}>
                  <CardContent className="p-3 md:p-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4">
                      <div className="flex items-start gap-2 md:gap-4">
                        <div className={`flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-md shrink-0 ${getStatusColor(order.status)}`}>
                          <HistoryIcon className="h-4 w-4 md:h-5 md:w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                            <p className="font-medium text-sm md:text-base">#{order.id.slice(0, 8)}</p>
                            <Badge className={`${getStatusColor(order.status)} text-[10px] md:text-xs`} variant="outline">
                              {getStatusLabel(order.status)}
                            </Badge>
                          </div>
                          <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1 flex items-center gap-1 truncate">
                            <Building2 className="h-2.5 w-2.5 md:h-3 md:w-3 shrink-0" />
                            <span className="truncate">{order.restaurant?.companyName || order.restaurant?.name}</span>
                          </p>
                          <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5 md:h-3 md:w-3" />
                            {format(new Date(order.createdAt), "dd.MM.yy HH:mm", { locale: de })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex items-center justify-between md:block border-t md:border-t-0 pt-2 md:pt-0 mt-1 md:mt-0">
                        <p className="text-base md:text-lg font-bold">{order.totalAmount}€</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground">
                          {order.items?.length || 0} Artikel
                        </p>
                      </div>
                    </div>
                    {order.items && order.items.length > 0 && (
                      <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-border">
                        <div className="grid gap-1.5 md:gap-2 sm:grid-cols-2">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between text-xs md:text-sm">
                              <span className="text-muted-foreground flex items-center gap-1.5 md:gap-2">
                                <Package className="h-2.5 w-2.5 md:h-3 md:w-3" />
                                {item.quantity}x {item.productName}
                              </span>
                              <span>{item.totalPrice}€</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 md:py-12">
              <HistoryIcon className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground/50 mb-2 md:mb-3" />
              <p className="text-sm md:text-base text-muted-foreground">Keine Bestellungen</p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                Andere Filter versuchen
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
