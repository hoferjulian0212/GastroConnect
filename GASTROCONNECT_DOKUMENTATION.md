# GastroConnect — Vollständige technische & funktionale Dokumentation

> **Hinweis zur Methodik:** Dieses Dokument wurde ausschließlich aus dem tatsächlich
> vorhandenen Quellcode erstellt (Stand: Juni 2026). Jede Aussage basiert auf real
> existierendem Code. Nicht vorhandene Funktionen sind ausdrücklich als
> **„Nicht implementiert"**, **„Teilweise implementiert"** oder
> **„Vorbereitet, aber aktuell nicht funktionsfähig"** gekennzeichnet.

---

## Inhaltsverzeichnis

1. [Executive Summary](#executive-summary)
2. [Phase 1 – Projektstruktur & Tech-Stack](#phase-1--projektstruktur--tech-stack)
3. [Phase 2 – Produktdefinition](#phase-2--produktdefinition)
4. [Phase 3 – Feature Inventory](#phase-3--feature-inventory)
5. [Phase 4 – User Journeys](#phase-4--user-journeys)
6. [Phase 5 – Datenmodell](#phase-5--datenmodell)
7. [Phase 6 – API-Dokumentation](#phase-6--api-dokumentation)
8. [Phase 7 – Rechteverwaltung](#phase-7--rechteverwaltung)
9. [Phase 8 – Frontend](#phase-8--frontend)
10. [Phase 9 – Backend](#phase-9--backend)
11. [Phase 10 – Architektur](#phase-10--architektur)
12. [Phase 11 – Vollständige Funktionsmatrix](#phase-11--vollständige-funktionsmatrix)
13. [Phase 12 – Bugs & Code-Schulden](#phase-12--bugs--code-schulden)
14. [Phase 13 – Fehlende Features](#phase-13--fehlende-features)
15. [Phase 14 – Technische Roadmap](#phase-14--technische-roadmap)
16. [Phase 15 – Glossar](#phase-15--glossar)

---

## Executive Summary

**GastroConnect** ist eine B2B-Webanwendung, die die Beschaffungs- und
Kommunikationsprozesse zwischen **Restaurants (Käufer)** und **Lieferanten
(Verkäufer)** in der Gastronomie-Branche digitalisiert. Das Produkt ist eine
voll funktionsfähige SaaS-Plattform mit rollenbasierten Oberflächen, einem
WhatsApp-ähnlichen Chat, kompletter Bestellabwicklung inkl. Lieferschein-PDFs,
Reklamationsmanagement, Aktionssystem, Lagerverwaltung, KI-Assistent und
Push-Benachrichtigungen.

**Reifegrad:** Produktreif im Kern (Auth, Bestellungen, Chat, Reklamationen,
Katalog, Lager, Aktionen). Integrationen zu Drittsystemen sind unterschiedlich
weit: **ERP teilweise** umgesetzt, **PMS (Hotel-/Gäste-Systeme) nur als Stub
vorbereitet**.

**Technologie in einem Satz:** React 18 + TypeScript + Vite (Frontend), Express 5
+ TypeScript ESM (Backend), Drizzle ORM + PostgreSQL 16 (Daten), gehostet auf
Replit Autoscale.

**Kennzahlen der Codebasis:**
- 49 Datenbanktabellen (`shared/schema.ts`, ~1.355 Zeilen)
- ~8.040 Zeilen API-Routen (`server/routes.ts`)
- ~5.575 Zeilen Datenzugriffsschicht (`server/storage.ts`)
- 55 Frontend-Seiten (`client/src/pages`)
- Mehrsprachig: **nur Deutsch (de) und Italienisch (it)** — kein Englisch in der UI

---

## Phase 1 – Projektstruktur & Tech-Stack

### 1.1 Ordnerstruktur (Top-Level)

```
/
├── client/                  # React-Frontend (Vite)
│   └── src/
│       ├── components/       # UI-Komponenten (chat, landing, mobile, orders, ui)
│       ├── pages/            # Seiten nach Rolle (admin, restaurant, supplier, warehouse)
│       ├── context/          # Globale State-Provider (User, Theme, Language, Chat, Hero, Tour)
│       ├── hooks/            # Custom React Hooks
│       └── lib/              # Utilities, Übersetzungen, Query-Client
├── server/                  # Express-Backend (Node.js)
│   ├── auth/                 # Authentifizierung (Session, OAuth, Admin, Tokens, Passwörter)
│   ├── replit_integrations/  # Object Storage (GCS-Sidecar)
│   ├── routes.ts             # Zentrale API-Routen
│   ├── storage.ts            # Datenzugriffsschicht (Repository-Pattern, IStorage)
│   ├── index.ts              # Server-Einstieg, Middleware, geplante Tasks
│   └── *.ts                  # Services (email, push, ocrImport, aiSearch, erpSync, ...)
├── shared/                  # Von Client & Server gemeinsam genutzter Code
│   ├── schema.ts             # Drizzle-Schema + Zod-Validierung
│   └── permissions.ts        # RBAC / Capability-Matrix
├── migrations/              # SQL-Migrationen (Drizzle Kit)
├── script/build.ts          # Produktions-Build-Orchestrierung
└── attached_assets/         # Statische Assets
```

### 1.2 Sprachen & Frameworks

| Bereich | Technologie |
|---|---|
| Sprachen | TypeScript (strict), SQL (PostgreSQL) |
| Frontend-Framework | React 18.3 |
| Routing (FE) | Wouter 3.3 |
| State/Data (FE) | TanStack React Query v5, React Hook Form 7 |
| UI | Shadcn UI (Radix UI), Tailwind CSS 3.4, Framer Motion 11, Lucide React |
| Charts/Karten | Recharts 2.15, Leaflet / react-leaflet, @vis.gl/react-google-maps |
| Backend-Framework | Express 5 |
| Runtime | Node.js 20 |
| Datenbank | PostgreSQL 16 |
| ORM/Validierung | Drizzle ORM 0.39, drizzle-zod, Zod 3.25 |
| Sessions | express-session + connect-pg-simple (Postgres-Store) |
| Passwörter | bcryptjs |

### 1.3 Wichtige Libraries (aus `package.json`)

- **Dateiverarbeitung/PDF:** `pdfkit` (Lieferscheine/Reports), `pdfjs-dist`, `puppeteer`, `xlsx` (ERP-Import), `mailparser` + `imapflow` (ERP-Import per E-Mail)
- **Integrationen:** `openai` 6.41 (KI-Assistent, OCR), `web-push` 3.6 (Push), `@google-cloud/storage` (Object Storage)
- **Sicherheit:** `helmet`, `express-rate-limit`, `bcryptjs`
- **Upload-UI:** `@uppy/*` (Core, Dashboard, AWS-S3, React)
- **Drag & Drop:** `@dnd-kit/*` (Dashboard-Widget-Sortierung)

### 1.4 Build- & Entwicklungsprozess (NPM-Skripte)

| Skript | Befehl | Zweck |
|---|---|---|
| `dev` | `NODE_ENV=development tsx server/index.ts` | Startet Express + Vite-Middleware auf **einem Port (5000)** |
| `build` | `tsx script/build.ts` | Produktions-Build (Vite-Client + esbuild-Server → `dist/index.cjs`) |
| `start` | `NODE_ENV=production node dist/index.cjs` | Startet gebündelten Produktionsserver |
| `check` | `tsc` | TypeScript-Typprüfung |
| `db:push` | `drizzle-kit push` | Schema-Sync zur Datenbank |

> **Hinweis:** Es existiert **kein** `test`-Skript in `package.json`. Tests werden
> über einen separaten Replit-Workflow ausgeführt:
> `node --import tsx --test server/*.test.ts`.

### 1.5 Hosting / Deployment (`.replit`)

- **Module:** `nodejs-20`, `web`, `python-3.11`, `postgresql-16`
- **Deployment-Ziel:** `autoscale`
- **Build:** `npm run build` → **Run:** `node ./dist/index.cjs`
- **Ports:** intern `5000` → extern `80`; intern `5904` → extern `3000`
- **Workflows:** „Start application" (`npm run dev`, wartet auf Port 5000) und „test"

### 1.6 Konfigurationsdateien

- `vite.config.ts`: React-Plugin, Aliase `@`→`client/src`, `@shared`→`shared`, `@assets`→`attached_assets`; Replit-Plugins (Error-Modal, Dev-Banner, Cartographer); `root=client`.
- `drizzle.config.ts`: Dialekt PostgreSQL, Schema `./shared/schema.ts`, Output `./migrations`.
- `tsconfig.json`: strict, `allowImportingTsExtensions`, Pfad-Mapping.
- `tailwind.config.ts`: `darkMode: ["class"]`, Shadcn-Variablen, Status-Farben, Custom-Animationen.
- `package.json`: enthält `overrides` für `drizzle-kit` (tsx-Loader-Kompatibilität).

---

## Phase 2 – Produktdefinition

### Was ist GastroConnect aktuell?
Eine Beschaffungs- und Kommunikationsplattform, auf der Restaurants bei ihren
Lieferanten bestellen, in Echtzeit chatten, Reklamationen abwickeln, Dokumente
verwalten und Kosten analysieren können — und auf der Lieferanten Katalog,
Bestellungen, Lager, Aktionen und Kunden verwalten.

### Welches Problem löst es?
Es ersetzt fragmentierte Bestellwege (Telefon, WhatsApp, Papier-Lieferscheine)
durch einen einheitlichen, nachvollziehbaren digitalen Prozess mit Audit-Trail,
Dokumentenablage und Auswertungen.

### Welche Benutzer / Rollen existieren?
- **Organisationsrollen** (`user_role`): `restaurant`, `supplier`.
- **Mitgliederrollen** (`member_role`): `admin`, `manager`, `staff`, `vertreter`
  (Außendienst, nur Lieferant), `warehouse` (Lagerpersonal, stark eingeschränkt).
- **Plattform-Admins** (`platform_admins`): systemweite Betreiber, getrennte
  Identität, Zugriff über `/admin`.

### Welche Bereiche / Module gibt es?
Auth & Onboarding · Katalog/Produkte · Warenkorb & Bestellungen · Chat/Inbox ·
Reklamationen · Dokumente (Lieferscheine/Rechnungen) · Aktionen/Promotions ·
Lagerverwaltung & Risiko-Inventar · Lieferpläne · Bestellvorlagen ·
Kostenanalyse · Monatsberichte · KI-Assistent · Benachrichtigungen/Push ·
Admin-Panel · ERP-Integration · PMS-Integration · WhatsApp-Integration.

### Funktionierende vs. teilweise vs. fehlende Features
- **Funktioniert:** Auth (alle Rollen), Bestellabwicklung, Chat, Reklamationen,
  Katalog, Lager/Risiko-Inventar, Aktionen, KI-Assistent, Dokumente, Kostenanalyse
  (manuell), Monatsberichte, Push.
- **Teilweise:** ERP-Integration (mehrere Adapter umgesetzt, viele Anbieter nur
  als manuelle Einrichtung); Kostenanalyse (PMS-gestützte Gästezahlen abhängig
  von Stubs).
- **Vorbereitet, aber nicht funktionsfähig:** PMS-Integration (alle Anbieter sind
  `StubPmsProvider`), WhatsApp-Anbindung (nur Anfrage-Erfassung).

---

## Phase 3 – Feature Inventory

> Detailauflistung der Hauptfeatures. Status-Legende: ✅ vollständig ·
> 🟡 teilweise · 🟧 vorbereitet/nicht funktionsfähig.

### Authentifizierung & Onboarding — ✅
- **Zweck:** Sicherer, einladungsbasierter Zugang. **Benutzer:** alle Rollen.
- **Frontend:** `Login.tsx`, `AuthClaim.tsx`, `AuthReset.tsx`.
- **Backend:** `server/auth/*` (routes, oauth, adminAuth, tokens, passwords, session, middleware).
- **API:** `/api/auth/*`, `/api/admin/auth/*`.
- **Abhängigkeiten:** Resend (E-Mail), Google OAuth (optional).

### Bestellabwicklung — ✅
- **Zweck:** Vom Warenkorb bis zur Lieferung inkl. Status-Workflow.
- **Status-Workflow:** `pending → confirmed/partially_confirmed → in_delivery → delivered` (oder `cancelled`).
- **Backend:** `server/routes.ts` mit `db.transaction` + `FOR UPDATE`-Locks für Bestandsintegrität.
- **Besonderheiten:** Teilbestätigung, Änderungsanfragen, Lieferschein-PDF bei Statuswechsel, CSV/PDF-Export.

### Chat / Inbox — ✅
- **Zweck:** Echtzeit-Kommunikation Restaurant↔Lieferant.
- **Datenmodell:** `conversations`, `messages` (Typen: text, order, complaint, document, attachment, voice, promotion, order_change_request …).
- **Besonderheiten:** Sprachnachrichten, Anhänge, Prioritätsnachrichten, Lesebestätigungen, Online-Status.

### Reklamationen — ✅
- **Zweck:** Qualitäts-/Liefermängel melden und abwickeln.
- **Datenmodell:** `complaints` (+ Kommentare, Status-Historie, `affectedItems`).
- **Besonderheiten:** Produktbezogene Reklamation, Nachlieferung (Follow-Up-Order) durch Lieferant.

### Katalog & Preisvergleich — ✅
- **Zweck:** Multi-Lieferanten-Katalog, Suche, kunden­spezifische Preise/MOQ.
- **Besonderheiten:** Preisvergleich über Lieferanten (`/restaurant/price-comparison`), Aktions-Badges.

### Lager & Risiko-Inventar (Smart Inventory) — ✅
- **Zweck:** Bestandsführung, Niedrigbestands-Alarme, Kennzeichnung gefährdeter Ware (Ablauf/Überbestand) und Umwandlung in Aktionen.
- **Datenmodell:** `stock_movements`, `inventory_risk_records`.

### Aktionen / Promotions — ✅
- **Zweck:** Rabatte auf Produkte, optional kundenspezifisch.
- **Datenmodell:** `promotions` (inkl. `targetRestaurantIds`).

### KI-Assistent — ✅
- **Zweck:** Tool-Calling-Assistent (Bestellungen/Bestand/Ausgaben abfragen).
- **Backend:** `server/aiSearch.ts` (OpenAI), `ai_chats`/`ai_chat_messages`.

### Dokumente — ✅
- **Zweck:** Lieferscheine & Rechnungen je Lieferant, Monatsrechnungen, Upload.
- **Backend:** PDFKit-Erzeugung, Object Storage.

### Kostenanalyse & Monatsberichte — ✅ / 🟡
- **Zweck:** Wareneinsatz pro Gast, monatliche KPIs, Trends; PDF-Monatsberichte.
- **Einschränkung:** Gästezahlen manuell ✅; automatische PMS-Quelle 🟧.

### ERP-Integration — 🟡
- **Zweck:** Katalog-/Bestandsabgleich per REST-API oder XLSX/CSV per E-Mail (IMAP).
- **Backend:** `server/erpSync.ts`, `server/erpProviders.ts`, `server/erpCrypto.ts` (Credentials verschlüsselt).
- **Einschränkung:** Mehrere Anbieter umgesetzt, viele fallen auf manuelle Einrichtung zurück.

### PMS-Integration — 🟧
- **Zweck:** Gästezahlen aus Hotel-Systemen importieren.
- **Status:** `server/pmsProviders.ts` enthält ausschließlich `StubPmsProvider`; Anfragen werden erfasst, aber kein realer Import.

### WhatsApp-Integration — 🟧
- **Zweck:** WhatsApp-Inbox-Anbindung.
- **Status:** Nur Anfrage-Erfassung (`whatsapp_connection_requests`).

### Push-Benachrichtigungen — ✅
- **Backend:** `server/pushService.ts` (VAPID), Service Worker, `push_subscriptions`.

---

## Phase 4 – User Journeys

### 4.1 Restaurant: Login → Bestellung → Lieferung → Historie
1. **Login** (`Login.tsx` → `POST /api/auth/login`) → Session-Cookie `gc.sid`, `loadAuth` setzt `req.auth`.
2. **Dashboard** (`restaurant/Home.tsx` → diverse `GET`-Endpoints): KPIs, kommende Lieferungen, ungelesene Nachrichten.
3. **Katalog** (`restaurant/Catalog.tsx` → `GET /api/products`): Suche, Filter, „In den Warenkorb" (`POST /api/cart`, Capability `orders.create`).
4. **Warenkorb** (`restaurant/Cart.tsx` → `GET /api/cart`): Lieferdatum je Lieferant, Notizen, MOV-Warnungen.
5. **Bestellung** (`POST /api/orders`): Validierung gegen `createOrderSchema`, schreibt `orders` + `order_items`, ggf. `cart_items` leeren.
6. **Lieferung verfolgen** (`OrderDetail.tsx` → `GET /api/orders/:id`): Status-Timeline; Lieferschein-PDF nach Statuswechsel.
7. **Historie & Export** (`restaurant/Orders.tsx`, `GET /api/orders/export`).

**Mögliche Fehler:** 401 (nicht eingeloggt), 403 (fehlende Capability/fremde Org), 400 (Validierung), 409/422 (MOV/MOQ/Bestand).

### 4.2 Lieferant: Bestellung empfangen → bestätigen → liefern
1. **Eingang** (`supplier/Orders.tsx` → `GET /api/supplier/orders`).
2. **Bestätigen/Teilbestätigen** (`PATCH /api/orders/:id/status`, Capability `orders.manage`): Bestand wird transaktional reserviert/gebucht (`stock_movements`).
3. **Liefern** (Status `in_delivery → delivered`): Lieferschein-PDF wird erzeugt und in den Chat/Dokumente eingestellt.
4. **Reklamation/Nachlieferung** (`POST /api/complaints/:id/follow-up-order`).

### 4.3 Lagerpersonal (warehouse): Risiko melden
1. **Login** als `warehouse` → eingeschränkte `WarehouseRouter`-Ansicht (mobil-first).
2. **Risiko-Assistent** (`InventoryRiskWizard.tsx`): Produkt wählen, Grund, Menge, optionales Foto, Notiz → `POST /api/inventory-risks` (Capability `inventory_risk.create`).
3. Zugriff ist **deny-by-default**: nur Pfade aus `WAREHOUSE_ALLOWED_ROUTES` sind erreichbar.

### 4.4 Plattform-Admin: Organisation anlegen
1. **Login** (`/admin` → `POST /api/admin/auth/login`).
2. **Neue Organisation** (`POST /api/admin/orgs`): erstellt Org + ersten `admin`-Member, versendet Claim-Link.
3. **Verwaltung:** Statistiken, Organisationen verifizieren, Impersonation, Fehlerprotokolle.

---

## Phase 5 – Datenmodell

Insgesamt **49 Tabellen** in `shared/schema.ts`. Primärschlüssel sind durchgängig
`varchar(36)` mit `gen_random_uuid()`. Fremdschlüsselspalten sind indiziert.

### 5.1 Enums (PostgreSQL-Typen)
- `user_role`: restaurant, supplier
- `member_role`: admin, manager, staff, vertreter, warehouse
- `order_status`: pending, confirmed, partially_confirmed, in_delivery, delivered, cancelled
- `message_type`: text, order, complaint, confirmation, delivery_status, document, attachment, order_change_request, promotion, voice
- `notification_type`: new_message, new_order, order_status, new_complaint, complaint_comment, low_stock, monthly_report, pms_request, erp_request, erp_sync_failed, whatsapp_request
- `document_type`: delivery_note, invoice, other
- `complaint_status`: open, in_progress, resolved, closed, rejected, partially_resolved
- `complaint_reason`: damaged, short, wrong, quality, late, other
- `stock_movement_type`: manual_in, manual_out, order_confirmed, order_reversed, order_cancelled, manual_set, order_reserved, order_returned, order_outbounded, erp_sync
- `pms_connection_status`, `pms_request_status`, `guest_count_source`
- `erp_connection_status`, `erp_request_status`, `erp_connection_method`, `erp_sync_status`, `erp_credential_type`
- `whatsapp_usage_preference`: alongside, whatsapp_only
- `oauth_provider`: google, apple, microsoft

### 5.2 Kerntabellen (Auswahl mit Details)

**`users`** — Organisation (Restaurant oder Lieferant). Felder u. a.: `role`,
`name`, `email` (unique), Kontakt-/Adressdaten, `latitude`/`longitude`,
`companyName`, `profileImageUrl`, `dashboardLayouts`/`dashboardWidgets`/`dashboardTemplates`
(jsonb), `language` (default „de"), `seatLimit` (default 5), `verifiedAt`.

**`products`** — Lieferantenkatalog. U. a. `supplierId` (FK), `articleNumber`,
`gtin`, `name`, `price`, `unit`, `category`, `inStock`, `stockQuantity`,
`reservedQuantity`, `lowStockThreshold`, `minOrderQuantity`, `erpManaged`,
`erpExternalId`, `discontinued`. Indizes: Lieferant, Kategorie, GTIN, ERP-ExternalId;
**unique** `(supplierId, articleNumber)`.

**`orders`** / **`order_items`** — Bestellungen + Positionen. `orders` mit
`orderNumber` (unique), `restaurantId`/`supplierId`/`createdByUserId`/`createdByMemberId`,
`status`, `totalAmount`, `requestedDeliveryDate`. `order_items` mit `quantity`,
`confirmedQuantity`, `rejectedQuantity`, `unitPrice`, `totalPrice`.

**`order_status_history`** — Audit-Trail der Statuswechsel.

**`cart_items`** — aktive Warenkörbe je Restaurant.

**`conversations`** / **`messages`** — Chat. `messages` mit `messageType`,
`content`, optionalem `orderId`, `documentUrl`/`audioUrl`, `priority`, `isRead`,
`dismissed`. Composite-Index `(conversationId, createdAt)`.

**`complaints`** / **`complaint_comments`** / **`complaint_status_history`** —
Reklamationen mit `complaintNumber` (unique), `reason`, `status`, `mediaUrls`,
`affectedItems`.

**`notifications`** — In-App-Benachrichtigungen mit `type`, `referenceId`, `isRead`.

**`documents`** — Lieferscheine/Rechnungen/Uploads; **unique** Lieferschein je
Bestellung (`uq_documents_delivery_note_per_order`).

**`delivery_schedules`** — wiederkehrende Lieferfenster (Wochentag + Zeitfenster).

**`promotions`** — Rabatte (`discountPercent`, Zeitraum, `targetRestaurantIds`).

**`inventory_risk_records`** — gefährdete Ware (`riskReason`, `expiryDate`,
`qualityStatus`, `photoUrl`, `status`, `linkedPromotionId`).

**`stock_movements`** — Bestandsbewegungen (alle Typen, siehe Enum).

**`order_templates`** / **`order_template_items`** — Bestellvorlagen (nur Restaurant).

**`supplier_ratings`** — Bewertungen von Lieferanten.

**`push_subscriptions`** — Web-Push-Abos.

**`overnight_stays`** / **`cost_settings`** — Kostenanalyse (Übernachtungen/Ziele).

**`minimum_order_values`** — Mindestbestellwerte (global/zonenbezogen).

### 5.3 Integrationstabellen
- **PMS:** `pms_providers`, `hotel_pms_connections`, `pms_connection_requests`, `guest_count_imports` (→ Stub-Logik).
- **ERP:** `erp_providers`, `supplier_erp_connections`, `erp_connection_requests`, `supplier_erp_credentials` (verschlüsselt), `price_change_log`.
- **WhatsApp:** `whatsapp_connections`, `whatsapp_connection_requests`.

### 5.4 Auth- & Plattformtabellen
- **`members`** — Personen einer Organisation (`organizationId`, `role`, `passwordHash`, `email` unique lower-cased).
- **`invitations`**, **`password_resets`**, **`email_verifications`** — Tokens (nur SHA-256-Hash gespeichert, einmalig, zeitlich begrenzt).
- **`oauth_accounts`** — verknüpfte OAuth-Identitäten (`provider`, `providerUserId`, unique).
- **`platform_admins`** — Plattformbetreiber (`status`: pending/approved/denied).
- **`vertreter_assignments`** — Zuordnung Außendienst-Member ↔ Restaurant.
- **`error_logs`** — Server-/Client-Fehlerprotokoll.
- **`org_notes`** — interne Admin-Notizen zu Organisationen.

### 5.5 KI-Tabellen
- **`ai_chats`** / **`ai_chat_messages`** — Verlauf des In-App-KI-Assistenten.

---

## Phase 6 – API-Dokumentation

> Vollständige Gruppierung; Authentifizierung über Server-Session (`req.auth`).
> Capabilities aus `shared/permissions.ts`. Identität wird **nie** aus
> Client-Daten abgeleitet.

### Auth & Session
| Methode | Pfad | Auth | Zweck |
|---|---|---|---|
| GET | `/api/auth/me` | – | Session-/Provider-Status |
| POST | `/api/auth/login` | Rate-Limit | E-Mail/Passwort-Login |
| POST | `/api/auth/logout` | – | Session beenden |
| POST | `/api/auth/password-reset/request` | Rate-Limit | Reset-Mail anfordern |
| POST | `/api/auth/password-reset/confirm` | Rate-Limit | Passwort per Token setzen |
| GET/POST | `/api/auth/claim` | – / Rate-Limit | Einladung prüfen / Konto aktivieren |
| GET | `/api/auth/oauth/google/start` · `/callback` | Rate-Limit | Google-OAuth-Flow |
| POST | `/api/members/:id/invite` | `team.manage` | Teammitglied einladen |

### Admin & Plattform
| Methode | Pfad | Auth | Zweck |
|---|---|---|---|
| POST | `/api/admin/auth/login` · `/logout` | adminLimiter / – | Admin-Login/Logout |
| GET | `/api/admin/auth/me` | – | Admin-Session |
| POST | `/api/admin/orgs` | `requirePlatformAdmin` | Organisation anlegen |
| GET | `/api/admin/orgs` | `requirePlatformAdmin` | Organisationen listen |
| PATCH | `/api/admin/orgs/:id/verify` | `requirePlatformAdmin` | Organisation verifizieren |
| GET | `/api/admin/stats/overview` · `/activity` | `requirePlatformAdmin` | KPIs / Aktivität |
| GET/POST | `/api/admin/admins` · `/:id/approve` | `requirePlatformAdmin` | Admins verwalten |
| GET/POST | `/api/admin/impersonate*` | `requirePlatformAdmin` | Impersonation |

### Produkte & Katalog
`GET /api/products` (Suche), `GET /api/products/:id`, `POST/PATCH/DELETE /api/products`
(`products.manage`), `POST /api/supplier/products/bulk-update`,
`POST /api/supplier/price-list/parse` (OCR), `POST /api/supplier/price-list/import`.

### Bestellungen
`GET /api/orders`, `GET /api/orders/:id`, `POST /api/orders` (`orders.create`),
`POST /api/orders/direct`, `PATCH /api/orders/:id/status` (`orders.manage`),
`POST /api/orders/:id/change-request` (+ `/respond`),
`GET /api/supplier/orders`, `POST /api/supplier/orders/batch-confirm`,
`GET /api/orders/export` (CSV/PDF).

### Warenkorb & Vorlagen
`GET/POST /api/cart`, `PATCH/DELETE /api/cart/:id`, `GET/POST /api/order-templates`.

### Chat
`GET /api/conversations`, `GET/POST /api/conversations/:id/messages` (`chat`),
`POST /api/conversations/:id/read`, `PATCH /api/conversations/:id/pin`.

### Reklamationen
`GET/POST /api/complaints`, `PATCH /api/complaints/:id`,
`POST /api/complaints/:id/comments`, `POST /api/complaints/:id/follow-up-order` (`orders.manage`).

### Aktionen & Risiko-Inventar
`GET/POST /api/promotions`, `POST /api/promotions/bulk`,
`GET/POST /api/inventory-risks` (`inventory_risk.create`),
`POST /api/inventory-risks/:id/action` (`promotions.manage`).

### Integrationen (ERP / WhatsApp)
`GET /api/erp/providers`, `POST /api/erp/connection-requests`,
`POST /api/supplier/erp/sync`, `POST /api/supplier/erp/test`,
`POST /api/whatsapp/connection-requests`.

### Objekte & Storage
`POST /api/uploads/request-url` (Presigned PUT), `GET /objects/*` (ACL),
`POST /api/attachments/request-url`, `GET /api/attachments/download` (nur Teilnehmer).

### KI-Assistent
`POST /api/ai/chat`, `GET /api/ai/chat/history`, `POST /api/ai/chat/clear`.

### Benachrichtigungen & Push
`GET /api/notifications`, `GET /api/push/vapid-key`,
`POST /api/push/subscribe`, `POST /api/push/test`.

### Analysen & Berichte
`GET /api/restaurant/cost-analysis`, `GET /api/restaurant/monthly-reports`,
`GET /api/supplier/response-time`.

> **Fehlercodes (Konvention):** 400 (Zod-Validierung), 401 (keine Session),
> 403 (fehlende Capability / fremde Organisation / Warehouse-Sperre),
> 404 (nicht gefunden), 429 (Rate-Limit), 500 (Serverfehler, z. B. Object-Storage-Signierung).

---

## Phase 7 – Rechteverwaltung

**Modell:** Capability-basiertes RBAC in `shared/permissions.ts`. `ROLE_CAPABILITIES`
ordnet jeder Rolle konkrete Capabilities zu; `can(role, capability)` prüft im FE
**und** BE. Primäre Sicherheitsgrenze sind die serverseitigen Route-Guards
(`requireAuth`, `requireCapability`) sowie die Warehouse-Allow-List.

| Rolle | Kern-Capabilities |
|---|---|
| **admin** | `team.manage`, `org.edit`, `orders.manage`, `products.manage`, `chat` |
| **manager** | `orders.manage`, `products.manage`, `promotions.manage`, `chat` |
| **staff** | `orders.create`, `chat`, `team.view` |
| **vertreter** (Lieferant) | `orders.manage`, `promotions.manage`, `inventory_risk.manage`, `chat` |
| **warehouse** | `inventory_risk.create`, `team.view` — **nur Allow-List-Routen** |

**Warehouse-Sonderfall (deny-by-default):** `WAREHOUSE_ALLOWED_ROUTES` (Regex-Liste)
+ `isWarehousePathAllowed`; jede nicht ausdrücklich erlaubte API wird blockiert,
sodass neue Features Lagerpersonal nicht versehentlich Daten preisgeben.

**Plattform-Admin:** völlig getrennte Identität (`platform_admins`), eigener Login,
`requirePlatformAdmin`-Guard, Impersonation über `impersonatedMemberId` in der Session.

**Was fehlt:** keine 2FA/Passkeys; keine feingranularen, benutzerdefinierten
Rollen (festes Rollenset).

---

## Phase 8 – Frontend

**Routing (`client/src/App.tsx`):** Wouter; partitioniert in `RestaurantRouter`,
`SupplierRouter`, `WarehouseRouter` (Allow-List `WAREHOUSE_ALLOWED_PATHS`) und
Admin-Routen. `UserLoader` hält Benutzer im erlaubten Bereich (Redirect bei
Rollen-/Pfad-Mismatch). Geteilte Detailseiten (`OrderDetail`, `ComplaintDetail`)
passen sich kontextabhängig an; auf Detailseiten werden Header/Mobile-Nav
ausgeblendet (`isDetailPage`).

**Context-Provider:** `UserProvider` (Identität, `isWarehouse`, Logout),
`LanguageProvider` (de/it, localStorage + DB-Sync via `LanguageSync`),
`ThemeProvider` (dark/light), `ChatProvider` (Chat-Vollbild-Layout),
`HeroProvider` (Portal für seitenspezifische Hero-Inhalte/Tabs),
`TourProvider` (Onboarding/Page-Intros), `TooltipProvider`.

**i18n:** `client/src/lib/translations.ts`, `useT`/`t`-Hook, **nur de & it**.

**Wichtige Komponenten:**
- Navigation: `HeaderNav` + Dropdown-Portals; mobil `RestaurantMobileNav`/`SupplierMobileNav`/`WarehouseMobileNav`; `SectionTabs` (Sub-Navigation).
- Mobile-UI: `MobileNavBase` (iOS-26-„Liquid Glass"), `MobileBottomBar`, `AttentionDeck`, `MobilePageHeader`, Pull-to-Refresh.
- Chat: `AiAssistant`, `VoiceRecorder`/`VoiceMessage`, `QuickReplyChips`.
- Wizards/Dialoge: `PhotoComplaintWizard`, `InventoryRiskWizard`, `ProductDetailDialog`.

**Seiten (Auszug):** Restaurant (Home, Inbox, Orders, Catalog, Cart,
PriceComparison, CostAnalysis, Suppliers, Templates, MonthlyReports); Lieferant
(Home, Inbox, Products, Orders, Inventory, InventoryRisk, Promotions, Restaurants);
Warehouse (Home, Stock); Admin (Orgs, ErrorLogs, Complaints, Analytics);
geteilt (Login, Help, OrderDetail, ComplaintDetail).

---

## Phase 9 – Backend

**Datenzugriff:** `IStorage`-Interface, implementiert durch `DbStorage` (Drizzle).
Domänen: Users/Members/Auth, Produkte/Bestand (inkl. `stock_movements`),
Bestell-Workflow, Logistik (Lieferpläne, MOQ, kundenspez. Preise), Kommunikation,
Analytics, Reklamationen, ERP/PMS.

**Middleware (`server/index.ts`, `server/auth/middleware.ts`):**
- Helmet (Header-Härtung), CORS-Lockdown auf `ALLOWED_ORIGINS`.
- Rate-Limits: `apiLimiter` (120/min), `writeLimiter` (40/min, Nicht-GET), `authLimiter` (20/15 min).
- Body-Limit 1 MB (25 MB für OCR/Preislisten-Import).
- `loadAuth`: Session-`memberId` → `AuthContext` (Member+Org+Rolle), inkl. Impersonation.

**Geplante Tasks & Startup:**
- `bootstrapPlatformAdmin` (Owner aus Env), `bootstrapDemoWarehouseMember` (nur Dev).
- Monatsberichte: tägliches `setInterval` + `runIfFirstOfMonth` → `runMonthlyReportsForAll`.
- Online-Status: `updateLastSeen`; Session-Pruning via `connect-pg-simple`.

**Integrationen / Services:**
- Object Storage: `ObjectStorageService` (Presigned URLs, ACLs) über GCS-Sidecar `127.0.0.1:1106`.
- OpenAI: OCR-Import (`server/ocrImport.ts`) + KI-Assistent (`server/aiSearch.ts`).
- Resend: `server/emailService.ts` (Invites, Resets, Benachrichtigungen).
- Web-Push: `server/pushService.ts` (VAPID).
- PDFKit: Lieferscheine + Monatsberichte.
- ERP: `server/erpSync.ts` (REST + XLSX/IMAP), Credentials verschlüsselt (`server/erpCrypto.ts`).

**Sicherheit/Performance:** RBAC auf Route-Ebene; verschlüsselte ERP-Credentials;
`db.transaction` + `FOR UPDATE` bei Bestell-/Bestandsübergängen; KI-Ergebnisse auf
5–15 Zeilen begrenzt; umfangreiche DB-Indizes.

---

## Phase 10 – Architektur

- **Struktur:** Monorepo-Stil mit `client/`, `server/`, `shared/`; gemeinsames
  Schema & Typen in `shared/` → Typ-Sicherheit über die Grenze.
- **Patterns:** Repository-Pattern (`IStorage`/`DbStorage`), Capability-RBAC,
  Portal-Pattern (Hero), schlanke Routen + dicke Storage-Schicht.
- **Namensgebung:** konsistent (camelCase im Code, snake_case in DB; gespiegelte
  Restaurant-/Lieferant-Seiten).
- **Codequalität:** TypeScript strict, Zod-Validierung an den Schreibpfaden,
  durchgängige Indizes; sehr große Dateien (`routes.ts` ~8 k, `storage.ts` ~5,5 k Zeilen).
- **Technische Schulden:** Code-Duplizierung durch gespiegelte Seiten;
  Stub-Integrationen (PMS); einige lose `jsonb`-Felder ohne strenge Validierung;
  kein Frontend-Test-Setup.
- **Skalierbarkeit:** Autoscale-Deployment, zustandslose Requests (Sessions in DB),
  Bestand transaktional gesichert.

---

## Phase 11 – Vollständige Funktionsmatrix

| Feature | Status | Backend | Frontend | DB | API | Fertig % |
|---|---|---|---|---|---|---|
| Authentifizierung & Onboarding | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Rollen/RBAC + Warehouse-Allow-List | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Katalog & Suche | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Warenkorb & Bestellung | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Bestell-Workflow & Teilbestätigung | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Lieferschein-PDF & Dokumente | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Chat / Inbox (inkl. Voice, Anhänge) | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Reklamationen + Nachlieferung | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Aktionen / Promotions | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Lager & Risiko-Inventar | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Lieferpläne / MOQ / MOV | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Bestellvorlagen | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Kostenanalyse (manuell) | ✅ | ✅ | ✅ | ✅ | ✅ | 95 |
| Monatsberichte (PDF/E-Mail) | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| KI-Assistent | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Push-Benachrichtigungen | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| Admin-Panel (Orgs, Stats, Impersonation) | ✅ | ✅ | ✅ | ✅ | ✅ | 100 |
| ERP-Integration | 🟡 | ✅ | ✅ | ✅ | ✅ | 60 |
| Datei-Upload / Object Storage | ✅* | ✅ | ✅ | – | ✅ | 100 |
| PMS-Integration (Gästezahlen) | 🟧 | 🟧 | 🟡 | ✅ | ✅ | 20 |
| WhatsApp-Integration | 🟧 | 🟧 | 🟡 | ✅ | ✅ | 15 |
| Frontend-Tests | ❌ | – | ❌ | – | – | 0 |

> *Object Storage ist im Code vollständig; in der aktuellen Umgebung schlägt die
> Signierung über den Replit-Sidecar mit HTTP 401 fehl (Umgebungs-/Dienstproblem,
> kein Code-Fehler) — betrifft alle Foto-Uploads.

---

## Phase 12 – Bugs & Code-Schulden

### Aktuell beobachtetes Laufzeitproblem
- **Foto-Upload schlägt fehl (HTTP 500).** Ursache: Der Replit-Object-Storage-Sidecar
  (`127.0.0.1:1106/object-storage/signed-object-url`) liefert **401** beim Signieren.
  Direkter Aufruf am App-Code vorbei bestätigt das. **Kein Code-Fehler**, sondern ein
  Umgebungs-/Autorisierungsproblem des Storage-Dienstes; betrifft **alle** Uploads
  (Profilbilder, Chat-Anhänge, Reklamations-Fotos, Risiko-Inventar-Fotos). Der
  Foto-Schritt im Risiko-Assistenten ist optional und überspringbar.

### Stubs / unfertige Integrationen
- **PMS:** alle Anbieter `StubPmsProvider` → keine echten Gästezahl-Importe.
- **ERP:** viele Anbieter ohne Auto-Connect (manuelle Einrichtung).
- **WhatsApp:** nur Anfrage-Erfassung.

### Toter / verdächtiger Code
- `client/src/pages/Admin.tsx` wirkt wie eine Altlast/Dublette zum strukturierten
  `client/src/pages/admin/`.
- `About.tsx`, `Team.tsx` außerhalb des B2B-Kernflows.

### Weitere Punkte
- **Duplizierung:** gespiegelte Restaurant-/Lieferant-Seiten (bewusst, aber wartungsintensiv).
- **Validierung:** einige `jsonb`-Felder (`nutrition`, Dashboard-Layouts) ohne strenge Zod-Prüfung am Schreibpfad.
- **Sehr große Dateien:** `routes.ts`/`storage.ts` → Refactoring-Kandidaten.

### Bekannte DB-Betriebshinweise
- `drizzle-kit push` möchte teils Session-/Migrationstabellen **droppen** — nicht
  blind ausführen; Schema-Änderungen idempotent per SQL anwenden.

---

## Phase 13 – Fehlende Features

Vergleich mit einer modernen Gastronomie-SaaS. Kennzeichnung: **Kritisch / Wichtig / Optional / Zukunft**.

| Fehlendes Feature | Priorität |
|---|---|
| Stabiler, getesteter Datei-Upload in dieser Umgebung (Storage-401 beheben) | **Kritisch** |
| Funktionsfähige PMS-Integration (echte Gästezahl-Importe) | **Kritisch** |
| Frontend-Test-Suite (Vitest/Testing Library, E2E) | **Wichtig** |
| ERP-Auto-Connect für mehr Anbieter | **Wichtig** |
| 2FA / Passkeys | **Wichtig** |
| WhatsApp-Inbox produktiv | **Wichtig** |
| Zahlungs-/Rechnungsabwicklung (Bezahlung, Mahnwesen) | Optional |
| Benutzerdefinierte Rollen/feingranulare Berechtigungen | Optional |
| Offline-/PWA-Voll­funktionalität, mehr Sprachen | Zukunft |
| Erweiterte Analytics/BI-Exporte | Zukunft |

---

## Phase 14 – Technische Roadmap

**MVP (bereits erreicht):** Auth, Katalog, Warenkorb/Bestellung, Bestell-Workflow,
Chat, Reklamationen, Dokumente, Lager, Aktionen, Push, Admin.

**Version 1.0 (Stabilisierung):**
- Object-Storage-401 dauerhaft lösen; Upload-Pfad härten und überwachen.
- Frontend-Test-Setup + CI (tsc, npm audit, Auth-Smoke-Tests laut `threat_model.md`).
- ERP-Adapter vervollständigen; Fehler-/Retry-Handling im Sync.

**Version 2.0 (Integrationen & Sicherheit):**
- PMS-Integration produktiv (Gästezahlen → Kostenanalyse).
- WhatsApp-Inbox produktiv.
- 2FA/Passkeys; Audit-Logs erweitern.

**Enterprise:**
- Benutzerdefinierte Rollen, Mandanten-Reporting/BI, SLA-Monitoring.
- Zahlungs-/Rechnungsmodul.

**Skalierung:**
- `routes.ts`/`storage.ts` modularisieren; Caching-Strategie; Lasttests;
  Beobachtbarkeit (Metriken/Tracing).

---

## Phase 15 – Glossar

- **Organisation (`users`):** ein Restaurant oder Lieferant (Mandant).
- **Member (`members`):** Person innerhalb einer Organisation mit Mitgliederrolle.
- **Plattform-Admin:** systemweiter Betreiber (getrennte Identität, `/admin`).
- **Capability:** atomare Berechtigung (z. B. `orders.manage`) aus `shared/permissions.ts`.
- **Warehouse-Allow-List:** deny-by-default-Pfadliste für Lagerpersonal.
- **MOQ / MOV:** Mindestbestellmenge / Mindestbestellwert.
- **Risiko-Inventar (Smart Inventory):** Kennzeichnung gefährdeter Ware (Ablauf/Überbestand) → optional Aktion.
- **Nachlieferung (Follow-Up-Order):** vom Lieferanten aus einer Reklamation erzeugte Ersatzbestellung.
- **Hero:** seitenspezifischer Kopfbereich (KPIs/Tabs) via Portal-System.
- **Impersonation:** Admin agiert temporär als ein Member.
- **Claim-Token:** einmaliger Einladungslink zum Konto-Aktivieren (Passwort setzen).
- **Sidecar (Object Storage):** lokaler Replit-Dienst (`127.0.0.1:1106`) zum Signieren von Upload-URLs.
- **ERP / PMS:** Warenwirtschaft / Hotel-Property-Management-System.

---

*Ende der Dokumentation. Alle Angaben basieren auf dem zum Erstellungszeitpunkt
vorhandenen Quellcode.*
