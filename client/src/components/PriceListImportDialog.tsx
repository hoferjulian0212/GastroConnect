import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/context/LanguageContext";
import { Upload, Loader2, Trash2, Sparkles, FileText } from "lucide-react";

interface ParsedRow {
  name: string;
  price: number | null;
  unit: string | null;
  articleNumber: string | null;
  gtin: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  userId?: string;
  userName?: string | null;
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PriceListImportDialog({ open, onOpenChange, supplierId, userId, userName }: Props) {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");

  const tr = (de: string, it: string) => (lang === "de" ? de : it);

  const reset = () => {
    setRows(null);
    setFileName("");
    setIsParsing(false);
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setIsParsing(true);
    setRows(null);
    try {
      const dataUri = await fileToDataUri(file);
      const res = await apiRequest("POST", "/api/supplier/price-list/parse", {
        fileData: dataUri,
        mimeType: file.type,
      });
      const data = await res.json();
      const parsed: ParsedRow[] = Array.isArray(data?.products) ? data.products : [];
      if (parsed.length === 0) {
        toast({ title: tr("Keine Produkte erkannt", "Nessun prodotto rilevato"), variant: "destructive" });
      }
      setRows(parsed);
    } catch (e: any) {
      const msg = typeof e?.message === "string" ? e.message : "";
      toast({
        title: tr("Lesen fehlgeschlagen", "Lettura non riuscita"),
        description: msg.includes("ai_not_configured")
          ? tr("KI-Integration ist noch nicht eingerichtet.", "L'integrazione AI non è ancora configurata.")
          : tr("Bitte ein klareres Bild oder PDF verwenden.", "Usa un'immagine o un PDF più chiaro."),
        variant: "destructive",
      });
      reset();
    } finally {
      setIsParsing(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<ParsedRow>) => {
    setRows((prev) => (prev ? prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)) : prev));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  };

  const validRows = (rows || []).filter((r) => r.name.trim() && r.price != null && Number(r.price) > 0);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setIsImporting(true);
    try {
      const res = await apiRequest("POST", "/api/supplier/price-list/import", {
        supplierId,
        userId,
        userName,
        rows: validRows,
      });
      const data = await res.json();
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/supplier/products"),
      });
      toast({
        title: tr("Import abgeschlossen", "Importazione completata"),
        description: tr(
          `${data.created} neu, ${data.updated} aktualisiert`,
          `${data.created} nuovi, ${data.updated} aggiornati`,
        ),
      });
      reset();
      onOpenChange(false);
    } catch {
      toast({ title: tr("Import fehlgeschlagen", "Importazione non riuscita"), variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col" data-testid="dialog-price-list-import">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {tr("Preisliste importieren", "Importa listino prezzi")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "Lade eine Preisliste als Bild oder PDF hoch. Die KI liest die Produkte aus – du prüfst sie vor dem Import.",
              "Carica un listino come immagine o PDF. L'AI legge i prodotti — li verifichi prima dell'importazione.",
            )}
          </DialogDescription>
        </DialogHeader>

        {!rows && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-10 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              data-testid="input-price-list-file"
            />
            {isParsing ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {tr("Preisliste wird gelesen…", "Lettura del listino…")}
                </p>
                {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
              </>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileText className="h-6 w-6" />
                </div>
                <Button onClick={() => fileInputRef.current?.click()} className="gap-2" data-testid="button-choose-price-list">
                  <Upload className="h-4 w-4" />
                  {tr("Datei auswählen", "Scegli file")}
                </Button>
                <p className="text-xs text-muted-foreground">{tr("Bild (JPG/PNG) oder PDF", "Immagine (JPG/PNG) o PDF")}</p>
              </>
            )}
          </div>
        )}

        {rows && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground" data-testid="text-parsed-count">
                {tr(`${rows.length} Produkte erkannt`, `${rows.length} prodotti rilevati`)}
              </p>
              <Button variant="ghost" size="sm" onClick={reset} data-testid="button-import-restart">
                {tr("Andere Datei", "Altro file")}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              <div className="space-y-2">
                {rows.map((r, idx) => {
                  const invalid = !r.name.trim() || r.price == null || Number(r.price) <= 0;
                  return (
                    <div
                      key={idx}
                      className={`grid grid-cols-12 gap-2 rounded-xl border p-2 ${invalid ? "border-destructive/40 bg-destructive/[0.03]" : ""}`}
                      data-testid={`row-parsed-${idx}`}
                    >
                      <Input
                        className="col-span-5 h-9"
                        value={r.name}
                        placeholder={tr("Name", "Nome")}
                        onChange={(e) => updateRow(idx, { name: e.target.value })}
                        data-testid={`input-parsed-name-${idx}`}
                      />
                      <Input
                        className="col-span-3 h-9"
                        type="number"
                        step="0.01"
                        value={r.price ?? ""}
                        placeholder={tr("Preis", "Prezzo")}
                        onChange={(e) => updateRow(idx, { price: e.target.value === "" ? null : parseFloat(e.target.value) })}
                        data-testid={`input-parsed-price-${idx}`}
                      />
                      <Input
                        className="col-span-3 h-9"
                        value={r.unit ?? ""}
                        placeholder={tr("Einheit", "Unità")}
                        onChange={(e) => updateRow(idx, { unit: e.target.value || null })}
                        data-testid={`input-parsed-unit-${idx}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="col-span-1 h-9 w-9 text-muted-foreground"
                        onClick={() => removeRow(idx)}
                        data-testid={`button-remove-parsed-${idx}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                {tr(`${validRows.length} werden importiert`, `${validRows.length} verranno importati`)}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} data-testid="button-import-cancel">
                  {tr("Abbrechen", "Annulla")}
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={validRows.length === 0 || isImporting}
                  className="gap-2"
                  data-testid="button-import-confirm"
                >
                  {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {tr("Importieren", "Importa")}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
