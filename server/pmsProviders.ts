// PMS (Property Management System) provider service layer.
//
// This is a future-proof abstraction so that real PMS integrations (ASA Hotel,
// Mews, Apaleo, Opera, Protel, Cloudbeds, ...) can be plugged in later without
// touching the cost-per-guest business logic. For now every vendor is a STUB:
// no real API calls, no credential exchange, no OAuth. Connection requests are
// recorded and handled manually by an admin.

export interface PmsConnectionContext {
  externalHotelId?: string | null;
}

export interface PmsGuestCount {
  date: string; // YYYY-MM-DD
  guestCount: number;
  externalRef?: string;
}

export interface PmsOccupancy {
  date: string; // YYYY-MM-DD
  roomsOccupied: number;
  roomsAvailable: number;
}

export interface PmsForecast {
  date: string; // YYYY-MM-DD
  expectedGuests: number;
}

export interface PmsSyncRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface PmsProviderInterface {
  readonly slug: string;
  readonly name: string;
  connect(ctx: PmsConnectionContext): Promise<{ ok: boolean; message?: string }>;
  disconnect(ctx: PmsConnectionContext): Promise<{ ok: boolean }>;
  syncGuests(ctx: PmsConnectionContext, range?: PmsSyncRange): Promise<PmsGuestCount[]>;
  syncOccupancy(ctx: PmsConnectionContext, range?: PmsSyncRange): Promise<PmsOccupancy[]>;
  syncForecast(ctx: PmsConnectionContext, range?: PmsSyncRange): Promise<PmsForecast[]>;
}

// Base stub: declares the contract but performs no real network I/O. Real
// adapters will override these methods with vendor-specific API calls.
class StubPmsProvider implements PmsProviderInterface {
  constructor(public readonly slug: string, public readonly name: string) {}

  async connect(): Promise<{ ok: boolean; message?: string }> {
    return {
      ok: false,
      message: `${this.name} is not yet connected automatically. Your request has been recorded and our team will set up the integration manually.`,
    };
  }

  async disconnect(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async syncGuests(): Promise<PmsGuestCount[]> {
    return [];
  }

  async syncOccupancy(): Promise<PmsOccupancy[]> {
    return [];
  }

  async syncForecast(): Promise<PmsForecast[]> {
    return [];
  }
}

class AsaPmsProvider extends StubPmsProvider { constructor() { super("asa", "ASA Hotel"); } }
class MewsPmsProvider extends StubPmsProvider { constructor() { super("mews", "Mews"); } }
class ApaleoPmsProvider extends StubPmsProvider { constructor() { super("apaleo", "Apaleo"); } }
class OperaPmsProvider extends StubPmsProvider { constructor() { super("opera", "Oracle Opera"); } }
class ProtelPmsProvider extends StubPmsProvider { constructor() { super("protel", "Protel"); } }
class CloudbedsPmsProvider extends StubPmsProvider { constructor() { super("cloudbeds", "Cloudbeds"); } }

export const pmsProviderRegistry: Record<string, PmsProviderInterface> = {
  asa: new AsaPmsProvider(),
  mews: new MewsPmsProvider(),
  apaleo: new ApaleoPmsProvider(),
  opera: new OperaPmsProvider(),
  protel: new ProtelPmsProvider(),
  cloudbeds: new CloudbedsPmsProvider(),
};

export function getPmsProviderAdapter(slug: string): PmsProviderInterface {
  return pmsProviderRegistry[slug] ?? new StubPmsProvider(slug || "other", "Other / Not listed");
}
