import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search, Package, MessageSquare, Phone } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import type { User } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";

export default function RestaurantSuppliers() {
  const { currentUser } = useUser();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { lang } = useLanguage();
  const t = useT(lang);

  const { data: suppliers, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users?role=supplier"],
    enabled: !!currentUser?.id,
  });

  const filteredSuppliers = suppliers?.filter(supplier =>
    supplier.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleMessage = (supplierId: string) => {
    setLocation(`/restaurant/inbox?to=${supplierId}`);
  };

  const handleViewCatalog = (supplierId: string) => {
    setLocation(`/restaurant/catalog?supplier=${supplierId}`);
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{t("suppliers", "title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("suppliers", "allInDeliveryArea")}
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("suppliers", "searchSuppliers")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-suppliers"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : filteredSuppliers && filteredSuppliers.length > 0 ? (
        <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {filteredSuppliers.map((supplier) => (
            <Card 
              key={supplier.id} 
              className="cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-px hover:scale-[1.003] overflow-hidden" 
              data-testid={`supplier-card-${supplier.id}`}
            >
              <CardContent className="p-4 md:p-6">
                <div className="flex items-start justify-between gap-2 mb-4">
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarImage src={supplier.profileImageUrl || undefined} alt={supplier.companyName || supplier.name} />
                    <AvatarFallback className="bg-muted text-foreground font-bold text-lg">
                      {(supplier.companyName || supplier.name).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {supplier.phone && (
                    <a 
                      href={`tel:${supplier.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                      data-testid={`button-call-${supplier.id}`}
                    >
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-9 w-9 rounded-full bg-muted text-foreground"
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>

                <h3 className="font-semibold text-base md:text-lg mb-1 truncate">
                  {supplier.companyName || supplier.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-4 truncate">
                  {t("suppliers", "foodCategory")} • {supplier.name}
                </p>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <span className="text-muted-foreground shrink-0">{t("profile", "email")}</span>
                    <span className="font-medium truncate">{supplier.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <span className="text-muted-foreground shrink-0">{t("profile", "phone")}</span>
                    <span className="font-medium truncate">{supplier.phone || "-"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1 gap-1.5"
                    onClick={() => handleViewCatalog(supplier.id)}
                    data-testid={`button-view-catalog-${supplier.id}`}
                  >
                    <Package className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("common", "catalog")}</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1 gap-1.5"
                    onClick={() => handleMessage(supplier.id)}
                    data-testid={`button-message-${supplier.id}`}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t("common", "messages")}</span>
                  </Button>
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
          <p className="text-lg font-medium mb-1">{t("suppliers", "noSuppliersFound")}</p>
          <p className="text-sm text-muted-foreground mb-4">
            {searchQuery 
              ? t("suppliers", "tryDifferentSearch") 
              : t("suppliers", "noSuppliersAvailable")}
          </p>
        </div>
      )}
    </div>
  );
}
