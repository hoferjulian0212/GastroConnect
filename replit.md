# GastroConnect

## Overview
GastroConnect is a web application designed to streamline interactions between restaurants and suppliers in the gastronomy industry. It provides distinct, role-based interfaces for restaurants (customers) and suppliers (vendors) to manage orders, inventory, and communications. Key features include a WhatsApp-style chat system, mobile responsiveness, a notification system with deep-linking, delivery note generation, a promotions system, configurable delivery schedules, and order modification capabilities. The platform aims to enhance efficiency in the food service supply chain through improved ordering and communication.

## User Preferences
Preferred communication style: Simple, everyday language.
Mirrored role pages: The restaurant and supplier roles have parallel versions of the same pages (e.g. `client/src/pages/restaurant/*` and `client/src/pages/supplier/*` for Complaints, Orders, Home, Inbox, etc.). Whenever a change is made to one role's page, always apply the equivalent change to the other role's matching page so both stay in sync.

## Authentication — One Scheme

GastroConnect uses a single, consistent **email + password** login scheme. There is no public self-signup — onboarding is **invite-only**.

### Platform admins (`/admin`)
The admin panel at `/admin` authenticates platform owners with **email + password only** (the previous Replit OIDC / "Log In with Replit" flow was removed). The owner admin is provisioned at startup from configuration (`bootstrapPlatformAdmin`, idempotent on every boot). The `platform_admins` table is created idempotently at startup (`runAdminMigration`); no `drizzle push` needed.

| Secret | Required | Description |
|---|---|---|
| `PLATFORM_ADMIN_EMAIL` | yes | Email of the owner platform admin, provisioned/approved at startup. |
| `PLATFORM_ADMIN_PASSWORD` | yes | Password for the owner admin. **Must satisfy the password policy (min 12 characters).** Changing it resets the owner's password on next boot. A too-weak value is rejected and the admin is NOT created (`[admin] bootstrap failed ...`). |
| `PLATFORM_ADMIN_NAME` | optional | Display name for the owner admin (defaults to "Owner"). |

### Business users (restaurants & suppliers)
Business members log in with **email + password**, with **optional Google OAuth** as an alternate sign-in for already-invited members. New businesses are created **invite-only**: a platform admin creates the organization plus its first admin via `POST /api/admin/orgs` (UI: "Neues Unternehmen" dialog on the admin Organizations page). The new admin receives an email with a claim link to set their password. Public member self-signup (`Signup`/`AuthVerify` pages and the member register/verify routes) was removed.

## System Architecture

### UI/UX Decisions
The application features a dark dashboard-style UI. The header uses a dark `bg-[#161921]` background with `rounded-t-3xl` corners, centered navigation links with dropdown menus (hover-based), and circular icon buttons (`rounded-full border border-white/20 bg-white/[0.07]`) in the top-right. The sidebar has been removed — all navigation is handled via the top header nav with dropdowns for "Bestellungen" (Bestellungen, Reklamationen, Dokumente) and "Katalog"/"Produkte" (sub-items per role). A dark hero section (`bg-[#161921] rounded-b-3xl`) seamlessly connects to the header on every page, containing KPI cards on home pages or page titles on other pages. Everything scrolls together (no sticky header). The content area uses the full viewport width. The application is fully mobile-responsive, utilizing fixed bottom navigation on smaller screens and an immersive, full-screen chat experience. The restaurant homepage displays upcoming deliveries with status indicators (delivered-today, overdue, delayed), unread messages, and active promotions.

