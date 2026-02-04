import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Package, ShoppingCart, Plus, Minus, Store, Filter } from "lucide-react";
import type { User, ProductWithSupplier } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function RestaurantCatalog() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const { data: suppliers, isLoading: suppliersLoading } = useQuery<User[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: products, isLoading: productsLoading } = useQuery<ProductWithSupplier[]>({
    queryKey: ["/api/products"],
  });

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, supplierId, quantity }: { productId: string; supplierId: string; quantity: number }) => {
      return apiRequest("POST", "/api/cart", {
        restaurantId: currentUser?.id,
        productId,
        supplierId,
        quantity,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      toast({
        title: "Zum Warenkorb hinzugefügt",
        description: "Das Produkt wurde erfolgreich hinzugefügt.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Das Produkt konnte nicht hinzugefügt werden.",
        variant: "destructive",
      });
    },
  });

  const filteredProducts = products?.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSupplier = selectedSupplier === "all" || product.supplierId === selectedSupplier;
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    return matchesSearch && matchesSupplier && matchesCategory;
  });

  const categories = Array.from(new Set(products?.map(p => p.category).filter(Boolean) || []));

  const updateQuantity = (productId: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, (prev[productId] || 1) + delta),
    }));
  };

  const handleAddToCart = (product: ProductWithSupplier) => {
    const quantity = quantities[product.id] || 1;
    addToCartMutation.mutate({
      productId: product.id,
      supplierId: product.supplierId,
      quantity,
    });
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Produktkatalog</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Durchsuchen Sie Produkte von allen Lieferanten</p>
      </div>

      <Card>
        <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
          <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
              <Input
                placeholder="Produkte suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 md:pl-9 h-9 md:h-10 text-sm"
                data-testid="input-search-products"
              />
            </div>
            <div className="flex flex-row gap-2">
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="w-full sm:w-[150px] md:w-[180px] h-9 md:h-10 text-xs md:text-sm" data-testid="select-supplier">
                  <Store className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 shrink-0" />
                  <SelectValue placeholder="Lieferant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Lieferanten</SelectItem>
                  {suppliers?.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.companyName || supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-[150px] md:w-[180px] h-9 md:h-10 text-xs md:text-sm" data-testid="select-category">
                  <Filter className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 shrink-0" />
                  <SelectValue placeholder="Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Kategorien</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category!}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {productsLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : filteredProducts && filteredProducts.length > 0 ? (
            <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => (
                <Card key={product.id} className="cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.01]" data-testid={`product-card-${product.id}`}>
                  <CardContent className="p-3 flex gap-3">
                    {product.imageUrl ? (
                      <div className="w-20 h-20 md:w-28 md:h-28 shrink-0 rounded-lg overflow-hidden bg-muted">
                        <img 
                          src={product.imageUrl} 
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 md:w-28 md:h-28 shrink-0 rounded-lg bg-muted flex items-center justify-center">
                        <Package className="h-8 w-8 md:h-10 md:w-10 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="font-medium text-sm md:text-base line-clamp-1">{product.name}</h3>
                        {product.inStock ? (
                          <Badge variant="outline" className="shrink-0 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] md:text-xs px-1 md:px-1.5 py-0">
                            Verfügbar
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="shrink-0 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] md:text-xs px-1 md:px-1.5 py-0">
                            Nicht vorrätig
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {product.supplier?.companyName || product.supplier?.name}
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="font-bold text-sm md:text-base">{product.price}€</span>
                        <span className="text-xs text-muted-foreground">/{product.unit}</span>
                      </div>
                      <div className="flex items-center gap-1 md:gap-2 mt-2 justify-end flex-wrap">
                        <div className="flex items-center border border-border rounded-md">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(product.id, -1)}
                            disabled={!product.inStock}
                            data-testid={`button-decrease-${product.id}`}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm" data-testid={`quantity-${product.id}`}>
                            {quantities[product.id] || 1}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(product.id, 1)}
                            disabled={!product.inStock}
                            data-testid={`button-increase-${product.id}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          className="gap-1 text-xs md:text-sm"
                          disabled={!product.inStock || addToCartMutation.isPending}
                          onClick={() => handleAddToCart(product)}
                          data-testid={`button-add-to-cart-${product.id}`}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Hinzufügen</span>
                          <span className="sm:hidden">+</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Keine Produkte gefunden</p>
              <p className="text-sm text-muted-foreground mt-1">
                Versuchen Sie es mit anderen Suchbegriffen
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
