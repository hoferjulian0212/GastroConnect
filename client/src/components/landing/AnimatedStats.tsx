/**
 * AnimatedStats — two scroll-triggered sections for the landing page.
 *
 * StatsStrip   — dark band with 4 large count-up metrics.
 * SavingsChart — horizontal bar chart that draws left-to-right on scroll,
 *                plus a secondary sparkline showing monthly order growth.
 *
 * Design rules:
 *   • Pure black / white only — no color accents.
 *   • Animations trigger once per page load when the element enters the viewport.
 *   • Reduced-motion: instant values, no transitions.
 */

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import CountUp from "../CountUp";

type Lang = "de" | "it" | "en";

// ── Internal i18n ─────────────────────────────────────────────────────────────

const copy = {
  de: {
    stripKicker: "Zahlen & Fakten",
    stats: [
      { value: 18,    suffix: "%",  label: "Ø Einsparung",   sub: "durch Preisvergleich über alle Händler" },
      { value: 340,   suffix: "+",  label: "Betriebe",        sub: "aktiv auf der Plattform" },
      { value: 12400, suffix: "+",  label: "Bestellungen",    sub: "verarbeitet in den letzten 12 Monaten" },
      { value: 94,    suffix: "%",  label: "Reklamationen",   sub: "in unter 24 h gelöst" },
    ],
    chartKicker: "Preisvergleich",
    chartHeadline: "Weniger ausgeben.\nGleiche Qualität.",
    chartSub: "Der integrierte Preisvergleich zeigt identische Produkte bei mehreren Händlern — und macht Einsparungen auf einen Blick sichtbar.",
    chartBars: [
      { label: "Gemüse & Obst",      pct: 92, display: "Ø 23 % Ersparnis" },
      { label: "Fleisch & Fisch",     pct: 60, display: "Ø 15 % Ersparnis" },
      { label: "Molkereiprodukte",    pct: 76, display: "Ø 19 % Ersparnis" },
      { label: "Getränke",            pct: 48, display: "Ø 12 % Ersparnis" },
      { label: "Trockenwaren",        pct: 84, display: "Ø 21 % Ersparnis" },
    ],
    sparkKicker: "Bestellvolumen",
    sparkHeadline: "Wachstum, das\nsich zeigt.",
    sparkSub: "Monatliche Bestellungen auf der Plattform — die letzten sechs Monate.",
    sparkMonths: ["Mrz", "Apr", "Mai", "Jun", "Jul", "Aug"],
  },
  it: {
    stripKicker: "Numeri e fatti",
    stats: [
      { value: 18,    suffix: "%",  label: "Ø risparmio",       sub: "tramite confronto prezzi" },
      { value: 340,   suffix: "+",  label: "Locali",             sub: "attivi sulla piattaforma" },
      { value: 12400, suffix: "+",  label: "Ordini",             sub: "elaborati negli ultimi 12 mesi" },
      { value: 94,    suffix: "%",  label: "Reclami",            sub: "risolti in meno di 24 ore" },
    ],
    chartKicker: "Confronto prezzi",
    chartHeadline: "Spendere meno.\nStessa qualità.",
    chartSub: "Il confronto prezzi integrato mostra prodotti identici di più fornitori — con i risparmi visibili a colpo d'occhio.",
    chartBars: [
      { label: "Frutta & verdura",    pct: 92, display: "Ø 23 % risparmio" },
      { label: "Carne & pesce",       pct: 60, display: "Ø 15 % risparmio" },
      { label: "Latticini",           pct: 76, display: "Ø 19 % risparmio" },
      { label: "Bevande",             pct: 48, display: "Ø 12 % risparmio" },
      { label: "Prodotti secchi",     pct: 84, display: "Ø 21 % risparmio" },
    ],
    sparkKicker: "Volume ordini",
    sparkHeadline: "Crescita\nconcreta.",
    sparkSub: "Ordini mensili sulla piattaforma — ultimi sei mesi.",
    sparkMonths: ["Mar", "Apr", "Mag", "Giu", "Lug", "Ago"],
  },
  en: {
    stripKicker: "Numbers & facts",
    stats: [
      { value: 18,    suffix: "%",  label: "Avg. savings",     sub: "via cross-supplier price comparison" },
      { value: 340,   suffix: "+",  label: "Businesses",       sub: "active on the platform" },
      { value: 12400, suffix: "+",  label: "Orders",           sub: "processed in the last 12 months" },
      { value: 94,    suffix: "%",  label: "Complaints",       sub: "resolved within 24 hours" },
    ],
    chartKicker: "Price comparison",
    chartHeadline: "Spend less.\nSame quality.",
    chartSub: "The built-in price comparison shows identical products from multiple suppliers — savings visible at a glance.",
    chartBars: [
      { label: "Fruit & vegetables",  pct: 92, display: "Avg. 23% savings" },
      { label: "Meat & fish",         pct: 60, display: "Avg. 15% savings" },
      { label: "Dairy",               pct: 76, display: "Avg. 19% savings" },
      { label: "Beverages",           pct: 48, display: "Avg. 12% savings" },
      { label: "Dry goods",           pct: 84, display: "Avg. 21% savings" },
    ],
    sparkKicker: "Order volume",
    sparkHeadline: "Growth that\nshows.",
    sparkSub: "Monthly orders on the platform — the last six months.",
    sparkMonths: ["Mar", "Apr", "May", "Jun", "Jul", "Aug"],
  },
} as const;

