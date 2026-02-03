import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { UserProvider, useUser } from "@/context/UserContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { RestaurantSidebar } from "@/components/RestaurantSidebar";
import { SupplierSidebar } from "@/components/SupplierSidebar";
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
import SupplierHome from "@/pages/supplier/Home";
import SupplierInbox from "@/pages/supplier/Inbox";
import SupplierProducts from "@/pages/supplier/Products";
import SupplierOrders from "@/pages/supplier/Orders";
import SupplierHistory from "@/pages/supplier/History";
import SupplierSettings from "@/pages/supplier/Settings";

function RestaurantRouter() {
  return (
    <Switch>
      <Route path="/restaurant" component={RestaurantHome} />
      <Route path="/restaurant/inbox" component={RestaurantInbox} />
      <Route path="/restaurant/orders" component={RestaurantOrders} />
      <Route path="/restaurant/catalog" component={RestaurantCatalog} />
      <Route path="/restaurant/cart" component={RestaurantCart} />
      <Route path="/restaurant/history" component={RestaurantHistory} />
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
            {currentRole === "restaurant" ? <RestaurantSidebar /> : <SupplierSidebar />}
            <div className="flex flex-col flex-1 min-w-0">
              <header className="flex items-center justify-between gap-4 p-3 border-b border-border bg-background sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <RoleSwitcher />
                </div>
                <ThemeToggle />
              </header>
              <main className="flex-1 overflow-auto p-6">
                {location.startsWith("/restaurant") ? <RestaurantRouter /> : <SupplierRouter />}
              </main>
            </div>
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
