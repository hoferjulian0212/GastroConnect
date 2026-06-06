// Unit tests for the generic normalizer (FIELD_ALIASES via normalizeRecords) and
// the fetchErpCatalog ingestion dispatcher.
//
// FIELD_ALIASES is the safety net that keeps the normalizer robust even when an
// adapter passes through vendor-native keys (displayName, ItemCode,
// QuantityOnStock, German column names). fetchErpCatalog must resolve ingestion
// in a fixed priority: mailbox (Excel-via-email) -> named-vendor adapter ->
// generic REST. These tests lock both contracts in.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { normalizeRecords, fetchErpCatalog, ErpSyncConfigError } from "./erpSync";
import { storage } from "./storage";

const GTIN = "4006381333931";

// ===================== FIELD_ALIASES via normalizeRecords =====================

describe("normalizeRecords / FIELD_ALIASES", () => {
  test("maps Dynamics 365 native keys (displayName, number, inventory, ...)", () => {
    const rows = normalizeRecords([
      { displayName: "Tomaten", number: "ART-1", inventory: 42, unitPrice: 2.5, gtin: GTIN, baseUnitOfMeasureCode: "KG", itemCategoryCode: "VEG" },
    ]);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.name, "Tomaten");
    assert.equal(r.articleNumber, "ART-1");
    assert.equal(r.stockQuantity, 42);
    assert.equal(r.price, 2.5);
    assert.equal(r.gtin, GTIN);
    assert.equal(r.unit, "KG");
    assert.equal(r.category, "VEG");
  });

  test("maps SAP B1 native keys (ItemCode, ItemName, QuantityOnStock, ...)", () => {
    const rows = normalizeRecords([
      { ItemCode: "A1", ItemName: "Mehl", QuantityOnStock: 10, BarCode: GTIN, SalesUnit: "KG", Price: 1.2 },
    ]);
    const r = rows[0];
    assert.equal(r.name, "Mehl");
    assert.equal(r.articleNumber, "A1");
    assert.equal(r.stockQuantity, 10);
    assert.equal(r.gtin, GTIN);
    assert.equal(r.unit, "KG");
    assert.equal(r.price, 1.2);
  });

  test("maps German column names with comma decimals and unit synonyms", () => {
    const rows = normalizeRecords([
      { Bezeichnung: "Butter", Artikelnummer: "BU-1", Verkaufspreis: "3,50", Lagerbestand: "8", EAN: GTIN, Einheit: "Stück" },
    ]);
    const r = rows[0];
    assert.equal(r.name, "Butter");
    assert.equal(r.articleNumber, "BU-1");
    assert.equal(r.price, 3.5);
    assert.equal(r.stockQuantity, 8);
    assert.equal(r.gtin, GTIN);
    assert.equal(r.unit, "Stück");
  });

  test("unwraps a wrapped collection (products/items/data/rows/results)", () => {
    for (const key of ["products", "items", "data", "catalog", "rows", "results"]) {
      const rows = normalizeRecords({ [key]: [{ name: "X", price: 1 }] });
      assert.equal(rows.length, 1, `key ${key} should be unwrapped`);
      assert.equal(rows[0].name, "X");
    }
  });

  test("drops records without a usable name", () => {
    const rows = normalizeRecords([{ price: 5, articleNumber: "NO-NAME" }, { name: "Keep", price: 1 }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Keep");
  });

  test("normalizes an invalid GTIN to null", () => {
    const rows = normalizeRecords([{ name: "X", ean: "123" }]);
    assert.equal(rows[0].gtin, null);
  });
});

// ===================== fetchErpCatalog dispatch order =====================

describe("fetchErpCatalog dispatch", () => {
  let origSecrets: typeof storage.getErpCredentialSecrets;
  let origProvider: typeof storage.getErpProvider;
  let origFetch: typeof globalThis.fetch;
  const conn = { id: "conn-1", providerId: "prov-1" };

  beforeEach(() => {
    origSecrets = storage.getErpCredentialSecrets;
    origProvider = storage.getErpProvider;
    origFetch = globalThis.fetch;
  });
  afterEach(() => {
    storage.getErpCredentialSecrets = origSecrets;
    storage.getErpProvider = origProvider;
    globalThis.fetch = origFetch;
  });

  test("prefers a named-vendor adapter over the generic REST fetch", async () => {
    storage.getErpCredentialSecrets = (async () => ({ apiKey: "k", apiBaseUrl: "https://generic.example/catalog" })) as any;
    storage.getErpProvider = (async () => ({ slug: "lexware" })) as any;
    globalThis.fetch = (async (input: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/v1/articles")) {
        return new Response(JSON.stringify({ content: [{ id: "1", title: "FromAdapter", price: { netPrice: 1 } }], last: true }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify([{ name: "FromGeneric", price: 1 }]), { status: 200, headers: { "content-type": "application/json" } });
    }) as any;

    const rows = await fetchErpCatalog(conn);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "FromAdapter");
  });

  test("falls back to generic REST when the provider has no adapter", async () => {
    storage.getErpCredentialSecrets = (async () => ({ apiKey: "k", apiBaseUrl: "https://generic.example/catalog" })) as any;
    storage.getErpProvider = (async () => ({ slug: "totally-unknown" })) as any;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([{ name: "FromGeneric", price: 2 }]), { status: 200, headers: { "content-type": "application/json" } })) as any;

    const rows = await fetchErpCatalog(conn);
    assert.equal(rows[0].name, "FromGeneric");
    assert.equal(rows[0].price, 2);
  });

  test("chooses the mailbox path before consulting any adapter", async () => {
    let providerConsulted = false;
    let fetched = false;
    storage.getErpCredentialSecrets = (async () => ({
      mailboxHost: "127.0.0.1",
      mailboxUser: "u",
      mailboxPassword: "p",
      mailboxPort: "1",
      apiKey: "k",
      apiBaseUrl: "https://generic.example/catalog",
    })) as any;
    storage.getErpProvider = (async () => {
      providerConsulted = true;
      return { slug: "lexware" } as any;
    }) as any;
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("[]", { status: 200 });
    }) as any;

    // The mailbox branch is taken first; with an unreachable mailbox it rejects
    // with a connection error — proving the adapter/REST paths were skipped.
    await assert.rejects(() => fetchErpCatalog(conn), ErpSyncConfigError);
    assert.equal(providerConsulted, false, "adapter must not be consulted when mailbox is configured");
    assert.equal(fetched, false, "no HTTP catalog fetch when mailbox is configured");
  });

  test("throws when no credentials are stored", async () => {
    storage.getErpCredentialSecrets = (async () => undefined) as any;
    await assert.rejects(() => fetchErpCatalog(conn), ErpSyncConfigError);
  });

  test("throws when credentials match no supported ingestion method", async () => {
    storage.getErpCredentialSecrets = (async () => ({})) as any;
    storage.getErpProvider = (async () => undefined) as any;
    await assert.rejects(() => fetchErpCatalog(conn), ErpSyncConfigError);
  });
});
