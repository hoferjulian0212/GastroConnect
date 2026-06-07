import { MobilePageHeader, MobileSearchBar } from "@/components/mobile";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { PartnerMap } from "@/components/PartnerMap";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search, Package, MessageSquare, Phone, Euro, UserCog } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import type { User, Member } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { StarRating } from "@/components/StarRating";
import { PartnerContactsList } from "@/components/PartnerContactsList";

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

  const { data: movData } = useQuery<Record<string, { minimumValue: string; zone: string | null }>>({
    queryKey: [`/api/minimum-order-values/for-restaurant?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const supplierIds = (suppliers ?? []).map(s => s.id).sort().join(",");
  const { data: ratingSummaries } = useQuery<Record<string, { avg: number; count: number }>>({
    queryKey: ["/api/supplier-ratings/summary", supplierIds],
    queryFn: async () => {
      if (!supplierIds) return {};
      const res = await fetch(`/api/supplier-ratings/summary?supplierIds=${encodeURIComponent(supplierIds)}`);
      if (!res.ok) throw new Error("Failed to fetch summaries");
      return res.json();
    },
    enabled: !!supplierIds,
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
    <div className="space-y-4 md:space-y-6 max-w-6xl mx-auto pb-[var(--mobile-bottom-pad)] md:pb-0">
      <MobilePageHeader
        title={lang === "de" ? "Lieferanten" : "Fornitori"}
        subtitle={lang === "de" ? "Ihre verbundenen Lieferanten" : "I tuoi fornitori collegati"}
        search={
          <MobileSearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t("suppliers", "searchSuppliers")}
          />
        }
        testId="mobile-header-suppliers"
      />
      <div className="hidden md:block relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("suppliers", "searchSuppliers")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-suppliers"
        />
      </div>

      <PartnerMap
        partners={filteredSuppliers ?? []}
        lang={lang}
        messageLabel={lang === "de" ? "Nachricht" : "Messaggio"}
        onMessage={handleMessage}
        primaryActionLabel={lang === "de" ? "Katalog" : "Catalogo"}
        primaryActionIcon={<Package className="mr-1.5 h-3.5 w-3.5" />}
        onPrimaryAction={handleViewCatalog}
        onBackfilled={() =>
          queryClient.invalidateQueries({ queryKey: ["/api/users?role=supplier"] })
        }
        testIdPrefix="suppliers"
      />

      {isLoading ? (
        <div className="grid gap-2.5 md:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : filteredSuppliers && filteredSuppliers.length > 0 ? (
        <div className="grid gap-2.5 md:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {filteredSuppliers.map((supplier) => (
            <Card
              key={supplier.id}
              className="cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-px overflow-hidden"
              data-testid={`supplier-card-${supplier.id}`}
              onClick={() => handleViewCatalog(supplier.id)}
            >
              <CardContent className="p-3 md:p-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={supplier.profileImageUrl || undefined} alt={supplier.companyName || supplier.name} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                      {(supplier.companyName || supplier.name).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm truncate leading-tight">
                      {supplier.companyName || supplier.name}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {supplier.name}
                      {movData && movData[supplier.id] && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px]">
                          · <Euro className="h-2.5 w-2.5 inline" />{parseFloat(movData[supplier.id].minimumValue).toFixed(0)}
                        </span>
                      )}
                    </p>
                    {currentUser?.id && (
                      <ResponsibleVertreterBadge supplierId={supplier.id} restaurantId={currentUser.id} lang={lang} />
                    )}
                    {ratingSummaries?.[supplier.id] && ratingSummaries[supplier.id].count > 0 && (
                      <StarRating
                        value={ratingSummaries[supplier.id].avg}
                        size="sm"
                        showValue
                        count={ratingSummaries[supplier.id].count}
                        className="mt-0.5"
                        data-testid={`supplier-rating-${supplier.id}`}
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {supplier.phone && (
                      <a
                        href={`tel:${supplier.phone}`}
                        data-testid={`button-call-${supplier.id}`}
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
                      onClick={() => handleMessage(supplier.id)}
                      data-testid={`button-message-${supplier.id}`}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
                      onClick={() => handleViewCatalog(supplier.id)}
                      data-testid={`button-view-catalog-${supplier.id}`}
                    >
                      <Package className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <PartnerContactsList
                  orgId={supplier.id}
                  orgPhone={supplier.phone}
                  onMessage={() => handleMessage(supplier.id)}
                  lang={lang}
                />
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

function ResponsibleVertreterBadge({
  supplierId,
  restaurantId,
  lang,
}: {
  supplierId: string;
  restaurantId: string;
  lang: "de" | "it";
}) {
  const { data } = useQuery<{ member: Member | null }>({
    queryKey: [`/api/vertreter-assignments/responsible?supplierId=${supplierId}&restaurantId=${restaurantId}`],
    enabled: !!supplierId && !!restaurantId,
  });
  if (!data?.member) return null;
  const member = data.member;
  const memberInitials = member.name
    ? member.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";
  return (
    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5" data-testid={`text-responsible-vertreter-${supplierId}`}>
      <Avatar className="h-4 w-4 shrink-0">
        <AvatarImage src={member.profileImageUrl || undefined} alt={member.name} />
        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-[8px]">
          {memberInitials}
        </AvatarFallback>
      </Avatar>
      {lang === "it" ? "Referente" : "Ansprechpartner"}: {member.name}
    </p>
  );
}
