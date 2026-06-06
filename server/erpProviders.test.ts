// Unit tests for the named-vendor ERP adapters in erpProviders.ts.
//
// Every adapter talks to its vendor over HTTP and maps a vendor-specific
// response shape into NormalizedCatalogRow. These tests mock global `fetch`
// so we can lock in, per vendor: the auth handshake, the catalog endpoint +
// paging behaviour, and the produced NormalizedCatalogRow fields (name, price,
// stock, articleNumber, gtin, unit). A vendor renaming a field or a refactor of
// the field-alias map would surface here instead of silently breaking sync.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { erpProviderRegistry, getErpProviderAdapter } from "./erpProviders";
import { ErpSyncConfigError, type NormalizedCatalogRow } from "./erpSync";

// ---------- fetch mock plumbing ----------

interface FetchCall {
  url: string;
  init?: any;
}
interface Route {
  match: (url: string, init?: any) => boolean;
  respond: (url: string, init?: any) => Response | Promise<Response>;
}

let originalFetch: typeof globalThis.fetch;
let calls: FetchCall[] = [];

function installFetch(routes: Route[]): FetchCall[] {
  calls = [];
  globalThis.fetch = (async (input: any, init: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    calls.push({ url, init });
    for (const r of routes) {
      if (r.match(url, init)) return r.respond(url, init);
    }
    throw new Error(`Unexpected fetch to ${url}`);
  }) as any;
  return calls;
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

// A valid 13-digit GTIN reused across vendors (survives normalizeGtin).
const GTIN = "4006381333931";

function rowByName(rows: NormalizedCatalogRow[], name: string): NormalizedCatalogRow {
  const r = rows.find((x) => x.name === name);
  assert.ok(r, `expected a normalized row named "${name}"`);
  return r!;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ===================== Microsoft Dynamics 365 =====================

describe("DynamicsErpProvider", () => {
  const adapter = erpProviderRegistry["dynamics365"];
  const secrets = {
    tenantId: "tenant-1",
    clientId: "client-1",
    clientSecret: "secret-1",
    companyId: "company-1",
    environment: "production",
  };

  test("authenticates via OAuth2 then maps item fields", async () => {
    installFetch([
      {
        match: (u) => u.includes("login.microsoftonline.com"),
        respond: () => jsonResponse({ access_token: "tok-123" }),
      },
      {
        match: (u) => u.includes("/items"),
        respond: () =>
          jsonResponse({
            value: [
              {
                id: "g1",
                displayName: "Tomaten",
                number: "ART-1",
                gtin: GTIN,
                baseUnitOfMeasureCode: "KG",
                itemCategoryCode: "VEG",
                unitPrice: 2.5,
                inventory: 42,
              },
            ],
          }),
      },
    ]);

    const rows = await adapter.fetchCatalog!(secrets);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.externalId, "g1");
    assert.equal(r.name, "Tomaten");
    assert.equal(r.articleNumber, "ART-1");
    assert.equal(r.gtin, GTIN);
    assert.equal(r.unit, "KG");
    assert.equal(r.category, "VEG");
    assert.equal(r.price, 2.5);
    assert.equal(r.stockQuantity, 42);
  });

  test("sends the OAuth2 bearer token on the catalog request", async () => {
    const c = installFetch([
      { match: (u) => u.includes("login.microsoftonline.com"), respond: () => jsonResponse({ access_token: "tok-xyz" }) },
      { match: (u) => u.includes("/items"), respond: () => jsonResponse({ value: [] }) },
    ]);
    await adapter.fetchCatalog!(secrets);
    const itemCall = c.find((x) => x.url.includes("/items"));
    assert.ok(itemCall);
    assert.equal(itemCall!.init.headers.Authorization, "Bearer tok-xyz");
  });

  test("follows @odata.nextLink paging across pages", async () => {
    const page2 = "https://api.businesscentral.dynamics.com/page2";
    installFetch([
      { match: (u) => u.includes("login.microsoftonline.com"), respond: () => jsonResponse({ access_token: "t" }) },
      {
        match: (u) => u.includes("/items"),
        respond: () => jsonResponse({ value: [{ id: "1", displayName: "A", unitPrice: 1 }], "@odata.nextLink": page2 }),
      },
      {
        match: (u) => u === page2,
        respond: () => jsonResponse({ value: [{ id: "2", displayName: "B", unitPrice: 2 }] }),
      },
    ]);
    const rows = await adapter.fetchCatalog!(secrets);
    assert.deepEqual(rows.map((r) => r.name).sort(), ["A", "B"]);
  });

  test("sample mode fetches only the first page", async () => {
    const c = installFetch([
      { match: (u) => u.includes("login.microsoftonline.com"), respond: () => jsonResponse({ access_token: "t" }) },
      {
        match: (u) => u.includes("/items"),
        respond: () => jsonResponse({ value: [{ id: "1", displayName: "A", unitPrice: 1 }], "@odata.nextLink": "https://x/p2" }),
      },
    ]);
    const rows = await adapter.fetchCatalog!(secrets, { sample: true });
    assert.equal(rows.length, 1);
    assert.equal(c.filter((x) => x.url.includes("/items") || x.url.includes("/p2")).length, 1);
  });

  test("throws a config error when a required secret is missing", async () => {
    installFetch([]);
    await assert.rejects(() => adapter.fetchCatalog!({ ...secrets, tenantId: "" }), ErpSyncConfigError);
  });
});

// ===================== SAP Business One (Service Layer) =====================

describe("SapErpProvider", () => {
  const adapter = erpProviderRegistry["sap-b1"];
  const secrets = {
    serviceLayerUrl: "https://sap.example/b1s/v1",
    companyDb: "DB1",
    username: "u",
    password: "p",
  };

  function loginWithCookie(): Response {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "B1SESSION=cookie-abc; path=/; HttpOnly");
    return new Response(JSON.stringify({}), { status: 200, headers });
  }

  test("logs in, maps items (price = first positive), and logs out", async () => {
    const c = installFetch([
      { match: (u) => u.endsWith("/Login"), respond: () => loginWithCookie() },
      {
        match: (u) => u.includes("/Items"),
        respond: () =>
          jsonResponse({
            value: [
              {
                ItemCode: "A1",
                ItemName: "Mehl",
                QuantityOnStock: 10,
                BarCode: GTIN,
                SalesUnit: "KG",
                ItemPrices: [{ Price: 0 }, { Price: 1.2 }],
              },
            ],
          }),
      },
      { match: (u) => u.endsWith("/Logout"), respond: () => new Response(null, { status: 204 }) },
    ]);

    const rows = await adapter.fetchCatalog!(secrets);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.externalId, "A1");
    assert.equal(r.articleNumber, "A1");
    assert.equal(r.name, "Mehl");
    assert.equal(r.gtin, GTIN);
    assert.equal(r.unit, "KG");
    assert.equal(r.price, 1.2);
    assert.equal(r.stockQuantity, 10);

    // Session cookie threaded onto the Items request, and logout attempted.
    const itemsCall = c.find((x) => x.url.includes("/Items"));
    assert.equal(itemsCall!.init.headers.Cookie, "B1SESSION=cookie-abc");
    assert.ok(c.some((x) => x.url.endsWith("/Logout")));
  });

  test("falls back to SessionId body when no set-cookie header", async () => {
    const c = installFetch([
      { match: (u) => u.endsWith("/Login"), respond: () => jsonResponse({ SessionId: "sess-9" }) },
      { match: (u) => u.includes("/Items"), respond: () => jsonResponse({ value: [] }) },
      { match: (u) => u.endsWith("/Logout"), respond: () => new Response(null, { status: 204 }) },
    ]);
    await adapter.fetchCatalog!(secrets);
    const itemsCall = c.find((x) => x.url.includes("/Items"));
    assert.equal(itemsCall!.init.headers.Cookie, "B1SESSION=sess-9");
  });

  test("throws a config error when login fails", async () => {
    installFetch([
      { match: (u) => u.endsWith("/Login"), respond: () => new Response("bad creds", { status: 401 }) },
    ]);
    await assert.rejects(() => adapter.fetchCatalog!(secrets), ErpSyncConfigError);
  });
});

