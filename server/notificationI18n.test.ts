import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveNotifI18n } from "./notificationI18n.ts";

const DE = { title: "Neue Bestellung #001", message: "Ein Betrieb hat bestellt." };
const IT = { title_it: "Nuovo ordine #001", message_it: "Un'azienda ha ordinato." };

describe("resolveNotifI18n", () => {
  // ── language = "de" ───────────────────────────────────────────────────────

  it("returns German text for a German-language recipient", () => {
    const result = resolveNotifI18n("de", DE, IT);
    assert.equal(result.title, DE.title);
    assert.equal(result.message, DE.message);
  });

  // ── language = "it" ───────────────────────────────────────────────────────

  it("returns Italian text for an Italian-language recipient when i18n is provided", () => {
    const result = resolveNotifI18n("it", DE, IT);
    assert.equal(result.title, IT.title_it);
    assert.equal(result.message, IT.message_it);
  });

  it("falls back to German for an Italian recipient when no i18n is provided", () => {
    const result = resolveNotifI18n("it", DE, undefined);
    assert.equal(result.title, DE.title);
    assert.equal(result.message, DE.message);
  });

  // ── null / undefined / unknown language ───────────────────────────────────

  it("falls back to German when language is null", () => {
    const result = resolveNotifI18n(null, DE, IT);
    assert.equal(result.title, DE.title);
    assert.equal(result.message, DE.message);
  });

  it("falls back to German when language is undefined", () => {
    const result = resolveNotifI18n(undefined, DE, IT);
    assert.equal(result.title, DE.title);
    assert.equal(result.message, DE.message);
  });

  it("falls back to German for an unrecognised language code", () => {
    const result = resolveNotifI18n("fr", DE, IT);
    assert.equal(result.title, DE.title);
    assert.equal(result.message, DE.message);
  });

  // ── admin / operator notifications ────────────────────────────────────────
  // Admin fall-back notifications (PMS / ERP / WhatsApp) carry i18n but their
  // message body is mostly dynamic data — only the title is translated.

  it("translates admin PMS notification title for Italian admin recipients", () => {
    const base = { title: "Neue PMS-Anfrage", message: "ProviderX – Hotel Roma (Mario)" };
    const i18n = { title_it: "Nuova richiesta PMS", message_it: "ProviderX – Hotel Roma (Mario)" };
    const resultIT = resolveNotifI18n("it", base, i18n);
    assert.equal(resultIT.title, "Nuova richiesta PMS");
    assert.equal(resultIT.message, "ProviderX – Hotel Roma (Mario)");
    const resultDE = resolveNotifI18n("de", base, i18n);
    assert.equal(resultDE.title, "Neue PMS-Anfrage");
  });

  it("translates admin ERP notification title for Italian admin recipients", () => {
    const base = { title: "Neue ERP-Anfrage", message: "SAP – AcmeCorp (Hans)" };
    const i18n = { title_it: "Nuova richiesta ERP", message_it: "SAP – AcmeCorp (Hans)" };
    assert.equal(resolveNotifI18n("it", base, i18n).title, "Nuova richiesta ERP");
    assert.equal(resolveNotifI18n("de", base, i18n).title, "Neue ERP-Anfrage");
  });

  it("translates admin WhatsApp notification title for Italian admin recipients", () => {
    const base = { title: "Neue WhatsApp-Anfrage", message: "AcmeCorp (Hans)" };
    const i18n = { title_it: "Nuova richiesta WhatsApp", message_it: "AcmeCorp (Hans)" };
    assert.equal(resolveNotifI18n("it", base, i18n).title, "Nuova richiesta WhatsApp");
    assert.equal(resolveNotifI18n("de", base, i18n).title, "Neue WhatsApp-Anfrage");
  });

  // ── internal-chat attachment fallback ─────────────────────────────────────

  it("uses Italian attachment label for Italian recipients in internal-chat notifications", () => {
    const content = "";
    const base    = { title: "Chat: Anna → Bob", message: content.length > 0 ? content : "📎 Anhang" };
    const i18n    = { title_it: "Chat: Anna → Bob", message_it: content.length > 0 ? content : "📎 Allegato" };
    const resultIT = resolveNotifI18n("it", base, i18n);
    assert.equal(resultIT.message, "📎 Allegato");
    const resultDE = resolveNotifI18n("de", base, i18n);
    assert.equal(resultDE.message, "📎 Anhang");
  });

  it("passes chat message content through unchanged regardless of language", () => {
    const content = "Hallo Team, bitte die Lieferung prüfen.";
    const base    = { title: "Chat: Anna → Bob", message: content };
    const i18n    = { title_it: "Chat: Anna → Bob", message_it: content };
    assert.equal(resolveNotifI18n("it", base, i18n).message, content);
    assert.equal(resolveNotifI18n("de", base, i18n).message, content);
  });
});
