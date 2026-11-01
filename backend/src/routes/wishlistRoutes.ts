import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { requireAuth, type AuthUser } from "../middleware/authMiddleware";

const router = Router();
router.use(requireAuth);
const productIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);

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
  if (!origin || !allowed.includes(origin)) { res.status(403).json({ success: false, message: "Request origin was not allowed." }); return; }
  next();
}

function userId(res: Response) { return (res.locals.authUser as AuthUser).id; }

async function wishlistResponse(ownerId: string) {
  const rows = await prisma.wishlists.findMany({
    where: { user_id: ownerId },
    include: { products: { include: { categories: true, product_images: true } } },
    orderBy: { id: "desc" },
  });
  return rows.map(({ id, product_id, products }) => ({
    id: id.toString(),
    product_id: product_id.toString(),
    product: {
      id: products.id.toString(), name: products.name, slug: products.slug,
      price_paise: products.price_paise.toString(), stock: products.stock,
      is_active: products.is_active,
      category: products.categories ? { id: products.categories.id.toString(), name: products.categories.name, slug: products.categories.slug } : null,
      images: products.product_images.map((image) => ({ id: image.id.toString(), image_path: image.image_path, is_primary: image.is_primary })),
    },
  }));
}

router.get("/", async (_req, res) => {
  try {
    const wishlist = await wishlistResponse(userId(res));
    res.json({ success: true, total: wishlist.length, wishlist });
  } catch (error) {
    console.error("Wishlist fetch error:", error);
    res.status(500).json({ success: false, message: "Could not retrieve wishlist." });
  }
});

router.post("/:productId", requireSameSite, async (req, res) => {
  const parsed = productIdSchema.safeParse(req.params.productId);
  if (!parsed.success) { res.status(400).json({ success: false, message: "Invalid product ID." }); return; }
  const ownerId = userId(res);
  const productId = BigInt(parsed.data);
  try {
    const product = await prisma.products.findUnique({ where: { id: productId }, select: { id: true, is_active: true } });
    if (!product || !product.is_active) { res.status(404).json({ success: false, message: "Product is unavailable." }); return; }
    await prisma.wishlists.upsert({
      where: { user_id_product_id: { user_id: ownerId, product_id: productId } },
      create: { user_id: ownerId, product_id: productId },
      update: {},
    });
    const wishlist = await wishlistResponse(ownerId);
    res.status(200).json({ success: true, total: wishlist.length, wishlist });
  } catch (error) {
    console.error("Wishlist add error:", error);
    res.status(500).json({ success: false, message: "Could not save this product." });
  }
});

router.delete("/:productId", requireSameSite, async (req, res) => {
  const parsed = productIdSchema.safeParse(req.params.productId);
  if (!parsed.success) { res.status(400).json({ success: false, message: "Invalid product ID." }); return; }
  try {
    await prisma.wishlists.deleteMany({ where: { user_id: userId(res), product_id: BigInt(parsed.data) } });
    const wishlist = await wishlistResponse(userId(res));
    res.json({ success: true, total: wishlist.length, wishlist });
  } catch (error) {
    console.error("Wishlist removal error:", error);
    res.status(500).json({ success: false, message: "Could not remove this product from wishlist." });
  }
});

export default router;
