import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Paperclip, Upload, FileText, FileImage, File, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { DocumentWithDetails } from "@shared/schema";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "docx"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return FileImage;
  if (type === "application/pdf") return FileText;
  return File;
}

function getFileTypeLabel(type: string): string {
  if (type.startsWith("image/jpeg")) return "JPG";
  if (type.startsWith("image/png")) return "PNG";
  if (type.startsWith("image/webp")) return "WEBP";
  if (type === "application/pdf") return "PDF";
  if (type.includes("wordprocessingml")) return "DOCX";
  return "Datei";
}

interface AttachmentPopoverProps {
  conversationId: string;
  senderId: string;
  onSendAttachment: (content: string) => void;
  disabled?: boolean;
}

export function AttachmentPopover({
  conversationId,
  senderId,
  onSendAttachment,
  disabled,
}: AttachmentPopoverProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);

  const { data: systemDocs } = useQuery<DocumentWithDetails[]>({
    queryKey: ["/api/conversations", conversationId, "documents", senderId],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${conversationId}/documents?userId=${senderId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!conversationId && !!senderId && showDocPicker,
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast({
        title: "Dateityp nicht erlaubt",
        description: "Erlaubte Formate: PDF, JPG, PNG, WEBP, DOCX",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "Datei zu groß",
        description: "Maximale Dateigröße: 10 MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setIsOpen(false);

    try {
      const urlRes = await apiRequest("POST", "/api/attachments/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
        conversationId,
        senderId,
      });
      const { uploadURL, objectPath } = await urlRes.json();

      await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      const attachmentData = {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileUrl: objectPath,
      };
      onSendAttachment(JSON.stringify(attachmentData));
    } catch (error) {
      console.error("Upload failed:", error);
      toast({
        title: "Upload fehlgeschlagen",
        description: "Die Datei konnte nicht hochgeladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDocumentAttach = (doc: DocumentWithDetails) => {
    const attachmentData = {
      fileName: doc.title,
      fileType: "application/pdf",
      fileSize: 0,
      fileUrl: doc.fileUrl,
      systemDocument: true,
      documentId: doc.id,
      orderId: doc.orderId,
    };
    onSendAttachment(JSON.stringify(attachmentData));
    setIsOpen(false);
    setShowDocPicker(false);
  };

  const getDocTypeLabel = (type: string) => {
    switch (type) {
      case "delivery_note": return "Lieferschein";
      case "invoice": return "Rechnung";
      default: return "Dokument";
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-file-upload"
      />
      <Popover open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setShowDocPicker(false); }}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled || isUploading}
            data-testid="button-attachment"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start" side="top">
          {!showDocPicker ? (
            <div className="space-y-1">
              <button
                className="w-full flex items-center gap-2 p-2 rounded-md text-sm hover-elevate text-left"
                onClick={() => {
                  setIsOpen(false);
                  fileInputRef.current?.click();
                }}
                data-testid="button-upload-file"
              >
                <Upload className="h-4 w-4" />
                Datei hochladen
              </button>
              <button
                className="w-full flex items-center gap-2 p-2 rounded-md text-sm hover-elevate text-left"
                onClick={() => setShowDocPicker(true)}
                data-testid="button-attach-document"
              >
                <FileText className="h-4 w-4" />
                System-Dokument anhängen
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setShowDocPicker(false)}
              >
                Zurück
              </button>
              {systemDocs && systemDocs.length > 0 ? (
                <ScrollArea className="max-h-48">
                  <div className="space-y-1">
                    {systemDocs.map((doc) => (
                      <button
                        key={doc.id}
                        className="w-full flex items-center gap-2 p-2 rounded-md text-sm hover-elevate text-left"
                        onClick={() => handleDocumentAttach(doc)}
                        data-testid={`button-attach-doc-${doc.id}`}
                      >
                        <FileText className="h-4 w-4 text-blue-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{doc.title}</p>
                          <p className="text-[10px] text-muted-foreground">{getDocTypeLabel(doc.type)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-xs text-muted-foreground py-2 text-center">Keine Dokumente vorhanden</p>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

interface AttachmentData {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  systemDocument?: boolean;
  documentId?: string;
  orderId?: string;
}

export function parseAttachmentContent(content: string): AttachmentData | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

interface AttachmentMessageCardProps {
  content: string;
  timestamp: string;
  isOwn: boolean;
  conversationId?: string;
  userId?: string;
}

export function AttachmentMessageCard({ content, timestamp, isOwn, conversationId, userId }: AttachmentMessageCardProps) {
  const data = parseAttachmentContent(content);
  if (!data) return <p className="text-sm">{content}</p>;

  const IconComponent = getFileIcon(data.fileType);
  const typeLabel = data.systemDocument ? "System-Dokument" : getFileTypeLabel(data.fileType);
  const isImage = data.fileType.startsWith("image/");

  const getDownloadUrl = () => {
    if (data.systemDocument && data.orderId) {
      return `/api/orders/${data.orderId}/delivery-note/download`;
    }
    const params = new URLSearchParams({ fileUrl: data.fileUrl });
    if (userId) params.append("userId", userId);
    if (conversationId) params.append("conversationId", conversationId);
    return `/api/attachments/download?${params.toString()}`;
  };

  return (
    <div className={`max-w-[70%] rounded-lg border bg-card shadow-sm overflow-hidden ${isOwn ? "border-secondary" : "border-border"}`}>
      {isImage && data.fileUrl && (
        <div className="max-h-48 overflow-hidden">
          <img
            src={getDownloadUrl()}
            alt={data.fileName}
            className="w-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <IconComponent className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{data.fileName}</p>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{typeLabel}</span>
              {data.fileSize > 0 && <span>{formatFileSize(data.fileSize)}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className={`px-3 py-2 border-t ${isOwn ? "border-secondary" : "border-border"}`}>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => window.open(getDownloadUrl(), "_blank")}
          data-testid="button-download-attachment"
        >
          <Download className="h-3 w-3 mr-1" />
          Herunterladen
        </Button>
      </div>
      <div className="px-3 py-1 text-right">
        <span className="text-[10px] text-muted-foreground">{timestamp}</span>
      </div>
    </div>
  );
}

export { formatFileSize, getFileIcon, getFileTypeLabel };
