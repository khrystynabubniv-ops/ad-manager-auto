import axios, { AxiosError } from "axios";
import FormData from "form-data";
import { env, requireEnv } from "../config/env.js";
import { logger } from "../logger.js";
import { AssetType, DownloadedDriveFile, FacebookAdSet, FacebookCampaign, FacebookTargetingLocation } from "../types.js";
import { stableHash } from "../utils/crypto.js";
import { getErrorMessage } from "../utils/errors.js";
import { detectAssetType } from "../utils/mime.js";
import { withRetry } from "../utils/retry.js";
import { recordFacebookRequest } from "./db.js";

type FacebookAssetUploadResult = {
  assetId: string;
  assetType: AssetType;
  previewUrl?: string;
};

function adAccountId(): string {
  const raw = requireEnv("FB_AD_ACCOUNT_ID");
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

function baseUrl(endpoint: string): string {
  return `https://graph.facebook.com/${env.FB_GRAPH_VERSION}/${endpoint.replace(/^\//, "")}`;
}

function retryable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }
  const status = error.response?.status;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function graphGet<T>(endpoint: string, params: Record<string, string>, requestId?: string): Promise<T> {
  const url = baseUrl(endpoint);
  return withRetry(
    async () => {
      try {
        const response = await axios.get<T>(url, {
          params: { ...params, access_token: requireEnv("FB_ACCESS_TOKEN") }
        });
        await recordFacebookRequest({
          requestId,
          method: "GET",
          endpoint,
          statusCode: response.status,
          responseBody: response.data
        });
        return response.data;
      } catch (error) {
        await recordFacebookRequest({
          requestId,
          method: "GET",
          endpoint,
          statusCode: axios.isAxiosError(error) ? error.response?.status : undefined,
          error: getErrorMessage(error),
          responseBody: axios.isAxiosError(error) ? error.response?.data : undefined
        });
        throw error;
      }
    },
    {
      shouldRetry: retryable,
      onRetry: (error, attempt, delayMs) =>
        logger.warn({ requestId, endpoint, attempt, delayMs, error: getErrorMessage(error) }, "Retrying Facebook GET")
    }
  );
}

async function graphPost<T>(
  endpoint: string,
  body: Record<string, string>,
  requestId?: string
): Promise<T> {
  const url = baseUrl(endpoint);
  const params = new URLSearchParams({ ...body, access_token: requireEnv("FB_ACCESS_TOKEN") });

  return withRetry(
    async () => {
      try {
        const response = await axios.post<T>(url, params, {
          headers: { "content-type": "application/x-www-form-urlencoded" }
        });
        await recordFacebookRequest({
          requestId,
          method: "POST",
          endpoint,
          statusCode: response.status,
          requestBody: body,
          responseBody: response.data
        });
        return response.data;
      } catch (error) {
        await recordFacebookRequest({
          requestId,
          method: "POST",
          endpoint,
          statusCode: axios.isAxiosError(error) ? error.response?.status : undefined,
          requestBody: body,
          responseBody: axios.isAxiosError(error) ? error.response?.data : undefined,
          error: getErrorMessage(error)
        });
        throw error;
      }
    },
    {
      shouldRetry: retryable,
      onRetry: (error, attempt, delayMs) =>
        logger.warn({ requestId, endpoint, attempt, delayMs, error: getErrorMessage(error) }, "Retrying Facebook POST")
    }
  );
}

