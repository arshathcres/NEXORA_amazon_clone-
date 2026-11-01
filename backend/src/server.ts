import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";

import prisma from "./config/database";
import categoryRoutes from "./routes/categoryRoutes";
import productRoutes from "./routes/productRoutes";
import cartRoutes from "./routes/cartRoutes";
import wishlistRoutes from "./routes/wishlistRoutes";
import addressRoutes from "./routes/addressRoutes";
import orderRoutes from "./routes/orderRoutes";
import reviewRoutes from "./routes/reviewRoutes";
import authRoutes from "./routes/authRoutes";
import adminRoutes from "./routes/adminRoutes";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());

app.use(
  cors({
    origin: ["http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:5000", "http://127.0.0.1:5000"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

// 1. Serve uploaded product images
app.use("/uploads/products", express.static(path.resolve(process.cwd(), "uploads", "products"), {
  fallthrough: false,
  dotfiles: "deny",
  index: false,
  maxAge: "1d",
}));

// 2. Serve static frontend web application (HTML, CSS, JS, Assets)
const frontendDir = path.resolve(process.cwd(), "..", "frontend");
app.use(express.static(frontendDir, {
  extensions: ["html"],
  index: "index.html",
}));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  })
);

app.get("/api/health/db", async (_req, res) => {
  try {
    const result = await prisma.$queryRaw`
      SELECT current_database() AS database
    `;

    res.json({
      message: "Database connected successfully!",
      status: "Connected",
      database: result,
    });
  } catch (error) {
    console.error("Database error:", error);

    res.status(500).json({
      message: "Database connection failed",
      status: "Error",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);

// Keep API failures machine-readable so the frontend can show useful errors.
app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found." });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error:", error);
  if (res.headersSent) return;
  res.status(500).json({ success: false, message: "An unexpected server error occurred." });
});

app.listen(PORT, () => {
  console.log(`NEXORA server running at http://localhost:${PORT}`);
});

export default app;

// Admin routes must apply requireAuth and requireAdmin server-side when added.
// Never use a role supplied by the frontend for authorization.