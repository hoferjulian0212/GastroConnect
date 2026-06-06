import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import { orders, orderItems, users, formatOrderNumber } from "@shared/schema";
import { and, eq, desc, ilike, or } from "drizzle-orm";
import { storage } from "./storage";

type Role = "restaurant" | "supplier";

interface AiActionRaw {
  kind: "open_inbox" | "open_order";
  orderId?: string;
  suggestedMessage?: string;
  label?: string;
}

interface AiAction {
  kind: "open_inbox" | "open_order";
  label: string;
  href: string;
  orderId?: string;
  orderNumber?: string;
  partnerId?: string;
  suggestedMessage?: string;
}

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function likePattern(raw: string): string {
  const safe = String(raw || "").replace(/[\\%_]/g, (m) => "\\" + m);
  return `%${safe}%`;
}

// Read-only, role-scoped data lookups the model can call. Every query is filtered
// by the trusted userId/role so the assistant can never read another tenant's data.
function buildTools(userId: string, role: Role) {
  const ownOrderCol = role === "restaurant" ? orders.restaurantId : orders.supplierId;
  const partnerCol = role === "restaurant" ? orders.supplierId : orders.restaurantId;
  const partnerRoleLabel = role === "restaurant" ? "supplier" : "customer";

  async function find_recent_order_with_product(args: { productName?: string }) {
    const name = String(args?.productName || "").trim();
    if (!name) return { error: "productName is required" };
    const rows = await db
      .selectDistinct({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
        productName: orderItems.productName,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        lineTotal: orderItems.totalPrice,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(eq(ownOrderCol, userId), ilike(orderItems.productName, likePattern(name))))
      .orderBy(desc(orders.createdAt))
      .limit(5);
    return {
      matches: rows.map((r) => ({
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: r.requestedDeliveryDate || null,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
        product: { name: r.productName, quantity: r.quantity, unitPrice: r.unitPrice, lineTotal: r.lineTotal },
      })),
    };
  }

  async function find_orders_by_partner(args: { partnerName?: string; status?: string }) {
    const name = String(args?.partnerName || "").trim();
    if (!name) return { error: "partnerName is required" };
    const pat = likePattern(name);
    const conds = [
      eq(ownOrderCol, userId),
      or(ilike(users.companyName, pat), ilike(users.name, pat)),
    ];
    const status = String(args?.status || "").trim();
    const validStatuses = ["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"];
    if (status && validStatuses.includes(status)) conds.push(eq(orders.status, status as any));
    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(...conds))
      .orderBy(desc(orders.createdAt))
      .limit(10);
    return {
      orders: rows.map((r) => ({
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: r.requestedDeliveryDate || null,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
      })),
    };
  }

  async function get_order_status(args: { orderNumber?: string }) {
    const q = String(args?.orderNumber || "").trim();
    if (!q) return { error: "orderNumber is required" };
    const digits = q.replace(/[^0-9a-zA-Z]/g, "");
    const conds = [eq(ownOrderCol, userId)];
    const orFilters = [ilike(orders.orderNumber, likePattern(q))];
    if (digits) orFilters.push(ilike(orders.orderNumber, likePattern(digits)));
    orFilters.push(eq(orders.id, q));
    const rows = await db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        requestedDeliveryDate: orders.requestedDeliveryDate,
        originalDeliveryDate: orders.originalDeliveryDate,
        totalAmount: orders.totalAmount,
        partnerId: users.id,
        partnerName: users.companyName,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, partnerCol))
      .where(and(conds[0], or(...orFilters)))
      .orderBy(desc(orders.createdAt))
      .limit(5);
    return {
      matches: rows.map((r) => ({
        orderId: r.orderId,
        orderNumber: formatOrderNumber({ orderNumber: r.orderNumber, id: r.orderId }),
        status: r.status,
        orderDate: fmtDate(r.createdAt),
        deliveryDate: r.requestedDeliveryDate || null,
        originalDeliveryDate: r.originalDeliveryDate || null,
        orderTotal: r.totalAmount,
        [`${partnerRoleLabel}Id`]: r.partnerId,
        [`${partnerRoleLabel}Name`]: r.partnerName,
      })),
    };
  }

  const handlers: Record<string, (args: any) => Promise<any>> = {
    find_recent_order_with_product,
    find_orders_by_partner,
    get_order_status,
  };

  const definitions = [
    {
      type: "function" as const,
      function: {
        name: "find_recent_order_with_product",
        description:
          "Find the most recent orders that contain a product whose name matches the query. Use this for questions like 'when did I last order tomatoes', 'how many crates of milk did I order last time', or to find an order by the product it contained. Returns the order date, delivery date, status, the matched line item (quantity, unit price) and the trading partner.",
        parameters: {
          type: "object",
          properties: {
            productName: { type: "string", description: "Product name or part of it, e.g. 'tomato', 'Milch'." },
          },
          required: ["productName"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "find_orders_by_partner",
        description:
          role === "restaurant"
            ? "List recent orders placed with a specific supplier, matched by supplier/company name. Use for questions like 'what is the status of my orders from Müller GmbH' or 'when will my order from X arrive'. Optionally filter by status."
            : "List recent orders received from a specific customer (restaurant), matched by company name. Optionally filter by status.",
        parameters: {
          type: "object",
          properties: {
            partnerName: { type: "string", description: "Name of the supplier/customer or part of it." },
            status: {
              type: "string",
              description: "Optional status filter.",
              enum: ["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"],
            },
          },
          required: ["partnerName"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_order_status",
        description:
          "Look up a specific order by its order number (e.g. '#000123' or '123') and return its status, order date and delivery date.",
        parameters: {
          type: "object",
          properties: {
            orderNumber: { type: "string", description: "The order number the user referenced." },
          },
          required: ["orderNumber"],
        },
      },
    },
  ];

  return { handlers, definitions };
}

const RESPOND_TOOL = {
  type: "function" as const,
  function: {
    name: "respond",
    description:
      "Provide the final answer to the user. Call this exactly once when you have gathered enough information (or determined that you cannot answer). Include action buttons only when they are clearly useful.",
    parameters: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          description:
            "A concise, friendly natural-language answer in the SAME language as the user's question. Reference concrete facts (dates, quantities, amounts) from the tool results. If no data was found, say so plainly.",
        },
        actions: {
          type: "array",
          description:
            "Optional deep-link actions. Use 'open_inbox' to start a chat about an order (e.g. when there is NO delivery date and the user should ask the partner for an update) and always provide a helpful 'suggestedMessage' to pre-fill. Use 'open_order' to open an order's detail page. Only reference orderId values returned by the data tools.",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["open_inbox", "open_order"] },
              orderId: { type: "string", description: "An orderId returned by a data tool." },
              suggestedMessage: {
                type: "string",
                description: "For open_inbox: a polite pre-filled message in the user's language, e.g. asking for a delivery date.",
              },
              label: { type: "string", description: "Short button label in the user's language." },
            },
            required: ["kind", "label"],
          },
        },
      },
      required: ["answer"],
    },
  },
};

