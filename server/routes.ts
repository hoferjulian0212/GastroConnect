import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProductSchema, insertCartItemSchema, insertMessageSchema } from "@shared/schema";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);

  // Seed data on startup
  await storage.seedData();

  // ===== USERS =====
  app.get("/api/users", async (req, res) => {
    try {
      const role = req.query.role as "restaurant" | "supplier" | undefined;
      if (role) {
        const users = await storage.getUsersByRole(role);
        res.json(users);
      } else {
        const users = await storage.getUsers();
        res.json(users);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const updated = await storage.updateUser(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // ===== SUPPLIERS =====
  app.get("/api/suppliers", async (req, res) => {
    try {
      const suppliers = await storage.getUsersByRole("supplier");
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  // ===== PRODUCTS =====
  app.get("/api/products", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (supplierId) {
        const products = await storage.getProductsBySupplier(supplierId);
        return res.json(products);
      }
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/supplier/products", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
      const products = await storage.getProductsBySupplier(supplierId);
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const validated = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(validated);
      res.status(201).json(product);
    } catch (error) {
      res.status(400).json({ error: "Invalid product data" });
    }
  });

  app.patch("/api/products/:id", async (req, res) => {
    try {
      const updated = await storage.updateProduct(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      await storage.deleteProduct(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // ===== CART =====
  app.get("/api/cart", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.status(400).json({ error: "Restaurant ID required" });
      }
      const items = await storage.getCartItems(restaurantId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cart" });
    }
  });

  app.get("/api/cart/count", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.json({ count: 0 });
      }
      const count = await storage.getCartCount(restaurantId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cart count" });
    }
  });

  app.post("/api/cart", async (req, res) => {
    try {
      const validated = insertCartItemSchema.parse(req.body);
      const item = await storage.addToCart(validated);
      res.status(201).json(item);
    } catch (error) {
      res.status(400).json({ error: "Invalid cart data" });
    }
  });

  app.patch("/api/cart/:id", async (req, res) => {
    try {
      const { quantity } = req.body;
      const updated = await storage.updateCartItem(req.params.id, quantity);
      if (!updated) {
        return res.status(404).json({ error: "Cart item not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update cart item" });
    }
  });

  app.delete("/api/cart/:id", async (req, res) => {
    try {
      await storage.removeCartItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove cart item" });
    }
  });

  // ===== ORDERS =====
  app.get("/api/orders", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      const supplierId = req.query.supplierId as string;
      if (restaurantId && supplierId) {
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        const filtered = orders.filter(o => o.supplierId === supplierId);
        return res.json(filtered);
      }
      if (restaurantId) {
        const orders = await storage.getOrdersByRestaurant(restaurantId);
        return res.json(orders);
      }
      if (supplierId) {
        const orders = await storage.getOrdersBySupplier(supplierId);
        return res.json(orders);
      }
      return res.status(400).json({ error: "restaurantId or supplierId required" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/recent", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.json([]);
      }
      const orders = await storage.getRecentOrdersByRestaurant(restaurantId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent orders" });
    }
  });

  app.get("/api/orders/history", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.json([]);
      }
      const orders = await storage.getOrdersByRestaurant(restaurantId);
      res.json(orders.filter(o => o.status === "delivered"));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const { restaurantId, notes } = req.body;
      if (!restaurantId) {
        return res.status(400).json({ error: "Restaurant ID required" });
      }

      // Get cart items
      const cartItems = await storage.getCartItems(restaurantId);
      if (cartItems.length === 0) {
        return res.status(400).json({ error: "Cart is empty" });
      }

      // Group cart items by supplier
      const bySupplier = cartItems.reduce((acc, item) => {
        if (!acc[item.supplierId]) {
          acc[item.supplierId] = [];
        }
        acc[item.supplierId].push(item);
        return acc;
      }, {} as Record<string, typeof cartItems>);

      // Create orders for each supplier
      const createdOrders = [];
      for (const [supplierId, items] of Object.entries(bySupplier)) {
        const orderItems = items.map(item => ({
          productId: item.productId,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.price,
          totalPrice: (parseFloat(item.product.price) * item.quantity).toFixed(2)
        }));

        const totalAmount = orderItems
          .reduce((sum, item) => sum + parseFloat(item.totalPrice), 0)
          .toFixed(2);

        const order = await storage.createOrder(
          { restaurantId, supplierId, totalAmount, status: "pending", notes },
          orderItems as any
        );
        createdOrders.push(order);
      }

      // Clear cart
      await storage.clearCart(restaurantId);

      res.status(201).json(createdOrders);
    } catch (error) {
      console.error("Create order error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.post("/api/orders/direct", async (req, res) => {
    try {
      const { restaurantId, supplierId, items, notes } = req.body;
      if (!restaurantId || !supplierId || !items?.length) {
        return res.status(400).json({ error: "restaurantId, supplierId and items required" });
      }

      if (!Array.isArray(items) || !items.every((i: any) => i.productId && typeof i.quantity === "number" && i.quantity > 0)) {
        return res.status(400).json({ error: "Invalid items format" });
      }

      const products = await storage.getProductsBySupplier(supplierId);
      const productMap = new Map(products.map(p => [p.id, p]));

      const orderItems = [];
      for (const item of items as { productId: string; quantity: number }[]) {
        const product = productMap.get(item.productId);
        if (!product) {
          return res.status(400).json({ error: `Product ${item.productId} not found` });
        }
        orderItems.push({
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.price,
          totalPrice: (parseFloat(product.price) * item.quantity).toFixed(2)
        });
      }

      const totalAmount = orderItems
        .reduce((sum: number, item) => sum + parseFloat(item.totalPrice), 0)
        .toFixed(2);

      const order = await storage.createOrder(
        { restaurantId, supplierId, totalAmount, status: "pending", notes: notes || "" },
        orderItems as any
      );

      res.status(201).json(order);
    } catch (error) {
      console.error("Direct order error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.post("/api/orders/:id/reorder", async (req, res) => {
    try {
      const { restaurantId } = req.body;
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Add items to cart
      for (const item of order.items) {
        await storage.addToCart({
          restaurantId,
          productId: item.productId,
          supplierId: order.supplierId,
          quantity: item.quantity
        });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reorder" });
    }
  });

  app.patch("/api/orders/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const updated = await storage.updateOrderStatus(req.params.id, status);
      if (!updated) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  // ===== SUPPLIER ORDERS =====
  app.get("/api/supplier/orders", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.status(400).json({ error: "Supplier ID required" });
      }
      const orders = await storage.getOrdersBySupplier(supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/supplier/orders/recent", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.json([]);
      }
      const orders = await storage.getRecentOrdersBySupplier(supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent orders" });
    }
  });

  app.get("/api/supplier/orders/history", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.json([]);
      }
      const orders = await storage.getOrdersBySupplier(supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  app.get("/api/orders/pending-count", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.json({ count: 0 });
      }
      const count = await storage.getPendingOrderCount(supplierId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending count" });
    }
  });

  // ===== CONVERSATIONS =====
  app.get("/api/conversations", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const role = req.query.role as "restaurant" | "supplier";
      
      if (!userId) {
        return res.json([]);
      }

      // Determine role from user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.json([]);
      }

      const conversations = await storage.getConversations(userId, user.role as "restaurant" | "supplier");
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/unread", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.json({ count: 0 });
      }
      const count = await storage.getUnreadCount(userId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const message = await storage.sendMessage({
        conversationId: req.params.id,
        senderId: req.body.senderId,
        messageType: req.body.messageType || "text",
        content: req.body.content
      });
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/conversations/:id/read", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }
      await storage.markMessagesAsRead(req.params.id, userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // ===== STATS =====
  app.get("/api/restaurant/stats", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.json({ pendingOrders: 0, unreadMessages: 0, totalSuppliers: 0 });
      }
      const stats = await storage.getRestaurantStats(restaurantId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/supplier/stats", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.json({ newOrders: 0, unreadMessages: 0, totalProducts: 0, monthlyRevenue: 0 });
      }
      const stats = await storage.getSupplierStats(supplierId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/supplier/restaurants", async (req, res) => {
    try {
      const supplierId = req.query.supplierId as string;
      if (!supplierId) {
        return res.json([]);
      }
      const restaurants = await storage.getRestaurantsForSupplier(supplierId);
      res.json(restaurants);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch restaurants" });
    }
  });

  return httpServer;
}
