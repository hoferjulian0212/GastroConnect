import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Mail, Phone, Hotel, RefreshCw } from "lucide-react";
import type { PmsConnectionRequest, PmsProvider, User } from "@shared/schema";

type AdminRequest = PmsConnectionRequest & {
  restaurant: User | null;
  provider: PmsProvider | null;
};

const STATUSES = ["pending", "in_progress", "approved", "rejected", "completed"] as const;

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  completed: "bg-emerald-100 text-emerald-700",
};

function RequestRow({ request }: { request: AdminRequest }) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(request.adminNotes ?? "");

  const updateMutation = useMutation({
    mutationFn: (data: { status?: string; adminNotes?: string }) =>
      apiRequest("PATCH", `/api/admin/pms/requests/${request.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pms/requests"] });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  return (
    <Card data-testid={`request-${request.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Hotel className="w-4 h-4" />
            {request.hotelName}
          </CardTitle>
          <Badge className={STATUS_STYLES[request.status] ?? ""} data-testid={`status-${request.id}`}>
            {request.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            {request.provider?.name ?? request.pmsName}
          </span>
          <span className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            {request.contactName} &lt;{request.contactEmail}&gt;
          </span>
          {request.contactPhone && (
            <span className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" />
              {request.contactPhone}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          {request.restaurant && <span>Restaurant: {request.restaurant.name}</span>}
          {request.roomCount != null && <span>Rooms: {request.roomCount}</span>}
          {request.requestedFeatures && request.requestedFeatures.length > 0 && (
            <span>Features: {request.requestedFeatures.join(", ")}</span>
          )}
          <span>Created: {new Date(request.createdAt).toLocaleDateString()}</span>
        </div>

        {request.message && (
          <p className="rounded-lg bg-muted/40 p-2 text-foreground">{request.message}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="sm:w-48">
            <Label className="text-xs">Status</Label>
            <Select
              value={request.status}
              onValueChange={(v) => updateMutation.mutate({ status: v })}
            >
              <SelectTrigger className="mt-1" data-testid={`select-status-${request.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} data-testid={`option-${s}-${request.id}`}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="text-xs">Admin notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
              data-testid={`notes-${request.id}`}
            />
          </div>
          <Button
            onClick={() => updateMutation.mutate({ adminNotes: notes })}
            disabled={updateMutation.isPending}
            data-testid={`button-save-notes-${request.id}`}
          >
            Save notes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPmsRequests() {
  const { data: requests, isLoading, refetch, isFetching } = useQuery<AdminRequest[]>({
    queryKey: ["/api/admin/pms/requests"],
  });

  return (
    <div className="min-h-dvh bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold" data-testid="admin-title">PMS Connection Requests</h1>
            <p className="text-sm text-muted-foreground">Manage hotel PMS integration requests.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : requests && requests.length > 0 ? (
          <div className="space-y-3">
            {requests.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground" data-testid="empty-requests">
              No PMS connection requests yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
