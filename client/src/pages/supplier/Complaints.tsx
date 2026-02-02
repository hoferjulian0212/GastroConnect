import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Calendar } from "lucide-react";
import type { ComplaintWithDetails } from "@shared/schema";

export default function SupplierComplaints() {
  const { currentUser } = useUser();

  const { data: complaints, isLoading } = useQuery<ComplaintWithDetails[]>({
    queryKey: [`/api/complaints?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Reklamationen</h1>
          <p className="text-muted-foreground">Eingegangene Reklamationen von Restaurants</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{complaints?.length || 0}</div>
              <p className="text-sm text-muted-foreground">Reklamationen gesamt</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">
                {complaints?.filter(c => {
                  const date = new Date(c.createdAt);
                  const now = new Date();
                  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                }).length || 0}
              </div>
              <p className="text-sm text-muted-foreground">Diesen Monat</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Alle Reklamationen</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : complaints && complaints.length > 0 ? (
            <div className="space-y-4">
              {complaints.map((complaint) => (
                <div
                  key={complaint.id}
                  className="rounded-lg border p-4 space-y-3"
                  data-testid={`complaint-${complaint.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {complaint.restaurant?.companyName?.substring(0, 2).toUpperCase() || "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{complaint.restaurant?.companyName || "Unbekanntes Restaurant"}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(complaint.createdAt)}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline">
                        Bestellung #{complaint.orderId.substring(0, 8)}
                      </Badge>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-1">{complaint.title}</h4>
                    <p className="text-sm text-muted-foreground">{complaint.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="mx-auto h-12 w-12 mb-3 opacity-50" />
              <p className="text-lg font-medium">Keine Reklamationen</p>
              <p className="text-sm">Sie haben noch keine Reklamationen erhalten.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
