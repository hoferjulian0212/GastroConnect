import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import path from "path";
import { storage } from "./storage";
import { insertProductSchema, insertCartItemSchema, insertMessageSchema, insertComplaintSchema, updateComplaintSchema, insertComplaintCommentSchema, insertNotificationSchema } from "@shared/schema";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { objectStorageClient, ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import PDFDocument from "pdfkit";
import { randomUUID } from "crypto";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register object storage routes for file uploads
  registerObjectStorageRoutes(app);

  // Serve static images from client/public - ensures images work in both dev and production
  const clientPublicPath = path.resolve(process.cwd(), "client", "public");
  app.use("/images", express.static(path.join(clientPublicPath, "images"), {
    maxAge: "1d",
    immutable: true,
  }));
  app.use("/favicon.png", express.static(path.join(clientPublicPath, "favicon.png")));

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

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order" });
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

        // Create order message in chat
        const conversation = await storage.getOrCreateConversation(restaurantId, supplierId);
        const orderContent = JSON.stringify({
          items: orderItems.map(item => ({
            name: item.productName,
            quantity: item.quantity,
            price: item.totalPrice
          })),
          total: totalAmount
        });
        await storage.sendMessage({
          conversationId: conversation.id,
          senderId: restaurantId,
          messageType: "order",
          content: orderContent,
          orderId: order.id,
        });
        
        // Create notification for supplier
        const restaurant = await storage.getUser(restaurantId);
        await storage.createNotification({
          userId: supplierId,
          type: "new_order",
          title: "Neue Bestellung",
          message: `${restaurant?.companyName || restaurant?.name || "Ein Restaurant"} hat eine neue Bestellung aufgegeben (€${totalAmount})`,
          referenceId: order.id
        });
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

      // Create order message in chat
      const conversation = await storage.getOrCreateConversation(restaurantId, supplierId);
      const orderContent = JSON.stringify({
        items: orderItems.map(item => ({
          name: item.productName,
          quantity: item.quantity,
          price: item.totalPrice
        })),
        total: totalAmount
      });
      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: restaurantId,
        messageType: "order",
        content: orderContent,
        orderId: order.id,
      });

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

  app.get("/api/conversations/:id/statuses", async (req, res) => {
    try {
      const statuses = await storage.getConversationStatuses(req.params.id);
      res.json(statuses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statuses" });
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
      
      // Create notification for recipient
      const conversation = await storage.getConversation(req.params.id);
      if (conversation) {
        const senderId = req.body.senderId;
        // Determine recipient: if sender is restaurant, recipient is supplier, and vice versa
        const recipientId = conversation.restaurantId === senderId 
          ? conversation.supplierId 
          : conversation.restaurantId;
        
        const sender = await storage.getUser(senderId);
        await storage.createNotification({
          userId: recipientId,
          type: "new_message",
          title: "Neue Nachricht",
          message: `${sender?.companyName || sender?.name || "Jemand"} hat Ihnen eine Nachricht gesendet`,
          referenceId: req.params.id
        });
      }
      
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

  app.post("/api/conversations", async (req, res) => {
    try {
      const { restaurantId, supplierId } = req.body;
      if (!restaurantId || !supplierId) {
        return res.status(400).json({ error: "restaurantId and supplierId required" });
      }
      const conversation = await storage.getOrCreateConversation(restaurantId, supplierId);
      res.json(conversation);
    } catch (error) {
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // ===== STATS =====
  app.get("/api/restaurant/stats", async (req, res) => {
    try {
      const restaurantId = (req.query.restaurantId || req.query.userId) as string;
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
      const supplierId = (req.query.supplierId || req.query.userId) as string;
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

  // ===== COMPLAINTS =====
  app.get("/api/complaints", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      const supplierId = req.query.supplierId as string;
      if (restaurantId) {
        const complaints = await storage.getComplaintsByRestaurant(restaurantId);
        return res.json(complaints);
      }
      if (supplierId) {
        const complaints = await storage.getComplaintsBySupplier(supplierId);
        return res.json(complaints);
      }
      return res.status(400).json({ error: "restaurantId or supplierId required" });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  });

  app.post("/api/complaints", async (req, res) => {
    try {
      const validated = insertComplaintSchema.parse(req.body);
      const complaint = await storage.createComplaint(validated);
      
      // Create complaint message in chat
      const conversation = await storage.getOrCreateConversation(validated.restaurantId, validated.supplierId);
      const complaintContent = JSON.stringify({
        title: validated.title,
        description: validated.description,
        orderId: validated.orderId,
        complaintId: complaint.id
      });
      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: validated.restaurantId,
        messageType: "complaint",
        content: complaintContent,
        orderId: validated.orderId,
      });
      
      // Create notification for supplier about new complaint
      const restaurant = await storage.getUser(validated.restaurantId);
      await storage.createNotification({
        userId: validated.supplierId,
        type: "new_complaint",
        title: "Neue Reklamation",
        message: `${restaurant?.companyName || restaurant?.name || "Ein Restaurant"} hat eine Reklamation eingereicht: ${validated.title}`,
        referenceId: complaint.id
      });
      
      res.status(201).json(complaint);
    } catch (error) {
      console.error("Create complaint error:", error);
      res.status(400).json({ error: "Invalid complaint data" });
    }
  });

  app.get("/api/complaints/by-order/:orderId", async (req, res) => {
    try {
      const complaint = await storage.getComplaintByOrderId(req.params.orderId);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      res.json(complaint);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch complaint" });
    }
  });

  app.get("/api/complaints/:id", async (req, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      res.json(complaint);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch complaint" });
    }
  });

  app.patch("/api/complaints/:id", async (req, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      
      // Check if trying to edit content (title, description, mediaUrls) on a non-open complaint
      const isContentEdit = req.body.title !== undefined || req.body.description !== undefined || req.body.mediaUrls !== undefined;
      const isStatusOnly = req.body.status !== undefined && !isContentEdit;
      
      if (isContentEdit && complaint.status !== "open") {
        return res.status(400).json({ error: "Reklamationen können nur bearbeitet werden, wenn der Status 'Offen' ist." });
      }
      
      const validated = updateComplaintSchema.parse(req.body);
      const updated = await storage.updateComplaint(req.params.id, validated);
      res.json(updated);
    } catch (error) {
      console.error("Update complaint error:", error);
      res.status(400).json({ error: "Invalid complaint data" });
    }
  });

  app.get("/api/complaints/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getComplaintComments(req.params.id);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/complaints/:id/comments", async (req, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      
      const validated = insertComplaintCommentSchema.parse({
        ...req.body,
        complaintId: req.params.id
      });
      const comment = await storage.addComplaintComment(validated);
      
      // Notify the other party
      const notifyUserId = req.body.userId === complaint.restaurantId 
        ? complaint.supplierId 
        : complaint.restaurantId;
      const commenter = await storage.getUser(req.body.userId);
      
      await storage.createNotification({
        userId: notifyUserId,
        type: "complaint_comment",
        title: "Neuer Kommentar zur Reklamation",
        message: `${commenter?.companyName || commenter?.name || "Jemand"} hat einen Kommentar hinzugefügt: "${validated.content.substring(0, 50)}${validated.content.length > 50 ? '...' : ''}"`,
        referenceId: complaint.id
      });
      
      res.status(201).json(comment);
    } catch (error) {
      console.error("Create comment error:", error);
      res.status(400).json({ error: "Invalid comment data" });
    }
  });

  app.get("/api/suppliers-with-orders", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      if (!restaurantId) {
        return res.json([]);
      }
      const suppliers = await storage.getSuppliersWithOrders(restaurantId);
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  app.get("/api/orders-by-supplier", async (req, res) => {
    try {
      const restaurantId = req.query.restaurantId as string;
      const supplierId = req.query.supplierId as string;
      if (!restaurantId || !supplierId) {
        return res.json([]);
      }
      const orders = await storage.getOrdersByRestaurantAndSupplier(restaurantId, supplierId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // ===== NOTIFICATIONS =====
  app.get("/api/notifications", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }
      const notificationsList = await storage.getNotifications(userId);
      res.json(notificationsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/count", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notification count" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const validated = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(validated);
      res.status(201).json(notification);
    } catch (error) {
      res.status(500).json({ error: "Failed to create notification" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const updated = await storage.markNotificationAsRead(req.params.id);
      if (!updated) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/read-by-reference", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const referenceId = req.query.referenceId as string;
      const type = req.query.type as string | undefined;
      if (!userId || !referenceId) {
        return res.status(400).json({ error: "userId and referenceId required" });
      }
      await storage.markNotificationsByReferenceAsRead(userId, referenceId, type);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });

  app.patch("/api/notifications/read-all", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }
      await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // ===== DOCUMENTS =====
  app.get("/api/documents", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const role = req.query.role as "restaurant" | "supplier";
      if (!userId || !role) {
        return res.status(400).json({ error: "userId and role required" });
      }
      const docs = await storage.getDocumentsByUser(userId, role);
      res.json(docs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/orders/:id/delivery-note/download", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const docs = await storage.getDocumentsByOrder(order.id);
      const deliveryNote = docs.find(d => d.type === "delivery_note");
      if (deliveryNote) {
        const objectService = new ObjectStorageService();
        const objectFile = await objectService.getObjectEntityFile(deliveryNote.fileUrl);
        res.setHeader("Content-Disposition", `attachment; filename="Lieferschein_${order.id.slice(0, 8)}.pdf"`);
        await objectService.downloadObject(objectFile, res);
      } else {
        const pdfBuffer = await generateDeliveryNotePDF(order);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="Lieferschein_${order.id.slice(0, 8)}.pdf"`);
        res.send(pdfBuffer);
      }
    } catch (error) {
      console.error("Failed to download delivery note:", error);
      res.status(500).json({ error: "Failed to download delivery note" });
    }
  });

  app.post("/api/orders/:id/delivery-note", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.status !== "in_delivery") {
        return res.status(400).json({ error: "Order must be in delivery status" });
      }

      const existingDocs = await storage.getDocumentsByOrder(order.id);
      const hasDeliveryNote = existingDocs.some(d => d.type === "delivery_note");
      if (hasDeliveryNote) {
        return res.status(400).json({ error: "Delivery note already exists", document: existingDocs.find(d => d.type === "delivery_note") });
      }

      const pdfBuffer = await generateDeliveryNotePDF(order);

      const objectService = new ObjectStorageService();
      const privateDir = objectService.getPrivateObjectDir();
      const fileId = randomUUID();
      const fullPath = `${privateDir}/documents/${fileId}.pdf`;
      const pathParts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
      const bucketName = pathParts[0];
      const objectName = pathParts.slice(1).join("/");
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      await file.save(pdfBuffer, {
        contentType: "application/pdf",
        metadata: {
          contentType: "application/pdf",
        },
      });

      const entityDir = privateDir.endsWith("/") ? privateDir : `${privateDir}/`;
      const relativePath = `documents/${fileId}.pdf`;
      const objectPath = `/objects/${relativePath}`;

      const document = await storage.createDocument({
        orderId: order.id,
        type: "delivery_note",
        title: `Lieferschein #${order.id.slice(0, 8)}`,
        fileUrl: objectPath,
        restaurantId: order.restaurantId,
        supplierId: order.supplierId,
      });

      const conversation = await storage.getOrCreateConversation(order.restaurantId, order.supplierId);

      await storage.sendMessage({
        conversationId: conversation.id,
        senderId: order.supplierId,
        messageType: "document",
        content: JSON.stringify({
          documentId: document.id,
          title: document.title,
          type: "delivery_note",
          orderId: order.id,
          fileUrl: objectPath,
        }),
        orderId: order.id,
        documentUrl: objectPath,
      });

      res.json(document);
    } catch (error) {
      console.error("Failed to generate delivery note:", error);
      res.status(500).json({ error: "Failed to generate delivery note" });
    }
  });

  return httpServer;
}

async function generateDeliveryNotePDF(order: {
  id: string;
  restaurant: { name: string; companyName: string | null; address: string | null; city: string | null; postalCode: string | null };
  supplier: { name: string; companyName: string | null; address: string | null; city: string | null; postalCode: string | null; phone: string | null; email: string };
  items: Array<{ productName: string; quantity: number; unitPrice: string; totalPrice: string }>;
  totalAmount: string;
  createdAt: Date;
  notes: string | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const supplierName = order.supplier.companyName || order.supplier.name;
    const restaurantName = order.restaurant.companyName || order.restaurant.name;
    const deliveryDate = new Date().toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    const orderDate = new Date(order.createdAt).toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });

    doc.fontSize(22).font("Helvetica-Bold").text("LIEFERSCHEIN", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").fillColor("#666666")
      .text(`Lieferschein-Nr: LS-${order.id.slice(0, 8).toUpperCase()}`, { align: "center" });
    doc.text(`Datum: ${deliveryDate}`, { align: "center" });

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(1);

    const topY = doc.y;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#333333").text("Lieferant:", 50, topY);
    doc.font("Helvetica").fontSize(10).fillColor("#333333");
    doc.text(supplierName, 50, topY + 16);
    if (order.supplier.address) doc.text(order.supplier.address);
    if (order.supplier.postalCode || order.supplier.city) {
      doc.text(`${order.supplier.postalCode || ""} ${order.supplier.city || ""}`.trim());
    }
    if (order.supplier.phone) doc.text(`Tel: ${order.supplier.phone}`);
    doc.text(order.supplier.email);

    doc.fontSize(10).font("Helvetica-Bold").text("Empfänger:", 300, topY);
    doc.font("Helvetica").fontSize(10);
    doc.text(restaurantName, 300, topY + 16);
    if (order.restaurant.address) doc.text(order.restaurant.address, 300);
    if (order.restaurant.postalCode || order.restaurant.city) {
      doc.text(`${order.restaurant.postalCode || ""} ${order.restaurant.city || ""}`.trim(), 300);
    }

    const afterAddresses = Math.max(doc.y, topY + 80);
    doc.y = afterAddresses;
    doc.moveDown(1);

    doc.fontSize(10).font("Helvetica").fillColor("#666666");
    doc.text(`Bestellnummer: #${order.id.slice(0, 8).toUpperCase()}`, 50);
    doc.text(`Bestelldatum: ${orderDate}`, 50);
    doc.text(`Lieferdatum: ${deliveryDate}`, 50);

    doc.moveDown(1);

    const tableTop = doc.y;
    doc.fillColor("#f5f5f5").rect(50, tableTop, 495, 22).fill();
    doc.fillColor("#333333").font("Helvetica-Bold").fontSize(10);
    doc.text("Pos.", 55, tableTop + 6, { width: 35 });
    doc.text("Produkt", 95, tableTop + 6, { width: 250 });
    doc.text("Menge", 350, tableTop + 6, { width: 60, align: "right" });
    doc.text("Einzelpreis", 415, tableTop + 6, { width: 60, align: "right" });
    doc.text("Gesamt", 480, tableTop + 6, { width: 60, align: "right" });

    let rowY = tableTop + 28;
    doc.font("Helvetica").fontSize(10).fillColor("#333333");

    order.items.forEach((item, index) => {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
      }
      if (index % 2 === 1) {
        doc.fillColor("#fafafa").rect(50, rowY - 4, 495, 20).fill();
        doc.fillColor("#333333");
      }
      doc.text(`${index + 1}`, 55, rowY, { width: 35 });
      doc.text(item.productName, 95, rowY, { width: 250 });
      doc.text(`${item.quantity}`, 350, rowY, { width: 60, align: "right" });
      doc.text(`${item.unitPrice} €`, 415, rowY, { width: 60, align: "right" });
      doc.text(`${item.totalPrice} €`, 480, rowY, { width: 60, align: "right" });
      rowY += 22;
    });

    doc.moveDown(0.5);
    doc.y = rowY + 5;
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#333333");
    doc.text(`Gesamtbetrag: ${order.totalAmount} €`, 350, doc.y, { width: 195, align: "right" });

    if (order.notes) {
      doc.moveDown(1.5);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333").text("Anmerkungen:", 50);
      doc.font("Helvetica").fontSize(10).text(order.notes, 50);
    }

    const signatureY = Math.max(doc.y + 60, 650);
    if (signatureY < 750) {
      doc.y = signatureY;
      doc.moveTo(50, doc.y).lineTo(230, doc.y).strokeColor("#999999").lineWidth(0.5).stroke();
      doc.moveTo(320, doc.y).lineTo(500, doc.y).stroke();
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#666666").font("Helvetica");
      doc.text("Unterschrift Lieferant", 50, doc.y, { width: 180, align: "center" });
      doc.text("Unterschrift Empfänger", 320, doc.y - doc.currentLineHeight(), { width: 180, align: "center" });
    }

    doc.fontSize(8).fillColor("#999999").font("Helvetica");
    doc.text(
      `Erstellt am ${deliveryDate} | ${supplierName} | GastroConnect`,
      50, 780, { width: 495, align: "center" }
    );

    doc.end();
  });
}