// Synthetic but plausible relative heights for the spark chart (0–1).
const SPARK_HEIGHTS = [0.42, 0.55, 0.61, 0.74, 0.88, 1.0];

// ── Primitives ─────────────────────────────────────────────────────────────────

function StatCard({
  value, suffix, label, sub, delay, reduce,
}: {
  value: number; suffix: string; label: string; sub: string;
  delay: number; reduce: boolean;
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3 border-t border-white/15 pt-8"
    >
      <div className="text-[3.5rem] md:text-[5rem] font-semibold tracking-tight text-white leading-none tabular-nums">
        <CountUp end={value} duration={reduce ? 0 : 1600} suffix={suffix} />
      </div>
      <div>
        <div className="text-sm font-semibold text-white/80 uppercase tracking-widest">{label}</div>
        <div className="mt-1 text-xs text-white/40 leading-snug max-w-[180px]">{sub}</div>
      </div>
    </motion.div>
  );
}

function HorizBar({
  label, pct, display, delay, reduce,
}: {
  label: string; pct: number; display: string;
  delay: number; reduce: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const active = reduce ? true : inView;

  return (
    <div ref={ref} className="group grid gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-black/65">{label}</span>
        <motion.span
          className="text-sm font-semibold tabular-nums text-black shrink-0"
          initial={reduce ? false : { opacity: 0 }}
          animate={active ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.35, delay: delay + 0.55 }}
        >
          {display}
        </motion.span>
      </div>
      <div className="relative h-[5px] w-full bg-black/[0.07] rounded-full overflow-hidden">
        <motion.div
          className="absolute left-0 top-0 h-full bg-black rounded-full origin-left"
          style={{ width: `${pct}%` }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={active ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 1.05, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

function SparkBar({
  height, month, index, reduce,
}: {
  height: number; month: string; index: number; reduce: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const active = reduce ? true : inView;

  return (
    <div ref={ref} className="flex flex-col items-center gap-2 flex-1">
      <div className="relative w-full flex items-end" style={{ height: 120 }}>
        <motion.div
          className="w-full bg-black rounded-sm origin-bottom"
          style={{ height: `${height * 100}%` }}
          initial={reduce ? false : { scaleY: 0 }}
          animate={active ? { scaleY: 1 } : { scaleY: 0 }}
          transition={{
            duration: 0.7,
            delay: index * 0.08,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      </div>
      <span className="text-[10px] font-medium text-black/40 uppercase tracking-wide whitespace-nowrap">
        {month}
      </span>
    </div>
  );
}

// ── Exported sections ──────────────────────────────────────────────────────────

export function StatsStrip({ lang = "de" }: { lang?: Lang }) {
  const t = copy[lang];
  const reduce = !!useReducedMotion();

  return (
    <section className="bg-black px-4 md:px-8 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <motion.p
          className="text-[11px] font-semibold uppercase tracking-[.2em] text-white/35 mb-14"
          initial={reduce ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          {t.stripKicker}
        </motion.p>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {t.stats.map((s, i) => (
            <StatCard
              key={s.label}
              value={s.value}
              suffix={s.suffix}
              label={s.label}
              sub={s.sub}
              delay={i * 0.08}
              reduce={reduce}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function SavingsChart({ lang = "de" }: { lang?: Lang }) {
  const t = copy[lang];
  const reduce = !!useReducedMotion();

  return (
    <section className="px-4 md:px-8 py-20 md:py-28 border-t border-black/[0.07] bg-white">
      <div className="mx-auto max-w-6xl">

        {/* ── Row 1: bar chart ── */}
        <div className="grid gap-14 lg:grid-cols-[1fr_1.35fr] lg:gap-20 items-center mb-20 md:mb-28">
          {/* Copy */}
          <motion.div
            initial={reduce ? false : { opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-black/35 mb-6">
              {t.chartKicker}
            </p>
            <h2 className="text-3xl md:text-[2.75rem] font-semibold tracking-tight leading-[1.05] whitespace-pre-line">
              {t.chartHeadline}
            </h2>
            <p className="mt-6 text-base text-black/50 leading-relaxed max-w-sm">
              {t.chartSub}
            </p>
          </motion.div>

          {/* Bars */}
          <div className="space-y-5">
            {t.chartBars.map((bar, i) => (
              <HorizBar
                key={bar.label}
                label={bar.label}
                pct={bar.pct}
                display={bar.display}
                delay={i * 0.09}
                reduce={reduce}
              />
            ))}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="border-t border-black/[0.07] mb-20 md:mb-28" />

        {/* ── Row 2: bar spark chart ── */}
        <div className="grid gap-14 lg:grid-cols-[1fr_1.35fr] lg:gap-20 items-center">
          {/* Copy */}
          <motion.div
            initial={reduce ? false : { opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-black/35 mb-6">
              {t.sparkKicker}
            </p>
            <h2 className="text-3xl md:text-[2.75rem] font-semibold tracking-tight leading-[1.05] whitespace-pre-line">
              {t.sparkHeadline}
            </h2>
            <p className="mt-6 text-base text-black/50 leading-relaxed max-w-sm">
              {t.sparkSub}
            </p>
          </motion.div>

          {/* Spark bars */}
          <div className="flex items-end gap-3 px-2">
            {SPARK_HEIGHTS.map((h, i) => (
              <SparkBar
                key={t.sparkMonths[i]}
                height={h}
                month={t.sparkMonths[i]}
                index={i}
                reduce={reduce}
              />
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
