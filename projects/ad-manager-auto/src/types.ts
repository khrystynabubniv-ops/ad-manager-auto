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

export type DraftStatus = "draft" | "publishing" | "published" | "publish_failed" | "archived";

export type CampaignDraft = {
  id: number;
  name: string;
  objective: string;
  buying_type: string;
  special_ad_categories: string[];
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
  optimization_goal: string;
  billing_event: string;
  bid_strategy: string | null;
  daily_budget_minor: number | null;
  lifetime_budget_minor: number | null;
  start_time: string | null;
  end_time: string | null;
  targeting: Record<string, unknown>;
  promoted_object: Record<string, unknown> | null;
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
