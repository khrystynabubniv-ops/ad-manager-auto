import path from "node:path";
import { AssetType } from "../types.js";

const months = new Set(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]);
const businesses = new Set(["ga", "ug", "wisey", "forma", "ruut", "sg", "s&g"]);
const sizes = new Set(["1x1", "4x5", "9x16", "16x9"]);
const staticFormatPattern = /^static\d+$/;
const videoFormatPattern = /^video\d+$/;
const adFormatPattern = /^(static|video)(\d+)$/;

export type CreativeAssetPlacement = "feed" | "stories_reels" | "horizontal" | "unknown" | "do_not_use";
export type CreativeAdFormat = "static" | "video";

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

export function creativeAdFormatForAssetType(assetType: AssetType): CreativeAdFormat {
  return assetType === "video" ? "video" : "static";
}

export function creativeAdNameParts(fileName: string, assetType: AssetType): {
  sourceGroupKey: string;
  familyKey: string;
  format: CreativeAdFormat;
  explicitAdName?: string;
  explicitAdNumber?: number;
} {
  const grouping = creativeGroupingForFileName(fileName);
  const groupParts = grouping.groupKey.split("_").filter(Boolean);
  const explicitFormat = groupParts.at(-1)?.match(adFormatPattern);
  if (explicitFormat) {
    const familyKey = groupParts.slice(0, -1).join("_") || grouping.groupKey;
    return {
      sourceGroupKey: grouping.groupKey,
      familyKey,
      format: explicitFormat[1] as CreativeAdFormat,
      explicitAdName: grouping.groupKey,
      explicitAdNumber: Number(explicitFormat[2])
    };
  }

  const legacyVariation = groupParts.at(-1)?.match(/^v\d+$/);
  const legacyFamilyParts =
    groupParts.length >= 4 &&
    /^(con|concept)\d+$/.test(groupParts.at(-3) ?? "") &&
    (groupParts.at(-2) === "stat" || groupParts.at(-2) === "video") &&
    Boolean(legacyVariation)
      ? groupParts.slice(0, -3)
      : groupParts;

  return {
    sourceGroupKey: grouping.groupKey,
    familyKey: legacyFamilyParts.join("_") || grouping.groupKey,
    format: creativeAdFormatForAssetType(assetType)
  };
}

export function validateAssetFileName(fileName: string, assetType: AssetType): string | undefined {
  const stem = path.basename(fileName, path.extname(fileName));
  if (!/^[a-z0-9_&]+$/.test(stem)) {
    return "Asset filename must use lowercase latin letters, numbers, underscores, or & only";
  }

  const parts = stem.split("_").filter(Boolean);
  if (parts.length < 4) {
    return "Asset filename must follow monYY_vacancy_[business_]staticN_size or monYY_vacancy_[business_]videoN_size";
  }

  const [monthYear] = parts;
  if (!monthYear || !months.has(monthYear.slice(0, 3)) || !/^\d{2}$/.test(monthYear.slice(3))) {
    return "Asset filename must start with month and year like jan26";
  }

  const newNamingError = validateCurrentAssetFileName(parts, assetType);
  if (!newNamingError) {
    return undefined;
  }

  const legacyNamingError = validateLegacyAssetFileName(parts, assetType);
  if (!legacyNamingError) {
    return undefined;
  }

  return newNamingError;
}

function validateCurrentAssetFileName(parts: string[], assetType: AssetType): string | undefined {
  const hasBusiness = parts.length >= 5 && businesses.has(parts.at(-3) ?? "");
  const format = parts.at(-2);
  const size = parts.at(-1);
  const vacancyParts = parts.slice(1, hasBusiness ? -3 : -2);

  if (!vacancyParts.length) {
    return "Asset filename must include vacancy after month/year";
  }
  if (!format || (!staticFormatPattern.test(format) && !videoFormatPattern.test(format))) {
    return "Asset filename format must look like static1 or video1";
  }
  if (assetType === "image" && !staticFormatPattern.test(format)) {
    return "Image asset filename must use staticN format";
  }
  if (assetType === "video" && !videoFormatPattern.test(format)) {
    return "Video asset filename must use videoN format";
  }
  if (!size || !sizes.has(size)) {
    return "Asset filename size must be 1x1, 4x5, 9x16, or 16x9";
  }

  return undefined;
}

function validateLegacyAssetFileName(parts: string[], assetType: AssetType): string | undefined {
  if (parts.length < 6) {
    return "Asset filename must follow legacy monYY_vacancy_[business_]concept_format_vN_size";
  }

  const hasBusiness = parts.length >= 7 && businesses.has(parts.at(-5) ?? "");
  const concept = parts.at(-4);
  const format = parts.at(-3);
  const variation = parts.at(-2);
  const size = parts.at(-1);
  const vacancyParts = parts.slice(1, hasBusiness ? -5 : -4);

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
