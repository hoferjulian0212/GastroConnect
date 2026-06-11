import { useCallback, useState } from "react";
import { Layers, ChevronDown, Check, Plus, Save, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useDashboardTemplates } from "@/hooks/use-dashboard-templates";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";

interface Props {
  userId: string;
  role: "restaurant" | "supplier";
}

export default function MobileDashboardViewSelector({ userId, role }: Props) {
  const { lang } = useLanguage();
  const t = useT(lang);
  const {
    templates,
    activeTemplateId,
    activeTemplate,
    applyTemplate,
    saveNewTemplate,
    updateActiveTemplate,
    renameActiveTemplate,
    deleteActiveTemplate,
  } = useDashboardTemplates(userId, role);

  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameDialogMode, setNameDialogMode] = useState<"create" | "rename">("create");
  const [nameInput, setNameInput] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const openCreateDialog = useCallback(() => {
    setNameDialogMode("create");
    setNameInput("");
    setNameDialogOpen(true);
  }, []);

  const openRenameDialog = useCallback(() => {
    setNameDialogMode("rename");
    setNameInput(activeTemplate?.name ?? "");
    setNameDialogOpen(true);
  }, [activeTemplate]);

  const submitNameDialog = useCallback(() => {
    const name = nameInput.trim();
    if (!name) return;
    if (nameDialogMode === "create") saveNewTemplate(name);
    else renameActiveTemplate(name);
    setNameDialogOpen(false);
  }, [nameInput, nameDialogMode, saveNewTemplate, renameActiveTemplate]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 h-8 text-[13px] font-medium text-foreground max-w-[160px] active:opacity-70 transition-opacity"
            data-testid="button-dashboard-views-mobile"
            title={t("dashboardViews", "views")}
            aria-label={t("dashboardViews", "views")}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <span className="truncate">{activeTemplate ? activeTemplate.name : t("dashboardViews", "defaultView")}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{t("dashboardViews", "views")}</DropdownMenuLabel>
          {templates.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground" data-testid="text-no-views-mobile">
              {t("dashboardViews", "noViews")}
            </div>
          ) : (
            templates.map(tpl => (
              <DropdownMenuItem
                key={tpl.id}
                onClick={() => applyTemplate(tpl)}
                data-testid={`view-item-mobile-${tpl.id}`}
              >
                <Check className={`mr-2 h-3.5 w-3.5 shrink-0 ${tpl.id === activeTemplateId ? "opacity-100" : "opacity-0"}`} />
                <span className="truncate">{tpl.name}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openCreateDialog} data-testid="button-save-view-mobile">
            <Plus className="mr-2 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t("dashboardViews", "saveAsNew")}</span>
          </DropdownMenuItem>
          {activeTemplate && (
            <>
              <DropdownMenuItem onClick={updateActiveTemplate} data-testid="button-update-view-mobile">
                <Save className="mr-2 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t("dashboardViews", "updateActive")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openRenameDialog} data-testid="button-rename-view-mobile">
                <Pencil className="mr-2 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t("dashboardViews", "rename")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive focus:text-destructive"
                data-testid="button-delete-view-mobile"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t("dashboardViews", "delete")}</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-view-name-mobile">
          <DialogHeader>
            <DialogTitle>{nameDialogMode === "create" ? t("dashboardViews", "createTitle") : t("dashboardViews", "renameTitle")}</DialogTitle>
            {nameDialogMode === "create" ? (
              <DialogDescription>{t("dashboardViews", "createDesc")}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="view-name-input-mobile">{t("dashboardViews", "nameLabel")}</Label>
            <Input
              id="view-name-input-mobile"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={t("dashboardViews", "namePlaceholder")}
              maxLength={60}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitNameDialog();
                }
              }}
              data-testid="input-view-name-mobile"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialogOpen(false)} data-testid="button-cancel-view-name-mobile">
              {t("common", "cancel")}
            </Button>
            <Button onClick={submitNameDialog} disabled={!nameInput.trim()} data-testid="button-confirm-view-name-mobile">
              {t("common", "save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-view-mobile">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dashboardViews", "deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("dashboardViews", "deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-view-mobile">{t("common", "cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { deleteActiveTemplate(); setDeleteDialogOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-view-mobile"
            >
              {t("dashboardViews", "delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
