import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function hasOpenDialog(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector('[role="dialog"][data-state="open"]');
}

export function KeyboardShortcuts() {
  const { currentRole } = useUser();
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = (de: string, it: string) => (lang === "it" ? it : de);
  const role = currentRole;

  useEffect(() => {
    const clearG = () => {
      pendingG.current = false;
      if (gTimer.current) {
        clearTimeout(gTimer.current);
        gTimer.current = null;
      }
    };

    const navMap: Record<string, string> =
      role === "restaurant"
        ? {
            h: "/restaurant",
            o: "/restaurant/orders",
            i: "/restaurant/inbox",
            k: "/restaurant/complaints",
            d: "/restaurant/documents",
            c: "/restaurant/cart",
            b: "/restaurant/catalog",
          }
        : {
            h: "/supplier",
            o: "/supplier/orders",
            i: "/supplier/inbox",
            k: "/supplier/complaints",
            d: "/supplier/documents",
            p: "/supplier/products",
          };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // "?" toggles the shortcuts help (Shift + /)
      if (e.key === "?") {
        e.preventDefault();
        clearG();
        setHelpOpen((o) => !o);
        return;
      }

      // Don't run navigation while any dialog is open
      if (hasOpenDialog()) return;

      if (pendingG.current) {
        const key = e.key.toLowerCase();
        const path = navMap[key];
        clearG();
        if (path) {
          e.preventDefault();
          setLocation(path);
        }
        return;
      }

      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        pendingG.current = true;
        if (gTimer.current) clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => {
          pendingG.current = false;
          gTimer.current = null;
        }, 1200);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearG();
    };
  }, [role, setLocation]);

  const shortcuts: Array<{ keys: string[]; label: string }> =
    role === "restaurant"
      ? [
          { keys: ["G", "H"], label: t("Startseite", "Home") },
          { keys: ["G", "O"], label: t("Bestellungen", "Ordini") },
          { keys: ["G", "C"], label: t("Warenkorb", "Carrello") },
          { keys: ["G", "B"], label: t("Katalog", "Catalogo") },
          { keys: ["G", "I"], label: t("Posteingang", "Posta in arrivo") },
          { keys: ["G", "K"], label: t("Reklamationen", "Reclami") },
          { keys: ["G", "D"], label: t("Dokumente", "Documenti") },
        ]
      : [
          { keys: ["G", "H"], label: t("Startseite", "Home") },
          { keys: ["G", "O"], label: t("Bestellungen", "Ordini") },
          { keys: ["G", "P"], label: t("Produkte", "Prodotti") },
          { keys: ["G", "I"], label: t("Posteingang", "Posta in arrivo") },
          { keys: ["G", "K"], label: t("Reklamationen", "Reclami") },
          { keys: ["G", "D"], label: t("Dokumente", "Documenti") },
        ];

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-md" data-testid="dialog-keyboard-shortcuts">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            {t("Tastenkürzel", "Scorciatoie da tastiera")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Schneller navigieren mit der Tastatur.",
              "Naviga più velocemente con la tastiera.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <div
            className="flex items-center justify-between py-2"
            data-testid="shortcut-search"
          >
            <span className="text-sm">{t("Suche öffnen", "Apri ricerca")}</span>
            <div className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-sans">
                ⌘
              </kbd>
              <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-sans">
                K
              </kbd>
            </div>
          </div>
          {shortcuts.map((s) => (
            <div
              key={s.keys.join("-")}
              className="flex items-center justify-between py-2"
              data-testid={`shortcut-${s.keys.join("-").toLowerCase()}`}
            >
              <span className="text-sm">{s.label}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="rounded border bg-muted px-2 py-0.5 text-xs font-sans"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
          <div
            className="flex items-center justify-between py-2"
            data-testid="shortcut-help"
          >
            <span className="text-sm">
              {t("Diese Hilfe anzeigen", "Mostra questo aiuto")}
            </span>
            <kbd className="rounded border bg-muted px-2 py-0.5 text-xs font-sans">
              ?
            </kbd>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
