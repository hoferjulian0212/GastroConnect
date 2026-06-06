// Supplier ERP (Enterprise Resource Planning) provider service layer.
//
// Named-vendor adapters live here. Each adapter knows how to authenticate
// against its vendor's API and pull the supplier's product/price/stock catalog,
// mapping the vendor-specific response into the generic NormalizedCatalogRow
// contract consumed by the sync engine (erpSync.ts). Vendor-specific field
// quirks (nested prices, OData paging, session cookies, German column names)
// are handled inside each adapter's transform.
//
// Adapters that cannot (or need not) talk to a vendor API directly leave
// `fetchCatalog` undefined; the sync dispatcher then falls back to the generic
// REST/JSON or Excel-via-email ingestion paths based on the stored credentials.

import { ErpSyncConfigError, normalizeRecords, type ErpFetchOptions, type NormalizedCatalogRow } from "./erpSync";

export interface ErpConnectionContext {
  externalSupplierId?: string | null;
}

export interface ErpProviderInterface {
  readonly slug: string;
  readonly name: string;
  connect(ctx: ErpConnectionContext): Promise<{ ok: boolean; message?: string }>;
  disconnect(ctx: ErpConnectionContext): Promise<{ ok: boolean }>;
  // Vendor-specific catalog fetch. When implemented, the sync engine uses this
  // instead of the generic ingestion paths. Returns normalized rows ready for
  // reconciliation. Throws ErpSyncConfigError on missing/invalid credentials.
  // With opts.sample, fetch only the first page (used by "Test connection").
  fetchCatalog?(secrets: Record<string, string>, opts?: ErpFetchOptions): Promise<NormalizedCatalogRow[]>;
}

// ===================== Shared HTTP / auth helpers =====================

const DEFAULT_TIMEOUT_MS = 30_000;

