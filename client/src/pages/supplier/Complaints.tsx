import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertCircle, Calendar, FileVideo, FileImage, Clock, Loader2, CheckCircle, XCircle, Settings, MessageSquare, Send } from "lucide-react";
import type { ComplaintWithDetails, ComplaintCommentWithUser } from "@shared/schema";

export default function SupplierComplaints() {
  const { currentUser } = useUser();
  const { toast } = useToast();

  // Dialog states
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintWithDetails | null>(null);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [newComment, setNewComment] = useState("");

  const { data: complaints, isLoading } = useQuery<ComplaintWithDetails[]>({
    queryKey: [`/api/complaints?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: complaintComments, isLoading: loadingComments } = useQuery<ComplaintCommentWithUser[]>({
    queryKey: ["/api/complaints", selectedComplaint?.id, "comments"],
    queryFn: async () => {
      if (!selectedComplaint?.id) return [];
      const res = await fetch(`/api/complaints/${selectedComplaint.id}/comments`);
      return res.json();
    },
    enabled: !!selectedComplaint?.id && showCommentDialog,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/complaints/${id}`, { status });
    },
    onSuccess: () => {
      toast({ title: "Status aktualisiert", description: "Der Status wurde erfolgreich geändert." });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?supplierId=${currentUser?.id}`] });
      setShowStatusDialog(false);
      setSelectedComplaint(null);
    },
    onError: () => {
      toast({ title: "Fehler", description: "Status konnte nicht aktualisiert werden.", variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ complaintId, content }: { complaintId: string; content: string }) => {
      return apiRequest("POST", `/api/complaints/${complaintId}/comments`, {
        userId: currentUser?.id,
        content,
      });
    },
    onSuccess: () => {
      toast({ title: "Kommentar hinzugefügt", description: "Ihr Kommentar wurde gespeichert." });
      queryClient.invalidateQueries({ queryKey: ["/api/complaints", selectedComplaint?.id, "comments"] });
      setNewComment("");
    },
    onError: () => {
      toast({ title: "Fehler", description: "Kommentar konnte nicht gespeichert werden.", variant: "destructive" });
    },
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

  const formatShortDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  const isVideoFile = (url: string) => {
    return /\.(mp4|webm|mov|avi|mkv)$/i.test(url);
  };

  const formatComplaintStatus = (status: string) => {
    const statusMap: Record<string, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      open: { label: "Offen", icon: Clock, variant: "secondary" },
      in_progress: { label: "In Bearbeitung", icon: Loader2, variant: "default" },
      resolved: { label: "Gelöst", icon: CheckCircle, variant: "outline" },
      closed: { label: "Geschlossen", icon: XCircle, variant: "outline" },
    };
    return statusMap[status] || { label: status, icon: Clock, variant: "secondary" as const };
  };

  const openStatusWizard = (complaint: ComplaintWithDetails) => {
    setSelectedComplaint(complaint);
    setNewStatus(complaint.status);
    setShowStatusDialog(true);
  };

  const openCommentWizard = (complaint: ComplaintWithDetails) => {
    setSelectedComplaint(complaint);
    setShowCommentDialog(true);
    setNewComment("");
  };

  const handleStatusSubmit = () => {
    if (!selectedComplaint || !newStatus) return;
    updateStatusMutation.mutate({ id: selectedComplaint.id, status: newStatus });
  };

  const handleCommentSubmit = () => {
    if (!selectedComplaint || !newComment.trim()) {
      toast({ title: "Fehler", description: "Bitte geben Sie einen Kommentar ein.", variant: "destructive" });
      return;
    }
    addCommentMutation.mutate({ complaintId: selectedComplaint.id, content: newComment.trim() });
  };

  const openCount = complaints?.filter(c => c.status === "open").length || 0;
  const inProgressCount = complaints?.filter(c => c.status === "in_progress").length || 0;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center gap-2 md:gap-3">
        <AlertCircle className="h-6 w-6 md:h-8 md:w-8 text-primary" />
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Reklamationen</h1>
          <p className="text-sm md:text-base text-muted-foreground">Eingegangene Reklamationen verwalten</p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-3 md:gap-4">
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
              <div className="text-2xl md:text-3xl font-bold text-yellow-600">{openCount}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Offen</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-blue-600">{inProgressCount}</div>
              <p className="text-xs md:text-sm text-muted-foreground">In Bearbeitung</p>
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
              {complaints.map((complaint) => {
                const statusInfo = formatComplaintStatus(complaint.status);
                const StatusIcon = statusInfo.icon;

                return (
                  <div
                    key={complaint.id}
                    className="rounded-lg border p-3 md:p-4 space-y-2 md:space-y-3"
                    data-testid={`complaint-${complaint.id}`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-4">
                      <div className="flex items-center gap-2 md:gap-3">
                        <Avatar className="h-8 w-8 md:h-10 md:w-10">
                          <AvatarImage src={complaint.restaurant?.profileImageUrl || undefined} alt={complaint.restaurant?.name} />
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
                      <div className="flex items-center gap-1.5 self-start">
                        <Badge variant={statusInfo.variant} className="text-[10px] md:text-xs shrink-0">
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusInfo.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] md:text-xs">
                          #{complaint.orderId.substring(0, 8)}
                        </Badge>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-sm md:text-base mb-0.5 md:mb-1">{complaint.title}</h4>
                      <p className="text-xs md:text-sm text-muted-foreground">{complaint.description}</p>
                    </div>
                    
                    {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {complaint.mediaUrls.map((url, idx) => (
                          <a 
                            key={idx} 
                            href={`/objects${url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-14 w-14 md:h-16 md:w-16 rounded-lg overflow-hidden border hover:opacity-80 transition-opacity"
                          >
                            {isVideoFile(url) ? (
                              <div className="h-full w-full flex items-center justify-center bg-muted">
                                <FileVideo className="h-5 w-5 text-muted-foreground" />
                              </div>
                            ) : (
                              <img 
                                src={`/objects${url}`} 
                                alt={`Anhang ${idx + 1}`}
                                className="h-full w-full object-cover"
                              />
                            )}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openStatusWizard(complaint)}
                        data-testid={`button-change-status-${complaint.id}`}
                      >
                        <Settings className="h-3.5 w-3.5 mr-1.5" />
                        Status ändern
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openCommentWizard(complaint)}
                        data-testid={`button-add-comment-${complaint.id}`}
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                        Kommentar
                      </Button>
                    </div>
                  </div>
                );
              })}
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

      {/* Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Status ändern</DialogTitle>
            <DialogDescription>
              Wählen Sie den neuen Status für diese Reklamation
            </DialogDescription>
          </DialogHeader>
          
          {selectedComplaint && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-medium text-sm">{selectedComplaint.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedComplaint.restaurant?.companyName} • {formatShortDate(selectedComplaint.createdAt)}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Neuer Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger data-testid="select-complaint-status">
                    <SelectValue placeholder="Status wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Offen
                      </div>
                    </SelectItem>
                    <SelectItem value="in_progress">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4" />
                        In Bearbeitung
                      </div>
                    </SelectItem>
                    <SelectItem value="resolved">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Gelöst
                      </div>
                    </SelectItem>
                    <SelectItem value="closed">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4" />
                        Geschlossen
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowStatusDialog(false)}
              data-testid="button-cancel-status"
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleStatusSubmit}
              disabled={!newStatus || updateStatusMutation.isPending}
              data-testid="button-save-status"
            >
              {updateStatusMutation.isPending ? "Wird gespeichert..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comment Dialog */}
      <Dialog open={showCommentDialog} onOpenChange={setShowCommentDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Kommentare</DialogTitle>
            <DialogDescription>
              Kommentare zur Reklamation anzeigen und hinzufügen
            </DialogDescription>
          </DialogHeader>
          
          {selectedComplaint && (
            <div className="flex flex-col flex-1 min-h-0 space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 shrink-0">
                <div className="font-medium text-sm">{selectedComplaint.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedComplaint.restaurant?.companyName} • {formatShortDate(selectedComplaint.createdAt)}
                </div>
              </div>

              {/* Existing comments */}
              <div className="flex-1 overflow-auto space-y-3 min-h-0">
                {loadingComments ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : complaintComments && complaintComments.length > 0 ? (
                  complaintComments.map((comment) => (
                    <div key={comment.id} className="p-3 rounded-lg border space-y-1">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={comment.user?.profileImageUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {comment.user?.name?.substring(0, 2).toUpperCase() || "??"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{comment.user?.name || "Unbekannt"}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground pl-8">{comment.content}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">Noch keine Kommentare</p>
                  </div>
                )}
              </div>

              {/* Add comment */}
              <div className="space-y-2 shrink-0 border-t pt-4">
                <Label>Neuer Kommentar</Label>
                <div className="flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Schreiben Sie einen Kommentar..."
                    rows={2}
                    className="flex-1"
                    data-testid="input-new-comment"
                  />
                  <Button
                    size="icon"
                    onClick={handleCommentSubmit}
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                    data-testid="button-send-comment"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