// ===================== weclapp =====================

describe("WeclappErpProvider", () => {
  const adapter = erpProviderRegistry["weclapp"];
  const secrets = { apiKey: "token-w", apiBaseUrl: "https://tenant.weclapp.com" };

  test("sends the token header and maps article fields", async () => {
    const c = installFetch([
      {
        match: (u) => u.includes("/webapp/api/v1/article"),
        respond: () =>
          jsonResponse({
            result: [
              { id: "w1", name: "Olivenöl", description: "extra", articleNumber: "OL-1", ean: GTIN, unitName: "Flasche", salesPrice: 7.9 },
            ],
          }),
      },
    ]);
    const rows = await adapter.fetchCatalog!(secrets);
    assert.equal(rows.length, 1);
    const r = rows[0];
    assert.equal(r.externalId, "w1");
    assert.equal(r.name, "Olivenöl");
    assert.equal(r.articleNumber, "OL-1");
    assert.equal(r.gtin, GTIN);
    assert.equal(r.unit, "Flasche");
    assert.equal(r.price, 7.9);
    const call = c.find((x) => x.url.includes("/article"));
    assert.equal(call!.init.headers.AuthenticationToken, "token-w");
  });

  test("stops paging once a short page is returned", async () => {
    const c = installFetch([
      { match: (u) => u.includes("/article"), respond: () => jsonResponse({ result: [{ id: "1", name: "A", salesPrice: 1 }] }) },
    ]);
    const rows = await adapter.fetchCatalog!(secrets);
    assert.equal(rows.length, 1);
    assert.equal(c.filter((x) => x.url.includes("/article")).length, 1);
  });
});

