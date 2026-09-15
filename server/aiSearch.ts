import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import {
  orders, orderItems, users, formatOrderNumber,
  aiChats, aiChatMessages,
  complaints, conversations, messages, promotions, products,
  deliverySchedules, inventoryRiskRecords, overnightStays, costSettings,
} from "@shared/schema";
import { and, eq, desc, ilike, or, inArray, ne, gte, lte, sql } from "drizzle-orm";
import { foldedIlike } from "./searchSql";
import { foldSearchText } from "@shared/searchText";
import { storage } from "./storage";
import { retrieveKnowledge, knowledgePromptBlock, learnFromExchange, penalizeKnowledge } from "./aiKnowledge";

type Role = "restaurant" | "supplier";

/**
 * Returns an inclusive [fromDate, toDate|null] pair for a named period.
 * toDate is null for rolling windows (30d, 90d, this_month) — the query
 * uses "up to now" as its natural upper bound.
 * For last_month it is the final millisecond of that calendar month so
 * the query does NOT accidentally include current-month orders.
 * Exported for unit testing.
 */
export function periodBounds(period: string, now: Date): { fromDate: Date; toDate: Date | null } {
  if (period === "this_month") {
    return { fromDate: new Date(now.getFullYear(), now.getMonth(), 1), toDate: null };
  }
  if (period === "last_month") {
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // new Date(y, m, 0) = last day of month m-1; set time to end-of-day.
    const toDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { fromDate, toDate };
  }
  if (period === "90d") return { fromDate: new Date(Date.now() - 90 * 86400000), toDate: null };
  return { fromDate: new Date(Date.now() - 30 * 86400000), toDate: null };
}

/**
 * Returns the comparison (prior) window for a named period — always a
 * closed [fromDate, toDate] interval so the query never bleeds into the
 * current period.  Used by get_revenue_by_customer to compute trend data.
 *
 * Mapping:
 *   this_month → the previous calendar month
 *   last_month  → two calendar months ago
 *   30d         → days 31–60 before now
 *   90d         → days 91–180 before now
 *
 * Exported for unit testing.
 */
export function priorPeriodBounds(period: string, now: Date): { fromDate: Date; toDate: Date } {
  if (period === "this_month") {
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const toDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { fromDate, toDate };
  }
  if (period === "last_month") {
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const toDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
    return { fromDate, toDate };
  }
  if (period === "90d") {
    return {
      fromDate: new Date(now.getTime() - 180 * 86400000),
      toDate: new Date(now.getTime() - 90 * 86400000),
    };
  }
  // 30d (default)
  return {
    fromDate: new Date(now.getTime() - 60 * 86400000),
    toDate: new Date(now.getTime() - 30 * 86400000),
  };
}

interface AiActionRaw {
  kind: "open_inbox" | "open_order" | "open_page";
  orderId?: string;
  path?: string;
  suggestedMessage?: string;
  label?: string;
}

interface AiAction {
  kind: "open_inbox" | "open_order" | "open_page";
  label: string;
  href: string;
  orderId?: string;
  orderNumber?: string;
  partnerId?: string;
  suggestedMessage?: string;
}

// ── In-app help knowledge base ────────────────────────────────────────────────
// Lets the assistant answer "how do I ...?" questions about the app itself with
// concrete steps and a deep link. Content is German; the model translates when
// the user writes Italian. Every pagePath here is also the open_page allowlist.
interface HelpTopic {
  key: string;
  keywords: string[];
  title: string;
  steps: string[];
  pagePath: string;
}

const RESTAURANT_HELP: HelpTopic[] = [
  {
    key: "order_place",
    keywords: ["bestellen", "bestellung aufgeben", "order", "warenkorb", "kaufen", "ordinare", "carrello", "einkauf"],
    title: "Eine Bestellung aufgeben",
    steps: [
      "Öffne den Katalog und lege Produkte mit dem Plus-Button in den Warenkorb.",
      "Öffne den Warenkorb — dort wählst du pro Lieferant ein verfügbares Lieferdatum (abhängig von dessen Liefertagen) und kannst je Lieferant eine Notiz hinterlegen.",
      "Achte auf Mindestbestellwert-Hinweise; dann 'Bestellen' tippen. Jeder Lieferant erhält eine eigene Bestellung.",
    ],
    pagePath: "/restaurant/catalog",
  },
  {
    key: "order_edit_cancel",
    keywords: ["bestellung ändern", "bestellung bearbeiten", "stornieren", "ändern", "cancel", "modificare", "annullare", "menge ändern"],
    title: "Bestellung ändern oder stornieren",
    steps: [
      "Öffne 'Bestellungen'. Ausstehende (noch nicht bestätigte) Bestellungen kannst du direkt bearbeiten oder stornieren — auch die Mengen direkt auf der Karte antippen.",
      "Bei bereits bestätigten Bestellungen sendest du einen Änderungsantrag, den der Lieferant annehmen oder ablehnen kann.",
      "Alle Änderungen werden automatisch im Chat mit dem Lieferanten protokolliert.",
    ],
    pagePath: "/restaurant/orders",
  },
  {
    key: "complaint_create",
    keywords: ["reklamation", "reklamieren", "beschwerde", "complaint", "reclamo", "falsche lieferung", "kaputt", "mangel"],
    title: "Eine Reklamation erstellen",
    steps: [
      "Öffne 'Reklamationen' und tippe auf 'Neue Reklamation'.",
      "Wähle die betroffene Bestellung und markiere die betroffenen Produkte.",
      "Bei ausgewählten Produkten wird automatisch eine Nachlieferungs-Anfrage mit hoher Priorität an den Lieferanten gesendet; den Status verfolgst du in der Reklamations-Detailansicht.",
    ],
    pagePath: "/restaurant/complaints",
  },
  {
    key: "templates",
    keywords: ["vorlage", "template", "wiederkehrend", "schnellbestellung", "modello", "immer gleiche bestellung"],
    title: "Bestellvorlagen nutzen",
    steps: [
      "Unter 'Vorlagen' erstellst du wiederverwendbare Bestelllisten — neu oder aus einer bestehenden Bestellung.",
      "Mit einem Tipp legst du die ganze Vorlage in den Warenkorb.",
      "Bis zu 3 Vorlagen erscheinen als Schnellaktion auf der Startseite.",
    ],
    pagePath: "/restaurant/templates",
  },
  {
    key: "cost_analysis",
    keywords: ["kostenanalyse", "wareneinsatz", "food cost", "kosten pro gast", "nächtigungen", "costi", "budget"],
    title: "Kostenanalyse (Wareneinsatz pro Gast)",
    steps: [
      "Unter 'Kostenanalyse' siehst du deinen monatlichen Wareneinsatz pro Gast mit Zielwerten und Trend.",
      "Trage täglich die Nächtigungen ein (auch manuell nachtragbar), damit die Kennzahl stimmt.",
      "Zielwerte kannst du in den Einstellungen der Seite anpassen.",
    ],
    pagePath: "/restaurant/cost-analysis",
  },
  {
    key: "price_comparison",
    keywords: ["preisvergleich", "preise vergleichen", "günstiger", "billiger", "confronto prezzi", "sparen"],
    title: "Preise zwischen Lieferanten vergleichen",
    steps: [
      "Der 'Preisvergleich' gruppiert gleiche Produkte über alle Lieferanten hinweg.",
      "Du siehst Preisunterschiede in Prozent, Aktions-Badges und kannst nach Ersparnis sortieren.",
    ],
    pagePath: "/restaurant/price-comparison",
  },
  {
    key: "documents",
    keywords: ["lieferschein", "rechnung", "dokument", "pdf", "bolla", "fattura", "beleg", "export"],
    title: "Lieferscheine & Rechnungen finden",
    steps: [
      "Unter 'Dokumente' sind alle Lieferscheine und Rechnungen nach Lieferant gruppiert.",
      "Pro Lieferant siehst du eine Statistik-Karte; Monatsrechnungen lassen sich als PDF erzeugen.",
      "Bestelllisten kannst du auf der Bestellungen-Seite als CSV oder PDF exportieren.",
    ],
    pagePath: "/restaurant/documents",
  },
  {
    key: "messages",
    keywords: ["nachricht", "chat", "schreiben", "kontaktieren", "messaggio", "inbox", "posteingang"],
    title: "Mit Lieferanten chatten",
    steps: [
      "Im 'Posteingang' chattest du direkt mit jedem Lieferanten (wie WhatsApp).",
      "Wichtige Nachrichten kannst du als 'Wichtig' markieren — sie werden rot hervorgehoben.",
      "Bestellungen lassen sich direkt aus dem Chat heraus bearbeiten (Inline-Aktionen).",
    ],
    pagePath: "/restaurant/inbox",
  },
  {
    key: "team",
    keywords: ["team", "mitarbeiter", "benutzer", "einladen", "rolle", "invitare", "kollege"],
    title: "Teammitglieder verwalten",
    steps: [
      "Unter 'Team' lädst du Mitarbeiter per E-Mail ein (Rollen: Admin, Manager, Mitarbeiter).",
      "Eingeladene erhalten einen Link, um ihr Passwort zu setzen.",
    ],
    pagePath: "/restaurant/team",
  },
  {
    key: "settings",
    keywords: ["einstellungen", "benachrichtigung", "push", "profil", "passwort", "impostazioni", "notifiche", "sprache"],
    title: "Einstellungen & Benachrichtigungen",
    steps: [
      "Unter 'Einstellungen' aktivierst du Push-Benachrichtigungen, änderst Profil und Passwort.",
      "Auf dem Handy: App zum Startbildschirm hinzufügen, damit Push-Nachrichten ankommen.",
    ],
    pagePath: "/restaurant/settings",
  },
  {
    key: "calendar",
    keywords: ["kalender", "lieferkalender", "calendario", "übersicht lieferungen"],
    title: "Lieferkalender",
    steps: ["Der 'Kalender' zeigt alle geplanten Lieferungen im Monatsüberblick."],
    pagePath: "/restaurant/calendar",
  },
];