async function httpRequest(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new ErpSyncConfigError("The ERP request timed out.");
    throw new ErpSyncConfigError(`Could not reach the ERP API: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }
}

async function httpJson(url: string, init: RequestInit, label: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
  const res = await httpRequest(url, init, timeoutMs);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ErpSyncConfigError(`${label} responded with HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}.`);
  }
  return res.json();
}

// Read a required secret or throw a clear, supplier-facing config error.
function reqSecret(secrets: Record<string, string>, key: string, label: string, fieldName: string): string {
  const v = (secrets[key] ?? "").trim();
  if (!v) throw new ErpSyncConfigError(`${label}: missing "${fieldName}". Please add it in the ERP credentials.`);
  return v;
}

// OAuth2 client-credentials token exchange (used by Dynamics 365, DATEV, ...).
async function oauth2ClientCredentials(opts: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  label: string;
}): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  if (opts.scope) body.set("scope", opts.scope);

  const res = await httpRequest(opts.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new ErpSyncConfigError(`${opts.label}: token request failed (HTTP ${res.status})${t ? `: ${t.slice(0, 200)}` : ""}.`);
  }
  const json: any = await res.json();
  const token = json?.access_token;
  if (!token) throw new ErpSyncConfigError(`${opts.label}: no access_token in the token response.`);
  return String(token);
}

// Generic bearer-token catalog fetch (used by token-based REST vendors that
// expose a single product resource, e.g. Xentral, Sage, DATEV-via-key).
async function bearerCatalogFetch(secrets: Record<string, string>, label: string): Promise<NormalizedCatalogRow[]> {
  const base = reqSecret(secrets, "apiBaseUrl", label, "catalog/API URL").replace(/\/$/, "");
  const apiKey = reqSecret(secrets, "apiKey", label, "API key");
  const data = await httpJson(base, {
    headers: { Authorization: `Bearer ${apiKey}`, "X-API-Key": apiKey, Accept: "application/json" },
  }, label);
  return normalizeRecords(data);
}

// ===================== Base + stub provider =====================

// Base provider: declares the contract. Vendors override connect()'s message
// and (optionally) fetchCatalog with a real adapter.
class BaseErpProvider implements ErpProviderInterface {
  constructor(
    public readonly slug: string,
    public readonly name: string,
    private readonly connectMessage?: string,
  ) {}

  async connect(): Promise<{ ok: boolean; message?: string }> {
    return {
      ok: true,
      message:
        this.connectMessage ??
        `${this.name} is not yet connected automatically. Your request has been recorded and our team will set up the stock sync manually.`,
    };
  }

  async disconnect(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

// ===================== Microsoft Dynamics 365 Business Central =====================

class DynamicsErpProvider extends BaseErpProvider {
  constructor() {
    super(
      "dynamics365",
      "Microsoft Dynamics 365",
      "Microsoft Dynamics 365 Business Central supports a direct API connection. After approval, store your Azure AD credentials (Tenant ID, Client ID, Client Secret, Environment, Company ID) to enable automatic sync.",
    );
  }

  async fetchCatalog(secrets: Record<string, string>, opts: ErpFetchOptions = {}): Promise<NormalizedCatalogRow[]> {
    const label = "Microsoft Dynamics 365";
    const tenantId = reqSecret(secrets, "tenantId", label, "Tenant ID");
    const clientId = reqSecret(secrets, "clientId", label, "Client ID");
    const clientSecret = reqSecret(secrets, "clientSecret", label, "Client Secret");
    const companyId = reqSecret(secrets, "companyId", label, "Company ID");
    const environment = (secrets.environment || "production").trim();

    const token = await oauth2ClientCredentials({
      tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      clientId,
      clientSecret,
      scope: "https://api.businesscentral.dynamics.com/.default",
      label,
    });

    const base = (secrets.apiBaseUrl?.trim() ||
      `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${environment}/api/v2.0`).replace(/\/$/, "");

    const records: Record<string, unknown>[] = [];
    let url: string | null = `${base}/companies(${companyId})/items?$top=200`;
    let guard = 0;
    while (url && guard++ < 1000) {
      const data: any = await httpJson(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      }, label);
      for (const it of data.value ?? []) {
        records.push({
          externalId: it.id,
          name: it.displayName,
          articleNumber: it.number,
          gtin: it.gtin,
          unit: it.baseUnitOfMeasureCode ?? it.baseUnitOfMeasure,
          category: it.itemCategoryCode,
          price: it.unitPrice,
          stockQuantity: it.inventory,
        });
      }
      url = opts.sample ? null : (data["@odata.nextLink"] ?? null);
    }
    return normalizeRecords(records);
  }
}

// ===================== Lexware Office (lexoffice) =====================

class LexwareErpProvider extends BaseErpProvider {
  constructor() {
    super(
      "lexware",
      "Lexware",
      "Lexware Office supports a direct API connection. After approval, store your Lexware Office API key to enable automatic sync.",
    );
  }

  async fetchCatalog(secrets: Record<string, string>, opts: ErpFetchOptions = {}): Promise<NormalizedCatalogRow[]> {
    const label = "Lexware Office";
    const apiKey = reqSecret(secrets, "apiKey", label, "API key");
    const base = (secrets.apiBaseUrl?.trim() || "https://api.lexoffice.io").replace(/\/$/, "");

    const records: Record<string, unknown>[] = [];
    const size = 100;
    let page = 0;
    while (page < 1000) {
      const data: any = await httpJson(`${base}/v1/articles?page=${page}&size=${size}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      }, label);
      const content: any[] = data.content ?? [];
      for (const a of content) {
        // Lexware nests price; net price leads unless the article is gross-led.
        const price = a.price
          ? (a.price.leadingPrice === "GROSS"
              ? a.price.grossPrice ?? a.price.netPrice
              : a.price.netPrice ?? a.price.grossPrice)
          : null;
        records.push({
          externalId: a.id,
          name: a.title,
          description: a.description,
          articleNumber: a.articleNumber,
          gtin: a.gtin,
          unit: a.unitName,
          price,
        });
      }
      if (opts.sample || data.last === true || content.length === 0 || page >= (data.totalPages ?? 1) - 1) break;
      page++;
    }
    return normalizeRecords(records);
  }
}