function systemPrompt(role: Role, lang: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const partner = role === "restaurant" ? "suppliers" : "customers (restaurants)";
  return [
    `You are the in-app data assistant for GastroConnect, a B2B ordering platform for restaurants and suppliers.`,
    `The current user is a ${role}. Today's date is ${today}.`,
    `Answer ONLY using the provided data tools — never invent orders, dates, quantities or prices.`,
    `All tools are already scoped to this user's own data and their ${partner}; you cannot access anyone else's data.`,
    `Reply in the same language as the user's question (German or Italian are most common; default to German if unclear).`,
    `Keep answers short and concrete. When an order has no delivery date and the user is waiting on it, offer an 'open_inbox' action with a polite suggestedMessage asking the partner for the delivery date.`,
    `Always finish by calling the "respond" tool with your final answer.`,
  ].join(" ");
}

async function resolveAction(raw: AiActionRaw, userId: string, role: Role): Promise<AiAction | null> {
  if (!raw || (raw.kind !== "open_inbox" && raw.kind !== "open_order")) return null;
  const label = String(raw.label || "").trim();
  if (!label) return null;

  // Deep links that reference an order must be validated server-side so the model
  // can never produce a link to an order the user does not own.
  if (!raw.orderId) {
    if (raw.kind === "open_order") return null;
    return { kind: "open_inbox", label, href: `/${role}/inbox`, suggestedMessage: raw.suggestedMessage };
  }

  const ownOrderCol = role === "restaurant" ? orders.restaurantId : orders.supplierId;
  const partnerCol = role === "restaurant" ? orders.supplierId : orders.restaurantId;
  const [row] = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      partnerId: partnerCol,
    })
    .from(orders)
    .where(and(eq(orders.id, raw.orderId), eq(ownOrderCol, userId)))
    .limit(1);
  if (!row) return null;

  const orderNumber = formatOrderNumber({ orderNumber: row.orderNumber, id: row.orderId });

  if (raw.kind === "open_order") {
    return { kind: "open_order", label, href: `/${role}/orders/${row.orderId}`, orderId: row.orderId, orderNumber, partnerId: row.partnerId };
  }

  const params = new URLSearchParams({ to: row.partnerId, orderRefId: row.orderId, orderNumber });
  const suggestedMessage = (raw.suggestedMessage || "").trim();
  if (suggestedMessage) params.set("prefill", suggestedMessage);
  return {
    kind: "open_inbox",
    label,
    href: `/${role}/inbox?${params.toString()}`,
    orderId: row.orderId,
    orderNumber,
    partnerId: row.partnerId,
    suggestedMessage: suggestedMessage || undefined,
  };
}

