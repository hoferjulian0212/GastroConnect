import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Utensils, Truck, MessageSquare, ShoppingCart, Shield, Zap } from "lucide-react";
import logoImage from "@assets/logo_no_bg.png";

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 pt-4 pb-6">
        <div className="flex items-start justify-between mb-4">
          <Link href="/">
            <Button variant="ghost" className="gap-2" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </Button>
          </Link>
        </div>

        <div className="text-center mb-6">
          <img 
            src={logoImage} 
            alt="GastroConnect Logo" 
            className="h-28 md:h-36 object-contain mx-auto mb-4 dark:invert"
          />
          <h1 className="text-2xl md:text-3xl font-bold mb-3">Über GastroConnect</h1>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            Die moderne B2B-Plattform, die Betriebe und Händler in der Gastronomiebranche verbindet.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Utensils className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Für Betriebe</h3>
              <p className="text-xs text-muted-foreground">
                Entdecken Sie Händler, durchsuchen Sie Produktkataloge und bestellen Sie direkt über die Plattform.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Truck className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Für Händler</h3>
              <p className="text-xs text-muted-foreground">
                Verwalten Sie Ihre Produkte, bearbeiten Sie Bestellungen und pflegen Sie Kundenbeziehungen.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Direkte Kommunikation</h3>
              <p className="text-xs text-muted-foreground">
                WhatsApp-ähnlicher Chat für schnelle und einfache Kommunikation zwischen Partnern.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <ShoppingCart className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Einfache Bestellungen</h3>
              <p className="text-xs text-muted-foreground">
                Streamlined Bestellprozess mit Warenkorb, Bestellhistorie und Statusverfolgung.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Shield className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Reklamationsmanagement</h3>
              <p className="text-xs text-muted-foreground">
                Professionelles Handling von Beschwerden und Qualitätsproblemen.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Zap className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Schnell & Modern</h3>
              <p className="text-xs text-muted-foreground">
                Responsive Design für Desktop und Mobile mit modernem Benutzerinterface.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            © 2026 GastroConnect. Alle Rechte vorbehalten.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/restaurant">
              <Button variant="outline" size="sm" data-testid="button-goto-restaurant">
                Als Betrieb starten
              </Button>
            </Link>
            <Link href="/supplier">
              <Button size="sm" data-testid="button-goto-supplier">
                Als Händler starten
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
