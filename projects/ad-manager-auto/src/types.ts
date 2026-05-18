export type AssetType = "image" | "video";

export type Creative = {
  id: number;
  notion_task_id: string;
  notion_task_url: string | null;
  source_file_id: string;
  source_file_name: string | null;
  asset_id: string | null;
  asset_type: AssetType | null;
  ad_text: string | null;
  cta_link: string | null;
  audience: string | null;
  location: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  project_type: string | null;
  status: string;
  google_drive_url: string | null;
  preview_url: string | null;
  facebook_ad_id: string | null;
  created_at: string;
  updated_at: string;
  uploaded_at: string | null;
  launched_at: string | null;
};

export type NotionCreativeFields = {
  notionTaskId: string;
  notionTaskUrl?: string;
  name: string;
  parentTaskId?: string;
  subItemIds?: string[];
  designStatus?: string;
  adStatus?: string;
  adText?: string;
  ctaLink?: string;
  googleDriveLink?: string;
  finalProject?: string;
  projectType?: string;
  audience?: string;
  location?: string;
  facebookCampaignName?: string;
  facebookCampaignId?: string;
  facebookCampaignPageId?: string;
  facebookAssetId?: string;
  facebookAssetType?: AssetType;
  facebookAdId?: string;
};

export type DownloadedDriveFile = {
  fileId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  size?: number;
};

export type FacebookCampaign = {
  id: string;
  name: string;
  status?: string;
  objective?: string;
};

export type FacebookAdSet = {
  id: string;
  name: string;
  campaign_id: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  targeting?: Record<string, unknown>;
};

export type FacebookTargetingLocation = {
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
  campaign_daily_budget_minor: number | null;
  campaign_lifetime_budget_minor: number | null;
  bid_strategy: string | null;
  spend_cap_minor: number | null;
  special_ad_category_countries: string[];
  promoted_object: Record<string, unknown> | null;
  budget_schedule_specs: Record<string, unknown> | Array<Record<string, unknown>> | null;
  is_skadnetwork_attribution: boolean;
  a_b_test_enabled: boolean;
  live_ads_enabled: boolean;
  status: DraftStatus;
  meta_status: string;
  meta_campaign_id: string | null;
  metadata: Record<string, unknown>;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdSetDraft = {
  id: number;
  campaign_draft_id: number;
  name: string;
  destination_type: string;
  conversion_event: string | null;
  optimization_goal: string;
  billing_event: string;
  bid_strategy: string | null;
  bid_amount_minor: number | null;
  daily_budget_minor: number | null;
  lifetime_budget_minor: number | null;
  start_time: string | null;
  end_time: string | null;
  targeting: Record<string, unknown>;
  promoted_object: Record<string, unknown> | null;
  attribution_setting: string | null;
  is_dynamic_creative: boolean;
  use_advantage_audience: boolean;
  saved_audience_id: string | null;
  audience_controls: Record<string, unknown>;
  audience_recommendations: Record<string, unknown>;
  placement_mode: string;
  placement_settings: Record<string, unknown>;
  brand_safety_controls: Record<string, unknown>;
  pacing_type: string | null;
  adset_schedule: Record<string, unknown> | Array<Record<string, unknown>> | null;
  frequency_control_specs: Record<string, unknown> | Array<Record<string, unknown>> | null;
  beneficiary: string | null;
  payor: string | null;
  status: DraftStatus;
  meta_status: string;
  meta_adset_id: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdDraft = {
  id: number;
  adset_draft_id: number;
  creative_id: number;
  name: string | null;
  primary_text: string | null;
  headline: string | null;
  description: string | null;
  cta_type: string;
  cta_link: string | null;
  display_link: string | null;
  url_tags: string | null;
  facebook_page_id: string | null;
  instagram_actor_id: string | null;
  threads_actor_id: string | null;
  branded_content_sponsor_page_id: string | null;
  brand_identity_settings: Record<string, unknown>;
  destination_type: string;
  destination_url: string | null;
  lead_form_id: string | null;
  lead_form_name: string | null;
  instant_experience_id: string | null;
  app_deep_link_url: string | null;
  phone_number: string | null;
  whatsapp_phone_number: string | null;
  primary_text_variants: string[];
  headline_variants: string[];
  description_variants: string[];
  object_story_spec: Record<string, unknown> | null;
  asset_feed_spec: Record<string, unknown> | null;
  call_to_action_value: Record<string, unknown> | null;
  creative_features_spec: Record<string, unknown> | null;
  degrees_of_freedom_spec: Record<string, unknown> | null;
  tracking_specs: Record<string, unknown> | Array<Record<string, unknown>> | null;
  conversion_specs: Record<string, unknown> | Array<Record<string, unknown>> | null;
  url_parameters: Record<string, unknown>;
  meta_pixel_id: string | null;
  conversion_event_name: string | null;
  status: DraftStatus;
  meta_status: string;
  meta_adcreative_id: string | null;
  meta_ad_id: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  last_error: string | null;
  published_at: string | null;
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
