import { Router, type Request, type Response, type NextFunction } from "express";
import { unlink } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { requireAdmin, requireAuth, type AuthUser } from "../middleware/authMiddleware";
import prisma from "../config/database";
import { PRODUCT_UPLOAD_DIR, hasValidImageSignature, uploadProductImages } from "../middleware/productImageUpload";

const router = Router();
router.use(requireAuth, requireAdmin);

const productFields = {
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(10000).nullable().optional(),
  category_id: z.string().regex(/^[1-9][0-9]{0,18}$/).nullable().optional(),
  price_paise: z.string().regex(/^[0-9]{1,15}$/),
  stock: z.number().int().min(0).max(2_000_000_000),
  is_active: z.boolean().optional(),
};

const createProductSchema = z.object(productFields);
const updateProductSchema = z.object({
  name: productFields.name.optional(),
  description: productFields.description,
  category_id: productFields.category_id,
  price_paise: productFields.price_paise.optional(),
  stock: productFields.stock.optional(),
  is_active: productFields.is_active,
}).refine((body) => Object.keys(body).length > 0, "Provide at least one product field to update.");
const productIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);

function toProductResponse(product: {
  id: bigint; category_id: bigint | null; name: string; slug: string; description: string | null;
  price_paise: bigint; stock: number; is_active: boolean | null; created_at: Date | null; updated_at: Date | null;
  categories?: { id: bigint; name: string; slug: string } | null;
  product_images?: Array<{ id: bigint; product_id: bigint; image_path: string; is_primary: boolean | null; created_at: Date | null }>;
}) {
  return {
    ...product,
    id: product.id.toString(),
    category_id: product.category_id?.toString() ?? null,
    price_paise: product.price_paise.toString(),
    categories: product.categories ? { ...product.categories, id: product.categories.id.toString() } : null,
    product_images: product.product_images?.map((image) => ({
      ...image, id: image.id.toString(), product_id: image.product_id.toString(),
    })) ?? [],
  };
}

function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 220);
}

function validationError(res: import("express").Response, error: z.ZodError, message = "Invalid request data.") {
  res.status(400).json({
    success: false,
    message,
    errors: error.issues.map(({ path, message }) => ({ field: path.join("."), message })),
  });
}

router.get("/session", (_req, res) => {
  const user = res.locals.authUser as AuthUser;
  res.json({ success: true, admin: { id: user.id, full_name: user.full_name, email: user.email } });
});

// Admin Dashboard KPI Overview: counts, revenue, and alerts
router.get("/overview", async (_req, res) => {
  try {
    const [
      totalProducts,
      totalCustomers,
      totalOrders,
      ordersAggregate,
      recentOrders,
      lowStockProducts,
    ] = await Promise.all([
      prisma.products.count(),
      prisma.profiles.count({ where: { role: "CUSTOMER" } }),
      prisma.orders.count(),
      prisma.orders.aggregate({
        where: { status: { not: "CANCELLED" } },
        _sum: { total_paise: true },
      }),
      prisma.orders.findMany({
        take: 5,
        orderBy: { id: "desc" },
        include: {
          profiles: { select: { full_name: true, email: true } },
          payments: { select: { payment_method: true, payment_status: true } },
        },
      }),
      prisma.products.findMany({
        where: { stock: { lte: 15 }, is_active: true },
        select: { id: true, name: true, stock: true, price_paise: true },
        orderBy: { stock: "asc" },
        take: 8,
      }),
    ]);

    res.json({
      success: true,
      stats: {
        total_products: totalProducts,
        total_customers: totalCustomers,
        total_orders: totalOrders,
        total_revenue_paise: (ordersAggregate._sum.total_paise || 0n).toString(),
      },
      recent_orders: recentOrders.map((o) => ({
        id: o.id.toString(),
        customer_name: o.profiles?.full_name || "Customer",
        customer_email: o.profiles?.email || "",
        total_paise: o.total_paise.toString(),
        status: o.status,
        created_at: o.created_at,
        payment_method: o.payments[0]?.payment_method || "N/A",
      })),
      low_stock_products: lowStockProducts.map((p) => ({
        id: p.id.toString(),
        name: p.name,
        stock: p.stock,
        price_paise: p.price_paise.toString(),
      })),
    });
  } catch (error) {
    console.error("Admin overview fetch error:", error);
    res.status(500).json({ success: false, message: "Could not load admin overview stats." });
  }
});

