import axios, { AxiosError } from "axios";
import FormData from "form-data";
import { env, requireEnv } from "../config/env.js";
import { logger } from "../logger.js";
import {
  AssetType,
  CreativeAssetPlacement,
  DownloadedDriveFile,
  FacebookAdSet,
  FacebookCampaign,
  FacebookTargetingLocation
} from "../types.js";
import { normalizeAssetFileName } from "../utils/assetNaming.js";
import { stableHash } from "../utils/crypto.js";
import { getErrorMessage } from "../utils/errors.js";
import { detectAssetType } from "../utils/mime.js";
import { withRetry } from "../utils/retry.js";
import { normalizeAdTextList, normalizeCtaTypeList } from "../shared/creativeCopy.js";
import { recordFacebookRequest } from "./db.js";

type FacebookAssetUploadResult = {
  assetId: string;
  assetType: AssetType;
  previewUrl?: string;
};

type PlacementAssetRole = CreativeAssetPlacement | "right_search";

type LabeledPlacementAsset = {
  assetId: string;
  assetType: AssetType;
  placement: CreativeAssetPlacement;
  role: PlacementAssetRole;
  label: string;
  imageCrops?: Record<string, [[number, number], [number, number]]>;
};

type AssetFeedLabelKind = "body" | "title" | "link_url" | "call_to_action";

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
          error: facebookErrorMessage(error),
          responseBody: axios.isAxiosError(error) ? error.response?.data : undefined
        });
        throw error;
      }
    },
    {
      shouldRetry: retryable,
      onRetry: (error, attempt, delayMs) =>
        logger.warn({ requestId, endpoint, attempt, delayMs, error: facebookErrorMessage(error) }, "Retrying Facebook GET")
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
          error: facebookErrorMessage(error)
        });
        throw error;
      }
    },
    {
      shouldRetry: retryable,
      onRetry: (error, attempt, delayMs) =>
        logger.warn({ requestId, endpoint, attempt, delayMs, error: facebookErrorMessage(error) }, "Retrying Facebook POST")
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
          error: facebookErrorMessage(error)
        });
        throw error;
      }
    },
    {
      shouldRetry: retryable,
      onRetry: (error, attempt, delayMs) =>
        logger.warn(
          { requestId, endpoint, attempt, delayMs, error: facebookErrorMessage(error) },
          "Retrying Facebook multipart POST"
        )
    }
  );
}

function facebookErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as any;
    const facebookError = data?.error;
    const message = facebookError?.error_user_msg ?? facebookError?.message ?? data?.message ?? error.message;
    const errorData =
      typeof facebookError?.error_data === "string"
        ? facebookError.error_data
        : facebookError?.error_data
          ? JSON.stringify(facebookError.error_data)
          : undefined;
    const details = [
      facebookError?.code ? `code ${facebookError.code}` : undefined,
      facebookError?.error_subcode ? `subcode ${facebookError.error_subcode}` : undefined,
      facebookError?.fbtrace_id ? `trace ${facebookError.fbtrace_id}` : undefined,
      errorData ? `details ${errorData.slice(0, 500)}` : undefined
    ].filter(Boolean);
    return details.length ? `${message} (${details.join(", ")})` : message;
  }
  return getErrorMessage(error);
}

function isMockCreativeAsset(input: { assetId: string; assetType: AssetType }): boolean {
  return input.assetId.startsWith(`mock_${input.assetType}_`);
}

export async function uploadCreativeAsset(
  file: DownloadedDriveFile,
  requestId?: string
): Promise<FacebookAssetUploadResult> {
  const uploadFileName = normalizeAssetFileName(file.fileName);
  const uploadFile = uploadFileName === file.fileName ? file : { ...file, fileName: uploadFileName };
  const assetType = detectAssetType(uploadFile.fileName, uploadFile.mimeType);

  if (env.MOCK_FACEBOOK) {
    const assetId = `mock_${assetType}_${stableHash(file.fileId)}`;
    logger.warn({ requestId, assetId, assetType }, "MOCK_FACEBOOK enabled; skipping real asset upload");
    return { assetId, assetType };
  }

  try {
    return assetType === "image"
      ? await uploadImageAsset(uploadFile, requestId)
      : await uploadVideoAsset(uploadFile, requestId);
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
        objective: "OUTCOME_TRAFFIC",
        configured_status: "ACTIVE",
        start_time: null,
        stop_time: null
      }
    ];
  }

  const response = await graphGet<any>(
    `${adAccountId()}/campaigns`,
    {
      fields: "id,name,status,objective,configured_status,start_time,stop_time",
      limit: "200"
    },
    requestId
  );

  return (response.data ?? []).map((campaign: any) => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective,
    configured_status: campaign.configured_status,
    start_time: campaign.start_time ?? null,
    stop_time: campaign.stop_time ?? null
  }));
}

