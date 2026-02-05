import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Utensils, Truck, MessageSquare, ShoppingCart, Shield, Zap } from "lucide-react";
import logoImage from "@assets/ChatGPT_Image_5._Feb._2026,_17_10_09_1770307834743.png";

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
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Über GastroConnect</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Die moderne B2B-Plattform, die Restaurants und Lieferanten in der Gastronomiebranche verbindet.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Utensils className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Für Restaurants</h3>
              <p className="text-sm text-muted-foreground">
                Entdecken Sie Lieferanten, durchsuchen Sie Produktkataloge und bestellen Sie direkt über die Plattform.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Truck className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Für Lieferanten</h3>
              <p className="text-sm text-muted-foreground">
                Verwalten Sie Ihre Produkte, bearbeiten Sie Bestellungen und pflegen Sie Kundenbeziehungen.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Direkte Kommunikation</h3>
              <p className="text-sm text-muted-foreground">
                WhatsApp-ähnlicher Chat für schnelle und einfache Kommunikation zwischen Partnern.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Einfache Bestellungen</h3>
              <p className="text-sm text-muted-foreground">
                Streamlined Bestellprozess mit Warenkorb, Bestellhistorie und Statusverfolgung.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Reklamationsmanagement</h3>
              <p className="text-sm text-muted-foreground">
                Professionelles Handling von Beschwerden und Qualitätsproblemen.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Schnell & Modern</h3>
              <p className="text-sm text-muted-foreground">
                Responsive Design für Desktop und Mobile mit modernem Benutzerinterface.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            © 2026 GastroConnect. Alle Rechte vorbehalten.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/restaurant">
              <Button variant="outline" data-testid="button-goto-restaurant">
                Als Restaurant starten
              </Button>
            </Link>
            <Link href="/supplier">
              <Button data-testid="button-goto-supplier">
                Als Lieferant starten
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
