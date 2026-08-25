# GastroConnect Local, Sustainability, Zero-Waste & Logistics Audit

Stand: 25. August 2026  
Status: Architektur- und Produkt-Audit; keine Feature-, API- oder Schemaänderungen

## 1. Executive Summary

GastroConnect besitzt bereits fast alle operativen Grundlagen, auf denen eine Local-/Sustainability-Schicht aufbauen kann:

- einen bestehenden Produktkatalog mit Lieferantenzuordnung, Preisen, Bestand, ERP-Verantwortung und Promotionen;
- einen vollständigen Restaurant-Workflow von Katalog über Warenkorb und Bestellung bis zur Lieferung;
- einen Lieferanten-Workflow für Bestellbearbeitung, Lager, Risiko-Bestand, Promotionen und Fahrerzuweisung;
- einen manuellen Inventory-Risk-Workflow, der ausdrücklich als Overlay über dem ERP-Bestand modelliert ist;
- Fahrer-Routen, Stoppreihenfolge, ETA, geschätzte Strecken, Live-Position und Proof of Delivery;
- konfigurierbare Restaurant- und Lieferanten-Dashboards, Monatsberichte, PDF-Ausgabe, Benachrichtigungen und AI-Oberflächen;
- gemeinsame Rollen-, Berechtigungs-, Such-, Übersetzungs- und Mobile-Komponenten.

Die eigentliche Local-/Sustainability-Intelligence fehlt jedoch. Insbesondere fehlen verlässliche Produkt-Herkunft, Saison, Verpackung, Produzent, Fahrzeug-/Emissionsdaten, physische Ladung/Kapazität und gemessene Waste-Daten. Daher können Local Score, CO₂, Waste Reduction, Route Fill und ähnliche Aussagen heute nicht glaubwürdig berechnet werden.

Die empfohlene Architektur ist keine neue Sustainability-App, sondern eine typisierte, versionierte Berechnungsschicht über den bestehenden Workflows:

1. bestehende Daten bleiben Quelle der Wahrheit;
2. fehlende Metadaten werden nur an den bereits vorhandenen Produkt-, Risiko- oder Lieferobjekten ergänzt;
3. jede Kennzahl erhält Herkunft, Zeitraum, Berechnungsversion und `verified | estimated | unknown`;
4. dieselbe Berechnung versorgt Katalog, Detailseite, Warenkorb, Dashboard, Monatsbericht, AI und Marketing;
5. Mobile zeigt zuerst ein kompaktes Signal, Details erscheinen progressiv.

## 2. Aktuelle System- und Rollenlandkarte

### 2.1 Organisations- und Mitgliedsrollen

GastroConnect trennt zunächst Organisationen in `restaurant` und `supplier`. Innerhalb einer Organisation existieren die Mitgliedsrollen `admin`, `manager`, `staff`, `vertreter`, `warehouse` und `driver`.

| Rolle | Bestehender Schwerpunkt | Relevanz für die neue Schicht |
|---|---|---|
| Restaurant Admin | Bestellen, Team und Organisation verwalten, Reports | volle Restaurant-Impact-Sicht und Konfiguration |
| Restaurant Manager | Bestellen und operative Verwaltung | Impact, Order Quality und Trends |
| Restaurant Staff | schnell bestellen und kommunizieren | nur kompakte Local-/Seasonal-Signale |
| Supplier Admin | Produkte, Bestellungen, Promotionen, Risiken und Fahrer | volle Supplier- und Logistics-Sicht |
| Supplier Manager | Produkte, Bestellungen, Promotionen, Risiken und Fahrer | operative Sustainability- und Rescue-Aktionen |
| Vertreter | Bestellungen, Promotionen, Risiken und Chat | kundenbezogene, eingeschränkte Supplier-Sicht |
| Warehouse | Bestand lesen und Risiken melden | Risiko, Menge, Qualität, Verfall; keine Analytics |
| Driver | eigene Lieferungen, Route, Status, GPS und Chat | Route und Stops; keine komplexen Scores |
| Platform Admin | organisationsübergreifende Administration | spätere Datenqualität, Methodik und Faktorversionen |

Die gemeinsame Capability-Matrix liegt in `shared/permissions.ts:13-83`. Warehouse und Driver sind zusätzlich serverseitig deny-by-default eingeschränkt (`shared/permissions.ts:87-145,193-240`). Es gibt aktuell keine spezifischen Berechtigungen wie `impact.view`, `reports.view` oder `impact.manage`.

### 2.2 Kritische bestehende Workflows

#### Restaurant

`Product → Catalog → Cart → Order → Supplier confirmation → Delivery → Report`