const SUPPLIER_HELP: HelpTopic[] = [
  {
    key: "orders_manage",
    keywords: ["bestellung bestätigen", "bestellung", "liefern", "stornieren", "teilbestätigung", "confermare", "ordine", "auftrag"],
    title: "Bestellungen bearbeiten",
    steps: [
      "Unter 'Bestellungen' bestätigst du eingehende Bestellungen — auch teilweise mit angepassten Mengen (Teilbestätigung); der Kunde sieht die Änderungen automatisch im Chat.",
      "Setze den Status auf 'In Lieferung' und 'Geliefert'; beim Liefern wird automatisch ein Lieferschein-PDF erzeugt.",
      "Stornieren ist nur möglich, solange die Bestellung noch nicht in Lieferung ist.",
    ],
    pagePath: "/supplier/orders",
  },
  {
    key: "products",
    keywords: ["produkt", "katalog", "preis", "artikel", "mindestbestellmenge", "moq", "prodotti", "sortiment"],
    title: "Produkte & Preise verwalten",
    steps: [
      "Unter 'Katalog' legst du Produkte an, pflegst Preise, Einheiten und Mindestbestellmengen.",
      "Kundenspezifische Preise und Mindestbestellmengen sind pro Restaurant möglich.",
      "Mindestbestellwerte (gesamt oder je Zone) definierst du in den Einstellungen.",
    ],
    pagePath: "/supplier/products",
  },
  {
    key: "inventory",
    keywords: ["lager", "bestand", "inventur", "stock", "magazzino", "nachbestellen", "bestandsbewegung"],
    title: "Lagerbestand verwalten",
    steps: [
      "Unter 'Bestand' siehst du Lagerbestände und Warnschwellen; niedrige Bestände werden hervorgehoben.",
      "Bestände passen sich bei Bestätigung/Stornierung von Bestellungen automatisch an; manuelle Korrekturen werden protokolliert.",
    ],
    pagePath: "/supplier/inventory",
  },
  {
    key: "inventory_risk",
    keywords: ["risiko", "risiko melden", "ablaufdatum", "mhd", "abschreiben", "risikomeldung", "ware schlecht"],
    title: "Risiko-Ware melden & verwerten",
    steps: [
      "Unter 'Risiko-Bestand' melden Lagermitarbeiter gefährdete Ware per Schritt-für-Schritt-Assistent (Foto, Produkt, Grund, Menge).",
      "Manager können eine Meldung direkt in eine Aktion (Rabatt) umwandeln, um die Ware noch zu verkaufen.",
    ],
    pagePath: "/supplier/inventory-risk",
  },
  {
    key: "promotions",
    keywords: ["aktion", "rabatt", "promotion", "angebot", "sconto", "promozione"],
    title: "Aktionen (Rabatte) erstellen",
    steps: [
      "Unter 'Aktionen' erstellst du zeitlich begrenzte Rabatte auf Produkte.",
      "Kunden sehen die Aktion hervorgehoben im Katalog mit durchgestrichenem Originalpreis.",
    ],
    pagePath: "/supplier/promotions",
  },
  {
    key: "delivery_days",
    keywords: ["liefertage", "lieferzeiten", "lieferplan", "zeitfenster", "giorni di consegna", "wann liefern"],
    title: "Liefertage pro Kunde festlegen",
    steps: [
      "Unter 'Kunden' legst du pro Restaurant die Liefertage und optionale Zeitfenster fest.",
      "Kunden können beim Bestellen nur diese Tage als Lieferdatum wählen.",
    ],
    pagePath: "/supplier/restaurants",
  },
  {
    key: "drivers",
    keywords: ["fahrer", "tour", "auslieferung", "tracking", "route", "autista", "lieferung zuweisen"],
    title: "Fahrer & Touren verwalten",
    steps: [
      "Unter 'Fahrer' weist du Bestellungen einem Fahrer zu und legst die Stopp-Reihenfolge fest.",
      "Fahrer nutzen die Fahrer-Ansicht am Handy; ihre Position und ETA siehst du live auf der Karte.",
      "Im Team-Chat erreichst du deine Fahrer direkt.",
    ],
    pagePath: "/supplier/drivers",
  },
  {
    key: "complaints",
    keywords: ["reklamation", "beschwerde", "nachlieferung", "reclamo", "kunde unzufrieden"],
    title: "Reklamationen & Nachlieferungen",
    steps: [
      "Unter 'Reklamationen' siehst du alle Kundenbeschwerden mit betroffenen Produkten.",
      "Aus der Detailansicht erstellst du direkt eine Nachlieferung — Mengen anpassbar (z.B. Kulanz-Zugabe), Lieferdatum wählbar.",
      "Die Nachlieferung wird automatisch bestätigt und im Chat dokumentiert.",
    ],
    pagePath: "/supplier/complaints",
  },
  {
    key: "documents",
    keywords: ["lieferschein", "rechnung", "dokument", "pdf", "bolla", "fattura", "export"],
    title: "Lieferscheine & Dokumente",
    steps: [
      "Lieferscheine werden beim Liefern automatisch erzeugt und unter 'Dokumente' abgelegt.",
      "Bestelllisten kannst du auf der Bestellungen-Seite als CSV oder PDF exportieren.",
    ],
    pagePath: "/supplier/documents",
  },
  {
    key: "messages",
    keywords: ["nachricht", "chat", "schreiben", "kontaktieren", "messaggio", "inbox", "posteingang"],
    title: "Mit Kunden chatten",
    steps: [
      "Im 'Posteingang' chattest du direkt mit jedem Kunden.",
      "Bestellungen lassen sich direkt aus dem Chat bestätigen, liefern oder stornieren (Inline-Aktionen).",
    ],
    pagePath: "/supplier/inbox",
  },
  {
    key: "team",
    keywords: ["team", "mitarbeiter", "benutzer", "einladen", "rolle", "vertreter", "lagermitarbeiter", "fahrer anlegen"],
    title: "Teammitglieder verwalten",
    steps: [
      "Unter 'Team' lädst du Mitarbeiter ein (Rollen: Admin, Manager, Mitarbeiter, Vertreter, Lager, Fahrer).",
      "Lager-Mitarbeiter sehen nur Bestand & Risiko-Meldungen, Fahrer nur ihre Touren.",
    ],
    pagePath: "/supplier/team",
  },
  {
    key: "settings",
    keywords: ["einstellungen", "benachrichtigung", "push", "profil", "passwort", "mindestbestellwert", "impostazioni"],
    title: "Einstellungen & Benachrichtigungen",
    steps: [
      "Unter 'Einstellungen' aktivierst du Push-Benachrichtigungen, änderst Profil, Passwort und Mindestbestellwerte.",
    ],
    pagePath: "/supplier/settings",
  },
];

// open_page allowlist: every help pagePath plus a few safe extras.
const ALLOWED_PAGES: Record<Role, Set<string>> = {
  restaurant: new Set([
    ...RESTAURANT_HELP.map((t) => t.pagePath),
    "/restaurant", "/restaurant/cart", "/restaurant/suppliers", "/restaurant/monthly-reports",
  ]),
  supplier: new Set([
    ...SUPPLIER_HELP.map((t) => t.pagePath),
    "/supplier", "/supplier/restaurants", "/supplier/calendar", "/supplier/team-chat",
  ]),
};

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function likePattern(raw: string): string {
  const safe = String(raw || "").replace(/[\\%_]/g, (m) => "\\" + m);
  return `%${safe}%`;
}

