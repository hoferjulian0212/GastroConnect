import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Package, Euro, Tag, Layers, Info, Clock, Percent } from "lucide-react";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { de, it } from "date-fns/locale";
import type { ProductWithSupplierAndPromotion } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { ProductImage } from "@/components/ProductImage";
import { pluralizeUnit } from "@/lib/units";

interface ProductDetailDialogProps {
  product: ProductWithSupplierAndPromotion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierName?: string;
}

export default function ProductDetailDialog({ product, open, onOpenChange, supplierName }: ProductDetailDialogProps) {
  const { lang } = useLanguage();
  const dateFnsLocale = lang === "de" ? de : it;
  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-md max-h-[85vh] overflow-y-auto" data-testid="dialog-product-detail">
        <DialogHeader className="sr-only">
          <DialogTitle>{lang === "de" ? "Produktdetails" : "Dettagli prodotto"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 pt-6 pb-6">
          <ProductImage src={product.imageUrl} alt={product.name} className="w-full h-48 rounded-xl" iconClassName="h-16 w-16" fallbackIconColor="text-muted-foreground/20" />

          <div>
            <h3 className="text-lg font-semibold" data-testid="text-product-name">{product.name}</h3>
            {supplierName && (
              <p className="text-sm text-muted-foreground mt-0.5">{supplierName}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {product.inStock ? (
              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                {lang === "de" ? "Verfügbar" : "Disponibile"}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                {lang === "de" ? "Nicht verfügbar" : "Non disponibile"}
              </Badge>
            )}
            {product.category && (
              <Badge variant="secondary">{product.category}</Badge>
            )}
          </div>

          {product.activePromotion && (() => {
            const promo = product.activePromotion;
            const now = new Date();
            const end = new Date(promo.endDate);
            const daysLeft = differenceInDays(end, now);
            const hoursLeft = differenceInHours(end, now);
            const originalPrice = parseFloat(product.price);
            const discountedPrice = originalPrice * (1 - promo.discountPercent / 100);
            let remainingText = "";
            if (lang === "de") {
              if (daysLeft <= 0 && hoursLeft > 0) remainingText = "Endet heute";
              else if (daysLeft === 1) remainingText = "Noch 1 Tag";
              else if (daysLeft > 1) remainingText = `Noch ${daysLeft} Tage`;
              else remainingText = "Endet bald";
            } else {
              if (daysLeft <= 0 && hoursLeft > 0) remainingText = "Termina oggi";
              else if (daysLeft === 1) remainingText = "Ancora 1 giorno";
              else if (daysLeft > 1) remainingText = `Ancora ${daysLeft} giorni`;
              else remainingText = "Termina presto";
            }
            return (
              <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40" data-testid="promo-detail-banner">
                <div className="flex items-center gap-2 mb-2">
                  <Percent className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                    {lang === "de" ? `Aktion: -${promo.discountPercent}% Rabatt` : `Promozione: -${promo.discountPercent}% sconto`}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-muted-foreground line-through text-sm">{originalPrice.toFixed(2)}€</span>
                  <span className="text-xl font-bold text-green-600 dark:text-green-400">{discountedPrice.toFixed(2)}€/{product.unit}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="font-medium">{remainingText} — {lang === "de" ? "bis" : "fino al"} {format(end, "dd.MM.yyyy", { locale: dateFnsLocale })}</span>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-muted/30">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Euro className="h-3.5 w-3.5" />
                {product.activePromotion ? (lang === "de" ? "Originalpreis" : "Prezzo originale") : (lang === "de" ? "Preis" : "Prezzo")}
              </div>
              <p className="font-semibold text-lg" data-testid="text-product-price">{product.price}€</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Layers className="h-3.5 w-3.5" />
                {lang === "de" ? "Einheit" : "Unità"}
              </div>
              <p className="font-semibold text-lg" data-testid="text-product-unit">{product.unit}</p>
            </div>
          </div>

          {product.category && (
            <div className="p-3 rounded-xl bg-muted/30">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Tag className="h-3.5 w-3.5" />
                {lang === "de" ? "Kategorie" : "Categoria"}
              </div>
              <p className="font-medium" data-testid="text-product-category">{product.category}</p>
            </div>
          )}

          {product.description && (
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
                <Info className="h-4 w-4" />
                {lang === "de" ? "Beschreibung" : "Descrizione"}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-product-description">
                {product.description}
              </p>
            </div>
          )}

          {product.stockQuantity != null && product.stockQuantity > 0 && (
            <div className="p-3 rounded-xl bg-muted/30">
              <div className="text-xs text-muted-foreground mb-1">{lang === "de" ? "Lagerbestand" : "Scorte"}</div>
              <p className="font-medium" data-testid="text-product-stock">{product.stockQuantity} {pluralizeUnit(product.unit, product.stockQuantity ?? 0)}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