- Der Katalog lädt Produkte und Lieferanten über die bestehende Produkt-API.
- Der Warenkorb gruppiert Produkte nach Lieferant und hält Notizen sowie gewünschte Liefertermine pro Lieferant.
- Checkout erzeugt eine oder mehrere Lieferantenbestellungen und schützt Wiederholungen mit Idempotenzschlüsseln.
- Bestellpositionen speichern Preis, Menge und bestätigte Menge für spätere Auswertung.
- Monatsberichte aggregieren nur geschäftlich relevante Bestellstatus.

#### Supplier

`Order → Confirmation/partial confirmation → Stock → Driver assignment → Delivery`

- Lieferanten bearbeiten eingehende Bestellungen innerhalb der bestehenden Statuslogik.
- Bestand wird manuell oder über ERP-Synchronisation geführt.
- Fahrerzuweisungen bleiben an die bestehende Bestellung gebunden.
- Lieferstatus werden in einem eigenen Driver-Modul geführt, damit der Bestellstatus-Workflow unverändert bleibt.

#### Warehouse / Inventory Risk

`Stock → Risk report → Manager review → Promotion/action`

- Warehouse meldet Menge, Qualität, Grund, Priorität, optionales Ablaufdatum und Foto.
- `inventory_risk_records` ist bewusst kein zweites Lager, sondern ein Overlay über dem ERP-/Produktbestand.
- Admin, Manager und Vertreter können Risiken bearbeiten und als bestehende Promotion verwerten.
- Das Risiko speichert bereits `linkedPromotionId`.

#### Driver

`Assigned delivery → Route → Stop status → Live location/ETA → Proof of delivery`

- Pro Fahrer und Tag gibt es eine Route mit geordneter Stoppliste.
- Pro Bestellung gibt es höchstens eine Delivery Assignment.
- ETA und Strecke sind die zuletzt berechneten Schätzwerte, nicht gemessene Ist-Werte.
- Bei fehlendem Routing-Ergebnis verwendet das System eine Luftlinien-basierte Näherung.

## 3. Bestehende Datenquellen und ihre Grenzen

| Datenquelle | Aktuelle Autorität | Heute verwendbar für | Nicht daraus ableiten |
|---|---|---|---|
| `products` | Supplier UI oder ERP bei `erpManaged` | Produkt, Kategorie, Preis, Einheit, Bestand, Verfügbarkeit | Herkunft, Saison, Verpackung, Produzent, Local Score |
| `users` | Organisation/Stammdaten | Restaurant-/Supplier-Adresse und Koordinaten | Produkt-Herkunft; Supplier-Hauptsitz ist nicht automatisch Produktionsort |
| `orders` / `order_items` | Checkout und Bestellstatus | Ausgaben, Mengen, Lieferant, Datum, bestätigte Menge | Verbrauch, Food Waste, physische Ladung |
| `delivery_schedules` | Lieferanten-/Restaurant-Beziehung | wiederkehrende Liefertage und optionale Uhrzeiten | normalisierte harte Zeitfenster oder Zeitzonen |
| `inventory_risk_records` | Warehouse-Meldung | Risikomenge, Grund, Qualität, Ablaufdatum, Status | autoritativer Gesamtbestand oder reservierte Verkaufsmenge |
| `promotions` | Supplier/Manager | Rabatt, Zeitraum, Produkt, Zielrestaurants | Rescue-Mengenlimit, physische Reservierung, Handoff |
| `driver_routes` | Fahrer-Routenkoordination | Fahrer, Liefertag, Stoppreihenfolge, Route-Status | Fahrzeugkapazität, tatsächliche Beladung |
| `delivery_assignments` | Lieferprozess | Stop, ETA, geschätzte Strecke, Status, POD | tatsächlich gefahrene Kilometer oder CO₂ |
| `driver_locations` | letzte GPS-Position | Live-Tracking und ETA-Aktualisierung | historische vollständige Fahrspur |
| Restaurant-Verfügbarkeit | nicht modelliert | aktuell keine autoritative Quelle | „ASAP“ als jederzeitige Lieferbarkeit interpretieren |
| Lieferzone/PLZ-Kompatibilität | nicht modelliert | Postleitzahl und Koordinaten nur als Rohdaten | bestehende Lieferberechtigung, gleiche Zone oder Konsolidierbarkeit |
| Mehrweg-Rückgabe | nicht modelliert | `packages` und POD reichen dafür nicht | Verpackungstyp, Rückgabemenge, Besitz, Pfand oder Custody |
| Monatsbericht | abgeleitete Bestell-/Produktdaten | Ausgaben, Mengen, Preisvergleich, Promotionspotenzial | Local/Waste/CO₂ ohne neue verifizierte Inputs |

### 3.1 Heute verlässlich messbar

- Ausgaben und bestätigte Bestellmengen;
- Anzahl und Status von Bestellungen;
- Lieferanten- und Produktanteile an Ausgaben;
- genutzte und verpasste Promotionen nach bestehender Methodik;
- gemeldete Risiko-Mengen und Risiko-Gründe;
- Anzahl Route/Stops und vorhandene Lieferstatus;
- zuletzt geschätzte Strecke und ETA, eindeutig als Schätzung gekennzeichnet;
- regionale Entfernung zwischen bekannten Koordinaten, sobald definiert ist, welche Standorte fachlich verglichen werden.

