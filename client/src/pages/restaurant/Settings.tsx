import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings as SettingsIcon, Save, Building2, Mail, Phone, MapPin, Camera, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useRef, useState } from "react";

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

export default function RestaurantSettings() {
  const { currentUser, setCurrentUser } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Ungültiges Format",
        description: "Bitte wählen Sie eine Bilddatei aus.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Datei zu groß",
        description: "Das Bild darf maximal 5 MB groß sein.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      const response = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      }) as unknown as { uploadURL: string; objectPath: string };

      await fetch(response.uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      const profileImageUrl = response.objectPath;
      await apiRequest("PATCH", `/api/users/${currentUser.id}`, { profileImageUrl });
      
      setCurrentUser({ ...currentUser, profileImageUrl });
      toast({
        title: "Profilbild aktualisiert",
        description: "Ihr Profilbild wurde erfolgreich hochgeladen.",
      });
    } catch (error) {
      console.error("Upload failed:", error);
      toast({
        title: "Fehler",
        description: "Das Bild konnte nicht hochgeladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

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
        <p className="text-xs md:text-sm text-muted-foreground">Verwalten Sie Ihre Restaurantdaten</p>
      </div>

      <div className="grid gap-3 md:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <SettingsIcon className="h-4 w-4 md:h-5 md:w-5" />
                Profildaten
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Aktualisieren Sie Ihre Kontakt- und Unternehmensinformationen
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
                            <Building2 className="h-4 w-4" />
                            Restaurantname
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Mein Restaurant"
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
                              placeholder="email@restaurant.de"
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
                          <FormLabel>Beschreibung</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Kurze Beschreibung Ihres Restaurants..."
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

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Profil</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center text-center">
              <div className="relative group mb-4">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={currentUser?.profileImageUrl || undefined} alt={currentUser?.name} />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    {currentUser?.companyName?.charAt(0) || currentUser?.name.charAt(0) || "R"}
                  </AvatarFallback>
                </Avatar>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  data-testid="input-profile-image"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  data-testid="button-upload-image"
                >
                  {isUploadingImage ? (
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  ) : (
                    <Camera className="h-6 w-6 text-white" />
                  )}
                </button>
              </div>
              <h3 className="font-medium text-lg">
                {currentUser?.companyName || currentUser?.name || "Mein Restaurant"}
              </h3>
              <p className="text-sm text-muted-foreground">{currentUser?.email}</p>
              <div className="mt-4 w-full space-y-2">
                <div className="flex justify-between text-sm py-2 border-b border-border">
                  <span className="text-muted-foreground">Rolle</span>
                  <span>Restaurant</span>
                </div>
                <div className="flex justify-between text-sm py-2 border-b border-border">
                  <span className="text-muted-foreground">Telefon</span>
                  <span>{currentUser?.phone || "-"}</span>
                </div>
                <div className="flex justify-between text-sm py-2">
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