### Technical Implementations
- **Frontend**: Built with React, TypeScript, and Vite. It uses Wouter for routing, TanStack React Query for state management, Shadcn/ui for UI components, and Tailwind CSS for styling. React Context API manages user and role states.
- **Backend**: Node.js with Express 5, written in TypeScript using ESM modules, providing RESTful APIs.
- **Data Layer**: Drizzle ORM with PostgreSQL, utilizing shared schema and Zod for validation. Drizzle Kit manages database migrations.
- **Role Separation**: Strict separation of concerns is implemented for restaurant and supplier roles, with independent UIs, route handlers, and page components.
- **Profile Management**: Users can upload profile pictures to Object Storage via presigned URLs.
- **Notification System**: Supports various notification types (e.g., new messages, order status updates) with deep-linking to relevant sections.
- **Delivery Note System**: Generates A4 PDF delivery notes using PDFKit, stores them in Object Storage, and integrates them into the chat and a dedicated "Documents" section.
- **Promotions System**: Allows suppliers to create product promotions, which are highlighted in the restaurant catalog with discounted pricing.
- **Delivery Days Scheduling**: Suppliers can define specific delivery days and optional time windows per restaurant. The cart page dynamically displays available delivery dates.
- **Order Modification**: Restaurants can edit pending orders directly or send change requests for confirmed orders, which suppliers can approve/deny. All changes are logged in the chat.
- **Inbox Wizard Actions**: Inboxes include inline wizard-based actions for managing orders (e.g., restaurants editing/canceling, suppliers confirming/delivering/canceling).
- **Minimum Order Quantity (MOQ) & Value (MOV)**: Products can have default or custom MOQs enforced client-side and server-side. Suppliers can set global or zone-specific MOVs, displayed on the cart page with warnings and enforced during order creation.
- **Supplier Statistics**: Supplier home page features a statistics card with KPIs, a 6-month revenue chart, and top 5 products ranking.
- **Inventory Management**: Tracks `stockQuantity` and `lowStockThreshold`. Stock is automatically adjusted upon order confirmation/cancellation, with manual adjustments recorded in `stockMovements`. Low stock alerts are displayed.
- **Partial Confirmation**: Suppliers can confirm orders with adjusted item quantities. Orders become `partially_confirmed` and an auto-message details the changes in chat.
- **Order Cancellation Rules**: Suppliers cannot cancel orders once `in_delivery`. A "Correct status" dropdown allows suppliers to adjust status for corrections.
- **Cost Analysis**: A restaurant page for tracking food cost per guest, including a monthly KPI dashboard, configurable targets, daily overnight stays entry, and trend charts.
- **Section Tabs (Nav Consolidation)**: Related sub-pages are grouped into a single section reachable via pill tabs rendered inside each page's dark hero by the self-contained `SectionTabs` component (`client/src/components/SectionTabs.tsx`). It reads the current route, matches one of 4 groups, and returns null elsewhere. Groups: restaurant Bestellungen (Bestellungen/Kalender/Vorlagen → `/restaurant/orders`, `/calendar`, `/templates`), restaurant Katalog (Katalog/Preisvergleich → `/restaurant/catalog`, `/price-comparison`), supplier Bestellungen (Bestellungen/Kalender → `/supplier/orders`, `/calendar`), supplier Produkte (Katalog/Bestand/Aktionen → `/supplier/products`, `/inventory`, `/promotions`). Each page keeps its own route and deep links; the merged children were removed from the desktop header dropdowns (`HeaderNav` in App.tsx) and the mobile "More" menus (`RestaurantMobileNav`/`SupplierMobileNav`). The tab row renders as a `<nav>` with deliberate separation from the heading (`mb-5 md:mb-6`) so pills no longer crowd the title, and is responsive rather than the desktop layout shrunk down: mobile pills have 40px tap targets (`min-h-[40px] px-4 text-[13px]`) and scroll edge-to-edge (`-mx-3 px-3` to bleed past the hero's `px-3` padding), while desktop uses compact pills (`md:py-1.5 md:px-3.5 md:text-sm`) within the hero's normal padding.
- **Price Comparison**: Restaurant page at `/restaurant/price-comparison` that groups products by name+unit across suppliers, showing side-by-side pricing with savings percentages, promotion badges, and sorting by savings/name/price. Accessible from desktop nav (Katalog dropdown) and mobile more-menu.
- **Order Export**: CSV and PDF export of order history from both restaurant and supplier Orders pages via `/api/orders/export` endpoint. Supports date and partner filtering. Export button in the dark hero area.
- **Order Templates**: Restaurants can create and manage reusable order templates from scratch or existing orders, displayed as detailed cards on the Orders page with inline editing, quick actions, and direct add-to-cart functionality. A quick-action card on the home page displays up to 3 templates for fast ordering.
- **Push Notifications**: Implemented via Web Push API with a service worker and VAPID keys for real-time notifications, including deep-linking to relevant app sections. A toggle is available in user settings.
- **Online Status System**: Tracks user activity with `lastSeenAt` timestamps. An `OnlineStatus` component displays "Online", "Last seen X", or "Offline" in chat headers and conversation lists.
- **Per-Supplier Order Notes**: Cart notes are specific to each supplier, allowing separate remarks for different parts of a bulk order.
- **Account Switcher**: A component for selecting active restaurant or supplier accounts, useful for testing and multi-account users, with selection persistence.
- **Priority Messaging**: Messages can be marked as "important", visually distinguished with a red background and special indicators, used for urgent communications like complaint forms.
- **Complaint Product Selection**: When creating a complaint, users can select a specific order and then choose individual affected products from that order. Selected products trigger an automatic re-delivery request with high priority. Affected items are stored as JSON in the `affectedItems` column of the `complaints` table and displayed in complaint chat cards, complaint detail views, and both restaurant and supplier pages.
- **Follow-Up Orders (Nachlieferung)**: When a supplier receives a complaint with affected products, they can confirm and create a follow-up order directly from the complaint detail view (both in the Inbox and Complaints pages). The dialog allows adjusting quantities (e.g., adding extra items as compensation) and setting a delivery date. The follow-up order is automatically confirmed, a chat message is sent with `isFollowUp: true` flag, and the complaint status moves to "in_progress". The endpoint enforces supplier ownership and prevents follow-ups on closed/resolved complaints.
- **Document Center**: A dedicated section that groups documents (delivery notes, invoices) by supplier with expandable accordions. Each supplier section includes a statistics card displaying order and spending data, along with a 6-month mini bar chart. Monthly invoice PDFs can be generated.
- **Clickable Order-ID Link**: Across all order table/card views (restaurant + supplier `Orders.tsx` tables, plus the home page upcoming-deliveries tables and delivery card footers in `Home.tsx` for both roles), the order number `#{formatOrderNumber(order)}` is rendered as a blue, underlined link (`text-blue-600 dark:text-blue-400 underline underline-offset-2`, monospace, with `hover:text-blue-700 dark:hover:text-blue-300` and a `focus-visible` ring on the `Orders.tsx` `Link`). This replaced the earlier button-like outline chip (bordered `bg-muted/50` with a trailing `ChevronRight`) so the ID clearly reads as a clickable hyperlink in both light and dark mode.
- **Order & Complaint Detail Pages**: Full-page Wise-app-inspired detail views at `/:role/(orders|complaints)/:id`. Features include: back button + MoreHorizontal top bar, large status icon in colored circle, counterparty name + amount/title, pill-shaped tab switcher (Updates/Details) with `rounded-full` style, status timeline with dot connectors, product list with images, and info cards with `rounded-2xl bg-muted/30`. Header and mobile nav are hidden on detail pages via `isDetailPage` regex detection in AppLayout. Navigation from order/complaint cards uses `setLocation` instead of dialogs.
- **iOS 26 Liquid Glass Mobile Nav**: The mobile navigation bar (`MobileNavBase.tsx`) uses Apple's iOS 26 Liquid Glass design language. The `.floating-nav` element applies `backdrop-filter: blur(24px) saturate(180%)` directly with inset box-shadows for rim depth (top specular, bottom shadow, side highlights). Light mode: `rgba(255,255,255,0.18)` bg, `rgba(255,255,255,0.55)` border. Dark mode: `rgba(20,20,30,0.45)` bg, `rgba(255,255,255,0.14)` border. Specular sweep via `::before` (masked gradient) and caustic rim line via `::after`. Active pill indicator (`.liquid-metaball`) uses glass-on-glass: light `rgba(255,255,255,0.72)` / dark `rgba(255,255,255,0.15)`, with its own specular shimmer `::before` and body sheen `::after`. Tab text uses iOS opacity convention: active 90%/96%, inactive 55%/40%. All mobile-only (`md:hidden`), no desktop impact.
- **Animations & Micro-interactions**: Page transitions (`animate-page-enter` via key-based remount in App.tsx), staggered list entry (`StaggeredList` component with CSS `stagger-fade-in` keyframes, integrated in Orders and Inbox), order status timeline animation (`animate-status-dot`/`animate-status-line`), pull-to-refresh (`usePullToRefresh` hook with touch gesture handling + `PullToRefreshWrapper` component, integrated across all main pages: Home, Orders, Inbox, Catalog, Products, Complaints, Cart, Documents — mobile-only via `md:hidden` indicator and `matchMedia` listener gating), number count-up (`CountUp` component with intersection observer on dashboards). Toasts (`toast.tsx`/`toaster.tsx`) use a refined floating card: `rounded-2xl`, soft shadow + backdrop blur, a leading status icon in a colored circle (emerald `CheckCircle2` for default, `AlertCircle` for destructive), tappable close (visible on mobile, hover-reveal on desktop), and auto-dismiss after 4s with NO visible countdown/progress bar.
- **Swipeable Rows**: `SwipeableRow` component for mobile gesture interactions — swipe right/left on order cards (message/cancel for restaurants, confirm/cancel for suppliers) and inbox conversations (mark as read). Desktop renders children normally via dual-div pattern (`hidden md:block` + `md:hidden`).
- **Inline Quantity Editing**: On pending orders, tapping the quantity (e.g. "3x") on an order card opens inline +/- controls with OK/cancel. Saves via `PATCH /api/orders/:id/items`. Prevents switching items while a save is in-flight.
- **Read Receipt Animation**: The double-check icon (CheckCheck) for sent messages animates with a fade-in only when transitioning from unread→read (not on initial load). Uses `knownReadIdsRef` to track previously-read state and `newlyReadIds` state for animation gating. Applied in both restaurant and supplier Inbox.
- **Confirmation Dialogs**: All destructive cancel actions across restaurant Orders, supplier Orders (single + batch), supplier Inbox, and OrderDetail now require explicit confirmation before proceeding.

