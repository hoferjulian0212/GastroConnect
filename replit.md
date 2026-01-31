# GastroConnect

## Overview

GastroConnect is a web application designed to connect restaurants with suppliers in the gastronomy industry. The platform provides separate, role-based interfaces for two distinct user types: restaurants (customers) and suppliers (vendors). Each role has its own navigation, views, and business logic, with a shared messaging system serving as the primary communication channel between parties.

The application enables restaurants to browse supplier catalogs, manage shopping carts, place orders, and communicate directly with suppliers. Suppliers can manage their product inventory, process incoming orders, and maintain customer relationships through the integrated chat system.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **Users**: Role-based (restaurant/supplier) with company information
- **Products**: Supplier-owned product catalog with pricing and inventory
- **Orders**: Transaction records linking restaurants to suppliers with status tracking
- **Cart Items**: Temporary shopping cart storage per restaurant
- **Conversations/Messages**: WhatsApp-style 1:1 chat between restaurant-supplier pairs

### Role Separation Pattern
The application enforces strict role separation where each user type has completely independent interfaces:
- Separate sidebar components (`RestaurantSidebar`, `SupplierSidebar`)
- Separate route handlers and page components
- Role switching via button toggle (development mode - no authentication currently implemented)

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