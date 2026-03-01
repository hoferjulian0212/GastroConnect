# GastroConnect

## Overview
GastroConnect is a web application that facilitates connections between restaurants and suppliers in the gastronomy industry. It offers distinct, role-based interfaces for restaurants (customers) and suppliers (vendors), each with tailored navigation, views, and business logic. A shared messaging system enables direct communication. The platform allows restaurants to browse catalogs, manage carts, place orders, and communicate with suppliers. Suppliers can manage inventory, process orders, and engage with customers via the chat system. Key features include a WhatsApp-style chat, mobile responsiveness for both roles, a notification system with deep-linking, delivery note generation, a promotions system, configurable delivery days, order modification capabilities, and minimum order quantity enforcement. The project aims to streamline ordering and communication within the food service supply chain.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses a clean and modern UI design.
- **Global Styles**: Inter font, `Gray-50` background for pages, `White` for surfaces (cards, sidebars), and `Indigo-600` as the primary accent color.
- **Component Styles**: Cards feature `rounded-xl` corners, `border border-gray-200`, and `shadow-sm`. Buttons are `rounded-lg` with `transition-all`. Tables use `divide-y divide-border`.
- **Layout**: A fixed-width (`w-64`) left sidebar and a flexible, scrollable main content area.
- **Mobile Responsiveness**: Both restaurant and supplier interfaces are fully mobile-responsive. This is achieved through fixed bottom navigation bars on mobile (`md:hidden`), hiding the sidebar on mobile, and adjusting content padding. The `md:` (768px) breakpoint separates mobile and desktop layouts.
- **Immersive Chat**: The inbox features a WhatsApp-style immersive chat on mobile, taking full screen height and hiding other UI elements for a focused experience.
- **Restaurant Home Page**: Top "Anstehende Lieferungen" (Upcoming Deliveries) card showing confirmed/in-delivery/delivered-today orders grouped by delivery date with three special states: **delivered-today** (green card, checkmark icon), **overdue** (red card, X icon, "Nachricht senden" button linking to inbox), **delayed/rescheduled** (amber card, "In Verspätung" badge, shows original vs new date). Below it, a two-column grid with the left column containing: 1) "Ungelesene Nachrichten" card showing up to 3 unread chats with supplier name, message preview, time, and unread count badge (click navigates to specific chat); 2) "Laufende Aktionen" card with horizontally scrollable promotion product cards matching catalog style (discount badge, pricing, quantity selector, add-to-cart button). API endpoint: `GET /api/restaurant/upcoming-deliveries`.

### Technical Implementations
- **Frontend**: React with TypeScript and Vite. Uses Wouter for routing, TanStack React Query for state management, Shadcn/ui for UI components, and Tailwind CSS for styling. React Context API manages user state and role switching.
- **Backend**: Node.js with Express 5, written in TypeScript using ESM modules. It provides RESTful APIs under the `/api/*` prefix.
- **Data Layer**: Drizzle ORM with PostgreSQL, utilizing shared schema (`shared/schema.ts`) and Zod for validation. Drizzle Kit handles database migrations.
- **Role Separation**: Strict role separation is enforced with independent UI components, route handlers, and page components for restaurants and suppliers.
- **Profile Picture Uploads**: Users can upload profile pictures via presigned URLs to Object Storage (GCS).
- **Notification System**: Supports various notification types (new message, order status, complaints) with deep-linking functionality to relevant sections of the application.
- **Delivery Note System**: Generates A4 PDF delivery notes using PDFKit, stores them in Object Storage, and integrates them into the chat system and a dedicated "Documents" section.
- **Promotions System**: Allows suppliers to create and manage product promotions. Restaurants see active promotions highlighted in the catalog with discounted pricing.
- **Delivery Days Scheduling**: Suppliers can define specific delivery days for each restaurant. The restaurant's cart page displays available delivery dates based on these schedules, considering multiple suppliers in a single order.
- **Order Modification**: Restaurants can edit pending orders. For confirmed orders, they can send a change request to the supplier, who can approve or deny it via the inbox. All changes are logged in the chat.
- **Inbox Wizard Actions**: Both restaurant and supplier inbox views feature inline wizard-based actions directly on order cards. Restaurants can edit (pending), request changes (confirmed), or cancel orders. Suppliers can confirm, mark in delivery, mark delivered, or cancel orders — all with a confirmation step wizard inline on the card.
- **Minimum Order Quantity (MOQ)**: Products can have a default MOQ, and suppliers can set custom MOQs for specific restaurants. The system enforces MOQs in the catalog and cart, both client-side and server-side.
- **Inventory Management**: Products have `stockQuantity` and `lowStockThreshold` fields. Stock is automatically deducted when orders are confirmed, and reversed when orders are cancelled or set back to pending via change requests. Manual stock in/out with full audit trail via `stockMovements` table. Low stock alerts displayed on supplier home page.

