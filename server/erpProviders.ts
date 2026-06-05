// Supplier ERP (Enterprise Resource Planning) provider service layer.
//
// This is a future-proof abstraction so that real ERP stock integrations
// (SAP Business One, Microsoft Dynamics 365, Xentral, weclapp, ...) can be
// plugged in later without touching the inventory/stock business logic. For
// now every vendor is a STUB: no real API calls, no credential exchange, no
// file ingestion. Connection requests are recorded and handled manually by an
// admin who then sets up either (1) a direct open-API connection or (2) an
// Excel-via-email-inbox import.

export interface ErpConnectionContext {
  externalSupplierId?: string | null;
}

export interface ErpProviderInterface {
  readonly slug: string;
  readonly name: string;
  connect(ctx: ErpConnectionContext): Promise<{ ok: boolean; message?: string }>;
  disconnect(ctx: ErpConnectionContext): Promise<{ ok: boolean }>;
}

// Base stub: declares the contract but performs no real network I/O. Real
// adapters will override these methods with vendor-specific API calls.
class StubErpProvider implements ErpProviderInterface {
  constructor(public readonly slug: string, public readonly name: string) {}

  async connect(): Promise<{ ok: boolean; message?: string }> {
    return {
      ok: false,
      message: `${this.name} is not yet connected automatically. Your request has been recorded and our team will set up the stock sync manually.`,
    };
  }

  async disconnect(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

class SapErpProvider extends StubErpProvider { constructor() { super("sap-b1", "SAP Business One"); } }
class DynamicsErpProvider extends StubErpProvider { constructor() { super("dynamics365", "Microsoft Dynamics 365"); } }
class XentralErpProvider extends StubErpProvider { constructor() { super("xentral", "Xentral"); } }
class WeclappErpProvider extends StubErpProvider { constructor() { super("weclapp", "weclapp"); } }
class LexwareErpProvider extends StubErpProvider { constructor() { super("lexware", "Lexware"); } }
class DatevErpProvider extends StubErpProvider { constructor() { super("datev", "DATEV"); } }
class SageErpProvider extends StubErpProvider { constructor() { super("sage", "Sage"); } }

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
  return erpProviderRegistry[slug] ?? new StubErpProvider(slug || "other", "Other / Not listed");
}