// Admin Customers List
router.get("/customers", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  try {
    const [customers, total] = await Promise.all([
      prisma.profiles.findMany({
        where: { role: "CUSTOMER" },
        select: {
          id: true,
          full_name: true,
          email: true,
          created_at: true,
          _count: { select: { orders: true, reviews: true } },
        },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.profiles.count({ where: { role: "CUSTOMER" } }),
    ]);

    res.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      customers: customers.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        created_at: c.created_at,
        orders_count: c._count.orders,
        reviews_count: c._count.reviews,
      })),
    });
  } catch (error) {
    console.error("Admin customers fetch error:", error);
    res.status(500).json({ success: false, message: "Could not fetch customer list." });
  }
});

const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});
const updateCategorySchema = z.object({
  name: categorySchema.shape.name.optional(),
  slug: categorySchema.shape.slug,
  description: categorySchema.shape.description,
}).refine((body) => Object.keys(body).length > 0, "Provide at least one category field to update.");
const categoryIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);

router.get("/categories", async (_req, res) => {
  try {
    const categories = await prisma.categories.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { id: "asc" },
    });
    res.json({
      success: true,
      total: categories.length,
      categories: categories.map(({ id, _count, ...category }) => ({ ...category, id: id.toString(), product_count: _count.products })),
    });
  } catch (error) {
    console.error("Admin category list error:", error);
    res.status(500).json({ success: false, message: "Could not fetch categories." });
  }
});

router.post("/categories", async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) { validationError(res, parsed.error, "Invalid category data."); return; }
  const data = parsed.data;
  const slug = data.slug ?? slugify(data.name).slice(0, 120);
  if (!slug) { res.status(400).json({ success: false, message: "Category name must contain letters or numbers." }); return; }
  try {
    const category = await prisma.categories.create({
      data: { name: data.name, slug, description: data.description ?? null },
      include: { _count: { select: { products: true } } },
    });
    const { id, _count, ...fields } = category;
    res.status(201).json({ success: true, category: { ...fields, id: id.toString(), product_count: _count.products } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ success: false, message: "A category with that name or slug already exists." }); return;
    }
    console.error("Admin category create error:", error);
    res.status(500).json({ success: false, message: "Could not create category." });
  }
});

router.patch("/categories/:id", async (req, res) => {
  if (!categoryIdSchema.safeParse(req.params.id).success) { res.status(400).json({ success: false, message: "Invalid category ID." }); return; }
  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) { validationError(res, parsed.error, "Invalid category update."); return; }
  const data = parsed.data;
  try {
    const category = await prisma.categories.update({
      where: { id: BigInt(req.params.id) },
      data: {
        ...(data.name === undefined ? {} : { name: data.name }),
        ...(data.slug === undefined ? {} : { slug: data.slug }),
        ...(data.description === undefined ? {} : { description: data.description }),
      },
      include: { _count: { select: { products: true } } },
    });
    const { id, _count, ...fields } = category;
    res.json({ success: true, category: { ...fields, id: id.toString(), product_count: _count.products } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "P2002") { res.status(409).json({ success: false, message: "A category with that name or slug already exists." }); return; }
      if (error.code === "P2025") { res.status(404).json({ success: false, message: "Category not found." }); return; }
    }
    console.error("Admin category update error:", error);
    res.status(500).json({ success: false, message: "Could not update category." });
  }
});

// Categories have no active flag in the current schema. Only delete an empty
// category; refuse while products refer to it rather than reassigning data.
router.delete("/categories/:id", async (req, res) => {
  if (!categoryIdSchema.safeParse(req.params.id).success) { res.status(400).json({ success: false, message: "Invalid category ID." }); return; }
  const id = BigInt(req.params.id);
  try {
    const productsCount = await prisma.products.count({ where: { category_id: id } });
    if (productsCount > 0) {
      res.status(409).json({ success: false, message: "Category has products. Move those products to another category before deleting it.", products_count: productsCount }); return;
    }
    await prisma.categories.delete({ where: { id } });
    res.json({ success: true, message: "Category deleted." });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      res.status(404).json({ success: false, message: "Category not found." }); return;
    }
    console.error("Admin category delete error:", error);
    res.status(500).json({ success: false, message: "Could not delete category." });
  }
});