// Read-only, role-scoped data lookups the model can call. Every query is filtered
// by the trusted userId/role so the assistant can never read another tenant's data.
function buildTools(userId: string, role: Role) {
  const ownOrderCol = role === "restaurant" ? orders.restaurantId : orders.supplierId;
  const partnerCol = role === "restaurant" ? orders.supplierId : orders.restaurantId;
  const partnerRoleLabel = role === "restaurant" ? "supplier" : "customer";



  async function find_recent_order_with_product(args: { productName?: string }) {
    const name = String(args?.productName || "").trim();
    if (!name) return { error: "productName is required" };
    const rows = await db
      .selectDistinct({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        lineTotal: orderItems.totalPrice,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(eq(ownOrderCol, userId), foldedIlike(orderItems.productName, name)))
      .orderBy(desc(orders.createdAt))
      .limit(5);
    return {
      matches: rows.map((r) => ({
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: r.requestedDeliveryDate || null,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
        product: { name: r.productName, quantity: r.quantity, unitPrice: r.unitPrice, lineTotal: r.lineTotal },
      })),
    };
  }

  async function find_orders_by_partner(args: { partnerName?: string; status?: string }) {
    const name = String(args?.partnerName || "").trim();
    if (!name) return { error: "partnerName is required" };
    const conds = [
      eq(ownOrderCol, userId),
      or(foldedIlike(users.companyName, name), foldedIlike(users.name, name)),
    ];
    const status = String(args?.status || "").trim();
    const validStatuses = ["pending", "confirmed", "scheduled", "in_delivery", "delivered", "cancelled", "not_deliverable"];
    if (status && validStatuses.includes(status)) conds.push(eq(orders.status, status as any));
    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(...conds))
      .orderBy(desc(orders.createdAt))
      .limit(10);
    return {
      orders: rows.map((r) => ({
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: r.requestedDeliveryDate || null,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
      })),
    };
  }

  async function get_order_status(args: { orderNumber?: string }) {
    const q = String(args?.orderNumber || "").trim();
    if (!q) return { error: "orderNumber is required" };
    const digits = q.replace(/[^0-9a-zA-Z]/g, "");
    const conds = [eq(ownOrderCol, userId)];
    const orFilters = [ilike(orders.orderNumber, likePattern(q))];
    if (digits) orFilters.push(ilike(orders.orderNumber, likePattern(digits)));
    orFilters.push(eq(orders.id, q));
    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        originalDeliveryDate: orders.originalDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(conds[0], or(...orFilters)))
      .orderBy(desc(orders.createdAt))
      .limit(5);
    return {
      matches: rows.map((r) => ({
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: r.requestedDeliveryDate || null,
        originalDeliveryDate: r.originalDeliveryDate || null,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
      })),
    };
  }

  // List the user's active (committed) deliveries and flag which are overdue. This
  // answers questions like "is there an overdue delivery?", "what is being delivered
  // this week?" or "are any orders late?" WITHOUT needing a partner or order number.
  async function list_deliveries(args: { onlyOverdue?: boolean }) {
    const onlyOverdue = !!args?.onlyOverdue;
    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        originalDeliveryDate: orders.originalDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(
        and(
          eq(ownOrderCol, userId),
          inArray(orders.status, ["confirmed", "scheduled", "in_delivery"] as any),
        ),
      )
      .orderBy(orders.requestedDeliveryDate);

    // Delivery dates are stored as "YYYY-MM-DD" strings, so lexical comparison
    // against today is correct. A delivery is overdue when its date is in the past.
    // Use the LOCAL date (not UTC) to match the home page's overdue logic, which
    // compares against local midnight — otherwise deliveries can be mis-flagged by a
    // day around midnight in non-UTC timezones (the app runs in CET/CEST).
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const overdue: any[] = [];
    const upcoming: any[] = [];
    for (const r of rows) {
      const dd = r.requestedDeliveryDate || null;
      if (!dd) continue;
      const item = {
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: dd,
        originalDeliveryDate: r.originalDeliveryDate || null,
        wasRescheduled: !!r.originalDeliveryDate,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
      };
      if (dd < today) overdue.push({ ...item, daysOverdue: Math.round((Date.parse(today) - Date.parse(dd)) / 86400000) });
      else upcoming.push(item);
    }

    return {
      today,
      overdueCount: overdue.length,
      overdue,
      ...(onlyOverdue ? {} : { upcomingCount: upcoming.length, upcoming: upcoming.slice(0, 10) }),
    };
  }

  // ── New tools ──────────────────────────────────────────────────────────────

  async function list_complaints(args: { status?: string }) {
    const ownCol = role === "restaurant" ? complaints.restaurantId : complaints.supplierId;
    const partnerCol = role === "restaurant" ? complaints.supplierId : complaints.restaurantId;
    const validStatuses = ["open", "in_progress", "resolved", "closed", "rejected"];
    const status = String(args?.status || "").trim();
    const conds: any[] = [eq(ownCol, userId)];
    if (status && validStatuses.includes(status)) conds.push(eq(complaints.status, status as any));
    const rows = await db
      .select({
        complaintId: complaints.id,
        complaintNumber: complaints.complaintNumber,
        title: complaints.title,
        status: complaints.status,
        priority: complaints.priority,
        reason: complaints.reason,
        createdAt: complaints.createdAt,
        updatedAt: complaints.updatedAt,
        orderId: complaints.orderId,
        partnerName: users.companyName,
        partnerId: users.id,
      })
      .from(complaints)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(...conds))
      .orderBy(desc(complaints.updatedAt))
      .limit(10);
    return {
      total: rows.length,
      complaints: rows.map((r) => ({
        complaintId: r.complaintId,
        complaintNumber: r.complaintNumber || r.complaintId.slice(0, 8),
        title: r.title,
        status: r.status,
        priority: r.priority,
        reason: r.reason || null,
        createdAt: fmtDate(r.createdAt),
        updatedAt: fmtDate(r.updatedAt),
        orderId: r.orderId,
        [`${role === "restaurant" ? "supplier" : "restaurant"}Name`]: r.partnerName,
        [`${role === "restaurant" ? "supplier" : "restaurant"}Id`]: r.partnerId,
      })),
    };
  }

  async function get_spending_summary(args: { period?: string }) {
    if (role !== "restaurant") return { error: "only_for_restaurants" };
    const period = String(args?.period || "30d").trim();
    const now = new Date();
    const { fromDate, toDate } = periodBounds(period, now);
    const dateConds: any[] = [gte(orders.createdAt, fromDate)];
    if (toDate) dateConds.push(lte(orders.createdAt, toDate));
    const rows = await db
      .select({
        totalAmount: orders.totalAmount,
        supplierId: orders.supplierId,
        supplierName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.supplierId))
      .where(
        and(
          eq(orders.restaurantId, userId),
          eq(orders.status, "delivered" as any),
          ...dateConds,
        ),
      );
    const total = rows.reduce((s, r) => s + parseFloat(r.totalAmount || "0"), 0);
    const bySupplier: Record<string, { name: string; amount: number; count: number }> = {};
    for (const r of rows) {
      if (!bySupplier[r.supplierId]) bySupplier[r.supplierId] = { name: r.supplierName || "", amount: 0, count: 0 };
      bySupplier[r.supplierId].amount += parseFloat(r.totalAmount || "0");
      bySupplier[r.supplierId].count++;
    }
    return {
      period,
      from: fromDate.toISOString().slice(0, 10),
      to: (toDate ?? now).toISOString().slice(0, 10),
      totalAmount: Math.round(total * 100) / 100,
      orderCount: rows.length,
      bySupplier: Object.entries(bySupplier)
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 8)
        .map(([id, v]) => ({ supplierId: id, supplierName: v.name, amount: Math.round(v.amount * 100) / 100, orderCount: v.count })),
    };
  }

  async function get_unread_messages(_args: any) {
    const ownConvCol = role === "restaurant" ? conversations.restaurantId : conversations.supplierId;
    const partnerConvCol = role === "restaurant" ? conversations.supplierId : conversations.restaurantId;
    const convRows = await db
      .select({ convId: conversations.id, partnerId: partnerConvCol, partnerName: users.companyName, lastMessageAt: conversations.lastMessageAt })
      .from(conversations)
      .innerJoin(users, eq(users.id, partnerConvCol))
      .where(eq(ownConvCol, userId));
    if (convRows.length === 0) return { totalUnread: 0, conversations: [] };
    const convIds = convRows.map((c) => c.convId);
    const unreadRows = await db
      .select({ conversationId: messages.conversationId, msgId: messages.id })
      .from(messages)
      .where(and(inArray(messages.conversationId, convIds), eq(messages.isRead, false), ne(messages.senderId, userId)));
    const countByConv: Record<string, number> = {};
    for (const m of unreadRows) countByConv[m.conversationId] = (countByConv[m.conversationId] || 0) + 1;
    const totalUnread = unreadRows.length;
    const withUnread = convRows
      .map((c) => ({ ...c, unreadCount: countByConv[c.convId] || 0 }))
      .filter((c) => c.unreadCount > 0)
      .sort((a, b) => b.unreadCount - a.unreadCount)
      .slice(0, 8);
    return {
      totalUnread,
      conversations: withUnread.map((c) => ({
        conversationId: c.convId,
        [`${role === "restaurant" ? "supplier" : "restaurant"}Name`]: c.partnerName,
        [`${role === "restaurant" ? "supplier" : "restaurant"}Id`]: c.partnerId,
        unreadCount: c.unreadCount,
        lastMessageAt: c.lastMessageAt ? fmtDate(c.lastMessageAt) : null,
      })),
    };
  }

  async function get_promotions(_args: any) {
    const now = new Date();
    if (role === "supplier") {
      const rows = await db
        .select({ promoId: promotions.id, discountPercent: promotions.discountPercent, endDate: promotions.endDate, startDate: promotions.startDate, name: promotions.name, productName: products.name, unit: products.unit, price: products.price })
        .from(promotions)
        .innerJoin(products, eq(products.id, promotions.productId))
        .where(and(eq(promotions.supplierId, userId), eq(promotions.isActive, true), gte(promotions.endDate, now)))
        .orderBy(promotions.endDate)
        .limit(10);
      return {
        count: rows.length,
        promotions: rows.map((r) => ({
          promoId: r.promoId,
          name: r.name || r.productName,
          productName: r.productName,
          unit: r.unit,
          basePrice: r.price,
          discountPercent: r.discountPercent,
          discountedPrice: Math.round(parseFloat(r.price) * (1 - r.discountPercent / 100) * 100) / 100,
          startDate: fmtDate(r.startDate),
          endDate: fmtDate(r.endDate),
        })),
      };
    } else {
      // Restaurant: show active promos from suppliers they've ordered from in the last 6 months
      const since = new Date(Date.now() - 180 * 86400000);
      const supplierIds = await db
        .selectDistinct({ supplierId: orders.supplierId })
        .from(orders)
        .where(and(eq(orders.restaurantId, userId), gte(orders.createdAt, since)));
      if (supplierIds.length === 0) return { count: 0, promotions: [] };
      const sIds = supplierIds.map((r) => r.supplierId);
      const rows = await db
        .select({ promoId: promotions.id, supplierId: promotions.supplierId, supplierName: users.companyName, discountPercent: promotions.discountPercent, endDate: promotions.endDate, name: promotions.name, productName: products.name, unit: products.unit, price: products.price })
        .from(promotions)
        .innerJoin(products, eq(products.id, promotions.productId))
        .innerJoin(users, eq(users.id, promotions.supplierId))
        .where(and(inArray(promotions.supplierId, sIds), eq(promotions.isActive, true), gte(promotions.endDate, now)))
        .orderBy(desc(promotions.discountPercent))
        .limit(15);
      return {
        count: rows.length,
        promotions: rows.map((r) => ({
          promoId: r.promoId,
          name: r.name || r.productName,
          productName: r.productName,
          supplierName: r.supplierName,
          unit: r.unit,
          basePrice: r.price,
          discountPercent: r.discountPercent,
          discountedPrice: Math.round(parseFloat(r.price) * (1 - r.discountPercent / 100) * 100) / 100,
          endDate: fmtDate(r.endDate),
        })),
      };
    }
  }

  async function get_low_stock(_args: any) {
    if (role !== "supplier") return { error: "only_for_suppliers" };
    const rows = await db
      .select({ productId: products.id, name: products.name, unit: products.unit, stockQuantity: products.stockQuantity, lowStockThreshold: products.lowStockThreshold, inStock: products.inStock, category: products.category })
      .from(products)
      .where(
        and(
          eq(products.supplierId, userId),
          eq(products.discontinued, false),
          sql`${products.lowStockThreshold} > 0`,
          sql`${products.stockQuantity} <= ${products.lowStockThreshold}`,
        ),
      )
      .orderBy(products.stockQuantity)
      .limit(15);
    return {
      count: rows.length,
      lowStockProducts: rows.map((r) => ({
        productId: r.productId,
        name: r.name,
        unit: r.unit,
        stockQuantity: r.stockQuantity ?? 0,
        lowStockThreshold: r.lowStockThreshold ?? 0,
        inStock: r.inStock,
        category: r.category || null,
      })),
    };
  }

  async function search_products(args: { query?: string; category?: string }) {
    const query = String(args?.query || "").trim();
    const category = String(args?.category || "").trim();
    if (!query && !category) return { error: "query_or_category_required" };
    const conds: any[] = [eq(products.discontinued, false)];
    if (role === "supplier") {
      conds.push(eq(products.supplierId, userId));
    }
    if (query) conds.push(foldedIlike(products.name, query));
    if (category) conds.push(foldedIlike(products.category, category));
    const rows = await db
      .select({ productId: products.id, name: products.name, unit: products.unit, price: products.price, category: products.category, inStock: products.inStock, stockQuantity: products.stockQuantity, supplierId: products.supplierId, supplierName: users.companyName })
      .from(products)
      .innerJoin(users, eq(users.id, products.supplierId))
      .where(and(...conds))
      .orderBy(products.name)
      .limit(10);
    return {
      count: rows.length,
      products: rows.map((r) => ({
        productId: r.productId,
        name: r.name,
        unit: r.unit,
        price: r.price,
        category: r.category || null,
        inStock: r.inStock,
        ...(role === "supplier" ? { stockQuantity: r.stockQuantity ?? 0 } : { supplierName: r.supplierName, supplierId: r.supplierId }),
      })),
    };
  }

  // List recent orders WITHOUT requiring a partner name — fills the gap for
  // "which orders are still open?", "what did I order recently?", "show my
  // pending orders" etc.
  async function list_orders(args: { status?: string; limit?: number }) {
    const validStatuses = ["pending", "confirmed", "scheduled", "in_delivery", "delivered", "cancelled", "not_deliverable"];
    const status = String(args?.status || "").trim();
    const limit = Math.min(Math.max(Number(args?.limit) || 10, 1), 15);
    const conds = [eq(ownOrderCol, userId)];
    if (status && validStatuses.includes(status)) conds.push(eq(orders.status, status as any));
    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(...conds))
      .orderBy(desc(orders.createdAt))
      .limit(limit);
    return {
      count: rows.length,
      orders: rows.map((r) => ({
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: r.requestedDeliveryDate || null,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
      })),
    };
  }

  // Full line items of one order — "what was in my last order from X?",
  // "how much did the tomatoes cost in order #123?".
  async function get_order_details(args: { orderId?: string; orderNumber?: string }) {
    const idArg = String(args?.orderId || "").trim();
    const numArg = String(args?.orderNumber || "").trim();
    if (!idArg && !numArg) return { error: "orderId_or_orderNumber_required" };
    const conds = [eq(ownOrderCol, userId)];
    const orFilters: any[] = [];
    if (idArg) orFilters.push(eq(orders.id, idArg));
    if (numArg) {
      const digits = numArg.replace(/[^0-9a-zA-Z]/g, "");
      orFilters.push(ilike(orders.orderNumber, likePattern(numArg)));
      if (digits) orFilters.push(ilike(orders.orderNumber, likePattern(digits)));
    }
    const [order] = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        totalAmount: orders.totalAmount,
        notes: orders.notes,
        partnerId: users.id,
        partnerName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(conds[0], or(...orFilters)))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    if (!order) return { error: "order_not_found" };
    const items = await db
      .select({
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        confirmedQuantity: orderItems.confirmedQuantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.orderId));
    return {
      orderId: order.orderId,
      orderNumber: formatOrderNumber({ orderNumber: order.orderNumber, id: order.orderId }),
      status: order.status,
      orderDate: fmtDate(order.createdAt),
      deliveryDate: order.requestedDeliveryDate || null,
      orderTotal: order.totalAmount,
      notes: order.notes || null,
      [`${partnerRoleLabel}Id`]: order.partnerId,
      [`${partnerRoleLabel}Name`]: order.partnerName,
      items: items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        confirmedQuantity: i.confirmedQuantity,
        unitPrice: i.unitPrice,
        lineTotal: i.totalPrice,
      })),
    };
  }

  // Delivery weekdays (and time windows) configured between the user and their
  // partners — "when does X deliver?", "which days can I get deliveries?".
  async function get_delivery_schedule(args: { partnerName?: string }) {
    const ownCol = role === "restaurant" ? deliverySchedules.restaurantId : deliverySchedules.supplierId;
    const partnerSchedCol = role === "restaurant" ? deliverySchedules.supplierId : deliverySchedules.restaurantId;
    const conds: any[] = [eq(ownCol, userId)];
    const name = String(args?.partnerName || "").trim();
    if (name) conds.push(or(foldedIlike(users.companyName, name), foldedIlike(users.name, name)));
    const rows = await db
      .select({
        partnerId: users.id,
        partnerName: users.companyName,
        dayOfWeek: deliverySchedules.dayOfWeek,
        from: deliverySchedules.deliveryTimeFrom,
        to: deliverySchedules.deliveryTimeTo,
      })
      .from(deliverySchedules)
      .innerJoin(users, eq(users.id, partnerSchedCol))
      .where(and(...conds))
      .orderBy(users.companyName, deliverySchedules.dayOfWeek)
      .limit(60);
    const dayNames = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const byPartner: Record<string, { name: string; days: { day: string; timeWindow: string | null }[] }> = {};
    for (const r of rows) {
      if (!byPartner[r.partnerId]) byPartner[r.partnerId] = { name: r.partnerName || "", days: [] };
      byPartner[r.partnerId].days.push({
        day: dayNames[r.dayOfWeek] ?? String(r.dayOfWeek),
        timeWindow: r.from && r.to ? `${r.from}–${r.to}` : null,
      });
    }
    return {
      count: Object.keys(byPartner).length,
      schedules: Object.entries(byPartner).map(([id, v]) => ({
        [`${partnerRoleLabel}Id`]: id,
        [`${partnerRoleLabel}Name`]: v.name,
        deliveryDays: v.days,
      })),
      note: Object.keys(byPartner).length === 0
        ? "No delivery days configured — deliveries can be requested for any date."
        : undefined,
    };
  }

  // Top products: restaurants = most ordered items; suppliers = best sellers by
  // revenue. Answers "what do I order most?", "what are my best-selling products?".
  async function get_top_products(args: { period?: string }) {
    const period = String(args?.period || "90d").trim();
    const days = period === "30d" ? 30 : period === "180d" ? 180 : 90;
    const since = new Date(Date.now() - days * 86400000);
    const rows = await db
      .select({
        productName: orderItems.productName,
        totalQty: sql<number>`SUM(${orderItems.quantity})`,
        totalRevenue: sql<string>`SUM(${orderItems.totalPrice})`,
        orderCount: sql<number>`COUNT(DISTINCT ${orders.id})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(
        eq(ownOrderCol, userId),
        inArray(orders.status, ["confirmed", "scheduled", "in_delivery", "delivered", "not_deliverable"] as any),
        gte(orders.createdAt, since),
      ))
      .groupBy(orderItems.productName)
      .orderBy(desc(sql`SUM(${orderItems.totalPrice})`))
      .limit(10);
    return {
      periodDays: days,
      since: since.toISOString().slice(0, 10),
      topProducts: rows.map((r) => ({
        productName: r.productName,
        totalQuantity: Number(r.totalQty),
        totalAmount: Math.round(parseFloat(r.totalRevenue || "0") * 100) / 100,
        orderCount: Number(r.orderCount),
      })),
    };
  }

  // How-to / app-usage help. Returns matching help topics with steps and the
  // page path (usable as an open_page action).
  async function get_app_help(args: { topic?: string }) {
    const topics = role === "restaurant" ? RESTAURANT_HELP : SUPPLIER_HELP;
    const q = foldSearchText(String(args?.topic || "").trim());
    if (!q) {
      return { availableTopics: topics.map((t) => ({ key: t.key, title: t.title })) };
    }
    const scored = topics
      .map((t) => {
        let score = 0;
        if (foldSearchText(t.key).includes(q)) score += 3;
        if (foldSearchText(t.title).includes(q)) score += 3;
        for (const rawKw of t.keywords) {
          const kw = foldSearchText(rawKw);
          if (q.includes(kw) || kw.includes(q)) score += 2;
          else {
            for (const word of q.split(/\s+/)) {
              if (word.length >= 4 && (kw.includes(word) || word.includes(kw))) score += 1;
            }
          }
        }
        return { t, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (scored.length === 0) {
      return {
        noMatch: true,
        availableTopics: topics.map((t) => ({ key: t.key, title: t.title })),
      };
    }
    return {
      topics: scored.map(({ t }) => ({ key: t.key, title: t.title, steps: t.steps, pagePath: t.pagePath })),
    };
  }

  // Inventory risk records (supplier-only) — "what items are at risk?",
  // "any urgent risk reports?", "what stock is near expiry?".
  async function get_inventory_risk(args: { status?: string }) {
    if (role !== "supplier") return { error: "only_for_suppliers" };
    const validStatuses = ["Open", "Action Taken", "Sold", "Expired", "Dismissed"];
    const status = String(args?.status || "").trim();
    const conds: any[] = [eq(inventoryRiskRecords.supplierId, userId)];
    if (status && validStatuses.includes(status)) {
      conds.push(eq(inventoryRiskRecords.status, status as any));
    } else {
      // Default to actionable (not yet resolved) records
      conds.push(inArray(inventoryRiskRecords.status, ["Open", "Action Taken"] as any));
    }
    const rows = await db
      .select({
        id: inventoryRiskRecords.id,
        status: inventoryRiskRecords.status,
        priority: inventoryRiskRecords.priority,
        qualityStatus: inventoryRiskRecords.qualityStatus,
        riskReason: inventoryRiskRecords.riskReason,
        flaggedQuantity: inventoryRiskRecords.flaggedQuantity,
        expiryDate: inventoryRiskRecords.expiryDate,
        note: inventoryRiskRecords.note,
        createdAt: inventoryRiskRecords.createdAt,
        productName: products.name,
        unit: products.unit,
      })
      .from(inventoryRiskRecords)
      .innerJoin(products, eq(products.id, inventoryRiskRecords.productId))
      .where(and(...conds))
      .orderBy(desc(inventoryRiskRecords.priority), desc(inventoryRiskRecords.createdAt))
      .limit(15);
    return {
      count: rows.length,
      riskRecords: rows.map((r) => ({
        id: r.id,
        productName: r.productName,
        unit: r.unit,
        flaggedQuantity: r.flaggedQuantity,
        qualityStatus: r.qualityStatus,
        riskReason: r.riskReason || null,
        priority: r.priority,
        status: r.status,
        expiryDate: r.expiryDate ? fmtDate(r.expiryDate) : null,
        note: r.note || null,
        reportedAt: fmtDate(r.createdAt),
      })),
    };
  }

  // Revenue breakdown by restaurant customer (supplier-only) — mirrors
  // get_spending_summary for the supplier side. "Which restaurant orders most?",
  // "what is my revenue this month?", "top customers by spend?".
  // Also returns the prior period side-by-side so the assistant can describe
  // trends: "Restaurant X ordered 18% more than last month".
  async function get_revenue_by_customer(args: { period?: string }) {
    if (role !== "supplier") return { error: "only_for_suppliers" };
    const period = String(args?.period || "30d").trim();
    const now = new Date();
    const { fromDate, toDate } = periodBounds(period, now);
    const { fromDate: priorFrom, toDate: priorTo } = priorPeriodBounds(period, now);

    const dateConds: any[] = [gte(orders.createdAt, fromDate)];
    if (toDate) dateConds.push(lte(orders.createdAt, toDate));
    const priorDateConds: any[] = [gte(orders.createdAt, priorFrom), lte(orders.createdAt, priorTo)];

    // Run current and prior period queries in parallel.
    const [currentRows, priorRows] = await Promise.all([
      db
        .select({
          totalAmount: orders.totalAmount,
          restaurantId: orders.restaurantId,
          restaurantName: users.companyName,
        })
        .from(orders)
        .innerJoin(users, eq(users.id, orders.restaurantId))
        .where(and(eq(orders.supplierId, userId), eq(orders.status, "delivered" as any), ...dateConds)),
      db
        .select({
          totalAmount: orders.totalAmount,
          restaurantId: orders.restaurantId,
        })
        .from(orders)
        .where(and(eq(orders.supplierId, userId), eq(orders.status, "delivered" as any), ...priorDateConds)),
    ]);

    // Aggregate current period.
    const total = currentRows.reduce((s, r) => s + parseFloat(r.totalAmount || "0"), 0);
    const byCustomer: Record<string, { name: string; amount: number; count: number }> = {};
    for (const r of currentRows) {
      if (!byCustomer[r.restaurantId]) byCustomer[r.restaurantId] = { name: r.restaurantName || "", amount: 0, count: 0 };
      byCustomer[r.restaurantId].amount += parseFloat(r.totalAmount || "0");
      byCustomer[r.restaurantId].count++;
    }

    // Aggregate prior period.
    const priorTotal = priorRows.reduce((s, r) => s + parseFloat(r.totalAmount || "0"), 0);
    const priorByCustomer: Record<string, { amount: number; count: number }> = {};
    for (const r of priorRows) {
      if (!priorByCustomer[r.restaurantId]) priorByCustomer[r.restaurantId] = { amount: 0, count: 0 };
      priorByCustomer[r.restaurantId].amount += parseFloat(r.totalAmount || "0");
      priorByCustomer[r.restaurantId].count++;
    }

    const totalChangePercent =
      priorTotal > 0 ? Math.round(((total - priorTotal) / priorTotal) * 1000) / 10 : null;

    return {
      period,
      from: fromDate.toISOString().slice(0, 10),
      to: (toDate ?? now).toISOString().slice(0, 10),
      totalRevenue: Math.round(total * 100) / 100,
      orderCount: currentRows.length,
      // Comparison window so the assistant can compute and narrate trends.
      priorPeriod: {
        from: priorFrom.toISOString().slice(0, 10),
        to: priorTo.toISOString().slice(0, 10),
        totalRevenue: Math.round(priorTotal * 100) / 100,
        orderCount: priorRows.length,
      },
      // Positive = revenue grew vs prior period; negative = declined.
      totalChangePercent,
      byCustomer: Object.entries(byCustomer)
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 8)
        .map(([id, v]) => {
          const prior = priorByCustomer[id];
          const priorAmount = prior ? Math.round(prior.amount * 100) / 100 : 0;
          const changePercent =
            prior && prior.amount > 0
              ? Math.round(((v.amount - prior.amount) / prior.amount) * 1000) / 10
              : null;
          return {
            restaurantId: id,
            restaurantName: v.name,
            amount: Math.round(v.amount * 100) / 100,
            orderCount: v.count,
            priorAmount,
            priorOrderCount: prior?.count ?? 0,
            // null when the customer had no orders in the prior period.
            changePercent,
          };
        }),
    };
  }

  // Monthly food-cost-per-guest analysis (restaurant-only) — uses delivered order
  // totals + overnight-stay counts + the restaurant's target cost setting.
  // Answers "what is my food cost per guest this month?", "am I over budget?",
  // "how has my food cost trended?".
  async function get_cost_analysis(_args: any) {
    if (role !== "restaurant") return { error: "only_for_restaurants" };
    const now = new Date();
    // Look at the last 3 calendar months (inclusive of current partial month).
    const months: { year: number; month: number; label: string; from: string; to: string }[] = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      months.push({ year: y, month: m, label: `${y}-${String(m + 1).padStart(2, "0")}`, from, to });
    }
    // Spend per month (delivered orders only)
    const earliest = new Date(months[0].from);
    const orderRows = await db
      .select({ totalAmount: orders.totalAmount, createdAt: orders.createdAt })
      .from(orders)
      .where(and(eq(orders.restaurantId, userId), eq(orders.status, "delivered" as any), gte(orders.createdAt, earliest)));
    const spendByMonth: Record<string, number> = {};
    for (const r of orderRows) {
      if (!r.createdAt) continue;
      const d = new Date(r.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      spendByMonth[key] = (spendByMonth[key] || 0) + parseFloat(r.totalAmount || "0");
    }
    // Guest counts: PMS/API-imported counts override manual entries per date —
    // exactly the same logic as /api/restaurant/cost-analysis uses.
    const effectiveCounts = await storage.getEffectiveGuestCountsByDate(userId);
    const guestsByMonth: Record<string, number> = {};
    for (const [date, count] of effectiveCounts) {
      if (date >= months[0].from) {
        const key = date.slice(0, 7);
        guestsByMonth[key] = (guestsByMonth[key] || 0) + count;
      }
    }
    // Target cost per guest
    const [setting] = await db
      .select({ target: costSettings.targetCostPerGuest })
      .from(costSettings)
      .where(eq(costSettings.restaurantId, userId))
      .limit(1);
    const target = setting ? parseFloat(setting.target) : null;
    // Build the per-month rows first so we can compute vsLastMonth comparisons.
    const monthRows = months.map((m) => {
      const spend = Math.round((spendByMonth[m.label] || 0) * 100) / 100;
      const guests = guestsByMonth[m.label] || 0;
      const costPerGuest = guests > 0 ? Math.round((spend / guests) * 100) / 100 : null;
      return { month: m.label, spend, guests, costPerGuest };
    });
    return {
      targetCostPerGuest: target,
      months: monthRows.map((row, i) => {
        const prev = i > 0 ? monthRows[i - 1] : null;
        // Percent change in cost-per-guest vs the preceding month in this window.
        // null when either month has no guest count (can't compute a meaningful ratio).
        const vsLastMonth =
          prev && prev.costPerGuest !== null && prev.costPerGuest > 0 && row.costPerGuest !== null
            ? Math.round(((row.costPerGuest - prev.costPerGuest) / prev.costPerGuest) * 1000) / 10
            : null;
        return {
          month: row.month,
          spend: row.spend,
          guests: row.guests,
          costPerGuest: row.costPerGuest,
          overTarget: target !== null && row.costPerGuest !== null ? row.costPerGuest > target : null,
          // Positive = cost rose vs prior month; negative = cost fell. null = no prior data.
          vsLastMonth,
        };
      }),
      note: !setting ? "No target cost configured — set it in cost analysis settings." : undefined,
    };
  }

  // ── Handlers & definitions ────────────────────────────────────────────────

  const handlers: Record<string, (args: any) => Promise<any>> = {
    find_recent_order_with_product,
    find_orders_by_partner,
    get_order_status,
    list_deliveries,
    list_complaints,
    get_spending_summary,
    get_unread_messages,
    get_promotions,
    get_low_stock,
    search_products,
    list_orders,
    get_order_details,
    get_delivery_schedule,
    get_top_products,
    get_app_help,
    get_inventory_risk,
    get_revenue_by_customer,
    get_cost_analysis,
  };

  const definitions = [
    {
      type: "function" as const,
      function: {
        name: "find_recent_order_with_product",
        description:
          "Find the most recent orders that contain a product whose name matches the query. Use this for questions like 'when did I last order tomatoes', 'how many crates of milk did I order last time', or to find an order by the product it contained. Returns the order date, delivery date, status, the matched line item (quantity, unit price) and the trading partner.",
        parameters: {
          type: "object",
          properties: {
            productName: { type: "string", description: "Product name or part of it, e.g. 'tomato', 'Milch'." },
          },
          required: ["productName"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "find_orders_by_partner",
        description:
          role === "restaurant"
            ? "List recent orders placed with a specific supplier, matched by supplier/company name. Use for questions like 'what is the status of my orders from Müller GmbH' or 'when will my order from X arrive'. Optionally filter by status."
            : "List recent orders received from a specific customer (restaurant), matched by company name. Optionally filter by status.",
        parameters: {
          type: "object",
          properties: {
            partnerName: { type: "string", description: "Name of the supplier/customer or part of it." },
            status: {
              type: "string",
              description: "Optional status filter.",
              enum: ["pending", "confirmed", "scheduled", "in_delivery", "delivered", "cancelled", "not_deliverable"],
            },
          },
          required: ["partnerName"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_order_status",
        description:
          "Look up a specific order by its order number (e.g. '#000123' or '123') and return its status, order date and delivery date.",
        parameters: {
          type: "object",
          properties: {
            orderNumber: { type: "string", description: "The order number the user referenced." },
          },
          required: ["orderNumber"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_deliveries",
        description:
          role === "restaurant"
            ? "List the user's active (confirmed / partially confirmed / in delivery) incoming deliveries and report which are OVERDUE (delivery date in the past). Use this for ANY question about overdue, late, delayed, pending, upcoming or scheduled deliveries when the user does NOT give a specific supplier or order number — e.g. 'is there an overdue delivery?', 'are any deliveries late?', 'what is arriving this week?'. Returns each order's delivery date, how many days overdue it is, status, supplier and total. No parameters are required."
            : "List the user's active (confirmed / partially confirmed / in delivery) outgoing deliveries to customers and report which are OVERDUE (delivery date in the past). Use this for ANY question about overdue, late, delayed, upcoming or scheduled deliveries when the user does NOT give a specific customer or order number. Returns each order's delivery date, how many days overdue it is, status, customer and total. No parameters are required.",
        parameters: {
          type: "object",
          properties: {
            onlyOverdue: {
              type: "boolean",
              description: "Set true to return only overdue deliveries (omit upcoming ones). Default false.",
            },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_complaints",
        description:
          role === "restaurant"
            ? "List the restaurant's complaints (Reklamationen). Use for any question about complaints, issues with deliveries, or claim status — e.g. 'do I have open complaints?', 'what happened with my complaint about the tomatoes?'. Returns title, status, priority, reason, partner and linked order."
            : "List complaints received from customers. Use for questions like 'which complaints are still open?', 'are there any new complaints?'. Returns title, status, priority, reason, restaurant name and linked order.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Optional filter by complaint status.",
              enum: ["open", "in_progress", "resolved", "closed", "rejected"],
            },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_spending_summary",
        description:
          role === "restaurant"
            ? "Summarise the restaurant's total spending on delivered orders for a given period, broken down by supplier. Use for questions like 'how much have I spent this month?', 'what are my biggest suppliers by spend?', 'how much did I spend in the last 30 days?'."
            : "Not applicable for suppliers.",
        parameters: {
          type: "object",
          properties: {
            period: {
              type: "string",
              description: "Time window for the summary. Default '30d'.",
              enum: ["30d", "90d", "this_month", "last_month"],
            },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_unread_messages",
        description:
          role === "restaurant"
            ? "Return the count of unread messages per supplier conversation. Use for any question about unread messages, new messages, or whether there are messages waiting — e.g. 'do I have unread messages?', 'which suppliers have sent me messages?'."
            : "Return the count of unread messages per restaurant conversation. Use for questions like 'do I have unread messages?', 'which customers have sent me messages?'.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_promotions",
        description:
          role === "supplier"
            ? "List the supplier's currently active promotions (discounts). Use for questions like 'which of my products are on promotion?', 'what promotions do I have running?', 'when do my promotions expire?'."
            : "List currently active promotions from suppliers the restaurant has recently ordered from. Use for questions like 'are there any promotions available?', 'which products are discounted?', 'can I save money on anything right now?'.",
        parameters: { type: "object", properties: {} },
      },
    },
    ...(role === "supplier"
      ? [
          {
            type: "function" as const,
            function: {
              name: "get_low_stock",
              description:
                "List products whose stock quantity is at or below their low-stock threshold. Use for questions like 'what is running low?', 'which products are almost out of stock?', 'do I need to restock anything?'.",
              parameters: { type: "object", properties: {} },
            },
          },
        ]
      : []),
    {
      type: "function" as const,
      function: {
        name: "search_products",
        description:
          role === "restaurant"
            ? "Search for products available from suppliers by name or category. Use for questions like 'how much does olive oil cost?', 'which suppliers offer sparkling water?', 'what is the price of Grappa?'."
            : "Search through your own product catalog by name or category. Use for questions like 'what is the price of Grappa Riserva?', 'do I sell any dairy products?', 'show me my beverages'.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Product name or keyword to search for." },
            category: { type: "string", description: "Optional product category to filter by." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_orders",
        description:
          role === "restaurant"
            ? "List the restaurant's most recent orders across ALL suppliers, optionally filtered by status. Use when the user asks about their orders WITHOUT naming a supplier — e.g. 'what are my open orders?', 'show my recent orders', 'which orders are still pending?'."
            : "List the supplier's most recent incoming orders across ALL customers, optionally filtered by status. Use when the user asks about orders WITHOUT naming a customer — e.g. 'which orders are still open?', 'do I have new orders?', 'show pending orders'.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Optional status filter. 'pending' = not yet confirmed.",
              enum: ["pending", "confirmed", "scheduled", "in_delivery", "delivered", "cancelled", "not_deliverable"],
            },
            limit: { type: "number", description: "Max number of orders to return (default 10, max 15)." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_order_details",
        description:
          "Get the FULL contents (all line items with quantities and prices) of one specific order, by orderId (from a previous tool result) or order number. Use for questions like 'what was in that order?', 'which products did order #123 contain?', 'how much did the tomatoes cost in my last order?'.",
        parameters: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "An orderId returned by another tool." },
            orderNumber: { type: "string", description: "The order number the user referenced, e.g. '#000123'." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_delivery_schedule",
        description:
          role === "restaurant"
            ? "Show which weekdays (and time windows) each supplier delivers to this restaurant. Use for questions like 'when does supplier X deliver?', 'which days can I get deliveries?', 'why can't I pick Tuesday as delivery date?'."
            : "Show the delivery weekdays (and time windows) configured for each customer. Use for questions like 'which days do I deliver to restaurant X?', 'what delivery schedules have I set up?'.",
        parameters: {
          type: "object",
          properties: {
            partnerName: { type: "string", description: "Optional: filter by supplier/customer name." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_top_products",
        description:
          role === "restaurant"
            ? "Rank the products this restaurant has ordered the most (by total amount) in a period. Use for 'what do I order most often?', 'my most-bought products', 'where does most of my money go?'."
            : "Rank the supplier's best-selling products (by revenue) in a period. Use for 'what are my best sellers?', 'which products bring the most revenue?', 'top products this quarter'.",
        parameters: {
          type: "object",
          properties: {
            period: { type: "string", description: "Time window. Default '90d'.", enum: ["30d", "90d", "180d"] },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_app_help",
        description:
          "Look up step-by-step instructions for using GastroConnect itself. ALWAYS call this for 'how do I ...?' / 'where can I ...?' / 'wie kann ich ...?' / 'wo finde ich ...?' questions about app features (ordering, complaints, templates, documents, settings, team, promotions, inventory, delivery days, drivers, cost analysis, price comparison...). Returns matching topics with steps and a pagePath you can offer as an 'open_page' action. Call without a topic to list all available topics.",
        parameters: {
          type: "object",
          properties: {
            topic: { type: "string", description: "The user's question or a keyword, e.g. 'Reklamation erstellen', 'Liefertage', 'Passwort ändern'." },
          },
        },
      },
    },
    ...(role === "supplier"
      ? [
          {
            type: "function" as const,
            function: {
              name: "get_inventory_risk",
              description:
                "List active inventory risk records (flagged stock). Use for questions like 'what items are at risk?', 'are there any urgent risk reports?', 'do we have stock near expiry?', 'show me open risk reports'. Returns product name, flagged quantity, quality status, risk reason, priority (urgent/normal), expiry date, and current status. By default returns only Open and Action Taken records.",
              parameters: {
                type: "object",
                properties: {
                  status: {
                    type: "string",
                    description: "Optional status filter. Omit to get all actionable (Open + Action Taken) records.",
                    enum: ["Open", "Action Taken", "Sold", "Expired", "Dismissed"],
                  },
                },
              },
            },
          },
          {
            type: "function" as const,
            function: {
              name: "get_revenue_by_customer",
              description:
                "Summarise the supplier's revenue from delivered orders broken down by restaurant customer, with a side-by-side comparison to the prior period so trends can be described. Returns current-period totals, prior-period totals, totalChangePercent for the whole business, and per-customer changePercent — enabling answers like 'Restaurant X increased orders by 18% vs last month' or 'your total revenue is down 5% compared to the previous 30 days'. Use for ANY question about revenue, customer spend, top customers, or revenue trends — e.g. 'which restaurant orders most from me?', 'what is my revenue this month vs last month?', 'how has my revenue trended?', 'did Restaurant X order more or less recently?', 'who are my top customers?'.",
              parameters: {
                type: "object",
                properties: {
                  period: {
                    type: "string",
                    description: "Time window. Default '30d'.",
                    enum: ["30d", "90d", "this_month", "last_month"],
                  },
                },
              },
            },
          },
        ]
      : []),
    ...(role === "restaurant"
      ? [
          {
            type: "function" as const,
            function: {
              name: "get_cost_analysis",
              description:
                "Show monthly food cost per guest (Wareneinsatz pro Gast) for the last 3 months, including spend, overnight-stay counts, computed cost-per-guest, whether the restaurant is over its target, and a vsLastMonth field (percent change in cost-per-guest vs the preceding month — positive means costs rose, negative means costs fell, null means no prior data). Use for questions like 'what is my food cost per guest this month?', 'am I within my cost target?', 'how does my food cost compare to last month?', 'did my food cost go up or down?', 'how has my food cost trended?', 'wie hoch ist mein Wareneinsatz pro Gast?', 'hat sich mein Wareneinsatz verbessert?'. No parameters required.",
              parameters: { type: "object", properties: {} },
            },
          },
        ]
      : []),
  ];

  return { handlers, definitions };
}

const RESPOND_TOOL = {
  type: "function" as const,
  function: {
    name: "respond",
    description:
      "Provide the final answer to the user. Call this exactly once when you have gathered enough information (or determined that you cannot answer). Include action buttons only when they are clearly useful.",
    parameters: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          description:
            "A concise, friendly natural-language answer in the SAME language as the user's question. Reference concrete facts (dates, quantities, amounts) from the tool results. If no data was found, say so plainly.",
        },
        actions: {
          type: "array",
          description:
            "Optional deep-link actions. Use 'open_inbox' to start a chat about an order (e.g. when there is NO delivery date and the user should ask the partner for an update) and always provide a helpful 'suggestedMessage' to pre-fill. Use 'open_order' to open an order's detail page. Use 'open_page' with a 'path' from get_app_help to take the user directly to the relevant app page after a how-to answer. Only reference orderId values returned by the data tools and path values returned by get_app_help.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["open_inbox", "open_order", "open_page"] },
              orderId: { type: "string", description: "An orderId returned by a data tool." },
              path: { type: "string", description: "For open_page: a pagePath returned by get_app_help, e.g. '/restaurant/complaints'." },
              suggestedMessage: {
                type: "string",
                description: "For open_inbox: a polite pre-filled message in the user's language, e.g. asking for a delivery date.",
              },
              label: { type: "string", description: "Short button label in the user's language." },
            },
            required: ["kind", "label"],
          },
        },
      },
      required: ["answer"],
    },
  },
};

function systemPrompt(role: Role, lang: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const partner = role === "restaurant" ? "suppliers" : "customers (restaurants)";
  const roleSpecific =
    role === "restaurant"
      ? [
          `You can also help with: complaints (list_complaints), spending analysis (get_spending_summary), food-cost-per-guest analysis (get_cost_analysis), most-ordered products (get_top_products), unread messages (get_unread_messages), promotions from their suppliers (get_promotions), product/price lookups (search_products), delivery weekdays per supplier (get_delivery_schedule), and the full contents of a specific order (get_order_details).`,
          `For spending questions, default to the last 30 days unless the user specifies otherwise.`,
          `For food cost / Wareneinsatz questions, call get_cost_analysis — it returns monthly spend, guest counts, cost-per-guest, target comparison, and a vsLastMonth percent-change field for each month. When vsLastMonth is available, always narrate the trend (e.g. "your food cost per guest fell 8% vs last month").`,
        ]
      : [
          `You can also help with: complaints from restaurants (list_complaints), unread messages (get_unread_messages), own promotions (get_promotions), low-stock products (get_low_stock), active inventory risk records (get_inventory_risk), revenue by customer (get_revenue_by_customer), best-selling products (get_top_products), catalog lookups (search_products), configured delivery days per customer (get_delivery_schedule), and the full contents of a specific order (get_order_details).`,
          `When the user asks about stock or inventory, always call get_low_stock proactively. For risk reports or spoilage questions, call get_inventory_risk.`,
          `For revenue or customer spend questions on the supplier side, call get_revenue_by_customer — it returns current and prior period data with changePercent per customer so you can narrate trends like "Restaurant X ordered 18% more than last month" or "your total revenue is down 5% vs the previous period".`,
        ];
  return [
    `You are the in-app assistant for GastroConnect, a B2B ordering platform for restaurants and suppliers in South Tyrol.`,
    `The current user is a ${role}. Today's date is ${today}.`,
    `You can help in TWO ways: (1) answering questions about the user's own data via the data tools, and (2) explaining how to use the app via get_app_help.`,
    `For data questions: answer ONLY using tool results — never invent orders, dates, quantities or prices. All tools are already scoped to this user's own data and their ${partner}; you cannot access anyone else's data.`,
    `For how-to / where-do-I-find questions ('wie kann ich...', 'wo finde ich...', 'come posso...'): ALWAYS call get_app_help first and base your answer on the returned steps. Offer an 'open_page' action with the returned pagePath so the user can jump straight to the right page. If get_app_help has no match, say honestly that you don't know that feature — do not guess.`,
    `Reply in the same language as the user's question (German or Italian are most common; default to German if unclear). get_app_help content is German — translate it when the user writes Italian.`,
    `Be proactive: when a question can be answered by looking at the user's own data, call the relevant tool yourself without first asking the user for extra details. For orders without a named partner: list_orders; for deliveries/overdue: list_deliveries; for complaints: list_complaints; for messages: get_unread_messages; for promotions: get_promotions.`,
    `Combine tools when useful (e.g. list_orders then get_order_details for the newest order; get_order_status then get_order_details when the user asks what an order contained).`,
    ...roleSpecific,
    `If a question is ambiguous, make the most reasonable assumption, answer, and briefly state the assumption — only ask a clarifying question when you truly cannot proceed.`,
    `If the user asks for something you cannot do (e.g. placing or changing an order for them, contacting a partner directly), say so briefly, then explain how they can do it themselves (use get_app_help) and offer the matching action button.`,
    `When reporting overdue deliveries, mention the order number, the partner and how many days overdue each one is, and offer an 'open_order' or 'open_inbox' action for the most relevant order.`,
    `Keep answers short and concrete. Use bullet points when listing more than two items. When an order has no delivery date, offer an 'open_inbox' action with a polite suggestedMessage.`,
    `Always finish by calling the "respond" tool with your final answer.`,
  ].join(" ");
}

async function resolveAction(raw: AiActionRaw, userId: string, role: Role): Promise<AiAction | null> {
  if (!raw || (raw.kind !== "open_inbox" && raw.kind !== "open_order" && raw.kind !== "open_page")) return null;
  const label = String(raw.label || "").trim();
  if (!label) return null;

  // open_page links are only allowed to known in-app pages for the user's role.
  if (raw.kind === "open_page") {
    const path = String(raw.path || "").trim();
    if (!path || !ALLOWED_PAGES[role].has(path)) return null;
    return { kind: "open_page", label, href: path };
  }

  // Deep links that reference an order must be validated server-side so the model
  // can never produce a link to an order the user does not own.
  if (!raw.orderId) {
    if (raw.kind === "open_order") return null;
    return { kind: "open_inbox", label, href: `/${role}/inbox`, suggestedMessage: raw.suggestedMessage };
  }

  const ownOrderCol = role === "restaurant" ? orders.restaurantId : orders.supplierId;
  const partnerCol = role === "restaurant" ? orders.supplierId : orders.restaurantId;
  const [row] = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      partnerId: partnerCol,
    })
    .from(orders)
    .where(and(eq(orders.id, raw.orderId), eq(ownOrderCol, userId)))
    .limit(1);
  if (!row) return null;

  const orderNumber = formatOrderNumber({ orderNumber: row.orderNumber, id: row.orderId });

  if (raw.kind === "open_order") {
    return { kind: "open_order", label, href: `/${role}/orders/${row.orderId}`, orderId: row.orderId, orderNumber, partnerId: row.partnerId };
  }

  const params = new URLSearchParams({ to: row.partnerId, orderRefId: row.orderId, orderNumber });
  const suggestedMessage = (raw.suggestedMessage || "").trim();
  if (suggestedMessage) params.set("prefill", suggestedMessage);
  return {
    kind: "open_inbox",
    label,
    href: `/${role}/inbox?${params.toString()}`,
    orderId: row.orderId,
    orderNumber,
    partnerId: row.partnerId,
    suggestedMessage: suggestedMessage || undefined,
  };
}

