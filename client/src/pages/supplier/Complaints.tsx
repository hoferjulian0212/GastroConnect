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
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-2 md:gap-3">
        <AlertCircle className="h-6 w-6 md:h-8 md:w-8 text-primary" />
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Reklamationen</h1>
          <p className="text-sm md:text-base text-muted-foreground">Eingegangene Reklamationen</p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:gap-4">
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary">{complaints?.length || 0}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Gesamt</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold">
                {complaints?.filter(c => {
                  const date = new Date(c.createdAt);
                  const now = new Date();
                  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                }).length || 0}
              </div>
              <p className="text-xs md:text-sm text-muted-foreground">Diesen Monat</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="text-base md:text-lg">Alle Reklamationen</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          {isLoading ? (
            <div className="space-y-3 md:space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 md:h-24 w-full" />
              ))}
            </div>
          ) : complaints && complaints.length > 0 ? (
            <div className="space-y-3 md:space-y-4">
              {complaints.map((complaint) => (
                <div
                  key={complaint.id}
                  className="rounded-lg border p-3 md:p-4 space-y-2 md:space-y-3"
                  data-testid={`complaint-${complaint.id}`}
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4">
                    <div className="flex items-center gap-2 md:gap-3">
                      <Avatar className="h-8 w-8 md:h-10 md:w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs md:text-sm">
                          {complaint.restaurant?.companyName?.substring(0, 2).toUpperCase() || "??"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm md:text-base truncate">{complaint.restaurant?.companyName || "Unbekannt"}</div>
                        <div className="text-xs md:text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5 md:h-3 md:w-3" />
                          {formatDate(complaint.createdAt)}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] md:text-xs self-start md:self-auto">
                        #{complaint.orderId.substring(0, 8)}
                      </Badge>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-sm md:text-base mb-0.5 md:mb-1">{complaint.title}</h4>
                    <p className="text-xs md:text-sm text-muted-foreground">{complaint.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 md:py-12 text-muted-foreground">
              <AlertCircle className="mx-auto h-10 w-10 md:h-12 md:w-12 mb-2 md:mb-3 opacity-50" />
              <p className="text-base md:text-lg font-medium">Keine Reklamationen</p>
              <p className="text-xs md:text-sm">Keine Reklamationen erhalten.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
