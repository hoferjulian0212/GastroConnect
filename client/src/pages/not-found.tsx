import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useUser } from "@/context/UserContext";

export default function NotFound() {
  const { currentRole } = useUser();
  const homeUrl = currentRole === "restaurant" ? "/restaurant" : "/supplier";

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center text-center py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2" data-testid="text-404-title">Seite nicht gefunden</h1>
          <p className="text-muted-foreground mb-6">
            Die angeforderte Seite existiert nicht oder wurde verschoben.
          </p>
          <Button asChild>
            <Link href={homeUrl} className="gap-2" data-testid="link-go-home">
              <Home className="h-4 w-4" />
              Zur Startseite
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
