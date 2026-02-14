# GastroConnect

## Overview

GastroConnect is a web application designed to connect restaurants with suppliers in the gastronomy industry. The platform provides separate, role-based interfaces for two distinct user types: restaurants (customers) and suppliers (vendors). Each role has its own navigation, views, and business logic, with a shared messaging system serving as the primary communication channel between parties.

The application enables restaurants to browse supplier catalogs, manage shopping carts, place orders, and communicate directly with suppliers. Suppliers can manage their product inventory, process incoming orders, and maintain customer relationships through the integrated chat system.

## User Preferences

Preferred communication style: Simple, everyday language.

## UI Design System

### Global Styles
- **Font Family**: Inter (system-ui fallback)
- **Background**: Gray-50 (`220 14% 96%`) for page backgrounds
- **Surfaces**: White (`0 0% 100%`) for cards and sidebars
- **Primary Color**: Indigo-600 (`239 84% 67%`) for primary actions and accents

### Component Styles
- **Cards**: `bg-white`, `rounded-xl`, `border border-gray-200`, `shadow-sm`
- **Tables**: `divide-y divide-border` with uppercase, `tracking-wider` headers
- **Buttons**: `rounded-lg` with `transition-all duration-200` effects

### Layout
- **Sidebar**: Fixed-width (`w-64`) on the left with white background
- **Main Content**: Flexible, scrollable area on the right with gray-50 background

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite
- **Routing**: Wouter for lightweight client-side routing with role-based route separation (`/restaurant/*` and `/supplier/*`)
- **State Management**: TanStack React Query for server state management and caching
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming (light/dark mode support)
- **User Context**: React Context API for managing current user state and role switching

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful endpoints under `/api/*` prefix
- **Development Server**: Vite middleware integration for hot module replacement
- **Production Build**: esbuild for server bundling, Vite for client assets

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: Shared schema in `shared/schema.ts` accessible by both client and server
- **Validation**: Zod schemas generated via drizzle-zod for runtime validation
- **Database Migrations**: Drizzle Kit for schema push operations

### Core Data Models
- **Users**: Role-based (restaurant/supplier) with company information and profile picture support (profileImageUrl)
- **Products**: Supplier-owned product catalog with pricing and inventory
- **Orders**: Transaction records linking restaurants to suppliers with status tracking
- **Cart Items**: Temporary shopping cart storage per restaurant
- **Conversations/Messages**: WhatsApp-style 1:1 chat between restaurant-supplier pairs

### Role Separation Pattern
The application enforces strict role separation where each user type has completely independent interfaces:
- Separate sidebar components (`RestaurantSidebar`, `SupplierSidebar`)
- Separate route handlers and page components
- Role switching via button toggle (development mode - no authentication currently implemented)

### Profile Picture Feature
Users can upload profile pictures in Settings that are visible to other users:
- **Upload Flow**: Uses Object Storage presigned URL flow via `/api/uploads/request-url`, files uploaded directly to GCS
- **Storage**: Profile image path stored in `profileImageUrl` field in users table, normalized to `/objects/...` format
- **Display Locations**: Sidebars (user footer), Inbox (conversation list and message headers), Complaints pages, Settings pages
- **UI**: Camera icon overlay on avatar with hover effect, 5MB file size limit, client-side validation

### Mobile Responsiveness (Supplier Side)
The supplier interface is fully mobile-responsive with the following implementation:
- **Bottom Navigation**: `SupplierMobileNav` component provides a fixed bottom navigation bar on mobile (hidden on desktop via `md:hidden`)
- **Navigation Items**: Home, Produkte, Nachrichten, Bestellungen, and "Mehr" dropdown
- **"Mehr" Dropdown**: Contains Reklamationen, Bestellübersicht, and Einstellungen options
- **Badge Indicators**: Unread message count and pending orders shown on navigation items
- **Responsive Breakpoint**: `md:` (768px) is the primary breakpoint for mobile/desktop separation
- **Layout Patterns**:
  - Desktop: Sidebar visible, bottom nav hidden
  - Mobile: Sidebar hidden, bottom nav visible, content has `pb-20` for nav spacing
