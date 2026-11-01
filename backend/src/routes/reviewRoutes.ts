import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { requireAdmin, requireAuth, type AuthUser } from "../middleware/authMiddleware";

const router = Router();

const productIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
const reviewIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);

const reviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).nullable().optional(),
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

function toReviewResponse(r: any) {
  return {
    id: r.id.toString(),
    user_id: r.user_id,
    product_id: r.product_id.toString(),
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
    user: r.profiles
      ? {
          id: r.profiles.id,
          full_name: r.profiles.full_name,
        }
      : null,
  };
}

// -------------------------------------------------------------
// PUBLIC: get reviews for a product with aggregate metrics
// -------------------------------------------------------------
router.get("/product/:productId", async (req, res) => {
  const parsedId = productIdSchema.safeParse(req.params.productId);
  if (!parsedId.success) {
    res.status(400).json({ success: false, message: "Invalid product ID." });
    return;
  }
  const pid = BigInt(parsedId.data);
  try {
    const [reviews, stats] = await Promise.all([
      prisma.reviews.findMany({
        where: { product_id: pid },
        include: { profiles: { select: { id: true, full_name: true } } },
        orderBy: { id: "desc" },
      }),
      prisma.reviews.aggregate({
        where: { product_id: pid },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    res.json({
      success: true,
      total_reviews: stats._count.rating,
      average_rating: stats._avg.rating !== null ? Number(stats._avg.rating.toFixed(1)) : 0,
      reviews: reviews.map(toReviewResponse),
    });
  } catch (error) {
    console.error("Reviews fetch error:", error);
    res.status(500).json({ success: false, message: "Could not fetch reviews." });
  }
});

// -------------------------------------------------------------
// CUSTOMER: post review (enforces 1 review per product per user via @@unique([user_id, product_id]))
// -------------------------------------------------------------
router.post("/product/:productId", requireAuth, requireSameSite, async (req, res) => {
  const parsedId = productIdSchema.safeParse(req.params.productId);
  const parsedBody = reviewBodySchema.safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) {
    res.status(400).json({
      success: false,
      message: "Provide a valid rating between 1 and 5.",
      errors: parsedBody.error?.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
    return;
  }

  const uid = userId(res);
  const pid = BigInt(parsedId.data);
  const data = parsedBody.data;

  try {
    const product = await prisma.products.findUnique({ where: { id: pid }, select: { id: true } });
    if (!product) {
      res.status(404).json({ success: false, message: "Product not found." });
      return;
    }

    const review = await prisma.reviews.create({
      data: {
        user_id: uid,
        product_id: pid,
        rating: data.rating,
        comment: data.comment ?? null,
      },
      include: { profiles: { select: { id: true, full_name: true } } },
    });

    res.status(201).json({ success: true, review: toReviewResponse(review) });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({
        success: false,
        message: "You have already written a review for this product.",
      });
      return;
    }
    console.error("Review creation error:", error);
    res.status(500).json({ success: false, message: "Could not submit review." });
  }
});

// -------------------------------------------------------------
// CUSTOMER: delete own review
// -------------------------------------------------------------
router.delete("/:id", requireAuth, requireSameSite, async (req, res) => {
  const parsedId = reviewIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ success: false, message: "Invalid review ID." });
    return;
  }
  const uid = userId(res);
  const rid = BigInt(parsedId.data);
  try {
    const existing = await prisma.reviews.findFirst({ where: { id: rid, user_id: uid } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Review not found or not authorized to delete." });
      return;
    }
    await prisma.reviews.delete({ where: { id: rid } });
    res.json({ success: true, message: "Review deleted successfully." });
  } catch (error) {
    console.error("Review delete error:", error);
    res.status(500).json({ success: false, message: "Could not delete review." });
  }
});

// -------------------------------------------------------------
// ADMIN: list all reviews across products & delete moderation
// -------------------------------------------------------------
router.get("/admin/all", requireAuth, requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  try {
    const [reviews, total] = await Promise.all([
      prisma.reviews.findMany({
        include: {
          profiles: { select: { id: true, full_name: true, email: true } },
          products: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.reviews.count(),
    ]);

    const formatted = reviews.map((r) => ({
      ...toReviewResponse(r),
      customer_email: r.profiles?.email,
      product_name: r.products?.name,
    }));

    res.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      reviews: formatted,
    });
  } catch (error) {
    console.error("Admin reviews list error:", error);
    res.status(500).json({ success: false, message: "Could not fetch reviews for moderation." });
  }
});

router.delete("/admin/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsedId = reviewIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ success: false, message: "Invalid review ID." });
    return;
  }
  const rid = BigInt(parsedId.data);
  try {
    const existing = await prisma.reviews.findUnique({ where: { id: rid } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Review not found." });
      return;
    }
    await prisma.reviews.delete({ where: { id: rid } });
    res.json({ success: true, message: "Review removed by administrator." });
  } catch (error) {
    console.error("Admin review delete error:", error);
    res.status(500).json({ success: false, message: "Could not moderate review." });
  }
});

export default router;
