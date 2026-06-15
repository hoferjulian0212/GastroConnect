import { useLanguage } from "@/context/LanguageContext";

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className="flex items-center rounded-full bg-white/[0.07] border border-white/20 p-0.5 gap-0"
      data-testid="lang-toggle-pill"
    >
      {(["de", "it"] as const).map((code) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          data-testid={`button-toggle-lang-${code}`}
          title={code === "de" ? "Deutsche Sprache" : "Lingua italiana"}
          className={`h-8 w-9 flex items-center justify-center rounded-full text-[11px] font-bold uppercase tracking-wide transition-colors duration-200 cursor-pointer ${
            lang === code
              ? "bg-white/25 text-white"
              : "text-white/40 hover:text-white/70"
          }`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
