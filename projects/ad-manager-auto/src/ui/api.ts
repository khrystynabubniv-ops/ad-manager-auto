import { getAccessToken } from "./auth";
import { getClientConfig } from "./env";

export type Creative = {
  id: number;
  notion_task_id: string;
  notion_task_url?: string | null;
  source_file_id: string;
  source_file_name?: string | null;
  asset_id?: string | null;
  asset_type?: "image" | "video" | null;
  ad_text?: string | null;
  headline?: string | null;
  headline_variants: string[];
  ad_text_variants: string[];
  cta_type: string;
  cta_type_variants: string[];
  cta_link?: string | null;
  audience?: string | null;
  location?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  adset_id?: string | null;
  adset_name?: string | null;
  project_type?: string | null;
  status: string;
  google_drive_url?: string | null;
  preview_url?: string | null;
  facebook_ad_id?: string | null;
  created_at: string;
  updated_at: string;
  uploaded_at?: string | null;
  launched_at?: string | null;
};

const apiBase = getClientConfig("API_BASE_URL");

export type CreativeListKind = "ready" | "launched" | "needs_ad_details" | "upload_failed" | "canceled";

export type MetaCampaign = {
  id: string;
  name: string;
  status?: string;
  objective?: string;
};

export type MetaAdSet = {
  id: string;
  name: string;
  campaign_id: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  daily_budget?: string;
  lifetime_budget?: string;
};

export type MetaTargetingLocation = {
  key: string;
  name: string;
  type: string;
  country_code?: string;
  country_name?: string;
  region?: string;
  region_id?: string;
  primary_city_id?: string;
  supports_region?: boolean;
};

export type DraftStatus = "draft" | "publishing" | "published" | "publish_failed" | "archived";

