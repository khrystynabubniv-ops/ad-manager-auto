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