// ===================== DATEV =====================

class DatevErpProvider extends BaseErpProvider {
  constructor() {
    super(
      "datev",
      "DATEV",
      "DATEV supports a direct API connection. After approval, store either an API key or your OAuth2 client credentials (Client ID, Client Secret, Token URL) together with the catalog resource URL to enable automatic sync.",
    );
  }

  async fetchCatalog(secrets: Record<string, string>): Promise<NormalizedCatalogRow[]> {
    const label = "DATEV";
    const base = reqSecret(secrets, "apiBaseUrl", label, "catalog resource URL").replace(/\/$/, "");

    let token: string;
    if (secrets.clientId && secrets.clientSecret && secrets.tokenUrl) {
      token = await oauth2ClientCredentials({
        tokenUrl: secrets.tokenUrl.trim(),
        clientId: secrets.clientId.trim(),
        clientSecret: secrets.clientSecret.trim(),
        scope: secrets.scope?.trim(),
        label,
      });
    } else if (secrets.apiKey) {
      token = secrets.apiKey.trim();
    } else {
      throw new ErpSyncConfigError(
        "DATEV: provide either an API key, or Client ID + Client Secret + Token URL.",
      );
    }

    // DATEV's resources return German-named columns, handled by FIELD_ALIASES.
    const data = await httpJson(base, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }, label);
    return normalizeRecords(data);
  }
}

// ===================== SAP Business One (Service Layer) =====================

class SapErpProvider extends BaseErpProvider {
  constructor() {
    super(
      "sap-b1",
      "SAP Business One",
      "SAP Business One supports a direct API connection via the Service Layer. After approval, store your Service Layer URL, Company DB, user name and password to enable automatic sync.",
    );
  }

  async fetchCatalog(secrets: Record<string, string>, opts: ErpFetchOptions = {}): Promise<NormalizedCatalogRow[]> {
    const label = "SAP Business One";
    const slUrl = reqSecret(secrets, "serviceLayerUrl", label, "Service Layer URL").replace(/\/$/, "");
    const companyDb = reqSecret(secrets, "companyDb", label, "Company DB");
    const username = reqSecret(secrets, "username", label, "User name");
    const password = reqSecret(secrets, "password", label, "Password");

    // 1) Session login → capture the B1SESSION cookie(s).
    const loginRes = await httpRequest(`${slUrl}/Login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ CompanyDB: companyDb, UserName: username, Password: password }),
    });
    if (!loginRes.ok) {
      const t = await loginRes.text().catch(() => "");
      throw new ErpSyncConfigError(`${label}: login failed (HTTP ${loginRes.status})${t ? `: ${t.slice(0, 200)}` : ""}.`);
    }
    let cookie = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    if (!cookie) {
      const body: any = await loginRes.json().catch(() => null);
      if (body?.SessionId) cookie = `B1SESSION=${body.SessionId}`;
    }
    if (!cookie) throw new ErpSyncConfigError(`${label}: login returned no session.`);

    // 2) Page through /Items.
    const select = "ItemCode,ItemName,QuantityOnStock,BarCode,SalesUnit,ItemPrices";
    const records: Record<string, unknown>[] = [];
    let next: string | null = `Items?$select=${select}&$top=100`;
    let guard = 0;
    try {
      while (next && guard++ < 1000) {
        const url = next.startsWith("http") ? next : `${slUrl}/${next.replace(/^\//, "")}`;
        const data: any = await httpJson(url, { headers: { Cookie: cookie, Accept: "application/json" } }, label);
        for (const it of data.value ?? []) {
          let price: number | null = null;
          if (Array.isArray(it.ItemPrices)) {
            const p = it.ItemPrices.find((x: any) => Number(x?.Price) > 0) ?? it.ItemPrices[0];
            price = p?.Price ?? null;
          }
          records.push({
            externalId: it.ItemCode,
            name: it.ItemName,
            articleNumber: it.ItemCode,
            gtin: it.BarCode,
            unit: it.SalesUnit,
            price,
            stockQuantity: it.QuantityOnStock,
          });
        }
        next = opts.sample ? null : (data["@odata.nextLink"] ?? null);
      }
    } finally {
      // 3) Best-effort logout to free the session.
      try { await httpRequest(`${slUrl}/Logout`, { method: "POST", headers: { Cookie: cookie } }); } catch { /* ignore */ }
    }
    return normalizeRecords(records);
  }
}

// ===================== weclapp =====================

class WeclappErpProvider extends BaseErpProvider {
  constructor() {
    super(
      "weclapp",
      "weclapp",
      "weclapp supports a direct API connection. After approval, store your weclapp base URL (https://YOUR-TENANT.weclapp.com) and API token to enable automatic sync.",
    );
  }

