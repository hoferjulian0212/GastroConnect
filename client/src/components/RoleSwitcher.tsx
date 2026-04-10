import { Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/context/UserContext";

export function RoleSwitcher() {
  const { currentRole, switchRole } = useUser();

  return (
    <div className="flex items-center gap-1 p-1 bg-white/[0.07] border border-white/20 rounded-full">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => switchRole("restaurant")}
        className={`gap-2 rounded-full h-7 px-3 ${currentRole === "restaurant" ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
        data-testid="button-switch-restaurant"
      >
        <Store className="h-4 w-4" />
        <span className="hidden sm:inline">Betrieb</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => switchRole("supplier")}
        className={`gap-2 rounded-full h-7 px-3 ${currentRole === "supplier" ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
        data-testid="button-switch-supplier"
      >
        <Truck className="h-4 w-4" />
        <span className="hidden sm:inline">Händler</span>
      </Button>
    </div>
  );
}
