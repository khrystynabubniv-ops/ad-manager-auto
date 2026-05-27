import path from "node:path";
import { AssetType } from "../types.js";

const months = new Set(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]);
const businesses = new Set(["ga", "ug", "wisey", "forma", "ruut", "sg", "s&g"]);
const sizes = new Set(["1x1", "4x5", "9x16", "16x9"]);

export type CreativeAssetPlacement = "feed" | "stories_reels" | "horizontal" | "unknown" | "do_not_use";

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
    .replace(/_(1x1|4x5|9x16|16x9)_\d+$/, "_$1");

  return `${stem || "creative"}${ext}`;
}

export function assetPlacementForSize(size?: string): CreativeAssetPlacement {
  if (size === "1x1" || size === "4x5") return "feed";
  if (size === "9x16") return "stories_reels";
  if (size === "16x9") return "horizontal";
  return "unknown";
}

export function creativeGroupingForFileName(fileName: string): {
  groupKey: string;
  groupName: string;
  size?: string;
  placement: CreativeAssetPlacement;
  normalizedFileName: string;
} {
  const normalizedFileName = normalizeAssetFileName(fileName);
  const stem = path.basename(normalizedFileName, path.extname(normalizedFileName));
  const parts = stem.split("_").filter(Boolean);
  const lastPart = parts.at(-1);
  const size = lastPart && sizes.has(lastPart) ? lastPart : undefined;
  const groupParts = size ? parts.slice(0, -1) : parts;
  const groupKey = groupParts.join("_") || stem || "creative";

  return {
    groupKey,
    groupName: groupKey.replace(/_/g, " "),
    size,
    placement: assetPlacementForSize(size),
    normalizedFileName
  };
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
    return "Asset filename size must be 1x1, 4x5, 9x16, or 16x9";
  }

  return undefined;
}
