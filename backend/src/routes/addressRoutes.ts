import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../config/database";
import { requireAuth, type AuthUser } from "../middleware/authMiddleware";

const router = Router();
router.use(requireAuth);

const addressIdSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);

const addressBodySchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(20),
  address_line1: z.string().trim().min(3).max(255),
  address_line2: z.string().trim().max(255).nullable().optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postal_code: z.string().trim().min(3).max(15),
  country: z.string().trim().max(100).default("India"),
  is_default: z.boolean().default(false),
});

const updateAddressSchema = z.object({
  full_name: addressBodySchema.shape.full_name.optional(),
  phone: addressBodySchema.shape.phone.optional(),
  address_line1: addressBodySchema.shape.address_line1.optional(),
  address_line2: addressBodySchema.shape.address_line2,
  city: addressBodySchema.shape.city.optional(),
  state: addressBodySchema.shape.state.optional(),
  postal_code: addressBodySchema.shape.postal_code.optional(),
  country: addressBodySchema.shape.country.optional(),
  is_default: addressBodySchema.shape.is_default.optional(),
}).refine((body) => Object.keys(body).length > 0, "Provide at least one address field to update.");

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

function toAddressResponse(addr: {
  id: bigint;
  user_id: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string | null;
  is_default: boolean | null;
  created_at: Date | null;
}) {
  return {
    ...addr,
    id: addr.id.toString(),
  };
}

router.get("/", async (_req, res) => {
  try {
    const list = await prisma.addresses.findMany({
      where: { user_id: userId(res) },
      orderBy: [{ is_default: "desc" }, { id: "desc" }],
    });
    res.json({ success: true, addresses: list.map(toAddressResponse) });
  } catch (error) {
    console.error("Address list error:", error);
    res.status(500).json({ success: false, message: "Could not fetch delivery addresses." });
  }
});

router.post("/", requireSameSite, async (req, res) => {
  const parsed = addressBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid address details.",
      errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
    return;
  }
  const uid = userId(res);
  const data = parsed.data;
  try {
    const addr = await prisma.$transaction(async (tx) => {
      const count = await tx.addresses.count({ where: { user_id: uid } });
      const makeDefault = data.is_default || count === 0;
      if (makeDefault) {
        await tx.addresses.updateMany({ where: { user_id: uid }, data: { is_default: false } });
      }
      return tx.addresses.create({
        data: {
          user_id: uid,
          full_name: data.full_name,
          phone: data.phone,
          address_line1: data.address_line1,
          address_line2: data.address_line2 ?? null,
          city: data.city,
          state: data.state,
          postal_code: data.postal_code,
          country: data.country,
          is_default: makeDefault,
        },
      });
    });
    res.status(201).json({ success: true, address: toAddressResponse(addr) });
  } catch (error) {
    console.error("Address creation error:", error);
    res.status(500).json({ success: false, message: "Could not save delivery address." });
  }
});

router.patch("/:id", requireSameSite, async (req, res) => {
  const parsedId = addressIdSchema.safeParse(req.params.id);
  const parsedBody = updateAddressSchema.safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) {
    res.status(400).json({ success: false, message: "Invalid address ID or update payload." });
    return;
  }
  const uid = userId(res);
  const addrId = BigInt(parsedId.data);
  const data = parsedBody.data;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.addresses.findFirst({ where: { id: addrId, user_id: uid } });
      if (!existing) throw new Error("ADDRESS_NOT_FOUND");
      if (data.is_default) {
        await tx.addresses.updateMany({ where: { user_id: uid }, data: { is_default: false } });
      }
      return tx.addresses.update({
        where: { id: addrId },
        data: {
          ...(data.full_name !== undefined ? { full_name: data.full_name } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.address_line1 !== undefined ? { address_line1: data.address_line1 } : {}),
          ...(data.address_line2 !== undefined ? { address_line2: data.address_line2 } : {}),
          ...(data.city !== undefined ? { city: data.city } : {}),
          ...(data.state !== undefined ? { state: data.state } : {}),
          ...(data.postal_code !== undefined ? { postal_code: data.postal_code } : {}),
          ...(data.country !== undefined ? { country: data.country } : {}),
          ...(data.is_default !== undefined ? { is_default: data.is_default } : {}),
        },
      });
    });
    res.json({ success: true, address: toAddressResponse(updated) });
  } catch (error) {
    if (error instanceof Error && error.message === "ADDRESS_NOT_FOUND") {
      res.status(404).json({ success: false, message: "Address not found." });
      return;
    }
    console.error("Address update error:", error);
    res.status(500).json({ success: false, message: "Could not update address." });
  }
});

router.delete("/:id", requireSameSite, async (req, res) => {
  const parsedId = addressIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ success: false, message: "Invalid address ID." });
    return;
  }
  const uid = userId(res);
  const addrId = BigInt(parsedId.data);
  try {
    const existing = await prisma.addresses.findFirst({ where: { id: addrId, user_id: uid } });
    if (!existing) {
      res.status(404).json({ success: false, message: "Address not found." });
      return;
    }
    await prisma.addresses.delete({ where: { id: addrId } });
    // If the deleted address was default, promote the newest remaining address
    if (existing.is_default) {
      const next = await prisma.addresses.findFirst({ where: { user_id: uid }, orderBy: { id: "desc" } });
      if (next) {
        await prisma.addresses.update({ where: { id: next.id }, data: { is_default: true } });
      }
    }
    res.json({ success: true, message: "Address deleted." });
  } catch (error) {
    console.error("Address deletion error:", error);
    res.status(500).json({ success: false, message: "Could not delete address." });
  }
});

export default router;
