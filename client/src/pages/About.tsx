import { Link } from "wouter";
import { ArrowRight, ArrowUpRight, Boxes, HeartHandshake, LineChart, MessageSquare, ShieldCheck } from "lucide-react";
import Logo from "@/components/Logo";

const accents = ["Verbindung", "Klarheit", "Miteinander", "Wirkung"];

function Accent({ children }: { children: string }) {
  return <span className="gc-accent">{children}</span>;
}

const chapters = [
  { icon: HeartHandshake, title: "Nähe statt Umwege", text: "GastroConnect bringt die Menschen hinter Bestellung, Lieferung und Produkt zusammen. Direkte Kommunikation ersetzt Rückfragen, Weiterleitungen und verstreute Informationen." },
  { icon: LineChart, title: "Klarheit für Entscheidungen", text: "Preise, Verfügbarkeiten, Dokumente und Kennzahlen gehören in einen gemeinsamen Kontext. So wird aus täglicher Arbeit eine Grundlage für bessere Entscheidungen." },
  { icon: ShieldCheck, title: "Vertrauen als Prinzip", text: "Keine bezahlten Rankings, keine versteckten Provisionen und keine gekauften Suchergebnisse. Die Plattform bleibt neutral, nachvollziehbar und auf langfristige Partnerschaften ausgerichtet." },
];

export default function About() {
  return <div className="gc-public min-h-screen bg-white text-[#171918]">
    <PublicHeader />
    <main>
      <section className="mx-auto max-w-7xl px-5 pb-24 pt-20 md:px-10 md:pb-36 md:pt-32">
        <p className="gc-kicker">Über GastroConnect</p>
        <h1 className="mt-6 max-w-6xl text-5xl font-semibold leading-[.98] tracking-[-.06em] md:text-8xl">
          Eine bessere <Accent>Verbindung</Accent><br />für die Gastronomie.
        </h1>
        <div className="mt-12 grid gap-8 border-t border-black/15 pt-8 md:grid-cols-[1fr_1.4fr] md:gap-16">
          <p className="text-sm font-medium uppercase tracking-[.18em]">Wer wir sind</p>
          <p className="gc-long max-w-3xl text-2xl leading-[1.18] md:text-4xl">
            GastroConnect ist die digitale Infrastruktur für eine Branche, die jeden Tag von <Accent>Miteinander</Accent> lebt: Betriebe, Händler, Produzenten und ihre Teams arbeiten an einem Ort zusammen.
          </p>
        </div>
      </section>

      <section className="border-y border-black/15 bg-[#171918] text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:grid-cols-[.8fr_1.2fr] md:px-10 md:py-28">
          <div><p className="gc-kicker text-white/55">Unsere Idee</p><p className="mt-8 text-6xl font-semibold tracking-[-.06em] md:text-8xl">01<span className="gc-accent text-white">.</span></p></div>
          <div><h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-.04em] md:text-6xl">Weniger Reibung. Mehr <Accent>Klarheit</Accent>.</h2><p className="gc-long mt-8 max-w-2xl text-xl leading-relaxed text-white/70 md:text-2xl">Wir glauben, dass gute Zusammenarbeit nicht an fehlendem Engagement scheitert, sondern an fehlenden Verbindungen. GastroConnect macht Informationen auffindbar, Gespräche direkt und Abläufe verständlich.</p></div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 md:px-10 md:py-28">
        <div className="mb-12 flex items-end justify-between gap-6"><div><p className="gc-kicker">Wofür wir stehen</p><h2 className="mt-5 max-w-2xl text-4xl font-semibold tracking-[-.05em] md:text-6xl">Technologie mit menschlicher <Accent>Wirkung</Accent>.</h2></div><Boxes className="hidden h-16 w-16 md:block" strokeWidth={1} /></div>
        <div className="grid gap-px overflow-hidden rounded-3xl border border-black/15 bg-black/15 md:grid-cols-3">{chapters.map(({ icon: Icon, title, text }) => <article key={title} className="bg-white p-7 md:p-9"><Icon className="mb-16 h-7 w-7" strokeWidth={1.4} /><h3 className="text-2xl font-semibold tracking-tight">{title}</h3><p className="gc-long mt-4 text-base leading-relaxed text-black/60">{text}</p></article>)}</div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-24 md:px-10 md:pb-36"><div className="rounded-[2rem] border border-black/15 p-8 md:p-16"><p className="gc-kicker">Der nächste Schritt</p><h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-.05em] md:text-6xl">Bereit für mehr <Accent>Zusammenarbeit</Accent>?</h2><p className="gc-long mt-6 max-w-xl text-xl leading-relaxed text-black/60">Entdecken Sie, wie GastroConnect Bestellungen, Kommunikation und Lieferantenbeziehungen an einem Ort zusammenführt.</p><Link href="/register" className="mt-9 inline-flex items-center gap-2 rounded-full bg-[#171918] px-6 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5">Jetzt starten <ArrowRight className="h-4 w-4" /></Link></div></section>
    </main>
    <PublicFooter />
  </div>;
}

export function PublicHeader() {
  return <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-10"><Link href="/" aria-label="GastroConnect Startseite"><Logo size="nav" variant="dark" thick /></Link><nav className="hidden items-center gap-6 text-sm md:flex"><Link href="/features" className="hover:underline">Funktionen</Link><Link href="/how-it-works" className="hover:underline">So funktioniert es</Link><Link href="/faq" className="hover:underline">FAQ</Link><Link href="/contact" className="hover:underline">Kontakt</Link></nav><Link href="/register" className="rounded-full bg-[#171918] px-4 py-2 text-sm text-white">Starten <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></Link></header>;
}

export function PublicFooter() {
  return <footer className="border-t border-black/15 px-5 py-10 md:px-10"><div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]"><div><Logo size="footer" variant="dark" thick /><p className="gc-long mt-4 max-w-xs text-sm text-black/55">Die digitale Plattform für die Zusammenarbeit in der Gastronomie.</p></div><div><p className="gc-kicker mb-4">Produkt</p><div className="grid gap-2 text-sm"><Link href="/features">Funktionen</Link><Link href="/how-it-works">So funktioniert es</Link><Link href="/faq">FAQ</Link></div></div><div><p className="gc-kicker mb-4">Unternehmen</p><div className="grid gap-2 text-sm"><Link href="/about">Über uns</Link><Link href="/contact">Kontakt</Link></div></div><div><p className="gc-kicker mb-4">Rechtliches</p><div className="grid gap-2 text-sm"><Link href="/impressum">Impressum</Link><Link href="/datenschutz">Datenschutz</Link><Link href="/agb">AGB</Link></div></div></div></footer>;
}