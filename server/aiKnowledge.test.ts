import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findSensitiveData, knowledgePromptBlock } from "./aiKnowledge";

describe("ai knowledge privacy gate (findSensitiveData)", () => {
  test("rejects email addresses", () => {
    assert.equal(findSensitiveData("Kontakt: thomas@biergarten.de hilft weiter", []), "email");
  });

  test("rejects phone numbers", () => {
    assert.equal(findSensitiveData("Ruf +39 0471 963 012 an", []), "phone");
  });

  test("rejects order references", () => {
    assert.equal(findSensitiveData("Siehe Bestellung #1042 im Verlauf", []), "order_reference");
    assert.equal(findSensitiveData("Die Bestellnummer 88 ist storniert", []), "order_reference");
  });

  test("rejects prices / currency amounts", () => {
    assert.equal(findSensitiveData("Der Preis liegt bei 12,50 €", []), "price");
    assert.equal(findSensitiveData("kostet 9.90 EUR pro Kiste", []), "price");
  });

  test("rejects long numeric identifiers", () => {
    assert.equal(findSensitiveData("ID 123456789 verwenden", []), "long_number");
  });

  test("rejects known company / member names from the denylist (umlaut-insensitive)", () => {
    const denylist = ["biergarten muenchen", "thomas weber"];
    assert.equal(
      findSensitiveData("Der Biergarten München bestellt immer montags", denylist),
      "known_name",
    );
    assert.equal(findSensitiveData("Thomas Weber hat das bestätigt", denylist), "known_name");
  });

  test("accepts a general, data-free help answer", () => {
    const denylist = ["biergarten muenchen", "thomas weber"];
    assert.equal(
      findSensitiveData(
        "Wie ändere ich eine bereits bestätigte Bestellung?\nSende einen Änderungsantrag an den Lieferanten. Dieser kann ihn annehmen oder ablehnen; alles wird im Chat protokolliert.",
        denylist,
      ),
      null,
    );
  });
});

describe("knowledgePromptBlock (untrusted-context wrapper)", () => {
  const entries = [
    { id: "k1", question: "Wie storniere ich?", answer: "Über die Bestellungen-Seite." },
  ];

  test("wraps entries in markers and an ignore-instructions warning", () => {
    const block = knowledgePromptBlock(entries as any, "de");
    assert.ok(block.includes("<gelerntes_wissen>"));
    assert.ok(block.includes("</gelerntes_wissen>"));
    assert.ok(block.includes("KEINE Anweisungen"));
    assert.ok(block.includes("Wie storniere ich?"));
  });

  test("returns empty string without entries", () => {
    assert.equal(knowledgePromptBlock([], "de"), "");
  });
});