async function graphMultipart<T>(
  endpoint: string,
  form: FormData,
  requestLog: Record<string, unknown>,
  requestId?: string
): Promise<T> {
  const url = baseUrl(endpoint);

  return withRetry(
    async () => {
      try {
        const response = await axios.post<T>(url, form, {
          params: { access_token: requireEnv("FB_ACCESS_TOKEN") },
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        });
        await recordFacebookRequest({
          requestId,
          method: "POST",
          endpoint,
          statusCode: response.status,
          requestBody: requestLog,
          responseBody: response.data
        });
        return response.data;
      } catch (error) {
        await recordFacebookRequest({
          requestId,
          method: "POST",
          endpoint,
          statusCode: axios.isAxiosError(error) ? error.response?.status : undefined,
          requestBody: requestLog,
          responseBody: axios.isAxiosError(error) ? error.response?.data : undefined,
          error: getErrorMessage(error)
        });
        throw error;
      }
    },
    {
      shouldRetry: retryable,
      onRetry: (error, attempt, delayMs) =>
        logger.warn(
          { requestId, endpoint, attempt, delayMs, error: getErrorMessage(error) },
          "Retrying Facebook multipart POST"
        )
    }
  );
}

function facebookErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as any;
    return data?.error?.message ?? data?.message ?? error.message;
  }
  return getErrorMessage(error);
}

export async function uploadCreativeAsset(
  file: DownloadedDriveFile,
  requestId?: string
): Promise<FacebookAssetUploadResult> {
  const assetType = detectAssetType(file.fileName, file.mimeType);

  if (env.MOCK_FACEBOOK) {
    const assetId = `mock_${assetType}_${stableHash(file.fileId)}`;
    logger.warn({ requestId, assetId, assetType }, "MOCK_FACEBOOK enabled; skipping real asset upload");
    return { assetId, assetType };
  }

  try {
    return assetType === "image"
      ? await uploadImageAsset(file, requestId)
      : await uploadVideoAsset(file, requestId);
  } catch (error) {
    throw new Error(`Facebook asset upload failed: ${facebookErrorMessage(error)}`);
  }
}

async function uploadImageAsset(
  file: DownloadedDriveFile,
  requestId?: string
): Promise<FacebookAssetUploadResult> {
  const form = new FormData();
  form.append("filename", file.buffer, {
    filename: file.fileName,
    contentType: file.mimeType
  });

  const response = await graphMultipart<any>(
    `${adAccountId()}/adimages`,
    form,
    { fileName: file.fileName, mimeType: file.mimeType, bytes: file.buffer.length },
    requestId
  );

  const firstImage = Object.values(response.images ?? {})[0] as any;
  const assetId = firstImage?.hash;
  if (!assetId) {
    throw new Error(`Facebook image upload response did not include image hash`);
  }

  return {
    assetId,
    assetType: "image",
    previewUrl: firstImage.url
  };
}

async function uploadVideoAsset(
  file: DownloadedDriveFile,
  requestId?: string
): Promise<FacebookAssetUploadResult> {
  const form = new FormData();
  form.append("source", file.buffer, {
    filename: file.fileName,
    contentType: file.mimeType
  });

  const response = await graphMultipart<any>(
    `${adAccountId()}/advideos`,
    form,
    { fileName: file.fileName, mimeType: file.mimeType, bytes: file.buffer.length },
    requestId
  );

  if (!response.id) {
    throw new Error("Facebook video upload response did not include video id");
  }

  return {
    assetId: response.id,
    assetType: "video"
  };
}

export async function listFacebookCampaigns(requestId?: string): Promise<FacebookCampaign[]> {
  if (env.MOCK_FACEBOOK) {
    return [
      {
        id: "mock_campaign_1",
        name: "Mock Campaign",
        status: "ACTIVE",
        objective: "OUTCOME_TRAFFIC"
      }
    ];
  }

  const response = await graphGet<any>(
    `${adAccountId()}/campaigns`,
    {
      fields: "id,name,status,objective",
      limit: "200"
    },
    requestId
  );

  return (response.data ?? []).map((campaign: any) => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective
  }));
}

function mapFacebookAdSet(adSet: any): FacebookAdSet {
  return {
    id: adSet.id,
    name: adSet.name,
    campaign_id: adSet.campaign_id,
    status: adSet.status,
    effective_status: adSet.effective_status,
    optimization_goal: adSet.optimization_goal,
    billing_event: adSet.billing_event,
    daily_budget: adSet.daily_budget,
    lifetime_budget: adSet.lifetime_budget,
    targeting: adSet.targeting
  };
}