- **Inbox Behavior**: On mobile, conversation list and message view toggle with back button
- **All supplier pages adapted**: Home, Inbox, Orders, Products, Complaints, History, Settings

### Mobile Responsiveness (Restaurant Side)
The restaurant interface is fully mobile-responsive with matching UX patterns:
- **Bottom Navigation**: `RestaurantMobileNav` component provides a fixed bottom navigation bar on mobile (hidden on desktop via `md:hidden`)
- **Navigation Items**: Home, Produkte, Nachrichten (with unread badge), Warenkorb (with cart count badge), and "Mehr" dropdown
- **"Mehr" Dropdown**: Contains Bestellungen, Historie, Reklamationen, and Einstellungen options
- **Badge Indicators**: Unread message count on Nachrichten, cart item count on Warenkorb
- **Responsive Breakpoint**: `md:` (768px) is the primary breakpoint for mobile/desktop separation
- **Layout Patterns**:
  - Desktop: Sidebar visible, bottom nav hidden, cart button in header
  - Mobile: Sidebar hidden, bottom nav visible, cart button in header hidden (accessible via bottom nav), content has `pb-20` for nav spacing
- **All restaurant pages adapted**: Home, Inbox, Catalog, Cart, Orders, History, Complaints, Settings

### WhatsApp-Style Immersive Chat (Inbox)
Both restaurant and supplier inbox pages implement a full-screen immersive chat experience on mobile:
- **ChatContext**: `ChatProvider` and `useChat` hook manage `isInChat` state globally
- **Full-Screen Mode**: When a conversation is selected on mobile (viewport < 768px):
  - Chat takes full screen height (`h-screen` on mobile)
  - Page title "Inbox" is hidden (`hidden md:block` when in chat)
  - Main app header is hidden on mobile (`hidden md:flex` when `isInChat` is true)
  - Bottom navigation bar is hidden (mobile nav returns `null` when `isInChat` is true)
  - Card border is removed on mobile (`border-0 md:border rounded-none md:rounded-lg`)
- **Chat Header**: Shows back button (ArrowLeft icon), contact avatar, name and email
- **Back Navigation**: Clicking back button sets `selectedConversation` to null, which resets `isInChat` to false
- **Compact Chat List**: Smaller conversation entries with `h-9 w-9` avatars, `p-2.5` padding, `space-y-0.5` gaps
- **Desktop Behavior**: Normal layout with sidebar visible, chat list and message view side by side

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage in PostgreSQL (available but sessions not currently implemented)

### UI Framework Dependencies
- **Radix UI**: Full suite of accessible, unstyled UI primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **class-variance-authority**: Component variant management
- **embla-carousel-react**: Carousel functionality
- **react-day-picker**: Calendar/date picker
- **recharts**: Charting library for data visualization
- **vaul**: Drawer component
- **cmdk**: Command palette component

### Form Handling
- **react-hook-form**: Form state management
- **@hookform/resolvers**: Zod resolver integration
- **zod**: Schema validation

### Development Tools
- **Vite**: Build tool and development server
- **Drizzle Kit**: Database migration tooling
- **esbuild**: Production server bundling
- **tsx**: TypeScript execution for development

### Notification System with Deep-Link Shortcuts
- **Notification Types**: `new_message`, `new_order`, `order_status`, `new_complaint`, `complaint_comment`
- **Shortcuts**: Clicking a notification navigates directly to the relevant resource:
  - `new_order` / `order_status` → `/{role}/orders?orderId={referenceId}` (highlights the order with ring-2 ring-primary)
  - `new_message` → `/{role}/inbox?conversationId={referenceId}` (selects the conversation)
  - `new_complaint` / `complaint_comment` → `/{role}/inbox?complaintId={referenceId}` (opens complaint detail dialog)
