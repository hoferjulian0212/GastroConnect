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