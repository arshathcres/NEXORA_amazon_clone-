import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client";
import prisma from "../config/database";

const productRelations = { categories: true, product_images: true } as const;
type ProductWithRelations = Prisma.productsGetPayload<{ include: typeof productRelations }>;

function formatProduct(product: ProductWithRelations) {
  return {
    ...product,
    id: product.id.toString(),
    category_id: product.category_id?.toString() ?? null,
    price_paise: product.price_paise.toString(),
    categories: product.categories
      ? { ...product.categories, id: product.categories.id.toString() }
      : null,
    product_images: product.product_images.map((image) => ({
      ...image,
      id: image.id.toString(),
      product_id: image.product_id.toString(),
    })),
  };
}

const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(120).optional(),
  minPricePaise: z.string().regex(/^\d+$/).optional(),
  maxPricePaise: z.string().regex(/^\d+$/).optional(),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc"]).default("newest"),
  page: z.string().regex(/^[1-9][0-9]{0,5}$/).default("1"),
  limit: z.string().regex(/^[1-9][0-9]{0,2}$/).default("12"),
});

const router = Router();

// List active products. Prices in the API filters are expressed in paise.
router.get("/", async (req, res) => {
  const parsed = productListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid product filters.", errors: parsed.error.issues.map(({ path, message }) => ({ field: path.join("."), message })) });
    return;
  }

  const { q, category, minPricePaise, maxPricePaise, sort, page: pageText, limit: limitText } = parsed.data;
  const page = Number(pageText);
  const limit = Math.min(Number(limitText), 100);
  const minPrice = minPricePaise === undefined ? undefined : BigInt(minPricePaise);
  const maxPrice = maxPricePaise === undefined ? undefined : BigInt(maxPricePaise);

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    res.status(400).json({ success: false, message: "minPricePaise must not exceed maxPricePaise." });
    return;
  }

  try {
    const where = {
      is_active: true,
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { description: { contains: q, mode: "insensitive" as const } },
      ] } : {}),
      ...(category ? { categories: { is: { slug: category } } } : {}),
      ...((minPrice !== undefined || maxPrice !== undefined)
        ? { price_paise: { ...(minPrice === undefined ? {} : { gte: minPrice }), ...(maxPrice === undefined ? {} : { lte: maxPrice }) } }
        : {}),
    };
    const orderBy = sort === "price_asc" ? { price_paise: "asc" as const }
      : sort === "price_desc" ? { price_paise: "desc" as const }
      : sort === "oldest" ? { created_at: "asc" as const }
      : { created_at: "desc" as const };

    const [products, total] = await Promise.all([
      prisma.products.findMany({ where, include: { categories: true, product_images: true }, orderBy, skip: (page - 1) * limit, take: limit }),
      prisma.products.count({ where }),
    ]);

    res.json({ success: true, total, page, limit, totalPages: Math.ceil(total / limit), products: products.map(formatProduct) });
  } catch (error) {
    console.error("Product fetch error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
});

// Get a product by its public slug.

// Get individual product by slug
router.get("/:slug", async (req, res) => {
  try {
    const product = await prisma.products.findFirst({
      where: {
        slug: req.params.slug,
        is_active: true,
      },
      include: {
        categories: true,
        product_images: true,
      },
    });

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
      return;
    }

    res.json({
      success: true,
      product: {
        ...product,
        id: product.id.toString(),
        category_id: product.category_id?.toString() ?? null,
        price_paise: product.price_paise.toString(),
        categories: product.categories
          ? {
              ...product.categories,
              id: product.categories.id.toString(),
            }
          : null,
        product_images: product.product_images.map((image) => ({
          ...image,
          id: image.id.toString(),
          product_id: image.product_id.toString(),
        })),
      },
    });
  } catch (error) {
    console.error("Product details error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch product details",
    });
  }
});

export default router;