import { HelpCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useLanguage } from "@/context/LanguageContext";
import { useUser } from "@/context/UserContext";

export function HelpButton() {
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const { currentRole } = useUser();
  return (
    <button
      onClick={() => setLocation(`/${currentRole}/help`)}
      className="hidden xl:flex items-center justify-center h-9 w-9 rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15 transition-colors"
      title={lang === "it" ? "Centro assistenza" : "Hilfe-Center"}
      aria-label={lang === "it" ? "Centro assistenza" : "Hilfe-Center"}
      data-testid="button-help-center"
    >
      <HelpCircle className="h-4 w-4" />
    </button>
  );
}