// Admin product list includes inactive entries and supports simple text search.
router.get("/products", async (req, res) => {
  const querySchema = z.object({
    q: z.string().trim().max(100).optional(),
    page: z.string().regex(/^[1-9][0-9]{0,5}$/).default("1"),
    limit: z.string().regex(/^[1-9][0-9]{0,2}$/).default("20"),
  });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) { validationError(res, parsed.error); return; }
  const page = Number(parsed.data.page);
  const limit = Math.min(Number(parsed.data.limit), 100);
  const where = parsed.data.q ? {
    OR: [
      { name: { contains: parsed.data.q, mode: "insensitive" as const } },
      { slug: { contains: parsed.data.q, mode: "insensitive" as const } },
    ],
  } : {};
  try {
    const [products, total] = await Promise.all([
      prisma.products.findMany({ where, include: { categories: { select: { id: true, name: true, slug: true } }, product_images: true }, orderBy: { id: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.products.count({ where }),
    ]);
    res.json({ success: true, total, page, limit, totalPages: Math.ceil(total / limit), products: products.map(toProductResponse) });
  } catch (error) {
    console.error("Admin product list error:", error);
    res.status(500).json({ success: false, message: "Could not fetch products." });
  }
});

router.post("/products", async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) { validationError(res, parsed.error); return; }
  const data = parsed.data;
  const slug = slugify(data.name);
  if (!slug) { res.status(400).json({ success: false, message: "Product name must contain letters or numbers." }); return; }
  try {
    if (data.category_id !== undefined && data.category_id !== null) {
      const category = await prisma.categories.findUnique({ where: { id: BigInt(data.category_id) }, select: { id: true } });
      if (!category) { res.status(400).json({ success: false, message: "Selected category does not exist." }); return; }
    }
    const product = await prisma.products.create({
      data: {
        name: data.name, slug, description: data.description ?? null,
        category_id: data.category_id ? BigInt(data.category_id) : null,
        price_paise: BigInt(data.price_paise), stock: data.stock,
        is_active: data.is_active ?? true,
      },
      include: { categories: { select: { id: true, name: true, slug: true } }, product_images: true },
    });
    res.status(201).json({ success: true, product: toProductResponse(product) });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ success: false, message: "A product with a similar name/slug already exists." }); return;
    }
    console.error("Admin product create error:", error);
    res.status(500).json({ success: false, message: "Could not create product." });
  }
});

router.patch("/products/:id", async (req, res) => {
  if (!productIdSchema.safeParse(req.params.id).success) { res.status(400).json({ success: false, message: "Invalid product ID." }); return; }
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) { validationError(res, parsed.error); return; }
  const productId = BigInt(req.params.id);
  const data = parsed.data;
  try {
    if (data.category_id !== undefined && data.category_id !== null) {
      const category = await prisma.categories.findUnique({ where: { id: BigInt(data.category_id) }, select: { id: true } });
      if (!category) { res.status(400).json({ success: false, message: "Selected category does not exist." }); return; }
    }
    const product = await prisma.products.update({
      where: { id: productId },
      data: {
        ...(data.name === undefined ? {} : { name: data.name, slug: slugify(data.name) }),
        ...(data.description === undefined ? {} : { description: data.description }),
        ...(data.category_id === undefined ? {} : { category_id: data.category_id === null ? null : BigInt(data.category_id) }),
        ...(data.price_paise === undefined ? {} : { price_paise: BigInt(data.price_paise) }),
        ...(data.stock === undefined ? {} : { stock: data.stock }),
        ...(data.is_active === undefined ? {} : { is_active: data.is_active }),
        updated_at: new Date(),
      },
      include: { categories: { select: { id: true, name: true, slug: true } }, product_images: true },
    });
    res.json({ success: true, product: toProductResponse(product) });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "P2002") { res.status(409).json({ success: false, message: "A product with a similar name/slug already exists." }); return; }
      if (error.code === "P2025") { res.status(404).json({ success: false, message: "Product not found." }); return; }
    }
    console.error("Admin product update error:", error);
    res.status(500).json({ success: false, message: "Could not update product." });
  }
});

async function handleUploadError(error: unknown, req: Request, res: Response, next: NextFunction) {
  const uploadedFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
  await Promise.all(uploadedFiles.map((file) => unlink(file.path).catch(() => undefined)));

  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ success: false, message: error.code === "LIMIT_FILE_SIZE" ? "Each image must be 5 MB or smaller." : "Upload no more than 8 images." });
    return;
  }
  if (error instanceof Error && error.message.startsWith("Upload JPEG")) {
    res.status(400).json({ success: false, message: error.message });
    return;
  }
  next(error);
}

function safeProductImagePath(filename: string): string | null {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(filename)) return null;
  const resolved = path.resolve(PRODUCT_UPLOAD_DIR, filename);
  return resolved.startsWith(`${PRODUCT_UPLOAD_DIR}${path.sep}`) ? resolved : null;
}

