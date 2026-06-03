import type { Lang } from "@/context/LanguageContext";

export type TourPlacement = "auto" | "top" | "bottom" | "left" | "right" | "center";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** data-testid of element to highlight. If omitted: centered popover, no highlight. */
  targetTestId?: string;
  /** Wouter path to navigate to before showing the step. */
  page?: string;
  placement?: TourPlacement;
}

export interface HelpTopic {
  id: string;
  category: string;
  title: string;
  summary: string;
  steps: string[];
  /** Optional illustrative image/screenshot URL for the topic. */
  imageUrl?: string;
  /** When provided, the topic offers a "Auf der Seite zeigen" button that starts these tour steps. */
  tour?: TourStep[];
}

const t = (de: string, it: string, lang: Lang) => (lang === "it" ? it : de);

export type TourView = "web" | "mobile";

export interface PageTutorial {
  /** Stable id persisted in user.seenPageIntros, e.g. "restaurant:catalog". View-independent. */
  id: string;
  /** Exact wouter path that triggers this tutorial on first visit. */
  path: string;
  /** Short human label for the Help Center replay list. */
  label: string;
  steps: TourStep[];
}

/** Short one-time welcome shown as the first step of the home tutorial. */
function welcomeStep(role: "restaurant" | "supplier", lang: Lang): TourStep {
  return {
    id: "welcome",
    title: t("Willkommen bei GastroConnect", "Benvenuto in GastroConnect", lang),
    body: t(
      "Schön, dass Sie da sind! Wir begrüßen Sie hier nur kurz — danach zeigen wir Ihnen jede Seite mit einer kleinen Einführung, sobald Sie sie zum ersten Mal öffnen. Sie können jede Einführung überspringen oder alle auf einmal ausblenden.",
      "Che bello avervi qui! Questo è solo un breve benvenuto — poi, alla prima apertura di ogni pagina, vi mostreremo una piccola introduzione. Potete saltare ogni introduzione o nasconderle tutte in una volta.",
      lang,
    ),
    page: `/${role}`,
    placement: "center",
  };
}

