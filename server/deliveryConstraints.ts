import { and, eq } from "drizzle-orm";
import {
  deliverySchedules,
  restaurantAvailability,
  restaurantAvailabilityExceptions,
  supplierDeliveryZones,
  users,
} from "@shared/schema";
import { db } from "./db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export type DeliveryConstraintResult = {
  valid: boolean;
  code?: "invalid_date" | "invalid_time_zone" | "past_date" | "outside_zone" | "missing_postal_code" | "no_supplier_commitment" | "restaurant_closed" | "no_opening_hours" | "window_mismatch";
  message?: string;
  timeWindow?: { from: string; to: string };
  timeZone?: string;
};

function minutes(value: string): number | null {
  if (!TIME_RE.test(value)) return null;
  const [hours, mins] = value.split(":").map(Number);
  return hours <= 23 && mins <= 59 ? hours * 60 + mins : null;
}

export function isValidDeliveryDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

export function dateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function validateDeliveryPromise(
  supplierId: string,
  restaurantId: string,
  date: string,
): Promise<DeliveryConstraintResult> {
  if (!isValidDeliveryDate(date)) {
    return { valid: false, code: "invalid_date", message: "Das Lieferdatum ist ungültig." };
  }
  const [restaurant] = await db.select().from(users).where(eq(users.id, restaurantId)).limit(1);
  if (!restaurant || restaurant.role !== "restaurant") {
    return { valid: false, code: "no_opening_hours", message: "Der Betrieb ist nicht verfügbar." };
  }
  const timeZone = restaurant.timeZone || "Europe/Rome";
  if (!isValidTimeZone(timeZone)) {
    return { valid: false, code: "invalid_time_zone", message: "Für den Betrieb ist eine ungültige Zeitzone hinterlegt." };
  }
  if (date < dateInZone(new Date(), timeZone)) {
    return { valid: false, code: "past_date", message: "Ein Lieferdatum in der Vergangenheit ist nicht möglich.", timeZone };
  }

  const zones = await db.select().from(supplierDeliveryZones).where(
    and(eq(supplierDeliveryZones.supplierId, supplierId), eq(supplierDeliveryZones.isActive, true)),
  );
  if (zones.length > 0) {
    const postalCode = (restaurant.postalCode ?? "").replace(/\s/g, "").toUpperCase();
    if (!postalCode) {
      return { valid: false, code: "missing_postal_code", message: "Für den Betrieb fehlt eine Postleitzahl.", timeZone };
    }
    if (!zones.some((zone) => postalCode.startsWith(zone.postalCodePrefix.replace(/\s/g, "").toUpperCase()))) {
      return { valid: false, code: "outside_zone", message: "Die Lieferadresse liegt außerhalb des Liefergebiets.", timeZone };
    }
  }

  const schedules = (await db.select().from(deliverySchedules).where(and(
    eq(deliverySchedules.supplierId, supplierId),
    eq(deliverySchedules.restaurantId, restaurantId),
    eq(deliverySchedules.dayOfWeek, weekday(date)),
  ))).sort((a, b) => (a.deliveryTimeFrom ?? "99:99").localeCompare(b.deliveryTimeFrom ?? "99:99"));
  if (schedules.length === 0) {
    return { valid: false, code: "no_supplier_commitment", message: "Für diesen Tag gibt es keine bestätigte Lieferzusage.", timeZone };
  }

  const [exception] = await db.select().from(restaurantAvailabilityExceptions).where(and(
    eq(restaurantAvailabilityExceptions.restaurantId, restaurantId),
    eq(restaurantAvailabilityExceptions.date, date),
  )).limit(1);
  if (exception?.isClosed) {
    return { valid: false, code: "restaurant_closed", message: "Der Betrieb ist an diesem Tag geschlossen.", timeZone };
  }
  const openings = exception
    ? (exception.opensAt && exception.closesAt ? [{ opensAt: exception.opensAt, closesAt: exception.closesAt }] : [])
    : await db.select().from(restaurantAvailability).where(and(
      eq(restaurantAvailability.restaurantId, restaurantId),
      eq(restaurantAvailability.dayOfWeek, weekday(date)),
    ));
  if (openings.length === 0) {
    return { valid: false, code: "no_opening_hours", message: "Für diesen Tag sind keine Öffnungszeiten hinterlegt.", timeZone };
  }

  for (const schedule of schedules) {
    const from = schedule.deliveryTimeFrom ? minutes(schedule.deliveryTimeFrom) : null;
    const to = schedule.deliveryTimeTo ? minutes(schedule.deliveryTimeTo) : null;
    if (from === null || to === null || from >= to) continue;
    if (openings.some((opening) => {
      const openFrom = minutes(opening.opensAt);
      const openTo = minutes(opening.closesAt);
      return openFrom !== null && openTo !== null && openFrom <= from && to <= openTo;
    })) {
      return {
        valid: true,
        timeZone,
        timeWindow: { from: schedule.deliveryTimeFrom!, to: schedule.deliveryTimeTo! },
      };
    }
  }
  return {
    valid: false,
    code: "window_mismatch",
    message: "Das Lieferzeitfenster liegt nicht innerhalb der Öffnungszeiten des Betriebs.",
    timeZone,
  };
}

export async function getDeliveryCandidates(
  supplierId: string,
  restaurantId: string,
  days = 28,
): Promise<Array<{ date: string; timeWindow: { from: string; to: string }; timeZone: string }>> {
  const [restaurant] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, restaurantId)).limit(1);
  const timeZone = restaurant?.timeZone || "Europe/Rome";
  if (!isValidTimeZone(timeZone)) return [];
  const today = dateInZone(new Date(), timeZone);
  const start = new Date(`${today}T12:00:00.000Z`);
  const candidates: Array<{ date: string; timeWindow: { from: string; to: string }; timeZone: string }> = [];
  for (let offset = 1; offset <= days; offset += 1) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + offset);
    const date = d.toISOString().slice(0, 10);
    const result = await validateDeliveryPromise(supplierId, restaurantId, date);
    if (result.valid && result.timeWindow && result.timeZone) {
      candidates.push({ date, timeWindow: result.timeWindow, timeZone: result.timeZone });
    }
  }
  return candidates;
}