import type { ComplaintReason } from "@shared/schema";
import { COMPLAINT_REASONS } from "@shared/schema";

export const COMPLAINT_REASON_KEYS = COMPLAINT_REASONS;

export function getComplaintReasonLabel(reason: ComplaintReason | string | null | undefined, lang: "de" | "it"): string {
  if (!reason) return lang === "de" ? "Kein Grund" : "Nessun motivo";
  const labels: Record<string, { de: string; it: string }> = {
    damaged: { de: "Beschädigt", it: "Danneggiato" },
    short:   { de: "Fehlmenge", it: "Quantità mancante" },
    wrong:   { de: "Falschlieferung", it: "Consegna errata" },
    quality: { de: "Qualität", it: "Qualità" },
    late:    { de: "Verspätet", it: "In ritardo" },
    other:   { de: "Sonstiges", it: "Altro" },
  };
  return labels[reason]?.[lang] || String(reason);
}

export function getComplaintReasonIcon(reason: ComplaintReason | string | null | undefined): string {
  switch (reason) {
    case "damaged": return "🛠️";
    case "short": return "📉";
    case "wrong": return "🔀";
    case "quality": return "⚠️";
    case "late": return "⏱️";
    case "other": return "•";
    default: return "•";
  }
}
