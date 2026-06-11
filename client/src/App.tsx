import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
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
import { RoleSwitcher } from "@/components/RoleSwitcher";
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
import { ShoppingCart, ChevronDown, Moon, Sun, LogOut, Users } from "lucide-react";
import logoImg from "@assets/logo_no_bg.png";
import { roleLabel } from "@shared/permissions";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { GlobalSearch, DesktopSearchButton } from "@/components/GlobalSearch";
import Logo from "@/components/Logo";
import { AiAssistant } from "@/components/AiAssistant";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { SupplierMobileNav } from "@/components/SupplierMobileNav";
import { RestaurantMobileNav } from "@/components/RestaurantMobileNav";
import { MobileTopActions } from "@/components/mobile/MobileTopActions";
import { useEffect, useCallback, useState, useRef, useLayoutEffect, lazy, Suspense, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { navigate } from "wouter/use-browser-location";
import type { User } from "@shared/schema";

const Landing = lazy(() => import("@/pages/Landing"));
import Login from "@/pages/Login";
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
import About from "@/pages/About";
import AdminPmsRequests from "@/pages/Admin";
import Documents from "@/pages/Documents";
import OrderDetail from "@/pages/OrderDetail";
import ComplaintDetail from "@/pages/ComplaintDetail";
import CalendarPage from "@/pages/Calendar";
import Help from "@/pages/Help";
import Team from "@/pages/Team";
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
      <Route path="/restaurant/documents" component={Documents} />
      <Route path="/restaurant/monthly-reports" component={RestaurantMonthlyReports} />
      <Route path="/restaurant/cost-analysis/manual" component={RestaurantCostAnalysisManual} />
      <Route path="/restaurant/cost-analysis" component={RestaurantCostAnalysis} />
      <Route path="/restaurant/price-comparison" component={RestaurantPriceComparison} />
      <Route path="/restaurant/calendar">{() => <CalendarPage role="restaurant" />}</Route>
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
      <Route path="/supplier/complaints/:id" component={ComplaintDetail} />
      <Route path="/supplier/complaints" component={SupplierComplaints} />
      <Route path="/supplier/settings" component={SupplierSettings} />
      <Route path="/supplier/profile" component={SupplierProfile} />
      <Route path="/supplier/documents" component={Documents} />
      <Route path="/supplier/calendar">{() => <CalendarPage role="supplier" />}</Route>
      <Route path="/supplier/team" component={Team} />
      <Route path="/supplier/help" component={Help} />
      <Route component={NotFound} />
    </Switch>
  );
}

function UserLoader() {
  const { currentRole, setCurrentUser, setIsLoading, selectedUserId } = useUser();
  const [location, setLocation] = useLocation();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: [`/api/users?role=${currentRole}`],
  });

  useEffect(() => {
    if (!isLoading && users && users.length > 0) {
      const preferred = selectedUserId
        ? users.find(u => u.id === selectedUserId && u.role === currentRole)
        : null;
      const userOfRole = preferred || users.find(u => u.role === currentRole);
      if (userOfRole) {
        setCurrentUser(userOfRole);
      }
      setIsLoading(false);
    } else if (!isLoading) {
      setIsLoading(false);
    }
  }, [users, isLoading, currentRole, setCurrentUser, setIsLoading, selectedUserId]);

  useEffect(() => {
    if (location !== "/" && location !== "/about" && !location.startsWith(`/${currentRole}`)) {
      setLocation(`/${currentRole}`);
    }
  }, [currentRole, location, setLocation]);

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
      className="relative flex items-center justify-center h-8 w-8 rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15 transition-colors"
      data-testid="button-cart-header"
    >
      <ShoppingCart className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-medium">
          {count}
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
  const { currentRole } = useUser();
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
        { href: '/restaurant/monthly-reports', label: lang === 'de' ? 'Monatsberichte' : 'Report mensili' },
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
        { href: '/supplier/complaints', label: lang === 'de' ? 'Reklamationen' : 'Reclami' },
        { href: '/supplier/documents', label: lang === 'de' ? 'Dokumente' : 'Documenti' },
      ],
    },
    {
      href: '/supplier/products',
      label: lang === 'de' ? 'Produkte' : 'Prodotti',
      children: [
        { href: '/supplier/products', label: lang === 'de' ? 'Katalog' : 'Catalogo' },
        { href: '/supplier/restaurants', label: lang === 'de' ? 'Kunden' : 'Clienti' },
      ],
    },
    { href: '/supplier/settings', label: lang === 'de' ? 'Einstellungen' : 'Impostazioni' },
  ];

  const links = currentRole === 'restaurant' ? restaurantLinks : supplierLinks;

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
  const { currentUser, currentRole, setCurrentUser } = useUser();
  const { isDark, toggleTheme } = useTheme();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    try { localStorage.removeItem("gastroconnect_selected_restaurant_id"); } catch {}
    try { localStorage.removeItem("gastroconnect_selected_supplier_id"); } catch {}
    setCurrentUser(null);
    queryClient.clear();
    setLocation("/");
  };

  return { currentUser, currentRole, isDark, toggleTheme, t, lang, handleLogout, setLocation };
}

