import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, Search, Mail, Phone, Package, MessageSquare } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import type { User } from "@shared/schema";

export default function RestaurantSuppliers() {
  const { currentUser } = useUser();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

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
          <h1 className="text-xl md:text-2xl font-bold">Lieferanten</h1>
          <p className="text-sm text-muted-foreground">
            Alle Lieferanten in Ihrem Liefergebiet
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Lieferant suchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-suppliers"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : filteredSuppliers && filteredSuppliers.length > 0 ? (
        <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSuppliers.map((supplier) => (
            <Card 
              key={supplier.id} 
              className="cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.01]" 
              data-testid={`supplier-card-${supplier.id}`}
            >
              <CardContent className="p-4 md:p-6">
                <div className="flex items-start gap-4 mb-4">
                  <Avatar className="h-12 w-12 rounded-xl bg-primary/10">
                    <AvatarImage src={supplier.profileImageUrl || undefined} alt={supplier.companyName || supplier.name} className="rounded-xl" />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg rounded-xl">
                      {(supplier.companyName || supplier.name).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-primary rounded-full" />
                    </div>
                  </div>
                </div>

                <h3 className="font-semibold text-base md:text-lg mb-1">
                  {supplier.companyName || supplier.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Lebensmittel • {supplier.name}
                </p>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium truncate ml-2">{supplier.email}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium">{supplier.phone || "-"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1 gap-2"
                    onClick={() => handleViewCatalog(supplier.id)}
                    data-testid={`button-view-catalog-${supplier.id}`}
                  >
                    <Package className="h-4 w-4" />
                    Katalog
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="gap-2"
                    onClick={() => handleMessage(supplier.id)}
                    data-testid={`button-message-${supplier.id}`}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Nachricht
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card 
            className="cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.01] border-2 border-dashed border-primary/30 bg-primary/5"
            data-testid="card-add-supplier"
          >
            <CardContent className="p-4 md:p-6 h-full flex flex-col items-center justify-center min-h-[240px]">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Plus className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm font-medium text-primary">Neuen Lieferanten hinzufügen</span>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Package className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-lg font-medium mb-1">Keine Lieferanten gefunden</p>
          <p className="text-sm text-muted-foreground mb-4">
            {searchQuery ? "Versuchen Sie einen anderen Suchbegriff" : "Es sind noch keine Lieferanten verfügbar"}
          </p>
        </div>
      )}
    </div>
  );
}
