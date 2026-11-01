import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/database";

export const AUTH_COOKIE_NAME = "nexora_session";

export type AuthUser = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

function getCookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getCookieValue(req.headers.cookie, AUTH_COOKIE_NAME);
  const jwtSecret = process.env.JWT_SECRET;

  if (!token) {
    res.status(401).json({ success: false, message: "Please log in to continue." });
    return;
  }
  if (!jwtSecret || jwtSecret.length < 32) {
    res.status(500).json({ success: false, message: "Authentication is not configured." });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    if (typeof payload.sub !== "string") {
      res.status(401).json({ success: false, message: "Invalid session." });
      return;
    }

    // Read the profile and role from PostgreSQL on each request. The token is
    // only proof of identity; it is never the source of authorization roles.
    const user = await prisma.profiles.findUnique({
      where: { id: payload.sub },
      select: { id: true, full_name: true, email: true, role: true },
    });

    if (!user) {
      res.status(401).json({ success: false, message: "Session is no longer valid." });
      return;
    }

    res.locals.authUser = user satisfies AuthUser;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Session is invalid or expired." });
  }
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  const user = res.locals.authUser as AuthUser | undefined;
  if (!user || user.role !== "ADMIN") {
    res.status(403).json({ success: false, message: "Administrator access is required." });
    return;
  }
  next();
}
