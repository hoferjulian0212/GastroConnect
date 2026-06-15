import { useLanguage } from "@/context/LanguageContext";

export function LanguageToggle() {
  const { lang, toggleLang } = useLanguage();
  return (
    <>
      {/* Compact circular button — md to xl */}
      <button
        onClick={toggleLang}
        data-testid="button-toggle-lang"
        title={lang === "de" ? "Lingua italiana" : "Deutsche Sprache"}
        className="xl:hidden flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] border border-white/20 text-white text-[11px] font-bold hover:bg-white/15 transition-colors cursor-pointer"
      >
        {lang === "de" ? "DE" : "IT"}
      </button>

      {/* Full pill — xl and above */}
      <button
        onClick={toggleLang}
        data-testid="button-toggle-lang-wide"
        title={lang === "de" ? "Lingua italiana" : "Deutsche Sprache"}
        className="hidden xl:relative xl:flex h-9 w-[72px] items-center rounded-full bg-white/[0.07] border border-white/20 p-0.5 transition-colors cursor-pointer"
      >
        <span className={`absolute left-0.5 flex h-8 w-9 items-center justify-center rounded-full bg-white/25 text-white text-[11px] font-bold shadow-sm transition-transform duration-300 ease-in-out ${lang === "it" ? "translate-x-[30px]" : "translate-x-0"}`}>
          {lang === "de" ? "DE" : "IT"}
        </span>
        <span className={`absolute left-1.5 text-[11px] font-semibold text-white/40 transition-opacity duration-200 ${lang === "de" ? "opacity-0" : "opacity-100"}`}>DE</span>
        <span className={`absolute right-1.5 text-[11px] font-semibold text-white/40 transition-opacity duration-200 ${lang === "it" ? "opacity-0" : "opacity-100"}`}>IT</span>
      </button>
    </>
  );
}
