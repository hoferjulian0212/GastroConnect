import { Switch, Route, useLocation, Redirect, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider, useUser } from "@/context/UserContext";
import { ChatProvider, useChat } from "@/context/ChatContext";
import { HeroProvider, HeroOutlet, HeroPortal } from "@/context/HeroContext";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import { ThemeProvider } from "@/hooks/use-theme";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/use-theme";
import { useT } from "@/lib/translations";
import { ShoppingCart, ChevronDown, Moon, Sun, LogOut, Users, UserRound, Loader2 } from "lucide-react";
import logoImgThick from "@assets/logo_no_bg_thick.png";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { GlobalSearch, DesktopSearchButton } from "@/components/GlobalSearch";
import Logo from "@/components/Logo";
import { AiAssistant } from "@/components/AiAssistant";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { SupplierMobileNav } from "@/components/SupplierMobileNav";
import { WarehouseMobileNav } from "@/components/WarehouseMobileNav";
import { RestaurantMobileNav } from "@/components/RestaurantMobileNav";
import { MobileTopActions } from "@/components/mobile/MobileTopActions";
import { useEffect, useCallback, useState, useRef, useLayoutEffect, lazy, Suspense, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { navigate } from "wouter/use-browser-location";
import { ClerkProvider, SignIn, SignUp, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { RegistrationPage, RegistrationCompletePage, RegistrationStatusPage, PendingApprovalScreen } from "@/pages/Registration";
import {
  FeaturesRoute,
  HowItWorksRoute,
  FaqRoute,
  ContactRoute,
  ImpressumRoute,
  DatenschutzRoute,
  AgbRoute,
} from "@/pages/PublicInfo";

// ── Clerk configuration ────────────────────────────────────────────────────
// REQUIRED — copy verbatim. Resolves the publishable key from the host so the
// same build serves multiple Clerk custom domains.
const Landing = lazy(() => import("@/pages/Landing"));
import Login from "@/pages/Login";
import AuthClaim from "@/pages/AuthClaim";
import AuthReset from "@/pages/AuthReset";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminOrgs from "@/pages/admin/AdminOrgs";
import AdminOrgDetail from "@/pages/admin/AdminOrgDetail";
import AdminAdmins from "@/pages/admin/AdminAdmins";
import AdminComplaints from "@/pages/admin/AdminComplaints";
import AdminLowStock from "@/pages/admin/AdminLowStock";
import AdminErrorLogs from "@/pages/admin/AdminErrorLogs";
import NotFound from "@/pages/not-found";
import RestaurantHome from "@/pages/restaurant/Home";
import RestaurantInbox from "@/pages/restaurant/Inbox";
import RestaurantOrders from "@/pages/restaurant/Orders";
import RestaurantCatalog from "@/pages/restaurant/Catalog";
import RestaurantProductDetail from "@/pages/restaurant/ProductDetail";
import RestaurantCart from "@/pages/restaurant/Cart";

import RestaurantSettings from "@/pages/restaurant/Settings";
import RestaurantProfile from "@/pages/restaurant/Profile";
import RestaurantComplaints from "@/pages/restaurant/Complaints";
import RestaurantTemplates from "@/pages/restaurant/Templates";
import RestaurantSuppliers from "@/pages/restaurant/Suppliers";
import RestaurantCostAnalysis from "@/pages/restaurant/CostAnalysis";
import RestaurantCostAnalysisManual from "@/pages/restaurant/CostAnalysisManual";
import RestaurantPriceComparison from "@/pages/restaurant/PriceComparison";
import RestaurantMonthlyReports from "@/pages/restaurant/MonthlyReports";
import SupplierHome from "@/pages/supplier/Home";
import SupplierInbox from "@/pages/supplier/Inbox";
import SupplierProducts from "@/pages/supplier/Products";
import SupplierOrders from "@/pages/supplier/Orders";
import SupplierSettings from "@/pages/supplier/Settings";
import SupplierProfile from "@/pages/supplier/Profile";
import SupplierComplaints from "@/pages/supplier/Complaints";
import SupplierRestaurants from "@/pages/supplier/Restaurants";
import SupplierPromotions from "@/pages/supplier/Promotions";
import SupplierInventory from "@/pages/supplier/Inventory";
import SupplierDrivers from "@/pages/supplier/Drivers";
import SupplierInventoryRisk from "@/pages/supplier/InventoryRisk";
import WarehouseHome from "@/pages/warehouse/Home";
import WarehouseStock from "@/pages/warehouse/Stock";
import InternalChat from "@/pages/InternalChat";
import DriverHome from "@/pages/driver/Home";
import DriverDeliveryDetail from "@/pages/driver/DeliveryDetail";
import DriverRoutePlanner from "@/pages/driver/RoutePlanner";
import DriverMap from "@/pages/driver/DriverMap";
import DriverHistory from "@/pages/driver/History";
import { DriverMobileNav } from "@/components/DriverMobileNav";
import { useDriverLocation } from "@/hooks/use-driver-location";
import { WAREHOUSE_ALLOWED_PATHS, type WarehouseAllowedPath, DRIVER_ALLOWED_PATHS, type DriverAllowedPath } from "@shared/permissions";
import About from "@/pages/About";
import AdminPmsRequests from "@/pages/Admin";
import Documents from "@/pages/Documents";
import OrderDetail from "@/pages/OrderDetail";
import ComplaintDetail from "@/pages/ComplaintDetail";
import CalendarPage from "@/pages/Calendar";
import Help from "@/pages/Help";
import Team from "@/pages/Team";
import MemberProfile from "@/pages/MemberProfile";
import { FirstTimeProfileDialog } from "@/components/FirstTimeProfileDialog";
import { DemoLoginButtons } from "@/components/DemoLoginButtons";
import { can } from "@shared/permissions";
import { TourProvider } from "@/components/tour/TourProvider";
import { HelpButton } from "@/components/HelpButton";

function RestaurantRouter() {
  return (
    <Switch>
      <Route path="/restaurant" component={RestaurantHome} />
      <Route path="/restaurant/inbox" component={RestaurantInbox} />
      <Route path="/restaurant/orders/:id" component={OrderDetail} />
      <Route path="/restaurant/orders" component={RestaurantOrders} />
      <Route path="/restaurant/catalog" component={RestaurantCatalog} />
      <Route path="/restaurant/product/:id" component={RestaurantProductDetail} />
      <Route path="/restaurant/cart" component={RestaurantCart} />

      <Route path="/restaurant/templates" component={RestaurantTemplates as any} />
      <Route path="/restaurant/complaints/:id" component={ComplaintDetail} />
      <Route path="/restaurant/complaints" component={RestaurantComplaints} />
      <Route path="/restaurant/suppliers" component={RestaurantSuppliers} />
      <Route path="/restaurant/settings" component={RestaurantSettings} />
      <Route path="/restaurant/profile" component={RestaurantProfile} />
      <Route path="/restaurant/my-profile" component={MemberProfile} />
      <Route path="/restaurant/documents" component={Documents} />
      <Route path="/restaurant/monthly-reports" component={RestaurantMonthlyReports} />
      <Route path="/restaurant/cost-analysis/manual" component={RestaurantCostAnalysisManual} />
      <Route path="/restaurant/cost-analysis" component={RestaurantCostAnalysis} />
      <Route path="/restaurant/price-comparison" component={RestaurantPriceComparison} />
      <Route path="/restaurant/calendar">{() => <CalendarPage role="restaurant" />}</Route>
      <Route path="/restaurant/team-chat" component={InternalChat} />
      <Route path="/restaurant/team" component={Team} />
      <Route path="/restaurant/help" component={Help} />
      <Route component={NotFound} />
    </Switch>
  );
}

function SupplierRouter() {
  return (
    <Switch>
      <Route path="/supplier" component={SupplierHome} />
      <Route path="/supplier/inbox" component={SupplierInbox} />
      <Route path="/supplier/products" component={SupplierProducts} />
      <Route path="/supplier/restaurants" component={SupplierRestaurants} />
      <Route path="/supplier/orders/:id" component={OrderDetail} />
      <Route path="/supplier/orders" component={SupplierOrders} />
      <Route path="/supplier/promotions" component={SupplierPromotions} />
      <Route path="/supplier/inventory" component={SupplierInventory} />
      <Route path="/supplier/inventory-risk" component={SupplierInventoryRisk} />
      <Route path="/supplier/drivers" component={SupplierDrivers} />
      <Route path="/supplier/team-chat" component={InternalChat} />
      <Route path="/supplier/complaints/:id" component={ComplaintDetail} />
      <Route path="/supplier/complaints" component={SupplierComplaints} />
      <Route path="/supplier/settings" component={SupplierSettings} />
      <Route path="/supplier/profile" component={SupplierProfile} />
      <Route path="/supplier/my-profile" component={MemberProfile} />
      <Route path="/supplier/documents" component={Documents} />
      <Route path="/supplier/calendar">{() => <CalendarPage role="supplier" />}</Route>
      <Route path="/supplier/team" component={Team} />
      <Route path="/supplier/help" component={Help} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Warehouse members belong to a supplier org (so the URL prefix stays /supplier)
// but only get a focused, mobile-first subset of pages. The path allow-list lives
// in shared/permissions.ts (WAREHOUSE_ALLOWED_PATHS) as the single source of truth;
// this record maps each allowed path to its page, and anything outside the list
// falls through to the redirect back to the warehouse home.
const WAREHOUSE_ROUTE_COMPONENTS: Record<WarehouseAllowedPath, React.ComponentType<any>> = {
  "/supplier": WarehouseHome,
  "/supplier/inventory-risk": SupplierInventoryRisk,
  "/supplier/inventory": WarehouseStock,
  "/supplier/team-chat": InternalChat,
  "/supplier/settings": SupplierSettings,
  "/supplier/profile": MemberProfile,
  "/supplier/team": Team,
  "/supplier/help": Help,
};

function WarehouseRouter() {
  return (
    <Switch>
      {WAREHOUSE_ALLOWED_PATHS.map((p) => (
        <Route key={p} path={p} component={WAREHOUSE_ROUTE_COMPONENTS[p]} />
      ))}
      <Route><Redirect to="/supplier" /></Route>
    </Switch>
  );
}

// Driver members get a focused, mobile-first delivery app (tour, route planner,
// map, history, team chat) plus the shared org pages. The allow-list lives in
// shared/permissions.ts (DRIVER_ALLOWED_PATHS) as the single source of truth.
const DRIVER_ROUTE_COMPONENTS: Record<DriverAllowedPath, React.ComponentType<any>> = {
  "/supplier": DriverHome,
  "/supplier/delivery/:id": DriverDeliveryDetail,
  "/supplier/route": DriverRoutePlanner,
  "/supplier/map": DriverMap,
  "/supplier/history": DriverHistory,
  "/supplier/team-chat": InternalChat,
  "/supplier/inbox": SupplierInbox,
  "/supplier/settings": SupplierSettings,
  "/supplier/profile": MemberProfile,
  "/supplier/help": Help,
};

function DriverRouter() {
  return (
    <Switch>
      {DRIVER_ALLOWED_PATHS.map((p) => (
        <Route key={p} path={p} component={DRIVER_ROUTE_COMPONENTS[p]} />
      ))}
      <Route><Redirect to="/supplier" /></Route>
    </Switch>
  );
}

// Streams the driver's GPS position to the server while a stop is active.
// Rendered as a component (not a bare hook call) so it only runs for drivers.
function DriverLocationStreamer() {
  useDriverLocation();
  return null;
}

// First-login profile completion: every member must confirm/enter their own
// profile data (name, phone, optional photo) once. Instead of silently
// redirecting to the profile page (which looked like being "stuck" there),
// a blocking welcome popup explains the step and collects the data in place.
function ProfileCompletionGate() {
  return <FirstTimeProfileDialog />;
}

// Keeps the user within their organization's role area. Identity itself comes
// from the session (/api/auth/me) via UserContext — there is no impersonation.
function UserLoader() {
  const { currentRole, currentUser } = useUser();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Wait until the session's org has actually loaded — currentRole defaults
    // to "restaurant" while currentUser is still null, and redirecting on that
    // placeholder value would bounce supplier deep links (e.g. /supplier/orders
    // on a hard refresh) to /restaurant and then /supplier, losing the target.
    if (!currentUser) return;
    if (location !== "/" && location !== "/about" && !location.startsWith(`/${currentRole}`)) {
      setLocation(`/${currentRole}`);
    }
  }, [currentUser, currentRole, location, setLocation]);

  return null;
}

// Persists the device's chosen language onto the active user's record so that
// server-generated messages (e.g. ERP sync failure alerts) can be localized.
function LanguageSync() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (currentUser.language === lang) return;
    const syncKey = `${currentUser.id}:${lang}`;
    if (lastSyncedRef.current === syncKey) return;
    lastSyncedRef.current = syncKey;
    apiRequest("PATCH", `/api/users/${currentUser.id}`, { language: lang }).catch(() => {
      lastSyncedRef.current = null;
    });
  }, [currentUser?.id, currentUser?.language, lang]);

  return null;
}

