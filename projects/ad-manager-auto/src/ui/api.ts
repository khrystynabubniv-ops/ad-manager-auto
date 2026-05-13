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

export type LaunchPlacement = {
  campaignId: string;
  campaignName?: string;
  adSetId: string;
  adSetName?: string;
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

export async function launchCreative(id: number, placement: LaunchPlacement): Promise<Creative> {
  const response = await apiFetch<{ creative: Creative }>(`/api/launch/${id}`, {
    method: "POST",
    body: JSON.stringify(placement)
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
