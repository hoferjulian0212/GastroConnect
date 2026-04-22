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
  orderNo: 130,
  status: 140,
  supplier: 200,
  items: 80,
  deliveryDate: 160,
  createdAt: 130,
  total: 110,
  actions: 48,
};

// Per-column minimum widths — prevent ugly truncation when user resizes too small
export const RESTAURANT_ORDER_COL_MIN_WIDTHS: Record<RestaurantOrderColKey, number> = {
  orderNo: 90,
  status: 100,
  supplier: 120,
  items: 56,
  deliveryDate: 110,
  createdAt: 90,
  total: 80,
  actions: 40,
};

// Lower priority = hidden first when container is too narrow
// Pinned columns (orderNo, status, total, actions) get the highest priority and are never auto-hidden
export const RESTAURANT_ORDER_COL_PRIORITY: Record<RestaurantOrderColKey, number> = {
  orderNo: 100,
  status: 95,
  total: 85,
  supplier: 70,
  deliveryDate: 60,
  items: 30,
  createdAt: 20,
  actions: 90,
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
  select: 36,
  orderNo: 130,
  status: 140,
  restaurant: 200,
  items: 80,
  deliveryDate: 160,
  createdAt: 130,
  total: 110,
  actions: 48,
};

export const SUPPLIER_ORDER_COL_MIN_WIDTHS: Record<SupplierOrderColKey, number> = {
  select: 36,
  orderNo: 90,
  status: 100,
  restaurant: 120,
  items: 56,
  deliveryDate: 110,
  createdAt: 90,
  total: 80,
  actions: 40,
};

export const SUPPLIER_ORDER_COL_PRIORITY: Record<SupplierOrderColKey, number> = {
  select: 100,
  orderNo: 100,
  status: 95,
  total: 85,
  restaurant: 70,
  deliveryDate: 60,
  items: 30,
  createdAt: 20,
  actions: 90,
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

export const INVENTORY_COL_MIN_WIDTHS: Record<InventoryColKey, number> = {
  product: 180,
  category: 100,
  stock: 80,
  threshold: 80,
  status: 100,
  actions: 80,
};

export const INVENTORY_COLS_STORAGE_KEY = "supplierInventoryColWidths";
export const INVENTORY_DENSITY_STORAGE_KEY = "supplierInventoryRowDensity";

export type RowDensity = "compact" | "normal" | "comfortable";

export const densityRowClass = (d: RowDensity): string =>
  d === "compact" ? "py-1 text-[12px]" : d === "comfortable" ? "py-4 text-sm" : "py-2.5 text-sm";

export const densityHeaderClass = (d: RowDensity): string =>
  d === "compact" ? "py-1.5" : d === "comfortable" ? "py-4" : "py-3";
