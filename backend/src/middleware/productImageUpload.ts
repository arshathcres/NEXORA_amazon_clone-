import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import multer from "multer";

export const PRODUCT_UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "products");
mkdirSync(PRODUCT_UPLOAD_DIR, { recursive: true });

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function hasValidImageSignature(filePath: string, mimetype: string): boolean {
  const header = readFileSync(filePath).subarray(0, 12);
  if (mimetype === "image/jpeg") return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (mimetype === "image/png") return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === "image/webp") return header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP";
  return false;
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, PRODUCT_UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const extension = MIME_EXTENSION[file.mimetype];
    callback(null, `${randomUUID()}${extension}`);
  },
});

export const uploadProductImages = multer({
  storage,
  limits: { files: 8, fileSize: 5 * 1024 * 1024, fields: 2, parts: 10 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const expectedExtension = MIME_EXTENSION[file.mimetype];
    if (!expectedExtension || extension !== expectedExtension) {
      callback(new Error("Upload JPEG, PNG, or WebP images with a matching file extension."));
      return;
    }
    callback(null, true);
  },
});
