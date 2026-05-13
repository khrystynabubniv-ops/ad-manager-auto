import path from "node:path";
import { AssetType } from "../types.js";

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".avi", ".webm"]);

export function detectAssetType(fileName: string, mimeType?: string): AssetType {
  if (mimeType?.startsWith("image/")) {
    return "image";
  }
  if (mimeType?.startsWith("video/")) {
    return "video";
  }

  const ext = path.extname(fileName).toLowerCase();
  if (imageExtensions.has(ext)) {
    return "image";
  }
  if (videoExtensions.has(ext)) {
    return "video";
  }

  throw new Error(`Unsupported creative file type: ${fileName} (${mimeType ?? "unknown mime"})`);
}

export function extensionFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/quicktime") return ".mov";
  return "";
}