  async fetchCatalog(secrets: Record<string, string>, opts: ErpFetchOptions = {}): Promise<NormalizedCatalogRow[]> {
    const label = "weclapp";
    const token = reqSecret(secrets, "apiKey", label, "API token");
    const base = reqSecret(secrets, "apiBaseUrl", label, "base URL (https://TENANT.weclapp.com)").replace(/\/$/, "");
    const apiRoot = base.includes("/webapp/api") ? base : `${base}/webapp/api/v1`;

    const records: Record<string, unknown>[] = [];
    const pageSize = 100;
    let page = 1;
    while (page < 1000) {
      const data: any = await httpJson(`${apiRoot}/article?page=${page}&pageSize=${pageSize}`, {
        headers: { AuthenticationToken: token, Accept: "application/json" },
      }, label);
      const result: any[] = data.result ?? [];
      for (const a of result) {
        records.push({
          externalId: a.id,
          name: a.name,
          description: a.description,
          articleNumber: a.articleNumber,
          gtin: a.ean,
          unit: a.unitName,
          // weclapp keeps prices on separate price lists; pick a flat field if present.
          price: a.salesPrice ?? a.listPrice ?? null,
        });
      }
      if (opts.sample || result.length < pageSize) break;
      page++;
    }
    return normalizeRecords(records);
  }
}

// ===================== Xentral / Sage (token-based REST) =====================

class XentralErpProvider extends BaseErpProvider {
  constructor() {
    super(
      "xentral",
      "Xentral",
      "Xentral supports a direct API connection. After approval, store your Xentral catalog API URL and API key to enable automatic sync.",
    );
  }
  async fetchCatalog(secrets: Record<string, string>): Promise<NormalizedCatalogRow[]> {
    return bearerCatalogFetch(secrets, "Xentral");
  }
}

class SageErpProvider extends BaseErpProvider {
  constructor() {
    super(
      "sage",
      "Sage",
      "Sage supports a direct API connection. After approval, store your Sage catalog API URL and API key to enable automatic sync.",
    );
  }
  async fetchCatalog(secrets: Record<string, string>): Promise<NormalizedCatalogRow[]> {
    return bearerCatalogFetch(secrets, "Sage");
  }
}

// ===================== Registry =====================

export const erpProviderRegistry: Record<string, ErpProviderInterface> = {
  "sap-b1": new SapErpProvider(),
  dynamics365: new DynamicsErpProvider(),
  xentral: new XentralErpProvider(),
  weclapp: new WeclappErpProvider(),
  lexware: new LexwareErpProvider(),
  datev: new DatevErpProvider(),
  sage: new SageErpProvider(),
};

export function getErpProviderAdapter(slug: string): ErpProviderInterface {
  return erpProviderRegistry[slug] ?? new BaseErpProvider(slug || "other", "Other / Not listed");
}
