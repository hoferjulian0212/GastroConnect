import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings as SettingsIcon, Save, Building2, Mail, Phone, MapPin, Truck, Camera, Loader2, CalendarDays, Check } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useRef, useState } from "react";
import type { User, DeliverySchedule } from "@shared/schema";

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

const WEEKDAYS = [
  { value: 1, label: "Montag" },
  { value: 2, label: "Dienstag" },
  { value: 3, label: "Mittwoch" },
  { value: 4, label: "Donnerstag" },
  { value: 5, label: "Freitag" },
  { value: 6, label: "Samstag" },
  { value: 0, label: "Sonntag" },
];

export default function SupplierSettings() {
  const { currentUser, setCurrentUser } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

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
      const uploadRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type,
      });
      const { uploadURL, objectPath } = await uploadRes.json();

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      const profileImageUrl = objectPath;
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
      const res = await apiRequest("PATCH", `/api/users/${currentUser?.id}`, data);
      return await res.json();
    },
    onSuccess: (updatedUser) => {
      setCurrentUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
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

  const { data: restaurants } = useQuery<User[]>({
    queryKey: ["/api/users?role=restaurant"],
  });

  const { data: deliverySchedules } = useQuery<(DeliverySchedule & { restaurant: User })[]>({
    queryKey: [`/api/delivery-schedules?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const handleRestaurantSelect = (restaurantId: string) => {
    setSelectedRestaurant(restaurantId);
    const existing = deliverySchedules?.filter(s => s.restaurantId === restaurantId).map(s => s.dayOfWeek) || [];
    setSelectedDays(existing);
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/delivery-schedules", {
        supplierId: currentUser?.id,
        restaurantId: selectedRestaurant,
        days: selectedDays,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/delivery-schedules?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/delivery-schedules/restaurant?supplierId=${currentUser?.id}&restaurantId=${selectedRestaurant}`] });
      toast({ title: "Liefertage gespeichert", description: "Die Liefertage wurden aktualisiert." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Die Liefertage konnten nicht gespeichert werden.", variant: "destructive" });
    },
  });

  const restaurantsWithSchedules = restaurants?.map(r => {
    const days = deliverySchedules?.filter(s => s.restaurantId === r.id).map(s => s.dayOfWeek) || [];
    return { ...r, deliveryDays: days };
  }) || [];

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

      <Card>
        <CardHeader className="p-3 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <CalendarDays className="h-4 w-4 md:h-5 md:w-5" />
            Liefertage
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Legen Sie fest, an welchen Wochentagen Sie an einzelne Kunden liefern
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Kunde auswählen</label>
            <Select value={selectedRestaurant} onValueChange={handleRestaurantSelect}>
              <SelectTrigger data-testid="select-delivery-restaurant">
                <SelectValue placeholder="Restaurant auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {restaurants?.filter(r => r.role === "restaurant").map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.companyName || r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedRestaurant && (
            <div className="space-y-3">
              <label className="text-sm font-medium">Liefertage für diesen Kunden</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {WEEKDAYS.map(day => (
                  <label
                    key={day.value}
                    className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                      selectedDays.includes(day.value)
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                    data-testid={`checkbox-day-${day.value}`}
                  >
                    <Checkbox
                      checked={selectedDays.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                    />
                    <span className="text-sm">{day.label}</span>
                  </label>
                ))}
              </div>
              <Button
                onClick={() => saveScheduleMutation.mutate()}
                disabled={saveScheduleMutation.isPending}
                variant="secondary"
                className="gap-2"
                data-testid="button-save-delivery-days"
              >
                {saveScheduleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Liefertage speichern
              </Button>
            </div>
          )}

          {restaurantsWithSchedules.filter(r => r.role === "restaurant").length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-sm font-medium text-muted-foreground">Übersicht aller Kunden</label>
              <div className="space-y-2">
                {restaurantsWithSchedules.filter(r => r.role === "restaurant").map(r => (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-md bg-muted/50 cursor-pointer transition-colors ${
                      selectedRestaurant === r.id ? "ring-1 ring-primary" : ""
                    }`}
                    onClick={() => handleRestaurantSelect(r.id)}
                    data-testid={`delivery-restaurant-${r.id}`}
                  >
                    <span className="text-sm font-medium truncate">{r.companyName || r.name}</span>
                    <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
                      {r.deliveryDays.length > 0 ? (
                        r.deliveryDays
                          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                          .map(d => (
                            <Badge key={d} variant="secondary" className="text-[10px] px-1.5">
                              {WEEKDAYS.find(w => w.value === d)?.label.slice(0, 2)}
                            </Badge>
                          ))
                      ) : (
                        <span className="text-xs text-muted-foreground">Keine Liefertage</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
