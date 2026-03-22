# GastroConnect

## Overview
GastroConnect is a web application designed to streamline interactions between restaurants and suppliers in the gastronomy industry. It provides distinct, role-based interfaces for restaurants (customers) and suppliers (vendors) to manage orders, inventory, and communications. Key features include a WhatsApp-style chat system, mobile responsiveness, a notification system with deep-linking, delivery note generation, a promotions system, configurable delivery schedules, and order modification capabilities. The platform aims to enhance efficiency in the food service supply chain through improved ordering and communication.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application features a clean, modern UI with a consistent design language. It uses the Inter font, a `Gray-50` page background, `White` for surfaces, and `Indigo-600` as the primary accent color. Components like cards and buttons follow a `rounded-xl` and `rounded-lg` style respectively, with `shadow-sm` for cards. Layouts include a fixed-width left sidebar and a flexible main content area. The application is fully mobile-responsive, utilizing fixed bottom navigation on smaller screens and an immersive, full-screen chat experience. The restaurant homepage displays upcoming deliveries with status indicators (delivered-today, overdue, delayed), unread messages, and active promotions.

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
- **Order Templates**: Restaurants can create and manage reusable order templates from scratch or existing orders, displayed as detailed cards on the Orders page with inline editing, quick actions, and direct add-to-cart functionality. A quick-action card on the home page displays up to 3 templates for fast ordering.
- **Push Notifications**: Implemented via Web Push API with a service worker and VAPID keys for real-time notifications, including deep-linking to relevant app sections. A toggle is available in user settings.
- **Online Status System**: Tracks user activity with `lastSeenAt` timestamps. An `OnlineStatus` component displays "Online", "Last seen X", or "Offline" in chat headers and conversation lists.
- **Per-Supplier Order Notes**: Cart notes are specific to each supplier, allowing separate remarks for different parts of a bulk order.
- **Account Switcher**: A component for selecting active restaurant or supplier accounts, useful for testing and multi-account users, with selection persistence.
- **Priority Messaging**: Messages can be marked as "important", visually distinguished with a red background and special indicators, used for urgent communications like complaint forms.
- **Document Center**: A dedicated section that groups documents (delivery notes, invoices) by supplier with expandable accordions. Each supplier section includes a statistics card displaying order and spending data, along with a 6-month mini bar chart. Monthly invoice PDFs can be generated.

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