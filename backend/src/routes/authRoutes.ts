import { randomUUID } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/database";
import { AUTH_COOKIE_NAME, requireAuth, type AuthUser } from "../middleware/authMiddleware";
import { loginSchema, profileUpdateSchema, registerSchema } from "../validators/authValidators";

const router = Router();
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const secureCookie = process.env.NODE_ENV === "production";

function setSessionCookie(res: Response, user: AuthUser) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }

  const token = jwt.sign({}, jwtSecret, {
    subject: user.id,
    expiresIn: "7d",
    issuer: "nexora-api",
    audience: "nexora-web",
  });

  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: secureCookie ? "strict" : "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: secureCookie ? "strict" : "lax",
    path: "/",
  });
}

function isSameSiteRequest(origin: string | undefined, referer: string | undefined): boolean {
  const allowed = [
    process.env.FRONTEND_ORIGIN || "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
  ];
  const requestOrigin = origin || (referer ? new URL(referer).origin : undefined);
  return requestOrigin ? allowed.includes(requestOrigin) : false;
}

function requireSameSite(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isSameSiteRequest(req.get("origin"), req.get("referer"))) {
      res.status(403).json({ success: false, message: "Request origin was not allowed." });
      return;
    }
    next();
  } catch {
    res.status(403).json({ success: false, message: "Request origin was not allowed." });
  }
}

router.post("/register", requireSameSite, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid registration details.",
      errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  try {
    const password_hash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.profiles.create({
      data: {
        id: randomUUID(),
        full_name: parsed.data.full_name,
        email,
        password_hash,
        // Ignore any role field supplied by the browser. Registration always
        // creates an ordinary customer.
        role: "CUSTOMER",
      },
      select: { id: true, full_name: true, email: true, role: true },
    });

    setSessionCookie(res, user);
    res.status(201).json({ success: true, user });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      res.status(409).json({ success: false, message: "An account with this email already exists." });
      return;
    }
    console.error("Registration error:", error);
    res.status(500).json({ success: false, message: "Could not create the account." });
  }
});

router.post("/login", requireSameSite, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Enter a valid email and password." });
    return;
  }

  try {
    const user = await prisma.profiles.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    const passwordMatches = user?.password_hash
      ? await bcrypt.compare(parsed.data.password, user.password_hash)
      : false;

    if (!user || !passwordMatches) {
      res.status(401).json({ success: false, message: "Email or password is incorrect." });
      return;
    }

    const safeUser: AuthUser = { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
    setSessionCookie(res, safeUser);
    res.json({ success: true, user: safeUser });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Could not log in." });
  }
});

router.post("/logout", requireSameSite, (_req, res) => {
  clearSessionCookie(res);
  res.json({ success: true, message: "You have been logged out." });
});

router.get("/me", requireAuth, (_req, res) => {
  res.json({ success: true, user: res.locals.authUser });
});

router.patch("/me", requireSameSite, requireAuth, async (req, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid profile update.",
      errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
    return;
  }

  const currentUser = res.locals.authUser as AuthUser;
  const data = {
    ...(parsed.data.full_name === undefined ? {} : { full_name: parsed.data.full_name }),
    ...(parsed.data.email === undefined ? {} : { email: parsed.data.email.toLowerCase() }),
  };

  try {
    const updatedUser = await prisma.profiles.update({
      where: { id: currentUser.id },
      data,
      select: { id: true, full_name: true, email: true, role: true },
    });
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "P2002") {
        res.status(409).json({ success: false, message: "An account with this email already exists." });
        return;
      }
      if (error.code === "P2025") {
        res.status(404).json({ success: false, message: "Profile not found." });
        return;
      }
    }
    console.error("Profile update error:", error);
    res.status(500).json({ success: false, message: "Could not update profile." });
  }
});

export default router;
