import { useRef, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Download, FileText, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  userId?: string;
  lang: "de" | "it";
}

interface CsvParseResult {
  productId: string;
  articleNumber: string;
  name: string;
  unit: string;
  currentPrice: string;
  newPrice: string;
  currentMinOrderQuantity: string;
  newMinOrderQuantity: string;
  currentStockQuantity: string;
  newStockQuantity: string;
}

interface RowError { rowIndex: number; field?: string; message: string; productId?: string }

const HEADER = [
  "productId",
  "articleNumber",
  "name",
  "unit",
  "currentPrice",
  "newPrice",
  "currentMinOrderQuantity",
  "newMinOrderQuantity",
  "currentStockQuantity",
  "newStockQuantity",
];

function stripBom(s: string) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function detectDelim(headerLine: string): string {
  const cands = [";", ",", "\t"];
  let best = ";"; let bestCount = -1;
  for (const d of cands) {
    const n = headerLine.split(d).length;
    if (n > bestCount) { best = d; bestCount = n; }
  }
  return best;
}

function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let cur = ""; let row: string[] = []; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

const PRICE_RE = /^\d+(\.\d{1,2})?$/;

export default function BulkPriceUpdateDialog({ open, onOpenChange, supplierId, userId, lang }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"export" | "import">("export");
  const [rows, setRows] = useState<CsvParseResult[]>([]);
  const [parseErrors, setParseErrors] = useState<RowError[]>([]);
  const [serverErrors, setServerErrors] = useState<RowError[]>([]);
  const [fileName, setFileName] = useState<string>("");

  const tr = (de: string, it: string) => (lang === "de" ? de : it);

  const handleExport = () => {
    const url = `/api/supplier/products/csv-export?supplierId=${encodeURIComponent(supplierId)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const resetImport = () => {
    setRows([]);
    setParseErrors([]);
    setServerErrors([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setServerErrors([]);
    setFileName(file.name);
    const text = stripBom(await file.text());
    if (!text.trim()) {
      setRows([]);
      setParseErrors([{ rowIndex: -1, message: tr("Datei ist leer.", "Il file è vuoto.") }]);
      return;
    }
    const firstNewline = text.indexOf("\n");
    const headerLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
    const delim = detectDelim(headerLine);
    const raw = parseCsv(text, delim).filter(r => r.some(c => c && c.trim() !== ""));
    if (raw.length === 0) {
      setRows([]);
      setParseErrors([{ rowIndex: -1, message: tr("Keine Daten gefunden.", "Nessun dato trovato.") }]);
      return;
    }
    const header = raw[0].map(h => h.trim());
    const missing = HEADER.filter(h => !header.includes(h));
    if (missing.length > 0) {
      setRows([]);
      setParseErrors([{ rowIndex: -1, message: tr(`Fehlende Spalten: ${missing.join(", ")}`, `Colonne mancanti: ${missing.join(", ")}`) }]);
      return;
    }
    const idx = (k: string) => header.indexOf(k);
    const parsed: CsvParseResult[] = [];
    const errs: RowError[] = [];
    for (let i = 1; i < raw.length; i++) {
      const r = raw[i];
      const row: CsvParseResult = {
        productId: (r[idx("productId")] || "").trim(),
        articleNumber: (r[idx("articleNumber")] || "").trim(),
        name: (r[idx("name")] || "").trim(),
        unit: (r[idx("unit")] || "").trim(),
        currentPrice: (r[idx("currentPrice")] || "").trim(),
        newPrice: (r[idx("newPrice")] || "").trim().replace(",", "."),
        currentMinOrderQuantity: (r[idx("currentMinOrderQuantity")] || "").trim(),
        newMinOrderQuantity: (r[idx("newMinOrderQuantity")] || "").trim(),
        currentStockQuantity: (r[idx("currentStockQuantity")] || "").trim(),
        newStockQuantity: (r[idx("newStockQuantity")] || "").trim(),
      };
      if (!row.productId) {
        errs.push({ rowIndex: i, field: "productId", message: tr("productId fehlt", "productId mancante") });
        parsed.push(row);
        continue;
      }
      if (row.newPrice && !PRICE_RE.test(row.newPrice)) {
        errs.push({ rowIndex: i, productId: row.productId, field: "newPrice", message: tr("Ungültiger Preis (z.B. 12.50)", "Prezzo non valido (es. 12.50)") });
      } else if (row.newPrice && Number(row.newPrice) <= 0) {
        errs.push({ rowIndex: i, productId: row.productId, field: "newPrice", message: tr("Preis muss > 0 sein", "Il prezzo deve essere > 0") });
      }
      if (row.newMinOrderQuantity && !/^\d+$/.test(row.newMinOrderQuantity)) {
        errs.push({ rowIndex: i, productId: row.productId, field: "newMinOrderQuantity", message: tr("Ganzzahl erforderlich", "Numero intero richiesto") });
      } else if (row.newMinOrderQuantity && Number(row.newMinOrderQuantity) < 1) {
        errs.push({ rowIndex: i, productId: row.productId, field: "newMinOrderQuantity", message: tr("Min. 1", "Min. 1") });
      }
      if (row.newStockQuantity && !/^\d+$/.test(row.newStockQuantity)) {
        errs.push({ rowIndex: i, productId: row.productId, field: "newStockQuantity", message: tr("Ganzzahl erforderlich", "Numero intero richiesto") });
      }
      parsed.push(row);
    }
    setRows(parsed);
    setParseErrors(errs);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        supplierId,
        userId,
        rows: rows
          .filter(r => r.productId && (r.newPrice || r.newMinOrderQuantity || r.newStockQuantity))
          .map(r => ({
            productId: r.productId,
            newPrice: r.newPrice || undefined,
            newMinOrderQuantity: r.newMinOrderQuantity ? Number(r.newMinOrderQuantity) : undefined,
            newStockQuantity: r.newStockQuantity ? Number(r.newStockQuantity) : undefined,
          })),
      };
      return apiRequest("POST", "/api/supplier/products/csv-import", payload);
    },
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/products?supplierId=${supplierId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', supplierId] });
      queryClient.invalidateQueries({ queryKey: ['/api/low-stock', supplierId] });
      toast({
        title: tr("Massen-Update erfolgreich", "Aggiornamento in massa riuscito"),
        description: tr(`${data.updated} Produkt(e) aktualisiert.`, `${data.updated} prodotto/i aggiornati.`),
      });
      resetImport();
      onOpenChange(false);
    },
    onError: async (err: any) => {
      let serverErrs: RowError[] = [];
      try {
        // apiRequest throws Error(`${status}: ${text}`) — extract JSON tail.
        const msg = String(err?.message ?? "");
        const colon = msg.indexOf(": ");
        const tail = colon >= 0 ? msg.slice(colon + 2) : msg;
        const body = JSON.parse(tail);
        if (Array.isArray(body?.errors)) serverErrs = body.errors;
      } catch {}
      if (serverErrs.length > 0) setServerErrors(serverErrs);
      toast({
        title: tr("Massen-Update fehlgeschlagen", "Aggiornamento in massa fallito"),
        description: serverErrs.length > 0
          ? tr(`${serverErrs.length} fehlerhafte Zeile(n).`, `${serverErrs.length} riga/e con errori.`)
          : tr("Bitte erneut versuchen.", "Riprova."),
        variant: "destructive",
      });
    },
  });

  const errorByRow = useMemo(() => {
    const map = new Map<number, RowError[]>();
    for (const e of parseErrors) {
      if (e.rowIndex < 0) continue;
      const arr = map.get(e.rowIndex) || [];
      arr.push(e); map.set(e.rowIndex, arr);
    }
    for (const e of serverErrors) {
      // server uses 0-based index of submitted rows; map back via productId
      const pid = e.productId;
      if (!pid) continue;
      const ri = rows.findIndex(r => r.productId === pid);
      if (ri >= 0) {
        const arr = map.get(ri + 1) || [];
        arr.push(e); map.set(ri + 1, arr);
      }
    }
    return map;
  }, [parseErrors, serverErrors, rows]);

  const globalError = parseErrors.find(e => e.rowIndex < 0);
  const changeCount = useMemo(() => {
    return rows.filter(r => {
      const hasChange = r.newPrice || r.newMinOrderQuantity || r.newStockQuantity;
      if (!hasChange) return false;
      const priceDifferent = r.newPrice && r.newPrice !== r.currentPrice;
      const moqDifferent = r.newMinOrderQuantity && r.newMinOrderQuantity !== r.currentMinOrderQuantity;
      const stockDifferent = r.newStockQuantity && r.newStockQuantity !== r.currentStockQuantity;
      return priceDifferent || moqDifferent || stockDifferent;
    }).length;
  }, [rows]);

  const hasErrors = parseErrors.length > 0 || serverErrors.length > 0;
  const canSubmit = !hasErrors && changeCount > 0 && !importMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetImport(); onOpenChange(v); }}>
      <DialogContent className="!max-w-5xl w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto" data-testid="dialog-bulk-update">
        <DialogHeader>
          <DialogTitle>{tr("Massen-Update", "Aggiornamento in massa")}</DialogTitle>
          <DialogDescription>
            {tr(
              "Aktualisieren Sie Preise, Mindestbestellmengen und Lagerbestände mehrerer Produkte gleichzeitig per CSV.",
              "Aggiorna prezzi, quantità minime e scorte di più prodotti contemporaneamente tramite CSV."
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "export" | "import")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" data-testid="tab-export">
              <Download className="h-4 w-4 mr-2" />
              {tr("1. Export", "1. Esporta")}
            </TabsTrigger>
            <TabsTrigger value="import" data-testid="tab-import">
              <Upload className="h-4 w-4 mr-2" />
              {tr("2. Import", "2. Importa")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
              <h3 className="font-medium text-sm">
                {tr("Aktuellen Katalog herunterladen", "Scarica il catalogo attuale")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {tr(
                  "Lädt eine CSV-Datei mit allen Produkten herunter. Tragen Sie neue Werte in die Spalten newPrice, newMinOrderQuantity oder newStockQuantity ein und laden Sie die Datei im Import-Tab hoch. Leere Felder = keine Änderung.",
                  "Scarica un file CSV con tutti i prodotti. Inserisci i nuovi valori nelle colonne newPrice, newMinOrderQuantity o newStockQuantity e caricalo nella scheda Importa. Campi vuoti = nessuna modifica."
                )}
              </p>
              <Button onClick={handleExport} data-testid="button-csv-export" className="gap-2">
                <Download className="h-4 w-4" />
                {tr("CSV herunterladen", "Scarica CSV")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-4 mt-4">
            {rows.length === 0 ? (
              <div className="space-y-3">
                {globalError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300 flex items-start gap-2" data-testid="error-parse-global">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{globalError.message}</span>
                  </div>
                )}
                <div
                  className="rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  data-testid="dropzone-csv"
                >
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm font-medium">{tr("CSV-Datei auswählen", "Seleziona file CSV")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {tr("Nur CSV-Dateien aus dem Export-Tab werden unterstützt.", "Sono supportati solo file CSV dalla scheda Esporta.")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium" data-testid="text-filename">{fileName}</span>
                    <span className="text-muted-foreground">· {rows.length} {tr("Zeilen", "righe")}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={resetImport} data-testid="button-reset-import">
                    <X className="h-4 w-4 mr-1" />
                    {tr("Zurücksetzen", "Reimposta")}
                  </Button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-3 py-1 text-xs font-medium" data-testid="badge-change-count">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {tr(`${changeCount} Produkt(e) werden geändert`, `${changeCount} prodotto/i verranno modificati`)}
                  </span>
                  {hasErrors && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-300 px-3 py-1 text-xs font-medium" data-testid="badge-error-count">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {tr(`${parseErrors.length + serverErrors.length} Fehler`, `${parseErrors.length + serverErrors.length} errori`)}
                    </span>
                  )}
                </div>

                {globalError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                    {globalError.message}
                  </div>
                )}

                <div className="border rounded-lg overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-left">
                        <th className="p-2 font-medium">#</th>
                        <th className="p-2 font-medium">{tr("Artikel-Nr.", "Cod.")}</th>
                        <th className="p-2 font-medium">{tr("Name", "Nome")}</th>
                        <th className="p-2 font-medium">{tr("Einheit", "Unità")}</th>
                        <th className="p-2 font-medium text-right">{tr("Preis", "Prezzo")}</th>
                        <th className="p-2 font-medium text-right">→ {tr("Neu", "Nuovo")}</th>
                        <th className="p-2 font-medium text-right">MOQ</th>
                        <th className="p-2 font-medium text-right">→ {tr("Neu", "Nuovo")}</th>
                        <th className="p-2 font-medium text-right">{tr("Bestand", "Scorta")}</th>
                        <th className="p-2 font-medium text-right">→ {tr("Neu", "Nuovo")}</th>
                        <th className="p-2 font-medium">{tr("Fehler", "Errori")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const rowNum = i + 1;
                        const errs = errorByRow.get(rowNum) || [];
                        const fieldErr = (f: string) => errs.some(e => e.field === f);
                        const cls = (changed: boolean, err: boolean) =>
                          err ? "bg-red-500/20 text-red-900 dark:text-red-200 font-medium"
                              : changed ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 font-medium"
                              : "text-muted-foreground";
                        const priceChanged = !!r.newPrice && r.newPrice !== r.currentPrice;
                        const moqChanged = !!r.newMinOrderQuantity && r.newMinOrderQuantity !== r.currentMinOrderQuantity;
                        const stockChanged = !!r.newStockQuantity && r.newStockQuantity !== r.currentStockQuantity;
                        return (
                          <tr key={i} className="border-t" data-testid={`row-preview-${i}`}>
                            <td className="p-2 text-muted-foreground">{rowNum}</td>
                            <td className="p-2">{r.articleNumber}</td>
                            <td className="p-2 font-medium">{r.name}</td>
                            <td className="p-2 text-muted-foreground">{r.unit}</td>
                            <td className="p-2 text-right">{r.currentPrice}</td>
                            <td className={`p-2 text-right ${cls(priceChanged, fieldErr("newPrice"))}`} data-testid={`cell-new-price-${i}`}>{r.newPrice || "—"}</td>
                            <td className="p-2 text-right">{r.currentMinOrderQuantity}</td>
                            <td className={`p-2 text-right ${cls(moqChanged, fieldErr("newMinOrderQuantity"))}`} data-testid={`cell-new-moq-${i}`}>{r.newMinOrderQuantity || "—"}</td>
                            <td className="p-2 text-right">{r.currentStockQuantity || "—"}</td>
                            <td className={`p-2 text-right ${cls(stockChanged, fieldErr("newStockQuantity"))}`} data-testid={`cell-new-stock-${i}`}>{r.newStockQuantity || "—"}</td>
                            <td className="p-2 text-red-700 dark:text-red-300">
                              {errs.length > 0 && (
                                <div className="space-y-0.5">
                                  {errs.map((e, j) => <div key={j}>{e.message}</div>)}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              data-testid="input-csv-file"
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => { resetImport(); onOpenChange(false); }} data-testid="button-cancel-bulk">
            {tr("Abbrechen", "Annulla")}
          </Button>
          {tab === "import" && (
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!canSubmit}
              data-testid="button-confirm-bulk"
              className="gap-2"
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {tr(`Änderungen anwenden (${changeCount})`, `Applica modifiche (${changeCount})`)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