- **Auto-dismiss**: Message notifications are automatically marked as read when the user opens the relevant conversation (via `PATCH /api/notifications/read-by-reference`)
- **URL Query Params**: Orders pages read `?orderId=` to highlight/scroll; Inbox pages read `?conversationId=` and `?complaintId=` to auto-select/open

### Delivery Note (Lieferschein) System
- **PDF Generation**: Uses PDFKit to generate A4 delivery note PDFs with German locale formatting
- **Storage**: PDFs uploaded to Object Storage at `privateObjectDir/documents/{uuid}.pdf`
- **Database**: `documents` table tracks generated documents with `documentTypeEnum` (delivery_note, invoice, other)
- **Trigger**: Supplier clicks "Lieferschein erstellen" button on orders with "in_delivery" status
- **Chat Integration**: Creating a delivery note sends a system message (messageType "document") in the conversation with download button
- **Document Center**: Both roles have a "Dokumente" page (`/{role}/documents`) listing all their documents with download buttons
- **Endpoints**:
  - `POST /api/orders/:id/delivery-note` - Generate PDF, upload to storage, create document record, send chat message
  - `GET /api/orders/:id/delivery-note/download` - Download or generate on-demand
  - `GET /api/documents?userId=&role=` - List documents by user and role
- **Navigation**: "Dokumente" item added to both sidebars and mobile nav "Mehr" menus

### Promotions (Aktionen) System
- **Database**: `promotions` table with `discountPercent`, `startDate`, `endDate`, `isActive`, linked to `products` and `users` (suppliers)
- **Schema Types**: `PromotionWithProduct` (promotion + joined product), `ProductWithSupplierAndPromotion` (product + supplier + active promotion)
- **Supplier Management**: Full CRUD at `/supplier/promotions` with stats cards (total/active/expired), create/edit/delete promotions
- **Restaurant Catalog**: Products with active promotions display green ring border, discount % badge on image corner, "Aktion" badge, crossed-out original price with green discounted price
- **Aktionen Filter**: Toggle button in catalog filters to show only products with active promotions
- **Date Logic**: Promotions are active when `startDate <= now <= endDate` and `isActive = true`; expired promotions automatically stop showing discount
- **Endpoints**:
  - `GET /api/promotions?supplierId=` - List promotions (with product join)
  - `POST /api/promotions` - Create promotion
  - `PATCH /api/promotions/:id` - Update promotion
  - `DELETE /api/promotions/:id` - Delete promotion
  - `GET /api/products` - Returns products with `activePromotion` field attached
- **Navigation**: "Aktionen" (Tag icon) added to supplier sidebar and mobile nav "Mehr" menu

### Delivery Days Scheduling System
- **Database**: `delivery_schedules` table with `supplierId`, `restaurantId`, `dayOfWeek` (0=Sunday...6=Saturday); `requestedDeliveryDate` field on `orders` table
- **Supplier Configuration**: In Settings page under "Liefertage" section, suppliers select a restaurant customer and toggle weekday checkboxes to set allowed delivery days
- **Restaurant Checkout**: Cart page shows delivery date picker with "Sobald wie möglich" (ASAP, default, requestedDeliveryDate=null) or "Liefertag auswählen" showing next 30 days filtered to allowed weekdays
- **Multi-Supplier Logic**: When cart contains products from multiple suppliers, only dates whose weekday is allowed by ALL suppliers are shown (intersection)
- **Order Display**: Supplier Orders page shows requested delivery date or "Sobald wie möglich" fallback in order details
- **Endpoints**:
  - `PUT /api/delivery-schedules` - Set delivery days (body: supplierId, restaurantId, days[])
  - `GET /api/delivery-schedules?supplierId=` - All schedules for a supplier
  - `GET /api/delivery-schedules/restaurant?supplierId=&restaurantId=` - Schedules for specific pair