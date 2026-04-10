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
import { User, Save, Truck, Mail, Phone, MapPin, Camera, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";

const profileSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  email: z.string().email("Ungültige E-Mail-Adresse"),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  description: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function SupplierProfile() {
  const { currentUser, setCurrentUser } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const { lang } = useLanguage();
  const t = useT(lang);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: lang === "de" ? "Ungültiges Format" : "Formato non valido",
        description: lang === "de" ? "Bitte wählen Sie eine Bilddatei aus." : "Seleziona un file immagine.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: lang === "de" ? "Datei zu groß" : "File troppo grande",
        description: lang === "de" ? "Das Bild darf maximal 5 MB groß sein." : "L'immagine non può superare i 5 MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      const uploadRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await uploadRes.json();

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      const profileImageUrl = objectPath;
      await apiRequest("PATCH", `/api/users/${currentUser.id}`, { profileImageUrl });

      setCurrentUser({ ...currentUser, profileImageUrl });
      toast({
        title: t("profile", "profilePhotoUpdated"),
        description: lang === "de" ? "Ihr Profilbild wurde erfolgreich hochgeladen." : "La tua foto profilo è stata caricata con successo.",
      });
    } catch (error) {
      console.error("Upload failed:", error);
      toast({
        title: t("common", "error"),
        description: t("profile", "profilePhotoError"),
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
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
    mutationFn: async (data: ProfileFormData) => {
      const res = await apiRequest("PATCH", `/api/users/${currentUser?.id}`, data);
      return await res.json();
    },
    onSuccess: (updatedUser) => {
      setCurrentUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: t("profile", "profileUpdated"),
        description: t("profile", "profileUpdatedDesc"),
      });
    },
    onError: () => {
      toast({
        title: t("common", "error"),
        description: t("profile", "profileUpdateError"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">{t("common", "profile")}</h1>
        <p className="text-sm md:text-base text-muted-foreground">{lang === "de" ? "Verwalten Sie Ihre Unternehmensdaten" : "Gestisci i dati della tua azienda"}</p>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 order-2 lg:order-1">
          <Card>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <User className="h-4 w-4 md:h-5 md:w-5" />
                {lang === "de" ? "Unternehmensdaten" : "Dati aziendali"}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {lang === "de" ? "Kontakt- und Unternehmensinformationen" : "Informazioni di contatto e aziendali"}
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
                            {t("profile", "companyName")}
                          </FormLabel>
                          <FormControl>
                            <Input placeholder={lang === "de" ? "Mein Lieferunternehmen" : "La mia azienda di fornitura"} {...field} data-testid="input-company-name" />
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
                          <FormLabel>{lang === "de" ? "Ansprechpartner" : "Referente"}</FormLabel>
                          <FormControl>
                            <Input placeholder={lang === "de" ? "Max Mustermann" : "Mario Rossi"} {...field} data-testid="input-name" />
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
                            {t("profile", "email")}
                          </FormLabel>
                          <FormControl>
                            <Input type="email" placeholder={lang === "de" ? "email@händler.de" : "email@commerciante.it"} {...field} data-testid="input-email" />
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
                            {t("profile", "phone")}
                          </FormLabel>
                          <FormControl>
                            <Input type="tel" placeholder="+49 123 456789" {...field} data-testid="input-phone" />
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
                            {t("profile", "companyAddress")}
                          </FormLabel>
                          <FormControl>
                            <Input placeholder={lang === "de" ? "Musterstraße 123" : "Via Esempio 123"} {...field} data-testid="input-address" />
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
                          <FormLabel>{lang === "de" ? "PLZ" : "CAP"}</FormLabel>
                          <FormControl>
                            <Input placeholder={lang === "de" ? "12345" : "39100"} {...field} data-testid="input-postal-code" />
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
                          <FormLabel>{lang === "de" ? "Stadt" : "Città"}</FormLabel>
                          <FormControl>
                            <Input placeholder={lang === "de" ? "Berlin" : "Bolzano"} {...field} data-testid="input-city" />
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
                          <FormLabel>{lang === "de" ? "Unternehmensbeschreibung" : "Descrizione aziendale"}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={lang === "de" ? "Beschreiben Sie Ihr Unternehmen und Ihre Produkte..." : "Descrivi la tua azienda e i tuoi prodotti..."}
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
                    data-testid="button-save-profile"
                  >
                    <Save className="h-4 w-4" />
                    {t("common", "save")}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="order-1 lg:order-2">
          <Card>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="text-base md:text-lg">{t("common", "profile")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center text-center p-3 pt-0 md:p-6 md:pt-0">
              <div className="relative group mb-3 md:mb-4">
                <Avatar className="h-16 w-16 md:h-24 md:w-24">
                  <AvatarImage src={currentUser?.profileImageUrl || undefined} alt={currentUser?.name} />
                  <AvatarFallback className="bg-secondary/10 text-secondary text-xl md:text-2xl">
                    {currentUser?.companyName?.charAt(0) || currentUser?.name.charAt(0) || "L"}
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
                    <Loader2 className="h-5 w-5 md:h-6 md:w-6 text-white animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 md:h-6 md:w-6 text-white" />
                  )}
                </button>
              </div>
              <h3 className="font-medium text-base md:text-lg">
                {currentUser?.companyName || currentUser?.name || (lang === "de" ? "Mein Händler" : "Il mio commerciante")}
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground">{currentUser?.email}</p>
              <div className="mt-3 md:mt-4 w-full space-y-2">
                <div className="flex justify-between gap-3 text-xs md:text-sm py-1.5 md:py-2 border-b border-border">
                  <span className="text-muted-foreground shrink-0">{lang === "de" ? "Rolle" : "Ruolo"}</span>
                  <span className="text-right truncate">{t("common", "supplier")}</span>
                </div>
                <div className="flex justify-between gap-3 text-xs md:text-sm py-1.5 md:py-2 border-b border-border">
                  <span className="text-muted-foreground shrink-0">{t("profile", "phone")}</span>
                  <span className="text-right truncate">{currentUser?.phone || "-"}</span>
                </div>
                <div className="flex justify-between gap-3 text-xs md:text-sm py-1.5 md:py-2">
                  <span className="text-muted-foreground shrink-0">{lang === "de" ? "Stadt" : "Città"}</span>
                  <span className="text-right truncate">{currentUser?.city || "-"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