// ===================== Lexware Office (lexoffice) =====================

describe("LexwareErpProvider", () => {
  const adapter = erpProviderRegistry["lexware"];
  const secrets = { apiKey: "key-lex" };

  test("maps article fields and resolves NET-led nested price", async () => {
    installFetch([
      {
        match: (u) => u.includes("/v1/articles"),
        respond: () =>
          jsonResponse({
            content: [
              {
                id: "l1",
                title: "Salz",
                description: "fein",
                articleNumber: "SA-1",
                gtin: GTIN,
                unitName: "kg",
                price: { netPrice: 1.0, grossPrice: 1.19 },
              },
            ],
            last: true,
          }),
      },
    ]);
    const rows = await adapter.fetchCatalog!(secrets);
    const r = rows[0];
    assert.equal(r.name, "Salz");
    assert.equal(r.articleNumber, "SA-1");
    assert.equal(r.gtin, GTIN);
    assert.equal(r.unit, "kg");
    assert.equal(r.price, 1.0);
  });

  test("uses gross price when the article is gross-led", async () => {
    installFetch([
      {
        match: (u) => u.includes("/v1/articles"),
        respond: () =>
          jsonResponse({
            content: [{ id: "l2", title: "Zucker", price: { leadingPrice: "GROSS", netPrice: 1.0, grossPrice: 1.19 } }],
            last: true,
          }),
      },
    ]);
    const rows = await adapter.fetchCatalog!(secrets);
    assert.equal(rows[0].price, 1.19);
  });
});

// ===================== DATEV =====================