### 3.2 Erst nach kleinen Daten-Erweiterungen messbar

- Local-Klassifizierung und Local Spend;
- Saison-Signal;
- Verpackungs- und Mehrweg-Signal;
- Local Score mit nachvollziehbarem Faktor-Breakdown;
- Anteil regionaler Bestellungen;
- verifizierte Rescue-Verkäufe;
- Lieferfenster-Kompatibilität;
- geschätzte Emissionen, wenn Fahrzeugtyp und Faktorversion vorhanden sind.

### 3.3 Aktuell nicht seriös messbar

- echte Produktentfernung ohne Produktions-/Herkunftsstandort;
- tatsächliche gefahrene Kilometer ohne historische Route/Telematik;
- Route Fill ohne Volumen/Gewicht und Fahrzeugkapazität;
- kompatible Konsolidierung ohne autoritative Lieferzonen und Restaurant-Verfügbarkeiten;
- vermiedene Kilometer ohne dokumentiertes Vergleichsszenario;
- Waste Reduction ohne Verbrauchs-, Entsorgungs- oder Rescue-Abschlussdaten;
- CO₂-Einsparung ohne Fahrzeug, Faktor, Distanzmethodik und Baseline;
- Mehrweg-Rückgabequote ohne Verpackungskonto, Übergaben und bestätigte Mengen;
- Smart Quantity als Verbrauchsprognose ohne Verbrauchs-/Bestandsverlauf beim Restaurant;
- Restaurant-Gesamtscore bei zu geringer Datenabdeckung.

## 4. Vollständige Capability-Matrix

Statusdefinition:

- **EXISTING**: fachlich bereits vorhanden und direkt wiederverwendbar.
- **PARTIAL**: Grundlage vorhanden, Ziel-Feature aber unvollständig.
- **MISSING**: weder verlässliche Daten noch vollständige Funktion vorhanden.