function aiConfigured(): boolean {
  return !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
}

function makeTitle(question: string): string {
  const clean = String(question || "").replace(/\s+/g, " ").trim();
  if (!clean) return "Chat";
  return clean.length > 60 ? clean.slice(0, 57) + "…" : clean;
}

// Runs the tool-calling assistant loop for a single new user question, given the
// prior conversation turns as context. Assumes the AI integration is configured.
async function runAssistant(opts: {
  userId: string;
  role: Role;
  lang: string;
  priorTurns: { role: "user" | "assistant"; content: string }[];
  question: string;
  knowledgeBlock?: string;
}): Promise<{ answer: string; actions: AiAction[] }> {
  const { userId, role, lang, priorTurns, question, knowledgeBlock } = opts;
  const { handlers, definitions } = buildTools(userId, role);
  const tools = [...definitions, RESPOND_TOOL];

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const messages: any[] = [{ role: "system", content: systemPrompt(role, lang) }];
  for (const turn of priorTurns) {
    if (turn.content) messages.push({ role: turn.role, content: turn.content });
  }
  // Learned knowledge is prepended to the USER message as clearly-marked,
  // untrusted context — never as a system instruction (poisoning guard).
  messages.push({
    role: "user",
    content: knowledgeBlock ? `${knowledgeBlock}\n\nFrage des Nutzers:\n${question}` : question,
  });

  let answer = "";
  let rawActions: AiActionRaw[] = [];
  const MAX_TURNS = 8;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      messages,
      tools,
      tool_choice: turn === MAX_TURNS - 1 ? { type: "function", function: { name: "respond" } } : "auto",
    });

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      answer = (msg.content || "").trim();
      break;
    }

    messages.push(msg);

    let responded = false;
    for (const call of toolCalls) {
      const fn = (call as any).function;
      const fnName: string = fn?.name || "";
      let parsedArgs: any = {};
      try {
        parsedArgs = JSON.parse(fn?.arguments || "{}");
      } catch {
        parsedArgs = {};
      }

      if (fnName === "respond") {
        answer = String(parsedArgs?.answer || "").trim();
        rawActions = Array.isArray(parsedArgs?.actions) ? parsedArgs.actions : [];
        responded = true;
        messages.push({ role: "tool", tool_call_id: call.id, content: "ok" });
        continue;
      }

      const handler = handlers[fnName];
      let result: any;
      try {
        result = handler ? await handler(parsedArgs) : { error: `unknown tool ${fnName}` };
      } catch (e: any) {
        result = { error: "tool_failed", message: e?.message || String(e) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }

    if (responded) break;
  }

  if (!answer) {
    answer =
      lang === "it"
        ? "Non sono riuscito a trovare una risposta a questa domanda."
        : "Ich konnte dazu leider keine Antwort finden.";
  }

  const actions: AiAction[] = [];
  for (const raw of rawActions.slice(0, 4)) {
    const resolved = await resolveAction(raw, userId, role);
    if (resolved) actions.push(resolved);
  }

  return { answer, actions };
}