function aiConfigured(): boolean {
  return !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
}

function makeTitle(question: string): string {
  const clean = String(question || "").replace(/\s+/g, " ").trim();
  if (!clean) return "Chat";
  return clean.length > 60 ? clean.slice(0, 57) + "…" : clean;
}

// Runs the tool-calling assistant loop for a single new user question, given the
// prior conversation turns as context. Assumes the AI integration is configured.
async function runAssistant(opts: {
  userId: string;
  role: Role;
  lang: string;
  priorTurns: { role: "user" | "assistant"; content: string }[];
  question: string;
}): Promise<{ answer: string; actions: AiAction[] }> {
  const { userId, role, lang, priorTurns, question } = opts;
  const { handlers, definitions } = buildTools(userId, role);
  const tools = [...definitions, RESPOND_TOOL];

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const messages: any[] = [{ role: "system", content: systemPrompt(role, lang) }];
  for (const turn of priorTurns) {
    if (turn.content) messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: question });

  let answer = "";
  let rawActions: AiActionRaw[] = [];
  const MAX_TURNS = 6;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      messages,
      tools,
      tool_choice: turn === MAX_TURNS - 1 ? { type: "function", function: { name: "respond" } } : "auto",
    });

    const msg = completion.choices[0]?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      answer = (msg.content || "").trim();
      break;
    }

    messages.push(msg);

    let responded = false;
    for (const call of toolCalls) {
      const fn = (call as any).function;
      const fnName: string = fn?.name || "";
      let parsedArgs: any = {};
      try {
        parsedArgs = JSON.parse(fn?.arguments || "{}");
      } catch {
        parsedArgs = {};
      }

      if (fnName === "respond") {
        answer = String(parsedArgs?.answer || "").trim();
        rawActions = Array.isArray(parsedArgs?.actions) ? parsedArgs.actions : [];
        responded = true;
        messages.push({ role: "tool", tool_call_id: call.id, content: "ok" });
        continue;
      }

      const handler = handlers[fnName];
      let result: any;
      try {
        result = handler ? await handler(parsedArgs) : { error: `unknown tool ${fnName}` };
      } catch (e: any) {
        result = { error: "tool_failed", message: e?.message || String(e) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }

    if (responded) break;
  }

  if (!answer) {
    answer =
      lang === "it"
        ? "Non sono riuscito a trovare una risposta a questa domanda."
        : "Ich konnte dazu leider keine Antwort finden.";
  }

  const actions: AiAction[] = [];
  for (const raw of rawActions.slice(0, 4)) {
    const resolved = await resolveAction(raw, userId, role);
    if (resolved) actions.push(resolved);
  }

  return { answer, actions };
}