| Nr. | Capability | Status | Wiederverwenden / erweitern | Kleinste sichere Erweiterung |
|---:|---|---|---|---|
| 4 | Product Local Intelligence | PARTIAL | bestehendes Produkt, Supplier-Beziehung, Organisation-Koordinaten und Product Detail | optionale, quellenbelegte Herkunfts-, Saison- und Verpackungsmetadaten am Produkt; kompakte Detailsektion |
| 5 | Local Signal auf Catalog Cards | PARTIAL | aktuelle Karten, Badge und Mobile-Quick-Add | maximal ein kompaktes Local-/Seasonal-Signal; keine Kartenvergrößerung |
| 6 | Local Score | MISSING | Produktmetadaten, Koordinaten, Lieferdaten | zentraler, versionierter Rechner mit Faktor-Breakdown und Confidence; kein Score bei ungenügender Abdeckung |
| 7 | Local Score Explainer | MISSING | bestehende Dialog-/Detailmuster | kleines Modal auf der Produktdetailseite statt neuer Hauptnavigation |
| 8 | Landing „GastroConnect Local“ | MISSING | bestehende Landing-Komponenten und reduzierte Motion-Pfade | eine integrierte Story-Section mit ausschließlich belegbaren Aussagen |
| 9 | Local First Filter | PARTIAL | bestehende Catalog-Suche, Kategorie- und Supplier-Filter | vorhandene Filter-Pipeline um `Local`, `Seasonal`, später `Low Waste` erweitern |
| 10 | Seasonal Priority | MISSING | bestehendes Catalog-Sorting und Produktalternativen | supplier-gepflegte Saisonmonate plus dezentes Ranking; keine Bestellblockade |
| 11 | Local Alternative / AI Insight | PARTIAL | vorhandene deterministische Produktalternativen und AI-Oberfläche | inline, dismissible Hinweis nur bei vergleichbaren verifizierten Daten |
| 12 | Cart / Order Impact | PARTIAL | bestehende Lieferantengruppen und Checkout-Zusammenfassung | eingeklappte Impact-Zeile; keine Änderung am Checkout-Payload |
| 13 | Smart Order Quantity | PARTIAL | Kaufhistorie, Order Insights und MOQ | rein optionale Empfehlung; nie automatisch Menge ändern; nicht als Verbrauchsprognose ausgeben |
| 14 | Restaurant Order Quality / Manager View | PARTIAL | Rollen, Member Attribution und Dashboard-Widgets | rollenabhängige Widgets; Staff sieht nur Bestellsignale |
| 15 | Restaurant Impact Statistics | PARTIAL | bestehendes Restaurant-Dashboard und Detailed Stats | optionales Impact-Widget aus einer gemeinsamen Berechnungsquelle |
| 16 | Monthly Impact Report | PARTIAL | vorhandener Monatsbericht, PDF, Share und Opt-out | optionale Impact-Sektion im bestehenden Payload und PDF |
| 17 | Restaurant Score | MISSING | spätere Local-/Waste-/Logistics-Kennzahlen | versionierter aggregierter Score erst nach definierter Mindestabdeckung |
| 18 | Badges | MISSING (UI-Primitive EXISTING) | vorhandene presentational Badge-Komponente | zentral evaluierte, versionierte Eligibility mit Evidenz und Widerruf; keine Zertifizierungsbehauptung |
| 19 | Risk Stock → Rescue Market | PARTIAL | Risiko-Workflow und `linkedPromotionId` | Rescue als typisierte risk-linked Promotion mit verfügbarem Mengenlimit und Qualitätsklasse |
| 20 | Supplier-side Rescue | PARTIAL | bestehende Risiko- und Promotion-Verwaltung | Manager-Aktion auf bestehendem Risiko; Warehouse bleibt meldend, nicht verkaufend |
| 21 | Supplier Sustainability Statistics | PARTIAL | Supplier Detailed Stats, Insights und Widgets | organisationsbezogenes Impact-Widget aus derselben Berechnungsschicht |
| 22 | Delivery Route Intelligence | PARTIAL | Route, Stopfolge, ETA, Strecke, Status | versionierter Route-Snapshot mit Methodik, Zeitpunkt und Confidence |
| 23 | CO₂ Calculation | MISSING | geschätzte Route-Distanz als möglicher Input | getrennte Estimate-Schicht mit Fahrzeugprofil, Faktorversion und klarer Baseline |
| 24 | Delivery Date / Window Logic | PARTIAL; Restaurant Availability MISSING | Lieferpläne, gewünschtes Datum, Assignment-Textfenster | Restaurant-Verfügbarkeiten als Stammdaten und normalisierte Intervalle ergänzen; „ASAP“ respektiert Verfügbarkeit; fixe Termine nie verschieben |
| 25 | Route Consolidation | PARTIAL; Zone/PLZ Compatibility MISSING | Lieferanten-getrennter Checkout, PLZ/Koordinaten und Fahrer-Routen | autoritative Lieferzonen und kompatible Fenster vor physischer Konsolidierung modellieren; Bestellung nicht mit Ladung gleichsetzen |
| 26 | Route Fill / Delivery Efficiency | MISSING | Route, Stops und Bestellung als Grundlage | zuerst Kapazitäts-/Ladungsdaten; bis dahin nur einfache, klar benannte Routenmetriken |
| 27 | Driver App | PARTIAL; Kern-App EXISTING, Mehrweg-Rücknahme MISSING | fokussierte mobile Route, ETA, Status, Navigation und POD | höchstens ein kompaktes Route-Signal; später Verpackungstyp/-menge und Übergabe erfassen, ohne Rückgabe aus POD abzuleiten |
| 28 | Role-based Information Architecture | PARTIAL | zentrale Capabilities und deny-by-default Rollen | explizite Impact-/Report-Capabilities, server- und clientseitig durchgesetzt |
| 29 | Mobile First | EXISTING/PARTIAL | Mobile Pages, Bottom Nav, Cards, Drawers, Safe Areas | progressive disclosure: Badge → Detail → Modal → Manager Analytics |
| 30 | Emojis / Icons | PARTIAL | konsistentes Lucide-System | Icons bevorzugen; Emojis nur sparsam als lokalisierte Informationsmarker |
| 31 | Data Quality / Confidence | MISSING | ERP-Provenienz einzelner Felder als Ansatz | gemeinsamer Metadata-Block für Quelle, Zeitraum, Methode, Version, Coverage und Confidence |

## 5. Exakte Integrationspunkte

