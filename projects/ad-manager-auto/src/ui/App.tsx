import {
  AlertCircle,
  Archive,
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  ImageIcon,
  Layers,
  Loader2,
  LogOut,
  Maximize2,
  Megaphone,
  Pencil,
  Plus,
  Play,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { type Dispatch, type FormEvent, type ReactNode, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOktaAuth, isAuthDisabled } from "./auth";
import {
  AdDraftPayload,
  AdDraftWithCreative,
  AdSetDraftPayload,
  AdSetDraftWithAds,
  CampaignDraft,
  CampaignDraftPayload,
  CampaignDraftTree,
  Creative,
  CreativeAssetPlacement,
  CreativeGroup,
  CreativeListKind,
  CreativeUpdateRequest,
  LaunchPlacement,
  LaunchRequest,
  MetaAdSet,
  MetaCampaign,
  MetaTargetingLocation,
  archiveCreative,
  archiveCreativeGroup,
  createAdDraft,
  createAdSetDraft,
  createCampaignDraft,
  createCreativeGroupSlot,
  fetchAdSets,
  fetchCampaignDraft,
  fetchCampaignDrafts,
  fetchCampaigns,
  fetchCreativeGroups,
  fetchCreatives,
  launchCreative,
  launchCreativeGroup,
  generateCreativeCopySuggestions,
  moveCreativeToReady,
  searchTargetingLocations,
  syncCampaigns,
  uploadCreative,
  updateCreative,
  updateCreativeGrouping,
  updateAdDraft,
  updateAdSetDraft,
  updateCampaignDraft
} from "./api";
import {
  CTA_TYPES,
  DEFAULT_CTA_TYPE,
  cleanTextList,
  cleanTextSequence,
  normalizeCtaType,
  normalizeCtaTypeSequence
} from "../shared/creativeCopy";

type CreativeView = "ready" | "in-use" | "drafts" | "archived";
type RouteState =
  | {
      area: "creatives";
      view: CreativeView;
    }
  | {
      area: "campaigns";
      campaignId?: number;
    };
type BuilderStep = "campaign" | "adsets" | "creatives";

type CampaignFormState = {
  name: string;
  objective: string;
  buyingType: string;
  campaignSettingsMode: string;
  budgetStrategy: string;
  campaignDailyBudgetMinor: string;
  campaignLifetimeBudgetMinor: string;
  bidStrategy: string;
  spendCapMinor: string;
  specialAdCategories: string;
  specialAdCategoryCountries: string;
  specialAdCategoryCountrySelections: LocationSelection[];
  metadata: Record<string, unknown>;
  promotedObject: string;
  budgetScheduleSpecs: string;
  isSkadnetworkAttribution: boolean;
  abTestEnabled: boolean;
  liveAdsEnabled: boolean;
  metaStatus: string;
};

type LocationSelection = {
  key: string;
  name: string;
  type: string;
  countryCode?: string;
  countryName?: string;
  region?: string;
  radius?: string;
};

type AdSetFormState = {
  name: string;
  destinationType: string;
  conversionEvent: string;
  optimizationGoal: string;
  billingEvent: string;
  bidStrategy: string;
  bidAmountMinor: string;
  dailyBudgetMinor: string;
  lifetimeBudgetMinor: string;
  startTime: string;
  endTime: string;
  attributionSetting: string;
  isDynamicCreative: boolean;
  useAdvantageAudience: boolean;
  savedAudienceId: string;
  targeting: string;
  includedLocations: LocationSelection[];
  excludedLocations: LocationSelection[];
  metadata: Record<string, unknown>;
  promotedObject: string;
  audienceControls: string;
  audienceRecommendations: string;
  placementMode: string;
  placementSettings: string;
  brandSafetyControls: string;
  pacingType: string;
  adsetSchedule: string;
  frequencyControlSpecs: string;
  beneficiary: string;
  payor: string;
  metaStatus: string;
};

type AdDraftFormState = {
  name: string;
  facebookPageId: string;
  instagramActorId: string;
  threadsActorId: string;
  brandedContentSponsorPageId: string;
  brandIdentitySettings: string;
  destinationType: string;
  destinationUrl: string;
  leadFormId: string;
  leadFormName: string;
  instantExperienceId: string;
  appDeepLinkUrl: string;
  phoneNumber: string;
  whatsappPhoneNumber: string;
  primaryText: string;
  headline: string;
  description: string;
  primaryTextVariants: string;
  headlineVariants: string;
  descriptionVariants: string;
  ctaType: string;
  ctaLink: string;
  displayLink: string;
  urlTags: string;
  urlParameters: string;
  metaPixelId: string;
  conversionEventName: string;
  trackingSpecs: string;
  conversionSpecs: string;
  objectStorySpec: string;
  assetFeedSpec: string;
  callToActionValue: string;
  creativeFeaturesSpec: string;
  degreesOfFreedomSpec: string;
  metaStatus: string;
};

type CreativeDetailsDraft = {
  projectType: string;
  adText: string;
  headline: string;
  headlineVariants: string[];
  adTextVariants: string[];
  ctaType: string;
  ctaTypeVariants: string[];
  ctaLink: string;
  audience: string;
  location: string;
};

const campaignObjectives = [
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_AWARENESS",
  "OUTCOME_APP_PROMOTION"
];
const buyingTypes = ["AUCTION", "RESERVED"];
const metaStatuses = ["PAUSED", "ACTIVE"];
const campaignSettingsModes = [
  { value: "MANUAL", label: "Manual campaign setup" },
  { value: "RECOMMENDED", label: "Recommended Meta settings" }
];
const budgetStrategies = [
  { value: "AD_SET", label: "Ad set budget" },
  { value: "CAMPAIGN", label: "Campaign budget" }
];
const bidStrategies = ["", "LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"];
const destinationTypes = [
  "WEBSITE",
  "APP",
  "MESSENGER",
  "WHATSAPP",
  "INSTAGRAM_DIRECT",
  "ON_AD",
  "PHONE_CALL",
  "APP_STORE",
  "DEEPLINK"
];
const conversionEvents = [
  "",
  "LINK_CLICK",
  "LANDING_PAGE_VIEW",
  "LEAD",
  "PURCHASE",
  "CONTACT",
  "SUBSCRIBE",
  "COMPLETE_REGISTRATION",
  "INITIATED_CHECKOUT",
  "ADD_TO_CART",
  "APP_INSTALL"
];
const optimizationGoals = [
  "LINK_CLICKS",
  "LANDING_PAGE_VIEWS",
  "OFFSITE_CONVERSIONS",
  "LEAD_GENERATION",
  "CONVERSATIONS",
  "IMPRESSIONS",
  "REACH",
  "POST_ENGAGEMENT",
  "THRUPLAY",
  "VALUE",
  "APP_INSTALLS"
];
const billingEvents = ["IMPRESSIONS", "LINK_CLICKS", "THRUPLAY", "APP_INSTALLS", "POST_ENGAGEMENT"];
const attributionSettings = ["", "1d_click", "7d_click", "1d_view", "1d_click_1d_view", "7d_click_1d_view", "skan_click", "skan_view"];
const placementModes = [
  { value: "ADVANTAGE_PLUS", label: "Advantage+ placements" },
  { value: "MANUAL", label: "Manual placements" }
];
const pacingTypes = ["", "standard", "day_parting", "no_pacing"];
const adDestinationTypes = [
  "WEBSITE",
  "LEAD_FORM",
  "INSTANT_EXPERIENCE",
  "APP",
  "MESSENGER",
  "WHATSAPP",
  "INSTAGRAM_DIRECT",
  "PHONE_CALL"
];
const ctaTypes = [...CTA_TYPES];

const builderSteps = [
  { id: "campaign", label: "Campaign", icon: Megaphone },
  { id: "adsets", label: "Ad sets", icon: Layers },
  { id: "creatives", label: "Creatives", icon: ImageIcon }
] as const;

const specialAdCategoryOptions = [
  { value: "HOUSING", label: "Housing" },
  { value: "EMPLOYMENT", label: "Employment" },
  { value: "CREDIT", label: "Credit" },
  { value: "ISSUES_ELECTIONS_POLITICS", label: "Social issues, elections or politics" }
];

const commonCountryOptions = [
  { code: "US", label: "United States" },
  { code: "UA", label: "Ukraine" },
  { code: "PL", label: "Poland" },
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" }
];

const viewConfig: Record<
  CreativeView,
  {
    title: string;
    navLabel: string;
    listKind: CreativeListKind;
    path: string;
    summary: string;
    empty: string;
  }
> = {
  ready: {
    title: "Ready creatives",
    navLabel: "Ready",
    listKind: "ready",
    path: "/dashboard",
    summary: "ready to set up",
    empty: "No ready creatives yet."
  },
  "in-use": {
    title: "In use",
    navLabel: "In Use",
    listKind: "launched",
    path: "/in-use",
    summary: "used in active ads",
    empty: "No creatives are in use yet."
  },
  drafts: {
    title: "Draft creatives",
    navLabel: "Drafts",
    listKind: "needs_ad_details",
    path: "/drafts",
    summary: "need setup details",
    empty: "No draft creatives right now."
  },
  archived: {
    title: "Archived creatives",
    navLabel: "Archived",
    listKind: "canceled",
    path: "/archived",
    summary: "no longer in use",
    empty: "No archived creatives yet."
  }
};

const creativeNavItems = Object.keys(viewConfig) as CreativeView[];

function activeRoute(): RouteState {
  const campaignMatch = window.location.pathname.match(/^\/(?:campaigns|builder)(?:\/(\d+))?/);
  if (campaignMatch) {
    return {
      area: "campaigns",
      campaignId: campaignMatch[1] ? Number(campaignMatch[1]) : undefined
    };
  }
  if (window.location.pathname.includes("in-use") || window.location.pathname.includes("launched")) {
    return { area: "creatives", view: "in-use" };
  }
  if (window.location.pathname.includes("drafts") || window.location.pathname.includes("needs-details")) {
    return { area: "creatives", view: "drafts" };
  }
  if (window.location.pathname.includes("archived")) return { area: "creatives", view: "archived" };
  return { area: "creatives", view: "ready" };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function nullableDatetimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function nullablePositiveNumber(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return parsed;
}

function minorToDollarInput(value?: number | null) {
  if (!value) return "";
  const dollars = value / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function nullableDollarToMinor(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive dollar amount.`);
  }
  return Math.round(parsed * 100);
}

function formatUsdMinor(value?: number | null) {
  if (!value) return "No budget";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2
  }).format(value / 100);
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value.trim() || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseOptionalJsonObject(value: string, label: string) {
  if (!value.trim()) return null;
  return parseJsonObject(value, label);
}

function parseOptionalJsonValue(value: string, label: string): Record<string, unknown> | Array<Record<string, unknown>> | null {
  if (!value.trim()) return null;
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${label} must be a JSON object or an array of objects.`);
  }
  if (Array.isArray(parsed)) {
    if (parsed.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error(`${label} must be an array of JSON objects.`);
    }
    return parsed as Array<Record<string, unknown>>;
  }
  return parsed as Record<string, unknown>;
}

function parseCategories(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatJsonValue(value?: unknown | null) {
  return value == null ? "" : JSON.stringify(value, null, 2);
}

function formatCategories(categories?: string[] | null) {
  return categories?.join(", ") ?? "";
}

function categoryList(value: string) {
  return parseCategories(value);
}

function formatCtaTypeLabel(value?: string | null) {
  return (value ?? DEFAULT_CTA_TYPE)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function mergeGeneratedTextVariation(primary: string, variants: string[], generated: string) {
  const currentPrimary = primary.trim();
  const generatedText = generated.trim();
  const currentVariants = cleanTextSequence(variants);

  if (!generatedText) {
    return { primary: currentPrimary, variants: currentVariants };
  }

  if (!currentPrimary) {
    return {
      primary: generatedText,
      variants: currentVariants
    };
  }

  return {
    primary: currentPrimary,
    variants: cleanTextSequence([...currentVariants, generatedText])
  };
}

function mergeGeneratedCtaVariation(primary: string, variants: string[], generated: string, replacePrimary: boolean) {
  const currentPrimary = normalizeCtaType(primary);
  const generatedCta = normalizeCtaType(generated);
  const currentVariants = normalizeCtaTypeSequence(variants);

  if (replacePrimary) {
    return {
      primary: generatedCta,
      variants: currentVariants
    };
  }

  return {
    primary: currentPrimary,
    variants: normalizeCtaTypeSequence([...currentVariants, generatedCta])
  };
}

function creativeToDetailsDraft(creative: Creative): CreativeDetailsDraft {
  const ctaType = normalizeCtaType(creative.cta_type);
  return {
    projectType: creative.project_type ?? "",
    adText: creative.ad_text ?? "",
    headline: creative.headline ?? "",
    headlineVariants: cleanTextSequence(creative.headline_variants ?? []),
    adTextVariants: cleanTextSequence(creative.ad_text_variants ?? []),
    ctaType,
    ctaTypeVariants: normalizeCtaTypeSequence(creative.cta_type_variants ?? []),
    ctaLink: creative.cta_link ?? "",
    audience: creative.audience ?? "",
    location: creative.location ?? ""
  };
}

function locationFromMeta(location: MetaTargetingLocation): LocationSelection {
  return {
    key: location.key,
    name: location.name,
    type: location.type,
    countryCode: location.country_code,
    countryName: location.country_name,
    region: location.region,
    radius: location.type === "city" ? "25" : undefined
  };
}

function countryCodeFromLocation(location: Pick<LocationSelection, "key" | "countryCode">) {
  return (location.countryCode || location.key).toUpperCase();
}

function countryNameFromCode(code: string) {
  return commonCountryOptions.find((country) => country.code === code.toUpperCase())?.label ?? code.toUpperCase();
}

function locationKey(location: Pick<LocationSelection, "key" | "type">) {
  return `${location.type}:${location.key}`;
}

function uniqueLocations(locations: LocationSelection[]) {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = locationKey(location);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function locationLabel(location: LocationSelection) {
  const pieces = [location.name];
  if (location.region && location.region !== location.name) pieces.push(location.region);
  if (location.countryName && location.countryName !== location.name) pieces.push(location.countryName);
  if (!location.countryName && location.countryCode && location.countryCode !== location.name) pieces.push(location.countryCode);
  return pieces.filter(Boolean).join(", ");
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];
}

function locationsFromGeoLocations(value: unknown): LocationSelection[] {
  const geo = readObject(value);
  if (!geo) return [];

  const countries = Array.isArray(geo.countries)
    ? geo.countries
        .filter((country): country is string => typeof country === "string")
        .map<LocationSelection>((country) => ({ key: country, name: country, type: "country", countryCode: country }))
    : [];
  const regions = readArray(geo.regions).map<LocationSelection>((region) => ({
    key: String(region.key ?? region.region_id ?? ""),
    name: String(region.name ?? region.key ?? region.region_id ?? "Region"),
    type: "region",
    countryCode: typeof region.country_code === "string" ? region.country_code : undefined,
    countryName: typeof region.country_name === "string" ? region.country_name : undefined
  }));
  const cities = readArray(geo.cities).map<LocationSelection>((city) => ({
    key: String(city.key ?? city.city_id ?? ""),
    name: String(city.name ?? city.key ?? city.city_id ?? "City"),
    type: "city",
    countryCode: typeof city.country_code === "string" ? city.country_code : undefined,
    countryName: typeof city.country_name === "string" ? city.country_name : undefined,
    region: typeof city.region === "string" ? city.region : undefined,
    radius: city.radius == null ? "25" : String(city.radius)
  }));

  return uniqueLocations([...countries, ...regions, ...cities].filter((location) => location.key));
}

function locationsFromStoredSelections(value: unknown): LocationSelection[] {
  return uniqueLocations(
    readArray(value)
      .map<LocationSelection>((location) => ({
        key: String(location.key ?? location.country_code ?? ""),
        name: String(location.name ?? location.country_name ?? location.key ?? ""),
        type: String(location.type ?? "country"),
        countryCode: typeof location.countryCode === "string" ? location.countryCode : typeof location.country_code === "string" ? location.country_code : undefined,
        countryName: typeof location.countryName === "string" ? location.countryName : typeof location.country_name === "string" ? location.country_name : undefined,
        region: typeof location.region === "string" ? location.region : undefined,
        radius: location.radius == null ? undefined : String(location.radius)
      }))
      .filter((location) => location.key && location.name)
  );
}

function storedTargetingLocations(metadata: Record<string, unknown> | undefined, bucket: "included" | "excluded") {
  const stored = readObject(metadata?.targetingLocations);
  return locationsFromStoredSelections(stored?.[bucket]);
}

function campaignSpecialCountrySelections(campaign: CampaignDraftTree): LocationSelection[] {
  const stored = readObject(campaign.metadata?.specialAdCategoryCountrySelections);
  const storedCountries = locationsFromStoredSelections(stored?.countries).filter((location) => location.type === "country");
  const byCode = new Map(storedCountries.map((location) => [countryCodeFromLocation(location), location]));

  for (const code of campaign.special_ad_category_countries) {
    const normalized = code.toUpperCase();
    if (!byCode.has(normalized)) {
      byCode.set(normalized, {
        key: normalized,
        name: countryNameFromCode(normalized),
        type: "country",
        countryCode: normalized,
        countryName: countryNameFromCode(normalized)
      });
    }
  }

  return Array.from(byCode.values());
}

function buildGeoLocations(locations: LocationSelection[]) {
  const countries: string[] = [];
  const regions: Array<Record<string, unknown>> = [];
  const cities: Array<Record<string, unknown>> = [];

  for (const location of uniqueLocations(locations)) {
    if (location.type === "country") {
      countries.push(location.countryCode || location.key);
    } else if (location.type === "region") {
      regions.push({ key: location.key });
    } else if (location.type === "city") {
      const radius = Number(location.radius || 25);
      cities.push({
        key: location.key,
        radius: Number.isFinite(radius) && radius > 0 ? radius : 25,
        distance_unit: "mile"
      });
    }
  }

  return {
    ...(countries.length ? { countries } : {}),
    ...(regions.length ? { regions } : {}),
    ...(cities.length ? { cities } : {})
  };
}

function summarizeTargetingLocations(targeting: Record<string, unknown>, metadata?: Record<string, unknown>) {
  const storedIncluded = storedTargetingLocations(metadata, "included");
  const storedExcluded = storedTargetingLocations(metadata, "excluded");
  const included = storedIncluded.length ? storedIncluded : locationsFromGeoLocations(targeting.geo_locations);
  const excluded = storedExcluded.length ? storedExcluded : locationsFromGeoLocations(targeting.excluded_geo_locations);
  const includeText = included.length ? included.map(locationLabel).join("; ") : "No included locations";
  const excludeText = excluded.length ? excluded.map(locationLabel).join("; ") : "No exclusions";
  return { includeText, excludeText, includedCount: included.length, excludedCount: excluded.length };
}

function defaultCampaignFormState(): CampaignFormState {
  return {
    name: "",
    objective: "OUTCOME_TRAFFIC",
    buyingType: "AUCTION",
    campaignSettingsMode: "MANUAL",
    budgetStrategy: "AD_SET",
    campaignDailyBudgetMinor: "",
    campaignLifetimeBudgetMinor: "",
    bidStrategy: "",
    spendCapMinor: "",
    specialAdCategories: "",
    specialAdCategoryCountries: "",
    specialAdCategoryCountrySelections: [],
    metadata: {},
    promotedObject: "",
    budgetScheduleSpecs: "",
    isSkadnetworkAttribution: false,
    abTestEnabled: false,
    liveAdsEnabled: false,
    metaStatus: "PAUSED"
  };
}

function campaignToFormState(campaign: CampaignDraftTree): CampaignFormState {
  return {
    name: campaign.name,
    objective: campaign.objective,
    buyingType: campaign.buying_type,
    campaignSettingsMode: campaign.campaign_settings_mode || "MANUAL",
    budgetStrategy: campaign.budget_strategy || "AD_SET",
    campaignDailyBudgetMinor: minorToDollarInput(campaign.campaign_daily_budget_minor),
    campaignLifetimeBudgetMinor: minorToDollarInput(campaign.campaign_lifetime_budget_minor),
    bidStrategy: campaign.bid_strategy ?? "",
    spendCapMinor: minorToDollarInput(campaign.spend_cap_minor),
    specialAdCategories: formatCategories(campaign.special_ad_categories),
    specialAdCategoryCountries: formatCategories(campaign.special_ad_category_countries),
    specialAdCategoryCountrySelections: campaignSpecialCountrySelections(campaign),
    metadata: campaign.metadata ?? {},
    promotedObject: formatJsonValue(campaign.promoted_object),
    budgetScheduleSpecs: formatJsonValue(campaign.budget_schedule_specs),
    isSkadnetworkAttribution: campaign.is_skadnetwork_attribution,
    abTestEnabled: campaign.a_b_test_enabled,
    liveAdsEnabled: campaign.live_ads_enabled,
    metaStatus: campaign.meta_status
  };
}

function buildCampaignPayload(draft: CampaignFormState): CampaignDraftPayload & { name: string } {
  const name = draft.name.trim();
  if (!name) {
    throw new Error("Campaign name is required.");
  }

  const campaignDailyBudgetMinor =
    draft.budgetStrategy === "CAMPAIGN" ? nullableDollarToMinor(draft.campaignDailyBudgetMinor, "Campaign daily budget") : null;
  const campaignLifetimeBudgetMinor =
    draft.budgetStrategy === "CAMPAIGN"
      ? nullableDollarToMinor(draft.campaignLifetimeBudgetMinor, "Campaign lifetime budget")
      : null;

  if (campaignDailyBudgetMinor && campaignLifetimeBudgetMinor) {
    throw new Error("Use either campaign daily budget or campaign lifetime budget, not both.");
  }

  if (draft.budgetStrategy === "CAMPAIGN" && !campaignDailyBudgetMinor && !campaignLifetimeBudgetMinor) {
    throw new Error("Campaign budget strategy needs a daily or lifetime campaign budget.");
  }

  const specialAdCategories = parseCategories(draft.specialAdCategories);
  const specialAdCategoryCountries = specialAdCategories.length
    ? draft.specialAdCategoryCountrySelections.map(countryCodeFromLocation)
    : [];

  if (specialAdCategories.length && !specialAdCategoryCountries.length) {
    throw new Error("Choose at least one country for the selected special ad category.");
  }

  return {
    name,
    objective: draft.objective,
    buyingType: draft.buyingType,
    campaignSettingsMode: draft.campaignSettingsMode,
    budgetStrategy: draft.budgetStrategy,
    campaignDailyBudgetMinor,
    campaignLifetimeBudgetMinor,
    bidStrategy: optionalText(draft.bidStrategy) ?? null,
    spendCapMinor: nullableDollarToMinor(draft.spendCapMinor, "Spend cap"),
    specialAdCategories,
    specialAdCategoryCountries,
    promotedObject: null,
    budgetScheduleSpecs: null,
    isSkadnetworkAttribution: false,
    abTestEnabled: false,
    liveAdsEnabled: false,
    metaStatus: draft.metaStatus,
    metadata: {
      ...draft.metadata,
      specialAdCategoryCountrySelections: {
        countries: specialAdCategories.length ? draft.specialAdCategoryCountrySelections : []
      }
    }
  };
}

function adSetToFormState(adset: AdSetDraftWithAds): AdSetFormState {
  const targeting = adset.targeting ?? {};
  const storedIncludedLocations = storedTargetingLocations(adset.metadata, "included");
  const storedExcludedLocations = storedTargetingLocations(adset.metadata, "excluded");

  return {
    name: adset.name,
    destinationType: adset.destination_type || "WEBSITE",
    conversionEvent: adset.conversion_event ?? "",
    optimizationGoal: adset.optimization_goal || "LINK_CLICKS",
    billingEvent: adset.billing_event || "IMPRESSIONS",
    bidStrategy: adset.bid_strategy ?? "",
    bidAmountMinor: minorToDollarInput(adset.bid_amount_minor),
    dailyBudgetMinor: minorToDollarInput(adset.daily_budget_minor),
    lifetimeBudgetMinor: minorToDollarInput(adset.lifetime_budget_minor),
    startTime: toDatetimeLocal(adset.start_time),
    endTime: toDatetimeLocal(adset.end_time),
    attributionSetting: adset.attribution_setting ?? "",
    isDynamicCreative: adset.is_dynamic_creative,
    useAdvantageAudience: adset.use_advantage_audience,
    savedAudienceId: adset.saved_audience_id ?? "",
    targeting: JSON.stringify(targeting, null, 2),
    includedLocations: storedIncludedLocations.length ? storedIncludedLocations : locationsFromGeoLocations(targeting.geo_locations),
    excludedLocations: storedExcludedLocations.length ? storedExcludedLocations : locationsFromGeoLocations(targeting.excluded_geo_locations),
    metadata: adset.metadata ?? {},
    promotedObject: formatJsonValue(adset.promoted_object),
    audienceControls: JSON.stringify(adset.audience_controls ?? {}, null, 2),
    audienceRecommendations: JSON.stringify(adset.audience_recommendations ?? {}, null, 2),
    placementMode: adset.placement_mode || "ADVANTAGE_PLUS",
    placementSettings: JSON.stringify(adset.placement_settings ?? {}, null, 2),
    brandSafetyControls: JSON.stringify(adset.brand_safety_controls ?? {}, null, 2),
    pacingType: adset.pacing_type ?? "",
    adsetSchedule: formatJsonValue(adset.adset_schedule),
    frequencyControlSpecs: formatJsonValue(adset.frequency_control_specs),
    beneficiary: adset.beneficiary ?? "",
    payor: adset.payor ?? "",
    metaStatus: adset.meta_status || "PAUSED"
  };
}

function buildAdSetPayload(draft: AdSetFormState, campaignBudgetStrategy: string): AdSetDraftPayload & { name: string } {
  const name = draft.name.trim();
  if (!name) {
    throw new Error("Ad set name is required.");
  }

  const dailyBudgetMinor =
    campaignBudgetStrategy === "CAMPAIGN" ? null : nullableDollarToMinor(draft.dailyBudgetMinor, "Daily budget");
  const lifetimeBudgetMinor =
    campaignBudgetStrategy === "CAMPAIGN" ? null : nullableDollarToMinor(draft.lifetimeBudgetMinor, "Lifetime budget");

  if (dailyBudgetMinor && lifetimeBudgetMinor) {
    throw new Error("Use either ad set daily budget or lifetime budget, not both.");
  }

  if (campaignBudgetStrategy !== "CAMPAIGN" && !dailyBudgetMinor && !lifetimeBudgetMinor) {
    throw new Error("Ad set budget strategy needs a daily or lifetime budget.");
  }

  const targeting = parseJsonObject(draft.targeting, "Targeting");
  const geoLocations = buildGeoLocations(draft.includedLocations);
  const excludedGeoLocations = buildGeoLocations(draft.excludedLocations);
  if (Object.keys(geoLocations).length) {
    targeting.geo_locations = geoLocations;
  } else {
    delete targeting.geo_locations;
  }
  if (Object.keys(excludedGeoLocations).length) {
    targeting.excluded_geo_locations = excludedGeoLocations;
  } else {
    delete targeting.excluded_geo_locations;
  }

  return {
    name,
    destinationType: draft.destinationType,
    conversionEvent: nullableText(draft.conversionEvent),
    optimizationGoal: draft.optimizationGoal,
    billingEvent: draft.billingEvent,
    bidStrategy: nullableText(draft.bidStrategy),
    bidAmountMinor: nullableDollarToMinor(draft.bidAmountMinor, "Bid amount"),
    dailyBudgetMinor,
    lifetimeBudgetMinor,
    startTime: nullableDatetimeLocal(draft.startTime),
    endTime: nullableDatetimeLocal(draft.endTime),
    targeting,
    promotedObject: null,
    attributionSetting: nullableText(draft.attributionSetting),
    isDynamicCreative: draft.isDynamicCreative,
    useAdvantageAudience: draft.useAdvantageAudience,
    savedAudienceId: nullableText(draft.savedAudienceId),
    audienceControls: parseJsonObject(draft.audienceControls, "Audience controls"),
    audienceRecommendations: parseJsonObject(draft.audienceRecommendations, "Audience recommendations"),
    placementMode: draft.placementMode,
    placementSettings: parseJsonObject(draft.placementSettings, "Placement settings"),
    brandSafetyControls: parseJsonObject(draft.brandSafetyControls, "Brand safety controls"),
    pacingType: nullableText(draft.pacingType),
    adsetSchedule: null,
    frequencyControlSpecs: null,
    beneficiary: nullableText(draft.beneficiary),
    payor: nullableText(draft.payor),
    metaStatus: draft.metaStatus,
    metadata: {
      ...draft.metadata,
      targetingLocations: {
        included: draft.includedLocations,
        excluded: draft.excludedLocations
      }
    }
  };
}

function adDraftToFormState(ad: AdDraftWithCreative): AdDraftFormState {
  return {
    name: ad.name ?? "",
    facebookPageId: ad.facebook_page_id ?? "",
    instagramActorId: ad.instagram_actor_id ?? "",
    threadsActorId: ad.threads_actor_id ?? "",
    brandedContentSponsorPageId: ad.branded_content_sponsor_page_id ?? "",
    brandIdentitySettings: JSON.stringify(ad.brand_identity_settings ?? {}, null, 2),
    destinationType: ad.destination_type || "WEBSITE",
    destinationUrl: ad.destination_url ?? "",
    leadFormId: ad.lead_form_id ?? "",
    leadFormName: ad.lead_form_name ?? "",
    instantExperienceId: ad.instant_experience_id ?? "",
    appDeepLinkUrl: ad.app_deep_link_url ?? "",
    phoneNumber: ad.phone_number ?? "",
    whatsappPhoneNumber: ad.whatsapp_phone_number ?? "",
    primaryText: ad.primary_text ?? "",
    headline: ad.headline ?? "",
    description: ad.description ?? "",
    primaryTextVariants: formatCategories(ad.primary_text_variants),
    headlineVariants: formatCategories(ad.headline_variants),
    descriptionVariants: formatCategories(ad.description_variants),
    ctaType: ad.cta_type || "LEARN_MORE",
    ctaLink: ad.cta_link ?? "",
    displayLink: ad.display_link ?? "",
    urlTags: ad.url_tags ?? "",
    urlParameters: JSON.stringify(ad.url_parameters ?? {}, null, 2),
    metaPixelId: ad.meta_pixel_id ?? "",
    conversionEventName: ad.conversion_event_name ?? "",
    trackingSpecs: formatJsonValue(ad.tracking_specs),
    conversionSpecs: formatJsonValue(ad.conversion_specs),
    objectStorySpec: formatJsonValue(ad.object_story_spec),
    assetFeedSpec: formatJsonValue(ad.asset_feed_spec),
    callToActionValue: formatJsonValue(ad.call_to_action_value),
    creativeFeaturesSpec: formatJsonValue(ad.creative_features_spec),
    degreesOfFreedomSpec: formatJsonValue(ad.degrees_of_freedom_spec),
    metaStatus: ad.meta_status || "PAUSED"
  };
}

function buildAdDraftPayload(draft: AdDraftFormState): AdDraftPayload & { name: string } {
  const name = draft.name.trim();
  if (!name) {
    throw new Error("Ad name is required.");
  }

  return {
    name,
    facebookPageId: nullableText(draft.facebookPageId),
    instagramActorId: nullableText(draft.instagramActorId),
    threadsActorId: nullableText(draft.threadsActorId),
    brandedContentSponsorPageId: nullableText(draft.brandedContentSponsorPageId),
    brandIdentitySettings: parseJsonObject(draft.brandIdentitySettings, "Brand identity settings"),
    destinationType: draft.destinationType,
    destinationUrl: nullableText(draft.destinationUrl),
    leadFormId: nullableText(draft.leadFormId),
    leadFormName: nullableText(draft.leadFormName),
    instantExperienceId: nullableText(draft.instantExperienceId),
    appDeepLinkUrl: nullableText(draft.appDeepLinkUrl),
    phoneNumber: nullableText(draft.phoneNumber),
    whatsappPhoneNumber: nullableText(draft.whatsappPhoneNumber),
    primaryText: nullableText(draft.primaryText),
    headline: nullableText(draft.headline),
    description: nullableText(draft.description),
    primaryTextVariants: parseCategories(draft.primaryTextVariants),
    headlineVariants: parseCategories(draft.headlineVariants),
    descriptionVariants: parseCategories(draft.descriptionVariants),
    ctaType: draft.ctaType,
    ctaLink: nullableText(draft.ctaLink),
    displayLink: nullableText(draft.displayLink),
    urlTags: nullableText(draft.urlTags),
    urlParameters: parseJsonObject(draft.urlParameters, "URL parameters"),
    metaPixelId: nullableText(draft.metaPixelId),
    conversionEventName: nullableText(draft.conversionEventName),
    trackingSpecs: parseOptionalJsonValue(draft.trackingSpecs, "Tracking specs"),
    conversionSpecs: parseOptionalJsonValue(draft.conversionSpecs, "Conversion specs"),
    objectStorySpec: parseOptionalJsonObject(draft.objectStorySpec, "Object story spec"),
    assetFeedSpec: parseOptionalJsonObject(draft.assetFeedSpec, "Asset feed spec"),
    callToActionValue: parseOptionalJsonObject(draft.callToActionValue, "Call to action value"),
    creativeFeaturesSpec: parseOptionalJsonObject(draft.creativeFeaturesSpec, "Creative features spec"),
    degreesOfFreedomSpec: parseOptionalJsonObject(draft.degreesOfFreedomSpec, "Degrees of freedom spec"),
    metaStatus: draft.metaStatus
  };
}

function countAds(campaign: CampaignDraftTree) {
  return campaign.adsets.reduce((sum, adset) => sum + adset.ads.length, 0);
}

function campaignStepReady(campaign: CampaignDraftTree) {
  return campaign.budget_strategy !== "CAMPAIGN" || Boolean(campaign.campaign_daily_budget_minor || campaign.campaign_lifetime_budget_minor);
}

function adSetsStepReady(campaign: CampaignDraftTree) {
  return (
    campaign.adsets.length > 0 &&
    campaign.adsets.every((adset) => campaign.budget_strategy === "CAMPAIGN" || Boolean(adset.daily_budget_minor || adset.lifetime_budget_minor))
  );
}

function creativesStepReady(campaign: CampaignDraftTree) {
  return campaign.adsets.length > 0 && campaign.adsets.every((adset) => adset.ads.length > 0);
}

function builderStepCompletion(campaign: CampaignDraftTree): Record<BuilderStep, boolean> {
  return {
    campaign: campaignStepReady(campaign),
    adsets: adSetsStepReady(campaign),
    creatives: creativesStepReady(campaign)
  };
}

function enumToTitle(value?: string | null) {
  return (value ?? "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function budgetStrategyLabel(strategy: string) {
  return strategy === "CAMPAIGN" ? "Campaign budget" : "Ad set budgets";
}

function statusClassName(value: string) {
  return value.toLowerCase().replaceAll("_", "-");
}

function defaultAdSetPayload(index: number): AdSetDraftPayload & { name: string } {
  return {
    name: `Ad set ${index}`,
    destinationType: "WEBSITE",
    optimizationGoal: "LINK_CLICKS",
    billingEvent: "IMPRESSIONS",
    placementMode: "ADVANTAGE_PLUS",
    useAdvantageAudience: true,
    targeting: {},
    metaStatus: "PAUSED"
  };
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

function googleDriveImageUrl(value?: string | null) {
  if (!value) return null;
  const idMatch = value.match(/[?&]id=([^&]+)/) ?? value.match(/\/d\/([^/]+)/);
  const id = idMatch?.[1] ?? value;
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w640` : null;
}

function creativePreviewUrl(creative: Creative) {
  if (creative.asset_type !== "image") return null;
  const driveSourceUrl = creative.source_file_id.includes(":") ? null : googleDriveImageUrl(creative.source_file_id);
  return creative.preview_url || driveSourceUrl || googleDriveImageUrl(creative.google_drive_url);
}

function CreativePreview({ creative }: { creative: Creative }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewUrl = creativePreviewUrl(creative);

  if (previewUrl && !previewFailed) {
    return (
      <img
        src={previewUrl}
        alt={creative.source_file_name ?? "Creative preview"}
        className="previewImage"
        onError={() => setPreviewFailed(true)}
      />
    );
  }

  return (
    <div className="previewFallback">
      <span>{isEmptyCreativeSlot(creative) ? "Empty slot" : creative.asset_type === "video" ? "Video preview unavailable" : "Preview unavailable"}</span>
    </div>
  );
}

function assetDisplayName(creative: Creative) {
  return creative.source_file_name ?? `Creative ${creative.id}`;
}

function AssetPreviewOverlay({ creative, onClose }: { creative: Creative; onClose: () => void }) {
  const previewUrl = creativePreviewUrl(creative);

  return (
    <div className="assetLightboxOverlay" role="dialog" aria-modal="true" aria-label="Asset preview">
      <div className="assetLightbox">
        <div className="assetLightboxHeader">
          <strong>{assetDisplayName(creative)}</strong>
          <button type="button" className="iconButton" onClick={onClose} aria-label="Close preview">
            <X size={18} />
          </button>
        </div>
        {previewUrl ? (
          <img src={previewUrl} alt={assetDisplayName(creative)} className="assetLightboxImage" />
        ) : (
          <div className="assetLightboxFallback">
            {creative.asset_type === "video" ? "Video preview unavailable" : "Preview unavailable"}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetNameButton({ creative, onPreview }: { creative: Creative; onPreview?: (creative: Creative) => void }) {
  return (
    <button type="button" className="assetNameButton" onClick={() => onPreview?.(creative)} title={assetDisplayName(creative)}>
      {assetDisplayName(creative)}
    </button>
  );
}

function AssetPreviewTile({ creative, onPreview }: { creative: Creative; onPreview?: (creative: Creative) => void }) {
  return (
    <button type="button" className="assetPreviewTile" onClick={() => onPreview?.(creative)} disabled={isEmptyCreativeSlot(creative)}>
      <CreativePreview creative={creative} />
      {!isEmptyCreativeSlot(creative) ? (
        <span>
          <Maximize2 size={14} />
          Preview
        </span>
      ) : null}
    </button>
  );
}

function UploadStatusBadge({ creative }: { creative: Creative }) {
  const failed = creative.status.includes("failed");
  const uploaded = Boolean(creative.asset_id || creative.uploaded_at || creative.status === "ready_to_launch" || creative.status === "launched");
  const label = failed ? "Upload failed" : uploaded ? "Uploaded" : "Pending upload";
  const className = failed ? "uploadStatus failed" : uploaded ? "uploadStatus uploaded" : "uploadStatus pending";

  return <span className={className}>{label}</span>;
}

function StatusChip({ value }: { value: string }) {
  return <span className={`statusChip ${value} ${statusClassName(value)}`}>{value.replaceAll("_", " ")}</span>;
}

function BadgeChip({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "warning";
}) {
  return <span className={`badgeChip ${tone}`}>{children}</span>;
}

function MetadataItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <span className="metadataItem">
      <small>{label}</small>
      <strong>{value || "—"}</strong>
    </span>
  );
}

function looksLikeTechnicalId(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ||
    /^[0-9a-f-]{24,}$/i.test(trimmed) ||
    /^\d{12,}$/.test(trimmed)
  );
}

function readablePlacementName(value?: string | null, id?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === id || looksLikeTechnicalId(trimmed)) return null;
  return trimmed;
}

function displayCampaignName(creative: Creative, campaignNamesById?: ReadonlyMap<string, string>) {
  const lookupName = creative.campaign_id ? campaignNamesById?.get(creative.campaign_id) : undefined;
  return (
    lookupName ??
    readablePlacementName(creative.campaign_name, creative.campaign_id) ??
    (creative.campaign_id || creative.campaign_name ? "Selected campaign" : "Not selected")
  );
}

function displayAdSetName(creative: Creative, adSetNamesById?: ReadonlyMap<string, string>) {
  const lookupName = creative.adset_id ? adSetNamesById?.get(creative.adset_id) : undefined;
  return (
    lookupName ??
    readablePlacementName(creative.adset_name, creative.adset_id) ??
    (creative.adset_id || creative.adset_name ? "Selected ad set" : "Not selected")
  );
}

type ScheduleItem = {
  id: string;
  status?: string;
  effective_status?: string;
  configured_status?: string;
  start_time?: string | null;
  end_time?: string | null;
  stop_time?: string | null;
};

function parseMetaDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMetaDate(value?: string | null) {
  const date = parseMetaDate(value);
  if (!date) return value ?? "";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function scheduleEndTime(item?: ScheduleItem | null) {
  return item?.end_time ?? item?.stop_time ?? null;
}

function scheduleHasEnded(item?: ScheduleItem | null) {
  const end = parseMetaDate(scheduleEndTime(item));
  return Boolean(end && end.getTime() <= Date.now());
}

function scheduleSummary(item?: ScheduleItem | null) {
  if (!item) return "";
  const status = item.effective_status ?? item.status ?? item.configured_status;
  const end = scheduleEndTime(item);
  const parts = [status, end ? `ends ${formatMetaDate(end)}` : "no end date", `ID ${item.id}`].filter(Boolean);
  return parts.join(" · ");
}

function campaignOptionLabel(campaign: MetaCampaign) {
  return `${campaign.name} (${scheduleSummary(campaign)})`;
}

function adSetOptionLabel(adSet: MetaAdSet) {
  return `${adSet.name} (${scheduleSummary(adSet)})`;
}

function placementScheduleIssue(campaign?: MetaCampaign, adSet?: MetaAdSet) {
  if (campaign && scheduleHasEnded(campaign)) {
    return `Selected campaign schedule ended ${formatMetaDate(scheduleEndTime(campaign))}. Choose another campaign or extend its schedule in Meta.`;
  }
  if (adSet && scheduleHasEnded(adSet)) {
    return `Selected ad set schedule ended ${formatMetaDate(scheduleEndTime(adSet))}. Choose another ad set or extend its schedule in Meta.`;
  }
  return null;
}

function missingLaunchDetails(creative: Creative): string[] {
  return [
    creative.ad_text?.trim() ? undefined : "text",
    creative.headline?.trim() ? undefined : "title",
    creative.cta_link?.trim() ? undefined : "ad link"
  ].filter((item): item is string => Boolean(item));
}

function launchPayloadForCreative(creative: Creative, placement: LaunchPlacement): LaunchRequest {
  return {
    ...placement,
    projectType: creative.project_type ?? "",
    adText: creative.ad_text ?? "",
    headline: creative.headline ?? "",
    headlineVariants: cleanTextSequence(creative.headline_variants ?? []),
    adTextVariants: cleanTextSequence(creative.ad_text_variants ?? []),
    ctaType: normalizeCtaType(creative.cta_type),
    ctaTypeVariants: normalizeCtaTypeSequence(creative.cta_type_variants ?? []),
    ctaLink: creative.cta_link ?? ""
  };
}

const placementOptions: Array<{ value: CreativeAssetPlacement; label: string }> = [
  { value: "feed", label: "Feeds" },
  { value: "stories_reels", label: "Stories and Reels" },
  { value: "horizontal", label: "Right column / Video feeds" },
  { value: "unknown", label: "Auto/default" },
  { value: "do_not_use", label: "Do not use" }
];

function placementLabel(value: CreativeAssetPlacement) {
  return placementOptions.find((option) => option.value === value)?.label ?? value;
}

function normalizedAssetStem(fileName?: string | null, fallback = "creative") {
  const rawStem = (fileName ?? fallback).replace(/\.[^.]+$/, "");
  return rawStem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9&]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;
}

function assetSetFromFileName(creative: Creative) {
  const key = normalizedAssetStem(creative.source_file_name, `creative_${creative.id}`);
  return {
    creativeGroupKey: key,
    creativeGroupName: key.replaceAll("_", " "),
    assetPlacement: creative.asset_placement
  };
}

function sizeToken(value?: string | null) {
  return normalizedAssetStem(value, "").split("_").find((part) => ["1x1", "4x5", "9x16", "16x9"].includes(part));
}

function hasMismatchedSetLabel(creative: Creative) {
  const assetSize = sizeToken(creative.source_file_name);
  const groupSize = sizeToken(creative.creative_group_key) ?? sizeToken(creative.creative_group_name);
  return Boolean(assetSize && groupSize && assetSize !== groupSize);
}

type CreativeGroupingPayload = {
  creativeGroupKey: string;
  creativeGroupName?: string | null;
  assetPlacement: CreativeAssetPlacement;
};

type CandidateAsset = {
  creative: Creative;
  group: CreativeGroup;
};

type PendingAssetTransfer = {
  target: Creative;
  source: Creative;
  sourceGroupName: string;
};

function refreshGroupPrimary(group: CreativeGroup): CreativeGroup {
  return {
    ...group,
    primary_creative: group.creatives.find((creative) => !isEmptyCreativeSlot(creative)) ?? group.creatives[0] ?? group.primary_creative
  };
}

function assignCreativeToGroup(creative: Creative, group: CreativeGroup, assetPlacement: CreativeAssetPlacement): Creative {
  return {
    ...creative,
    creative_group_key: group.group_key,
    creative_group_name: group.group_name,
    asset_placement: assetPlacement,
    grouping_status: "manual"
  };
}

function copyLaunchDetails(from: Creative, to: Creative): Creative {
  return {
    ...to,
    project_type: from.project_type,
    ad_text: from.ad_text,
    headline: from.headline,
    headline_variants: from.headline_variants ?? [],
    ad_text_variants: from.ad_text_variants ?? [],
    cta_type: from.cta_type,
    cta_type_variants: from.cta_type_variants ?? [],
    cta_link: from.cta_link,
    audience: from.audience,
    location: from.location,
    campaign_id: from.campaign_id,
    campaign_name: from.campaign_name,
    adset_id: from.adset_id,
    adset_name: from.adset_name
  };
}

function sameTextSequence(left?: string[] | null, right?: string[] | null) {
  const leftItems = left ?? [];
  const rightItems = right ?? [];
  return leftItems.length === rightItems.length && leftItems.every((item, index) => item === rightItems[index]);
}

function launchDetailsChanged(before: Creative, after: Creative) {
  return (
    before.project_type !== after.project_type ||
    before.ad_text !== after.ad_text ||
    before.headline !== after.headline ||
    !sameTextSequence(before.headline_variants, after.headline_variants) ||
    !sameTextSequence(before.ad_text_variants, after.ad_text_variants) ||
    before.cta_type !== after.cta_type ||
    !sameTextSequence(before.cta_type_variants, after.cta_type_variants) ||
    before.cta_link !== after.cta_link ||
    before.audience !== after.audience ||
    before.location !== after.location ||
    before.campaign_id !== after.campaign_id ||
    before.campaign_name !== after.campaign_name ||
    before.adset_id !== after.adset_id ||
    before.adset_name !== after.adset_name
  );
}

function createLocalEmptySlot(group: CreativeGroup, assetPlacement: CreativeAssetPlacement, tempId: number): Creative {
  const now = new Date().toISOString();
  return {
    ...group.primary_creative,
    id: tempId,
    source_file_id: `slot:local:${group.group_key}:${Math.abs(tempId)}`,
    source_file_name: `Empty ${placementLabel(assetPlacement)} slot`,
    creative_group_key: group.group_key,
    creative_group_name: group.group_name,
    asset_placement: assetPlacement,
    grouping_status: "manual",
    asset_id: null,
    asset_type: null,
    google_drive_url: null,
    preview_url: null,
    facebook_ad_id: null,
    created_at: now,
    updated_at: now,
    uploaded_at: null,
    launched_at: null
  };
}

function groupsWithDraftGroup(groups: CreativeGroup[], draftGroup?: CreativeGroup | null) {
  if (!draftGroup) return groups;
  const draftCreativeIds = new Set(draftGroup.creatives.filter((creative) => creative.id > 0).map((creative) => creative.id));
  const originalGroup = groups.find((group) => group.id === draftGroup.id);
  const removedDraftAssets =
    originalGroup?.creatives.filter((creative) => creative.id > 0 && !draftCreativeIds.has(creative.id) && !isEmptyCreativeSlot(creative)) ?? [];
  const merged = groups.map((group) => {
    if (group.id === draftGroup.id) return draftGroup;
    return {
      ...group,
      creatives: group.creatives.filter((creative) => !draftCreativeIds.has(creative.id))
    };
  });
  const groupsWithDraft = merged.some((group) => group.id === draftGroup.id) ? merged : [draftGroup, ...merged];
  if (!removedDraftAssets.length) return groupsWithDraft;
  return [
    ...groupsWithDraft,
    {
      ...draftGroup,
      id: `${draftGroup.id}:removed-assets`,
      primary_creative: removedDraftAssets[0],
      creatives: removedDraftAssets
    }
  ];
}

function AssetSummaryList({
  creatives,
  onPreview
}: {
  creatives: Creative[];
  onPreview?: (creative: Creative) => void;
}) {
  return (
    <div className="assetSummaryList">
      {creatives.map((creative) => (
        <div className={creative.asset_placement === "do_not_use" ? "assetSummaryRow muted" : "assetSummaryRow"} key={creative.id}>
          <span>{placementLabel(creative.asset_placement)}</span>
          <AssetNameButton creative={creative} onPreview={onPreview} />
        </div>
      ))}
    </div>
  );
}

function AssetManagementPanel({
  group,
  groups,
  disabled = false,
  groupingBusyId,
  slotBusyGroupId,
  onGroupingChange,
  onAddSlot,
  onChooseAsset,
  onRemoveAsset,
  onPreview
}: {
  group: CreativeGroup;
  groups: CreativeGroup[];
  disabled?: boolean;
  groupingBusyId?: number | null;
  slotBusyGroupId?: string | null;
  onGroupingChange?: (creative: Creative, payload: CreativeGroupingPayload) => Promise<void> | void;
  onAddSlot?: (group: CreativeGroup, assetPlacement: CreativeAssetPlacement) => Promise<void> | void;
  onChooseAsset?: (target: Creative, sourceCreativeId: number) => Promise<void> | void;
  onRemoveAsset?: (creative: Creative) => Promise<void> | void;
  onPreview?: (creative: Creative) => void;
}) {
  const [newSlotPlacement, setNewSlotPlacement] = useState<CreativeAssetPlacement>("feed");
  const [selectedAssetIds, setSelectedAssetIds] = useState<Record<number, string>>({});
  const [pendingTransfer, setPendingTransfer] = useState<PendingAssetTransfer | null>(null);
  const slotBusy = slotBusyGroupId === group.id;
  const emptySlotCount = group.creatives.filter(isEmptyCreativeSlot).length;
  const realAssetCount = group.creatives.length - emptySlotCount;
  const candidateAssets: CandidateAsset[] = groups.flatMap((item) =>
    item.creatives
      .filter(
        (creative) =>
          creative.notion_task_id === group.notion_task_id &&
          !isEmptyCreativeSlot(creative) &&
          creative.asset_id &&
          creative.asset_type
      )
      .map((creative) => ({ creative, group: item }))
  );

  function setSelectedAssetId(targetId: number, value: string) {
    setSelectedAssetIds((current) => ({
      ...current,
      [targetId]: value
    }));
  }

  async function useAssetHere(target: Creative, candidate: CandidateAsset) {
    await onChooseAsset?.(target, candidate.creative.id);
    setSelectedAssetId(target.id, "");
  }

  function requestUseAsset(target: Creative, candidate: CandidateAsset) {
    if (candidate.group.group_key !== group.group_key) {
      setPendingTransfer({
        target,
        source: candidate.creative,
        sourceGroupName: candidate.group.group_name
      });
      return;
    }

    void useAssetHere(target, candidate);
  }

  function chooseAsset(target: Creative, value: string) {
    setSelectedAssetId(target.id, value);
    const candidate = candidateAssets.find((item) => String(item.creative.id) === value);
    if (!candidate || candidate.creative.id === target.id) return;
    requestUseAsset(target, candidate);
  }

  return (
    <section className="assetManagerPanel">
      <div className="assetManagerHeader">
        <div>
          <span>Creative assets</span>
          <strong>Assets in this set</strong>
          <small>
            {realAssetCount} asset{realAssetCount === 1 ? "" : "s"}
            {emptySlotCount ? ` · ${emptySlotCount} empty slot${emptySlotCount === 1 ? "" : "s"}` : ""}
          </small>
        </div>
        <div className="assetManagerAddSlot">
          <label>
            <span>New slot</span>
            <select
              value={newSlotPlacement}
              disabled={disabled || slotBusy}
              aria-label="Placement role for new empty slot"
              onChange={(event) => setNewSlotPlacement(event.target.value as CreativeAssetPlacement)}
            >
              {placementOptions
                .filter((option) => option.value !== "do_not_use")
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="secondaryButton compact"
            disabled={disabled || slotBusy || !onAddSlot}
            onClick={() => void onAddSlot?.(group, newSlotPlacement)}
          >
            {slotBusy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            Add placement slot
          </button>
        </div>
      </div>

      <div className="assetManagerList">
        {group.creatives.map((creative) => {
          const selectedAssetId = selectedAssetIds[creative.id] ?? (isEmptyCreativeSlot(creative) ? "" : String(creative.id));
          const canChooseAnotherAsset = candidateAssets.some((candidate) => candidate.creative.id !== creative.id);
          const rowBusy = disabled || groupingBusyId === creative.id;

          return (
            <article className={creative.asset_placement === "do_not_use" ? "assetManagerCard muted" : "assetManagerCard"} key={creative.id}>
              <AssetPreviewTile creative={creative} onPreview={onPreview} />
              <div className="assetManagerBody">
                <div className="assetManagerName">
                  <span>{placementLabel(creative.asset_placement)}</span>
                  <AssetNameButton creative={creative} onPreview={onPreview} />
                  {isEmptyCreativeSlot(creative) ? <small>Empty slot</small> : null}
                </div>

                <label className="assetManagerField">
                  <span>Meta placement</span>
                  <select
                    aria-label={`Placement role for ${assetDisplayName(creative)}`}
                    value={creative.asset_placement}
                    disabled={rowBusy || !onGroupingChange}
                    onChange={(event) =>
                      void onGroupingChange?.(creative, {
                        creativeGroupKey: creative.creative_group_key,
                        creativeGroupName: creative.creative_group_name,
                        assetPlacement: event.target.value as CreativeAssetPlacement
                      })
                    }
                  >
                    {placementOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="assetManagerField">
                  <span>Choose asset</span>
                  <select
                    aria-label={`Choose asset for ${placementLabel(creative.asset_placement)}`}
                    value={selectedAssetId}
                    disabled={rowBusy || !canChooseAnotherAsset}
                    onChange={(event) => chooseAsset(creative, event.target.value)}
                  >
                    {isEmptyCreativeSlot(creative) ? (
                      <option value="">{candidateAssets.length ? "Choose asset" : "No available assets"}</option>
                    ) : null}
                    {candidateAssets
                      .map((candidate) => {
                        const isInAnotherSet = candidate.group.group_key !== group.group_key;
                        const isCurrentAsset = candidate.creative.id === creative.id;
                        return (
                          <option key={candidate.creative.id} value={String(candidate.creative.id)}>
                            {placementLabel(candidate.creative.asset_placement)} - {assetDisplayName(candidate.creative)}
                            {isCurrentAsset ? " - current" : ""}
                            {isInAnotherSet ? ` - already in ${candidate.group.group_name}` : ""}
                          </option>
                        );
                      })}
                  </select>
                </label>

                <div className="assetManagerActions">
                  <button
                    type="button"
                    className="secondaryButton compact dangerButton"
                    disabled={rowBusy || !onRemoveAsset}
                    onClick={() => void onRemoveAsset?.(creative)}
                  >
                    <Trash2 size={14} />
                    {isEmptyCreativeSlot(creative) ? "Remove slot" : "Remove from set"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {pendingTransfer ? (
        <div className="assetTransferWarningOverlay" role="dialog" aria-modal="true" aria-label="Move asset warning">
          <div className="assetTransferWarning">
            <div>
              <span>Asset already used</span>
              <strong>Move this asset to the current creative set?</strong>
              <p>
                <b>{assetDisplayName(pendingTransfer.source)}</b> is currently in <b>{pendingTransfer.sourceGroupName}</b>. If you continue,
                it will be removed from that creative set and used here instead.
              </p>
            </div>
            <div className="assetTransferActions">
              <button
                type="button"
                className="secondaryButton compact"
                onClick={() => {
                  setSelectedAssetId(pendingTransfer.target.id, "");
                  setPendingTransfer(null);
                }}
              >
                Keep it there
              </button>
              <button
                type="button"
                className="primaryButton compact"
                disabled={disabled}
                onClick={() => {
                  const transfer = pendingTransfer;
                  setPendingTransfer(null);
                  void useAssetHere(transfer.target, { creative: transfer.source, group });
                }}
              >
                Move asset here
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function groupPrimaryCreative(group: CreativeGroup) {
  return group.primary_creative ?? group.creatives[0];
}

function isEmptyCreativeSlot(creative: Creative) {
  return creative.source_file_id.startsWith("slot:") || !creative.asset_id;
}

function missingGroupLaunchDetails(group: CreativeGroup): string[] {
  return missingLaunchDetails(groupPrimaryCreative(group));
}

function launchPayloadForGroup(group: CreativeGroup, placement: LaunchPlacement): LaunchRequest {
  return launchPayloadForCreative(groupPrimaryCreative(group), placement);
}

function groupMatchesSearch(
  group: CreativeGroup,
  search: string,
  campaignNamesById?: ReadonlyMap<string, string>,
  adSetNamesById?: ReadonlyMap<string, string>
) {
  if (!search) return true;
  const primary = groupPrimaryCreative(group);
  return [
    group.group_name,
    group.group_key,
    group.status,
    group.grouping_status,
    primary.project_type,
    primary.ad_text,
    primary.headline,
    primary.cta_type,
    primary.cta_link,
    displayCampaignName(primary, campaignNamesById),
    displayAdSetName(primary, adSetNamesById),
    ...group.creatives.flatMap((creative) => [
      creative.source_file_name,
      creative.asset_type,
      creative.asset_placement,
      creative.asset_id,
      creative.facebook_ad_id
    ])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function errorNoticeBody(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("creativeid") || normalized.includes("creative id")) {
    return "Поле Creative ID має бути числом. Перевір налаштування креативу.";
  }
  return message;
}

function ErrorNotice({ message, title = "Помилка при збереженні" }: { message: string; title?: string }) {
  const [expanded, setExpanded] = useState(false);
  const body = errorNoticeBody(message);

  return (
    <div className="notice errorNotice" role="alert">
      <AlertCircle size={20} />
      <div className="noticeContent">
        <strong>{title}</strong>
        <p>{body}</p>
        {expanded ? <code>{message}</code> : null}
      </div>
      <button type="button" className="secondaryButton compact noticeAction" onClick={() => setExpanded((current) => !current)}>
        {expanded ? "Сховати" : "Детальніше"}
      </button>
    </div>
  );
}

function SuccessNotice({ message }: { message: string }) {
  return (
    <div className="notice success">
      <Check size={18} />
      {message}
    </div>
  );
}

function CopyTextStack({
  label,
  addLabel,
  primary,
  variants,
  rows = 1,
  placeholder,
  disabled,
  onPrimaryChange,
  onVariantsChange
}: {
  label: string;
  addLabel: string;
  primary: string;
  variants: string[];
  rows?: number;
  placeholder?: string;
  disabled: boolean;
  onPrimaryChange: (value: string) => void;
  onVariantsChange: (values: string[]) => void;
}) {
  const updateVariant = (index: number, value: string) => {
    onVariantsChange(variants.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };
  const removeVariant = (index: number) => {
    onVariantsChange(variants.filter((_, itemIndex) => itemIndex !== index));
  };
  const isTextarea = rows > 1;

  return (
    <section className="copyFieldGroup">
      <div className="copyFieldHeader">
        <span>{label}</span>
        <button type="button" className="secondaryButton compact" onClick={() => onVariantsChange([...variants, ""])} disabled={disabled}>
          <Plus size={14} />
          {addLabel}
        </button>
      </div>
      <div className="copyFieldList">
        <label className="fieldGroup copyFieldItem">
          <span>{label} 1</span>
          {isTextarea ? (
            <textarea value={primary} onChange={(event) => onPrimaryChange(event.target.value)} rows={rows} disabled={disabled} />
          ) : (
            <input value={primary} onChange={(event) => onPrimaryChange(event.target.value)} placeholder={placeholder} disabled={disabled} />
          )}
        </label>
        {variants.map((value, index) => (
          <label className="fieldGroup copyFieldItem removableCopyField" key={`${label}-${index}`}>
            <span>{label} {index + 2}</span>
            {isTextarea ? (
              <textarea value={value} onChange={(event) => updateVariant(index, event.target.value)} rows={rows} disabled={disabled} />
            ) : (
              <input value={value} onChange={(event) => updateVariant(index, event.target.value)} disabled={disabled} />
            )}
            <button type="button" className="iconButton copyFieldRemove" onClick={() => removeVariant(index)} aria-label={`Remove ${label} ${index + 2}`} disabled={disabled}>
              <Trash2 size={15} />
            </button>
          </label>
        ))}
      </div>
    </section>
  );
}

function CtaStack({
  primary,
  variants,
  disabled,
  onPrimaryChange,
  onVariantsChange
}: {
  primary: string;
  variants: string[];
  disabled: boolean;
  onPrimaryChange: (value: string) => void;
  onVariantsChange: (values: string[]) => void;
}) {
  const normalizedPrimary = normalizeCtaType(primary);
  const normalizedVariants = normalizeCtaTypeSequence(variants);
  const addable = normalizedPrimary;
  const updateVariant = (index: number, value: string) => {
    onVariantsChange(normalizeCtaTypeSequence(normalizedVariants.map((item, itemIndex) => (itemIndex === index ? value : item))));
  };
  const removeVariant = (index: number) => {
    onVariantsChange(normalizedVariants.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <section className="copyFieldGroup">
      <div className="copyFieldHeader">
        <span>CTA</span>
        <button
          type="button"
          className="secondaryButton compact"
          onClick={() => onVariantsChange(normalizeCtaTypeSequence([...normalizedVariants, addable]))}
          disabled={disabled || !addable}
        >
          <Plus size={14} />
          Add CTA
        </button>
      </div>
      <div className="copyFieldList">
        <label className="fieldGroup copyFieldItem">
          <span>CTA 1</span>
          <select value={normalizedPrimary} onChange={(event) => onPrimaryChange(event.target.value)} disabled={disabled}>
            {ctaTypes.map((type) => (
              <option key={type} value={type}>
                {formatCtaTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        {normalizedVariants.map((value, index) => (
          <label className="fieldGroup copyFieldItem removableCopyField" key={`cta-${index}`}>
            <span>CTA {index + 2}</span>
            <select value={value} onChange={(event) => updateVariant(index, event.target.value)} disabled={disabled}>
              {ctaTypes.map((type) => (
                <option key={type} value={type}>
                  {formatCtaTypeLabel(type)}
                </option>
              ))}
            </select>
            <button type="button" className="iconButton copyFieldRemove" onClick={() => removeVariant(index)} aria-label={`Remove CTA ${index + 2}`} disabled={disabled}>
              <Trash2 size={15} />
            </button>
          </label>
        ))}
      </div>
    </section>
  );
}

function BulkActionBar({
  selectedCount,
  visibleCount,
  allVisibleSelected,
  campaigns,
  busy,
  onToggleAll,
  onLaunch,
  onArchive
}: {
  selectedCount: number;
  visibleCount: number;
  allVisibleSelected: boolean;
  campaigns: MetaCampaign[];
  busy: boolean;
  onToggleAll: (checked: boolean) => void;
  onLaunch: (placement: LaunchPlacement) => Promise<void> | void;
  onArchive: () => Promise<void> | void;
}) {
  const [campaignId, setCampaignId] = useState("");
  const [adSetId, setAdSetId] = useState("");
  const [adSets, setAdSets] = useState<MetaAdSet[]>([]);
  const [adSetsLoading, setAdSetsLoading] = useState(false);
  const [placementError, setPlacementError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) {
      setAdSets([]);
      setAdSetId("");
      setPlacementError(null);
      return;
    }

    let active = true;
    setAdSetsLoading(true);
    setPlacementError(null);

    fetchAdSets(campaignId)
      .then((items) => {
        if (!active) return;
        setAdSets(items);
        setAdSetId((current) => (items.some((item) => item.id === current) ? current : ""));
      })
      .catch((error) => {
        if (!active) return;
        setPlacementError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setAdSetsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [campaignId]);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  const selectedAdSet = adSets.find((adSet) => adSet.id === adSetId);
  const scheduleIssue = placementScheduleIssue(selectedCampaign, selectedAdSet);
  const placementReady = Boolean(campaignId && adSetId && !scheduleIssue);

  return (
    <section className="bulkActionBar" aria-label="Selected creative actions">
      <label className="bulkSelectAll">
        <input
          type="checkbox"
          checked={allVisibleSelected}
          onChange={(event) => onToggleAll(event.target.checked)}
          disabled={busy || visibleCount === 0}
        />
        <span>{selectedCount} selected</span>
      </label>

      <label className="fieldGroup bulkField">
        <span>Campaign</span>
        <select
          value={campaignId}
          onChange={(event) => {
            setCampaignId(event.target.value);
            setAdSetId("");
          }}
          disabled={busy}
        >
          <option value="">Select campaign</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaignOptionLabel(campaign)}
            </option>
          ))}
        </select>
        {selectedCampaign ? <small className="fieldHint">{scheduleSummary(selectedCampaign)}</small> : null}
      </label>

      <label className="fieldGroup bulkField">
        <span>Ad set</span>
        <select
          value={adSetId}
          onChange={(event) => setAdSetId(event.target.value)}
          disabled={busy || adSetsLoading || !campaignId}
        >
          <option value="">
            {!campaignId ? "Select campaign first" : adSetsLoading ? "Loading ad sets..." : "Select ad set"}
          </option>
          {adSets.map((adSet) => (
            <option key={adSet.id} value={adSet.id}>
              {adSetOptionLabel(adSet)}
            </option>
          ))}
        </select>
        {selectedAdSet ? <small className="fieldHint">{scheduleSummary(selectedAdSet)}</small> : null}
      </label>

      <div className="bulkActions">
        <button
          type="button"
          className="primaryButton"
          disabled={busy || adSetsLoading || !placementReady}
          onClick={() =>
            void onLaunch({
              campaignId,
              campaignName: selectedCampaign?.name,
              adSetId,
              adSetName: selectedAdSet?.name
            })
          }
        >
          {busy ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
          Launch
        </button>
        <button type="button" className="secondaryButton dangerButton" disabled={busy} onClick={() => void onArchive()}>
          <Archive size={16} />
          Archive
        </button>
      </div>

      {scheduleIssue || placementError ? <div className="bulkError">{scheduleIssue ?? placementError}</div> : null}
    </section>
  );
}

function ConfirmModal({
  creative,
  group,
  groups = [],
  loading,
  saving = false,
  mode = "launch",
  onClose,
  onConfirm,
  onSave,
  onCommitAssetChanges,
  onPreview
}: {
  creative: Creative;
  group?: CreativeGroup;
  groups?: CreativeGroup[];
  loading: boolean;
  saving?: boolean;
  mode?: "launch" | "edit";
  onClose: () => void;
  onConfirm?: (payload: LaunchRequest) => Promise<void> | void;
  onSave?: (payload: CreativeUpdateRequest) => Promise<void> | void;
  onCommitAssetChanges?: (draftGroup: CreativeGroup) => Promise<CreativeGroup | void> | CreativeGroup | void;
  onPreview?: (creative: Creative) => void;
}) {
  const [draft, setDraft] = useState<CreativeDetailsDraft>(() => creativeToDetailsDraft(creative));
  const [assetGroupDraft, setAssetGroupDraft] = useState<CreativeGroup | null>(() => group ?? null);
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [adSets, setAdSets] = useState<MetaAdSet[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [adSetId, setAdSetId] = useState("");
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [adSetsLoading, setAdSetsLoading] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [assetsSaving, setAssetsSaving] = useState(false);
  const [placementError, setPlacementError] = useState<string | null>(null);
  const autoGenerateCreativeIdRef = useRef<number | null>(null);
  const generatingCopyRequestRef = useRef(false);
  const nextLocalSlotIdRef = useRef(-1);

  useEffect(() => {
    setDraft(creativeToDetailsDraft(creative));
  }, [creative]);

  useEffect(() => {
    setAssetGroupDraft(group ?? null);
    nextLocalSlotIdRef.current = -1;
  }, [group]);

  useEffect(() => {
    let active = true;
    setCampaignId("");
    setAdSetId("");
    setCampaignsLoading(true);
    setPlacementError(null);

    fetchCampaigns()
      .then((items) => {
        if (!active) return;
        setCampaigns(items);
        if (creative.campaign_id && items.some((campaign) => campaign.id === creative.campaign_id)) {
          setCampaignId(creative.campaign_id);
          setAdSetId(creative.adset_id ?? "");
        }
      })
      .catch((error) => {
        if (!active) return;
        setPlacementError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setCampaignsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [creative]);

  useEffect(() => {
    if (!campaignId) {
      setAdSets([]);
      setAdSetId("");
      return;
    }

    let active = true;
    setAdSetsLoading(true);
    setPlacementError(null);

    fetchAdSets(campaignId)
      .then((items) => {
        if (!active) return;
        setAdSets(items);
        setAdSetId((current) => (items.some((item) => item.id === current) ? current : ""));
      })
      .catch((error) => {
        if (!active) return;
        setPlacementError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setAdSetsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [campaignId]);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
  const selectedAdSet = adSets.find((adSet) => adSet.id === adSetId);
  const scheduleIssue = placementScheduleIssue(selectedCampaign, selectedAdSet);
  const placementReady = Boolean(campaignId && adSetId && !scheduleIssue);
  const visibleGroup = assetGroupDraft ?? group;
  const visibleGroups = groupsWithDraftGroup(groups, assetGroupDraft);
  const busy = loading || saving || generatingCopy || assetsSaving;
  const detailsReady = Boolean(
    draft.adText.trim() &&
      draft.headline.trim() &&
      draft.ctaLink.trim()
  );

  function savePayload(): CreativeUpdateRequest {
    const ctaType = normalizeCtaType(draft.ctaType);
    return {
      projectType: draft.projectType.trim() || null,
      adText: draft.adText.trim() || null,
      headline: draft.headline.trim() || null,
      headlineVariants: cleanTextSequence(draft.headlineVariants),
      adTextVariants: cleanTextSequence(draft.adTextVariants),
      ctaType,
      ctaTypeVariants: normalizeCtaTypeSequence(draft.ctaTypeVariants),
      ctaLink: draft.ctaLink.trim() || null,
      campaignId: campaignId || null,
      campaignName: campaignId ? selectedCampaign?.name ?? creative.campaign_name ?? null : null,
      adSetId: adSetId || null,
      adSetName: adSetId ? selectedAdSet?.name ?? creative.adset_name ?? null : null
    };
  }

  function updateAssetGroupDraft(updater: (current: CreativeGroup) => CreativeGroup) {
    setAssetGroupDraft((current) => {
      if (!current) return current;
      return refreshGroupPrimary(updater(current));
    });
    setPlacementError(null);
  }

  function updateLocalGrouping(target: Creative, payload: CreativeGroupingPayload) {
    updateAssetGroupDraft((current) => ({
      ...current,
      creatives: current.creatives.map((creative) =>
        creative.id === target.id
          ? {
              ...creative,
              creative_group_key: payload.creativeGroupKey,
              creative_group_name: payload.creativeGroupName ?? payload.creativeGroupKey.replaceAll("_", " "),
              asset_placement: payload.assetPlacement,
              grouping_status: "manual"
            }
          : creative
      )
    }));
  }

  function addLocalSlot(currentGroup: CreativeGroup, assetPlacement: CreativeAssetPlacement) {
    const baseGroup = assetGroupDraft ?? currentGroup;
    const nextSlot = createLocalEmptySlot(baseGroup, assetPlacement, nextLocalSlotIdRef.current--);
    setAssetGroupDraft(refreshGroupPrimary({ ...baseGroup, creatives: [...baseGroup.creatives, nextSlot] }));
    setPlacementError(null);
  }

  function chooseLocalAsset(target: Creative, sourceCreativeId: number) {
    if (target.id === sourceCreativeId) return;
    const source =
      assetGroupDraft?.creatives.find((creative) => creative.id === sourceCreativeId) ??
      groups.flatMap((item) => item.creatives).find((creative) => creative.id === sourceCreativeId);
    if (!source || !assetGroupDraft) return;

    const nextSource = copyLaunchDetails(target, assignCreativeToGroup(source, assetGroupDraft, target.asset_placement));
    updateAssetGroupDraft((current) => {
      const targetIndex = current.creatives.findIndex((creative) => creative.id === target.id);
      const nextCreatives = current.creatives.filter(
        (creative) => creative.id !== target.id && creative.id !== sourceCreativeId
      );
      const insertIndex = targetIndex >= 0 ? Math.min(targetIndex, nextCreatives.length) : nextCreatives.length;
      nextCreatives.splice(insertIndex, 0, nextSource);
      return { ...current, creatives: nextCreatives };
    });
  }

  function removeLocalAsset(target: Creative) {
    updateAssetGroupDraft((current) => ({
      ...current,
      creatives: current.creatives.filter((creative) => creative.id !== target.id)
    }));
  }

  async function commitAssetChanges() {
    if (!assetGroupDraft || !onCommitAssetChanges) return true;
    setAssetsSaving(true);
    setPlacementError(null);
    try {
      const committedGroup = await onCommitAssetChanges(assetGroupDraft);
      setAssetGroupDraft(committedGroup ?? null);
      return true;
    } catch (error) {
      setPlacementError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setAssetsSaving(false);
    }
  }

  async function saveDetails() {
    if (!onSave) return;
    try {
      await onSave(savePayload());
    } catch (error) {
      setPlacementError(error instanceof Error ? error.message : String(error));
      return;
    }
    const assetsSaved = await commitAssetChanges();
    if (!assetsSaved) return;
    if (mode === "edit") onClose();
  }

  async function confirmPlacement() {
    if (!onConfirm) return;

    if (!detailsReady) {
      setPlacementError("Fill in text, title, and ad link before launch.");
      return;
    }

    if (!campaignId || !adSetId) {
      setPlacementError("Choose a campaign and ad set before launch.");
      return;
    }

    if (scheduleIssue) {
      setPlacementError(scheduleIssue);
      return;
    }

    const assetsSaved = await commitAssetChanges();
    if (!assetsSaved) return;

    await onConfirm({
      campaignId,
      campaignName: selectedCampaign?.name,
      adSetId,
      adSetName: selectedAdSet?.name,
      projectType: draft.projectType.trim(),
      adText: draft.adText.trim(),
      headline: draft.headline.trim() || null,
      headlineVariants: cleanTextSequence(draft.headlineVariants),
      adTextVariants: cleanTextSequence(draft.adTextVariants),
      ctaType: normalizeCtaType(draft.ctaType),
      ctaTypeVariants: normalizeCtaTypeSequence(draft.ctaTypeVariants),
      ctaLink: draft.ctaLink.trim()
    });
  }

  function updateDraft(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setPlacementError(null);
  }

  async function generateCopy(auto = false) {
    if (generatingCopyRequestRef.current) return;

    generatingCopyRequestRef.current = true;
    setGeneratingCopy(true);
    setPlacementError(null);
    try {
      const suggestions = await generateCreativeCopySuggestions(creative.id, savePayload());
      setDraft((current) => {
        const generatedText = cleanTextList(suggestions.adTextVariants, 1)[0] || "";
        const generatedHeadline = cleanTextList([suggestions.headline ?? "", ...suggestions.headlineVariants], 1)[0] || "";
        const generatedCta = suggestions.ctaTypeVariants[0] ? normalizeCtaType(suggestions.ctaTypeVariants[0]) : normalizeCtaType(current.ctaType);
        const hasExistingCopy = Boolean(
          current.adText.trim() ||
            current.headline.trim() ||
            cleanTextSequence(current.adTextVariants).length ||
            cleanTextSequence(current.headlineVariants).length
        );
        const text = mergeGeneratedTextVariation(current.adText, current.adTextVariants, generatedText);
        const headline = mergeGeneratedTextVariation(current.headline, current.headlineVariants, generatedHeadline);
        const cta = mergeGeneratedCtaVariation(current.ctaType, current.ctaTypeVariants, generatedCta, !hasExistingCopy);

        return {
          ...current,
          adText: text.primary,
          headline: headline.primary,
          headlineVariants: headline.variants,
          adTextVariants: text.variants,
          ctaType: cta.primary,
          ctaTypeVariants: cta.variants
        };
      });
    } catch (error) {
      if (!auto) {
        setPlacementError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      generatingCopyRequestRef.current = false;
      setGeneratingCopy(false);
    }
  }

  useEffect(() => {
    if (autoGenerateCreativeIdRef.current === creative.id || generatingCopy) return;
    if (draft.adText.trim()) return;

    autoGenerateCreativeIdRef.current = creative.id;
    void generateCopy(true);
  }, [creative.id, draft.adText, draft.ctaLink, generatingCopy]);

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal creativeReviewModal">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">
              {group
                ? mode === "edit"
                  ? "Edit creative set"
                  : "Review & launch set"
                : mode === "edit"
                  ? "Edit creative"
                  : "Review & launch"}
            </p>
            <input
              className="modalTitleInput"
              aria-label="Project type"
              value={draft.projectType}
              onChange={(event) => updateDraft("projectType", event.target.value)}
              placeholder="Project type (optional)"
              disabled={busy}
            />
          </div>
          <button className="iconButton" onClick={onClose} aria-label="Close" disabled={busy}>
            <X size={18} />
          </button>
        </div>

        <div className="modalGrid">
          <div className="modalPreviewStack">
            {visibleGroup ? (
              <AssetManagementPanel
                group={visibleGroup}
                groups={visibleGroups}
                disabled={busy}
                onGroupingChange={updateLocalGrouping}
                onAddSlot={addLocalSlot}
                onChooseAsset={chooseLocalAsset}
                onRemoveAsset={removeLocalAsset}
                onPreview={onPreview}
              />
            ) : (
              <div className="singleAssetPreview">
                <AssetPreviewTile creative={creative} onPreview={onPreview} />
                <AssetNameButton creative={creative} onPreview={onPreview} />
              </div>
            )}
          </div>
          <div className="detailsForm">
            <section className="placementPanel">
              <div className="placementPanelHeader">
                <div>
                  <span>Launch placement</span>
                  <strong>{placementReady ? "Ready to launch" : "Choose campaign and ad set"}</strong>
                </div>
                <StatusChip value={placementReady ? "ready" : "draft"} />
              </div>
              <label className="fieldGroup">
                <span>Campaign</span>
                <select
                  value={campaignId}
                  onChange={(event) => {
                    setCampaignId(event.target.value);
                    setAdSetId("");
                  }}
                  disabled={busy || campaignsLoading}
                >
                  <option value="">{campaignsLoading ? "Loading campaigns..." : "Select campaign"}</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaignOptionLabel(campaign)}
                    </option>
                  ))}
                </select>
                {selectedCampaign ? <small className="fieldHint">{scheduleSummary(selectedCampaign)}</small> : null}
              </label>
              <label className="fieldGroup">
                <span>Ad set</span>
                <select
                  value={adSetId}
                  onChange={(event) => setAdSetId(event.target.value)}
                  disabled={busy || adSetsLoading || !campaignId}
                >
                  <option value="">
                    {!campaignId ? "Select campaign first" : adSetsLoading ? "Loading ad sets..." : "Select ad set"}
                  </option>
                  {adSets.map((adSet) => (
                    <option key={adSet.id} value={adSet.id}>
                      {adSetOptionLabel(adSet)}
                    </option>
                  ))}
                </select>
                {selectedAdSet ? <small className="fieldHint">{scheduleSummary(selectedAdSet)}</small> : null}
              </label>
            </section>

            <section className="aiCopyPanel">
              <div>
                <span>AI copy</span>
                <strong>
                  {1 + cleanTextSequence(draft.adTextVariants).length} text · {1 + cleanTextSequence(draft.headlineVariants).length} title ·{" "}
                  {1 + normalizeCtaTypeSequence(draft.ctaTypeVariants).length} CTA
                </strong>
              </div>
              <button type="button" className="primaryButton generateCopyButton" onClick={() => void generateCopy()} disabled={busy}>
                {generatingCopy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                {generatingCopy ? "Generating..." : "Generate copy"}
              </button>
            </section>

            <CopyTextStack
              label="Text"
              addLabel="Add text"
              primary={draft.adText}
              variants={draft.adTextVariants}
              rows={3}
              onPrimaryChange={(value) => updateDraft("adText", value)}
              onVariantsChange={(values) => {
                setDraft((current) => ({ ...current, adTextVariants: values }));
                setPlacementError(null);
              }}
              disabled={busy}
            />
            <CopyTextStack
              label="Title"
              addLabel="Add title"
              primary={draft.headline}
              variants={draft.headlineVariants}
              placeholder="Відгукуйся на вакансію"
              onPrimaryChange={(value) => updateDraft("headline", value)}
              onVariantsChange={(values) => {
                setDraft((current) => ({ ...current, headlineVariants: values }));
                setPlacementError(null);
              }}
              disabled={busy}
            />
            <CtaStack
              primary={draft.ctaType}
              variants={draft.ctaTypeVariants}
              onPrimaryChange={(value) => {
                const nextCtaType = normalizeCtaType(value);
                setDraft((current) => ({
                  ...current,
                  ctaType: nextCtaType,
                  ctaTypeVariants: normalizeCtaTypeSequence(current.ctaTypeVariants)
                }));
                setPlacementError(null);
              }}
              onVariantsChange={(values) => {
                setDraft((current) => ({ ...current, ctaTypeVariants: values }));
                setPlacementError(null);
              }}
              disabled={busy}
            />
            <label className="fieldGroup">
              <span>Ad link</span>
              <input
                type="url"
                value={draft.ctaLink}
                onChange={(event) => updateDraft("ctaLink", event.target.value)}
                disabled={busy}
              />
            </label>
          </div>
        </div>

        {scheduleIssue || placementError ? (
          <div className="modalNotice">
            <AlertCircle size={16} />
            {scheduleIssue ?? placementError}
          </div>
        ) : null}

        <div className="modalActions">
          <button className="secondaryButton" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {onSave ? (
            <button
              className={mode === "edit" ? "primaryButton" : "secondaryButton"}
              onClick={() => void saveDetails()}
              disabled={busy || campaignsLoading || adSetsLoading}
            >
              {saving || assetsSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Save
            </button>
          ) : null}
          {mode === "launch" ? (
            <button
              className="primaryButton"
              onClick={() => void confirmPlacement()}
              disabled={busy || campaignsLoading || adSetsLoading || !placementReady || !detailsReady}
            >
              {loading || assetsSaving ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
              Launch ad
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CreativeRow({
  creative,
  onEdit,
  onLaunch,
  onRestore,
  restoreBusy = false,
  selectable = false,
  selected = false,
  onSelectChange,
  campaignNamesById,
  adSetNamesById
}: {
  creative: Creative;
  onEdit?: (creative: Creative) => void;
  onLaunch?: (creative: Creative) => void;
  onRestore?: (creative: Creative) => void;
  restoreBusy?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (creativeId: number, checked: boolean) => void;
  campaignNamesById?: ReadonlyMap<string, string>;
  adSetNamesById?: ReadonlyMap<string, string>;
}) {
  const creativeName = creative.source_file_name ?? creative.project_type ?? `Creative ${creative.id}`;
  const hasCampaign = Boolean(creative.campaign_id || creative.campaign_name);
  const hasAdSet = Boolean(creative.adset_id || creative.adset_name);
  const setupReady = hasCampaign && hasAdSet;
  const campaignLabel = displayCampaignName(creative, campaignNamesById);
  const adSetLabel = displayAdSetName(creative, adSetNamesById);
  const textCount = 1 + cleanTextSequence(creative.ad_text_variants ?? []).length;
  const titleCount = 1 + cleanTextSequence(creative.headline_variants ?? []).length;
  const ctaCount = 1 + normalizeCtaTypeSequence(creative.cta_type_variants ?? []).length;

  return (
    <article className={["creativeRow", selectable ? "selectable" : "", selected ? "selected" : ""].filter(Boolean).join(" ")}>
      {selectable ? (
        <label className="creativeSelect" aria-label={`Select ${creativeName}`}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectChange?.(creative.id, event.target.checked)}
          />
        </label>
      ) : null}
      <CreativePreview creative={creative} />
      <div className="creativeMain">
        <div className="creativeKicker">
          <span>Creative #{creative.id}</span>
          <span>{creative.asset_type ?? "asset"}</span>
        </div>
        <div className="creativeTitleLine">
          <h3>{creativeName}</h3>
          <UploadStatusBadge creative={creative} />
        </div>
        {creative.project_type && creative.project_type !== creativeName ? (
          <p className="creativeFileName">{creative.project_type}</p>
        ) : null}
        {creative.headline ? <p className="creativeFileName">{creative.headline}</p> : null}
        <p className="adText">{creative.ad_text || "No primary text yet."}</p>
        <div className="creativeMetaGrid">
          <MetadataItem label="Texts" value={`${textCount} variant${textCount === 1 ? "" : "s"}`} />
          <MetadataItem label="Titles" value={`${titleCount} variant${titleCount === 1 ? "" : "s"}`} />
          <MetadataItem label="CTA" value={`${formatCtaTypeLabel(creative.cta_type)}${ctaCount > 1 ? ` +${ctaCount - 1}` : ""}`} />
          <MetadataItem label="Ad link" value={creative.cta_link ? "Added" : "Missing"} />
        </div>
      </div>
      <div className="creativeContext">
        <div className={setupReady ? "campaignSetupSummary" : "campaignSetupSummary missing"}>
          <span>Campaign</span>
          <strong title={campaignLabel}>{campaignLabel}</strong>
          <span>Ad set</span>
          <strong title={adSetLabel}>{adSetLabel}</strong>
        </div>
        <div className="rowActions">
          {onEdit ? (
            <button className="secondaryButton compact" onClick={() => onEdit(creative)}>
              <Pencil size={16} />
              Edit
            </button>
          ) : null}
          {onLaunch ? (
            <button className="primaryButton compact" onClick={() => onLaunch(creative)}>
              <Play size={16} />
              {setupReady ? "Review & launch" : "Select campaign & ad set"}
            </button>
          ) : null}
          {onRestore ? (
            <button className="primaryButton compact" onClick={() => void onRestore(creative)} disabled={restoreBusy}>
              {restoreBusy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              Move to Ready
            </button>
          ) : null}
          {!onLaunch && !onRestore && creative.status === "launched" ? (
            <span className="stateIcon success" aria-label="In use">
              <Check size={18} />
            </span>
          ) : !onLaunch && !onRestore ? (
            <span className="stateIcon warning" aria-label="Needs attention">
              <AlertCircle size={18} />
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function CreativeGroupRow({
  group,
  onEdit,
  onLaunch,
  selectable = false,
  selected = false,
  onSelectChange,
  onPreview,
  campaignNamesById,
  adSetNamesById
}: {
  group: CreativeGroup;
  onEdit?: (group: CreativeGroup) => void;
  onLaunch?: (group: CreativeGroup) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (groupId: string, checked: boolean) => void;
  onPreview?: (creative: Creative) => void;
  campaignNamesById?: ReadonlyMap<string, string>;
  adSetNamesById?: ReadonlyMap<string, string>;
}) {
  const primary = groupPrimaryCreative(group);
  const creativeName = group.group_name || primary.project_type || `Creative set ${group.id}`;
  const hasCampaign = Boolean(primary.campaign_id || primary.campaign_name);
  const hasAdSet = Boolean(primary.adset_id || primary.adset_name);
  const setupReady = hasCampaign && hasAdSet;
  const campaignLabel = displayCampaignName(primary, campaignNamesById);
  const adSetLabel = displayAdSetName(primary, adSetNamesById);
  const textCount = 1 + cleanTextSequence(primary.ad_text_variants ?? []).length;
  const titleCount = 1 + cleanTextSequence(primary.headline_variants ?? []).length;
  const ctaCount = 1 + normalizeCtaTypeSequence(primary.cta_type_variants ?? []).length;
  const emptySlotCount = group.creatives.filter(isEmptyCreativeSlot).length;
  const uploadedAssetCount = group.creatives.length - emptySlotCount;
  const assetSummary = `${uploadedAssetCount} asset${uploadedAssetCount === 1 ? "" : "s"}${
    emptySlotCount ? `, ${emptySlotCount} empty slot${emptySlotCount === 1 ? "" : "s"}` : ""
  }`;

  return (
    <article className={["creativeRow creativeGroupRow", selectable ? "selectable" : "", selected ? "selected" : ""].filter(Boolean).join(" ")}>
      {selectable ? (
        <label className="creativeSelect" aria-label={`Select ${creativeName}`}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectChange?.(group.id, event.target.checked)}
          />
        </label>
      ) : null}
      <div className="groupPreviewStack">
        {group.creatives.slice(0, 3).map((creative) => (
          <CreativePreview creative={creative} key={creative.id} />
        ))}
      </div>
      <div className="creativeMain">
        <div className="creativeKicker">
          <span>Creative set</span>
          <span>{assetSummary}</span>
          <span>{group.grouping_status === "manual" ? "edited" : "auto grouped"}</span>
        </div>
        <div className="creativeTitleLine">
          <h3>{creativeName}</h3>
          <StatusChip value={group.status} />
        </div>
        <p className="creativeFileName">{group.group_key}</p>
        {primary.headline ? <p className="creativeFileName">{primary.headline}</p> : null}
        <p className="adText">{primary.ad_text || "No primary text yet."}</p>
        <div className="creativeMetaGrid">
          <MetadataItem label="Texts" value={`${textCount} variant${textCount === 1 ? "" : "s"}`} />
          <MetadataItem label="Titles" value={`${titleCount} variant${titleCount === 1 ? "" : "s"}`} />
          <MetadataItem label="CTA" value={`${formatCtaTypeLabel(primary.cta_type)}${ctaCount > 1 ? ` +${ctaCount - 1}` : ""}`} />
          <MetadataItem label="Ad link" value={primary.cta_link ? "Added" : "Missing"} />
        </div>
        <AssetSummaryList creatives={group.creatives} onPreview={onPreview} />
      </div>
      <div className="creativeContext">
        <div className={setupReady ? "campaignSetupSummary" : "campaignSetupSummary missing"}>
          <span>Campaign</span>
          <strong title={campaignLabel}>{campaignLabel}</strong>
          <span>Ad set</span>
          <strong title={adSetLabel}>{adSetLabel}</strong>
        </div>
        <div className="rowActions">
          {onEdit ? (
            <button className="secondaryButton compact" onClick={() => onEdit(group)}>
              <Pencil size={16} />
              Edit
            </button>
          ) : null}
          {onLaunch ? (
            <button className="primaryButton compact" onClick={() => onLaunch(group)}>
              <Play size={16} />
              {setupReady ? "Review & launch set" : "Select campaign & ad set"}
            </button>
          ) : (
            <span className="stateIcon warning" aria-label="Needs attention">
              <AlertCircle size={18} />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function SpecialCategoryCountryPicker({
  selected,
  disabled,
  onChange
}: {
  selected: LocationSelection[];
  disabled: boolean;
  onChange: (countries: LocationSelection[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MetaTargetingLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchCountries = useCallback(async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const countries = await searchTargetingLocations({
        query: trimmed,
        locationTypes: ["country"],
        limit: 12
      });
      setResults(countries);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (disabled) return;
    const timer = window.setTimeout(() => {
      void searchCountries(query);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [disabled, query, searchCountries]);

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchCountries(query);
  }

  function addCountry(country: MetaTargetingLocation) {
    const next = locationFromMeta(country);
    onChange(uniqueLocations([...selected, { ...next, type: "country", countryCode: countryCodeFromLocation(next) }]));
  }

  function removeCountry(country: LocationSelection) {
    onChange(selected.filter((item) => countryCodeFromLocation(item) !== countryCodeFromLocation(country)));
  }

  return (
    <div className="specialCountryPicker">
      <div className="subsectionHeader compactHeader">
        <h3>Special category countries</h3>
        <span>Declaration only, not ad delivery targeting</span>
      </div>

      <form className="locationSearch" onSubmit={runSearch}>
        <label className="fieldGroup">
          <span>Search Meta countries</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ukraine, United States, Poland"
            disabled={disabled}
          />
        </label>
        <button className="secondaryButton" disabled={disabled || loading}>
          {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          Search
        </button>
      </form>

      {error ? <div className="inlineError">{error}</div> : null}

      {results.length ? (
        <div className="locationResults">
          {results.map((country) => {
            const code = countryCodeFromLocation(locationFromMeta(country));
            return (
              <article key={`${country.type}:${country.key}`} className="locationResult">
                <div>
                  <strong>{country.name}</strong>
                  <span>{code}</span>
                </div>
                <div className="locationActions">
                  <button type="button" className="secondaryButton compact" onClick={() => addCountry(country)} disabled={disabled}>
                    Add
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {selected.length ? (
        <div className="locationChipList countryChipList">
          {selected.map((country) => (
            <span className="locationChip countryChip" key={countryCodeFromLocation(country)}>
              <span>
                <strong>{locationLabel(country)}</strong>
                <small>{countryCodeFromLocation(country)}</small>
              </span>
              <button type="button" onClick={() => removeCountry(country)} disabled={disabled} aria-label={`Remove ${country.name}`}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className="inlineEmpty compact">No special category countries selected.</div>
      )}
    </div>
  );
}

function CampaignFieldGroups({
  draft,
  setDraft,
  disabled,
  autoFocusName = false
}: {
  draft: CampaignFormState;
  setDraft: Dispatch<SetStateAction<CampaignFormState>>;
  disabled: boolean;
  autoFocusName?: boolean;
}) {
  const update = <Key extends keyof CampaignFormState>(field: Key, value: CampaignFormState[Key]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };
  const selectedCategories = categoryList(draft.specialAdCategories);
  const hasSpecialCategory = selectedCategories.length > 0;

  function toggleSpecialCategory(category: string) {
    const next = selectedCategories.includes(category)
      ? selectedCategories.filter((item) => item !== category)
      : [...selectedCategories, category];
    update("specialAdCategories", next.join(", "));
  }

  function clearSpecialCategories() {
    setDraft((current) => ({
      ...current,
      specialAdCategories: "",
      specialAdCategoryCountries: "",
      specialAdCategoryCountrySelections: []
    }));
  }

  function updateSpecialCountries(countries: LocationSelection[]) {
    const next = uniqueLocations(countries.map((country) => ({ ...country, type: "country", countryCode: countryCodeFromLocation(country) })));
    setDraft((current) => ({
      ...current,
      specialAdCategoryCountrySelections: next,
      specialAdCategoryCountries: next.map(countryCodeFromLocation).join(", ")
    }));
  }

  return (
    <div className="campaignFieldStack">
      <section className="formSubsection">
        <div className="subsectionHeader">
          <h3>Campaign basics</h3>
        </div>
        <div className="formGrid two">
          <label className="fieldGroup wideField">
            <span>Campaign name</span>
            <input
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              disabled={disabled}
              autoFocus={autoFocusName}
            />
          </label>
          <label className="fieldGroup">
            <span>Meta status</span>
            <select value={draft.metaStatus} onChange={(event) => update("metaStatus", event.target.value)} disabled={disabled}>
              {metaStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldGroup">
            <span>Objective</span>
            <select value={draft.objective} onChange={(event) => update("objective", event.target.value)} disabled={disabled}>
              {campaignObjectives.map((objective) => (
                <option key={objective} value={objective}>
                  {objective}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldGroup">
            <span>Buying type</span>
            <select value={draft.buyingType} onChange={(event) => update("buyingType", event.target.value)} disabled={disabled}>
              {buyingTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldGroup">
            <span>Setup mode</span>
            <select
              value={draft.campaignSettingsMode}
              onChange={(event) => update("campaignSettingsMode", event.target.value)}
              disabled={disabled}
            >
              {campaignSettingsModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldGroup">
            <span>Budget strategy</span>
            <select value={draft.budgetStrategy} onChange={(event) => update("budgetStrategy", event.target.value)} disabled={disabled}>
              {budgetStrategies.map((strategy) => (
                <option key={strategy.value} value={strategy.value}>
                  {strategy.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {draft.budgetStrategy === "CAMPAIGN" ? (
        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>Campaign budget</h3>
            <span>Used across all ad sets</span>
          </div>
          <div className="formGrid four">
            <label className="fieldGroup">
              <span>Daily budget, USD</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={draft.campaignDailyBudgetMinor}
                onChange={(event) => update("campaignDailyBudgetMinor", event.target.value)}
                disabled={disabled}
                placeholder="100"
              />
            </label>
            <label className="fieldGroup">
              <span>Lifetime budget, USD</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={draft.campaignLifetimeBudgetMinor}
                onChange={(event) => update("campaignLifetimeBudgetMinor", event.target.value)}
                disabled={disabled}
                placeholder="3000"
              />
            </label>
            <label className="fieldGroup">
              <span>Spend cap, USD</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={draft.spendCapMinor}
                onChange={(event) => update("spendCapMinor", event.target.value)}
                disabled={disabled}
                placeholder="Optional"
              />
            </label>
            <label className="fieldGroup">
              <span>Bid strategy</span>
              <select value={draft.bidStrategy} onChange={(event) => update("bidStrategy", event.target.value)} disabled={disabled}>
                {bidStrategies.map((strategy) => (
                  <option key={strategy || "default"} value={strategy}>
                    {strategy || "Meta default"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      <section className="formSubsection">
        <div className="subsectionHeader">
          <h3>Meta special ad category</h3>
          <span>Separate from ad set delivery locations</span>
        </div>
        <div className="optionGrid specialCategoryGrid">
          <button
            type="button"
            className={!hasSpecialCategory ? "optionChip selected" : "optionChip"}
            onClick={clearSpecialCategories}
            disabled={disabled}
          >
            No special category
          </button>
          {specialAdCategoryOptions.map((category) => (
            <button
              type="button"
              key={category.value}
              className={selectedCategories.includes(category.value) ? "optionChip selected" : "optionChip"}
              onClick={() => toggleSpecialCategory(category.value)}
              disabled={disabled}
            >
              {category.label}
            </button>
          ))}
        </div>
        {hasSpecialCategory ? (
          <SpecialCategoryCountryPicker
            selected={draft.specialAdCategoryCountrySelections}
            disabled={disabled}
            onChange={updateSpecialCountries}
          />
        ) : null}
      </section>
    </div>
  );
}

function CampaignCreateModal({
  loading,
  onClose,
  onSubmit
}: {
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: CampaignDraftPayload & { name: string }) => void;
}) {
  const [draft, setDraft] = useState<CampaignFormState>(defaultCampaignFormState());
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setError(null);
      onSubmit(buildCampaignPayload(draft));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    }
  }

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <form className="modal campaignModal" onSubmit={submit}>
        <div className="modalHeader">
          <div>
            <p className="eyebrow">New campaign draft</p>
            <h2>Create campaign</h2>
          </div>
          <button type="button" className="iconButton" onClick={onClose} aria-label="Close" disabled={loading}>
            <X size={18} />
          </button>
        </div>

        <CampaignFieldGroups draft={draft} setDraft={setDraft} disabled={loading} autoFocusName />

        {error ? (
          <div className="modalNotice">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : null}

        <div className="modalActions">
          <button type="button" className="secondaryButton" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="primaryButton" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            Create campaign
          </button>
        </div>
      </form>
    </div>
  );
}

function CampaignDraftListView({ ready, onOpen }: { ready: boolean; onOpen: (id: number) => void }) {
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [structureCounts, setStructureCounts] = useState<Record<number, { adsets: number; ads: number }>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingAdSetId, setCreatingAdSetId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const items = await fetchCampaignDrafts();
      setDrafts(items);
      const detailPairs = await Promise.all(
        items.map(async (draft) => {
          try {
            const detail = await fetchCampaignDraft(draft.id);
            return [draft.id, { adsets: detail.adsets.length, ads: countAds(detail) }] as const;
          } catch {
            return [draft.id, { adsets: 0, ads: 0 }] as const;
          }
        })
      );
      setStructureCounts(Object.fromEntries(detailPairs));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCampaign(payload: CampaignDraftPayload & { name: string }) {
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const campaign = await createCampaignDraft(payload);
      setCreateOpen(false);
      setDrafts((current) => [campaign, ...current.filter((draft) => draft.id !== campaign.id)]);
      setStructureCounts((current) => ({ ...current, [campaign.id]: { adsets: 0, ads: 0 } }));
      setSuccess(`Campaign "${campaign.name}" saved. Add an ad set when you are ready.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setCreating(false);
    }
  }

  async function addAdSetFromList(draft: CampaignDraft) {
    setCreatingAdSetId(draft.id);
    setError(null);
    setSuccess(null);
    try {
      await createAdSetDraft(draft.id, defaultAdSetPayload((structureCounts[draft.id]?.adsets ?? 0) + 1));
      onOpen(draft.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setCreatingAdSetId(null);
    }
  }

  return (
    <main className="content">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Campaign Builder</p>
          <h1>Campaign drafts</h1>
        </div>
        <div className="headerActions">
          <button className="secondaryButton" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Refresh
          </button>
          <button className="primaryButton" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Create campaign
          </button>
        </div>
      </header>

      <section className="summaryBand">
        <div>
          <span>{drafts.length}</span>
          <p>campaign drafts</p>
        </div>
        <div>
          <span>{drafts.filter((draft) => draft.status === "draft").length}</span>
          <p>open drafts</p>
        </div>
        <div>
          <span>Meta</span>
          <p>Publish flow coming next</p>
        </div>
      </section>

      {error ? <ErrorNotice message={error} /> : null}
      {success ? <SuccessNotice message={success} /> : null}

      <section className="campaignTable">
        <div className="campaignTableHeader campaignTableGrid">
          <span>Name</span>
          <span>Objective</span>
          <span>Status</span>
          <span>Structure</span>
          <span>Next step</span>
          <span>Updated</span>
        </div>
        {loading ? (
          <div className="emptyState">
            <Loader2 className="spin" />
            Loading campaign drafts
          </div>
        ) : drafts.length === 0 ? (
          <div className="emptyState">
            <Megaphone size={28} />
            No campaign drafts yet.
          </div>
        ) : (
          drafts.map((draft) => {
            const counts = structureCounts[draft.id] ?? { adsets: 0, ads: 0 };
            return (
            <article key={draft.id} className="campaignTableRow campaignTableGrid">
              <strong>{draft.name}</strong>
              <span>{draft.objective}</span>
              <span>
                <StatusChip value={draft.status} />
              </span>
              <span>
                {counts.adsets} ad sets · {counts.ads} creatives
              </span>
              <span className="rowActionCell">
                {counts.adsets === 0 ? (
                  <button className="primaryButton compact" onClick={() => addAdSetFromList(draft)} disabled={creatingAdSetId === draft.id}>
                    {creatingAdSetId === draft.id ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                    Add ad set
                  </button>
                ) : (
                  <button className="secondaryButton compact" onClick={() => onOpen(draft.id)}>
                    Open structure
                  </button>
                )}
              </span>
              <span>{formatDate(draft.updated_at)}</span>
            </article>
          );
          })
        )}
      </section>

      {createOpen ? (
        <CampaignCreateModal loading={creating} onClose={() => setCreateOpen(false)} onSubmit={submitCampaign} />
      ) : null}
    </main>
  );
}

function CampaignSettingsForm({
  campaign,
  saving,
  onSave,
  onError,
  onNext
}: {
  campaign: CampaignDraftTree;
  saving: boolean;
  onSave: (payload: CampaignDraftPayload) => Promise<boolean>;
  onError: (message: string) => void;
  onNext: () => void;
}) {
  const [draft, setDraft] = useState<CampaignFormState>(() => campaignToFormState(campaign));

  useEffect(() => {
    setDraft(campaignToFormState(campaign));
  }, [campaign]);

  async function save() {
    try {
      return await onSave(buildCampaignPayload(draft));
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : String(saveError));
      return false;
    }
  }

  async function saveAndNext() {
    const saved = await save();
    if (saved) onNext();
  }

  return (
    <section className="builderSection">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Campaign</p>
          <h2>Settings</h2>
        </div>
        <div className="headerActions">
          <StatusChip value={campaign.status} />
          <button className="secondaryButton" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Save changes
          </button>
        </div>
      </div>
      <CampaignFieldGroups draft={draft} setDraft={setDraft} disabled={saving} />
      <div className="stepActionBar">
        <button className="secondaryButton" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
          Save changes
        </button>
        <button className="primaryButton" onClick={() => void saveAndNext()} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : <ChevronRight size={16} />}
          Save & next
        </button>
      </div>
    </section>
  );
}

function AdDraftEditor({
  ad,
  saving,
  onSave,
  onError
}: {
  ad: AdDraftWithCreative;
  saving: boolean;
  onSave: (id: number, payload: AdDraftPayload) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<AdDraftFormState>(() => adDraftToFormState(ad));

  useEffect(() => {
    setDraft(adDraftToFormState(ad));
  }, [ad]);

  const update = <Key extends keyof AdDraftFormState>(field: Key, value: AdDraftFormState[Key]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  function save() {
    try {
      onSave(ad.id, buildAdDraftPayload(draft));
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }

  return (
    <article className="adDraftEditor">
      <div className="adDraftPreview">
        <CreativePreview creative={ad.creative} />
        <div>
          <strong>{ad.creative.source_file_name ?? `Creative ${ad.creative.id}`}</strong>
          <span>{ad.creative.asset_type ?? "asset"}</span>
        </div>
      </div>
      <div className="adDraftFields">
        <div className="sectionHeader compact">
          <div>
            <p className="eyebrow">Ad draft</p>
            <h3>{draft.name || "Untitled ad"}</h3>
          </div>
          <div className="headerActions">
            <StatusChip value={ad.status} />
            <button className="secondaryButton" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Save ad
            </button>
          </div>
        </div>

        <div className="campaignFieldStack">
          <section className="formSubsection">
            <div className="subsectionHeader">
              <h3>Identity</h3>
            </div>
            <div className="formGrid two">
              <label className="fieldGroup">
                <span>Ad name</span>
                <input value={draft.name} onChange={(event) => update("name", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>Meta status</span>
                <select value={draft.metaStatus} onChange={(event) => update("metaStatus", event.target.value)} disabled={saving}>
                  {metaStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fieldGroup">
                <span>Facebook page ID</span>
                <input value={draft.facebookPageId} onChange={(event) => update("facebookPageId", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>Instagram actor ID</span>
                <input
                  value={draft.instagramActorId}
                  onChange={(event) => update("instagramActorId", event.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="fieldGroup">
                <span>Threads actor ID</span>
                <input value={draft.threadsActorId} onChange={(event) => update("threadsActorId", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>Branded content sponsor page ID</span>
                <input
                  value={draft.brandedContentSponsorPageId}
                  onChange={(event) => update("brandedContentSponsorPageId", event.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
          </section>

          <section className="formSubsection">
            <div className="subsectionHeader">
              <h3>Destination</h3>
            </div>
            <div className="formGrid two">
              <label className="fieldGroup">
                <span>Destination type</span>
                <select
                  value={draft.destinationType}
                  onChange={(event) => update("destinationType", event.target.value)}
                  disabled={saving}
                >
                  {adDestinationTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fieldGroup">
                <span>Destination URL</span>
                <input
                  type="url"
                  value={draft.destinationUrl}
                  onChange={(event) => update("destinationUrl", event.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="fieldGroup">
                <span>Lead form ID</span>
                <input value={draft.leadFormId} onChange={(event) => update("leadFormId", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>Lead form name</span>
                <input value={draft.leadFormName} onChange={(event) => update("leadFormName", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>Instant Experience ID</span>
                <input
                  value={draft.instantExperienceId}
                  onChange={(event) => update("instantExperienceId", event.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="fieldGroup">
                <span>App deep link URL</span>
                <input
                  type="url"
                  value={draft.appDeepLinkUrl}
                  onChange={(event) => update("appDeepLinkUrl", event.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="fieldGroup">
                <span>Phone number</span>
                <input value={draft.phoneNumber} onChange={(event) => update("phoneNumber", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>WhatsApp phone number</span>
                <input
                  value={draft.whatsappPhoneNumber}
                  onChange={(event) => update("whatsappPhoneNumber", event.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
          </section>

          <section className="formSubsection">
            <div className="subsectionHeader">
              <h3>Copy and CTA</h3>
              <span>Variants are comma-separated</span>
            </div>
            <label className="fieldGroup">
              <span>Primary text</span>
              <textarea value={draft.primaryText} onChange={(event) => update("primaryText", event.target.value)} rows={3} disabled={saving} />
            </label>
            <div className="formGrid two">
              <label className="fieldGroup">
                <span>Headline</span>
                <input value={draft.headline} onChange={(event) => update("headline", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>Description</span>
                <input value={draft.description} onChange={(event) => update("description", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>CTA type</span>
                <select value={draft.ctaType} onChange={(event) => update("ctaType", event.target.value)} disabled={saving}>
                  {ctaTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fieldGroup">
                <span>Ad link</span>
                <input type="url" value={draft.ctaLink} onChange={(event) => update("ctaLink", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>Display link</span>
                <input value={draft.displayLink} onChange={(event) => update("displayLink", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>Primary text variants</span>
                <input
                  value={draft.primaryTextVariants}
                  onChange={(event) => update("primaryTextVariants", event.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="fieldGroup">
                <span>Headline variants</span>
                <input
                  value={draft.headlineVariants}
                  onChange={(event) => update("headlineVariants", event.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="fieldGroup">
                <span>Description variants</span>
                <input
                  value={draft.descriptionVariants}
                  onChange={(event) => update("descriptionVariants", event.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
          </section>

          <section className="formSubsection">
            <div className="subsectionHeader">
              <h3>Tracking</h3>
            </div>
            <div className="formGrid two">
              <label className="fieldGroup">
                <span>URL tags</span>
                <input value={draft.urlTags} onChange={(event) => update("urlTags", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>Meta pixel ID</span>
                <input value={draft.metaPixelId} onChange={(event) => update("metaPixelId", event.target.value)} disabled={saving} />
              </label>
              <label className="fieldGroup">
                <span>Conversion event name</span>
                <input
                  value={draft.conversionEventName}
                  onChange={(event) => update("conversionEventName", event.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}

function LocationPicker({
  included,
  excluded,
  disabled,
  onIncludedChange,
  onExcludedChange
}: {
  included: LocationSelection[];
  excluded: LocationSelection[];
  disabled: boolean;
  onIncludedChange: (locations: LocationSelection[]) => void;
  onExcludedChange: (locations: LocationSelection[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MetaTargetingLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const includedKeys = useMemo(() => new Set(included.map((location) => locationKey(location))), [included]);
  const excludedKeys = useMemo(() => new Set(excluded.map((location) => locationKey(location))), [excluded]);

  const searchLocations = useCallback(async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const locations = await searchTargetingLocations({
        query: trimmed,
        locationTypes: ["country", "region", "city"],
        limit: 20
      });
      setResults(locations);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (disabled) return;
    const timer = window.setTimeout(() => {
      void searchLocations(query);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [disabled, query, searchLocations]);

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchLocations(query);
  }

  function addIncluded(location: MetaTargetingLocation) {
    const next = locationFromMeta(location);
    onIncludedChange(uniqueLocations([...included, next]));
    onExcludedChange(excluded.filter((item) => locationKey(item) !== locationKey(next)));
  }

  function addExcluded(location: MetaTargetingLocation) {
    const next = locationFromMeta(location);
    onExcludedChange(uniqueLocations([...excluded, next]));
    onIncludedChange(included.filter((item) => locationKey(item) !== locationKey(next)));
  }

  function removeIncluded(location: LocationSelection) {
    onIncludedChange(included.filter((item) => locationKey(item) !== locationKey(location)));
  }

  function removeExcluded(location: LocationSelection) {
    onExcludedChange(excluded.filter((item) => locationKey(item) !== locationKey(location)));
  }

  function updateRadius(location: LocationSelection, radius: string) {
    onIncludedChange(
      included.map((item) => (locationKey(item) === locationKey(location) ? { ...item, radius } : item))
    );
  }

  return (
    <div className="locationPicker">
      <form className="locationSearch" onSubmit={runSearch}>
        <label className="fieldGroup">
          <span>Search delivery locations</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Kyiv, Lviv, Ukraine, Warsaw"
            disabled={disabled}
          />
        </label>
        <button className="secondaryButton" disabled={disabled || loading}>
          {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          Search
        </button>
      </form>

      {error ? <div className="inlineError">{error}</div> : null}

      {results.length ? (
        <div className="locationResults">
          {results.map((location) => {
            const key = locationKey(location);
            const isIncluded = includedKeys.has(key);
            const isExcluded = excludedKeys.has(key);
            const selectionClass = isIncluded ? " included" : isExcluded ? " excluded" : "";

            return (
              <article key={key} className={`locationResult${selectionClass}`}>
                <div>
                  <strong>{location.name}</strong>
                  <span>
                    {location.type}
                    {location.region ? ` · ${location.region}` : ""}
                    {location.country_name ? ` · ${location.country_name}` : ""}
                  </span>
                  {isIncluded || isExcluded ? (
                    <span className={`locationResultStatus${isExcluded ? " excluded" : ""}`}>
                      <Check size={14} />
                      {isIncluded ? "Included" : "Excluded"}
                    </span>
                  ) : null}
                </div>
                <div className="locationActions">
                  <button
                    type="button"
                    className="secondaryButton compact success"
                    onClick={() => addIncluded(location)}
                    disabled={disabled || isIncluded}
                  >
                    {isIncluded ? (
                      <>
                        <Check size={14} />
                        Included
                      </>
                    ) : (
                      "Include"
                    )}
                  </button>
                  <button
                    type="button"
                    className="secondaryButton compact danger"
                    onClick={() => addExcluded(location)}
                    disabled={disabled || isExcluded}
                  >
                    {isExcluded ? (
                      <>
                        <Check size={14} />
                        Excluded
                      </>
                    ) : (
                      "Exclude"
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <div className="locationBuckets">
        <section className="locationBucket">
          <div className="subsectionHeader compactHeader">
            <h3>Included locations</h3>
            <span>{included.length}</span>
          </div>
          {included.length ? (
            <div className="locationChipList">
              {included.map((location) => (
                <span className="locationChip" key={locationKey(location)}>
                  <span>
                    <strong>{locationLabel(location)}</strong>
                    <small>{location.type}</small>
                  </span>
                  {location.type === "city" ? (
                    <input
                      aria-label={`${location.name} radius in miles`}
                      type="number"
                      min="1"
                      value={location.radius ?? "25"}
                      onChange={(event) => updateRadius(location, event.target.value)}
                      disabled={disabled}
                    />
                  ) : null}
                  <button type="button" onClick={() => removeIncluded(location)} disabled={disabled} aria-label={`Remove ${location.name}`}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="inlineEmpty compact">No included locations selected.</div>
          )}
        </section>

        <section className="locationBucket">
          <div className="subsectionHeader compactHeader">
            <h3>Excluded locations</h3>
            <span>{excluded.length}</span>
          </div>
          {excluded.length ? (
            <div className="locationChipList">
              {excluded.map((location) => (
                <span className="locationChip excluded" key={locationKey(location)}>
                  <span>
                    <strong>{locationLabel(location)}</strong>
                    <small>{location.type}</small>
                  </span>
                  <button type="button" onClick={() => removeExcluded(location)} disabled={disabled} aria-label={`Remove ${location.name}`}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="inlineEmpty compact">Nothing excluded.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function AdSetEditor({
  adset,
  campaignBudgetStrategy,
  mode,
  saving,
  onSave,
  onAddCreative,
  onSaveAd,
  onError,
  onNext
}: {
  adset: AdSetDraftWithAds;
  campaignBudgetStrategy: string;
  mode: "settings" | "creatives";
  saving: string | null;
  onSave: (id: number, payload: AdSetDraftPayload) => Promise<boolean>;
  onAddCreative: (adsetId: number) => void;
  onSaveAd: (id: number, payload: AdDraftPayload) => Promise<boolean>;
  onError: (message: string) => void;
  onNext?: () => void;
}) {
  const [draft, setDraft] = useState<AdSetFormState>(() => adSetToFormState(adset));

  useEffect(() => {
    setDraft(adSetToFormState(adset));
  }, [adset]);

  const update = <Key extends keyof AdSetFormState>(field: Key, value: AdSetFormState[Key]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  async function save() {
    try {
      return await onSave(adset.id, buildAdSetPayload(draft, campaignBudgetStrategy));
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : String(saveError));
      return false;
    }
  }

  async function saveAndNext() {
    const saved = await save();
    if (saved) onNext?.();
  }

  const adSetSaving = saving === `adset-${adset.id}`;
  const usesCampaignBudget = campaignBudgetStrategy === "CAMPAIGN";

  return (
    <section className="adsetEditor">
      <div className="sectionHeader adsetEditorHeader">
        <div>
          <p className="eyebrow">{mode === "settings" ? "Ad set draft" : "Creative setup"}</p>
          <h2>{adset.name}</h2>
        </div>
        <div className="headerActions actionGroup">
          <StatusChip value={adset.status} />
          {mode === "creatives" ? (
            <button className="secondaryButton" onClick={() => onAddCreative(adset.id)}>
              <ImageIcon size={16} />
              Add creative
            </button>
          ) : null}
          {mode === "settings" ? (
            <button className="primaryButton" onClick={() => void save()} disabled={adSetSaving}>
              {adSetSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Save ad set
            </button>
          ) : null}
        </div>
      </div>

      {mode === "settings" ? (
      <div className="campaignFieldStack">
        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>Delivery and conversion</h3>
          </div>
          <div className="formGrid three deliveryGrid">
            <label className="fieldGroup fullWidthField">
              <span>Ad set name</span>
              <input value={draft.name} onChange={(event) => update("name", event.target.value)} disabled={adSetSaving} />
            </label>
            <label className="fieldGroup">
              <span>Conversion location</span>
              <select
                value={draft.destinationType}
                onChange={(event) => update("destinationType", event.target.value)}
                disabled={adSetSaving}
              >
                {destinationTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Conversion event</span>
              <select
                value={draft.conversionEvent}
                onChange={(event) => update("conversionEvent", event.target.value)}
                disabled={adSetSaving}
              >
                {conversionEvents.map((event) => (
                  <option key={event || "default"} value={event}>
                    {event || "Meta default"}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Optimization goal</span>
              <select
                value={draft.optimizationGoal}
                onChange={(event) => update("optimizationGoal", event.target.value)}
                disabled={adSetSaving}
              >
                {optimizationGoals.map((goal) => (
                  <option key={goal} value={goal}>
                    {goal}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Billing event</span>
              <select value={draft.billingEvent} onChange={(event) => update("billingEvent", event.target.value)} disabled={adSetSaving}>
                {billingEvents.map((event) => (
                  <option key={event} value={event}>
                    {event}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Attribution setting</span>
              <select
                value={draft.attributionSetting}
                onChange={(event) => update("attributionSetting", event.target.value)}
                disabled={adSetSaving}
              >
                {attributionSettings.map((setting) => (
                  <option key={setting || "default"} value={setting}>
                    {setting || "Meta default"}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup metaStatusField">
              <span>Meta status</span>
              <select value={draft.metaStatus} onChange={(event) => update("metaStatus", event.target.value)} disabled={adSetSaving}>
                {metaStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>Budget and schedule</h3>
            {usesCampaignBudget ? (
              <span>Campaign budget is active</span>
            ) : (
              <span className="inlineWarning">
                <AlertCircle size={14} />
                Ad set budget required
              </span>
            )}
          </div>
          <div className="formGrid three">
            {usesCampaignBudget ? (
              <div className="budgetModeNotice">
                <strong>Campaign budget is selected</strong>
                <span>This ad set will use the campaign-level budget. Switch the campaign to Ad set budget to edit budgets here.</span>
              </div>
            ) : (
              <>
                <label className="fieldGroup">
                  <span>Daily budget, USD</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={draft.dailyBudgetMinor}
                    onChange={(event) => update("dailyBudgetMinor", event.target.value)}
                    disabled={adSetSaving}
                    placeholder="50"
                  />
                </label>
                <label className="fieldGroup">
                  <span>Lifetime budget, USD</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={draft.lifetimeBudgetMinor}
                    onChange={(event) => update("lifetimeBudgetMinor", event.target.value)}
                    disabled={adSetSaving}
                    placeholder="1500"
                  />
                </label>
              </>
            )}
            <label className="fieldGroup">
              <span>Bid strategy</span>
              <select value={draft.bidStrategy} onChange={(event) => update("bidStrategy", event.target.value)} disabled={adSetSaving}>
                {bidStrategies.map((strategy) => (
                  <option key={strategy || "default"} value={strategy}>
                    {strategy || "Meta default"}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Bid amount, USD</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={draft.bidAmountMinor}
                onChange={(event) => update("bidAmountMinor", event.target.value)}
                disabled={adSetSaving}
                placeholder="Optional"
              />
            </label>
            <label className="fieldGroup">
              <span>Start time</span>
              <input
                type="datetime-local"
                value={draft.startTime}
                onChange={(event) => update("startTime", event.target.value)}
                disabled={adSetSaving}
              />
            </label>
            <label className="fieldGroup">
              <span>End time</span>
              <input
                type="datetime-local"
                value={draft.endTime}
                onChange={(event) => update("endTime", event.target.value)}
                disabled={adSetSaving}
              />
            </label>
            <label className="fieldGroup">
              <span>Pacing type</span>
              <select value={draft.pacingType} onChange={(event) => update("pacingType", event.target.value)} disabled={adSetSaving}>
                {pacingTypes.map((type) => (
                  <option key={type || "default"} value={type}>
                    {type || "Meta default"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkboxField describedCheckbox">
            <input
              type="checkbox"
              checked={draft.isDynamicCreative}
              onChange={(event) => update("isDynamicCreative", event.target.checked)}
              disabled={adSetSaving}
            />
            <span className="checkboxCopy">
              <strong>Dynamic creative</strong>
              <small>Meta can automatically combine eligible creative assets, copy variants, and placements.</small>
            </span>
          </label>
        </section>

        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>Audience and delivery locations</h3>
            <span>Countries, regions and cities come from Meta search</span>
          </div>
          <div className="formGrid two">
            <label className="checkboxField">
              <input
                type="checkbox"
                checked={draft.useAdvantageAudience}
                onChange={(event) => update("useAdvantageAudience", event.target.checked)}
                disabled={adSetSaving}
              />
              <span>Use Advantage+ audience</span>
            </label>
            <label className="fieldGroup">
              <span>Saved audience ID</span>
              <input
                value={draft.savedAudienceId}
                onChange={(event) => update("savedAudienceId", event.target.value)}
                disabled={adSetSaving}
              />
            </label>
          </div>
          <LocationPicker
            included={draft.includedLocations}
            excluded={draft.excludedLocations}
            disabled={adSetSaving}
            onIncludedChange={(locations) => update("includedLocations", locations)}
            onExcludedChange={(locations) => update("excludedLocations", locations)}
          />
        </section>

        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>Placements</h3>
          </div>
          <div className="formGrid two compactGrid">
            <label className="fieldGroup">
              <span>Placement mode</span>
              <select value={draft.placementMode} onChange={(event) => update("placementMode", event.target.value)} disabled={adSetSaving}>
                {placementModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="formSubsection">
          <div className="subsectionHeader">
            <h3>EU transparency</h3>
          </div>
          <div className="formGrid two">
            <label className="fieldGroup">
              <span>EU beneficiary</span>
              <input value={draft.beneficiary} onChange={(event) => update("beneficiary", event.target.value)} disabled={adSetSaving} />
            </label>
            <label className="fieldGroup">
              <span>EU payor</span>
              <input value={draft.payor} onChange={(event) => update("payor", event.target.value)} disabled={adSetSaving} />
            </label>
          </div>
        </section>
      </div>
      ) : null}

      {mode === "creatives" ? (
      <div className="adDraftStack">
        <div className="subsectionHeader">
          <h3>Ad drafts</h3>
          <span>{adset.ads.length} creative{adset.ads.length === 1 ? "" : "s"}</span>
        </div>
        {adset.ads.length === 0 ? (
          <div className="emptyCreativeState">
            <ImageIcon size={34} />
            <strong>No creatives assigned to this ad set yet</strong>
            <span>Add a creative to finish this ad set.</span>
            <button className="secondaryButton compact" onClick={() => onAddCreative(adset.id)}>
              <ImageIcon size={16} />
              Add creative
            </button>
          </div>
        ) : (
          adset.ads.map((ad) => (
            <AdDraftEditor
              key={ad.id}
              ad={ad}
              saving={saving === `ad-${ad.id}`}
              onSave={onSaveAd}
              onError={onError}
            />
          ))
        )}
      </div>
      ) : null}

      <div className="stickyActionBar">
        {mode === "creatives" ? (
          <>
            <button className="secondaryButton" onClick={() => onAddCreative(adset.id)}>
              <ImageIcon size={16} />
              Add creative
            </button>
            {onNext ? (
              <button className="primaryButton" onClick={onNext} disabled={adset.ads.length === 0}>
                <Check size={16} />
                Finish setup
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button className="secondaryButton" onClick={() => void save()} disabled={adSetSaving}>
              {adSetSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Save ad set
            </button>
            {onNext ? (
              <button className="primaryButton" onClick={() => void saveAndNext()} disabled={adSetSaving}>
                {adSetSaving ? <Loader2 size={16} className="spin" /> : <ChevronRight size={16} />}
                Save & next
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function AddCreativeModal({
  loading,
  adsetId,
  onClose,
  onAdd
}: {
  loading: boolean;
  adsetId: number;
  onClose: () => void;
  onAdd: (adsetId: number, creativeId: number) => void;
}) {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<"choose" | "upload">("choose");
  const [file, setFile] = useState<File | null>(null);
  const [uploadDraft, setUploadDraft] = useState({ projectType: "", adText: "", ctaLink: "" });
  const [loadingCreatives, setLoadingCreatives] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingCreatives(true);
    setError(null);
    fetchCreatives("ready")
      .then((items) => {
        if (!active) return;
        setCreatives(items);
        setSelectedId(items[0]?.id ?? null);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoadingCreatives(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function uploadAndAttach() {
    if (!file) {
      setError("Choose an image or video first.");
      return;
    }
    if (file.size > 18 * 1024 * 1024) {
      setError("File is too large for direct upload here. Use a file under 18 MB or upload through the Drive/Notion flow.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const creative = await uploadCreative({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        dataBase64: await fileToBase64(file),
        projectType: uploadDraft.projectType || file.name,
        adText: uploadDraft.adText || undefined,
        ctaLink: uploadDraft.ctaLink || undefined
      });
      onAdd(adsetId, creative.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(false);
    }
  }

  const busy = loading || uploading;

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true">
      <div className="modal creativePickerModal">
        <div className="modalHeader">
          <div>
            <p className="eyebrow">Ready creatives</p>
            <h2>Add creative</h2>
          </div>
          <button className="iconButton" onClick={onClose} aria-label="Close" disabled={busy}>
            <X size={18} />
          </button>
        </div>

        <div className="modalTabs">
          <button className={mode === "choose" ? "active" : ""} onClick={() => setMode("choose")}>
            Choose uploaded
          </button>
          <button className={mode === "upload" ? "active" : ""} onClick={() => setMode("upload")}>
            Upload new
          </button>
        </div>

        {error ? <ErrorNotice message={error} /> : null}

        {mode === "choose" ? (
          <div className="creativePickerList">
            {loadingCreatives ? (
              <div className="emptyState">
                <Loader2 className="spin" />
                Loading ready creatives
              </div>
            ) : creatives.length === 0 ? (
              <div className="emptyState">No ready creatives are available.</div>
            ) : (
              creatives.map((creative) => (
                <button
                  key={creative.id}
                  className={selectedId === creative.id ? "creativePickerRow selected" : "creativePickerRow"}
                  onClick={() => setSelectedId(creative.id)}
                >
                  <CreativePreview creative={creative} />
                  <div>
                    <strong>{creative.source_file_name ?? creative.project_type ?? `Creative ${creative.id}`}</strong>
                    <span>{creative.ad_text ?? "No primary text yet"}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="uploadCreativePanel">
            <label className={file ? "uploadDrop selected" : "uploadDrop"}>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={busy}
              />
              <ImageIcon size={24} />
              <strong>{file ? file.name : "Choose image or video"}</strong>
              <span>Direct upload creates a ready creative and attaches it to this ad set.</span>
            </label>
            <div className="formGrid two compactGrid">
              <label className="fieldGroup">
                <span>Name</span>
                <input
                  value={uploadDraft.projectType}
                  onChange={(event) => setUploadDraft((current) => ({ ...current, projectType: event.target.value }))}
                  disabled={busy}
                  placeholder={file?.name ?? "Creative name"}
                />
              </label>
              <label className="fieldGroup">
                <span>Ad link</span>
                <input
                  type="url"
                  value={uploadDraft.ctaLink}
                  onChange={(event) => setUploadDraft((current) => ({ ...current, ctaLink: event.target.value }))}
                  disabled={busy}
                  placeholder="https://..."
                />
              </label>
            </div>
            <label className="fieldGroup">
              <span>Primary text</span>
              <textarea
                value={uploadDraft.adText}
                onChange={(event) => setUploadDraft((current) => ({ ...current, adText: event.target.value }))}
                disabled={busy}
                rows={3}
              />
            </label>
          </div>
        )}

        <div className="modalActions">
          <button className="secondaryButton" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {mode === "choose" ? (
            <button className="primaryButton" onClick={() => selectedId && onAdd(adsetId, selectedId)} disabled={busy || !selectedId}>
              {loading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              Add creative
            </button>
          ) : (
            <button className="primaryButton" onClick={uploadAndAttach} disabled={busy || !file}>
              {uploading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              Upload and attach
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StructureStepper({
  activeStep,
  completedSteps,
  onStepSelect
}: {
  activeStep: BuilderStep;
  completedSteps: Record<BuilderStep, boolean>;
  onStepSelect: (step: BuilderStep) => void;
}) {
  return (
    <div className="structureStepper" aria-label="Campaign structure progress">
      {builderSteps.map((step, index) => {
        const StepIcon = step.icon;
        const state = step.id === activeStep ? "active" : completedSteps[step.id] ? "complete" : "upcoming";
        const isComplete = completedSteps[step.id] && step.id !== activeStep;
        return (
          <div className="stepperItemWrap" key={step.label}>
            <button
              type="button"
              className={`stepperItem ${state}`}
              onClick={() => onStepSelect(step.id)}
              aria-current={step.id === activeStep ? "step" : undefined}
            >
              {isComplete ? <Check size={15} /> : <StepIcon size={15} />}
              <span>{step.label}</span>
            </button>
            {index < builderSteps.length - 1 ? <ChevronRight size={15} className="stepperArrow" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function CampaignStructure({
  campaign,
  activeStep,
  completedSteps,
  onAddAdSet,
  onStepSelect,
  addingAdSet
}: {
  campaign: CampaignDraftTree;
  activeStep: BuilderStep;
  completedSteps: Record<BuilderStep, boolean>;
  onAddAdSet: () => void;
  onStepSelect: (step: BuilderStep) => void;
  addingAdSet: boolean;
}) {
  const activeStepConfig = builderSteps.find((step) => step.id === activeStep) ?? builderSteps[0];
  const adSetCount = campaign.adsets.length;
  const adCount = countAds(campaign);
  const missingBudgetCount =
    campaign.budget_strategy === "CAMPAIGN"
      ? 0
      : campaign.adsets.filter((adset) => !adset.daily_budget_minor && !adset.lifetime_budget_minor).length;
  const missingCreativeCount = campaign.adsets.filter((adset) => adset.ads.length === 0).length;
  const activeStepTitle =
    activeStep === "campaign"
      ? campaign.name
      : activeStep === "adsets"
        ? `${adSetCount} ad set draft${adSetCount === 1 ? "" : "s"}`
        : `Creatives for ${campaign.name}`;
  const activeStepDescription =
    activeStep === "campaign"
      ? "Campaign-level settings"
      : activeStep === "adsets"
        ? `${budgetStrategyLabel(campaign.budget_strategy)} · ${campaign.name}`
        : `${adCount} creative draft${adCount === 1 ? "" : "s"} across ${adSetCount} ad set${adSetCount === 1 ? "" : "s"}`;

  return (
    <section className="builderSection structureSection">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">Structure</p>
          <StructureStepper activeStep={activeStep} completedSteps={completedSteps} onStepSelect={onStepSelect} />
        </div>
        <button className="primaryButton compact" onClick={onAddAdSet} disabled={addingAdSet}>
          {addingAdSet ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
          Add ad set
        </button>
      </div>

      <div className="stepContextCard">
        <div className="stepContextMain">
          <span>{activeStepConfig.label}</span>
          <strong>{activeStepTitle}</strong>
          <small>{activeStepDescription}</small>
        </div>
        <div className="structureMeta stepContextMeta">
          {activeStep === "campaign" ? (
            <>
              <BadgeChip>{campaign.objective}</BadgeChip>
              <BadgeChip>{budgetStrategyLabel(campaign.budget_strategy)}</BadgeChip>
              <StatusChip value={campaign.status} />
            </>
          ) : null}
          {activeStep === "adsets" ? (
            <>
              <BadgeChip>{adSetCount} ad set{adSetCount === 1 ? "" : "s"}</BadgeChip>
              {missingBudgetCount ? (
                <BadgeChip tone="warning">
                  <AlertCircle size={12} />
                  {missingBudgetCount} need budget
                </BadgeChip>
              ) : (
                <BadgeChip>
                  <Check size={12} />
                  Budgets ready
                </BadgeChip>
              )}
            </>
          ) : null}
          {activeStep === "creatives" ? (
            <>
              <BadgeChip>{adCount} creative{adCount === 1 ? "" : "s"}</BadgeChip>
              {missingCreativeCount ? (
                <BadgeChip tone="warning">
                  <AlertCircle size={12} />
                  {missingCreativeCount} ad set{missingCreativeCount === 1 ? "" : "s"} need creatives
                </BadgeChip>
              ) : (
                <BadgeChip>
                  <Check size={12} />
                  Creatives ready
                </BadgeChip>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CampaignDetailView({
  ready,
  id,
  onBack
}: {
  ready: boolean;
  id: number;
  onBack: () => void;
}) {
  const [campaign, setCampaign] = useState<CampaignDraftTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [addCreativeAdSetId, setAddCreativeAdSetId] = useState<number | null>(null);
  const [activeBuilderStep, setActiveBuilderStep] = useState<BuilderStep>("campaign");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingCampaignName, setEditingCampaignName] = useState(false);
  const [campaignNameDraft, setCampaignNameDraft] = useState("");

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      setCampaign(await fetchCampaignDraft(id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [id, ready]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!campaign || editingCampaignName) return;
    setCampaignNameDraft(campaign.name);
  }, [campaign, editingCampaignName]);

  const completedSteps = useMemo(() => (campaign ? builderStepCompletion(campaign) : null), [campaign]);

  function selectBuilderStep(step: BuilderStep) {
    setActiveBuilderStep(step);
    window.requestAnimationFrame(() => {
      document.getElementById("builder-step-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function runSave(key: string, action: () => Promise<void>, message: string) {
    setSaving(key);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await load();
      setSuccess(message);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      return false;
    } finally {
      setSaving(null);
    }
  }

  function saveCampaign(payload: CampaignDraftPayload) {
    return runSave("campaign", () => updateCampaignDraft(id, payload).then(() => undefined), "Campaign saved.");
  }

  function saveAdSet(adsetId: number, payload: AdSetDraftPayload) {
    return runSave(`adset-${adsetId}`, () => updateAdSetDraft(adsetId, payload).then(() => undefined), "Ad set saved.");
  }

  function saveAd(adId: number, payload: AdDraftPayload) {
    return runSave(`ad-${adId}`, () => updateAdDraft(adId, payload).then(() => undefined), "Ad draft saved.");
  }

  async function addAdSet() {
    if (!campaign) return;
    const created = await runSave(
      "create-adset",
      () =>
        createAdSetDraft(id, {
          name: `Ad set ${campaign.adsets.length + 1}`,
          destinationType: "WEBSITE",
          optimizationGoal: "LINK_CLICKS",
          billingEvent: "IMPRESSIONS",
          placementMode: "ADVANTAGE_PLUS",
          useAdvantageAudience: true,
          targeting: {},
          metaStatus: "PAUSED"
        }).then(() => undefined),
      "Ad set added."
    );
    if (created) selectBuilderStep("adsets");
  }

  function addCreative(adsetId: number, creativeId: number) {
    void runSave(
      `add-creative-${adsetId}`,
      () => createAdDraft(adsetId, { creativeId }).then(() => undefined),
      "Creative added as an ad draft."
    ).then((created) => {
      if (created) selectBuilderStep("creatives");
    });
    setAddCreativeAdSetId(null);
  }

  function completeSetup() {
    if (!campaign) return;
    setError(null);
    const completion = builderStepCompletion(campaign);
    if (!completion.campaign) {
      setSuccess(null);
      setError("Finish campaign settings before completing setup.");
      selectBuilderStep("campaign");
      return;
    }
    if (!completion.adsets) {
      setSuccess(null);
      setError("Finish ad set settings before completing setup.");
      selectBuilderStep("adsets");
      return;
    }
    if (!completion.creatives) {
      setSuccess(null);
      setError("Add at least one creative to every ad set before finishing setup.");
      selectBuilderStep("creatives");
      return;
    }
    setSuccess("Campaign setup is ready.");
  }

  function saveCampaignName() {
    if (!campaign) return;
    const name = campaignNameDraft.trim();
    if (!name || name === campaign.name) {
      setCampaignNameDraft(campaign.name);
      setEditingCampaignName(false);
      return;
    }
    setEditingCampaignName(false);
    void runSave("campaign-name", () => updateCampaignDraft(campaign.id, { name }).then(() => undefined), "Campaign name saved.");
  }

  function cancelCampaignNameEdit() {
    if (!campaign) return;
    setCampaignNameDraft(campaign.name);
    setEditingCampaignName(false);
  }

  if (loading && !campaign) {
    return (
      <main className="content">
        <div className="emptyState">
          <Loader2 className="spin" />
          Loading campaign builder
        </div>
      </main>
    );
  }

  if (!campaign) {
    return (
      <main className="content">
        <header className="pageHeader">
          <button className="secondaryButton" onClick={onBack}>
            <ArrowLeft size={16} />
            Back
          </button>
        </header>
        {error ? <ErrorNotice message={error} /> : <div className="emptyState">Campaign draft not found.</div>}
      </main>
    );
  }

  const activeCompletedSteps = completedSteps ?? builderStepCompletion(campaign);

  return (
    <main className="content">
      <header className="pageHeader campaignDetailHeader">
        <div className="campaignHeaderMain">
          <nav className="campaignBreadcrumb" aria-label="Breadcrumb">
            <button type="button" onClick={onBack}>Campaign drafts</button>
            <span>/</span>
            <span>Campaign Builder</span>
          </nav>
          {editingCampaignName ? (
            <form className="campaignNameForm" onSubmit={(event) => {
              event.preventDefault();
              saveCampaignName();
            }}>
              <input
                autoFocus
                value={campaignNameDraft}
                onChange={(event) => setCampaignNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelCampaignNameEdit();
                  }
                }}
                disabled={saving === "campaign-name"}
                aria-label="Campaign name"
              />
              <button type="submit" className="iconButton titleEditButton" aria-label="Save campaign name" disabled={saving === "campaign-name"}>
                <Save size={15} />
              </button>
              <button type="button" className="iconButton titleEditButton" onClick={cancelCampaignNameEdit} aria-label="Cancel campaign name edit">
                <X size={15} />
              </button>
            </form>
          ) : (
            <div className="campaignTitleLine">
              <h1>{campaign.name}</h1>
              <button type="button" className="iconButton titleEditButton" onClick={() => setEditingCampaignName(true)} aria-label="Edit campaign name">
                <Pencil size={15} />
              </button>
            </div>
          )}

          <section className="campaignSummaryRow" aria-label="Campaign summary">
            <div>
              <strong>{campaign.adsets.length}</strong>
              <span>ad set draft{campaign.adsets.length === 1 ? "" : "s"}</span>
            </div>
            <div>
              <strong>{countAds(campaign)}</strong>
              <span>ad draft{countAds(campaign) === 1 ? "" : "s"}</span>
            </div>
            <div>
              <StatusChip value={campaign.meta_status} />
              <span>Meta campaign status</span>
            </div>
          </section>
        </div>
        <div className="headerActions">
          <button className="secondaryButton" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Refresh
          </button>
          <button className="secondaryButton disabledPublishButton" disabled title="Буде доступно після налаштування всіх кроків">
            <Megaphone size={16} />
            Review & publish coming next
          </button>
        </div>
      </header>

      {error ? <ErrorNotice message={error} /> : null}
      {success ? <SuccessNotice message={success} /> : null}

      <div className="builderStack">
        <CampaignStructure
          campaign={campaign}
          activeStep={activeBuilderStep}
          completedSteps={activeCompletedSteps}
          onAddAdSet={addAdSet}
          onStepSelect={selectBuilderStep}
          addingAdSet={saving === "create-adset"}
        />

        <div id="builder-step-panel" className="builderStepPanel">
          {activeBuilderStep === "campaign" ? (
            <CampaignSettingsForm
              campaign={campaign}
              saving={saving === "campaign"}
              onSave={saveCampaign}
              onError={setError}
              onNext={() => selectBuilderStep("adsets")}
            />
          ) : null}

          {activeBuilderStep === "adsets" ? (
            campaign.adsets.length === 0 ? (
              <section className="builderSection stepEmptySection">
                <div className="emptyStructureState">
                  <div>
                    <strong>No ad sets yet</strong>
                    <span>Create the first ad set to open its settings.</span>
                  </div>
                  <button className="primaryButton" onClick={() => void addAdSet()} disabled={saving === "create-adset"}>
                    {saving === "create-adset" ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                    Add ad set
                  </button>
                </div>
              </section>
            ) : (
              campaign.adsets.map((adset) => (
                <AdSetEditor
                  key={adset.id}
                  adset={adset}
                  campaignBudgetStrategy={campaign.budget_strategy}
                  mode="settings"
                  saving={saving}
                  onSave={saveAdSet}
                  onAddCreative={setAddCreativeAdSetId}
                  onSaveAd={saveAd}
                  onError={setError}
                  onNext={() => selectBuilderStep("creatives")}
                />
              ))
            )
          ) : null}

          {activeBuilderStep === "creatives" ? (
            campaign.adsets.length === 0 ? (
              <section className="builderSection stepEmptySection">
                <div className="emptyStructureState">
                  <div>
                    <strong>Create an ad set first</strong>
                    <span>Creatives are attached inside an ad set.</span>
                  </div>
                  <button className="primaryButton" onClick={() => void addAdSet()} disabled={saving === "create-adset"}>
                    {saving === "create-adset" ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
                    Add ad set
                  </button>
                </div>
              </section>
            ) : (
              campaign.adsets.map((adset) => (
                <AdSetEditor
                  key={adset.id}
                  adset={adset}
                  campaignBudgetStrategy={campaign.budget_strategy}
                  mode="creatives"
                  saving={saving}
                  onSave={saveAdSet}
                  onAddCreative={setAddCreativeAdSetId}
                  onSaveAd={saveAd}
                  onError={setError}
                  onNext={completeSetup}
                />
              ))
            )
          ) : null}
        </div>
      </div>

      {addCreativeAdSetId ? (
        <AddCreativeModal
          loading={saving === `add-creative-${addCreativeAdSetId}`}
          adsetId={addCreativeAdSetId}
          onClose={() => setAddCreativeAdSetId(null)}
          onAdd={addCreative}
        />
      ) : null}
    </main>
  );
}

function CampaignsPage({
  ready,
  campaignId,
  onOpen,
  onBack
}: {
  ready: boolean;
  campaignId?: number;
  onOpen: (id: number) => void;
  onBack: () => void;
}) {
  if (campaignId) {
    return <CampaignDetailView ready={ready} id={campaignId} onBack={onBack} />;
  }
  return <CampaignDraftListView ready={ready} onOpen={onOpen} />;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<RouteState>(activeRoute());
  const creativeView = route.area === "creatives" ? route.view : "ready";
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [creativeGroups, setCreativeGroups] = useState<CreativeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Creative | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<CreativeGroup | null>(null);
  const [editing, setEditing] = useState<Creative | null>(null);
  const [editingGroup, setEditingGroup] = useState<CreativeGroup | null>(null);
  const [previewingAsset, setPreviewingAsset] = useState<Creative | null>(null);
  const [launching, setLaunching] = useState(false);
  const [savingCreative, setSavingCreative] = useState(false);
  const [selectedCreativeIds, setSelectedCreativeIds] = useState<Set<number>>(() => new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<"launch" | "archive" | null>(null);
  const [restoringCreativeId, setRestoringCreativeId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [adSetsByCampaign, setAdSetsByCampaign] = useState<Record<string, MetaAdSet[]>>({});

  useEffect(() => {
    function handlePopstate() {
      setRoute(activeRoute());
    }

    window.addEventListener("popstate", handlePopstate);
    return () => window.removeEventListener("popstate", handlePopstate);
  }, []);

  useEffect(() => {
    async function initAuth() {
      if (isAuthDisabled()) {
        setReady(true);
        return;
      }

      const auth = getOktaAuth();
      if (!auth) return;

      if (window.location.pathname === "/login/callback") {
        await auth.handleLoginRedirect();
        window.history.replaceState({}, "", "/dashboard");
        setRoute({ area: "creatives", view: "ready" });
      }

      const authenticated = await auth.isAuthenticated();
      if (!authenticated) {
        await auth.signInWithRedirect();
        return;
      }

      setReady(true);
    }

    initAuth().catch((authError) => {
      setError(authError instanceof Error ? authError.message : String(authError));
      setReady(true);
    });
  }, []);

  const syncOpenGroups = useCallback((groups: CreativeGroup[]) => {
    const findUpdatedGroup = (current: CreativeGroup | null) => {
      if (!current) return null;
      const currentCreativeIds = new Set(current.creatives.map((creative) => creative.id));
      return (
        groups.find((group) => group.id === current.id) ??
        groups.find((group) => group.creatives.some((creative) => currentCreativeIds.has(creative.id))) ??
        null
      );
    };

    setSelectedGroup(findUpdatedGroup);
    setEditingGroup(findUpdatedGroup);
  }, []);

  const load = useCallback(async () => {
    if (route.area !== "creatives") return;
    setLoading(true);
    setError(null);
    try {
      if (route.view === "ready") {
        const groups = await fetchCreativeGroups("ready");
        setCreativeGroups(groups);
        setCreatives(groups.flatMap((group) => group.creatives));
        syncOpenGroups(groups);
      } else {
        setCreativeGroups([]);
        setCreatives(await fetchCreatives(viewConfig[route.view].listKind));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [route, syncOpenGroups]);

  useEffect(() => {
    if (ready && route.area === "creatives") {
      void load();
    }
  }, [load, ready, route.area]);

  useEffect(() => {
    if (route.area !== "creatives" || creativeView !== "ready") {
      setSelectedCreativeIds(new Set());
      setSelectedGroupIds(new Set());
    }
  }, [creativeView, route.area]);

  const loadCampaignNames = useCallback(async () => {
    try {
      setCampaigns(await fetchCampaigns());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, []);

  useEffect(() => {
    if (ready && route.area === "creatives") {
      void loadCampaignNames();
    }
  }, [loadCampaignNames, ready, route.area]);

  const campaignNamesById = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    [campaigns]
  );

  const creativeCampaignIds = useMemo(() => {
    const knownCampaignIds = new Set(campaigns.map((campaign) => campaign.id));
    return [
      ...new Set(
        creatives
          .map((creative) => creative.campaign_id)
          .filter((id): id is string => Boolean(id && knownCampaignIds.has(id)))
      )
    ];
  }, [campaigns, creatives]);

  useEffect(() => {
    if (!ready || route.area !== "creatives" || !creativeCampaignIds.length) {
      setAdSetsByCampaign({});
      return;
    }

    let active = true;
    Promise.all(
      creativeCampaignIds.map(async (campaignId) => {
        try {
          return [campaignId, await fetchAdSets(campaignId)] as const;
        } catch {
          return [campaignId, []] as const;
        }
      })
    ).then((entries) => {
      if (active) setAdSetsByCampaign(Object.fromEntries(entries));
    });

    return () => {
      active = false;
    };
  }, [creativeCampaignIds, ready, route.area]);

  const adSetNamesById = useMemo(() => {
    const names = new Map<string, string>();
    Object.values(adSetsByCampaign).forEach((adSets) => {
      adSets.forEach((adSet) => names.set(adSet.id, adSet.name));
    });
    return names;
  }, [adSetsByCampaign]);

  const displayedCreatives = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return creatives;

    return creatives.filter((creative) =>
      [
        creative.project_type,
        creative.source_file_name,
        creative.ad_text,
        creative.headline,
        ...(creative.headline_variants ?? []),
        ...(creative.ad_text_variants ?? []),
        creative.cta_type,
        ...(creative.cta_type_variants ?? []),
        creative.cta_link,
        creative.audience,
        creative.location,
        creative.campaign_name,
        creative.adset_name,
        displayCampaignName(creative, campaignNamesById),
        displayAdSetName(creative, adSetNamesById),
        creative.asset_id,
        creative.facebook_ad_id,
        creative.notion_task_id
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search)
      );
  }, [adSetNamesById, campaignNamesById, creatives, query]);

  const displayedCreativeGroups = useMemo(() => {
    const search = query.trim().toLowerCase();
    return creativeGroups.filter((group) => groupMatchesSearch(group, search, campaignNamesById, adSetNamesById));
  }, [adSetNamesById, campaignNamesById, creativeGroups, query]);

  useEffect(() => {
    setSelectedCreativeIds((current) => {
      const availableIds = new Set(creatives.map((creative) => creative.id));
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [creatives]);

  useEffect(() => {
    setSelectedGroupIds((current) => {
      const availableIds = new Set(creativeGroups.map((group) => group.id));
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [creativeGroups]);

  const selectedCreatives = useMemo(
    () => creatives.filter((creative) => selectedCreativeIds.has(creative.id)),
    [creatives, selectedCreativeIds]
  );
  const selectedGroups = useMemo(
    () => creativeGroups.filter((group) => selectedGroupIds.has(group.id)),
    [creativeGroups, selectedGroupIds]
  );
  const allDisplayedSelected = Boolean(
    creativeView === "ready"
      ? displayedCreativeGroups.length && displayedCreativeGroups.every((group) => selectedGroupIds.has(group.id))
      : displayedCreatives.length && displayedCreatives.every((creative) => selectedCreativeIds.has(creative.id))
  );

  const counts = useMemo(
    () => ({
      shown: creativeView === "ready" ? displayedCreativeGroups.length : displayedCreatives.length,
      total: creativeView === "ready" ? creativeGroups.length : creatives.length,
      viewLabel: viewConfig[creativeView].title
    }),
    [creativeGroups.length, creativeView, creatives.length, displayedCreativeGroups.length, displayedCreatives.length]
  );

  async function confirmLaunch(placement: LaunchRequest) {
    if (!selected) return;
    setLaunching(true);
    setError(null);
    try {
      await launchCreative(selected.id, placement);
      setSelected(null);
      await load();
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : String(launchError));
    } finally {
      setLaunching(false);
    }
  }

  async function confirmGroupLaunch(placement: LaunchRequest) {
    if (!selectedGroup) return;
    setLaunching(true);
    setError(null);
    try {
      await launchCreativeGroup(selectedGroup.id, placement);
      setSelectedGroup(null);
      await load();
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : String(launchError));
    } finally {
      setLaunching(false);
    }
  }

  function toggleCreativeSelection(creativeId: number, checked: boolean) {
    setSelectedCreativeIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(creativeId);
      } else {
        next.delete(creativeId);
      }
      return next;
    });
  }

  function toggleGroupSelection(groupId: string, checked: boolean) {
    setSelectedGroupIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(groupId);
      } else {
        next.delete(groupId);
      }
      return next;
    });
  }

  function toggleAllDisplayed(checked: boolean) {
    if (creativeView === "ready") {
      setSelectedGroupIds((current) => {
        const next = new Set(current);
        for (const group of displayedCreativeGroups) {
          if (checked) {
            next.add(group.id);
          } else {
            next.delete(group.id);
          }
        }
        return next;
      });
      return;
    }

    setSelectedCreativeIds((current) => {
      const next = new Set(current);
      for (const creative of displayedCreatives) {
        if (checked) {
          next.add(creative.id);
        } else {
          next.delete(creative.id);
        }
      }
      return next;
    });
  }

  async function handleBulkLaunch(placement: LaunchPlacement) {
    if (creativeView === "ready") {
      if (!selectedGroups.length) return;
      const notReady = selectedGroups
        .map((group) => {
          const missing = missingGroupLaunchDetails(group);
          return missing.length ? `${group.group_name}: ${missing.join(", ")}` : null;
        })
        .filter((item): item is string => Boolean(item));

      if (notReady.length) {
        setError(`Complete copy before launch: ${notReady.slice(0, 4).join("; ")}${notReady.length > 4 ? "..." : ""}`);
        return;
      }

      setBulkAction("launch");
      setError(null);
      try {
        for (const group of selectedGroups) {
          await launchCreativeGroup(group.id, launchPayloadForGroup(group, placement));
        }
        const launchedCount = selectedGroups.length;
        setSelectedGroupIds(new Set());
        await load();
        setError(`Launched ${launchedCount} creative set${launchedCount === 1 ? "" : "s"}.`);
      } catch (launchError) {
        setError(launchError instanceof Error ? launchError.message : String(launchError));
      } finally {
        setBulkAction(null);
      }
      return;
    }

    if (!selectedCreatives.length) return;
    const notReady = selectedCreatives
      .map((creative) => {
        const missing = missingLaunchDetails(creative);
        return missing.length ? `${creative.source_file_name ?? `Creative ${creative.id}`}: ${missing.join(", ")}` : null;
      })
      .filter((item): item is string => Boolean(item));

    if (notReady.length) {
      setError(`Complete copy before launch: ${notReady.slice(0, 4).join("; ")}${notReady.length > 4 ? "..." : ""}`);
      return;
    }

    setBulkAction("launch");
    setError(null);
    try {
      for (const creative of selectedCreatives) {
        await launchCreative(creative.id, launchPayloadForCreative(creative, placement));
      }
      const launchedCount = selectedCreatives.length;
      setSelectedCreativeIds(new Set());
      await load();
      setError(`Launched ${launchedCount} creative${launchedCount === 1 ? "" : "s"}.`);
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : String(launchError));
    } finally {
      setBulkAction(null);
    }
  }

  async function handleBulkArchive() {
    if (creativeView === "ready") {
      if (!selectedGroups.length) return;
      setBulkAction("archive");
      setError(null);
      try {
        for (const group of selectedGroups) {
          await archiveCreativeGroup(group.id);
        }
        const archivedCount = selectedGroups.length;
        setSelectedGroupIds(new Set());
        await load();
        setError(`Archived ${archivedCount} creative set${archivedCount === 1 ? "" : "s"}.`);
      } catch (archiveError) {
        setError(archiveError instanceof Error ? archiveError.message : String(archiveError));
      } finally {
        setBulkAction(null);
      }
      return;
    }

    if (!selectedCreatives.length) return;
    setBulkAction("archive");
    setError(null);
    try {
      for (const creative of selectedCreatives) {
        await archiveCreative(creative.id);
      }
      const archivedCount = selectedCreatives.length;
      setSelectedCreativeIds(new Set());
      await load();
      setError(`Archived ${archivedCount} creative${archivedCount === 1 ? "" : "s"}.`);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : String(archiveError));
    } finally {
      setBulkAction(null);
    }
  }

  async function handleMoveCreativeToReady(creative: Creative) {
    setRestoringCreativeId(creative.id);
    setError(null);
    try {
      await moveCreativeToReady(creative.id);
      await load();
      setError("Moved archived creative to Ready.");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : String(restoreError));
    } finally {
      setRestoringCreativeId(null);
    }
  }

  async function saveCreativeDetails(creativeId: number, payload: CreativeUpdateRequest) {
    setSavingCreative(true);
    setError(null);
    try {
      const updated = await updateCreative(creativeId, payload);
      setCreatives((current) => current.map((creative) => (creative.id === updated.id ? updated : creative)));
      setSelected((current) => (current?.id === updated.id ? updated : current));
      setEditing((current) => (current?.id === updated.id ? updated : current));
      setError("Creative saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      throw saveError;
    } finally {
      setSavingCreative(false);
    }
  }

  async function saveGroupDetails(group: CreativeGroup, payload: CreativeUpdateRequest) {
    await saveCreativeDetails(groupPrimaryCreative(group).id, payload);
    await load();
  }

  async function saveGroupAssetChanges(originalGroup: CreativeGroup, draftGroup: CreativeGroup) {
    const originalById = new Map(originalGroup.creatives.map((creative) => [creative.id, creative]));
    const draftCreatives = draftGroup.creatives.filter((creative) => creative.id > 0);
    const draftById = new Map(draftCreatives.map((creative) => [creative.id, creative]));

    for (const creative of draftCreatives) {
      const original = originalById.get(creative.id);
      const groupingChanged =
        !original ||
        original.creative_group_key !== draftGroup.group_key ||
        original.creative_group_name !== draftGroup.group_name ||
        original.asset_placement !== creative.asset_placement;

      if (groupingChanged) {
        await updateCreativeGrouping(creative.id, {
          creativeGroupKey: draftGroup.group_key,
          creativeGroupName: draftGroup.group_name,
          assetPlacement: creative.asset_placement
        });
      }

      if (!original || launchDetailsChanged(original, creative)) {
        await updateCreative(creative.id, detailsPayloadFromCreative(creative));
      }
    }

    for (const creative of draftGroup.creatives) {
      if (creative.id < 0 && isEmptyCreativeSlot(creative)) {
        await createCreativeGroupSlot(originalGroup.id, { assetPlacement: creative.asset_placement });
      }
    }

    for (const creative of originalGroup.creatives) {
      if (!draftById.has(creative.id)) {
        if (isEmptyCreativeSlot(creative)) {
          await archiveCreative(creative.id);
        } else {
          await updateCreativeGrouping(creative.id, assetSetFromFileName(creative));
        }
      }
    }

    await load();
  }

  function detailsPayloadFromCreative(creative: Creative): CreativeUpdateRequest {
    return {
      projectType: creative.project_type,
      adText: creative.ad_text,
      headline: creative.headline,
      headlineVariants: creative.headline_variants ?? [],
      adTextVariants: creative.ad_text_variants ?? [],
      ctaType: creative.cta_type,
      ctaTypeVariants: creative.cta_type_variants ?? [],
      ctaLink: creative.cta_link,
      audience: creative.audience,
      location: creative.location,
      campaignId: creative.campaign_id,
      campaignName: creative.campaign_name,
      adSetId: creative.adset_id,
      adSetName: creative.adset_name
    };
  }

  async function handleSyncCampaigns() {
    setSyncing(true);
    setError(null);
    try {
      const count = await syncCampaigns();
      setError(`Synced ${count} campaign${count === 1 ? "" : "s"}.`);
      await loadCampaignNames();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setSyncing(false);
    }
  }

  async function logout() {
    const auth = getOktaAuth();
    await auth?.signOut();
  }

  function navigateCreative(nextView: CreativeView) {
    setRoute({ area: "creatives", view: nextView });
    window.history.pushState({}, "", viewConfig[nextView].path);
  }

  function navigateCampaigns() {
    setRoute({ area: "campaigns" });
    window.history.pushState({}, "", "/campaigns");
  }

  function navigateCampaign(id: number) {
    setRoute({ area: "campaigns", campaignId: id });
    window.history.pushState({}, "", `/campaigns/${id}`);
  }

  const campaignRouteId = route.area === "campaigns" ? route.campaignId : undefined;
  const breadcrumbs = useMemo(() => {
    if (route.area === "campaigns" && campaignRouteId) {
      return ["Workspace", "Campaign Builder", `Draft #${campaignRouteId}`];
    }

    if (route.area === "campaigns") {
      return ["Workspace", "Campaign drafts"];
    }

    return ["Workspace", "Creatives", viewConfig[creativeView].navLabel];
  }, [campaignRouteId, creativeView, route.area]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-brand">
          <div className="side-brand-mark">P</div>
          <div>
            <div className="side-brand-name">Promo Ads</div>
            <div className="side-brand-sub">Auto workspace</div>
          </div>
        </div>
        <nav className="side-nav" aria-label="Workspace navigation">
          <section className="side-section">
            <div className="side-section-label">Workspace</div>
            <button
              className={route.area === "creatives" ? "side-item active" : "side-item"}
              onClick={() => navigateCreative("ready")}
            >
              <span className="side-icon"><ImageIcon size={15} /></span>
              <span className="side-item-label">Creatives</span>
              <span className="side-item-badge num">{counts.total}</span>
            </button>
            <div className="side-subnav" aria-label="Creative status views">
              {creativeNavItems.map((item) => (
                <button
                  key={item}
                  className={route.area === "creatives" && creativeView === item ? "side-item side-item-nested active" : "side-item side-item-nested"}
                  onClick={() => navigateCreative(item)}
                >
                  <span className="side-item-dot-muted" />
                  {viewConfig[item].navLabel}
                </button>
              ))}
            </div>

            <button className={route.area === "campaigns" ? "side-item active" : "side-item"} onClick={navigateCampaigns}>
              <span className="side-icon"><Megaphone size={15} /></span>
              <span className="side-item-label">Campaign Builder</span>
            </button>
            <div className="side-subnav" aria-label="Campaign views">
              <button className={route.area === "campaigns" ? "side-item side-item-nested active" : "side-item side-item-nested"} onClick={navigateCampaigns}>
                <span className="side-item-dot-muted" />
                Drafts
              </button>
            </div>
          </section>
        </nav>

        <div className="side-connections">
          <div className="side-conn"><span className="side-conn-dot" />Notion sync</div>
          <div className="side-conn"><span className="side-conn-dot" />Google Drive</div>
          <div className="side-conn"><span className="side-conn-dot warn" />Meta Ads</div>
        </div>

        <div className="side-foot">
          <div className="side-avatar">PA</div>
          <div className="side-user-block">
            <div className="side-user-name truncate">Promo workspace</div>
            <div className="side-user-role">Launch operations</div>
          </div>
          {!isAuthDisabled() ? (
            <button className="icon-btn side-logout" onClick={logout} title="Logout">
              <LogOut size={15} />
            </button>
          ) : null}
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="crumb">
            {breadcrumbs.map((crumb, index) => (
              <span className={index === breadcrumbs.length - 1 ? "crumb-current crumb-item" : "crumb-item"} key={`${crumb}-${index}`}>
                {index > 0 ? <ChevronRight size={12} className="crumb-sep" /> : null}
                {crumb}
              </span>
            ))}
          </div>

          <label className="search">
            <Search size={13} />
            <input
              value={route.area === "creatives" ? query : ""}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search creatives, copy, campaign names..."
              disabled={route.area !== "creatives"}
            />
          </label>

          <button
            className="icon-btn"
            title="Refresh"
            onClick={() => {
              if (route.area === "creatives") void load();
            }}
            disabled={route.area !== "creatives" || loading}
          >
            <RefreshCw size={15} className={loading && route.area === "creatives" ? "spin" : ""} />
          </button>
          <button className="icon-btn notificationButton" title="Notifications">
            <Bell size={15} />
            {error ? <span className="topbar-dot" /> : null}
          </button>
        </div>

        <div className="workspace">
          {route.area === "campaigns" ? (
            <CampaignsPage ready={ready} campaignId={route.campaignId} onOpen={navigateCampaign} onBack={navigateCampaigns} />
          ) : (
            <main className="content">
              <header className="pageHeader">
                <div>
                  <p className="eyebrow">
                    Creatives <ChevronRight size={12} /> {viewConfig[creativeView].navLabel}
                  </p>
                  <h1>{counts.viewLabel}</h1>
                </div>
                <div className="headerActions">
                  <button className="secondaryButton" onClick={load} disabled={loading}>
                    <RefreshCw size={16} className={loading ? "spin" : ""} />
                    Refresh
                  </button>
                  <button className="secondaryButton" onClick={handleSyncCampaigns} disabled={syncing}>
                    {syncing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                    Sync campaigns
                  </button>
                </div>
              </header>

              <section className="summaryBand creativeSummaryBand">
                <div>
                  <span>{counts.shown}</span>
                  <p>
                    {query.trim()
                      ? `${counts.shown} of ${counts.total} match "${query.trim()}".`
                      : viewConfig[creativeView].summary}
                  </p>
                </div>
              </section>

              {error ? (
                <div className={/^(Synced|Launched|Archived|Moved)/.test(error) || error.endsWith("saved.") ? "notice success" : "notice"}>
                  <AlertCircle size={18} />
                  {error}
                </div>
              ) : null}

              {creativeView === "ready" && selectedGroupIds.size ? (
                <BulkActionBar
                  selectedCount={selectedGroupIds.size}
                  visibleCount={displayedCreativeGroups.length}
                  allVisibleSelected={allDisplayedSelected}
                  campaigns={campaigns}
                  busy={Boolean(bulkAction)}
                  onToggleAll={toggleAllDisplayed}
                  onLaunch={handleBulkLaunch}
                  onArchive={handleBulkArchive}
                />
              ) : null}

              <section className="listPanel">
                {loading ? (
                  <div className="emptyState">
                    <Loader2 className="spin" />
                    Loading creatives
                  </div>
                ) : counts.shown === 0 ? (
                  <div className="emptyState">
                    {query.trim() ? `No creatives match "${query.trim()}".` : viewConfig[creativeView].empty}
                  </div>
                ) : creativeView === "ready" ? (
                  displayedCreativeGroups.map((group) => (
                    <CreativeGroupRow
                      key={group.id}
                      group={group}
                      onEdit={setEditingGroup}
                      onLaunch={setSelectedGroup}
                      selectable
                      selected={selectedGroupIds.has(group.id)}
                      onSelectChange={toggleGroupSelection}
                      onPreview={setPreviewingAsset}
                      campaignNamesById={campaignNamesById}
                      adSetNamesById={adSetNamesById}
                    />
                  ))
                ) : (
                  displayedCreatives.map((creative) => (
                    <CreativeRow
                      key={creative.id}
                      creative={creative}
                      onEdit={undefined}
                      onLaunch={undefined}
                      onRestore={creativeView === "archived" && !isEmptyCreativeSlot(creative) ? handleMoveCreativeToReady : undefined}
                      restoreBusy={restoringCreativeId === creative.id}
                      selectable={false}
                      selected={selectedCreativeIds.has(creative.id)}
                      onSelectChange={toggleCreativeSelection}
                      campaignNamesById={campaignNamesById}
                      adSetNamesById={adSetNamesById}
                    />
                  ))
                )}
              </section>
            </main>
          )}
        </div>
      </div>

      {selected ? (
        <ConfirmModal
          creative={selected}
          loading={launching}
          saving={savingCreative}
          mode="launch"
          onClose={() => setSelected(null)}
          onConfirm={confirmLaunch}
          onSave={(payload) => saveCreativeDetails(selected.id, payload)}
          onPreview={setPreviewingAsset}
        />
      ) : null}

      {selectedGroup ? (
        <ConfirmModal
          creative={groupPrimaryCreative(selectedGroup)}
          group={selectedGroup}
          groups={creativeGroups}
          loading={launching}
          saving={savingCreative}
          mode="launch"
          onClose={() => setSelectedGroup(null)}
          onConfirm={confirmGroupLaunch}
          onSave={(payload) => saveGroupDetails(selectedGroup, payload)}
          onCommitAssetChanges={(draftGroup) => saveGroupAssetChanges(selectedGroup, draftGroup)}
          onPreview={setPreviewingAsset}
        />
      ) : null}

      {editing ? (
        <ConfirmModal
          creative={editing}
          loading={false}
          saving={savingCreative}
          mode="edit"
          onClose={() => setEditing(null)}
          onSave={(payload) => saveCreativeDetails(editing.id, payload)}
          onPreview={setPreviewingAsset}
        />
      ) : null}

      {editingGroup ? (
        <ConfirmModal
          creative={groupPrimaryCreative(editingGroup)}
          group={editingGroup}
          groups={creativeGroups}
          loading={false}
          saving={savingCreative}
          mode="edit"
          onClose={() => setEditingGroup(null)}
          onSave={(payload) => saveGroupDetails(editingGroup, payload)}
          onCommitAssetChanges={(draftGroup) => saveGroupAssetChanges(editingGroup, draftGroup)}
          onPreview={setPreviewingAsset}
        />
      ) : null}

      {previewingAsset ? (
        <AssetPreviewOverlay creative={previewingAsset} onClose={() => setPreviewingAsset(null)} />
      ) : null}
    </div>
  );
}
