import { useState } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Member, User } from "@shared/schema";
import { MEMBER_ROLE_VALUES, roleLabel, can } from "@shared/permissions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Users, UserPlus, Trash2, Building2, Pencil, Mail } from "lucide-react";

type MembersResponse = { members: Member[]; seatLimit: number; seatsUsed: number };

export default function Team() {
  const { currentRole, currentUser, currentMember } = useUser();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const tt = (de: string, it: string) => (lang === "it" ? it : de);

  const orgId = currentUser?.id;
  const isAdmin = currentMember?.role === "admin";
  const canManage = can(currentMember?.role, "team.manage");
  const canEditOrg = can(currentMember?.role, "org.edit");

  const { data, isLoading } = useQuery<MembersResponse>({
    queryKey: ["/api/orgs", orgId, "members"],
    enabled: !!orgId,
  });

  const members = data?.members ?? [];
  const seatLimit = data?.seatLimit ?? 5;
  const seatsUsed = data?.seatsUsed ?? members.length;
  const seatsFull = seatsUsed >= seatLimit;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/orgs", orgId, "members"] });
  };

  // ---- Add member ----
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<typeof MEMBER_ROLE_VALUES[number]>("staff");

  const addMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/orgs/${orgId}/members`, {
        name: newName.trim(),
        email: newEmail.trim() || null,
        phone: newPhone.trim() || null,
        role: newRole,
        actingMemberId: currentMember?.id,
      }),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setNewName(""); setNewEmail(""); setNewPhone(""); setNewRole("staff");
      toast({ title: tt("Mitglied hinzugefügt", "Membro aggiunto") });
    },
    onError: async (err: any) => {
      const msg = err?.message?.includes("seat_limit")
        ? tt("Alle Sitzplätze sind belegt.", "Tutti i posti sono occupati.")
        : tt("Mitglied konnte nicht hinzugefügt werden.", "Impossibile aggiungere il membro.");
      toast({ title: tt("Fehler", "Errore"), description: msg, variant: "destructive" });
    },
  });

  // ---- Edit member role ----
  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) =>
      apiRequest("PATCH", `/api/members/${id}`, { role, actingMemberId: currentMember?.id }),
    onSuccess: () => { invalidate(); toast({ title: tt("Rolle aktualisiert", "Ruolo aggiornato") }); },
    onError: () => toast({ title: tt("Fehler", "Errore"), variant: "destructive" }),
  });

  // ---- Invite / re-invite member (activation link) ----
  const inviteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/members/${id}/invite`);
      return res.json() as Promise<{ ok: boolean; emailed: boolean }>;
    },
    onSuccess: (data) => {
      toast({
        title: data.emailed
          ? tt("Einladung gesendet", "Invito inviato")
          : tt("Einladung erstellt", "Invito creato"),
        description: data.emailed
          ? tt("Die Person erhält eine E-Mail mit dem Aktivierungslink.", "La persona riceverà un'email con il link di attivazione.")
          : tt("E-Mail-Versand ist nicht konfiguriert.", "L'invio di email non è configurato."),
      });
    },
    onError: async (err: any) => {
      const msg = err?.message?.includes("no_email")
        ? tt("Für dieses Mitglied ist keine E-Mail hinterlegt.", "Nessuna email per questo membro.")
        : tt("Einladung konnte nicht gesendet werden.", "Impossibile inviare l'invito.");
      toast({ title: tt("Fehler", "Errore"), description: msg, variant: "destructive" });
    },
  });

  // ---- Edit member details ----
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const openEditDialog = (m: Member) => {
    setEditMember(m);
    setEditName(m.name);
    setEditEmail(m.email ?? "");
    setEditPhone(m.phone ?? "");
  };

  const editMutation = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/members/${editMember?.id}`, {
        name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        actingMemberId: currentMember?.id,
      }),
    onSuccess: () => {
      invalidate();
      setEditMember(null);
      toast({ title: tt("Mitglied aktualisiert", "Membro aggiornato") });
    },
    onError: () => toast({ title: tt("Fehler", "Errore"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/members/${id}`, { actingMemberId: currentMember?.id }),
    onSuccess: () => { invalidate(); toast({ title: tt("Mitglied entfernt", "Membro rimosso") }); },
    onError: async (err: any) => {
      const msg = err?.message?.includes("last_admin")
        ? tt("Der letzte Administrator kann nicht entfernt werden.", "Non puoi rimuovere l'ultimo amministratore.")
        : tt("Mitglied konnte nicht entfernt werden.", "Impossibile rimuovere il membro.");
      toast({ title: tt("Fehler", "Errore"), description: msg, variant: "destructive" });
    },
  });

  // ---- Edit org ----
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSeats, setOrgSeats] = useState("");

  const orgMutation = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/orgs/${orgId}`, {
        companyName: orgName.trim() || undefined,
        seatLimit: orgSeats ? Number(orgSeats) : undefined,
        actingMemberId: currentMember?.id,
      }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: [`/api/users?role=${currentRole}`] });
      setOrgOpen(false);
      toast({ title: tt("Organisation aktualisiert", "Organizzazione aggiornata") });
    },
    onError: () => toast({ title: tt("Fehler", "Errore"), variant: "destructive" }),
  });

  const openOrgDialog = () => {
    setOrgName(currentUser?.companyName || currentUser?.name || "");
    setOrgSeats(String(seatLimit));
    setOrgOpen(true);
  };

  const memberInitials = (m: { name: string }) =>
    (m.name || "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="flex flex-col flex-1 pb-24 md:pb-8" data-testid="page-team">
      <HeroPortal>
        <div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-6">
          <div className="flex items-center gap-2 text-white">
            <Users className="h-5 w-5" />
            <h1 className="text-xl md:text-2xl font-semibold" data-testid="text-team-title">
              {tt("Organisation & Team", "Organizzazione e team")}
            </h1>
          </div>
          <p className="text-white/50 text-sm mt-1">
            {currentUser?.companyName || currentUser?.name}
          </p>
        </div>
      </HeroPortal>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        {/* Organization card */}
        <Card data-testid="card-org">
          <CardHeader className="p-4 md:p-6 flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Building2 className="h-5 w-5" />
              {tt("Organisation", "Organizzazione")}
            </CardTitle>
            {canEditOrg && (
              <Button variant="outline" size="sm" onClick={openOrgDialog} data-testid="button-edit-org">
                <Pencil className="h-4 w-4 mr-1.5" />
                {tt("Bearbeiten", "Modifica")}
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">{tt("Name", "Nome")}</p>
              <p className="font-medium" data-testid="text-org-name">{currentUser?.companyName || currentUser?.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{tt("Sitzplätze", "Posti")}</p>
              <p className="font-medium" data-testid="text-seats">
                {seatsUsed} / {seatLimit} {tt("belegt", "occupati")}
              </p>
              <div className="mt-1.5 h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${seatsFull ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, (seatsUsed / Math.max(1, seatLimit)) * 100)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Members card */}
        <Card data-testid="card-members">
          <CardHeader className="p-4 md:p-6 flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Users className="h-5 w-5" />
              {tt("Mitglieder", "Membri")}
            </CardTitle>
            {canManage && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={seatsFull} data-testid="button-add-member">
                    <UserPlus className="h-4 w-4 mr-1.5" />
                    {tt("Hinzufügen", "Aggiungi")}
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="dialog-add-member">
                  <DialogHeader>
                    <DialogTitle>{tt("Mitglied hinzufügen", "Aggiungi membro")}</DialogTitle>
                    <DialogDescription>
                      {tt("Fügen Sie eine Person zu Ihrem Team hinzu.", "Aggiungi una persona al tuo team.")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div>
                      <Label htmlFor="m-name">{tt("Name", "Nome")}</Label>
                      <Input id="m-name" value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="input-member-name" />
                    </div>
                    <div>
                      <Label htmlFor="m-email">{tt("E-Mail", "Email")}</Label>
                      <Input id="m-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} data-testid="input-member-email" />
                    </div>
                    <div>
                      <Label htmlFor="m-phone">{tt("Telefon", "Telefono")}</Label>
                      <Input id="m-phone" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} data-testid="input-member-phone" />
                    </div>
                    <div>
                      <Label>{tt("Rolle", "Ruolo")}</Label>
                      <Select value={newRole} onValueChange={(v) => setNewRole(v as any)}>
                        <SelectTrigger data-testid="select-member-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MEMBER_ROLE_VALUES.map((r) => (
                            <SelectItem key={r} value={r} data-testid={`role-option-${r}`}>{roleLabel(r, lang)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => addMutation.mutate()}
                      disabled={!newName.trim() || addMutation.isPending}
                      data-testid="button-save-member"
                    >
                      {tt("Speichern", "Salva")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{tt("Lädt…", "Caricamento…")}</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tt("Keine Mitglieder.", "Nessun membro.")}</p>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-lg border p-2.5"
                    data-testid={`row-member-${m.id}`}
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      {m.profileImageUrl ? <AvatarImage src={m.profileImageUrl} alt={m.name} /> : null}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {memberInitials(m)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-member-name-${m.id}`}>{m.name}</p>
                      {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                      {m.phone && <p className="text-xs text-muted-foreground truncate" data-testid={`text-member-phone-${m.id}`}>{m.phone}</p>}
                    </div>
                    {canManage ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) => roleMutation.mutate({ id: m.id, role: v })}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs" data-testid={`select-role-${m.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MEMBER_ROLE_VALUES.map((r) => (
                            <SelectItem key={r} value={r}>{roleLabel(r, lang)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground" data-testid={`text-member-role-${m.id}`}>
                        {roleLabel(m.role, lang)}
                      </span>
                    )}
                    {canManage && m.email && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => inviteMutation.mutate(m.id)}
                        disabled={inviteMutation.isPending}
                        title={tt("Einladung senden", "Invia invito")}
                        data-testid={`button-invite-member-${m.id}`}
                      >
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => openEditDialog(m)}
                        data-testid={`button-edit-member-${m.id}`}
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    {canManage && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" data-testid={`button-remove-member-${m.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{tt("Mitglied entfernen?", "Rimuovere il membro?")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {tt(`${m.name} wird aus dem Team entfernt.`, `${m.name} verrà rimosso dal team.`)}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tt("Abbrechen", "Annulla")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(m.id)}
                              data-testid={`button-confirm-remove-${m.id}`}
                            >
                              {tt("Entfernen", "Rimuovi")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit org dialog */}
      <Dialog open={orgOpen} onOpenChange={setOrgOpen}>
        <DialogContent data-testid="dialog-edit-org">
          <DialogHeader>
            <DialogTitle>{tt("Organisation bearbeiten", "Modifica organizzazione")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="org-name">{tt("Name", "Nome")}</Label>
              <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} data-testid="input-org-name" />
            </div>
            <div>
              <Label htmlFor="org-seats">{tt("Sitzplätze", "Posti")}</Label>
              <Input
                id="org-seats"
                type="number"
                min={Math.max(1, seatsUsed)}
                value={orgSeats}
                onChange={(e) => setOrgSeats(e.target.value)}
                data-testid="input-org-seats"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {tt(`Mindestens ${seatsUsed} (aktuell belegt).`, `Minimo ${seatsUsed} (attualmente occupati).`)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => orgMutation.mutate()} disabled={orgMutation.isPending} data-testid="button-save-org">
              {tt("Speichern", "Salva")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit member dialog */}
      <Dialog open={!!editMember} onOpenChange={(o) => { if (!o) setEditMember(null); }}>
        <DialogContent data-testid="dialog-edit-member">
          <DialogHeader>
            <DialogTitle>{tt("Mitglied bearbeiten", "Modifica membro")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="edit-m-name">{tt("Name", "Nome")}</Label>
              <Input id="edit-m-name" value={editName} onChange={(e) => setEditName(e.target.value)} data-testid="input-edit-member-name" />
            </div>
            <div>
              <Label htmlFor="edit-m-email">{tt("E-Mail", "Email")}</Label>
              <Input id="edit-m-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} data-testid="input-edit-member-email" />
            </div>
            <div>
              <Label htmlFor="edit-m-phone">{tt("Telefon", "Telefono")}</Label>
              <Input id="edit-m-phone" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} data-testid="input-edit-member-phone" />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => editMutation.mutate()}
              disabled={!editName.trim() || editMutation.isPending}
              data-testid="button-save-edit-member"
            >
              {tt("Speichern", "Salva")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
