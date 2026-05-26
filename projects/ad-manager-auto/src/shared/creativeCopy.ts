export const CTA_TYPES = [
  "LEARN_MORE",
  "SIGN_UP",
  "SHOP_NOW",
  "APPLY_NOW",
  "CONTACT_US",
  "SUBSCRIBE",
  "DOWNLOAD",
  "GET_QUOTE",
  "BOOK_TRAVEL",
  "CALL_NOW",
  "DONATE",
  "GET_DIRECTIONS",
  "MESSAGE_PAGE",
  "NO_BUTTON",
  "VIEW_INSTAGRAM_PROFILE",
  "WHATSAPP_MESSAGE"
] as const;

export type CtaType = (typeof CTA_TYPES)[number];

export const DEFAULT_CTA_TYPE: CtaType = "LEARN_MORE";

export function isCtaType(value: string): value is CtaType {
  return (CTA_TYPES as readonly string[]).includes(value);
}

export function cleanTextList(values: unknown, maxItems = 8): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    cleaned.push(text);
    if (cleaned.length >= maxItems) break;
  }

  return cleaned;
}

export function cleanTextSequence(values: unknown, maxItems = 8): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const cleaned: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text) continue;
    cleaned.push(text);
    if (cleaned.length >= maxItems) break;
  }

  return cleaned;
}

export function normalizeCtaType(value?: string | null): CtaType {
  const normalized = value?.trim().toUpperCase();
  return normalized && isCtaType(normalized) ? normalized : DEFAULT_CTA_TYPE;
}

export function cleanCtaTypeList(values: unknown, maxItems = 5): CtaType[] {
  const seen = new Set<CtaType>();
  const cleaned: CtaType[] = [];

  for (const value of cleanTextList(values, maxItems)) {
    const normalized = value.toUpperCase();
    if (!isCtaType(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    cleaned.push(normalized);
  }

  return cleaned;
}

export function normalizeCtaTypeSequence(values: unknown, maxItems = 8): CtaType[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const cleaned: CtaType[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim().toUpperCase();
    if (!isCtaType(normalized)) continue;
    cleaned.push(normalized);
    if (cleaned.length >= maxItems) break;
  }

  return cleaned;
}

export function normalizeCtaTypeList(primary?: string | null, variants?: unknown, maxItems = 5): CtaType[] {
  const values = [normalizeCtaType(primary), ...cleanCtaTypeList(variants, maxItems)];
  return [...new Set(values)].slice(0, maxItems);
}

export function normalizeAdTextList(primary?: string | null, variants?: unknown, maxItems = 8): string[] {
  const values = [primary?.trim(), ...cleanTextList(variants, maxItems)].filter((value): value is string => Boolean(value));
  return [...new Set(values)].slice(0, maxItems);
}
