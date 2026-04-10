import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProvider, useUser } from "@/context/UserContext";
import { ChatProvider, useChat } from "@/context/ChatContext";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { ThemeProvider } from "@/hooks/use-theme";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShoppingCart, ChevronDown } from "lucide-react";
import logoImg from "@assets/logo_no_bg.png";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { SupplierMobileNav } from "@/components/SupplierMobileNav";
import { RestaurantMobileNav } from "@/components/RestaurantMobileNav";
import { useEffect, useCallback, useState, useRef } from "react";
import { navigate } from "wouter/use-browser-location";
import type { User } from "@shared/schema";

import Landing from "@/pages/Landing";
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
import RestaurantSuppliers from "@/pages/restaurant/Suppliers";
import RestaurantCostAnalysis from "@/pages/restaurant/CostAnalysis";
import SupplierHome from "@/pages/supplier/Home";
import SupplierInbox from "@/pages/supplier/Inbox";
import SupplierProducts from "@/pages/supplier/Products";
import SupplierOrders from "@/pages/supplier/Orders";
import SupplierSettings from "@/pages/supplier/Settings";
import SupplierProfile from "@/pages/supplier/Profile";
import SupplierComplaints from "@/pages/supplier/Complaints";
import SupplierRestaurants from "@/pages/supplier/Restaurants";
import SupplierPromotions from "@/pages/supplier/Promotions";
import About from "@/pages/About";
import Documents from "@/pages/Documents";
import OrderDetail from "@/pages/OrderDetail";
import ComplaintDetail from "@/pages/ComplaintDetail";

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

      <Route path="/restaurant/templates"><Redirect to="/restaurant/orders?tab=templates" /></Route>
      <Route path="/restaurant/complaints/:id" component={ComplaintDetail} />
      <Route path="/restaurant/complaints" component={RestaurantComplaints} />
      <Route path="/restaurant/suppliers" component={RestaurantSuppliers} />
      <Route path="/restaurant/settings" component={RestaurantSettings} />
      <Route path="/restaurant/profile" component={RestaurantProfile} />
      <Route path="/restaurant/documents" component={Documents} />
      <Route path="/restaurant/cost-analysis" component={RestaurantCostAnalysis} />
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
      <Route path="/supplier/complaints/:id" component={ComplaintDetail} />
      <Route path="/supplier/complaints" component={SupplierComplaints} />
      <Route path="/supplier/settings" component={SupplierSettings} />
      <Route path="/supplier/profile" component={SupplierProfile} />
      <Route path="/supplier/documents" component={Documents} />
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
      className="relative flex items-center justify-center h-9 w-9 rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15 transition-colors"
      data-testid="button-cart-header"
    >
      <ShoppingCart className="h-4.5 w-4.5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-medium">
          {count}
        </span>
      )}
    </button>
  );
}

function MobileProfileButton() {
  const { currentUser, currentRole } = useUser();
  const [, setLocation] = useLocation();

  const initials = currentUser?.name
    ? currentUser.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <button
      onClick={() => setLocation(`/${currentRole}/settings`)}
      className="md:hidden"
      data-testid="button-mobile-profile"
    >
      <Avatar className="h-9 w-9">
        <AvatarImage src={currentUser?.profileImageUrl || undefined} alt={currentUser?.name || ""} />
        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
          {initials}
        </AvatarFallback>
      </Avatar>
    </button>
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = item.exact
    ? location === item.href
    : location === item.href || location.startsWith(item.href + '/') ||
      (item.children?.some(c => location === c.href || location.startsWith(c.href + '/')) ?? false);

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
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
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
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <Link href={item.href}>
        <span
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-1 ${
            isActive ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
          data-testid={`nav-link-${item.href.split('/').pop()}`}
        >
          {item.label}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </Link>
      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[180px] py-1 bg-[#1e2130] border border-white/10 rounded-xl shadow-xl z-50">
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
        </div>
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
        { href: '/supplier/promotions', label: lang === 'de' ? 'Aktionen' : 'Promozioni' },
      ],
    },
    { href: '/supplier/settings', label: lang === 'de' ? 'Einstellungen' : 'Impostazioni' },
  ];

  const links = currentRole === 'restaurant' ? restaurantLinks : supplierLinks;

  return (
    <nav className="hidden md:flex items-center gap-4 shrink-0" data-testid="header-nav">
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

  const isHomePage = location === `/${currentRole}`;
  const isDetailPage = /^\/(restaurant|supplier)\/(orders|complaints)\/[^/]+$/.test(location);

  const isOrdersPage = /^\/(restaurant|supplier)\/orders$/.test(location);
  const isComplaintsPage = /^\/(restaurant|supplier)\/complaints$/.test(location);
  const isProductsPage = /^\/(restaurant\/catalog|supplier\/products)$/.test(location);
  const isCostAnalysisPage = location === "/restaurant/cost-analysis";
  const isPromotionsPage = location === "/supplier/promotions";

  if (isHomePage || isDetailPage || isOrdersPage || isComplaintsPage || isProductsPage || isCostAnalysisPage || isPromotionsPage) return null;

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
    <div className="bg-[#161921] px-4 md:px-6 pt-4 pb-8 rounded-b-3xl mb-4" data-testid="page-hero">
      <h1 className="text-2xl md:text-3xl font-bold text-white">{page.title}</h1>
      {page.subtitle && (
        <p className="text-sm text-white/50 mt-1">{page.subtitle}</p>
      )}
    </div>
  );
}