function ProfileMenuContent() {
  const { isDark, toggleTheme, t, lang, currentRole, handleLogout, setLocation } = useProfileMenu();
  const itemClass =
    "block w-full px-4 py-2 text-sm transition-colors cursor-pointer rounded-none text-gray-400 focus:text-white focus:bg-white/5 hover:text-white hover:bg-white/5";
  return (
    <DropdownMenuContent
      align="end"
      sideOffset={4}
      className="dark min-w-[180px] p-1 bg-[#1e2130] border border-white/10 rounded-xl shadow-xl"
      data-testid="menu-profile"
    >
      <DropdownMenuItem
        onSelect={(e) => { e.preventDefault(); setLocation(`/${currentRole}/team`); }}
        className={itemClass}
        data-testid="menu-item-team"
      >
        <Users className="mr-2 h-4 w-4" />
        {lang === "it" ? "Organizzazione e team" : "Organisation & Team"}
      </DropdownMenuItem>
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
        className={itemClass}
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

// After an account (organization) is chosen, the user must explicitly pick which
// person (member) they are acting as before entering the app. We do not silently
// impersonate the first member — selection drives person attribution everywhere.
function MemberSelectGate({ children }: { children: ReactNode }) {
  const { currentUser, members, membersLoading, currentMember, selectMember } = useUser();
  const { lang } = useLanguage();

  if (!currentUser) return <>{children}</>;
  if (!membersLoading && members.length === 0) return <>{children}</>;
  if (currentMember) return <>{children}</>;

  const getMemberInitials = (name: string) =>
    (name || "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";

  return (
    <div className="min-h-dvh bg-[#161921] text-white flex flex-col items-center justify-center px-4 py-12" data-testid="screen-member-select">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoImg} alt="GastroConnect Logo" className="h-16 w-16 object-contain invert mx-auto mb-4" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="text-member-select-headline">
            {lang === "it" ? "Chi sei?" : "Wer bist du?"}
          </h1>
          <p className="mt-2 text-white/70 text-sm" data-testid="text-member-select-org">
            {currentUser.companyName || currentUser.name}
          </p>
        </div>
        {membersLoading ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <div className="h-1.5 w-1.5 rounded-full bg-white animate-bounce [animation-delay:0ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-white animate-bounce [animation-delay:150ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-white animate-bounce [animation-delay:300ms]" />
          </div>
        ) : (
          <div className="space-y-2">
            {members.map(member => (
              <button
                key={member.id}
                onClick={() => selectMember(member.id)}
                className="w-full rounded-2xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.10] p-4 flex items-center gap-3 text-left transition-colors"
                data-testid={`button-select-member-${member.id}`}
              >
                <Avatar className="h-11 w-11 shrink-0">
                  {member.profileImageUrl ? <AvatarImage src={member.profileImageUrl} alt={member.name} /> : null}
                  <AvatarFallback className="bg-white/10 text-white text-sm font-semibold">
                    {getMemberInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{member.name}</div>
                  <div className="text-xs text-white/60 mt-0.5">{roleLabel(member.role, lang)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AppLayout() {
  const { currentRole, isLoading } = useUser();
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

  if (pathOnly === "/") {
    return (
      <Suspense fallback={<div className="min-h-screen" />}>
        <Landing />
      </Suspense>
    );
  }

  if (pathOnly === "/login") {
    return <Login />;
  }

  if (pathOnly === "/about") {
    return <About />;
  }

  if (pathOnly === "/admin") {
    return <AdminPmsRequests />;
  }

  return (
    <>
      <UserLoader />
      <LanguageSync />
      {isLoading ? (
        <div className="flex h-dvh items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <img src={logoImg} alt="GastroConnect Logo" className="h-28 w-28 object-contain dark:invert" />
            <span className="text-2xl font-bold text-foreground tracking-tight">GastroConnect</span>
            <div className="flex items-center gap-2 mt-2">
              <div className="h-1.5 w-1.5 rounded-full bg-black animate-bounce [animation-delay:0ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-black animate-bounce [animation-delay:150ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-black animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      ) : (
        <MemberSelectGate>
        <div className="flex h-dvh w-full">
          <div ref={scrollContainerRef} data-app-scroll className={`flex flex-col flex-1 min-w-0 ${isInboxPage ? 'overflow-hidden' : 'overflow-auto overscroll-contain'} px-3 md:px-6 pt-3 md:pt-6`}>
            <div className={`dark hidden md:block bg-[#161921] shrink-0 rounded-3xl overflow-hidden mb-3 md:mb-4 ${isInChat || isDetailPage ? 'md:block' : ''}`} data-testid="app-header-shell">
              <header className="flex items-center gap-1.5 md:gap-1.5 lg:gap-4 px-3 py-2.5 md:px-2.5 md:py-2.5 lg:px-6">
                <div className="flex items-center gap-3 shrink-0 lg:flex-1 lg:min-w-0">
                  <MobileProfileButton />
                  <div className="hidden md:flex items-center shrink-0 md:-ml-1 lg:-ml-3">
                    <Logo size="header" variant="light" textClassName="hidden 2xl:inline" data-testid="logo-app-header" />
                  </div>
                </div>
                <HeaderNav />
                <div className="flex items-center gap-1 lg:gap-2 shrink-0 lg:flex-1 lg:min-w-0 justify-end">
                  <DesktopSearchButton />
                  <div className="hidden lg:block">
                    <RoleSwitcher />
                  </div>
                  <div className="hidden lg:block">
                    <AccountSwitcher compact />
                  </div>
                  <LanguageToggle />
                  {currentRole === "restaurant" && (
                    <div className="hidden md:block">
                      <CartButton />
                    </div>
                  )}
                  <HelpButton />
                  <NotificationBell />
                  <DesktopProfileButton />
                </div>
              </header>
              <HeroOutlet />
            </div>
            {!isDetailPage && (
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
                {location.startsWith("/restaurant") ? <RestaurantRouter /> : <SupplierRouter />}
              </div>
            </main>
          </div>
          {!isDetailPage && (currentRole === "supplier" ? <SupplierMobileNav /> : <RestaurantMobileNav />)}
          <GlobalSearch />
          <AiAssistant />
          <KeyboardShortcuts />
        </div>
        </MemberSelectGate>
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <LanguageProvider>
            <UserProvider>
              <HeroProvider>
              <ChatProvider>
                <TourProvider>
                  <AppLayout />
                  <Toaster />
                </TourProvider>
              </ChatProvider>
              </HeroProvider>
            </UserProvider>
          </LanguageProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