| Neues Feature | Bestehende Quelle | Bestehende Oberfläche/API | Empfohlene Integration |
|---|---|---|---|
| Local Metadata | `products`, Supplier-Stammdaten | Supplier Products, `/api/products` | bestehendes Produktmodell und Produktformular erweitern |
| Herkunftsdistanz | Produkt-Herkunftskoordinaten + Restaurant-Koordinaten | Product API / Detail | zentral serverseitig berechnen; Supplier-Hauptsitz nur als ausdrücklich benannter Fallback |
| Local Score | Local Metadata + Distanz + Saison + Packaging | Product API, Catalog, Detail | ein gemeinsamer pure calculation module; Breakdown im Response |
| Local/Seasonal Filter | Product API | Restaurant Catalog | bestehende Filter- und Search-Pipeline erweitern |
| Local Alternative | Product Match + Local Score | Product Detail | bestehendes Alternative-Ranking ergänzen |
| Order Impact | Cart Items + Product Impact | Restaurant Cart | kompaktes, eingeklapptes Read-only Summary |
| Restaurant Impact | bestätigte Orders + Product Impact | Detailed Stats, Dashboard Widgets | neuer typisierter, session-scoped Read-Endpunkt |
| Monthly Impact | dieselbe Impact-Berechnung | Monatsbericht und PDF | Payload optional erweitern; keine separate Reporting-Pipeline |
| Supplier Impact | eigene Produkte, Orders, Risiken, Routes | Supplier Detailed Stats / Widgets | gleiche DTO- und Methodikversion, supplier-scoped |
| Rescue | Risk Record + Promotion + Stock | Inventory Risk / Promotions | risk-linked Promotion mit Menge, Gültigkeit und Qualitätsklasse |
| Restaurant Availability | neue Restaurant-Stammdaten | Profile/Settings, Cart und Route Planner | wiederkehrende normalisierte Zeitfenster; serverseitig bei ASAP und Planung validieren |
| Delivery Zones | Supplier-Zonen + Restaurant PLZ/Koordinaten | Supplier Settings, Assignments und Route Planner | eine autoritative Kompatibilitätsprüfung statt lokaler Client-Heuristiken |
| Route Efficiency | Driver Route + Assignments | Route Planner | Snapshot/Telemetry erweitern, bestehende Route nicht ersetzen |
| CO₂ Estimate | Route Snapshot + Vehicle Profile + Factor | Supplier Analytics / Report | eigener Rechner über Route, nicht als Delivery-Distance-Feld |
| Mehrweg-Rücknahme | Packaging Taxonomy + Verpackungskonto | Driver Delivery Detail / POD | getrennte Pickup-/Return-Transaktion mit Restaurant-Bestätigung und Supplier-Abgleich |
| AI Impact Insight | gemeinsamer Impact-Service | AI Assistant | read-only, rollenautorisiertes Tool mit Zeitraum und Confidence |
| Marketing | freigegebene, belegbare Werte | Landing | vorhandene Landing-Story-Komponenten erweitern |
| Notifications | Report/Impact Event | NotificationBell, Push und E-Mail | vorhandene Pipeline und Präferenzen erweitern; deduplizieren |

## 6. Größte Duplikations- und Fehlinterpretationsrisiken

1. **Supplier-Standort ist nicht Produkt-Herkunft.** Die vorhandenen Supplier-Koordinaten dürfen nicht automatisch als Produktionsort ausgegeben werden.
2. **Risk Quantity ist kein Bestand.** `flaggedQuantity` darf den ERP-/Produktbestand nicht ersetzen oder ohne Reservierungslogik reduzieren.
3. **Promotion ist noch kein vollständiges Rescue-Angebot.** Es fehlen Mengenlimit, Herkunft aus einem Risiko und Abschluss-/Ausverkauft-Logik.
4. **Bestellgruppe ist keine physische Ladung.** Checkout-Gruppierung, Batch-Aktion, Route und Konsolidierung beschreiben verschiedene Dinge.
5. **ETA/Distance ist eine Momentaufnahme.** Das Feld darf nicht als gemessene Ist-Strecke oder garantierte Ankunft behandelt werden.
6. **ASAP bedeutet nicht jederzeit.** Ohne Restaurant-Verfügbarkeit darf Routing keine beliebige Uhrzeit annehmen.
7. **PLZ/Koordinate ist noch keine Lieferzone.** Eine Client-Heuristik für „nahe“ darf keine Supplier-Lieferberechtigung ersetzen.
8. **Drei Lieferzeit-Repräsentationen können auseinanderlaufen.** Lieferplan, gewünschtes Bestelldatum und freies Assignment-Zeitfenster müssen vor Optimierung konsistent validiert werden.
9. **POD ist kein Mehrwegkonto.** Package Count oder eine abgeschlossene Lieferung belegen weder Rückgabemenge noch Eigentums-/Pfandübergang.
10. **Analytics dürfen nicht mehrfach implementiert werden.** Dashboard, Monatsbericht, AI und Landing müssen dieselbe versionierte Berechnung nutzen.
11. **Client-seitige Rollenprüfung reicht nicht.** Neue Impact-Endpunkte benötigen die gleiche serverseitige Organisations- und Capability-Grenze.
12. **Badge-UI ist keine Badge-Logik.** „Local“, „Verified“, „Low Waste“ und „Sustainable“ brauchen zentrale Eligibility, Evidenz und Widerruf.
13. **Neue Navigation würde Mobile überladen.** Die erste Ausbaustufe gehört in vorhandene Karten, Details, Widgets und Reports.
14. **Übersetzungen sind aktuell verteilt.** Authenticated UI nutzt hauptsächlich DE/IT, die Landing eigene DE/IT/EN-Dictionaries und Monatsberichte viele deutsche Hardcodings.
15. **Statusfarben sind teilweise doppelt gepflegt.** Neue Confidence-/Impact-Statusfarben müssen zentralisiert werden.

## 7. Datenqualitäts- und Confidence-Vertrag

