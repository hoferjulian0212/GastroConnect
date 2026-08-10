import { MobilePageHeader } from "@/components/mobile";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Save, Mail, Phone, Camera, Loader2, Sparkles } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { roleLabel } from "@shared/permissions";
import type { Member } from "@shared/schema";

const memberProfileSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  phone: z.string().optional(),
});

type MemberProfileFormData = z.infer<typeof memberProfileSchema>;

export default function MemberProfile() {
  const { currentMember, setCurrentMember, currentUser } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const { lang } = useLanguage();
  const t = useT(lang);

  const isFirstTime = !!currentMember && !currentMember.profileCompletedAt;

  const form = useForm<MemberProfileFormData>({
    resolver: zodResolver(memberProfileSchema),
    defaultValues: {
      name: currentMember?.name || "",
      phone: currentMember?.phone || "",
    },
  });

  const applyUpdated = (updated: Member) => {
    setCurrentMember(updated);
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    if (currentUser?.id) {
      queryClient.invalidateQueries({ queryKey: ["/api/orgs", currentUser.id, "members"] });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data: MemberProfileFormData) => {
      const res = await apiRequest("PATCH", "/api/members/me", data);
      return (await res.json()) as Member;
    },
    onSuccess: (updated) => {
      applyUpdated(updated);
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

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentMember) return;

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
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error(`upload failed: ${putRes.status}`);
      const res = await apiRequest("PATCH", "/api/members/me", { profileImageUrl: objectPath });
      const updated = (await res.json()) as Member;
      applyUpdated(updated);
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initials = (currentMember?.name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
      <MobilePageHeader
        title={lang === "de" ? "Mein Profil" : "Il mio profilo"}
        subtitle={lang === "de" ? "Ihre persönlichen Daten" : "I tuoi dati personali"}
        testId="mobile-header-member-profile"
      />

      {isFirstTime && (
        <Card className="border-primary/40 bg-primary/5" data-testid="card-first-time-profile">
          <CardContent className="flex items-start gap-3 p-4">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">
                {lang === "de" ? "Willkommen! Bitte vervollständigen Sie Ihr Profil." : "Benvenuto! Completa il tuo profilo."}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {lang === "de"
                  ? "Prüfen Sie Ihren Namen, ergänzen Sie Ihre Telefonnummer und laden Sie optional ein Profilbild hoch. Danach speichern."
                  : "Controlla il tuo nome, aggiungi il numero di telefono e carica una foto profilo (facoltativo). Poi salva."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 order-2 lg:order-1">
          <Card>
            <CardHeader className="p-3 md:p-6">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <User className="h-4 w-4 md:h-5 md:w-5" />
                {lang === "de" ? "Persönliche Daten" : "Dati personali"}
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {lang === "de"
                  ? "Diese Daten gehören zu Ihrem persönlichen Konto."
                  : "Questi dati appartengono al tuo account personale."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "de" ? "Name" : "Nome"}</FormLabel>
                          <FormControl>
                            <Input placeholder={lang === "de" ? "Max Mustermann" : "Mario Rossi"} {...field} data-testid="input-member-name" />
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
                            <Input type="tel" placeholder="+49 123 456789" {...field} data-testid="input-member-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormItem className="sm:col-span-2">
                      <FormLabel className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        {t("profile", "email")}
                      </FormLabel>
                      <Input value={currentMember?.email || "-"} disabled data-testid="input-member-email" />
                      <p className="text-xs text-muted-foreground">
                        {lang === "de"
                          ? "Die E-Mail-Adresse ist Ihr Login und kann nur vom Administrator geändert werden."
                          : "L'indirizzo e-mail è il tuo login e può essere modificato solo dall'amministratore."}
                      </p>
                    </FormItem>
                  </div>

                  <Button
                    type="submit"
                    className="gap-2"
                    disabled={updateMutation.isPending}
                    data-testid="button-save-member-profile"
                  >
                    {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isFirstTime ? (lang === "de" ? "Profil abschließen" : "Completa profilo") : t("common", "save")}
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
                  <AvatarImage src={currentMember?.profileImageUrl || undefined} alt={currentMember?.name} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl md:text-2xl">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  data-testid="input-member-profile-image"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed"
                  data-testid="button-upload-member-image"
                >
                  {isUploadingImage ? (
                    <Loader2 className="h-5 w-5 md:h-6 md:w-6 text-white animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 md:h-6 md:w-6 text-white" />
                  )}
                </button>
              </div>
              <h3 className="font-medium text-base md:text-lg" data-testid="text-member-name">
                {currentMember?.name}
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground">{currentMember?.email || "-"}</p>
              <div className="mt-3 md:mt-4 w-full space-y-2">
                <div className="flex justify-between gap-3 text-xs md:text-sm py-1.5 md:py-2 border-b border-border">
                  <span className="text-muted-foreground shrink-0">{lang === "de" ? "Rolle" : "Ruolo"}</span>
                  <span className="text-right truncate" data-testid="text-member-role">
                    {currentMember ? roleLabel(currentMember.role, lang) : "-"}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-xs md:text-sm py-1.5 md:py-2 border-b border-border">
                  <span className="text-muted-foreground shrink-0">{t("profile", "phone")}</span>
                  <span className="text-right truncate">{currentMember?.phone || "-"}</span>
                </div>
                <div className="flex justify-between gap-3 text-xs md:text-sm py-1.5 md:py-2">
                  <span className="text-muted-foreground shrink-0">{lang === "de" ? "Unternehmen" : "Azienda"}</span>
                  <span className="text-right truncate">{currentUser?.companyName || currentUser?.name || "-"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
