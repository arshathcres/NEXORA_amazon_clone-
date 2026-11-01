import { Router, type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import prisma from "../config/database";
import { requireAdmin, requireAuth, type AuthUser } from "../middleware/authMiddleware";

const router = Router();

const addressIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
const orderIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);

const checkoutSchema = z.object({
  address_id: addressIdSchema,
  payment_method: z.enum(["COD", "DEMO_PAYMENT"]),
});

const statusUpdateSchema = z.object({
  status: z.enum(["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]),
});

function requireSameSite(req: Request, res: Response, next: NextFunction) {
  const allowed = [
    process.env.FRONTEND_ORIGIN || "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
  ];
  let origin = req.get("origin");
  if (!origin && req.get("referer")) {
    try { origin = new URL(req.get("referer")!).origin; } catch { origin = undefined; }
  }
  if (!origin || !allowed.includes(origin)) {
    res.status(403).json({ success: false, message: "Request origin was not allowed." });
    return;
  }
  next();
}

function userId(res: Response): string {
  return (res.locals.authUser as AuthUser).id;
}

function toOrderResponse(order: any) {
  return {
    id: order.id.toString(),
    user_id: order.user_id,
    address_id: order.address_id?.toString() ?? null,
    total_paise: order.total_paise.toString(),
    status: order.status,
    created_at: order.created_at,
    updated_at: order.updated_at,
    address: order.addresses
      ? {
          id: order.addresses.id.toString(),
          full_name: order.addresses.full_name,
          phone: order.addresses.phone,
          address_line1: order.addresses.address_line1,
          address_line2: order.addresses.address_line2,
          city: order.addresses.city,
          state: order.addresses.state,
          postal_code: order.addresses.postal_code,
          country: order.addresses.country,
        }
      : null,
    items: (order.order_items ?? []).map((item: any) => ({
      id: item.id.toString(),
      product_id: item.product_id?.toString() ?? null,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price_paise: item.unit_price_paise.toString(),
      line_total_paise: (BigInt(item.unit_price_paise) * BigInt(item.quantity)).toString(),
    })),
    payments: (order.payments ?? []).map((p: any) => ({
      id: p.id.toString(),
      payment_method: p.payment_method,
      payment_status: p.payment_status,
      amount_paise: p.amount_paise.toString(),
      transaction_reference: p.transaction_reference,
      created_at: p.created_at,
    })),
  };
}

// -------------------------------------------------------------
// CUSTOMER ENDPOINTS (requireAuth)
// -------------------------------------------------------------

// Customer: list my orders
router.get("/my", requireAuth, async (_req, res) => {
  try {
    const orders = await prisma.orders.findMany({
      where: { user_id: userId(res) },
      include: {
        addresses: true,
        order_items: true,
        payments: true,
      },
      orderBy: { id: "desc" },
    });
    res.json({ success: true, orders: orders.map(toOrderResponse) });
  } catch (error) {
    console.error("Orders fetch error:", error);
    res.status(500).json({ success: false, message: "Could not fetch your orders." });
  }
});

// Customer: get my single order
router.get("/my/:id", requireAuth, async (req, res) => {
  const parsedId = orderIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ success: false, message: "Invalid order ID." });
    return;
  }
  try {
    const order = await prisma.orders.findFirst({
      where: { id: BigInt(parsedId.data), user_id: userId(res) },
      include: {
        addresses: true,
        order_items: true,
        payments: true,
      },
    });
    if (!order) {
      res.status(404).json({ success: false, message: "Order not found." });
      return;
    }
    res.json({ success: true, order: toOrderResponse(order) });
  } catch (error) {
    console.error("Order detail error:", error);
    res.status(500).json({ success: false, message: "Could not fetch order details." });
  }
});

