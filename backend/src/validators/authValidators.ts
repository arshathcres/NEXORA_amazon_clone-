import { z } from "zod";

export const registerSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128),
});

export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(255).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one profile field to update.",
});
