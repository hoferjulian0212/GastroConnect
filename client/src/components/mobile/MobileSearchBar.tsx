import { Search, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface MobileSearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
}

export function MobileSearchBar({ value, onChange, placeholder, testId }: MobileSearchBarProps) {
  const { lang } = useLanguage();
  const ph = placeholder || (lang === "de" ? "Suchen..." : "Cerca...");
  return (
    <div className="relative" data-testid={testId || "mobile-search-bar"}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/45 pointer-events-none" />
      <input
        type="text"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ph}
        className="w-full h-10 pl-9 pr-9 rounded-full bg-white/[0.08] border border-white/[0.12] text-white text-[14px] placeholder:text-white/40 focus:outline-none focus:bg-white/[0.12] focus:border-white/20"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/15 active:bg-white/25 transition-colors"
          data-testid="button-mobile-search-clear"
        >
          <X className="h-3.5 w-3.5 text-white/70" />
        </button>
      )}
    </div>
  );
}