const adSetFields = [
  "id",
  "name",
  "campaign_id",
  "status",
  "effective_status",
  "optimization_goal",
  "billing_event",
  "daily_budget",
  "lifetime_budget",
  "targeting"
].join(",");

export async function listFacebookAdSets(input: { campaignId: string; requestId?: string }): Promise<FacebookAdSet[]> {
  if (env.MOCK_FACEBOOK) {
    return [
      {
        id: "mock_adset_1",
        name: "Mock AdSet",
        campaign_id: input.campaignId,
        status: "ACTIVE",
        effective_status: "ACTIVE",
        optimization_goal: "LINK_CLICKS",
        billing_event: "IMPRESSIONS",
        daily_budget: String(env.FB_DEFAULT_DAILY_BUDGET_MINOR ?? 1000),
        targeting: JSON.parse(env.FB_DEFAULT_TARGETING_JSON)
      }
    ];
  }

  const response = await graphGet<any>(
    `${input.campaignId}/adsets`,
    {
      fields: adSetFields,
      limit: "500"
    },
    input.requestId
  );

  return (response.data ?? []).map(mapFacebookAdSet);
}

export async function searchFacebookTargetingLocations(input: {
  query: string;
  locationTypes?: string[];
  countryCode?: string;
  limit?: number;
  requestId?: string;
}): Promise<FacebookTargetingLocation[]> {
  const query = input.query.trim();
  if (query.length < 2) {
    return [];
  }

  if (env.MOCK_FACEBOOK) {
    const mockLocations: FacebookTargetingLocation[] = [
      { key: "US", name: "United States", type: "country", country_code: "US", country_name: "United States" },
      { key: "UA", name: "Ukraine", type: "country", country_code: "UA", country_name: "Ukraine" },
      { key: "PL", name: "Poland", type: "country", country_code: "PL", country_name: "Poland" },
      { key: "2420605", name: "Kyiv", type: "city", country_code: "UA", country_name: "Ukraine", region: "Kyiv City" },
      { key: "2490299", name: "Warsaw", type: "city", country_code: "PL", country_name: "Poland", region: "Mazowieckie" },
      { key: "2420379", name: "New York", type: "city", country_code: "US", country_name: "United States", region: "New York" }
    ];
    const normalized = query.toLowerCase();
    const locationTypes = new Set(input.locationTypes ?? []);
    return mockLocations
      .filter((location) => !locationTypes.size || locationTypes.has(location.type))
      .filter(
        (location) =>
          location.name.toLowerCase().includes(normalized) ||
          location.country_code?.toLowerCase().includes(normalized)
      )
      .slice(0, input.limit ?? 25);
  }

  const params: Record<string, string> = {
    type: "adgeolocation",
    q: query,
    limit: String(input.limit ?? 25),
    location_types: JSON.stringify(input.locationTypes?.length ? input.locationTypes : ["country", "region", "city"])
  };
  if (input.countryCode) {
    params.country_code = input.countryCode;
  }

  const response = await graphGet<any>("search", params, input.requestId);
  return (response.data ?? []).map((location: any) => ({
    key: String(location.key ?? location.country_code ?? location.id ?? ""),
    name: String(location.name ?? location.country_name ?? location.key ?? ""),
    type: String(location.type ?? ""),
    country_code: location.country_code,
    country_name: location.country_name,
    region: location.region,
    region_id: location.region_id,
    primary_city_id: location.primary_city_id,
    supports_region: location.supports_region
  })).filter((location: FacebookTargetingLocation) => location.key && location.name && location.type);
}

export async function getFacebookAdSet(adSetId: string, requestId?: string): Promise<FacebookAdSet> {
  if (env.MOCK_FACEBOOK) {
    return {
      id: adSetId,
      name: adSetId === "mock_adset_1" ? "Mock AdSet" : `Mock AdSet ${adSetId}`,
      campaign_id: "mock_campaign_1",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      optimization_goal: "LINK_CLICKS",
      billing_event: "IMPRESSIONS",
      daily_budget: String(env.FB_DEFAULT_DAILY_BUDGET_MINOR ?? 1000),
      targeting: JSON.parse(env.FB_DEFAULT_TARGETING_JSON)
    };
  }

  const adSet = await graphGet<any>(adSetId, { fields: adSetFields }, requestId);
  return mapFacebookAdSet(adSet);
}