describe("DatevErpProvider", () => {
  const adapter = erpProviderRegistry["datev"];

  test("uses a stored API key as a bearer token and maps German keys", async () => {
    const c = installFetch([
      {
        match: (u) => u.includes("datev.example"),
        respond: () => jsonResponse([{ Bezeichnung: "Butter", Artikelnummer: "BU-1", Verkaufspreis: "3,50", Lagerbestand: "8", EAN: GTIN, Einheit: "Stück" }]),
      },
    ]);
    const rows = await adapter.fetchCatalog!({ apiBaseUrl: "https://datev.example/catalog", apiKey: "datev-key" });
    const r = rows[0];
    assert.equal(r.name, "Butter");
    assert.equal(r.articleNumber, "BU-1");
    assert.equal(r.price, 3.5);
    assert.equal(r.stockQuantity, 8);
    assert.equal(r.gtin, GTIN);
    assert.equal(r.unit, "Stück");
    const call = c.find((x) => x.url.includes("datev.example"));
    assert.equal(call!.init.headers.Authorization, "Bearer datev-key");
  });

  test("exchanges OAuth2 client credentials when configured", async () => {
    const c = installFetch([
      { match: (u) => u.includes("/token"), respond: () => jsonResponse({ access_token: "oauth-tok" }) },
      { match: (u) => u.includes("datev.example"), respond: () => jsonResponse([{ name: "X", price: 1 }]) },
    ]);
    const rows = await adapter.fetchCatalog!({
      apiBaseUrl: "https://datev.example/catalog",
      clientId: "c",
      clientSecret: "s",
      tokenUrl: "https://datev.example/token",
    });
    assert.equal(rows[0].name, "X");
    const call = c.find((x) => x.url === "https://datev.example/catalog");
    assert.equal(call!.init.headers.Authorization, "Bearer oauth-tok");
  });

  test("throws when neither API key nor OAuth2 credentials are present", async () => {
    installFetch([]);
    await assert.rejects(() => adapter.fetchCatalog!({ apiBaseUrl: "https://datev.example/catalog" }), ErpSyncConfigError);
  });
});

// ===================== Xentral / Sage (generic bearer REST) =====================

describe("Xentral / Sage bearer adapters", () => {
  for (const slug of ["xentral", "sage"] as const) {
    test(`${slug} fetches the catalog with a bearer token`, async () => {
      const c = installFetch([
        { match: (u) => u.includes("erp.example"), respond: () => jsonResponse([{ name: "Pasta", articleNumber: "PA-1", price: 0.99, stock: 5, ean: GTIN, unit: "Packung" }]) },
      ]);
      const adapter = erpProviderRegistry[slug];
      const rows = await adapter.fetchCatalog!({ apiBaseUrl: "https://erp.example/api/products", apiKey: "k" });
      const r = rows[0];
      assert.equal(r.name, "Pasta");
      assert.equal(r.articleNumber, "PA-1");
      assert.equal(r.price, 0.99);
      assert.equal(r.stockQuantity, 5);
      assert.equal(r.gtin, GTIN);
      assert.equal(r.unit, "Packung");
      const call = c[0];
      assert.equal(call.init.headers.Authorization, "Bearer k");
      assert.equal(call.init.headers["X-API-Key"], "k");
    });

    test(`${slug} throws when the API URL is missing`, async () => {
      installFetch([]);
      await assert.rejects(() => erpProviderRegistry[slug].fetchCatalog!({ apiKey: "k" }), ErpSyncConfigError);
    });
  }
});

// ===================== Registry resolution =====================

describe("getErpProviderAdapter", () => {
  test("returns the registered adapter for a known slug", () => {
    assert.equal(getErpProviderAdapter("sap-b1").slug, "sap-b1");
  });
  test("falls back to a stub provider (no fetchCatalog) for an unknown slug", () => {
    const a = getErpProviderAdapter("totally-unknown");
    assert.equal(a.slug, "totally-unknown");
    assert.equal(typeof a.fetchCatalog, "undefined");
  });
});
