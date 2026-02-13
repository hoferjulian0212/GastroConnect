import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Package, Euro, Tag, Layers, Info } from "lucide-react";
import type { Product } from "@shared/schema";

interface ProductDetailDialogProps {
  product: Product | null;
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

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Euro className="h-3.5 w-3.5" />
                Preis
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
