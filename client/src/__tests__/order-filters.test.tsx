import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrderWithDetails } from "@shared/schema";
import {
  ORDER_STATUS_FILTERS,
  getOrderStatusFilterLabel,
  orderStatusQuery,
} from "@/lib/order-status-filters";

const testState = vi.hoisted(() => ({
  lang: "de" as "de" | "it",
  mobile: false,
}));

vi.mock("wouter", async () => {
  const React = await import("react");
  return {
    Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
    useLocation: () => {
      const [path, setPath] = React.useState(
        () => `${window.location.pathname}${window.location.search}`,
      );
      return [
        path,
        (nextPath: string) => {
          window.history.pushState({}, "", nextPath);
          setPath(nextPath);
        },
      ] as const;
    },
    useSearch: () => window.location.search.replace(/^\?/, ""),
    useRoute: () => [false, null],
  };
});

vi.mock("@/context/UserContext", () => ({
  useUser: () => ({
    currentUser: {
      id: "restaurant-1",
      role: "restaurant",
      name: "Test account",
      companyName: "Test account",
    },
  }),
}));
vi.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ lang: testState.lang, setLang: vi.fn(), toggleLang: vi.fn() }),
}));
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => testState.mobile,
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("@/hooks/use-haptic", () => ({
  useHaptic: () => vi.fn(),
}));
vi.mock("@/hooks/use-confetti", () => ({
  useConfetti: () => vi.fn(),
}));
vi.mock("@/context/HeroContext", () => ({
  HeroPortal: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/SectionTabs", () => ({
  SectionTabs: () => null,
}));
vi.mock("@/components/ProductDetailDialog", () => ({
  default: () => null,
}));
vi.mock("@/components/ProductImage", () => ({
  ProductImage: () => null,
}));
vi.mock("@/components/orders/Cell", () => ({
  Cell: () => null,
}));
vi.mock("@/components/orders/GroupHeader", () => ({
  GroupHeader: ({ label }: { label: string }) => <div>{label}</div>,
}));
vi.mock("@/components/SwipeableRow", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/StaggeredList", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import RestaurantOrders from "@/pages/restaurant/Orders";
import RestaurantOrdersMobile from "@/pages/restaurant/OrdersMobile";
import SupplierOrders from "@/pages/supplier/Orders";
import SupplierOrdersMobile from "@/pages/supplier/OrdersMobile";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

const orders = ORDER_STATUS_FILTERS.filter(({ key }) => key !== "not_deliverable").map(
  ({ key }, index) =>
    ({
      id: `order-${key}`,
      restaurantId: "restaurant-1",
      supplierId: "supplier-1",
      status: key === "all" ? "pending" : key,
      createdAt: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      updatedAt: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      totalAmount: "12.00",
      requestedDeliveryDate: null,
      originalDeliveryDate: null,
      items: [],
      supplier: { id: "supplier-1", companyName: "Test supplier" },
      restaurant: { id: "restaurant-1", companyName: "Test restaurant" },
    }) as unknown as OrderWithDetails,
);

function renderWithQueryClient(ui: React.ReactElement) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function resetOrderQueries() {
  queryClient.clear();
  queryClient.setQueryData(["/api/orders?restaurantId=restaurant-1"], orders);
  queryClient.setQueryData(["/api/supplier/orders?supplierId=supplier-1"], orders);
  queryClient.setQueryData(["/api/supplier/deliveries"], []);
}

function filterButtons(prefix: string) {
  return ORDER_STATUS_FILTERS.map(({ key }) => screen.getByTestId(`${prefix}${key}`));
}

beforeEach(() => {
  testState.lang = "de";
  testState.mobile = false;
  resetOrderQueries();
  window.history.replaceState({}, "", "/restaurant/orders?orderId=keep-me");
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("order status filter contract", () => {
  test("keeps the eight statuses and URL query behavior in one ordered contract", () => {
    expect(ORDER_STATUS_FILTERS.map(({ key }) => key)).toEqual([
      "all",
      "pending",
      "confirmed",
      "scheduled",
      "in_delivery",
      "delivered",
      "cancelled",
      "not_deliverable",
    ]);
    expect(ORDER_STATUS_FILTERS.map(({ key }) => getOrderStatusFilterLabel(key, "de"))).toEqual([
      "Alle",
      "Neu",
      "Bestätigt",
      "Geplant",
      "Unterwegs",
      "Geliefert",
      "Storniert",
      "Nicht zustellbar",
    ]);
    expect(ORDER_STATUS_FILTERS.map(({ key }) => getOrderStatusFilterLabel(key, "it", true))).toEqual([
      "Tutti",
      "Nuovo",
      "Confermato",
      "Pianificato",
      "In consegna",
      "Consegnato",
      "Annullato",
      "Non consegnabile",
    ]);
    expect(orderStatusQuery("orderId=keep-me", "delivered")).toBe(
      "?orderId=keep-me&status=delivered",
    );
    expect(orderStatusQuery("orderId=keep-me&status=delivered", "all")).toBe(
      "?orderId=keep-me",
    );
  });

  test.each([
    ["restaurant mobile", "restaurant", true],
    ["supplier mobile", "supplier", true],
  ])("%s exposes the shared filter order and empty state", (_name, role) => {
    testState.lang = role === "supplier" ? "it" : "de";
    const props = {
      orders,
      isLoading: false,
      currentUserId: role === "supplier" ? "supplier-1" : "restaurant-1",
      lang: testState.lang,
      dateLocale: undefined,
      initialStatus: undefined,
    };
    renderWithQueryClient(
      role === "supplier" ? (
        <SupplierOrdersMobile {...props} />
      ) : (
        <RestaurantOrdersMobile {...props} />
      ),
    );

    const buttons = filterButtons("chip-status-");
    expect(buttons.map((button) => button.textContent?.replace(/\d+/g, "").trim())).toEqual(
      role === "supplier"
        ? ["Tutti", "Nuovo", "Confermato", "Pianificato", "In consegna", "Consegnato", "Annullato", "Non consegnabile"]
        : ["Alle", "Neu", "Bestätigt", "Geplant", "Unterwegs", "Geliefert", "Storniert", "Nicht zustellbar"],
    );

    fireEvent.click(screen.getByTestId("chip-status-not_deliverable"));
    expect(window.location.search).toContain("status=not_deliverable");
    expect(screen.getByText(role === "supplier" ? "Nessun ordine" : "Keine Bestellungen")).toBeInTheDocument();
  });

  test.each([
    ["restaurant desktop", <RestaurantOrders />, "restaurant"],
    ["supplier desktop", <SupplierOrders />, "supplier"],
  ])("%s exposes the same ordered controls and updates the query", async (name, page, role) => {
    window.history.replaceState(
      {},
      "",
      role === "supplier" ? "/supplier/orders?orderId=keep-me" : "/restaurant/orders?orderId=keep-me",
    );
    renderWithQueryClient(page);

    fireEvent.click(screen.getByTestId("button-toolbar-filter-content"));
    const buttons = filterButtons("filter-status-content-");
    expect(buttons.map((button) => button.textContent?.replace(/\s+/g, " ").trim())).toEqual(
      testState.lang === "de"
        ? ["Alle", "Neu", "Bestätigt", "Geplant", "Unterwegs", "Geliefert", "Storniert", "Nicht zustellbar"]
        : ["Tutti", "Nuovo", "Confermato", "Pianificato", "In consegna", "Consegnato", "Annullato", "Non consegnabile"],
    );

    fireEvent.click(screen.getByTestId("filter-status-content-not_deliverable"));
    expect(window.location.search).toContain("status=not_deliverable");
    await waitFor(() => {
      expect(screen.getByText("Keine Bestellungen gefunden")).toBeInTheDocument();
    });
  });
});