Jeder neue berechnete Wert sollte mindestens folgenden gemeinsamen Metadatenblock liefern:

```text
classification: verified | estimated | unknown
source: supplier | erp | system | routing_provider | admin
period: start/end oder snapshot timestamp
calculationVersion: stabile Methodik-ID
coverage: Anteil der berücksichtigten Positionen/Faktoren
missingInputs: Liste fachlich fehlender Inputs
```

Regeln:

- `verified` gilt nur für bestätigte Stammdaten oder beobachtete operative Fakten.
- `estimated` muss die Methodik und verwendete Baseline nennen.
- `unknown` ist ein gültiges Ergebnis und darf nicht in `0` umgewandelt werden.
- Ein aggregierter Score darf nur erscheinen, wenn eine fachlich definierte Mindestabdeckung erreicht ist.
- Änderungen an Gewichtungen erzeugen eine neue Calculation Version.
- Historische Reports behalten ihre ursprüngliche Methodikversion.
- AI-Antworten nennen Zeitraum, Datenabdeckung und Estimate-Status.
- Marketing verwendet keine Live-Zahl ohne dokumentierte Aggregation und Freigabe.

## 8. Empfohlene fachliche Definitionen vor Implementierung

Folgende Entscheidungen sind Voraussetzung für belastbare P0-Arbeit:

1. **Was bedeutet „Local“?** Luftlinie, Fahrstrecke, administrative Region, Südtirol-Flag oder Kombination.
2. **Welcher Ort zählt?** Produzent, Verarbeitungsort, Lager oder Supplier-Hauptsitz.
3. **Wie werden Mehrfachherkünfte behandelt?** Saison-/Charge-abhängige Herkunft darf nicht als ein statisches Produktfeld verfälscht werden.
4. **Wer bestätigt Daten?** Supplier-Selbstauskunft, ERP, Admin-Prüfung oder externer Nachweis.
5. **Welche Saisonlogik gilt?** fixe Monate, regionale Saisonkalender oder Supplier-Verfügbarkeit.
6. **Welche Verpackungstaxonomie gilt?** Einweg, Mehrweg, Pfand, unverpackt und unbekannt.
7. **Wem gehört Mehrwegverpackung?** Supplier, Restaurant oder Pool; wie werden Pfand, Übergabe und Verlust abgeglichen.
8. **Wer pflegt Restaurant Availability?** Organisation-Admin/Manager; welche Zeitzone, Ausnahmen und Feiertage gelten.
9. **Wer definiert Lieferzonen?** Supplier, Routing-Provider oder Platform Admin; PLZ-Liste, Polygon oder Distanzregel.
10. **Wann ist ein Angebot „Rescue“?** nur preisreduzierter Risk Stock oder auch Spende/Abholung.
11. **Welche CO₂-Methodik wird verwendet?** Faktorquelle, Fahrzeugklassen, Well-to-wheel/Tank-to-wheel und Baseline.
12. **Welche Rollen dürfen Impact sehen?** Staff minimal; Manager/Admin Analytics; Warehouse/Driver operativ.
13. **Welche Mindestdatenmenge gilt?** insbesondere Restaurant Score, Monatsvergleich und AI-Empfehlung.

## 9. Phasenplan

### P0 — belastbare Local- und Impact-Grundlage

#### P0.1 Data & Governance Foundation

- Definiere Local, Saison, Packaging, Provenienz und Confidence.
- Ergänze minimale optionale Produktmetadaten ohne paralleles Produktmodell.
- Implementiere eine gemeinsame, versionierte Calculation-Schicht.
- Führe explizite Impact-/Report-Berechtigungen ein.
- Ergänze Tests für unbekannte, geschätzte und verifizierte Daten.

Abhängigkeit: fachliche Entscheidungen aus Abschnitt 8.

#### P0.2 Product Local Experience

- Supplier pflegt die neuen Produktmetadaten im bestehenden Produktworkflow.
- Catalog zeigt maximal ein kompaktes Signal und erweitert die vorhandenen Filter.
- Product Detail zeigt Herkunft, Saison, Verpackung, Entfernung und Score-Breakdown.
- Score Explainer bleibt ein Dialog.

Abhängigkeit: P0.1.

#### P0.3 Order & Restaurant Impact

- Warenkorb zeigt eine eingeklappte, nicht blockierende Impact-Zusammenfassung.
- Restaurant-Dashboard erhält ein optionales Manager-/Admin-Widget.
- Monatsbericht und PDF erhalten dieselbe optionale Impact-Sektion.
- Restaurant Score bleibt verborgen, bis Mindestabdeckung erreicht ist.

Abhängigkeit: P0.1 und P0.2.

#### P0.4 Logistics Readiness & Marketing

- Route-Schätzungen erhalten Berechnungszeitpunkt, Methode und Confidence.
- Landing erhält eine integrierte GastroConnect-Local-Story mit belegbaren Aussagen.
- Keine CO₂-Zahl, solange Fahrzeug-/Faktorgrundlage fehlt.