// Shown when a platform admin is impersonating a member. Polls lightly and
// provides a one-click exit that returns the admin to /admin.
function ImpersonationBanner() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data } = useQuery<{
    impersonating: boolean;
    memberName?: string;
    orgName?: string;
    orgRole?: string;
  }>({
    queryKey: ["/api/admin/impersonation-status"],
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
  });

  const exitMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/impersonate/exit"),
    onSuccess: () => {
      // Hard-navigate to /admin so all member-session React state and query
      // cache is fully discarded — a soft setLocation() can race with auth
      // invalidation effects and end up redirecting to /restaurant or /login.
      queryClient.clear();
      window.location.href = "/admin";
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/impersonation-status"] });
    },
  });

  if (!data?.impersonating) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[999] flex items-center justify-between gap-3 px-4 py-2.5 bg-black text-white text-sm font-medium shadow-lg">
      <span className="flex items-center gap-2 truncate">
        <span className="hidden sm:inline">🔍</span>
        <span>
          Sie imitieren <strong>{data.memberName}</strong>
          {data.orgName ? ` · ${data.orgName}` : ""}
          {data.orgRole ? ` (${data.orgRole})` : ""}
        </span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
        className="shrink-0 h-7 px-3 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
        data-testid="button-exit-impersonation"
      >
        Impersonierung beenden
      </Button>
    </div>
  );
}