function DesktopProfileButton() {
  const { currentUser, currentRole } = useUser();
  const [, setLocation] = useLocation();

  const initials = currentUser?.name
    ? currentUser.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <button
      onClick={() => setLocation(`/${currentRole}/settings`)}
      className="hidden md:flex items-center justify-center h-9 w-9 rounded-full border border-white/20 bg-white/[0.07] hover:bg-white/15 transition-colors"
      data-testid="button-desktop-profile"
    >
      <Avatar className="h-7 w-7">
        <AvatarImage src={currentUser?.profileImageUrl || undefined} alt={currentUser?.name || ""} />
        <AvatarFallback className="bg-transparent text-white font-semibold text-xs">
          {initials}
        </AvatarFallback>
      </Avatar>
    </button>
  );
}

function AppLayout() {
  const { currentRole, isLoading } = useUser();
  const { isInChat } = useChat();
  const [location] = useLocation();

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

  const isDetailPage = /^\/(restaurant|supplier)\/(orders|complaints)\/[^/]+$/.test(location);
  const isHomePage = location === '/restaurant' || location === '/supplier';
  const isInboxPage = location === '/restaurant/inbox' || location === '/supplier/inbox';

  if (location === "/") {
    return <Landing />;
  }

  if (location === "/about") {
    return <About />;
  }

  return (
    <>
      <UserLoader />
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
        <div className="flex h-dvh w-full">
          <div className={`flex flex-col flex-1 min-w-0 ${isInboxPage ? 'overflow-hidden' : 'overflow-auto'} ${isInChat || isDetailPage ? '' : 'px-4 md:px-6 pt-4 md:pt-6'}`}>
            <header className={`dark flex items-center gap-4 px-4 py-3 md:px-6 md:py-2.5 bg-[#161921] shrink-0 rounded-t-3xl ${isInChat || isDetailPage ? 'hidden md:flex' : ''}`}>
              <div className="flex items-center gap-3 shrink-0">
                <MobileProfileButton />
                <div className="hidden md:flex items-center gap-2 shrink-0">
                  <img src={logoImg} alt="GastroConnect Logo" className="h-8 w-8 object-contain invert" />
                  <span className="text-lg font-bold text-white tracking-tight">GastroConnect</span>
                </div>
              </div>
              <HeaderNav />
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <div className="hidden md:block">
                  <RoleSwitcher />
                </div>
                <div className="hidden md:block">
                  <AccountSwitcher compact />
                </div>
                <LanguageToggle />
                {currentRole === "restaurant" && (
                  <div className="hidden md:block">
                    <CartButton />
                  </div>
                )}
                <NotificationBell />
                <DesktopProfileButton />
              </div>
            </header>
            <main className={`flex-1 flex flex-col min-h-0 ${isInChat || isDetailPage ? 'p-0 pb-0' : isInboxPage ? 'pt-0 pb-2 md:pb-4' : 'pt-0 pb-28 md:pb-6'} ${isDetailPage ? '!p-0 !pb-0 md:!p-0 md:!pb-0' : ''}`}>
              <PageHero />
              {location.startsWith("/restaurant") ? <RestaurantRouter /> : <SupplierRouter />}
            </main>
          </div>
          {!isDetailPage && (currentRole === "supplier" ? <SupplierMobileNav /> : <RestaurantMobileNav />)}
        </div>
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
              <ChatProvider>
                <AppLayout />
                <Toaster />
              </ChatProvider>
            </UserProvider>
          </LanguageProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