Abhängigkeit: P0.1; Marketing-Aussagen zusätzlich von validierten P0-Metriken abhängig.

### P1 — Rescue und Logistics Intelligence

#### P1.1 Better Local Alternative

- Erweitert erst nach P0 die vorhandene Out-of-stock-Alternative um eine getrennte Local-/Seasonal-Empfehlung.
- Vergleicht nur Produkte mit verifizierter, fachlich vergleichbarer Herkunft und Saison.
- Bleibt inline, dismissible und unterbricht den Bestellprozess nie.

#### P1.2 Smart Quantity

- Nutzt Kaufhistorie als unverbindliches Signal.
- Ändert niemals automatisch Bestellmenge oder MOQ.
- Wird nicht als Verbrauchs- oder Waste-Prognose bezeichnet.

#### P1.3 Risk Stock → Rescue

- Erweitert bestehenden Inventory-Risk-zu-Promotion-Workflow.
- Rescue-Angebot bleibt mit Risiko, Menge, Qualität und Gültigkeit verknüpft.
- Warehouse meldet; Manager/Admin veröffentlicht.
- Restaurant erhält einen bestehenden Catalog-Filter, kein separates Marketplace-System.

#### P1.4 Supplier Sustainability Statistics

- Supplier-Dashboard erhält organisationsbezogene Local-, Rescue- und messbare Route-Kennzahlen.
- Nutzt dieselbe DTO- und Calculation Version wie Restaurant-Report und AI.
- Zeigt keine Restaurant-Einzeldaten außerhalb der bestehenden Supplier-Beziehung.

#### P1.5 Delivery Availability, Zones & Consolidation

- Ergänzt Restaurant Availability in den Stammdaten und behandelt „ASAP“ weiterhin innerhalb dieser Grenzen.
- Definiert Supplier-Lieferzonen und eine autoritative PLZ-/Koordinaten-Kompatibilitätsprüfung.
- Normalisiert Zeitfenster und validiert sie gegen Bestellwunsch, Zone und Route.
- Modelliert physische Ladung/Konsolidierung nur, wenn mehrere Orders wirklich gemeinsam transportiert werden.
- Verschiebt nie automatisch fixe Termine.

#### P1.6 Route Efficiency & Estimated CO₂

- Definiert Routen-Snapshot, Vergleichsbaseline und Fahrzeugprofil.
- Trennt geschätzte von gemessenen Werten.
- Zeigt Supplier/Manager Kennzahlen; Driver nur operative Route.

Abhängigkeit: P0.1, belastbare Routentelemetrie und definierte Emissionsmethodik.

#### P1.7 Mehrweg-Rücknahme im Driver Flow

- Startet erst nach definierter Packaging Taxonomy, Eigentums-/Pfandlogik und Supplier-Abgleich.
- Fahrer erfasst Verpackungstyp, Menge und Pickup/Return; Restaurant bestätigt die Übergabe.
- Eine eigene Rückgabe-Transaktion bleibt vom Delivery-Status und allgemeinen POD getrennt.
- Backhaul-/Return-Optimierung bleibt P2.

### P2 — datenabhängige Prognosen

- Waste Prediction;
- Route Fill Optimization;
- Backhaul/Return Optimization;
- Demand Forecasting;
- regionale Nachfrage- und Saisonprognosen;
- Producer Demand Matching.

P2 wird erst geplant, wenn P0/P1 ausreichend historische, verifizierte Daten erzeugen.

### P3 — ausdrücklich nicht bauen

- neue direkte Produzentenplattform;
- zentrale regionale Distribution;
- separater Producer Marketplace;
- landwirtschaftliche Produktionsplanung;
- langfristige Lieferverträge;
- großflächiges regionales Food Network.

## 10. No-Breaking-Change- und Testmatrix

