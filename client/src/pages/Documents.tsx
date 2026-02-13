import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, ClipboardList, Building2, Clock } from "lucide-react";
import type { DocumentWithDetails } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const getDocTypeLabel = (type: string) => {
  switch (type) {
    case "delivery_note": return "Lieferschein";
    case "invoice": return "Rechnung";
    default: return "Dokument";
  }
};

const getDocTypeColor = (type: string) => {
  switch (type) {
    case "delivery_note": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "invoice": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    default: return "bg-muted text-muted-foreground";
  }
};

export default function Documents() {
  const { currentUser, currentRole } = useUser();

  const { data: documents, isLoading } = useQuery<DocumentWithDetails[]>({
    queryKey: ["/api/documents", currentUser?.id, currentRole],
    queryFn: async () => {
      const res = await fetch(`/api/documents?userId=${currentUser?.id}&role=${currentRole}`);
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!currentUser?.id,
  });

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Dokument-Center</h1>
        <p className="text-sm md:text-base text-muted-foreground">Alle Ihre Dokumente an einem Ort</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : documents && documents.length > 0 ? (
        <div className="space-y-3">
          {documents.map((doc) => {
            const otherParty = currentRole === "restaurant" ? doc.supplier : doc.restaurant;
            return (
              <Card key={doc.id} className="hover-elevate" data-testid={`document-card-${doc.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className={`flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-md shrink-0 ${getDocTypeColor(doc.type)}`}>
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm md:text-base">{doc.title}</p>
                        <Badge className={`${getDocTypeColor(doc.type)} text-[10px] md:text-xs`} variant="outline">
                          {getDocTypeLabel(doc.type)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs md:text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {otherParty?.companyName || otherParty?.name || "Unbekannt"}
                        </span>
                        <span className="flex items-center gap-1">
                          <ClipboardList className="h-3 w-3" />
                          #{doc.orderId.slice(0, 8)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(doc.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (doc.type === "delivery_note") {
                          window.open(`/api/orders/${doc.orderId}/delivery-note/download`, "_blank");
                        } else {
                          window.open(doc.fileUrl, "_blank");
                        }
                      }}
                      data-testid={`button-download-${doc.id}`}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      <span className="hidden md:inline">Herunterladen</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Keine Dokumente vorhanden</p>
            <p className="text-xs text-muted-foreground mt-1">Dokumente werden automatisch erstellt wenn Bestellungen verarbeitet werden</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
