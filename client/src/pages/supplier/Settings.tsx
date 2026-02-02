import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Settings as SettingsIcon, Save, Building2, Mail, Phone, MapPin, Truck } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const settingsSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  email: z.string().email("Ungültige E-Mail-Adresse"),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  description: z.string().optional(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export default function SupplierSettings() {
  const { currentUser, setCurrentUser } = useUser();
  const { toast } = useToast();

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: currentUser?.name || "",
      email: currentUser?.email || "",
      phone: currentUser?.phone || "",
      companyName: currentUser?.companyName || "",
      address: currentUser?.address || "",
      city: currentUser?.city || "",
      postalCode: currentUser?.postalCode || "",
      description: currentUser?.description || "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      return apiRequest("PATCH", `/api/users/${currentUser?.id}`, data);
    },
    onSuccess: (updatedUser) => {
      setCurrentUser(updatedUser as any);
      toast({
        title: "Profil aktualisiert",
        description: "Ihre Änderungen wurden gespeichert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Ihre Änderungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    updateProfileMutation.mutate(data);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Einstellungen</h1>
        <p className="text-sm md:text-base text-muted-foreground">Verwalten Sie Ihre Daten</p>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 order-2 lg:order-1">
          <Card>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <SettingsIcon className="h-4 w-4 md:h-5 md:w-5" />
                Unternehmensdaten
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Kontakt- und Unternehmensinformationen
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel className="flex items-center gap-2">
                            <Truck className="h-4 w-4" />
                            Firmenname
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Mein Lieferunternehmen"
                              {...field}
                              data-testid="input-company-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ansprechpartner</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Max Mustermann"
                              {...field}
                              data-testid="input-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            E-Mail
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="email@lieferant.de"
                              {...field}
                              data-testid="input-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Telefon
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="+49 123 456789"
                              {...field}
                              data-testid="input-phone"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Adresse
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Musterstraße 123"
                              {...field}
                              data-testid="input-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PLZ</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="12345"
                              {...field}
                              data-testid="input-postal-code"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stadt</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Berlin"
                              {...field}
                              data-testid="input-city"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Unternehmensbeschreibung</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Beschreiben Sie Ihr Unternehmen und Ihre Produkte..."
                              className="resize-none min-h-[100px]"
                              {...field}
                              data-testid="textarea-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="secondary"
                    className="gap-2"
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-save-settings"
                  >
                    <Save className="h-4 w-4" />
                    Speichern
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="order-1 lg:order-2">
          <Card>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="text-base md:text-lg">Profil</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center text-center p-3 pt-0 md:p-6 md:pt-0">
              <Avatar className="h-16 w-16 md:h-24 md:w-24 mb-3 md:mb-4">
                <AvatarFallback className="bg-secondary/10 text-secondary text-xl md:text-2xl">
                  {currentUser?.companyName?.charAt(0) || currentUser?.name.charAt(0) || "L"}
                </AvatarFallback>
              </Avatar>
              <h3 className="font-medium text-base md:text-lg">
                {currentUser?.companyName || currentUser?.name || "Mein Lieferant"}
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground">{currentUser?.email}</p>
              <div className="mt-3 md:mt-4 w-full space-y-2">
                <div className="flex justify-between text-xs md:text-sm py-1.5 md:py-2 border-b border-border">
                  <span className="text-muted-foreground">Rolle</span>
                  <span>Lieferant</span>
                </div>
                <div className="flex justify-between text-xs md:text-sm py-1.5 md:py-2 border-b border-border">
                  <span className="text-muted-foreground">Telefon</span>
                  <span>{currentUser?.phone || "-"}</span>
                </div>
                <div className="flex justify-between text-xs md:text-sm py-1.5 md:py-2">
                  <span className="text-muted-foreground">Stadt</span>
                  <span>{currentUser?.city || "-"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