| Kritischer Flow | Muss nach jeder Phase unverändert funktionieren | Zusätzliche Regression |
|---|---|---|
| Catalog/Search | bestehende Suche, Kategorien, Supplier-Filter und Quick Add | fehlende Local-Daten verändern Ergebnis nicht |
| Product Detail | Preis, Promotion, Bestand, Historie und Add-to-cart | unbekannte Faktoren zeigen keinen erfundenen Score |
| Cart/Checkout | Lieferantengruppen, MOQ, Termine, Idempotenz und Order-Erzeugung | Impact ist read-only und blockiert Checkout nie |
| Supplier Orders | Bestätigung, Teilbestätigung, Status und Reschedule | neue Kennzahlen verändern keine Statusübergänge |
| Inventory/ERP | ERP bleibt Quelle der Wahrheit | Risk/Rescue reserviert oder reduziert Bestand nur über definierte Logik |
| Inventory Risk | Warehouse kann melden; Manager kann handeln | Cross-org und Rollenrechte bleiben fail-closed |
| Promotions | bestehende Promotionen bleiben funktionsfähig | Rescue ist eindeutig typisiert und mengenbegrenzt |
| Driver Assignment | genau eine Assignment pro Order | Reassignment und Route bleiben transaktional konsistent |
| Driver Status | forward-only Zustände, Probleme und POD | Analytics schreibt nie Delivery-Status |
| Delivery Dates | gewünschte/fixe Daten bleiben erhalten | Optimierung respektiert normalisierte Fenster |
| Restaurant Availability | bisheriger Checkout bleibt möglich | ASAP wird nur innerhalb autoritativer Verfügbarkeiten geplant |
| Delivery Zones | bestehende PLZ/Koordinaten bleiben Stammdaten | Konsolidierung verwendet serverseitige Supplier-Zonenprüfung |
| Mehrweg | Delivery und POD bleiben unverändert | Rückgabe kann nicht aus Paketanzahl oder Delivery Completion erfunden werden |
| Dashboard | bestehende Layouts und gespeicherte Widgets bleiben gültig | neues Widget ist optional und rollenbegrenzt |
| Monthly Reports | bestehende Ausgaben- und Savings-Zahlen bleiben identisch | optionale Impact-Felder haben Methodikversion |
| AI | bestehende Authz und Rollenbegrenzung bleiben | keine Berechnung aus freiem Prompt; nur typisierte Impact-Quelle |
| Mobile | bestehende Kartenhöhe, Bottom Nav und Safe Areas | ein Signal pro Karte; Details nur progressiv |
| Localization | bestehende DE/IT-UI und Landing-Sprachen bleiben | Impact UI/PDF/Notifications nutzen dieselbe Terminologie |

## 11. Verifizierte Startpunkte im Code

- `shared/schema.ts:38-79` — Organisation, Standort, Präferenzen und Freigabestatus
- `shared/schema.ts:152-193` — Produkt und ERP-Verantwortung
- `shared/schema.ts:219-278` — Bestellung, Positionen und bestätigte Mengen
- `shared/schema.ts:440-506` — Lieferpläne, Promotionen und Inventory Risk
- `shared/schema.ts:1109-1137` — Monatsbericht-Payload und Persistenz
- `shared/schema.ts:1453-1545` — Fahrer-Routen, Assignments, ETA, Strecke und GPS
- `shared/permissions.ts:13-83` — Capability-Matrix
- `shared/permissions.ts:87-145,193-240` — Warehouse-/Driver-API-Grenzen
- `client/src/pages/restaurant/Catalog.tsx` — Suche, Filter, Karten und Mobile Quick Add
- `client/src/pages/restaurant/ProductDetail.tsx` — Detail, Kaufhistorie und Alternativen
- `client/src/pages/restaurant/Cart.tsx` — Lieferantengruppen, Liefertermine und Checkout
- `client/src/pages/supplier/InventoryRisk.tsx` — Risk Review und Promotion-Aktion
- `client/src/pages/driver/RoutePlanner.tsx` — Route, Stopps, ETA und Optimierung
- `client/src/components/RestaurantDashboardWidgets.tsx` — Restaurant-Widget-System
- `client/src/components/SupplierDashboardWidgets.tsx` — Supplier-Widget-System
- `client/src/pages/restaurant/MonthlyReports.tsx` — Report UI, Detail, Export und Mobile
- `client/src/pages/Landing.tsx` — bestehende Marketing- und Motion-Struktur
- `server/routes.ts:2040-2107` — Product Read, Order Insights und Purchase History
- `server/routes.ts:2656-2923` — Inventory Risk, Risk Action und Delivery Schedules
- `server/routes.ts:3168-4451` — Cart, Checkout und Order Lifecycle
- `server/routes.ts:5532-5608` — Restaurant-/Supplier-Statistiken
- `server/routes.ts:8352-8444` — Monatsbericht-Routen
- `server/routes.ts:8585-9703` — Routing, Assignments, ETA, GPS und Tracking
- `server/monthlyReportService.ts` — zentrale Monatsbericht-Berechnung und PDF

## 12. Abschlussentscheidung

Die Erweiterung ist technisch sinnvoll, wenn sie als gemeinsame Intelligence-Schicht umgesetzt wird. Der bestehende Marketplace, Inventory-Risk-Workflow und Driver-Flow sollten nicht ersetzt werden.

Die korrekte Reihenfolge lautet:

`Define → Source → Verify → Calculate → Explain → Display`

nicht:

`Display → Guess → Duplicate`

Der nächste sinnvolle Umsetzungsschritt ist ausschließlich P0.1: fachliche Definitionen, minimale Produktmetadaten, Confidence-Vertrag, gemeinsame Berechnungsschicht und Berechtigungen. Erst danach sollten sichtbare Badges, Filter, Scores oder Marketing-Claims gebaut werden.