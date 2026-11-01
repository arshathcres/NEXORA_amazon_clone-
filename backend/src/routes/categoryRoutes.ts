import { Router } from "express";
import prisma from "../config/database";

const router = Router();

// Get all categories
router.get("/", async (req, res) => {
  try {
    const categories = await prisma.categories.findMany({
      orderBy: {
        id: "asc",
      },
    });

    res.json({
      success: true,
      total: categories.length,
      categories: categories.map((category) => ({
        ...category,
        id: category.id.toString(),
      })),
    });
  } catch (error) {
    console.error("Category fetch error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
    });
  }
});

export default router;