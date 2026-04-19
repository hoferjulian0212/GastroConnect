export type RestaurantOrderColKey =
  | "orderNo"
  | "status"
  | "supplier"
  | "items"
  | "deliveryDate"
  | "createdAt"
  | "total"
  | "actions";

export const RESTAURANT_ORDER_COL_DEFAULTS: Record<RestaurantOrderColKey, number> = {
  orderNo: 150,
  status: 140,
  supplier: 180,
  items: 80,
  deliveryDate: 160,
  createdAt: 140,
  total: 120,
  actions: 48,
};

export const RESTAURANT_ORDER_COLS_STORAGE_KEY = "restaurantOrdersColWidths";
export const RESTAURANT_ORDER_DENSITY_STORAGE_KEY = "restaurantOrdersRowDensity";

export type SupplierOrderColKey =
  | "select"
  | "orderNo"
  | "status"
  | "restaurant"
  | "items"
  | "deliveryDate"
  | "createdAt"
  | "total"
  | "actions";

export const SUPPLIER_ORDER_COL_DEFAULTS: Record<SupplierOrderColKey, number> = {
  select: 32,
  orderNo: 150,
  status: 140,
  restaurant: 180,
  items: 80,
  deliveryDate: 160,
  createdAt: 140,
  total: 120,
  actions: 48,
};

export const SUPPLIER_ORDER_COLS_STORAGE_KEY = "supplierOrdersColWidths";
export const SUPPLIER_ORDER_DENSITY_STORAGE_KEY = "supplierOrdersRowDensity";

export type InventoryColKey =
  | "product"
  | "category"
  | "stock"
  | "threshold"
  | "status"
  | "actions";

export const INVENTORY_COL_DEFAULTS: Record<InventoryColKey, number> = {
  product: 320,
  category: 160,
  stock: 110,
  threshold: 110,
  status: 140,
  actions: 96,
};

export const INVENTORY_COLS_STORAGE_KEY = "supplierInventoryColWidths";
export const INVENTORY_DENSITY_STORAGE_KEY = "supplierInventoryRowDensity";

export type RowDensity = "compact" | "normal" | "comfortable";

export const densityRowClass = (d: RowDensity): string =>
  d === "compact" ? "py-1 text-[12px]" : d === "comfortable" ? "py-4 text-sm" : "py-2.5 text-sm";

export const densityHeaderClass = (d: RowDensity): string =>
  d === "compact" ? "py-1.5" : d === "comfortable" ? "py-4" : "py-3";