export async function getFacebookCampaign(campaignId: string, requestId?: string): Promise<FacebookCampaign> {
  if (env.MOCK_FACEBOOK) {
    return {
      id: campaignId,
      name: campaignId === "mock_campaign_1" ? "Mock Campaign" : `Mock Campaign ${campaignId}`,
      status: "ACTIVE",
      objective: "OUTCOME_TRAFFIC",
      configured_status: "ACTIVE",
      start_time: null,
      stop_time: null
    };
  }

  const campaign = await graphGet<any>(
    campaignId,
    { fields: "id,name,status,objective,configured_status,start_time,stop_time" },
    requestId
  );
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    objective: campaign.objective,
    configured_status: campaign.configured_status,
    start_time: campaign.start_time ?? null,
    stop_time: campaign.stop_time ?? null
  };
}

function mapFacebookAdSet(adSet: any): FacebookAdSet {
  return {
    id: adSet.id,
    name: adSet.name,
    campaign_id: adSet.campaign_id,
    status: adSet.status,
    effective_status: adSet.effective_status,
    configured_status: adSet.configured_status,
    start_time: adSet.start_time ?? null,
    end_time: adSet.end_time ?? null,
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
  "configured_status",
  "start_time",
  "end_time",
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
        configured_status: "ACTIVE",
        start_time: null,
        end_time: null,
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
      configured_status: "ACTIVE",
      start_time: null,
      end_time: null,
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

function placementLabel(placement: CreativeAssetPlacement): string {
  return `asset_${placement}`;
}

function placementRoleLabel(role: PlacementAssetRole): string {
  return `asset_${role}`;
}

function assetLabel(name: string): { name: string } {
  return { name };
}

function placementCopyLabel(kind: AssetFeedLabelKind, role: PlacementAssetRole): string {
  return `${kind}_${role}`;
}

function placementCopyLabels(kind: AssetFeedLabelKind, roles: PlacementAssetRole[]): Array<{ name: string }> {
  return roles.map((role) => assetLabel(placementCopyLabel(kind, role)));
}

function objectStoryIdentity(pageId: string): { page_id: string; instagram_user_id?: string } {
  const instagramUserId = env.FB_INSTAGRAM_USER_ID?.trim() || env.FB_INSTAGRAM_ACTOR_ID?.trim();
  return instagramUserId ? { page_id: pageId, instagram_user_id: instagramUserId } : { page_id: pageId };
}

function placementCustomizationSpecs(role: PlacementAssetRole, assetType: AssetType): Array<Record<string, unknown>> {
  if (role === "feed") {
    return [
      {
        publisher_platforms: ["facebook"],
        facebook_positions: ["feed", "marketplace"]
      },
      {
        publisher_platforms: ["instagram"],
        instagram_positions: ["stream", "explore", "profile_feed", "ig_search"]
      }
    ];
  }

  if (role === "right_search") {
    return [
      {
        publisher_platforms: ["facebook"],
        facebook_positions: ["right_hand_column", "search"]
      }
    ];
  }

  if (role === "stories_reels") {
    return [
      {
        publisher_platforms: ["facebook"],
        facebook_positions: ["story", "facebook_reels"]
      },
      {
        publisher_platforms: ["instagram"],
        instagram_positions: ["story", "reels"]
      },
      {
        publisher_platforms: ["messenger"],
        messenger_positions: ["story"]
      }
    ];
  }

  if (role === "horizontal") {
    return assetType === "video"
      ? [
          {
            publisher_platforms: ["facebook"],
            facebook_positions: ["video_feeds", "instream_video"]
          }
        ]
      : [
          {
            publisher_platforms: ["facebook"],
            facebook_positions: ["right_hand_column", "search"]
          }
        ];
  }

  return [];
}

function cropBoxForRatio(width: number, height: number, ratioWidth: number, ratioHeight: number): [[number, number], [number, number]] {
  const ratio = ratioWidth / ratioHeight;
  let cropWidth = width;
  let cropHeight = Math.round(width / ratio);
  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = Math.round(height * ratio);
  }
  const x = Math.round((width - cropWidth) / 2);
  const y = Math.round((height - cropHeight) / 2);
  return [
    [x, y],
    [x + cropWidth, y + cropHeight]
  ];
}

function cropKeyForAsset(role: PlacementAssetRole, width: number, height: number): { key: string; ratio: [number, number] } {
  if (role === "stories_reels") return { key: "90x160", ratio: [90, 160] };
  if (role === "right_search" || role === "horizontal") return { key: "600x360", ratio: [600, 360] };
  const sourceRatio = width / height;
  return Math.abs(sourceRatio - 0.8) < Math.abs(sourceRatio - 1) ? { key: "400x500", ratio: [400, 500] } : { key: "100x100", ratio: [100, 100] };
}

async function imageDimensionsByHash(
  hashes: string[],
  requestId?: string
): Promise<Map<string, { width: number; height: number }>> {
  if (!hashes.length) return new Map();
  const response = await graphGet<any>(
    `${adAccountId()}/adimages`,
    {
      hashes: JSON.stringify([...new Set(hashes)]),
      fields: "hash,width,height,original_width,original_height"
    },
    requestId
  );
  const dimensions = new Map<string, { width: number; height: number }>();
  for (const image of response.data ?? []) {
    const width = Number(image.width ?? image.original_width);
    const height = Number(image.height ?? image.original_height);
    if (image.hash && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      dimensions.set(image.hash, { width, height });
    }
  }
  return dimensions;
}

async function placementAssetsWithImageCrops(
  assets: LabeledPlacementAsset[],
  requestId?: string
): Promise<LabeledPlacementAsset[]> {
  if (!assets.every((asset) => asset.assetType === "image")) return assets;
  const dimensions = await imageDimensionsByHash(
    assets.map((asset) => asset.assetId),
    requestId
  );
  return assets.map((asset) => {
    const size = dimensions.get(asset.assetId);
    if (!size) return asset;
    const crop = cropKeyForAsset(asset.role, size.width, size.height);
    return {
      ...asset,
      imageCrops: {
        [crop.key]: cropBoxForRatio(size.width, size.height, crop.ratio[0], crop.ratio[1])
      }
    };
  });
}

function labeledPlacementAssets(
  assets: Array<{ assetId: string; assetType: AssetType; placement: CreativeAssetPlacement }>
): LabeledPlacementAsset[] {
  const labeledAssets = assets.map((asset) => ({
    ...asset,
    role: asset.placement as PlacementAssetRole,
    label: placementLabel(asset.placement)
  }));
  const feedImage = labeledAssets.find((asset) => asset.assetType === "image" && asset.placement === "feed");
  const horizontalImage = labeledAssets.find((asset) => asset.assetType === "image" && asset.placement === "horizontal");
  if (feedImage && !horizontalImage) {
    labeledAssets.push({
      ...feedImage,
      role: "right_search",
      label: placementRoleLabel("right_search")
    });
  }
  return labeledAssets;
}

function placementRoles(assets: LabeledPlacementAsset[]): PlacementAssetRole[] {
  return [...new Set(assets.map((asset) => asset.role))];
}

function placementCopyRuleLabels(role: PlacementAssetRole, includeCallToActions: boolean): Record<string, { name: string }> {
  return {
    body_label: assetLabel(placementCopyLabel("body", role)),
    title_label: assetLabel(placementCopyLabel("title", role)),
    link_url_label: assetLabel(placementCopyLabel("link_url", role)),
    ...(includeCallToActions
      ? { call_to_action_label: assetLabel(placementCopyLabel("call_to_action", role)) }
      : {})
  };
}

function placementAssetRules(
  assets: LabeledPlacementAsset[],
  options: { includeCopyLabels?: boolean; includeCallToActionLabels?: boolean } = {}
): Array<Record<string, unknown>> {
  const defaultAsset = assets.find((asset) => asset.role === "feed") ?? assets[0];
  const rules: Array<Record<string, unknown>> = [];
  const ruleCopyLabels = (role: PlacementAssetRole) =>
    options.includeCopyLabels ? placementCopyRuleLabels(role, Boolean(options.includeCallToActionLabels)) : {};

  for (const asset of assets) {
    if (asset.role === "unknown") continue;
    for (const customizationSpec of placementCustomizationSpecs(asset.role, asset.assetType)) {
      rules.push({
        customization_spec: customizationSpec,
        ...(asset.assetType === "image" ? { image_label: { name: asset.label } } : { video_label: { name: asset.label } }),
        ...ruleCopyLabels(asset.role)
      });
    }
  }

  return [
    ...rules,
    {
      customization_spec: {},
      ...(defaultAsset.assetType === "image"
        ? { image_label: { name: defaultAsset.label } }
        : { video_label: { name: defaultAsset.label } }),
      ...ruleCopyLabels(defaultAsset.role)
    }
  ];
}

function textAsset(text: string, labels?: Array<{ name: string }>): Record<string, unknown> {
  return {
    text,
    ...(labels?.length ? { adlabels: labels } : {})
  };
}

function linkUrlAsset(websiteUrl: string, labels?: Array<{ name: string }>): Record<string, unknown> {
  return {
    website_url: websiteUrl,
    ...(labels?.length ? { adlabels: labels } : {})
  };
}

function callToActionAsset(type: string, link: string, labels?: Array<{ name: string }>): Record<string, unknown> {
  return {
    type,
    ...(type === "NO_BUTTON" ? {} : { value: { link } }),
    ...(labels?.length ? { adlabels: labels } : {})
  };
}

export async function createAd(input: {
  name: string;
  adSetId: string;
  assetId: string;
  assetType: AssetType;
  assets?: Array<{ assetId: string; assetType: AssetType; placement: CreativeAssetPlacement }>;
  adText: string;
  headline?: string;
  headlineVariants?: string[];
  adTextVariants?: string[];
  ctaType?: string;
  ctaTypeVariants?: string[];
  ctaLink: string;
  requestId?: string;
}): Promise<string> {
  const mediaAssets = input.assets?.length
    ? input.assets.filter((asset) => asset.placement !== "do_not_use")
    : [{ assetId: input.assetId, assetType: input.assetType, placement: "unknown" as CreativeAssetPlacement }];
  if (!mediaAssets.length) {
    throw new Error("Creative has no launchable assets.");
  }

  if (env.MOCK_FACEBOOK) {
    return `mock_ad_${stableHash(`${input.name}:${mediaAssets.map((asset) => asset.assetId).join(":")}`)}`;
  }

  const mockAsset = mediaAssets.find((asset) => isMockCreativeAsset(asset));
  if (mockAsset) {
    throw new Error(
      "Creative was uploaded while MOCK_FACEBOOK was enabled, so it only has a mock Meta asset id. Re-upload the creative with real Meta uploads enabled before launching."
    );
  }

  const pageId = requireEnv("FB_PAGE_ID");
  const adTexts = normalizeAdTextList(input.adText, input.adTextVariants);
  const headlines = normalizeAdTextList(input.headline || input.name, input.headlineVariants, 5);
  const headline = headlines[0] || input.name;
  const ctaTypes = normalizeCtaTypeList(input.ctaType, input.ctaTypeVariants);
  const primaryCtaType = ctaTypes[0];
  const callToAction =
    primaryCtaType === "NO_BUTTON"
      ? { type: primaryCtaType }
      : {
          type: primaryCtaType,
          value: { link: input.ctaLink }
        };
  const uniqueAssetTypes = new Set(mediaAssets.map((asset) => asset.assetType));
  if (uniqueAssetTypes.size > 1) {
    throw new Error("Placement-specific creative groups must use either images or videos, not both.");
  }

  const usePlacementAssets = mediaAssets.length > 1;
  const primaryAsset = mediaAssets[0];
  const storyIdentity = objectStoryIdentity(pageId);
  if (usePlacementAssets && !storyIdentity.instagram_user_id) {
    throw new Error("FB_INSTAGRAM_USER_ID is required for placement-specific creatives that include Instagram placements.");
  }
  const assetFeedAdTexts = adTexts;
  const assetFeedHeadlines = headlines;
  const assetFeedCtaTypes = ctaTypes;
  const useAssetFeedSpec =
    usePlacementAssets || assetFeedAdTexts.length > 1 || assetFeedHeadlines.length > 1 || assetFeedCtaTypes.length > 1;
  const creativeBody =
    primaryAsset.assetType === "image"
      ? {
          ...storyIdentity,
          link_data: {
            message: adTexts[0],
            link: input.ctaLink,
            name: headline,
            image_hash: primaryAsset.assetId,
            call_to_action: callToAction
          }
        }
      : {
          ...storyIdentity,
          video_data: {
            video_id: primaryAsset.assetId,
            message: adTexts[0],
            title: headline,
            call_to_action: callToAction
          }
        };
  const labeledAssets = usePlacementAssets
    ? await placementAssetsWithImageCrops(labeledPlacementAssets(mediaAssets), input.requestId)
    : labeledPlacementAssets(mediaAssets);
  const copyPlacementRoles = usePlacementAssets ? placementRoles(labeledAssets) : [];
  const bodyLabels = usePlacementAssets ? placementCopyLabels("body", copyPlacementRoles) : undefined;
  const titleLabels = usePlacementAssets ? placementCopyLabels("title", copyPlacementRoles) : undefined;
  const linkUrlLabels = usePlacementAssets ? placementCopyLabels("link_url", copyPlacementRoles) : undefined;
  const ctaLabels = usePlacementAssets ? placementCopyLabels("call_to_action", copyPlacementRoles) : undefined;
  const includeLabeledCallToActions = usePlacementAssets && assetFeedCtaTypes.length > 1;
  const assetFeedSpec = {
    ad_formats: [primaryAsset.assetType === "image" ? "SINGLE_IMAGE" : "SINGLE_VIDEO"],
    ...(usePlacementAssets ? { optimization_type: "PLACEMENT" } : {}),
    bodies: assetFeedAdTexts.map((text) => textAsset(text, bodyLabels)),
    titles: assetFeedHeadlines.map((text) => textAsset(text, titleLabels)),
    link_urls: [linkUrlAsset(input.ctaLink, linkUrlLabels)],
    call_to_action_types: assetFeedCtaTypes,
    ...(includeLabeledCallToActions
      ? { call_to_actions: assetFeedCtaTypes.map((type) => callToActionAsset(type, input.ctaLink, ctaLabels)) }
      : {}),
    ...(primaryAsset.assetType === "image"
      ? {
          images: labeledAssets.map((asset) =>
            usePlacementAssets
              ? { hash: asset.assetId, adlabels: [{ name: asset.label }], ...(asset.imageCrops ? { image_crops: asset.imageCrops } : {}) }
              : { hash: asset.assetId }
          )
        }
      : {
          videos: labeledAssets.map((asset) =>
            usePlacementAssets ? { video_id: asset.assetId, adlabels: [{ name: asset.label }] } : { video_id: asset.assetId }
          )
        }),
    ...(usePlacementAssets
      ? {
          asset_customization_rules: placementAssetRules(labeledAssets, {
            includeCopyLabels: true,
            includeCallToActionLabels: includeLabeledCallToActions
          })
        }
      : {})
  };

  try {
    const creative = await graphPost<any>(
      `${adAccountId()}/adcreatives`,
      useAssetFeedSpec
        ? {
            name: `${input.name}_creative`,
            object_story_spec: JSON.stringify(storyIdentity),
            asset_feed_spec: JSON.stringify(assetFeedSpec)
          }
        : {
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
        status: "PAUSED"
      },
      input.requestId
    );

    if (!ad.id) {
      throw new Error("Facebook Ad creation response did not include id");
    }

    return ad.id;
  } catch (error) {
    throw new Error(`Facebook ad launch failed: ${facebookErrorMessage(error)}`);
  }
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
