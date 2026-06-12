interface PreviewableMessage {
  messageType?: string | null;
  content: string;
}

export function getMessageReplyPreview(message: PreviewableMessage, lang: "de" | "it"): string {
  const de = lang === "de";
  const clip = (s: string) => {
    const trimmed = (s || "").trim();
    return trimmed.length > 80 ? trimmed.slice(0, 80) + "..." : trimmed;
  };

  switch (message.messageType) {
    case "voice":
      return de ? "Sprachnachricht" : "Messaggio vocale";
    case "order":
      return de ? "Bestellung" : "Ordine";
    case "order_change_request":
      return de ? "Änderungsanfrage" : "Richiesta di modifica";
    case "delivery_status":
      return de ? "Lieferstatus" : "Stato consegna";
    case "document":
      return de ? "Dokument" : "Documento";
    case "complaint": {
      try {
        const c = JSON.parse(message.content);
        const label = c?.title || c?.reason || c?.text;
        if (label) return clip((de ? "Reklamation: " : "Reclamo: ") + label);
      } catch {}
      return de ? "Reklamation" : "Reclamo";
    }
    case "promotion": {
      try {
        const p = JSON.parse(message.content);
        if (p?.name) return clip((de ? "Aktion: " : "Promozione: ") + p.name);
      } catch {}
      return de ? "Aktion" : "Promozione";
    }
    case "attachment": {
      try {
        const a = JSON.parse(message.content);
        if (a?.fileName) return clip(a.fileName);
        if (a?.name) return clip(a.name);
      } catch {}
      return de ? "Anhang" : "Allegato";
    }
    default: {
      try {
        const r = JSON.parse(message.content);
        if (r?.refType && typeof r.text === "string") return clip(r.text);
      } catch {}
      return clip(message.content);
    }
  }
}
