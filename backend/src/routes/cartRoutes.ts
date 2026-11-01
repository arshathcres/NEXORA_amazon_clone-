import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { requireAuth, type AuthUser } from "../middleware/authMiddleware";

const router = Router();
router.use(requireAuth);

const productIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
const quantitySchema = z.object({ quantity: z.number().int().min(1).max(100) });

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

async function getCartResponse(ownerId: string) {
  const cart = await prisma.carts.findUnique({
    where: { user_id: ownerId },
    include: {
      cart_items: {
        include: { products: { include: { categories: true, product_images: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  const items = (cart?.cart_items ?? []).map((item) => {
    const product = item.products;
    const unitPrice = product.price_paise;
    return {
      id: item.id.toString(),
      product_id: product.id.toString(),
      quantity: item.quantity,
      product: {
        id: product.id.toString(),
        name: product.name,
        slug: product.slug,
        price_paise: unitPrice.toString(),
        stock: product.stock,
        is_active: product.is_active,
        category: product.categories ? { id: product.categories.id.toString(), name: product.categories.name, slug: product.categories.slug } : null,
        images: product.product_images.map((image) => ({ id: image.id.toString(), image_path: image.image_path, is_primary: image.is_primary })),
      },
      line_total_paise: (unitPrice * BigInt(item.quantity)).toString(),
    };
  });
  const subtotal = items.reduce((sum, item) => sum + BigInt(item.line_total_paise), 0n);
  return { id: cart?.id.toString() ?? null, items, subtotal_paise: subtotal.toString(), item_count: items.reduce((sum, item) => sum + item.quantity, 0) };
}

router.get("/", async (_req, res) => {
  try {
    res.json({ success: true, cart: await getCartResponse(userId(res)) });
  } catch (error) {
    console.error("Cart fetch error:", error);
    res.status(500).json({ success: false, message: "Could not retrieve cart." });
  }
});

router.post("/items", requireSameSite, async (req, res) => {
  const parsedId = productIdSchema.safeParse(req.body?.product_id);
  const parsedQuantity = quantitySchema.safeParse({ quantity: req.body?.quantity ?? 1 });
  if (!parsedId.success || !parsedQuantity.success) {
    res.status(400).json({ success: false, message: "Provide a valid product_id and quantity (1–100)." });
    return;
  }
  const ownerId = userId(res);
  const productId = BigInt(parsedId.data);
  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.products.findUnique({ where: { id: productId }, select: { id: true, stock: true, is_active: true } });
      if (!product || !product.is_active) throw new Error("CART_PRODUCT_UNAVAILABLE");
      const cart = await tx.carts.upsert({ where: { user_id: ownerId }, create: { user_id: ownerId }, update: { updated_at: new Date() } });
      const existing = await tx.cart_items.findUnique({ where: { cart_id_product_id: { cart_id: cart.id, product_id: productId } }, select: { quantity: true } });
      const nextQuantity = (existing?.quantity ?? 0) + parsedQuantity.data.quantity;
      if (nextQuantity > product.stock) throw new Error("CART_STOCK_EXCEEDED");
      await tx.cart_items.upsert({
        where: { cart_id_product_id: { cart_id: cart.id, product_id: productId } },
        create: { cart_id: cart.id, product_id: productId, quantity: parsedQuantity.data.quantity },
        update: { quantity: nextQuantity },
      });
    });
    res.status(200).json({ success: true, cart: await getCartResponse(ownerId) });
  } catch (error) {
    if (error instanceof Error && error.message === "CART_PRODUCT_UNAVAILABLE") { res.status(404).json({ success: false, message: "Product is unavailable." }); return; }
    if (error instanceof Error && error.message === "CART_STOCK_EXCEEDED") { res.status(409).json({ success: false, message: "Requested quantity exceeds available stock." }); return; }
    console.error("Cart add error:", error);
    res.status(500).json({ success: false, message: "Could not add the product to cart." });
  }
});

router.patch("/items/:productId", requireSameSite, async (req, res) => {
  const id = productIdSchema.safeParse(req.params.productId);
  const quantity = quantitySchema.safeParse(req.body);
  if (!id.success || !quantity.success) { res.status(400).json({ success: false, message: "Provide a valid product ID and quantity (1–100)." }); return; }
  const ownerId = userId(res);
  const productId = BigInt(id.data);
  try {
    await prisma.$transaction(async (tx) => {
      const cart = await tx.carts.findUnique({ where: { user_id: ownerId }, select: { id: true } });
      if (!cart) throw new Error("CART_ITEM_NOT_FOUND");
      const product = await tx.products.findUnique({ where: { id: productId }, select: { stock: true, is_active: true } });
      if (!product || !product.is_active) throw new Error("CART_PRODUCT_UNAVAILABLE");
      if (quantity.data.quantity > product.stock) throw new Error("CART_STOCK_EXCEEDED");
      const updated = await tx.cart_items.updateMany({ where: { cart_id: cart.id, product_id: productId }, data: { quantity: quantity.data.quantity } });
      if (!updated.count) throw new Error("CART_ITEM_NOT_FOUND");
      await tx.carts.update({ where: { id: cart.id }, data: { updated_at: new Date() } });
    });
    res.json({ success: true, cart: await getCartResponse(ownerId) });
  } catch (error) {
    if (error instanceof Error && error.message === "CART_ITEM_NOT_FOUND") { res.status(404).json({ success: false, message: "Cart item not found." }); return; }
    if (error instanceof Error && error.message === "CART_PRODUCT_UNAVAILABLE") { res.status(404).json({ success: false, message: "Product is unavailable." }); return; }
    if (error instanceof Error && error.message === "CART_STOCK_EXCEEDED") { res.status(409).json({ success: false, message: "Requested quantity exceeds available stock." }); return; }
    console.error("Cart quantity update error:", error);
    res.status(500).json({ success: false, message: "Could not update cart quantity." });
  }
});

router.delete("/items/:productId", requireSameSite, async (req, res) => {
  const id = productIdSchema.safeParse(req.params.productId);
  if (!id.success) { res.status(400).json({ success: false, message: "Invalid product ID." }); return; }
  try {
    const cart = await prisma.carts.findUnique({ where: { user_id: userId(res) }, select: { id: true } });
    if (cart) await prisma.cart_items.deleteMany({ where: { cart_id: cart.id, product_id: BigInt(id.data) } });
    res.json({ success: true, cart: await getCartResponse(userId(res)) });
  } catch (error) {
    console.error("Cart item removal error:", error);
    res.status(500).json({ success: false, message: "Could not remove the cart item." });
  }
});

export default router;