### Performance Optimizations
- **Database Indexes**: All foreign key columns have indexes defined in schema.ts (products, orders, orderItems, cartItems, conversations, messages, complaints, notifications, documents, deliverySchedules, promotions, stockMovements, orderTemplates, pushSubscriptions, overnightStays, costSettings, minimumOrderValues, customPrices, customMinOrderQuantities). Composite indexes on frequently queried column pairs (e.g., messages.conversationId+createdAt, notifications.userId+isRead).
- **N+1 Query Fixes**: `getConversations` batches user lookups and unread counts in single queries, parallelizes last-message fetches. Direct-order route reuses productMap instead of re-fetching.
- **SQL Filter Pushdown**: Order history/upcoming deliveries use status filters in SQL WHERE clauses instead of fetching all orders and filtering in memory. Cost analysis uses SQL SUM/GROUP BY aggregation instead of loading all rows.
- **Polling & Cache**: Default `refetchInterval` raised from 5s→30s, `staleTime` from 3s→15s. Chat pages keep 3-5s fast polling. Dashboard/nav badge queries use defaults instead of aggressive `staleTime:0`.
- **Route Ordering**: `/api/orders/pending-count` and `/api/orders/history` registered before `/api/orders/:id` to prevent param shadowing.

### Core Data Models
Users, Products, Orders, Cart Items, Conversations/Messages, Delivery Schedules, Promotions, Documents, Custom MOQ, Order Templates, Push Subscriptions, Overnight Stays, Cost Settings, Stock Movements.

## External Dependencies

### Database
- PostgreSQL

### UI Framework Dependencies
- Radix UI
- Tailwind CSS
- Lucide React
- class-variance-authority
- embla-carousel-react
- react-day-picker
- recharts
- vaul
- cmdk

### Form Handling
- react-hook-form
- @hookform/resolvers
- zod

### Development Tools
- Vite
- Drizzle Kit
- esbuild
- tsx

### Other Integrations
- PDFKit (for PDF generation)
- Object Storage (GCS)