// Customer: checkout from active cart (atomic database transaction)
router.post("/checkout", requireAuth, requireSameSite, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Choose a delivery address and valid payment method (COD or DEMO_PAYMENT).",
      errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
    return;
  }

  const uid = userId(res);
  const addressId = BigInt(parsed.data.address_id);
  const paymentMethod = parsed.data.payment_method;

  try {
    const createdOrder = await prisma.$transaction(async (tx) => {
      // 1. Verify address belongs to customer
      const address = await tx.addresses.findFirst({
        where: { id: addressId, user_id: uid },
        select: { id: true },
      });
      if (!address) throw new Error("CHECKOUT_ADDRESS_INVALID");

      // 2. Fetch customer cart and items
      const cart = await tx.carts.findUnique({
        where: { user_id: uid },
        include: {
          cart_items: {
            include: { products: true },
          },
        },
      });
      if (!cart || cart.cart_items.length === 0) {
        throw new Error("CHECKOUT_CART_EMPTY");
      }

      // 3. Stock check & total calculation strictly on backend
      let totalPaise = 0n;
      for (const item of cart.cart_items) {
        const prod = item.products;
        if (!prod || !prod.is_active) throw new Error(`PRODUCT_UNAVAILABLE:${item.product_id}`);
        if (prod.stock < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${prod.name}:${prod.stock}:${item.quantity}`);
        }
        totalPaise += prod.price_paise * BigInt(item.quantity);
      }

      // 4. Create the Order
      const newOrder = await tx.orders.create({
        data: {
          user_id: uid,
          address_id: addressId,
          total_paise: totalPaise,
          status: "PENDING",
        },
      });

      // 5. Create Order Items (snapshot product name + unit price) and decrement product stock
      for (const item of cart.cart_items) {
        const prod = item.products;
        await tx.order_items.create({
          data: {
            order_id: newOrder.id,
            product_id: prod.id,
            product_name: prod.name,
            quantity: item.quantity,
            unit_price_paise: prod.price_paise,
          },
        });
        await tx.products.update({
          where: { id: prod.id },
          data: { stock: { decrement: item.quantity } },
        });
      }

      // 6. Record Payment (COD or Simulated DEMO payment only - no real gateways)
      const isDemo = paymentMethod === "DEMO_PAYMENT";
      await tx.payments.create({
        data: {
          order_id: newOrder.id,
          payment_method: isDemo ? "DEMO_PAYMENT" : "COD",
          payment_status: isDemo ? "COMPLETED" : "PENDING",
          amount_paise: totalPaise,
          transaction_reference: isDemo ? `DEMO-TXN-${randomUUID()}` : null,
        },
      });

      // 7. Clear the customer's cart items
      await tx.cart_items.deleteMany({ where: { cart_id: cart.id } });

      return tx.orders.findUnique({
        where: { id: newOrder.id },
        include: {
          addresses: true,
          order_items: true,
          payments: true,
        },
      });
    });

    res.status(201).json({ success: true, order: toOrderResponse(createdOrder) });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "CHECKOUT_ADDRESS_INVALID") {
        res.status(400).json({ success: false, message: "Invalid delivery address selected." });
        return;
      }
      if (error.message === "CHECKOUT_CART_EMPTY") {
        res.status(400).json({ success: false, message: "Your shopping cart is empty." });
        return;
      }
      if (error.message.startsWith("INSUFFICIENT_STOCK:")) {
        const [, name, available, requested] = error.message.split(":");
        res.status(409).json({
          success: false,
          message: `Insufficient stock for "${name}". Available: ${available}, requested: ${requested}.`,
        });
        return;
      }
      if (error.message.startsWith("PRODUCT_UNAVAILABLE:")) {
        res.status(409).json({ success: false, message: "One of the products in your cart is currently unavailable." });
        return;
      }
    }
    console.error("Checkout transaction error:", error);
    res.status(500).json({ success: false, message: "Order placement failed. Please try again." });
  }
});

// Customer: cancel my order (restores product stock)
router.post("/my/:id/cancel", requireAuth, requireSameSite, async (req, res) => {
  const parsedId = orderIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ success: false, message: "Invalid order ID." });
    return;
  }
  const uid = userId(res);
  const oid = BigInt(parsedId.data);
  try {
    const cancelled = await prisma.$transaction(async (tx) => {
      const order = await tx.orders.findFirst({
        where: { id: oid, user_id: uid },
        include: { order_items: true, payments: true },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (order.status === "CANCELLED") throw new Error("ALREADY_CANCELLED");
      if (["SHIPPED", "DELIVERED"].includes(order.status)) {
        throw new Error("CANNOT_CANCEL_SHIPPED");
      }

      // Restore product stock
      for (const item of order.order_items) {
        if (item.product_id) {
          await tx.products.update({
            where: { id: item.product_id },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      // Update payment status if needed
      await tx.payments.updateMany({
        where: { order_id: oid },
        data: { payment_status: "CANCELLED" },
      });

      return tx.orders.update({
        where: { id: oid },
        data: { status: "CANCELLED", updated_at: new Date() },
        include: { addresses: true, order_items: true, payments: true },
      });
    });

    res.json({ success: true, order: toOrderResponse(cancelled) });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ORDER_NOT_FOUND") {
        res.status(404).json({ success: false, message: "Order not found." });
        return;
      }
      if (error.message === "ALREADY_CANCELLED") {
        res.status(400).json({ success: false, message: "Order is already cancelled." });
        return;
      }
      if (error.message === "CANNOT_CANCEL_SHIPPED") {
        res.status(400).json({ success: false, message: "Cannot cancel an order that has already shipped or been delivered." });
        return;
      }
    }
    console.error("Order cancellation error:", error);
    res.status(500).json({ success: false, message: "Could not cancel order." });
  }
});

// -------------------------------------------------------------
// ADMIN ORDER MANAGEMENT (requireAuth + requireAdmin)
// -------------------------------------------------------------

// Admin: list all orders across all customers
router.get("/admin/all", requireAuth, requireAdmin, async (req, res) => {
  const querySchema = z.object({
    status: z.enum(["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]).optional(),
    page: z.string().regex(/^[1-9][0-9]{0,5}$/).default("1"),
    limit: z.string().regex(/^[1-9][0-9]{0,2}$/).default("20"),
  });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid filter parameters." });
    return;
  }
  const page = Number(parsed.data.page);
  const limit = Math.min(Number(parsed.data.limit), 100);
  const where = parsed.data.status ? { status: parsed.data.status } : {};

  try {
    const [orders, total] = await Promise.all([
      prisma.orders.findMany({
        where,
        include: {
          profiles: { select: { id: true, full_name: true, email: true } },
          addresses: true,
          order_items: true,
          payments: true,
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.orders.count({ where }),
    ]);

    const formatted = orders.map((o) => ({
      ...toOrderResponse(o),
      customer: {
        id: o.profiles.id,
        full_name: o.profiles.full_name,
        email: o.profiles.email,
      },
    }));

    res.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      orders: formatted,
    });
  } catch (error) {
    console.error("Admin orders list error:", error);
    res.status(500).json({ success: false, message: "Could not fetch orders." });
  }
});

// Admin: update order status
router.patch("/admin/:id/status", requireAuth, requireAdmin, async (req, res) => {
  const parsedId = orderIdSchema.safeParse(req.params.id);
  const parsedBody = statusUpdateSchema.safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) {
    res.status(400).json({ success: false, message: "Invalid order ID or status." });
    return;
  }
  const oid = BigInt(parsedId.data);
  const newStatus = parsedBody.data.status;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.orders.findUnique({
        where: { id: oid },
        include: { order_items: true, payments: true },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");

      // If transition is to CANCELLED and was not previously cancelled, restore stock
      if (newStatus === "CANCELLED" && order.status !== "CANCELLED") {
        for (const item of order.order_items) {
          if (item.product_id) {
            await tx.products.update({
              where: { id: item.product_id },
              data: { stock: { increment: item.quantity } },
            });
          }
        }
        await tx.payments.updateMany({
          where: { order_id: oid },
          data: { payment_status: "CANCELLED" },
        });
      }

      // If transition to DELIVERED and payment is COD, mark payment COMPLETED
      if (newStatus === "DELIVERED") {
        await tx.payments.updateMany({
          where: { order_id: oid, payment_method: "COD" },
          data: { payment_status: "COMPLETED" },
        });
      }

      return tx.orders.update({
        where: { id: oid },
        data: { status: newStatus, updated_at: new Date() },
        include: {
          addresses: true,
          order_items: true,
          payments: true,
        },
      });
    });

    res.json({ success: true, order: toOrderResponse(updated) });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      res.status(404).json({ success: false, message: "Order not found." });
      return;
    }
    console.error("Admin status update error:", error);
    res.status(500).json({ success: false, message: "Could not update order status." });
  }
});

export default router;
