import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { UserProvider, useUser } from "@/context/UserContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { RestaurantSidebar } from "@/components/RestaurantSidebar";
import { SupplierSidebar } from "@/components/SupplierSidebar";
import { SupplierMobileNav } from "@/components/SupplierMobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import type { User } from "@shared/schema";

import NotFound from "@/pages/not-found";
import RestaurantHome from "@/pages/restaurant/Home";
import RestaurantInbox from "@/pages/restaurant/Inbox";
import RestaurantOrders from "@/pages/restaurant/Orders";
import RestaurantCatalog from "@/pages/restaurant/Catalog";
import RestaurantCart from "@/pages/restaurant/Cart";
import RestaurantHistory from "@/pages/restaurant/History";
import RestaurantSettings from "@/pages/restaurant/Settings";
import RestaurantComplaints from "@/pages/restaurant/Complaints";
import SupplierHome from "@/pages/supplier/Home";
import SupplierInbox from "@/pages/supplier/Inbox";
import SupplierProducts from "@/pages/supplier/Products";
import SupplierOrders from "@/pages/supplier/Orders";
import SupplierHistory from "@/pages/supplier/History";
import SupplierSettings from "@/pages/supplier/Settings";
import SupplierComplaints from "@/pages/supplier/Complaints";

function RestaurantRouter() {
  return (
    <Switch>
      <Route path="/restaurant" component={RestaurantHome} />
      <Route path="/restaurant/inbox" component={RestaurantInbox} />
      <Route path="/restaurant/orders" component={RestaurantOrders} />
      <Route path="/restaurant/catalog" component={RestaurantCatalog} />
      <Route path="/restaurant/cart" component={RestaurantCart} />
      <Route path="/restaurant/history" component={RestaurantHistory} />
      <Route path="/restaurant/complaints" component={RestaurantComplaints} />
      <Route path="/restaurant/settings" component={RestaurantSettings} />
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
      <Route path="/supplier/orders" component={SupplierOrders} />
      <Route path="/supplier/history" component={SupplierHistory} />
      <Route path="/supplier/complaints" component={SupplierComplaints} />
      <Route path="/supplier/settings" component={SupplierSettings} />
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
    if (location === "/" || !location.startsWith(`/${currentRole}`)) {
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

function AppLayout() {
  const { currentRole, isLoading } = useUser();
  const [location] = useLocation();

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <>
      <UserLoader />
      {isLoading ? (
        <div className="flex h-screen items-center justify-center">
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
          <div className="flex h-screen w-full">
            {currentRole === "restaurant" ? (
              <RestaurantSidebar />
            ) : (
              <div className="hidden md:block">
                <SupplierSidebar />
              </div>
            )}
            <div className="flex flex-col flex-1 min-w-0">
              <header className={`flex items-center justify-between gap-4 p-3 border-b border-border bg-background sticky top-0 z-10 ${currentRole === "supplier" ? "md:flex" : ""}`}>
                <div className="flex items-center gap-2">
                  <div className={currentRole === "supplier" ? "hidden md:block" : ""}>
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                  </div>
                  <RoleSwitcher />
                </div>
                <div className="flex items-center gap-2">
                  {currentRole === "restaurant" && (
                    <CartButton />
                  )}
                  <ThemeToggle />
                </div>
              </header>
              <main className={`flex-1 overflow-auto p-4 md:p-6 ${currentRole === "supplier" ? "pb-20 md:pb-6" : ""}`}>
                {location.startsWith("/restaurant") ? <RestaurantRouter /> : <SupplierRouter />}
              </main>
            </div>
            {currentRole === "supplier" && <SupplierMobileNav />}
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
        <UserProvider>
          <AppLayout />
          <Toaster />
        </UserProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