// Resolves the AI-assistant identity from the authenticated session (loadAuth is
// mounted on /api in index.ts). Client-supplied userId/role are IGNORED — identity
// always comes from req.auth so a caller can never read another tenant's data.
function aiIdentity(req: Request): { userId: string; role: Role } | null {
  const auth = req.auth;
  if (!auth) return null;
  const orgRole = auth.org?.role;
  if (orgRole !== "restaurant" && orgRole !== "supplier") return null;
  return { userId: auth.organizationId, role: orgRole };
}

export function registerAiSearchRoutes(app: Express) {
  const jsonBody = express.json({ limit: "32kb" });

  // Each call hits a paid AI model with tool-calling, so it gets a tight limit to
  // guard against cost-amplification / abuse (mirrors the price-list parser).
  const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Zu viele Anfragen. Bitte versuchen Sie es in ein paar Minuten erneut." },
    validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
  });

  // Legacy one-shot endpoint (kept for backward-compat). The in-app UI now uses
  // the conversational /api/ai/chat endpoints below.
  app.post("/api/search/ai", aiLimiter, jsonBody, async (req: Request, res: Response) => {
    try {
      const question = String(req.body?.question || "").trim();
      const lang = String(req.body?.lang || "de").trim();

      if (!question) return res.status(400).json({ error: "question_required" });
      if (question.length > 1000) return res.status(400).json({ error: "question_too_long" });
      const ident = aiIdentity(req);
      if (!ident) return res.status(401).json({ error: "unauthenticated" });
      const { userId, role } = ident;
      if (!aiConfigured()) {
        return res.status(503).json({ error: "ai_not_configured", message: "KI-Integration ist noch nicht eingerichtet." });
      }

      const { answer, actions } = await runAssistant({ userId, role, lang, priorTurns: [], question });
      return res.json({ answer, actions });
    } catch (error: any) {
      console.error("[search/ai] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed", message: "Die Anfrage konnte nicht verarbeitet werden." });
    }
  });

  // List the current user's AI conversations (newest first).
  app.get("/api/ai/chats", async (req: Request, res: Response) => {
    try {
      const ident = aiIdentity(req);
      if (!ident) return res.status(401).json({ error: "unauthenticated" });
      const { userId, role } = ident;
      const chats = await storage.getAiChats(userId, role);
      return res.json(
        chats.map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt })),
      );
    } catch (error: any) {
      console.error("[ai/chats] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed" });
    }
  });

  // Fetch a single conversation with all of its messages.
  app.get("/api/ai/chats/:id", async (req: Request, res: Response) => {
    try {
      const ident = aiIdentity(req);
      if (!ident) return res.status(401).json({ error: "unauthenticated" });
      const { userId, role } = ident;
      const id = String(req.params.id || "").trim();
      const chat = await storage.getAiChat(id);
      if (!chat || chat.userId !== userId || chat.role !== role) {
        return res.status(404).json({ error: "chat_not_found" });
      }
      const messages = await storage.getAiChatMessages(id);
      return res.json({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          actions: m.actions || [],
          feedback: m.feedback || null,
          createdAt: m.createdAt,
        })),
      });
    } catch (error: any) {
      console.error("[ai/chats/:id] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed" });
    }
  });

  // Delete a conversation (and its messages via cascade).
  app.delete("/api/ai/chats/:id", async (req: Request, res: Response) => {
    try {
      const ident = aiIdentity(req);
      if (!ident) return res.status(401).json({ error: "unauthenticated" });
      const { userId, role } = ident;
      const id = String(req.params.id || "").trim();
      const chat = await storage.getAiChat(id);
      if (chat && (chat.userId !== userId || chat.role !== role)) {
        return res.status(404).json({ error: "chat_not_found" });
      }
      await storage.deleteAiChat(id, userId);
      return res.json({ ok: true });
    } catch (error: any) {
      console.error("[ai/chats delete] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed" });
    }
  });

  // Return up to 3 suggested questions for the empty-state chips.
  // Draws from the user's own recent AI chat messages (deduplicated), then fills
  // remaining slots with role/language-aware defaults.
  app.get("/api/ai/suggestions", async (req: Request, res: Response) => {
    try {
      const lang = String(req.query.lang || "de").trim();
      const ident = aiIdentity(req);
      if (!ident) return res.status(401).json({ error: "unauthenticated" });
      const { userId, role } = ident;

      const rows = await db
        .select({ content: aiChatMessages.content })
        .from(aiChatMessages)
        .innerJoin(aiChats, eq(aiChatMessages.chatId, aiChats.id))
        .where(
          and(
            eq(aiChats.userId, userId),
            eq(aiChats.role, role as any),
            eq(aiChatMessages.role, "user"),
          ),
        )
        .orderBy(desc(aiChatMessages.createdAt))
        .limit(30);

      const seen = new Set<string>();
      const unique: string[] = [];
      for (const r of rows) {
        const text = r.content.trim();
        const key = text.toLowerCase();
        if (text && !seen.has(key)) {
          seen.add(key);
          unique.push(text);
          if (unique.length >= 3) break;
        }
      }

      const isIt = lang === "it";
      // Pick 3 defaults that showcase different capabilities. Rotate based on
      // day-of-week so users see variety across sessions when they have no history.
      const allDefaults =
        role === "restaurant"
          ? isIt
            ? [
                "Ci sono consegne in ritardo?",
                "Ho messaggi non letti?",
                "Quanto ho speso questo mese?",
                "Quali promozioni sono disponibili ora?",
                "Quando ho ordinato i pomodori l'ultima volta?",
                "Ho reclami aperti?",
              ]
            : [
                "Gibt es überfällige Lieferungen?",
                "Habe ich ungelesene Nachrichten?",
                "Wie viel habe ich diesen Monat ausgegeben?",
                "Welche Aktionen sind gerade verfügbar?",
                "Wann habe ich zuletzt Tomaten bestellt?",
                "Habe ich offene Reklamationen?",
              ]
          : isIt
            ? [
                "Quali ordini sono ancora aperti?",
                "Ho messaggi non letti?",
                "Quali prodotti sono quasi esauriti?",
                "Ci sono consegne in ritardo?",
                "Ho reclami aperti dai ristoranti?",
                "Quali promozioni ho attive?",
              ]
            : [
                "Welche Bestellungen sind noch offen?",
                "Habe ich ungelesene Nachrichten?",
                "Welche Produkte haben niedrigen Lagerbestand?",
                "Gibt es überfällige Lieferungen?",
                "Gibt es offene Reklamationen von Kunden?",
                "Welche Aktionen laufen gerade?",
              ];
      const dayOffset = new Date().getDay();
      const rotated = [...allDefaults.slice(dayOffset % allDefaults.length), ...allDefaults.slice(0, dayOffset % allDefaults.length)];
      const defaults = rotated.slice(0, 3);

      for (const d of defaults) {
        if (unique.length >= 3) break;
        if (!seen.has(d.toLowerCase())) unique.push(d);
      }

      return res.json({ suggestions: unique.slice(0, 3) });
    } catch (error: any) {
      console.error("[ai/suggestions] failed:", error?.message || error);
      return res.status(500).json({ suggestions: [] });
    }
  });

  // Send a message in a conversation (create a new one when no chatId is given).
  // Persists the user turn + assistant reply and feeds prior turns back as context.
  app.post("/api/ai/chat", aiLimiter, jsonBody, async (req: Request, res: Response) => {
    try {
      const question = String(req.body?.question || "").trim();
      const lang = String(req.body?.lang || "de").trim();
      const chatIdRaw = req.body?.chatId ? String(req.body.chatId).trim() : "";

      if (!question) return res.status(400).json({ error: "question_required" });
      if (question.length > 1000) return res.status(400).json({ error: "question_too_long" });
      const ident = aiIdentity(req);
      if (!ident) return res.status(401).json({ error: "unauthenticated" });
      const { userId, role } = ident;
      if (!aiConfigured()) {
        return res.status(503).json({ error: "ai_not_configured", message: "KI-Integration ist noch nicht eingerichtet." });
      }

      // Resolve or create the conversation, scoped to this user + role.
      let chat = chatIdRaw ? await storage.getAiChat(chatIdRaw) : undefined;
      if (chatIdRaw) {
        if (!chat || chat.userId !== userId || chat.role !== role) {
          return res.status(404).json({ error: "chat_not_found" });
        }
      }
      if (!chat) {
        chat = await storage.createAiChat({ userId, role, title: makeTitle(question) });
      }

      // Use recent stored turns as context (cap to keep token cost bounded).
      const stored = await storage.getAiChatMessages(chat.id);
      const priorTurns = stored.slice(-12).map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

      await storage.appendAiChatMessage({ chatId: chat.id, role: "user", content: question });

      // Central learned knowledge: retrieve entries similar to this question and
      // inject them into the prompt (grows over time via user feedback).
      const learned = await retrieveKnowledge(role, question);
      const knowledgeBlock = knowledgePromptBlock(learned, lang);

      const { answer, actions } = await runAssistant({ userId, role, lang, priorTurns, question, knowledgeBlock });

      const assistantMsg = await storage.appendAiChatMessage({
        chatId: chat.id,
        role: "assistant",
        content: answer,
        actions: actions.length ? actions : null,
        knowledgeIds: learned.length ? learned.map((k) => k.id) : null,
      });

      return res.json({
        chatId: chat.id,
        title: chat.title,
        messageId: assistantMsg.id,
        answer,
        actions,
      });
    } catch (error: any) {
      console.error("[ai/chat] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed", message: "Die Anfrage konnte nicht verarbeitet werden." });
    }
  });

  // Feedback on an assistant answer (thumbs up/down). Thumbs-up feeds the
  // central learning pipeline; thumbs-down down-ranks the injected knowledge.
  app.post("/api/ai/feedback", jsonBody, async (req: Request, res: Response) => {
    try {
      const ident = aiIdentity(req);
      if (!ident) return res.status(401).json({ error: "unauthenticated" });
      const messageId = String(req.body?.messageId || "").trim();
      const helpful = req.body?.helpful === true;
      if (!messageId) return res.status(400).json({ error: "message_id_required" });

      const [msg] = await db.select().from(aiChatMessages).where(eq(aiChatMessages.id, messageId)).limit(1);
      if (!msg || msg.role !== "assistant") return res.status(404).json({ error: "message_not_found" });
      const chat = await storage.getAiChat(msg.chatId);
      // Ownership: the chat must belong to the authenticated org + role.
      if (!chat || chat.userId !== ident.userId || chat.role !== ident.role) {
        return res.status(404).json({ error: "message_not_found" });
      }
      if (msg.feedback) return res.json({ ok: true, feedback: msg.feedback });

      const feedback = helpful ? "helpful" : "not_helpful";
      await db.update(aiChatMessages).set({ feedback }).where(eq(aiChatMessages.id, messageId));

      if (helpful) {
        // Find the user question that this answer responded to.
        const all = await storage.getAiChatMessages(msg.chatId);
        const idx = all.findIndex((m) => m.id === messageId);
        let question = "";
        for (let i = idx - 1; i >= 0; i--) {
          if (all[i].role === "user") { question = all[i].content; break; }
        }
        if (question) {
          // Fire-and-forget: learning must never block the feedback response.
          learnFromExchange({ role: ident.role, lang: String(req.body?.lang || "de"), question, answer: msg.content })
            .catch((e) => console.warn("[ai/feedback] learn failed:", e?.message || e));
        }
      } else if (Array.isArray(msg.knowledgeIds) && msg.knowledgeIds.length > 0) {
        penalizeKnowledge(msg.knowledgeIds).catch(() => {});
      }

      return res.json({ ok: true, feedback });
    } catch (error: any) {
      console.error("[ai/feedback] failed:", error?.message || error);
      return res.status(500).json({ error: "feedback_failed" });
    }
  });
}