export type CampaignDraft = {
  id: number;
  name: string;
  objective: string;
  buying_type: string;
  special_ad_categories: string[];
  campaign_settings_mode: string;
  budget_strategy: string;
  campaign_daily_budget_minor?: number | null;
  campaign_lifetime_budget_minor?: number | null;
  bid_strategy?: string | null;
  spend_cap_minor?: number | null;
  special_ad_category_countries: string[];
  promoted_object?: Record<string, unknown> | null;
  budget_schedule_specs?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  is_skadnetwork_attribution: boolean;
  a_b_test_enabled: boolean;
  live_ads_enabled: boolean;
  status: DraftStatus;
  meta_status: string;
  meta_campaign_id?: string | null;
  metadata: Record<string, unknown>;
  last_error?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type AdSetDraft = {
  id: number;
  campaign_draft_id: number;
  name: string;
  destination_type: string;
  conversion_event?: string | null;
  optimization_goal: string;
  billing_event: string;
  bid_strategy?: string | null;
  bid_amount_minor?: number | null;
  daily_budget_minor?: number | null;
  lifetime_budget_minor?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  targeting: Record<string, unknown>;
  promoted_object?: Record<string, unknown> | null;
  attribution_setting?: string | null;
  is_dynamic_creative: boolean;
  use_advantage_audience: boolean;
  saved_audience_id?: string | null;
  audience_controls: Record<string, unknown>;
  audience_recommendations: Record<string, unknown>;
  placement_mode: string;
  placement_settings: Record<string, unknown>;
  brand_safety_controls: Record<string, unknown>;
  pacing_type?: string | null;
  adset_schedule?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  frequency_control_specs?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  beneficiary?: string | null;
  payor?: string | null;
  status: DraftStatus;
  meta_status: string;
  meta_adset_id?: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  last_error?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type AdDraft = {
  id: number;
  adset_draft_id: number;
  creative_id: number;
  name?: string | null;
  primary_text?: string | null;
  headline?: string | null;
  description?: string | null;
  cta_type: string;
  cta_link?: string | null;
  display_link?: string | null;
  url_tags?: string | null;
  facebook_page_id?: string | null;
  instagram_actor_id?: string | null;
  threads_actor_id?: string | null;
  branded_content_sponsor_page_id?: string | null;
  brand_identity_settings: Record<string, unknown>;
  destination_type: string;
  destination_url?: string | null;
  lead_form_id?: string | null;
  lead_form_name?: string | null;
  instant_experience_id?: string | null;
  app_deep_link_url?: string | null;
  phone_number?: string | null;
  whatsapp_phone_number?: string | null;
  primary_text_variants: string[];
  headline_variants: string[];
  description_variants: string[];
  object_story_spec?: Record<string, unknown> | null;
  asset_feed_spec?: Record<string, unknown> | null;
  call_to_action_value?: Record<string, unknown> | null;
  creative_features_spec?: Record<string, unknown> | null;
  degrees_of_freedom_spec?: Record<string, unknown> | null;
  tracking_specs?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  conversion_specs?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  url_parameters: Record<string, unknown>;
  meta_pixel_id?: string | null;
  conversion_event_name?: string | null;
  status: DraftStatus;
  meta_status: string;
  meta_adcreative_id?: string | null;
  meta_ad_id?: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  last_error?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type AdDraftWithCreative = AdDraft & {
  creative: Creative;
};

export type AdSetDraftWithAds = AdSetDraft & {
  ads: AdDraftWithCreative[];
};

export type CampaignDraftTree = CampaignDraft & {
  adsets: AdSetDraftWithAds[];
};

export type CampaignDraftPayload = {
  name?: string;
  objective?: string;
  buyingType?: string;
  specialAdCategories?: string[];
  campaignSettingsMode?: string;
  budgetStrategy?: string;
  campaignDailyBudgetMinor?: number | null;
  campaignLifetimeBudgetMinor?: number | null;
  bidStrategy?: string | null;
  spendCapMinor?: number | null;
  specialAdCategoryCountries?: string[];
  promotedObject?: Record<string, unknown> | null;
  budgetScheduleSpecs?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  isSkadnetworkAttribution?: boolean;
  abTestEnabled?: boolean;
  liveAdsEnabled?: boolean;
  status?: DraftStatus;
  metaStatus?: string;
  metadata?: Record<string, unknown>;
};

export type AdSetDraftPayload = {
  name?: string;
  destinationType?: string;
  conversionEvent?: string | null;
  optimizationGoal?: string;
  billingEvent?: string;
  bidStrategy?: string | null;
  bidAmountMinor?: number | null;
  dailyBudgetMinor?: number | null;
  lifetimeBudgetMinor?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  targeting?: Record<string, unknown>;
  promotedObject?: Record<string, unknown> | null;
  attributionSetting?: string | null;
  isDynamicCreative?: boolean;
  useAdvantageAudience?: boolean;
  savedAudienceId?: string | null;
  audienceControls?: Record<string, unknown>;
  audienceRecommendations?: Record<string, unknown>;
  placementMode?: string;
  placementSettings?: Record<string, unknown>;
  brandSafetyControls?: Record<string, unknown>;
  pacingType?: string | null;
  adsetSchedule?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  frequencyControlSpecs?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  beneficiary?: string | null;
  payor?: string | null;
  status?: DraftStatus;
  metaStatus?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

export type AdDraftPayload = {
  creativeId?: number;
  name?: string | null;
  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;
  ctaType?: string;
  ctaLink?: string | null;
  displayLink?: string | null;
  urlTags?: string | null;
  facebookPageId?: string | null;
  instagramActorId?: string | null;
  threadsActorId?: string | null;
  brandedContentSponsorPageId?: string | null;
  brandIdentitySettings?: Record<string, unknown>;
  destinationType?: string;
  destinationUrl?: string | null;
  leadFormId?: string | null;
  leadFormName?: string | null;
  instantExperienceId?: string | null;
  appDeepLinkUrl?: string | null;
  phoneNumber?: string | null;
  whatsappPhoneNumber?: string | null;
  primaryTextVariants?: string[];
  headlineVariants?: string[];
  descriptionVariants?: string[];
  objectStorySpec?: Record<string, unknown> | null;
  assetFeedSpec?: Record<string, unknown> | null;
  callToActionValue?: Record<string, unknown> | null;
  creativeFeaturesSpec?: Record<string, unknown> | null;
  degreesOfFreedomSpec?: Record<string, unknown> | null;
  trackingSpecs?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  conversionSpecs?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  urlParameters?: Record<string, unknown>;
  metaPixelId?: string | null;
  conversionEventName?: string | null;
  status?: DraftStatus;
  metaStatus?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
};

export type LaunchPlacement = {
  campaignId: string;
  campaignName?: string;
  adSetId: string;
  adSetName?: string;
};

export type LaunchRequest = LaunchPlacement & {
  projectType: string;
  adText: string;
  headline?: string | null;
  headlineVariants?: string[];
  adTextVariants?: string[];
  ctaType?: string;
  ctaTypeVariants?: string[];
  ctaLink: string;
  audience: string;
  location: string;
};

export type CreativeUpdateRequest = {
  projectType?: string | null;
  adText?: string | null;
  headline?: string | null;
  headlineVariants?: string[];
  adTextVariants?: string[];
  ctaType?: string | null;
  ctaTypeVariants?: string[];
  ctaLink?: string | null;
  audience?: string | null;
  location?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  adSetId?: string | null;
  adSetName?: string | null;
};

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed: ${response.status}`);
  }

  return response.json();
}

function positiveInteger(value: unknown, label: string) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return numberValue;
}

export async function fetchCreatives(kind: CreativeListKind): Promise<Creative[]> {
  const path =
    kind === "launched"
      ? "/api/creatives/launched"
      : kind === "ready"
        ? "/api/creatives"
        : `/api/creatives?status=${encodeURIComponent(kind)}`;
  const response = await apiFetch<{ creatives: Creative[] }>(path);
  return response.creatives;
}

export async function uploadCreative(payload: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  projectType?: string;
  adText?: string;
  headline?: string;
  headlineVariants?: string[];
  adTextVariants?: string[];
  ctaType?: string;
  ctaTypeVariants?: string[];
  ctaLink?: string;
}): Promise<Creative> {
  const response = await apiFetch<{ creative: Creative }>("/api/creatives/upload", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.creative;
}

export async function launchCreative(id: number, payload: LaunchRequest): Promise<Creative> {
  const response = await apiFetch<{ creative: Creative }>(`/api/launch/${id}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.creative;
}

export async function updateCreative(id: number, payload: CreativeUpdateRequest): Promise<Creative> {
  const response = await apiFetch<{ creative: Creative }>(`/api/creatives/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return response.creative;
}

export type CreativeCopySuggestionRequest = {
  projectType?: string | null;
  adText?: string | null;
  headline?: string | null;
  headlineVariants?: string[];
  adTextVariants?: string[];
  ctaType?: string | null;
  ctaTypeVariants?: string[];
  ctaLink?: string | null;
  audience?: string | null;
  location?: string | null;
};

export type CreativeCopySuggestion = {
  adTextVariants: string[];
  headline?: string | null;
  headlineVariants: string[];
  ctaTypeVariants: string[];
  reasoning?: string | null;
};

export async function generateCreativeCopySuggestions(
  id: number,
  payload: CreativeCopySuggestionRequest
): Promise<CreativeCopySuggestion> {
  const response = await apiFetch<{ suggestions: CreativeCopySuggestion }>(`/api/creatives/${id}/copy-suggestions`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.suggestions;
}

export async function fetchCampaigns(): Promise<MetaCampaign[]> {
  const response = await apiFetch<{ campaigns: MetaCampaign[] }>("/api/campaigns");
  return response.campaigns;
}

export async function fetchAdSets(campaignId: string): Promise<MetaAdSet[]> {
  const response = await apiFetch<{ adsets: MetaAdSet[] }>(
    `/api/campaigns/${encodeURIComponent(campaignId)}/adsets`
  );
  return response.adsets;
}

export async function searchTargetingLocations(input: {
  query: string;
  locationTypes?: string[];
  countryCode?: string;
  limit?: number;
}): Promise<MetaTargetingLocation[]> {
  const params = new URLSearchParams({
    q: input.query,
    locationTypes: (input.locationTypes?.length ? input.locationTypes : ["country", "region", "city"]).join(","),
    limit: String(input.limit ?? 20)
  });
  if (input.countryCode) {
    params.set("countryCode", input.countryCode);
  }

  const response = await apiFetch<{ locations: MetaTargetingLocation[] }>(
    `/api/campaigns/targeting/locations?${params.toString()}`
  );
  return response.locations;
}

export async function syncCampaigns(): Promise<number> {
  const response = await apiFetch<{ campaigns: Array<unknown> }>("/api/campaigns/sync", {
    method: "POST",
    body: JSON.stringify({})
  });
  return response.campaigns.length;
}

export async function fetchCampaignDrafts(statuses?: DraftStatus[]): Promise<CampaignDraft[]> {
  const query = statuses?.length ? `?status=${encodeURIComponent(statuses.join(","))}` : "";
  const response = await apiFetch<{ campaignDrafts: CampaignDraft[] }>(`/api/campaign-drafts${query}`);
  return response.campaignDrafts;
}

export async function fetchCampaignDraft(id: number): Promise<CampaignDraftTree> {
  const response = await apiFetch<{ campaignDraft: CampaignDraftTree }>(`/api/campaign-drafts/${id}`);
  return response.campaignDraft;
}

export async function createCampaignDraft(payload: CampaignDraftPayload & { name: string }): Promise<CampaignDraft> {
  const response = await apiFetch<{ campaignDraft: CampaignDraft }>("/api/campaign-drafts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.campaignDraft;
}

export async function updateCampaignDraft(id: number, payload: CampaignDraftPayload): Promise<CampaignDraft> {
  const response = await apiFetch<{ campaignDraft: CampaignDraft }>(`/api/campaign-drafts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return response.campaignDraft;
}

export async function createAdSetDraft(
  campaignDraftId: number,
  payload: AdSetDraftPayload & { name: string }
): Promise<AdSetDraft> {
  const response = await apiFetch<{ adSetDraft: AdSetDraft }>(`/api/campaign-drafts/${campaignDraftId}/adsets`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.adSetDraft;
}

export async function updateAdSetDraft(id: number, payload: AdSetDraftPayload): Promise<AdSetDraft> {
  const response = await apiFetch<{ adSetDraft: AdSetDraft }>(`/api/adset-drafts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return response.adSetDraft;
}

export async function createAdDraft(
  adSetDraftId: number,
  payload: AdDraftPayload & { creativeId: number }
): Promise<AdDraft> {
  const requestPayload = {
    ...payload,
    creativeId: positiveInteger(payload.creativeId, "Creative ID")
  };
  const response = await apiFetch<{ adDraft: AdDraft }>(`/api/adset-drafts/${adSetDraftId}/ads`, {
    method: "POST",
    body: JSON.stringify(requestPayload)
  });
  return response.adDraft;
}

export async function updateAdDraft(id: number, payload: AdDraftPayload): Promise<AdDraft> {
  const requestPayload =
    payload.creativeId === undefined
      ? payload
      : {
          ...payload,
          creativeId: positiveInteger(payload.creativeId, "Creative ID")
        };
  const response = await apiFetch<{ adDraft: AdDraft }>(`/api/ad-drafts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(requestPayload)
  });
  return response.adDraft;
}
