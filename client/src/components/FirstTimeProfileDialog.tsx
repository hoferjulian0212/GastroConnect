import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2, Phone, ArrowRight, PartyPopper } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { roleLabel } from "@shared/permissions";
import type { Member } from "@shared/schema";

const schema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  phone: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

// Blocking first-login popup: every member must confirm their profile data
// (name, phone, optional photo) once before using the app. Shown as a modal
// that cannot be dismissed — completing it is the only way forward, and that
// is stated explicitly so nobody thinks they are "stuck" on a settings page.
export function FirstTimeProfileDialog() {
  const { currentMember, setCurrentMember, currentUser, isAuthenticated } = useUser();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [pendingImagePath, setPendingImagePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const open = isAuthenticated && !!currentMember && !currentMember.profileCompletedAt;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: currentMember?.name || "",
      phone: currentMember?.phone || "",
    },
    values: currentMember
      ? { name: currentMember.name || "", phone: currentMember.phone || "" }
      : undefined,
  });

  const finishMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload: Record<string, unknown> = { ...data };
      if (pendingImagePath) payload.profileImageUrl = pendingImagePath;
      const res = await apiRequest("PATCH", "/api/members/me", payload);
      return (await res.json()) as Member;
    },
    onSuccess: (updated) => {
      setCurrentMember(updated);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: lang === "de" ? "Willkommen an Bord!" : "Benvenuto a bordo!",
        description:
          lang === "de"
            ? "Ihr Profil ist eingerichtet. Viel Erfolg!"
            : "Il tuo profilo è pronto. Buon lavoro!",
      });
    },
    onError: () => {
      toast({
        title: lang === "de" ? "Fehler" : "Errore",
        description:
          lang === "de"
            ? "Das Profil konnte nicht gespeichert werden. Bitte erneut versuchen."
            : "Impossibile salvare il profilo. Riprova.",
        variant: "destructive",
      });
    },
  });

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
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
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error(`upload failed: ${putRes.status}`);
      setPendingImagePath(objectPath);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      console.error("Upload failed:", error);
      toast({
        title: lang === "de" ? "Fehler" : "Errore",
        description: lang === "de" ? "Das Bild konnte nicht hochgeladen werden." : "Impossibile caricare l'immagine.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!open) return null;

  const initials = (currentMember?.name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Dialog open>
      <DialogContent
        className="max-w-md p-0 gap-0 overflow-hidden rounded-3xl"
        hideClose
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="dialog-first-time-profile"
      >
        {/* Dark welcome header, matching the app's hero style */}
        <div className="bg-[#161921] px-6 pt-6 pb-5 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">
            <PartyPopper className="h-6 w-6 text-white" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-xl font-bold text-white">
              {lang === "de"
                ? `Willkommen${currentMember?.name ? `, ${currentMember.name.split(" ")[0]}` : ""}!`
                : `Benvenuto${currentMember?.name ? `, ${currentMember.name.split(" ")[0]}` : ""}!`}
            </DialogTitle>
            <DialogDescription className="text-sm text-white/60">
              {lang === "de"
                ? "Nur noch ein Schritt: Bitte bestätigen Sie kurz Ihre Daten, um loszulegen."
                : "Un ultimo passo: conferma i tuoi dati per iniziare."}
            </DialogDescription>
          </div>
          {currentMember && currentUser && (
            <p className="text-xs text-white/40">
              {roleLabel(currentMember.role, lang)} · {currentUser.companyName || currentUser.name}
            </p>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Avatar (optional) */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <Avatar className="h-16 w-16">
                <AvatarImage
                  src={previewUrl || currentMember?.profileImageUrl || undefined}
                  alt={currentMember?.name}
                />
                <AvatarFallback className="bg-primary/10 text-primary text-xl">{initials}</AvatarFallback>
              </Avatar>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                data-testid="input-onboarding-profile-image"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm disabled:opacity-60"
                data-testid="button-onboarding-upload-image"
                aria-label={lang === "de" ? "Profilbild hochladen" : "Carica foto profilo"}
              >
                {isUploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {lang === "de" ? "Profilbild" : "Foto profilo"}{" "}
                <span className="text-muted-foreground font-normal">
                  ({lang === "de" ? "optional" : "facoltativa"})
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "de"
                  ? "Hilft Kollegen, Sie im Chat zu erkennen."
                  : "Aiuta i colleghi a riconoscerti in chat."}
              </p>
            </div>
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => finishMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {lang === "de" ? "Ihr Name" : "Il tuo nome"}{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        autoFocus
                        placeholder={lang === "de" ? "Max Mustermann" : "Mario Rossi"}
                        {...field}
                        data-testid="input-onboarding-name"
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
                    <FormLabel className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {lang === "de" ? "Telefon" : "Telefono"}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({lang === "de" ? "optional" : "facoltativo"})
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+49 123 456789" {...field} data-testid="input-onboarding-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                size="lg"
                className="w-full h-12 text-base font-semibold gap-2"
                disabled={finishMutation.isPending || isUploadingImage}
                data-testid="button-onboarding-finish"
              >
                {finishMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {lang === "de" ? "Speichern & loslegen" : "Salva e inizia"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                {lang === "de"
                  ? "Diese Angaben sind erforderlich, um die App zu nutzen. Sie können sie später jederzeit im Profil ändern."
                  : "Questi dati sono necessari per usare l'app. Potrai modificarli in seguito nel tuo profilo."}
              </p>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
