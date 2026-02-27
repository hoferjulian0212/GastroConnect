import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { UserProvider, useUser } from "@/context/UserContext";
import { ChatProvider, useChat } from "@/context/ChatContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/hooks/use-theme";
import { LanguageToggle } from "@/components/LanguageToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShoppingCart } from "lucide-react";
import logoImg from "@assets/Gemini_Generated_Image_lqyjgblqyjgblqyj-Photoroom_1772219389604.png";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { RestaurantSidebar } from "@/components/RestaurantSidebar";
import { SupplierSidebar } from "@/components/SupplierSidebar";
import { SupplierMobileNav } from "@/components/SupplierMobileNav";
import { RestaurantMobileNav } from "@/components/RestaurantMobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import type { User } from "@shared/schema";

import Landing from "@/pages/Landing";
import NotFound from "@/pages/not-found";
import RestaurantHome from "@/pages/restaurant/Home";
import RestaurantInbox from "@/pages/restaurant/Inbox";
import RestaurantOrders from "@/pages/restaurant/Orders";
import RestaurantCatalog from "@/pages/restaurant/Catalog";
import RestaurantCart from "@/pages/restaurant/Cart";

import RestaurantSettings from "@/pages/restaurant/Settings";
import RestaurantProfile from "@/pages/restaurant/Profile";
import RestaurantComplaints from "@/pages/restaurant/Complaints";
import RestaurantSuppliers from "@/pages/restaurant/Suppliers";
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

function RestaurantRouter() {
  return (
    <Switch>
      <Route path="/restaurant" component={RestaurantHome} />
      <Route path="/restaurant/inbox" component={RestaurantInbox} />
      <Route path="/restaurant/orders" component={RestaurantOrders} />
      <Route path="/restaurant/catalog" component={RestaurantCatalog} />
      <Route path="/restaurant/cart" component={RestaurantCart} />

      <Route path="/restaurant/complaints" component={RestaurantComplaints} />
      <Route path="/restaurant/suppliers" component={RestaurantSuppliers} />
      <Route path="/restaurant/settings" component={RestaurantSettings} />
      <Route path="/restaurant/profile" component={RestaurantProfile} />
      <Route path="/restaurant/documents" component={Documents} />
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
      <Route path="/supplier/orders" component={SupplierOrders} />
      <Route path="/supplier/promotions" component={SupplierPromotions} />
      <Route path="/supplier/complaints" component={SupplierComplaints} />
      <Route path="/supplier/settings" component={SupplierSettings} />
      <Route path="/supplier/profile" component={SupplierProfile} />
      <Route path="/supplier/documents" component={Documents} />
      <Route component={NotFound} />
    </Switch>
  );
}

function UserLoader() {
  const { currentRole, setCurrentUser, setIsLoading } = useUser();
  const [location, setLocation] = useLocation();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: [`/api/users?role=${currentRole}`],
  });

  useEffect(() => {
    if (!isLoading && users && users.length > 0) {
      const userOfRole = users.find(u => u.role === currentRole);
      if (userOfRole) {
        setCurrentUser(userOfRole);
      }
      setIsLoading(false);
    } else if (!isLoading) {
      setIsLoading(false);
    }
  }, [users, isLoading, currentRole, setCurrentUser, setIsLoading]);

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
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLocation("/restaurant/cart")}
      className="relative"
      data-testid="button-cart-header"
    >
      <ShoppingCart className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-medium">
          {count}
        </span>
      )}
    </Button>
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
      <Avatar className="h-8 w-8">
        <AvatarImage src={currentUser?.profileImageUrl || undefined} alt={currentUser?.name || ""} />
        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
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

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

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
          <div className="space-y-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xl mx-auto">
              G
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32 mx-auto" />
              <Skeleton className="h-3 w-24 mx-auto" />
            </div>
          </div>
        </div>
      ) : (
        <SidebarProvider style={sidebarStyle}>
          <div className="flex h-dvh w-full">
            <div className="hidden md:block">
              {currentRole === "restaurant" ? (
                <RestaurantSidebar />
              ) : (
                <SupplierSidebar />
              )}
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <header className={`flex items-center justify-between gap-4 p-3 border-b border-border bg-background sticky top-0 z-10 ${isInChat ? 'hidden md:flex' : ''}`}>
                <div className="flex items-center gap-3">
                  <MobileProfileButton />
                  <div className="hidden md:flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <img src={logoImg} alt="GastroConnect Logo" className="h-16 w-16 object-contain dark:invert" />
                      <span className="text-lg font-bold text-foreground tracking-tight">GastroConnect</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="hidden md:block">
                    <RoleSwitcher />
                  </div>
                  <LanguageToggle />
                  {currentRole === "restaurant" && (
                    <div className="hidden md:block">
                      <CartButton />
                    </div>
                  )}
                  <NotificationBell />
                </div>
              </header>
              <main className={`flex-1 overflow-auto ${isInChat ? 'p-0 pb-0' : 'p-4 md:p-6 pb-28'} md:p-6 md:pb-6`}>
                {location.startsWith("/restaurant") ? <RestaurantRouter /> : <SupplierRouter />}
              </main>
            </div>
            {currentRole === "supplier" ? <SupplierMobileNav /> : <RestaurantMobileNav />}
          </div>
        </SidebarProvider>
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
