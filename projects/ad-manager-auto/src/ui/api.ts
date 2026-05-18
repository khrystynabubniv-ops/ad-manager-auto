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

export type CreativeListKind = "ready" | "launched" | "needs_ad_details" | "upload_failed";

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
  name?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  ctaType?: string;
  ctaLink?: string;
  displayLink?: string;
  urlTags?: string;
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
  ctaLink: string;
  audience: string;
  location: string;
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

export async function launchCreative(id: number, payload: LaunchRequest): Promise<Creative> {
  const response = await apiFetch<{ creative: Creative }>(`/api/launch/${id}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.creative;
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
  const response = await apiFetch<{ adDraft: AdDraft }>(`/api/adset-drafts/${adSetDraftId}/ads`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.adDraft;
}

export async function updateAdDraft(id: number, payload: AdDraftPayload): Promise<AdDraft> {
  const response = await apiFetch<{ adDraft: AdDraft }>(`/api/ad-drafts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return response.adDraft;
}
