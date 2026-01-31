import { Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/context/UserContext";

export function RoleSwitcher() {
  const { currentRole, switchRole } = useUser();

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
      <Button
        variant={currentRole === "restaurant" ? "default" : "ghost"}
        size="sm"
        onClick={() => switchRole("restaurant")}
        className="gap-2"
        data-testid="button-switch-restaurant"
      >
        <Store className="h-4 w-4" />
        <span className="hidden sm:inline">Restaurant</span>
      </Button>
      <Button
        variant={currentRole === "supplier" ? "default" : "ghost"}
        size="sm"
        onClick={() => switchRole("supplier")}
        className="gap-2"
        data-testid="button-switch-supplier"
      >
        <Truck className="h-4 w-4" />
        <span className="hidden sm:inline">Lieferant</span>
      </Button>
    </div>
  );
}