export function getPageTutorials(role: "restaurant" | "supplier", view: TourView, lang: Lang): PageTutorial[] {
  const mobile = view === "mobile";
  if (role === "restaurant") {
    return [
      {
        id: "restaurant:home",
        path: "/restaurant",
        label: t("Startseite", "Home", lang),
        steps: [
          welcomeStep("restaurant", lang),
          {
            id: "home-kpis",
            targetTestId: "kpi-card-active-orders",
            title: t("Ihr Dashboard", "La vostra dashboard", lang),
            body: t(
              "Die Kacheln oben zeigen ungelesene Nachrichten, offene Bestellungen, Wareneinsatz und monatliche Ausgaben auf einen Blick.",
              "Le card in alto mostrano messaggi non letti, ordini in sospeso, costo merce e spesa mensile a colpo d'occhio.",
              lang,
            ),
            page: "/restaurant",
            placement: "bottom",
          },
        ],
      },
      {
        id: "restaurant:catalog",
        path: "/restaurant/catalog",
        label: t("Katalog", "Catalogo", lang),
        steps: [
          {
            id: "catalog-intro",
            targetTestId: mobile ? "restaurant-mobile-nav-catalog" : "nav-link-catalog",
            title: t("Bestellung anlegen", "Creare un ordine", lang),
            body: t(
              "Hier sehen Sie alle Produkte Ihrer Lieferanten. Wählen Sie Artikel und Mengen, legen Sie sie in den Warenkorb und senden die Bestellung in einem Schritt ab.",
              "Qui trovate tutti i prodotti dei vostri fornitori. Scegliete articoli e quantità, aggiungeteli al carrello e inviate l'ordine in un colpo solo.",
              lang,
            ),
            page: "/restaurant/catalog",
            placement: mobile ? "top" : "bottom",
          },
        ],
      },
      {
        id: "restaurant:inbox",
        path: "/restaurant/inbox",
        label: t("Inbox", "Inbox", lang),
        steps: [
          {
            id: "inbox-intro",
            targetTestId: mobile ? "restaurant-mobile-nav-inbox" : "nav-link-inbox",
            title: t("Inbox & Chat", "Inbox e chat", lang),
            body: t(
              "Hier sprechen Sie direkt mit Ihren Lieferanten — pro Bestellung, mit Lieferschein, Reklamationen und Statusupdates.",
              "Qui comunicate direttamente con i fornitori — per ordine, con bolla di consegna, reclami e aggiornamenti di stato.",
              lang,
            ),
            page: "/restaurant/inbox",
            placement: mobile ? "top" : "bottom",
          },
        ],
      },
      {
        id: "restaurant:orders",
        path: "/restaurant/orders",
        label: t("Bestellungen", "Ordini", lang),
        steps: [
          {
            id: "orders-intro",
            targetTestId: mobile ? "restaurant-mobile-nav-more" : "nav-link-orders",
            title: t("Bestellungen & Reklamationen", "Ordini e reclami", lang),
            body: mobile
              ? t(
                  "Offene und vergangene Bestellungen verwalten Sie hier. Über „Mehr“ erreichen Sie auch Vorlagen, Lieferkalender, Dokumente und Reklamationen.",
                  "Qui gestite ordini aperti e passati. Da „Altro“ raggiungete anche modelli, calendario, documenti e reclami.",
                  lang,
                )
              : t(
                  "Hier finden Sie offene und vergangene Bestellungen, Vorlagen, den Lieferkalender und das Reklamationsformular für beschädigte oder fehlende Ware.",
                  "Qui trovate ordini aperti e passati, modelli, calendario di consegna e il modulo reclami per merce mancante o danneggiata.",
                  lang,
                ),
            page: "/restaurant/orders",
            placement: mobile ? "top" : "bottom",
          },
        ],
      },
      {
        id: "restaurant:price-comparison",
        path: "/restaurant/price-comparison",
        label: t("Preisvergleich", "Confronto prezzi", lang),
        steps: [
          {
            id: "price-comp-intro",
            targetTestId: mobile ? "restaurant-mobile-nav-price-comparison" : "nav-link-catalog",
            title: t("Preisvergleich", "Confronto prezzi", lang),
            body: t(
              "Vergleichen Sie identische Produkte über alle Lieferanten nebeneinander und finden Sie den günstigsten Preis. Sortieren Sie nach Ersparnis, Name oder Preis.",
              "Confrontate prodotti identici di tutti i fornitori uno accanto all'altro e trovate il prezzo più conveniente. Ordinate per risparmio, nome o prezzo.",
              lang,
            ),
            page: "/restaurant/price-comparison",
            placement: mobile ? "top" : "bottom",
          },
        ],
      },
      {
        id: "restaurant:cost-analysis",
        path: "/restaurant/cost-analysis",
        label: t("Kostenanalyse", "Analisi costi", lang),
        steps: [
          {
            id: "cost-analysis-intro",
            targetTestId: mobile ? "restaurant-mobile-nav-more" : "nav-link-catalog",
            title: t("Wareneinsatz / Kostenanalyse", "Costo merce / Analisi costi", lang),
            body: t(
              "Setzen Sie ein monatliches Ziel, tragen Sie täglich die Übernachtungen ein und verfolgen Sie Wareneinsatz pro Gast samt Trends im Chart.",
              "Impostate un obiettivo mensile, inserite ogni giorno i pernottamenti e monitorate il costo merce per ospite con le tendenze nel grafico.",
              lang,
            ),
            page: "/restaurant/cost-analysis",
            placement: mobile ? "top" : "bottom",
          },
        ],
      },
      {
        id: "restaurant:documents",
        path: "/restaurant/documents",
        label: t("Dokumente", "Documenti", lang),
        steps: [
          {
            id: "documents-intro",
            targetTestId: mobile ? "restaurant-mobile-nav-more" : "nav-link-orders",
            title: t("Lieferscheine & Rechnungen", "Bolle e fatture", lang),
            body: t(
              "Alle Lieferscheine und Monatsrechnungen sind hier nach Lieferant geordnet — mit Statistik und Mini-Chart pro Lieferant.",
              "Tutte le bolle e fatture mensili sono ordinate per fornitore — con statistiche e mini-grafico per ogni fornitore.",
              lang,
            ),
            page: "/restaurant/documents",
            placement: mobile ? "top" : "bottom",
          },
        ],
      },
    ];
  }

  return [
    {
      id: "supplier:home",
      path: "/supplier",
      label: t("Startseite", "Home", lang),
      steps: [
        welcomeStep("supplier", lang),
        {
          id: "home-stats",
          targetTestId: "kpi-card-stats",
          title: t("Statistiken & Dashboard", "Statistiche e dashboard", lang),
          body: t(
            "Umsatz, Top-Produkte und Trends sehen Sie direkt auf der Startseite. Das Dashboard können Sie selbst zusammenstellen.",
            "Fatturato, prodotti top e tendenze sono visibili direttamente in home. Potete personalizzare la dashboard.",
            lang,
          ),
          page: "/supplier",
          placement: "bottom",
        },
      ],
    },
    {
      id: "supplier:orders",
      path: "/supplier/orders",
      label: t("Bestellungen", "Ordini", lang),
      steps: [
        {
          id: "orders-intro",
          targetTestId: mobile ? "supplier-mobile-nav-orders" : "nav-link-orders",
          title: t("Eingehende Bestellungen", "Ordini in arrivo", lang),
          body: t(
            "Hier sehen Sie alle Bestellungen Ihrer Kunden. Bestätigen, teil-bestätigen, anpassen oder als geliefert markieren — alles aus einer Liste.",
            "Qui vedete tutti gli ordini dei vostri clienti. Confermate, confermate parzialmente, modificate o segnate come consegnato — tutto da una lista.",
            lang,
          ),
          page: "/supplier/orders",
          placement: mobile ? "top" : "bottom",
        },
      ],
    },
    {
      id: "supplier:products",
      path: "/supplier/products",
      label: t("Produkte", "Prodotti", lang),
      steps: [
        {
          id: "products-intro",
          targetTestId: mobile ? "supplier-mobile-nav-products" : "nav-link-products",
          title: t("Produkte & Bestand", "Prodotti e magazzino", lang),
          body: t(
            "Pflegen Sie Ihr Sortiment, Lagerbestände, Aktionen und kundenspezifische Preise zentral unter „Produkte“.",
            "Gestite il vostro assortimento, le scorte, le promozioni e i prezzi specifici per cliente in „Prodotti“.",
            lang,
          ),
          page: "/supplier/products",
          placement: mobile ? "top" : "bottom",
        },
      ],
    },
    {
      id: "supplier:inbox",
      path: "/supplier/inbox",
      label: t("Inbox", "Inbox", lang),
      steps: [
        {
          id: "inbox-intro",
          targetTestId: mobile ? "supplier-mobile-nav-inbox" : "nav-link-inbox",
          title: t("Inbox & Reklamationen", "Inbox e reclami", lang),
          body: t(
            "Chatten Sie direkt mit Ihren Kunden, beantworten Sie Reklamationen und erstellen Sie Nachlieferungen mit einem Klick.",
            "Chattate direttamente con i clienti, gestite i reclami e create consegne successive con un clic.",
            lang,
          ),
          page: "/supplier/inbox",
          placement: mobile ? "top" : "bottom",
        },
      ],
    },
    {
      id: "supplier:inventory",
      path: "/supplier/inventory",
      label: t("Bestandsverwaltung", "Gestione magazzino", lang),
      steps: [
        {
          id: "inventory-intro",
          targetTestId: mobile ? "supplier-mobile-nav-more" : "nav-link-products",
          title: t("Bestandsverwaltung", "Gestione magazzino", lang),
          body: t(
            "Hier sehen Sie alle Produkte mit aktuellem Bestand. Bestätigte Bestellungen reduzieren den Bestand automatisch, und Sie werden bei niedrigem Bestand gewarnt.",
            "Qui vedete tutti i prodotti con la scorta attuale. Gli ordini confermati riducono automaticamente la scorta e vi avvisiamo in caso di scorte basse.",
            lang,
          ),
          page: "/supplier/inventory",
          placement: mobile ? "top" : "bottom",
        },
      ],
    },
    {
      id: "supplier:promotions",
      path: "/supplier/promotions",
      label: t("Aktionen", "Promozioni", lang),
      steps: [
        {
          id: "promotions-intro",
          targetTestId: mobile ? "supplier-mobile-nav-more" : "nav-link-products",
          title: t("Aktionen / Promotions", "Promozioni", lang),
          body: t(
            "Legen Sie zeitlich begrenzte Rabatte an — optional gezielt für ausgewählte Kunden. Aktionen werden Kunden im Katalog hervorgehoben.",
            "Create sconti a tempo limitato — opzionalmente mirati a clienti specifici. Le promozioni vengono evidenziate ai clienti nel catalogo.",
            lang,
          ),
          page: "/supplier/promotions",
          placement: mobile ? "top" : "bottom",
        },
      ],
    },
  ];
}

