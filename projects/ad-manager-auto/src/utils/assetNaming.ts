import path from "node:path";
import { AssetType } from "../types.js";

const months = new Set(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]);
const businesses = new Set(["ga", "ug", "wisey", "forma", "ruut", "sg", "s&g"]);
const sizes = new Set(["1x1", "9x16"]);

export function normalizeAssetFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const rawStem = path.basename(fileName, path.extname(fileName));
  const stem = rawStem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9&]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_(1x1|9x16)_\d+$/, "_$1");

  return `${stem || "creative"}${ext}`;
}

export function validateAssetFileName(fileName: string, assetType: AssetType): string | undefined {
  const stem = path.basename(fileName, path.extname(fileName));
  if (!/^[a-z0-9_&]+$/.test(stem)) {
    return "Asset filename must use lowercase latin letters, numbers, underscores, or & only";
  }

  const parts = stem.split("_").filter(Boolean);
  if (parts.length < 6) {
    return "Asset filename must follow monYY_vacancy_[business_]concept_format_vN_size";
  }

  const [monthYear] = parts;
  const hasBusiness = parts.length >= 7 && businesses.has(parts.at(-5) ?? "");
  const concept = parts.at(-4);
  const format = parts.at(-3);
  const variation = parts.at(-2);
  const size = parts.at(-1);
  const vacancyParts = parts.slice(1, hasBusiness ? -5 : -4);

  if (!monthYear || !months.has(monthYear.slice(0, 3)) || !/^\d{2}$/.test(monthYear.slice(3))) {
    return "Asset filename must start with month and year like jan26";
  }
  if (!vacancyParts.length) {
    return "Asset filename must include vacancy after month/year";
  }
  if (!concept || !/^(con|concept)\d+$/.test(concept)) {
    return "Asset filename concept must look like con1 or concept1";
  }
  if (format !== "stat" && format !== "video") {
    return "Asset filename format must be stat or video";
  }
  if (assetType === "image" && format !== "stat") {
    return "Image asset filename must use stat format";
  }
  if (assetType === "video" && format !== "video") {
    return "Video asset filename must use video format";
  }
  if (!variation || !/^v\d+$/.test(variation)) {
    return "Asset filename variation must look like v1";
  }
  if (!size || !sizes.has(size)) {
    return "Asset filename size must be 1x1 or 9x16";
  }

  return undefined;
}
