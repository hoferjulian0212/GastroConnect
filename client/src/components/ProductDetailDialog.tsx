import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Package, Euro, Tag, Layers, Info, Clock, Percent } from "lucide-react";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { de } from "date-fns/locale";
import type { ProductWithSupplierAndPromotion } from "@shared/schema";

interface ProductDetailDialogProps {
  product: ProductWithSupplierAndPromotion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierName?: string;
}

export default function ProductDetailDialog({ product, open, onOpenChange, supplierName }: ProductDetailDialogProps) {
  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="dialog-product-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Produktdetails
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {product.imageUrl ? (
            <div className="w-full h-48 rounded-lg overflow-hidden bg-muted">
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-full h-48 rounded-lg bg-muted flex items-center justify-center">
              <Package className="h-16 w-16 text-muted-foreground/20" />
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold" data-testid="text-product-name">{product.name}</h3>
            {supplierName && (
              <p className="text-sm text-muted-foreground mt-0.5">{supplierName}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {product.inStock ? (
              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Verfügbar
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                Nicht verfügbar
              </Badge>
            )}
            {product.category && (
              <Badge variant="secondary">{product.category}</Badge>
            )}
          </div>

          <Separator />

          {product.activePromotion && (() => {
            const promo = product.activePromotion;
            const now = new Date();
            const end = new Date(promo.endDate);
            const daysLeft = differenceInDays(end, now);
            const hoursLeft = differenceInHours(end, now);
            const originalPrice = parseFloat(product.price);
            const discountedPrice = originalPrice * (1 - promo.discountPercent / 100);
            let remainingText = "";
            if (daysLeft <= 0 && hoursLeft > 0) {
              remainingText = "Endet heute";
            } else if (daysLeft === 1) {
              remainingText = "Noch 1 Tag";
            } else if (daysLeft > 1) {
              remainingText = `Noch ${daysLeft} Tage`;
            } else {
              remainingText = "Endet bald";
            }
            return (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40" data-testid="promo-detail-banner">
                <div className="flex items-center gap-2 mb-2">
                  <Percent className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-semibold text-green-700 dark:text-green-400">Aktion: -{promo.discountPercent}% Rabatt</span>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-muted-foreground line-through text-sm">{originalPrice.toFixed(2)}€</span>
                  <span className="text-xl font-bold text-green-600 dark:text-green-400">{discountedPrice.toFixed(2)}€/{product.unit}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="font-medium">{remainingText} — bis {format(end, "dd.MM.yyyy", { locale: de })}</span>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Euro className="h-3.5 w-3.5" />
                {product.activePromotion ? "Originalpreis" : "Preis"}
              </div>
              <p className="font-semibold text-lg" data-testid="text-product-price">{product.price}€</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Layers className="h-3.5 w-3.5" />
                Einheit
              </div>
              <p className="font-semibold text-lg" data-testid="text-product-unit">{product.unit}</p>
            </div>
          </div>

          {product.category && (
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Tag className="h-3.5 w-3.5" />
                Kategorie
              </div>
              <p className="font-medium" data-testid="text-product-category">{product.category}</p>
            </div>
          )}

          {product.description && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
                  <Info className="h-4 w-4" />
                  Beschreibung
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-product-description">
                  {product.description}
                </p>
              </div>
            </>
          )}

          {product.stockQuantity != null && product.stockQuantity > 0 && (
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">Lagerbestand</div>
              <p className="font-medium" data-testid="text-product-stock">{product.stockQuantity} {product.unit}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