// Upload up to eight images for an existing product. The first uploaded image
// becomes primary only if the product does not already have a primary image.
router.post("/products/:id/images", (req, res, next) => {
  if (!productIdSchema.safeParse(req.params.id).success) { res.status(400).json({ success: false, message: "Invalid product ID." }); return; }
  uploadProductImages.array("images", 8)(req, res, (error) => {
    if (error) { handleUploadError(error, req, res, next); return; }
    next();
  });
}, async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) { res.status(400).json({ success: false, message: "Choose at least one image to upload." }); return; }
  const productId = BigInt(req.params.id);
  try {
    if (files.some((file) => !hasValidImageSignature(file.path, file.mimetype))) {
      await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
      res.status(400).json({ success: false, message: "One or more files are not valid JPEG, PNG, or WebP images." }); return;
    }
    const product = await prisma.products.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) {
      await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
      res.status(404).json({ success: false, message: "Product not found." }); return;
    }
    const images = await prisma.$transaction(async (tx) => {
      const existingPrimary = await tx.product_images.findFirst({ where: { product_id: productId, is_primary: true }, select: { id: true } });
      return Promise.all(files.map((file, index) => tx.product_images.create({
        data: {
          product_id: productId,
          image_path: `/uploads/products/${file.filename}`,
          is_primary: !existingPrimary && index === 0,
        },
      })));
    });
    res.status(201).json({ success: true, images: images.map((image) => ({ ...image, id: image.id.toString(), product_id: image.product_id.toString() })) });
  } catch (error) {
    await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
    console.error("Product image upload error:", error);
    res.status(500).json({ success: false, message: "Could not save product images." });
  }
});

// Mark one existing image as primary. Transaction keeps the primary flag unique
// at the application level without requiring a schema migration.
router.patch("/products/:id/images/:imageId/primary", async (req, res) => {
  if (!productIdSchema.safeParse(req.params.id).success || !productIdSchema.safeParse(req.params.imageId).success) {
    res.status(400).json({ success: false, message: "Invalid product or image ID." }); return;
  }
  const productId = BigInt(req.params.id);
  const imageId = BigInt(req.params.imageId);
  try {
    const target = await prisma.product_images.findFirst({ where: { id: imageId, product_id: productId }, select: { id: true } });
    if (!target) { res.status(404).json({ success: false, message: "Image not found for this product." }); return; }
    await prisma.$transaction([
      prisma.product_images.updateMany({ where: { product_id: productId }, data: { is_primary: false } }),
      prisma.product_images.update({ where: { id: imageId }, data: { is_primary: true } }),
    ]);
    res.json({ success: true, message: "Primary image updated." });
  } catch (error) {
    console.error("Primary image update error:", error);
    res.status(500).json({ success: false, message: "Could not update the primary image." });
  }
});

// Remove image metadata then the corresponding managed local file. Never accept
// a filesystem path from the request; resolve only known generated filenames.
router.delete("/products/:id/images/:imageId", async (req, res) => {
  if (!productIdSchema.safeParse(req.params.id).success || !productIdSchema.safeParse(req.params.imageId).success) {
    res.status(400).json({ success: false, message: "Invalid product or image ID." }); return;
  }
  const productId = BigInt(req.params.id);
  const imageId = BigInt(req.params.imageId);
  try {
    const image = await prisma.product_images.findFirst({ where: { id: imageId, product_id: productId } });
    if (!image) { res.status(404).json({ success: false, message: "Image not found for this product." }); return; }
    await prisma.product_images.delete({ where: { id: imageId } });
    const filename = path.basename(image.image_path);
    const filePath = safeProductImagePath(filename);
    if (filePath) await unlink(filePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    if (image.is_primary) {
      const nextImage = await prisma.product_images.findFirst({ where: { product_id: productId }, orderBy: { id: "asc" } });
      if (nextImage) await prisma.product_images.update({ where: { id: nextImage.id }, data: { is_primary: true } });
    }
    res.json({ success: true, message: "Product image removed." });
  } catch (error) {
    console.error("Product image removal error:", error);
    res.status(500).json({ success: false, message: "Could not remove product image." });
  }
});

// Soft-delete: preserve product/order/cart relationships and historical data.
router.delete("/products/:id", async (req, res) => {
  if (!productIdSchema.safeParse(req.params.id).success) { res.status(400).json({ success: false, message: "Invalid product ID." }); return; }
  try {
    const product = await prisma.products.update({ where: { id: BigInt(req.params.id) }, data: { is_active: false, updated_at: new Date() }, select: { id: true, name: true, is_active: true } });
    res.json({ success: true, product: { ...product, id: product.id.toString() } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      res.status(404).json({ success: false, message: "Product not found." }); return;
    }
    console.error("Admin product deactivate error:", error);
    res.status(500).json({ success: false, message: "Could not deactivate product." });
  }
});

export default router;