/** Resolve the page tutorial (if any) for an exact path, given role + view. */
export function getPageIntroForPath(
  path: string,
  role: "restaurant" | "supplier",
  view: TourView,
  lang: Lang,
): PageTutorial | null {
  const clean = path.split("?")[0];
  return getPageTutorials(role, view, lang).find((tut) => tut.path === clean) || null;
}

export function getQuickTour(role: "restaurant" | "supplier", lang: Lang): TourStep[] {
  if (role === "restaurant") {
    return [
      {
        id: "welcome",
        title: t("Willkommen bei GastroConnect", "Benvenuto in GastroConnect", lang),
        body: t(
          "In 4 kurzen Schritten zeigen wir Ihnen die wichtigsten Funktionen. Sie können die Tour jederzeit überspringen und später im Hilfe-Center wieder starten.",
          "In 4 brevi passi vi mostriamo le funzioni più importanti. Potete saltare la guida in qualsiasi momento e riavviarla dal Centro assistenza.",
          lang,
        ),
        page: "/restaurant",
        placement: "center",
      },
      {
        id: "kpis",
        targetTestId: "kpi-card-active-orders",
        title: t("Ihr Dashboard", "La vostra dashboard", lang),
        body: t(
          "Die Kacheln oben zeigen ungelesene Nachrichten, offene Bestellungen, Wareneinsatz und monatliche Ausgaben auf einen Blick.",
          "Le card in alto mostrano messaggi non letti, ordini in sospeso, costo merce e spesa mensile a colpo d'occhio.",
          lang,
        ),
        page: "/restaurant",
        placement: "bottom",
      },
      {
        id: "catalog",
        targetTestId: "nav-link-catalog",
        title: t("Bestellung anlegen", "Creare un ordine", lang),
        body: t(
          "Über „Katalog“ öffnen Sie alle verfügbaren Produkte Ihrer Lieferanten. Legen Sie Artikel in den Warenkorb und schicken die Bestellung in einem Schritt ab.",
          "In „Catalogo“ trovate tutti i prodotti dei vostri fornitori. Aggiungete articoli al carrello e inviate l'ordine in un colpo solo.",
          lang,
        ),
        page: "/restaurant",
        placement: "bottom",
      },
      {
        id: "inbox",
        targetTestId: "nav-link-inbox",
        title: t("Inbox & Chat", "Inbox e chat", lang),
        body: t(
          "Hier sprechen Sie direkt mit Ihren Lieferanten — pro Bestellung, mit Lieferschein, Reklamationen und Statusupdates.",
          "Qui comunicate direttamente con i fornitori — per ordine, con bolla di consegna, reclami e aggiornamenti di stato.",
          lang,
        ),
        page: "/restaurant",
        placement: "bottom",
      },
      {
        id: "complaints",
        targetTestId: "nav-link-orders",
        title: t("Bestellungen & Reklamationen", "Ordini e reclami", lang),
        body: t(
          "Unter „Bestellungen“ finden Sie offene und vergangene Bestellungen, Vorlagen, den Lieferkalender und das Reklamationsformular für beschädigte oder fehlende Ware.",
          "In „Ordini“ trovate ordini aperti e passati, modelli, calendario di consegna e il modulo reclami per merce mancante o danneggiata.",
          lang,
        ),
        page: "/restaurant",
        placement: "bottom",
      },
    ];
  }
  return [
    {
      id: "welcome",
      title: t("Willkommen bei GastroConnect", "Benvenuto in GastroConnect", lang),
      body: t(
        "In 4 kurzen Schritten zeigen wir Ihnen die wichtigsten Funktionen für Lieferanten. Sie können die Tour jederzeit überspringen.",
        "In 4 brevi passi vi mostriamo le funzioni più importanti per i fornitori. Potete saltare la guida in qualsiasi momento.",
        lang,
      ),
      page: "/supplier",
      placement: "center",
    },
    {
      id: "orders",
      targetTestId: "nav-link-orders",
      title: t("Eingehende Bestellungen", "Ordini in arrivo", lang),
      body: t(
        "Hier sehen Sie alle Bestellungen Ihrer Kunden. Bestätigen, teil-bestätigen, anpassen oder als geliefert markieren — alles aus einer Liste.",
        "Qui vedete tutti gli ordini dei vostri clienti. Confermate, confermate parzialmente, modificate o segnate come consegnato — tutto da una lista.",
        lang,
      ),
      page: "/supplier",
      placement: "bottom",
    },
    {
      id: "products",
      targetTestId: "nav-link-products",
      title: t("Produkte & Bestand", "Prodotti e magazzino", lang),
      body: t(
        "Pflegen Sie Ihr Sortiment, Lagerbestände, Aktionen und Kunden-spezifische Preise zentral unter „Produkte“.",
        "Gestite il vostro assortimento, le scorte, le promozioni e i prezzi specifici per cliente in „Prodotti“.",
        lang,
      ),
      page: "/supplier",
      placement: "bottom",
    },
    {
      id: "inbox",
      targetTestId: "nav-link-inbox",
      title: t("Inbox & Reklamationen", "Inbox e reclami", lang),
      body: t(
        "Chatten Sie direkt mit Ihren Kunden, beantworten Sie Reklamationen und erstellen Sie Nachlieferungen mit einem Klick.",
        "Chattate direttamente con i clienti, gestite i reclami e create consegne successive con un clic.",
        lang,
      ),
      page: "/supplier",
      placement: "bottom",
    },
    {
      id: "stats",
      targetTestId: "kpi-card-revenue",
      title: t("Statistiken & Dashboard", "Statistiche e dashboard", lang),
      body: t(
        "Umsatz, Top-Produkte und Trends sehen Sie direkt auf der Startseite. Das Dashboard können Sie selbst zusammenstellen.",
        "Fatturato, prodotti top e tendenze sono visibili direttamente in home. Potete personalizzare la dashboard.",
        lang,
      ),
      page: "/supplier",
      placement: "bottom",
    },
  ];
}