export async function findOrCreateAdSet(input: {
  campaignId: string;
  location: string;
  audience: string;
  requestId?: string;
}): Promise<string> {
  const name = adSetName(input.campaignId, input.location, input.audience);

  if (env.MOCK_FACEBOOK) {
    return `mock_adset_${stableHash(name)}`;
  }

  const adSets = await graphGet<any>(
    `${input.campaignId}/adsets`,
    { fields: "id,name,status", limit: "200" },
    input.requestId
  );
  const existing = (adSets.data ?? []).find((adSet: any) => adSet.name === name);
  if (existing?.id) {
    return existing.id;
  }

  if (!env.FB_ENABLE_ADSET_CREATE) {
    throw new Error(
      `AdSet "${name}" does not exist. Create it in Meta first or set FB_ENABLE_ADSET_CREATE=true with default budget/targeting.`
    );
  }

  if (!env.FB_DEFAULT_DAILY_BUDGET_MINOR) {
    throw new Error("FB_DEFAULT_DAILY_BUDGET_MINOR is required when FB_ENABLE_ADSET_CREATE=true");
  }

  const targeting = JSON.parse(env.FB_DEFAULT_TARGETING_JSON);
  const created = await graphPost<any>(
    `${adAccountId()}/adsets`,
    {
      name,
      campaign_id: input.campaignId,
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      daily_budget: String(env.FB_DEFAULT_DAILY_BUDGET_MINOR),
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: JSON.stringify(targeting),
      status: "ACTIVE"
    },
    input.requestId
  );

  if (!created.id) {
    throw new Error("Facebook AdSet creation response did not include id");
  }
  return created.id;
}

export async function createAd(input: {
  name: string;
  adSetId: string;
  assetId: string;
  assetType: AssetType;
  adText: string;
  ctaLink: string;
  requestId?: string;
}): Promise<string> {
  if (env.MOCK_FACEBOOK) {
    return `mock_ad_${stableHash(`${input.name}:${input.assetId}`)}`;
  }

  const pageId = requireEnv("FB_PAGE_ID");
  const creativeBody =
    input.assetType === "image"
      ? {
          page_id: pageId,
          link_data: {
            message: input.adText,
            link: input.ctaLink,
            image_hash: input.assetId,
            call_to_action: {
              type: "LEARN_MORE",
              value: { link: input.ctaLink }
            }
          }
        }
      : {
          page_id: pageId,
          video_data: {
            video_id: input.assetId,
            message: input.adText,
            title: input.name,
            call_to_action: {
              type: "LEARN_MORE",
              value: { link: input.ctaLink }
            }
          }
        };

  const creative = await graphPost<any>(
    `${adAccountId()}/adcreatives`,
    {
      name: `${input.name}_creative`,
      object_story_spec: JSON.stringify(creativeBody)
    },
    input.requestId
  );

  if (!creative.id) {
    throw new Error("Facebook Ad Creative creation response did not include id");
  }

  const ad = await graphPost<any>(
    `${adAccountId()}/ads`,
    {
      name: input.name,
      adset_id: input.adSetId,
      creative: JSON.stringify({ creative_id: creative.id }),
      status: env.FB_DEFAULT_AD_STATUS
    },
    input.requestId
  );

  if (!ad.id) {
    throw new Error("Facebook Ad creation response did not include id");
  }

  return ad.id;
}

export function adSetName(campaignId: string, location: string, audience: string): string {
  return `${campaignId}_${location}_${stableHash(audience)}`;
}

export function toFacebookError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return facebookErrorMessage(error as AxiosError);
  }
  return getErrorMessage(error);
}