export function registerAiSearchRoutes(app: Express) {
  const jsonBody = express.json({ limit: "32kb" });

  // Each call hits a paid AI model with tool-calling, so it gets a tight limit to
  // guard against cost-amplification / abuse (mirrors the price-list parser).
  const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Zu viele Anfragen. Bitte versuchen Sie es in ein paar Minuten erneut." },
    validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
  });

  // Legacy one-shot endpoint (kept for backward-compat). The in-app UI now uses
  // the conversational /api/ai/chat endpoints below.
  app.post("/api/search/ai", aiLimiter, jsonBody, async (req: Request, res: Response) => {
    try {
      const question = String(req.body?.question || "").trim();
      const userId = String(req.body?.userId || "").trim();
      const role = String(req.body?.role || "").trim() as Role;
      const lang = String(req.body?.lang || "de").trim();

      if (!question) return res.status(400).json({ error: "question_required" });
      if (question.length > 500) return res.status(400).json({ error: "question_too_long" });
      if (!userId || (role !== "restaurant" && role !== "supplier")) {
        return res.status(400).json({ error: "invalid_user" });
      }
      if (!aiConfigured()) {
        return res.status(503).json({ error: "ai_not_configured", message: "KI-Integration ist noch nicht eingerichtet." });
      }

      const { answer, actions } = await runAssistant({ userId, role, lang, priorTurns: [], question });
      return res.json({ answer, actions });
    } catch (error: any) {
      console.error("[search/ai] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed", message: "Die Anfrage konnte nicht verarbeitet werden." });
    }
  });

  // List the current user's AI conversations (newest first).
  app.get("/api/ai/chats", async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || "").trim();
      const role = String(req.query.role || "").trim() as Role;
      if (!userId || (role !== "restaurant" && role !== "supplier")) {
        return res.status(400).json({ error: "invalid_user" });
      }
      const chats = await storage.getAiChats(userId, role);
      return res.json(
        chats.map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt })),
      );
    } catch (error: any) {
      console.error("[ai/chats] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed" });
    }
  });

  // Fetch a single conversation with all of its messages.
  app.get("/api/ai/chats/:id", async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || "").trim();
      const role = String(req.query.role || "").trim();
      const id = String(req.params.id || "").trim();
      if (!userId) return res.status(400).json({ error: "invalid_user" });
      const chat = await storage.getAiChat(id);
      if (!chat || chat.userId !== userId || (role && chat.role !== role)) {
        return res.status(404).json({ error: "chat_not_found" });
      }
      const messages = await storage.getAiChatMessages(id);
      return res.json({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          actions: m.actions || [],
          createdAt: m.createdAt,
        })),
      });
    } catch (error: any) {
      console.error("[ai/chats/:id] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed" });
    }
  });

  // Delete a conversation (and its messages via cascade).
  app.delete("/api/ai/chats/:id", async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || "").trim();
      const role = String(req.query.role || "").trim();
      const id = String(req.params.id || "").trim();
      if (!userId) return res.status(400).json({ error: "invalid_user" });
      // When a role is supplied, only delete if it matches (prevents cross-role
      // deletion for a shared userId); falls back to owner-only scoping otherwise.
      if (role) {
        const chat = await storage.getAiChat(id);
        if (chat && (chat.userId !== userId || chat.role !== role)) {
          return res.status(404).json({ error: "chat_not_found" });
        }
      }
      await storage.deleteAiChat(id, userId);
      return res.json({ ok: true });
    } catch (error: any) {
      console.error("[ai/chats delete] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed" });
    }
  });

  // Send a message in a conversation (create a new one when no chatId is given).
  // Persists the user turn + assistant reply and feeds prior turns back as context.
  app.post("/api/ai/chat", aiLimiter, jsonBody, async (req: Request, res: Response) => {
    try {
      const question = String(req.body?.question || "").trim();
      const userId = String(req.body?.userId || "").trim();
      const role = String(req.body?.role || "").trim() as Role;
      const lang = String(req.body?.lang || "de").trim();
      const chatIdRaw = req.body?.chatId ? String(req.body.chatId).trim() : "";

      if (!question) return res.status(400).json({ error: "question_required" });
      if (question.length > 500) return res.status(400).json({ error: "question_too_long" });
      if (!userId || (role !== "restaurant" && role !== "supplier")) {
        return res.status(400).json({ error: "invalid_user" });
      }
      if (!aiConfigured()) {
        return res.status(503).json({ error: "ai_not_configured", message: "KI-Integration ist noch nicht eingerichtet." });
      }

      // Resolve or create the conversation, scoped to this user + role.
      let chat = chatIdRaw ? await storage.getAiChat(chatIdRaw) : undefined;
      if (chatIdRaw) {
        if (!chat || chat.userId !== userId || chat.role !== role) {
          return res.status(404).json({ error: "chat_not_found" });
        }
      }
      if (!chat) {
        chat = await storage.createAiChat({ userId, role, title: makeTitle(question) });
      }

      // Use recent stored turns as context (cap to keep token cost bounded).
      const stored = await storage.getAiChatMessages(chat.id);
      const priorTurns = stored.slice(-10).map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

      await storage.appendAiChatMessage({ chatId: chat.id, role: "user", content: question });

      const { answer, actions } = await runAssistant({ userId, role, lang, priorTurns, question });

      const assistantMsg = await storage.appendAiChatMessage({
        chatId: chat.id,
        role: "assistant",
        content: answer,
        actions: actions.length ? actions : null,
      });

      return res.json({
        chatId: chat.id,
        title: chat.title,
        messageId: assistantMsg.id,
        answer,
        actions,
      });
    } catch (error: any) {
      console.error("[ai/chat] failed:", error?.message || error);
      return res.status(500).json({ error: "ai_failed", message: "Die Anfrage konnte nicht verarbeitet werden." });
    }
  });
}