### Core Data Models
- **Users**: Role-based (restaurant/supplier) with company information and profile pictures.
- **Products**: Supplier-owned with pricing and inventory.
- **Orders**: Transaction records with status tracking.
- **Cart Items**: Temporary storage per restaurant.
- **Conversations/Messages**: For 1:1 chat between roles.
- **Delivery Schedules**: Configurable delivery days per supplier-restaurant pair.
- **Promotions**: Product discounts with start/end dates.
- **Documents**: Records for generated PDFs like delivery notes.
- **Custom MOQ**: Overrides for product MOQs specific to a restaurant.
- **Order Templates**: Reusable order templates with named product lists and quantities. Integrated as a tab within the restaurant Orders page (URL: `/restaurant/orders?tab=templates`). Templates display as expanded detail-rich cards showing all products grouped by supplier, with inline quantity editing (+/- buttons), item removal, inline name editing (click name to rename), duplicate/delete actions, estimated total price, out-of-stock badges, and "last updated" timestamps. Restaurants can create templates from scratch or from existing orders, add products, and use templates to quickly add items to cart. Old route `/restaurant/templates` redirects to the tab. A quick-action card on the restaurant Home page shows up to 3 templates with product details, totals, out-of-stock badges, and a "Bestellen"/"Ordina" button that adds all in-stock items to cart and navigates to cart.
- **Push Subscriptions**: Stores browser push notification subscriptions per user. Each record has `endpoint`, `p256dh`, and `auth` fields from the Web Push API.
- **QuantityInput Component**: Shared component at `client/src/components/QuantityInput.tsx`. Renders +/- buttons with a clickable number in between; clicking the number opens an inline input field for manual quantity entry. Supports `min`, `size` ("sm"/"md"), `disabled`, and `testIdPrefix` props. Used across Catalog, Cart, Home promotions, Inbox (create order + edit order), and Templates pages.
- **Push Notifications System**: Real phone/browser push notifications via Web Push API. Service worker at `client/public/sw.js`, push service at `server/pushService.ts`, subscription hook at `client/src/hooks/usePushNotifications.ts`. VAPID keys stored in env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Push toggle available in Settings pages for both roles. Every in-app notification also triggers a push notification to the user's subscribed devices. Push notifications include deep-link URLs that navigate directly to the relevant page when tapped.

## External Dependencies

### Database
- **PostgreSQL**: Primary database.

### UI Framework Dependencies
- **Radix UI**: Accessible, unstyled UI primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.
- **class-variance-authority**: Component variant management.
- **embla-carousel-react**: Carousel functionality.
- **react-day-picker**: Calendar/date picker.
- **recharts**: Charting library.
- **vaul**: Drawer component.
- **cmdk**: Command palette component.

### Form Handling
- **react-hook-form**: Form state management.
- **@hookform/resolvers**: Zod resolver integration.
- **zod**: Schema validation.

### Development Tools
- **Vite**: Build tool and development server.
- **Drizzle Kit**: Database migration tooling.
- **esbuild**: Production server bundling.
- **tsx**: TypeScript execution for development.

### Other Integrations
- **PDFKit**: For generating PDF delivery notes.
- **Object Storage (GCS)**: Used for storing profile pictures and generated documents.