function CartButton() {
  const { currentUser } = useUser();
  const [, setLocation] = useLocation();
  
  const { data: cartCount } = useQuery<{ count: number }>({
    queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const count = cartCount?.count || 0;

  return (
    <button
      onClick={() => setLocation("/restaurant/cart")}
      className="relative flex shrink-0 items-center justify-center h-9 w-9 rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15 transition-colors"
      data-testid="button-cart-header"
    >
      <ShoppingCart className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] px-1 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold leading-none">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

function MobileProfileButton() {
  const { currentUser, currentMember } = useUser();

  const displayName = currentMember?.name || currentUser?.name;
  const displayImage = currentMember?.profileImageUrl || currentUser?.profileImageUrl;
  const initials = displayName
    ? displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="md:hidden" data-testid="button-mobile-profile">
          <Avatar className="h-9 w-9">
            <AvatarImage src={displayImage || undefined} alt={displayName || ""} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <ProfileMenuContent />
    </DropdownMenu>
  );
}

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
  children?: { href: string; label: string }[];
};

function HeaderNavDropdown({ item, location }: { item: NavItem; location: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  const isActive = item.exact
    ? location === item.href
    : location === item.href || location.startsWith(item.href + '/') ||
      (item.children?.some(c => location === c.href || location.startsWith(c.href + '/')) ?? false);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open, updateCoords]);

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  if (!item.children) {
    return (
      <Link href={item.href}>
        <span
          className={`px-2 lg:px-2.5 xl:px-3 py-1.5 rounded-lg text-[13px] lg:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
            isActive ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
          data-testid={`nav-link-${item.href.split('/').pop()}`}
        >
          {item.label}
        </span>
      </Link>
    );
  }

  return (
    <div ref={triggerRef} className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <Link href={item.href}>
        <span
          className={`px-2 lg:px-2.5 xl:px-3 py-1.5 rounded-lg text-[13px] lg:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-0.5 lg:gap-1 ${
            isActive ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
          data-testid={`nav-link-${item.href.split('/').pop()}`}
        >
          {item.label}
          <ChevronDown className={`h-3 w-3 lg:h-3.5 lg:w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </Link>
      {open && coords && typeof document !== "undefined" && createPortal(
        <div
          className="dark fixed min-w-[180px] py-1 bg-[#1e2130] border border-white/10 rounded-xl shadow-xl z-[9999]"
          style={{ top: coords.top, left: coords.left }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {item.children.map(child => {
            const childActive = location === child.href || location.startsWith(child.href + '/');
            return (
              <Link key={child.href} href={child.href}>
                <span
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-2 text-sm transition-colors cursor-pointer ${
                    childActive ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                  data-testid={`nav-sublink-${child.href.split('/').pop()}`}
                >
                  {child.label}
                </span>
              </Link>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

function HeaderNav() {
  const { currentRole, currentMember, isWarehouse, isDriver } = useUser();
  const [location] = useLocation();
  const { lang } = useLanguage();

  const restaurantLinks: NavItem[] = [
    { href: '/restaurant', label: 'Home', exact: true },
    { href: '/restaurant/inbox', label: 'Inbox' },
    {
      href: '/restaurant/orders',
      label: lang === 'de' ? 'Bestellungen' : 'Ordini',
      children: [
        { href: '/restaurant/orders', label: lang === 'de' ? 'Bestellungen' : 'Ordini' },
        { href: '/restaurant/complaints', label: lang === 'de' ? 'Reklamationen' : 'Reclami' },
        { href: '/restaurant/documents', label: lang === 'de' ? 'Dokumente' : 'Documenti' },
        ...(can(currentMember?.role, "impact.analytics")
          ? [{ href: '/restaurant/monthly-reports', label: lang === 'de' ? 'Monatsberichte' : 'Report mensili' }]
          : []),
      ],
    },
    {
      href: '/restaurant/catalog',
      label: lang === 'de' ? 'Katalog' : 'Catalogo',
      children: [
        { href: '/restaurant/catalog', label: lang === 'de' ? 'Katalog' : 'Catalogo' },
        { href: '/restaurant/suppliers', label: lang === 'de' ? 'Lieferanten' : 'Fornitori' },
        { href: '/restaurant/cost-analysis', label: lang === 'de' ? 'Kostenanalyse' : 'Analisi costi' },
      ],
    },
    { href: '/restaurant/team-chat', label: lang === 'de' ? 'Interner Chat' : 'Chat interno' },
    { href: '/restaurant/settings', label: lang === 'de' ? 'Einstellungen' : 'Impostazioni' },
  ];

  const supplierLinks: NavItem[] = [
    { href: '/supplier', label: 'Home', exact: true },
    { href: '/supplier/inbox', label: 'Inbox' },
    {
      href: '/supplier/orders',
      label: lang === 'de' ? 'Bestellungen' : 'Ordini',
      children: [
        { href: '/supplier/orders', label: lang === 'de' ? 'Bestellungen' : 'Ordini' },
        { href: '/supplier/drivers', label: lang === 'de' ? 'Fahrer' : 'Autisti' },
        { href: '/supplier/complaints', label: lang === 'de' ? 'Reklamationen' : 'Reclami' },
        { href: '/supplier/documents', label: lang === 'de' ? 'Dokumente' : 'Documenti' },
      ],
    },
    {
      href: '/supplier/products',
      label: lang === 'de' ? 'Produkte' : 'Prodotti',
      children: [
        { href: '/supplier/products', label: lang === 'de' ? 'Katalog' : 'Catalogo' },
        { href: '/supplier/inventory-risk', label: lang === 'de' ? 'Risiko-Bestand' : 'Scorte a rischio' },
        { href: '/supplier/restaurants', label: lang === 'de' ? 'Kunden' : 'Clienti' },
      ],
    },
    { href: '/supplier/team-chat', label: lang === 'de' ? 'Interner Chat' : 'Chat interno' },
    { href: '/supplier/settings', label: lang === 'de' ? 'Einstellungen' : 'Impostazioni' },
  ];

  const warehouseLinks: NavItem[] = [
    { href: '/supplier', label: 'Home', exact: true },
    { href: '/supplier/inventory-risk', label: lang === 'de' ? 'Risiko-Bestand' : 'Scorte a rischio' },
    { href: '/supplier/inventory', label: lang === 'de' ? 'Bestand' : 'Magazzino' },
    { href: '/supplier/team-chat', label: lang === 'de' ? 'Interner Chat' : 'Chat interno' },
    { href: '/supplier/settings', label: lang === 'de' ? 'Einstellungen' : 'Impostazioni' },
  ];

  const driverLinks: NavItem[] = [
    { href: '/supplier', label: lang === 'de' ? 'Lieferungen' : 'Consegne', exact: true },
    { href: '/supplier/route', label: lang === 'de' ? 'Route' : 'Percorso' },
    { href: '/supplier/map', label: lang === 'de' ? 'Karte' : 'Mappa' },
    { href: '/supplier/history', label: lang === 'de' ? 'Verlauf' : 'Cronologia' },
    { href: '/supplier/team-chat', label: lang === 'de' ? 'Interner Chat' : 'Chat interno' },
    { href: '/supplier/settings', label: lang === 'de' ? 'Einstellungen' : 'Impostazioni' },
  ];

  const links = isDriver ? driverLinks : isWarehouse ? warehouseLinks : currentRole === 'restaurant' ? restaurantLinks : supplierLinks;

  return (
    <nav className="hidden md:flex items-center gap-0.5 lg:gap-1 xl:gap-2 min-w-0 overflow-x-auto scrollbar-hide" data-testid="header-nav">
      {links.map(item => (
        <HeaderNavDropdown key={item.href} item={item} location={location} />
      ))}
    </nav>
  );
}

function PageHero() {
  const [location] = useLocation();
  const { lang } = useLanguage();
  const { currentRole } = useUser();

  const pathOnly = location.split("?")[0];

  const isHomePage = pathOnly === `/${currentRole}`;
  const isDetailPage = /^\/(restaurant|supplier)\/(complaints|orders)\/[^/]+$/.test(pathOnly);
  const isProductDetailPage = /^\/restaurant\/product\/[^/]+$/.test(pathOnly);

  const isOrdersPage = /^\/(restaurant|supplier)\/orders$/.test(pathOnly);
  const isComplaintsPage = /^\/(restaurant|supplier)\/complaints$/.test(pathOnly);
  const isProductsPage = /^\/(restaurant\/catalog|supplier\/products)$/.test(pathOnly);
  const isCostAnalysisPage = pathOnly === "/restaurant/cost-analysis" || pathOnly === "/restaurant/cost-analysis/manual";
  const isPriceComparisonPage = pathOnly === "/restaurant/price-comparison";
  const isPromotionsPage = pathOnly === "/supplier/promotions";
  const isSupplierRestaurantsPage = pathOnly === "/supplier/restaurants";
  const isSettingsPage = /^\/(restaurant|supplier)\/settings$/.test(pathOnly);

  if (isHomePage || isDetailPage || isProductDetailPage || isOrdersPage || isComplaintsPage || isProductsPage || isCostAnalysisPage || isPriceComparisonPage || isPromotionsPage || isSupplierRestaurantsPage || isSettingsPage) return null;

  const role = currentRole;
  const pages: Record<string, Record<string, { title: string; subtitle?: string }>> = {
    de: {
      inbox: { title: 'Inbox', subtitle: role === 'restaurant' ? 'Kommunizieren Sie mit Ihren Lieferanten' : 'Kommunizieren Sie mit Ihren Kunden' },
      orders: { title: 'Bestellungen', subtitle: role === 'restaurant' ? 'Verwalten Sie Ihre Bestellungen' : 'Verwalten Sie eingehende Bestellungen' },
      catalog: { title: 'Katalog', subtitle: 'Durchsuchen Sie verfügbare Produkte' },
      products: { title: 'Produkte', subtitle: 'Verwalten Sie Ihr Produktsortiment' },
      suppliers: { title: 'Lieferanten', subtitle: 'Ihre verbundenen Lieferanten' },
      restaurants: { title: 'Kunden', subtitle: 'Ihre verbundenen Restaurants' },
      complaints: { title: 'Reklamationen', subtitle: 'Verwalten Sie Ihre Reklamationen' },
      settings: { title: 'Einstellungen', subtitle: 'Passen Sie Ihre Einstellungen an' },
      profile: { title: 'Profil', subtitle: 'Verwalten Sie Ihr Profil' },
      documents: { title: 'Dokumente', subtitle: 'Lieferscheine und Rechnungen' },
      'cost-analysis': { title: 'Kostenanalyse', subtitle: 'Wareneinsatz und Statistiken' },
      promotions: { title: 'Aktionen', subtitle: 'Verwalten Sie Ihre Aktionen' },
      cart: { title: 'Warenkorb', subtitle: 'Ihre ausgewählten Produkte' },
    },
    it: {
      inbox: { title: 'Inbox', subtitle: role === 'restaurant' ? 'Comunica con i tuoi fornitori' : 'Comunica con i tuoi clienti' },
      orders: { title: 'Ordini', subtitle: role === 'restaurant' ? 'Gestisci i tuoi ordini' : 'Gestisci gli ordini in arrivo' },
      catalog: { title: 'Catalogo', subtitle: 'Sfoglia i prodotti disponibili' },
      products: { title: 'Prodotti', subtitle: 'Gestisci il tuo assortimento' },
      suppliers: { title: 'Fornitori', subtitle: 'I tuoi fornitori collegati' },
      restaurants: { title: 'Clienti', subtitle: 'I tuoi ristoranti collegati' },
      complaints: { title: 'Reclami', subtitle: 'Gestisci i tuoi reclami' },
      settings: { title: 'Impostazioni', subtitle: 'Personalizza le impostazioni' },
      profile: { title: 'Profilo', subtitle: 'Gestisci il tuo profilo' },
      documents: { title: 'Documenti', subtitle: 'Note di consegna e fatture' },
      'cost-analysis': { title: 'Analisi costi', subtitle: 'Costi e statistiche' },
      promotions: { title: 'Promozioni', subtitle: 'Gestisci le tue promozioni' },
      cart: { title: 'Carrello', subtitle: 'I tuoi prodotti selezionati' },
    },
  };

  const segment = location.split('/')[2] || '';
  const page = pages[lang]?.[segment] || pages.de[segment];

  if (!page) return null;

  return (
    <HeroPortal desktopOnly>
      <div className="px-3 md:px-6 pt-3 md:pt-4 pb-5 md:pb-8" data-testid="page-hero">
        <h1 className="text-xl md:text-3xl font-bold text-white">{page.title}</h1>
        {page.subtitle && (
          <p className="hidden md:block text-sm text-white/50 mt-1">{page.subtitle}</p>
        )}
      </div>
    </HeroPortal>
  );
}

function useProfileMenu() {
  const { currentUser, currentRole, currentMember, isDriver, isWarehouse, logout } = useUser();
  const { isDark, toggleTheme } = useTheme();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  return { currentUser, currentRole, currentMember, isDriver, isWarehouse, isDark, toggleTheme, t, lang, handleLogout, setLocation };
}

function ProfileMenuContent() {
  const { isDark, toggleTheme, t, lang, currentRole, currentMember, isDriver, isWarehouse, handleLogout, setLocation } = useProfileMenu();
  // Drivers/warehouse members get their own member profile at /supplier/profile;
  // regular members use the dedicated my-profile page.
  const myProfilePath = isDriver || isWarehouse ? "/supplier/profile" : `/${currentRole}/my-profile`;
  const showTeam = !currentMember || can(currentMember.role, "team.view");
  const itemClass =
    "flex items-center w-full px-4 py-2 text-sm transition-colors cursor-pointer rounded-none text-gray-400 focus:text-white focus:bg-white/5 hover:text-white hover:bg-white/5";
  return (
    <DropdownMenuContent
      align="end"
      sideOffset={4}
      className="dark min-w-[180px] p-1 bg-[#1e2130] border border-white/10 rounded-xl shadow-xl"
      data-testid="menu-profile"
    >
      <DropdownMenuItem
        onSelect={(e) => { e.preventDefault(); setLocation(myProfilePath); }}
        className={itemClass}
        data-testid="menu-item-my-profile"
      >
        <UserRound className="mr-2 h-4 w-4" />
        {lang === "it" ? "Il mio profilo" : "Mein Profil"}
      </DropdownMenuItem>
      {showTeam && (
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); setLocation(`/${currentRole}/team`); }}
          className={itemClass}
          data-testid="menu-item-team"
        >
          <Users className="mr-2 h-4 w-4" />
          {lang === "it" ? "Organizzazione e team" : "Organisation & Team"}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        onSelect={(e) => { e.preventDefault(); toggleTheme(); }}
        className={itemClass}
        data-testid="menu-item-dark-mode"
      >
        {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
        {t("settings", "darkMode")}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={handleLogout}
        className="flex items-center w-full px-4 py-2 text-sm transition-colors cursor-pointer rounded-none text-red-400 focus:text-red-300 focus:bg-red-500/10 hover:text-red-300 hover:bg-red-500/10"
        data-testid="menu-item-logout"
      >
        <LogOut className="mr-2 h-4 w-4" />
        {t("common", "logout")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

function DesktopProfileButton() {
  const { currentUser, currentMember } = useUser();

  const displayName = currentMember?.name || currentUser?.name;
  const displayImage = currentMember?.profileImageUrl || currentUser?.profileImageUrl;
  const initials = displayName
    ? displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="hidden md:flex items-center justify-center h-9 w-9 rounded-full border border-white/20 bg-white/[0.07] hover:bg-white/15 transition-colors"
          data-testid="button-desktop-profile"
        >
          <Avatar className="h-7 w-7">
            <AvatarImage src={displayImage || undefined} alt={displayName || ""} />
            <AvatarFallback className="bg-transparent text-white font-semibold text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <ProfileMenuContent />
    </DropdownMenu>
  );
}

function AppLayout() {
  const { currentRole, isWarehouse, isDriver, isLoading, isAuthenticated, isClerkSignedInButUnauthorized, registrationStatus } = useUser();
  const { isInChat } = useChat();
  const [location] = useLocation();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const path = location.split("?")[0];
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [location]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as Element)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (anchor.getAttribute("download") !== null) return;
      if (href.startsWith("tel:") || href.startsWith("mailto:")) return;
      const isInternal = href.startsWith("/") || href.startsWith(window.location.origin);
      if (isInternal) {
        e.preventDefault();
        const path = href.startsWith("/") ? href : new URL(href).pathname + new URL(href).search;
        navigate(path);
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  const pathOnly = location.split("?")[0];

  const isDetailPage = /^\/(restaurant|supplier)\/(complaints|orders)\/[^/]+$/.test(pathOnly);
  const isHomePage = pathOnly === '/restaurant' || pathOnly === '/supplier';
  const isInboxPage = pathOnly === '/restaurant/inbox' || pathOnly === '/supplier/inbox';

  // Clerk sign-in / sign-up (sub-paths like /sign-in/sso-callback included).
  if (pathOnly === "/demo-login") {
    return <DemoLoginPage />;
  }
  if (pathOnly.startsWith("/sign-in")) {
    return <SignInPage />;
  }
  if (pathOnly.startsWith("/sign-up")) {
    return <Redirect to="/register" />;
  }
  if (pathOnly === "/register/complete") {
    return <RegistrationCompletePage />;
  }
  if (pathOnly === "/registration-status") {
    return <RegistrationStatusPage />;
  }
  if (pathOnly.startsWith("/register")) {
    return <RegistrationPage />;
  }

  if (pathOnly === "/") {
    if (!isLoading && isAuthenticated) {
      return <Redirect to={currentRole === "supplier" ? "/supplier" : "/restaurant"} />;
    }
    if (!isLoading && isClerkSignedInButUnauthorized && (registrationStatus === "pending" || registrationStatus === "denied")) {
      return <PendingApprovalScreen denied={registrationStatus === "denied"} />;
    }
    return (
      <Suspense fallback={<div className="min-h-screen" />}>
        <Landing />
      </Suspense>
    );
  }

  // Legacy login route → redirect to Clerk sign-in.
  if (pathOnly === "/login") {
    return <Redirect to="/sign-in" />;
  }

  // Legacy claim/reset routes → redirect to Clerk sign-up / sign-in.
  if (pathOnly === "/auth/claim") {
    return <Redirect to="/sign-up" />;
  }

  if (pathOnly === "/auth/reset") {
    return <Redirect to="/sign-in" />;
  }

  if (pathOnly === "/about") {
    return <About />;
  }
  if (pathOnly === "/features") return <FeaturesRoute />;
  if (pathOnly === "/how-it-works") return <HowItWorksRoute />;
  if (pathOnly === "/faq") return <FaqRoute />;
  if (pathOnly === "/contact") return <ContactRoute />;
  if (pathOnly === "/impressum") return <ImpressumRoute />;
  if (pathOnly === "/datenschutz") return <DatenschutzRoute />;
  if (pathOnly === "/agb") return <AgbRoute />;

  // Platform admin panel — completely separate auth, no org session needed.
  if (pathOnly === "/admin/login") {
    return <AdminLogin />;
  }
  if (pathOnly === "/admin" || pathOnly === "/admin/") {
    return <AdminDashboard />;
  }
  if (pathOnly === "/admin/orgs" || pathOnly === "/admin/orgs/") {
    return <AdminOrgs />;
  }
  if (pathOnly === "/admin/admins") {
    return <AdminAdmins />;
  }
  if (pathOnly === "/admin/complaints" || pathOnly === "/admin/complaints/") {
    return <AdminComplaints />;
  }
  if (pathOnly === "/admin/low-stock" || pathOnly === "/admin/low-stock/") {
    return <AdminLowStock />;
  }
  if (pathOnly === "/admin/error-logs" || pathOnly === "/admin/error-logs/") {
    return <AdminErrorLogs />;
  }
  if (pathOnly.startsWith("/admin/orgs/")) {
    const orgId = pathOnly.replace("/admin/orgs/", "").split("/")[0];
    return <AdminOrgDetail params={{ id: orgId }} />;
  }
  // Legacy PMS admin page (simple route, requires normal session).
  if (pathOnly === "/admin/pms") {
    return <AdminPmsRequests />;
  }

  // Protected area — gate on the session. While Clerk or /api/auth/me is in
  // flight show the splash; once resolved, route based on auth state.
  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <img src={logoImgThick} alt="GastroConnect Logo" className="h-28 w-28 object-contain dark:invert" />
          <span className="text-2xl font-bold text-foreground tracking-tight">GastroConnect</span>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-1.5 w-1.5 rounded-full bg-foreground animate-bounce [animation-delay:0ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-foreground animate-bounce [animation-delay:150ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-foreground animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    );
  }

  // Clerk signed-in but no member row for this email: the account exists in
  // Clerk but hasn't been invited yet. Show a terminal access-denied screen
  // instead of redirecting to /sign-in (which would create an infinite loop).
  if (isClerkSignedInButUnauthorized) {
    if (registrationStatus === "pending" || registrationStatus === "denied") {
      return <PendingApprovalScreen denied={registrationStatus === "denied"} />;
    }
    return <AccessDeniedScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect to="/sign-in" />;
  }

  return (
    <>
      <UserLoader />
      <ProfileCompletionGate />
      <LanguageSync />
      <ImpersonationBanner />
        <div className="flex h-dvh w-full">
          <div ref={scrollContainerRef} data-app-scroll className={`flex flex-col flex-1 min-w-0 ${isInboxPage ? 'overflow-hidden' : 'overflow-auto overscroll-contain'} ${isInChat ? 'px-0 pt-0 md:px-6 md:pt-6' : 'px-3 md:px-6 pt-3 md:pt-6'}`}>
            <div className={`dark hidden md:block bg-[#161921] shrink-0 rounded-3xl overflow-hidden mb-3 md:mb-4 ${isInChat || isDetailPage ? 'md:block' : ''}`} data-testid="app-header-shell">
              <header className="flex items-center gap-1.5 lg:gap-2 px-3 py-2.5 md:px-2.5 md:py-2.5 lg:px-6">
                <div className="flex items-center gap-3 shrink-0 lg:flex-1 lg:min-w-0">
                  <MobileProfileButton />
                  <div className="hidden md:flex items-center shrink-0 md:-ml-1 lg:-ml-3">
                    <Logo size="header" variant="light" textClassName="hidden 2xl:inline" data-testid="logo-app-header" />
                  </div>
                </div>
                <HeaderNav />
                <div className="flex items-center gap-1 xl:gap-2 shrink-0 lg:flex-1 lg:min-w-0 justify-end overflow-hidden">
                  <DesktopSearchButton />
                  <LanguageToggle />
                  <HelpButton />
                  {currentRole === "restaurant" && (
                    <div className="hidden md:block shrink-0">
                      <CartButton />
                    </div>
                  )}
                  <NotificationBell />
                  <DesktopProfileButton />
                </div>
              </header>
              <HeroOutlet />
            </div>
            {!isDetailPage && !isInChat && (
              <div
                className="md:hidden flex items-center justify-end px-2 pb-2 shrink-0"
                style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
                data-testid="mobile-top-bar"
              >
                <MobileTopActions variant="light" />
              </div>
            )}
            <main className={`flex-1 flex flex-col min-h-0 ${isDetailPage ? 'p-0 pb-0' : isInboxPage ? 'pt-0 pb-0 md:pb-4' : 'pt-0 pb-0 md:pb-6'} ${isDetailPage ? '!p-0 !pb-0 md:!p-0 md:!pb-0' : ''}`}>
              <div key={location.split("?")[0]} className="animate-page-enter flex-1 flex flex-col min-h-0">
                <PageHero />
                {location.startsWith("/restaurant") ? <RestaurantRouter /> : isDriver ? <DriverRouter /> : isWarehouse ? <WarehouseRouter /> : <SupplierRouter />}
              </div>
            </main>
          </div>
          {!isDetailPage && !isInChat && (currentRole === "supplier" ? (isDriver ? <DriverMobileNav /> : isWarehouse ? <WarehouseMobileNav /> : <SupplierMobileNav />) : <RestaurantMobileNav />)}
          {isDriver && <DriverLocationStreamer />}
          <GlobalSearch />
          <AiAssistant />
          <KeyboardShortcuts />
        </div>
    </>
  );
}

function ClerkProviderWithRouter({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
}

const MOBILE_RESUME_MARKER = "gc.app.resume-pending";
const MOBILE_RESUME_THRESHOLD = 800;
const MOBILE_RESUME_MARKER_TTL = 10 * 60 * 1000;
const MOBILE_RESUME_DISPLAY_TIME = 1400;

/**
 * iOS can suspend or discard a standalone PWA while it is in the app switcher.
 * Leave a short, explicit loading state on the next visible frame so the user
 * understands that the app is reconnecting instead of assuming the tap froze.
 */
function MobileResumeLoader() {
  const [visible, setVisible] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      typeof window.matchMedia !== "function"
      || !window.matchMedia("(max-width: 767px)").matches
    ) return;

    let dismissTimer: number | undefined;

    const showLoader = () => {
      setVisible(true);
      if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
      dismissTimer = window.setTimeout(() => setVisible(false), MOBILE_RESUME_DISPLAY_TIME);
    };

    const readMarker = () => {
      try {
        const timestamp = Number(localStorage.getItem(MOBILE_RESUME_MARKER));
        if (!Number.isFinite(timestamp) || Date.now() - timestamp > MOBILE_RESUME_MARKER_TTL) {
          localStorage.removeItem(MOBILE_RESUME_MARKER);
          return null;
        }
        return timestamp;
      } catch {
        return null;
      }
    };

    const clearMarker = () => {
      try {
        localStorage.removeItem(MOBILE_RESUME_MARKER);
      } catch {
        // Storage can be unavailable in private browsing; visibility still works.
      }
    };

    // If the WebView was killed while hidden, this is a fresh mount and the
    // marker is the only signal that the previous app instance was suspended.
    if (document.visibilityState === "visible" && readMarker() !== null) {
      clearMarker();
      showLoader();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        try {
          localStorage.setItem(MOBILE_RESUME_MARKER, String(hiddenAtRef.current));
        } catch {
          // The in-memory timestamp still covers a normal background/resume.
        }
        return;
      }

      const hiddenFor = hiddenAtRef.current === null
        ? 0
        : Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = null;

      // Do not flash a loader for a quick app switch. A longer hidden period
      // indicates that the mobile browser may have frozen or discarded React.
      if (hiddenFor >= MOBILE_RESUME_THRESHOLD) {
        clearMarker();
        showLoader();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (dismissTimer !== undefined) window.clearTimeout(dismissTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-foreground md:hidden"
      role="status"
      aria-live="polite"
      aria-label="App wird aktualisiert"
    >
      <img
        src={logoImgThick}
        alt=""
        className="h-20 w-20 object-contain dark:invert"
        aria-hidden="true"
      />
      <span className="mt-3 text-xl font-bold tracking-tight">GastroConnect</span>
      <Loader2 className="mt-6 h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="mt-3 text-sm text-muted-foreground">App wird aktualisiert…</span>
    </div>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRouter>
        <QueryClientProvider client={queryClient}>
          <ClerkQueryClientCacheInvalidator />
          <TooltipProvider>
            <ThemeProvider>
              <LanguageProvider>
                <UserProvider>
                  <HeroProvider>
                    <ChatProvider>
                      <TourProvider>
                        <AppLayout />
                        <MobileResumeLoader />
                        <Toaster />
                      </TourProvider>
                    </ChatProvider>
                  </HeroProvider>
                </UserProvider>
              </LanguageProvider>
            </ThemeProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ClerkProviderWithRouter>
    </WouterRouter>
  );
}

export default App;

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

function SignUpPage() {
  return (
    <div className="min-h-dvh bg-[#161921] flex items-center justify-center px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function AccessDeniedScreen() {
  const { signOut } = useClerk();
  return (
    <div className="flex h-dvh items-center justify-center bg-[#161921]">
      <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
        <img src={logoImgThick} alt="GastroConnect Logo" className="h-20 w-20 object-contain invert" />
        <span className="text-2xl font-bold text-white tracking-tight">Kein Zugang</span>
        <p className="text-white/60 text-sm leading-relaxed">
          Ihr Konto ist noch nicht mit einer Organisation verknüpft. Bitten Sie Ihre Organisation, Sie zum Team einzuladen.
        </p>
        <button
          onClick={() => signOut({ redirectUrl: "/sign-in" })}
          className="mt-2 text-sm text-white/50 hover:text-white underline underline-offset-4"
        >
          Mit einem anderen Konto anmelden
        </button>
      </div>
    </div>
  );
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkAppearance = {
  theme: shadcn,
  // No cssLayerName — this project uses Tailwind v3 / PostCSS.
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#ffffff",
    colorForeground: "#ffffff",
    colorMutedForeground: "rgba(255,255,255,0.55)",
    colorDanger: "#f87171",
    colorBackground: "#000000",
    colorInput: "rgba(255,255,255,0.06)",
    colorInputForeground: "#ffffff",
    colorNeutral: "rgba(255,255,255,0.15)",
    fontFamily: "inherit",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "rounded-2xl w-[440px] max-w-full overflow-hidden border border-white/10",
    card: "!shadow-none !border-0 !rounded-none",
    footer: "!shadow-none !border-0 !rounded-none",
    headerTitle: "text-white font-bold",
    headerSubtitle: "text-white/55",
    socialButtonsBlockButtonText: "text-white",
    formFieldLabel: "text-white/80",
    footerActionLink: "text-white hover:text-white/80",
    footerActionText: "text-white/55",
    dividerText: "text-white/40",
    identityPreviewEditButton: "text-white/70",
    formFieldSuccessText: "text-emerald-400",
    alertText: "text-white",
    logoBox: "mb-1",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border-white/15 bg-white/[0.06] hover:bg-white/[0.10]",
    formButtonPrimary: "bg-white text-[#161921] hover:bg-white/90 font-semibold",
    formFieldInput: "bg-white/[0.06] border-white/15 text-white placeholder:text-white/40",
    footerAction: "bg-transparent",
    dividerLine: "bg-white/10",
    alert: "border-red-500/30 bg-red-500/10",
    otpCodeFieldInput: "bg-white/[0.06] border-white/15 text-white",
    formFieldRow: "",
    main: "",
  },
};

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function SignInPage() {
  return (
    <div className="relative min-h-dvh bg-[#161921] flex flex-col items-center justify-center px-4 py-8 gap-0">
      <Link
        href="/"
        aria-label="Zurück zur Startseite"
        title="Zurück zur Startseite"
        className="absolute top-5 left-1/2 -translate-x-1/2 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        data-testid="link-back-to-landing"
      >
        <Logo size="nav" variant="light" thick showText={false} data-testid="logo-back-to-landing" />
      </Link>
      <main className="w-full max-w-5xl">
        <div className="mb-8 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            GastroConnect
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Willkommen zurück
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">
            Wählen Sie den passenden Zugang für Ihren nächsten Schritt.
          </p>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:gap-5">
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]" aria-labelledby="registered-login-heading">
            <div className="border-b border-white/10 px-5 py-4 md:px-6">
              <h2 id="registered-login-heading" className="text-base font-semibold text-white">
                Bereits registriert?
              </h2>
              <p className="mt-1 text-xs text-white/45">
                Melden Sie sich mit Ihrem GastroConnect-Konto an.
              </p>
            </div>
            <SignIn
              routing="path"
              path={`${basePath}/sign-in`}
              signUpUrl={`${basePath}/sign-up`}
              forceRedirectUrl={`${basePath}/registration-status`}
            />
          </section>

          <div className="grid gap-4">
            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6" aria-labelledby="registration-choice-heading">
              <h2 id="registration-choice-heading" className="text-base font-semibold text-white">
                Noch kein Konto?
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/55">
                Durchlaufen Sie die Registrierung für Ihr Restaurant oder Ihren Lieferanten.
                Nach der E-Mail-Bestätigung prüft unser Team Ihre Angaben und schaltet den Zugang frei.
              </p>
              <Link
                href="/register"
                className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-[#161921] transition-colors hover:bg-white/85"
                data-testid="link-start-registration"
              >
                Registrierung starten
              </Link>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6" aria-labelledby="demo-choice-heading">
              <h2 id="demo-choice-heading" className="text-base font-semibold text-white">
                Demo-Benutzer ausprobieren?
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/55">
                Testen Sie GastroConnect ohne eigene E-Mail-Adresse. Wählen Sie im nächsten
                Schritt zuerst Restaurant oder Lieferant und dann einen einzelnen Demo-Benutzer.
              </p>
              <Link
                href="/demo-login"
                className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/20 bg-white/[0.06] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.12]"
                data-testid="link-demo-login"
              >
                Demo-Zugang auswählen
              </Link>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function DemoLoginPage() {
  return (
    <div className="min-h-dvh bg-[#161921] px-4 py-8 text-white md:py-12">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center">
        <Link href="/" aria-label="Zurück zur Startseite" className="mb-8">
          <Logo size="nav" variant="light" thick showText={false} />
        </Link>
        <DemoLoginButtons standalone />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}