export function getHelpTopics(role: "restaurant" | "supplier", lang: Lang): HelpTopic[] {
  if (role === "restaurant") {
    return [
      {
        id: "orders-create",
        category: t("Bestellungen", "Ordini", lang),
        title: t("Bestellung anlegen", "Creare un ordine", lang),
        summary: t(
          "Produkte über den Katalog oder per Direktbestellung in den Warenkorb legen und an einen oder mehrere Lieferanten senden.",
          "Aggiungete prodotti dal catalogo o per ordine diretto al carrello e inviate a uno o più fornitori.",
          lang,
        ),
        steps: [
          t("Öffnen Sie „Katalog“ und filtern nach Lieferant oder Kategorie.", "Aprite „Catalogo“ e filtrate per fornitore o categoria.", lang),
          t("Tippen Sie auf ein Produkt, wählen Sie die Menge und legen Sie es in den Warenkorb.", "Toccate un prodotto, scegliete la quantità e aggiungetelo al carrello.", lang),
          t("Im Warenkorb wählen Sie pro Lieferant das Lieferdatum (verfügbare Tage sind hervorgehoben).", "Nel carrello scegliete per ogni fornitore la data di consegna (i giorni disponibili sono evidenziati).", lang),
          t("Mit „Bestellung absenden“ gehen die Bestellungen an alle ausgewählten Lieferanten.", "Con „Invia ordine“ gli ordini partono verso tutti i fornitori selezionati.", lang),
        ],
        tour: getQuickTour("restaurant", lang).filter(s => s.id === "catalog"),
      },
      {
        id: "orders-templates",
        category: t("Bestellungen", "Ordini", lang),
        title: t("Bestellvorlagen", "Modelli d'ordine", lang),
        summary: t(
          "Wiederkehrende Bestellungen als Vorlage speichern und mit einem Klick in den Warenkorb laden.",
          "Salvate ordini ricorrenti come modello e caricateli nel carrello con un clic.",
          lang,
        ),
        steps: [
          t("Gehen Sie auf „Bestellungen → Bestellvorlagen“.", "Andate su „Ordini → Modelli d'ordine“.", lang),
          t("„Neue Vorlage“ leer anlegen oder aus einer vergangenen Bestellung übernehmen.", "Create una „Nuova vorlage“ vuota o partendo da un ordine passato.", lang),
          t("Auf der Startseite erscheinen bis zu 3 Vorlagen als Schnellaktion.", "In home compaiono fino a 3 modelli come azione rapida.", lang),
        ],
        tour: [
          {
            id: "templates-nav",
            targetTestId: "nav-link-orders",
            title: t("Bestellvorlagen", "Modelli d'ordine", lang),
            body: t(
              "Öffnen Sie „Bestellungen“ und scrollen Sie zum Abschnitt „Bestellvorlagen“. Dort können Sie neue Vorlagen erstellen oder bestehende laden.",
              "Aprite „Ordini“ e scorrete fino alla sezione „Modelli d'ordine“. Lì potete creare nuovi modelli o caricarne di esistenti.",
              lang,
            ),
            page: "/restaurant",
            placement: "bottom",
          },
        ],
      },
      {
        id: "complaints",
        category: t("Reklamationen", "Reclami", lang),
        title: t("Reklamation erstellen", "Creare un reclamo", lang),
        summary: t(
          "Beschädigte, fehlende oder falsche Ware direkt aus einer Bestellung melden.",
          "Segnalate merce danneggiata, mancante o errata direttamente da un ordine.",
          lang,
        ),
        steps: [
          t("Öffnen Sie die Bestellung und tippen auf „Reklamieren“.", "Aprite l'ordine e toccate „Reclama“.", lang),
          t("Wählen Sie Grund und betroffene Artikel mit Menge.", "Scegliete il motivo e gli articoli coinvolti con la quantità.", lang),
          t("Beim Lieferanten landet automatisch eine Nachricht mit hoher Priorität.", "Al fornitore arriva automaticamente un messaggio ad alta priorità.", lang),
        ],
        tour: [
          {
            id: "complaints-nav",
            targetTestId: "nav-link-orders",
            title: t("Reklamation erstellen", "Creare un reclamo", lang),
            body: t(
              "Reklamationen starten Sie immer aus einer Bestellung heraus. Öffnen Sie „Bestellungen“ und wählen Sie den betroffenen Auftrag.",
              "I reclami si avviano sempre da un ordine. Aprite „Ordini“ e selezionate l'ordine interessato.",
              lang,
            ),
            page: "/restaurant",
            placement: "bottom",
          },
        ],
      },
      {
        id: "price-comparison",
        category: t("Sparen", "Risparmiare", lang),
        title: t("Preisvergleich", "Confronto prezzi", lang),
        summary: t(
          "Vergleichen Sie identische Produkte über alle Lieferanten und finden Sie den günstigsten Preis.",
          "Confrontate prodotti identici tra tutti i fornitori e trovate il prezzo più conveniente.",
          lang,
        ),
        steps: [
          t("Öffnen Sie „Katalog → Preisvergleich“.", "Aprite „Catalogo → Confronto prezzi“.", lang),
          t("Sortieren Sie nach Ersparnis, Name oder Preis.", "Ordinate per risparmio, nome o prezzo.", lang),
        ],
        tour: [
          {
            id: "price-comp-nav",
            targetTestId: "nav-link-catalog",
            title: t("Preisvergleich", "Confronto prezzi", lang),
            body: t(
              "Im Menü „Katalog“ finden Sie den Eintrag „Preisvergleich“ — dort sehen Sie identische Produkte aller Lieferanten nebeneinander.",
              "Nel menu „Catalogo“ trovate „Confronto prezzi“ — lì vedete prodotti identici di tutti i fornitori uno accanto all'altro.",
              lang,
            ),
            page: "/restaurant",
            placement: "bottom",
          },
        ],
      },
      {
        id: "cost-analysis",
        category: t("Statistiken", "Statistiche", lang),
        title: t("Wareneinsatz / Kostenanalyse", "Costo merce / Analisi costi", lang),
        summary: t(
          "Verfolgen Sie Ihre Lebensmittelkosten pro Gast und tragen Sie Übernachtungen ein.",
          "Monitorate il costo merce per ospite e inserite i pernottamenti.",
          lang,
        ),
        steps: [
          t("Setzen Sie unter „Kostenanalyse“ Ihr monatliches Ziel.", "In „Analisi costi“ impostate il vostro obiettivo mensile.", lang),
          t("Tragen Sie täglich die Anzahl der Übernachtungen ein.", "Inserite ogni giorno il numero di pernottamenti.", lang),
          t("Sehen Sie Wareneinsatz pro Gast und Trends im Chart.", "Vedete il costo merce per ospite e le tendenze nel grafico.", lang),
        ],
        tour: [
          {
            id: "cost-nav",
            targetTestId: "kpi-card-active-orders",
            title: t("Kostenanalyse", "Analisi costi", lang),
            body: t(
              "Im Menü „Mehr“ (oder unter „Kostenanalyse“) öffnen Sie das Dashboard für Wareneinsatz pro Gast.",
              "Nel menu „Altro“ (o sotto „Analisi costi“) aprite la dashboard del costo merce per ospite.",
              lang,
            ),
            page: "/restaurant",
            placement: "bottom",
          },
        ],
      },
      {
        id: "documents",
        category: t("Dokumente", "Documenti", lang),
        title: t("Lieferscheine & Rechnungen", "Bolle e fatture", lang),
        summary: t(
          "Alle Lieferscheine und Monatsrechnungen pro Lieferant geordnet abrufen.",
          "Tutte le bolle e fatture mensili ordinate per fornitore.",
          lang,
        ),
        steps: [
          t("Öffnen Sie „Bestellungen → Dokumente“.", "Aprite „Ordini → Documenti“.", lang),
          t("Pro Lieferant sehen Sie Statistik, Mini-Chart und alle Dokumente.", "Per ogni fornitore vedete statistiche, mini-grafico e tutti i documenti.", lang),
        ],
        tour: [
          {
            id: "docs-nav",
            targetTestId: "nav-link-orders",
            title: t("Dokumente", "Documenti", lang),
            body: t(
              "Unter „Bestellungen → Dokumente“ finden Sie alle Lieferscheine und Rechnungen pro Lieferant.",
              "In „Ordini → Documenti“ trovate tutte le bolle e fatture per fornitore.",
              lang,
            ),
            page: "/restaurant",
            placement: "bottom",
          },
        ],
      },
    ];
  }

  return [
    {
      id: "orders-confirm",
      category: t("Bestellungen", "Ordini", lang),
      title: t("Bestellungen bestätigen", "Confermare ordini", lang),
      summary: t(
        "Bestätigen Sie eingehende Bestellungen ganz oder teilweise und steuern Sie den Lieferstatus.",
        "Confermate gli ordini in arrivo in toto o parzialmente e gestite lo stato di consegna.",
        lang,
      ),
      steps: [
        t("In „Bestellungen“ sehen Sie offene Aufträge mit Inline-Aktionen.", "In „Ordini“ vedete gli ordini aperti con azioni inline.", lang),
        t("„Bestätigen“ akzeptiert die volle Menge — „Teil-Bestätigen“ erlaubt Mengenanpassung pro Artikel.", "„Conferma“ accetta la quantità completa — „Conferma parziale“ permette di adeguare la quantità per articolo.", lang),
        t("Beim Status „Geliefert“ wird automatisch ein Lieferschein im Chat erzeugt.", "Allo stato „Consegnato“ viene generata automaticamente una bolla nel chat.", lang),
      ],
      tour: [
        {
          id: "orders-confirm-nav",
          targetTestId: "nav-link-orders",
          title: t("Bestellungen bestätigen", "Confermare ordini", lang),
          body: t(
            "Im Reiter „Bestellungen“ finden Sie alle offenen Aufträge mit Inline-Aktionen für Bestätigung, Teil-Bestätigung und Lieferstatus.",
            "Nella scheda „Ordini“ trovate tutti gli ordini aperti con azioni inline per conferma, conferma parziale e stato consegna.",
            lang,
          ),
          page: "/supplier",
          placement: "bottom",
        },
      ],
    },
    {
      id: "products-stock",
      category: t("Produkte", "Prodotti", lang),
      title: t("Bestandsverwaltung", "Gestione magazzino", lang),
      summary: t(
        "Pflegen Sie Lagerbestände, sehen Sie alle Bewegungen und werden bei niedrigem Bestand gewarnt.",
        "Gestite le scorte, vedete tutti i movimenti e siete avvisati in caso di scorte basse.",
        lang,
      ),
      steps: [
        t("In „Bestandsverwaltung“ sehen Sie alle Produkte mit aktuellem Bestand.", "In „Gestione magazzino“ vedete tutti i prodotti con scorta attuale.", lang),
        t("Bestätigte Bestellungen reduzieren den Bestand automatisch.", "Gli ordini confermati riducono automaticamente la scorta.", lang),
        t("Setzen Sie pro Produkt einen Schwellenwert für „niedriger Bestand“.", "Impostate per ogni prodotto una soglia per „scorta bassa“.", lang),
      ],
      tour: [
        {
          id: "stock-nav",
          targetTestId: "nav-link-products",
          title: t("Bestandsverwaltung", "Gestione magazzino", lang),
          body: t(
            "Öffnen Sie „Produkte → Bestandsverwaltung“ — dort sehen Sie aktuelle Bestände, Bewegungen und niedrige Schwellen.",
            "Aprite „Prodotti → Gestione magazzino“ — lì vedete scorte attuali, movimenti e soglie basse.",
            lang,
          ),
          page: "/supplier",
          placement: "bottom",
        },
      ],
    },
    {
      id: "promotions",
      category: t("Sortiment", "Assortimento", lang),
      title: t("Aktionen / Promotions", "Promozioni", lang),
      summary: t(
        "Vergünstigen Sie Produkte zeitlich begrenzt und gezielt für ausgewählte Kunden.",
        "Scontate prodotti per un periodo limitato, anche per clienti selezionati.",
        lang,
      ),
      steps: [
        t("Unter „Produkte → Aktionen“ Promotion mit Rabatt, Zeitraum und Zielkunden anlegen.", "In „Prodotti → Promozioni“ create promozioni con sconto, periodo e clienti target.", lang),
        t("Die Aktion wird Kunden im Katalog hervorgehoben.", "La promozione viene evidenziata ai clienti nel catalogo.", lang),
      ],
      tour: [
        {
          id: "promo-nav",
          targetTestId: "nav-link-products",
          title: t("Promotions anlegen", "Creare promozioni", lang),
          body: t(
            "Unter „Produkte → Aktionen“ legen Sie zeitlich begrenzte Rabatte an, optional gezielt für ausgewählte Kunden.",
            "In „Prodotti → Promozioni“ create sconti a tempo limitato, opzionalmente mirati a clienti specifici.",
            lang,
          ),
          page: "/supplier",
          placement: "bottom",
        },
      ],
    },
    {
      id: "delivery-days",
      category: t("Lieferungen", "Consegne", lang),
      title: t("Lieferzeiten pro Kunde", "Giorni di consegna per cliente", lang),
      summary: t(
        "Definieren Sie Wochentage und Zeitfenster, an denen Sie an einen Kunden liefern.",
        "Definite giorni della settimana e fasce orarie in cui consegnate a un cliente.",
        lang,
      ),
      steps: [
        t("Unter „Produkte → Kunden“ öffnen Sie einen Kunden.", "In „Prodotti → Clienti“ aprite un cliente.", lang),
        t("Wählen Sie Tage und optional Zeitfenster — der Kunde sieht nur diese Tage im Warenkorb.", "Scegliete i giorni e (opzionale) le fasce orarie — il cliente vedrà solo questi giorni nel carrello.", lang),
      ],
      tour: [
        {
          id: "deliv-days-nav",
          targetTestId: "nav-link-products",
          title: t("Lieferzeiten pro Kunde", "Giorni di consegna per cliente", lang),
          body: t(
            "Unter „Produkte → Kunden“ öffnen Sie einen Kunden und legen Wochentage sowie optionale Zeitfenster fest.",
            "In „Prodotti → Clienti“ aprite un cliente e impostate giorni e fasce orarie opzionali.",
            lang,
          ),
          page: "/supplier",
          placement: "bottom",
        },
      ],
    },
    {
      id: "complaints",
      category: t("Reklamationen", "Reclami", lang),
      title: t("Reklamationen bearbeiten", "Gestire reclami", lang),
      summary: t(
        "Auf Reklamationen reagieren und Nachlieferungen mit einem Klick erstellen.",
        "Rispondete ai reclami e create consegne successive con un clic.",
        lang,
      ),
      steps: [
        t("Öffnen Sie die Reklamation in der Inbox oder unter „Reklamationen“.", "Aprite il reclamo in inbox o in „Reclami“.", lang),
        t("Mit „Nachlieferung erstellen“ passen Sie Mengen und Liefertermin an — der Folgeauftrag ist sofort bestätigt.", "Con „Crea consegna successiva“ adeguate quantità e data — il nuovo ordine è subito confermato.", lang),
      ],
      tour: [
        {
          id: "compl-nav",
          targetTestId: "nav-link-inbox",
          title: t("Reklamationen", "Reclami", lang),
          body: t(
            "Reklamationen erscheinen in der Inbox mit hoher Priorität. Von dort starten Sie auch direkt eine Nachlieferung.",
            "I reclami compaiono in inbox con alta priorità. Da lì avviate direttamente una consegna successiva.",
            lang,
          ),
          page: "/supplier",
          placement: "bottom",
        },
      ],
    },
    {
      id: "stats",
      category: t("Statistiken", "Statistiche", lang),
      title: t("Statistiken & Dashboard", "Statistiche e dashboard", lang),
      summary: t(
        "Umsatz, Top-Produkte, Top-Kunden und Trends auf einen Blick.",
        "Fatturato, prodotti top, clienti top e tendenze a colpo d'occhio.",
        lang,
      ),
      steps: [
        t("Die Startseite zeigt KPIs, 6-Monats-Umsatz und Top-Produkte.", "La home mostra KPI, fatturato a 6 mesi e prodotti top.", lang),
        t("Karten lassen sich per Drag & Drop selbst anordnen.", "Le card si possono riordinare con drag & drop.", lang),
      ],
      tour: getQuickTour("supplier", lang).filter(s => s.id === "stats"),
    },
  ];
}
