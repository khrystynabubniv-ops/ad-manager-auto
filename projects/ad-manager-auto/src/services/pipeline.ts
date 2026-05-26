import { AD_STATUS, DB_STATUS, DESIGN_STATUS } from "../config/statuses.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { Creative, NotionCreativeFields } from "../types.js";
import { getErrorMessage } from "../utils/errors.js";
import { detectAssetType } from "../utils/mime.js";
import { normalizeAssetFileName, validateAssetFileName } from "../utils/assetNaming.js";
import { normalizeAdTextList, normalizeCtaTypeList } from "../shared/creativeCopy.js";
import { generateCreativeCopy } from "./copyGenerator.js";
import { downloadDriveCreatives, downloadDriveFile, extractDriveSourceId } from "./googleDrive.js";
import { createAd, getFacebookAdSet, listFacebookCampaigns, uploadCreativeAsset } from "./facebook.js";
import {
  cancelStaleCreativesForTask,
  getCreativeById,
  recordEvent,
  updateCreativeStatus,
  upsertCreative
} from "./db.js";
import {
  retrieveCreativePage,
  updateAdPreparation,
  updateLaunchFailed,
  updateLaunchStarted,
  updateLaunchSuccess,
  updateUploadFailed,
  updateUploadStarted,
  updateUploadSuccess,
  upsertCampaignPage
} from "./notion.js";

const PAGE_ID_KEYS = new Set([
  "page_id",
  "pageid",
  "page id",
  "notion page id",
  "webhook page id",
  "notion_page_id"
]);

function normalizePageId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0];
}

function findPageIdByKey(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findPageIdByKey(item);
      if (nested) return nested;
    }
    return undefined;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (PAGE_ID_KEYS.has(key.toLowerCase().replace(/\s+/g, " ").trim())) {
      const pageId = normalizePageId(nestedValue);
      if (pageId) return pageId;
    }

    const nested = findPageIdByKey(nestedValue);
    if (nested) return nested;
  }

  return undefined;
}

export function extractPageIdFromWebhook(payload: any): string | undefined {
  return (
    normalizePageId(payload?.page_id) ??
    normalizePageId(payload?.pageId) ??
    normalizePageId(payload?.id) ??
    normalizePageId(payload?.entity?.id) ??
    normalizePageId(payload?.data?.id) ??
    normalizePageId(payload?.data?.page_id) ??
    normalizePageId(payload?.page?.id) ??
    normalizePageId(payload?.resource?.id) ??
    findPageIdByKey(payload)
  );
}

function requiredFields(fields: NotionCreativeFields): Record<string, string | undefined> {
  return {
    "Google Drive Link": fields.googleDriveLink ?? fields.finalProject
  };
}

function findMissingFields(fields: NotionCreativeFields): string[] {
  const missing = Object.entries(requiredFields(fields))
    .filter(([, value]) => !value || value.trim().length === 0)
    .map(([name]) => name);

  const driveLink = fields.googleDriveLink ?? fields.finalProject;
  if (driveLink) {
    try {
      extractDriveSourceId(driveLink);
    } catch {
      missing.push("Google Drive Link must point to a Drive file or folder");
    }
  }

  return missing;
}

function adName(fields: { notionTaskId: string; projectType?: string; sourceFileName?: string }): string {
  const now = new Date();
  const yearMonth = `${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const projectType = fields.projectType ?? "project";
  const shortTaskId = fields.notionTaskId.replaceAll("-", "").slice(0, 10);
  const source = fields.sourceFileName
    ? `_${fields.sourceFileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)}`
    : "";
  return `${projectType}_${yearMonth}_${shortTaskId}${source}`;
}

function dbDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function generateInitialCopyForCreative(
  creative: Creative,
  baseInput: Omit<Parameters<typeof upsertCreative>[0], "status">,
  requestId?: string
): Promise<Creative> {
  if (creative.ad_text?.trim() && creative.headline?.trim() && creative.cta_type?.trim()) {
    return creative;
  }

  try {
    const suggestions = await generateCreativeCopy({ creative });
    const generatedAdText = suggestions.adTextVariants[0]?.trim();
    const generatedHeadline = (suggestions.headline ?? suggestions.headlineVariants[0])?.trim();
    const generatedCtaType = suggestions.ctaTypeVariants[0]?.trim();

    if (!generatedAdText || !generatedHeadline) {
      await recordEvent({
        requestId,
        creativeId: creative.id,
        notionTaskId: creative.notion_task_id,
        action: "generate_initial_copy",
        status: "ignored",
        metadata: { reason: "empty_generation" }
      });
      return creative;
    }

    const updated = await upsertCreative({
      ...baseInput,
      status: creative.status,
      assetId: creative.asset_id ?? undefined,
      assetType: creative.asset_type ?? undefined,
      previewUrl: creative.preview_url ?? undefined,
      uploadedAt: dbDate(creative.uploaded_at),
      facebookAdId: creative.facebook_ad_id ?? undefined,
      launchedAt: dbDate(creative.launched_at),
      adText: generatedAdText,
      headline: generatedHeadline,
      headlineVariants: [],
      adTextVariants: [],
      ctaType: generatedCtaType || creative.cta_type,
      ctaTypeVariants: []
    });

    await recordEvent({
      requestId,
      creativeId: updated.id,
      notionTaskId: updated.notion_task_id,
      action: "generate_initial_copy",
      status: "success",
      metadata: {
        hasText: Boolean(generatedAdText),
        hasHeadline: Boolean(generatedHeadline),
        ctaType: generatedCtaType || creative.cta_type
      }
    });

    return updated;
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn(
      { requestId, creativeId: creative.id, notionTaskId: creative.notion_task_id, error: message },
      "Initial copy generation failed; leaving creative ready for manual review"
    );
    await recordEvent({
      requestId,
      creativeId: creative.id,
      notionTaskId: creative.notion_task_id,
      action: "generate_initial_copy",
      status: "failed",
      error: message
    });
    return creative;
  }
}

async function processNotionCreativeFields(fields: NotionCreativeFields, requestId?: string) {
  const subItemCount = fields.subItemIds?.length ?? 0;
  logger.info(
    {
      requestId,
      pageId: fields.notionTaskId,
      pageName: fields.name,
      parentTaskId: fields.parentTaskId,
      subItemCount,
      adStatus: fields.adStatus,
      designStatus: fields.designStatus
    },
    "Handling Notion page change"
  );

  if (subItemCount > 0) {
    await recordEvent({
      requestId,
      notionTaskId: fields.notionTaskId,
      action: "container_task_ignored",
      status: "ignored",
      metadata: {
        name: fields.name,
        adStatus: fields.adStatus,
        designStatus: fields.designStatus,
        subItemCount
      }
    });
    return { action: "ignored_container", pageId: fields.notionTaskId, adStatus: fields.adStatus, subItemCount };
  }

  if (fields.designStatus === DESIGN_STATUS.APPROVED_FOR_AD && (!fields.adStatus || fields.adStatus === AD_STATUS.NOT_STARTED)) {
    await updateAdPreparation(fields.notionTaskId, fields.googleDriveLink ?? fields.finalProject);
    await recordEvent({
      requestId,
      notionTaskId: fields.notionTaskId,
      action: "prepare_ad_details",
      status: "success",
      metadata: { copiedGoogleDriveLink: Boolean(fields.finalProject && !fields.googleDriveLink) }
    });
    return { action: "prepared", pageId: fields.notionTaskId };
  }

  if (fields.adStatus !== AD_STATUS.READY_TO_UPLOAD) {
    await recordEvent({
      requestId,
      notionTaskId: fields.notionTaskId,
      action: "webhook_ignored",
      status: "ignored",
      metadata: { adStatus: fields.adStatus, designStatus: fields.designStatus }
    });
    return { action: "ignored", pageId: fields.notionTaskId, adStatus: fields.adStatus };
  }

  if (fields.designStatus !== DESIGN_STATUS.APPROVED_FOR_AD) {
    logger.warn(
      {
        requestId,
        notionTaskId: fields.notionTaskId,
        name: fields.name,
        adStatus: fields.adStatus,
        designStatus: fields.designStatus,
        requiredDesignStatus: DESIGN_STATUS.APPROVED_FOR_AD
      },
      "Ready to upload ignored because design is not approved for ads"
    );
    await recordEvent({
      requestId,
      notionTaskId: fields.notionTaskId,
      action: "upload_blocked_design_status",
      status: "ignored",
      metadata: {
        name: fields.name,
        adStatus: fields.adStatus,
        designStatus: fields.designStatus,
        requiredDesignStatus: DESIGN_STATUS.APPROVED_FOR_AD
      }
    });
    return {
      action: "ignored",
      pageId: fields.notionTaskId,
      adStatus: fields.adStatus,
      reason: "design_status_not_approved"
    };
  }

  return uploadCreativeFromNotion(fields, requestId);
}

export async function handleNotionPageChange(pageId: string, requestId?: string) {
  const fields = await retrieveCreativePage(pageId);
  const result = await processNotionCreativeFields(fields, requestId);

  if (!fields.subItemIds?.length) {
    return result;
  }

  const subItems = [];
  for (const subItemId of fields.subItemIds) {
    try {
      const subItemFields = await retrieveCreativePage(subItemId);
      const subItemResult = await processNotionCreativeFields(subItemFields, requestId);
      subItems.push({ pageId: subItemFields.notionTaskId, ...subItemResult });
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error({ requestId, parentPageId: fields.notionTaskId, subItemId, error: message }, "Failed to handle Notion sub-item");
      await recordEvent({
        requestId,
        notionTaskId: subItemId,
        action: "sub_item_processing",
        status: "failed",
        error: message,
        metadata: { parentTaskId: fields.notionTaskId }
      });
      subItems.push({ pageId: subItemId, action: "failed", error: message });
    }
  }

  return { ...result, subItems };
}

export async function uploadCreativeFromNotion(fields: NotionCreativeFields, requestId?: string) {
  const missing = findMissingFields(fields);
  const placeholderCreative = await upsertCreative({
    notionTaskId: fields.notionTaskId,
    notionTaskUrl: fields.notionTaskUrl,
    sourceFileId: fields.notionTaskId,
    sourceFileName: fields.name,
    status: missing.length ? DB_STATUS.NEEDS_DETAILS : DB_STATUS.UPLOADING,
    ctaLink: fields.ctaLink,
    projectType: fields.projectType,
    googleDriveUrl: fields.googleDriveLink ?? fields.finalProject
  });

  if (missing.length) {
    const message = `Missing required ad fields: ${missing.join(", ")}`;
    logger.warn(
      { requestId, notionTaskId: fields.notionTaskId, missing },
      "Ready to upload validation failed"
    );
    await updateAdPreparation(fields.notionTaskId, fields.googleDriveLink ?? fields.finalProject, message);
    await recordEvent({
      requestId,
      creativeId: placeholderCreative.id,
      notionTaskId: fields.notionTaskId,
      action: "validate_upload_fields",
      status: "failed",
      error: message,
      metadata: { missing }
    });
    return { action: "missing_fields", missing };
  }

  try {
    await updateUploadStarted(fields.notionTaskId);
    await recordEvent({
      requestId,
      notionTaskId: fields.notionTaskId,
      action: "upload_started",
      status: "success"
    });

    const files = await downloadDriveCreatives(fields.googleDriveLink ?? fields.finalProject!, requestId);
    await cancelStaleCreativesForTask(
      fields.notionTaskId,
      files.map((file) => file.fileId)
    );

    const uploadedCreatives: Creative[] = [];
    const failedUploads: Array<{ fileName: string; message: string }> = [];

    for (const file of files) {
      const assetType = detectAssetType(file.fileName, file.mimeType);
      const uploadFileName = normalizeAssetFileName(file.fileName);
      const uploadFile = uploadFileName === file.fileName ? file : { ...file, fileName: uploadFileName };
      const baseInput = {
        notionTaskId: fields.notionTaskId,
        notionTaskUrl: fields.notionTaskUrl,
        sourceFileId: file.fileId,
        sourceFileName: file.fileName,
        ctaLink: fields.ctaLink,
        projectType: fields.projectType,
        googleDriveUrl: fields.googleDriveLink ?? fields.finalProject
      };

      if (uploadFileName !== file.fileName) {
        logger.info(
          { requestId, notionTaskId: fields.notionTaskId, fileName: file.fileName, uploadFileName },
          "Normalized creative asset filename for upload"
        );
      }

      const namingError = validateAssetFileName(uploadFile.fileName, assetType);
      if (namingError) {
        const message =
          uploadFileName === file.fileName
            ? `${namingError}: ${file.fileName}`
            : `${namingError}: ${file.fileName} (normalized to ${uploadFileName})`;
        failedUploads.push({ fileName: file.fileName, message });
        const creative = await upsertCreative({
          ...baseInput,
          status: DB_STATUS.UPLOAD_FAILED,
          assetType
        });
        await recordEvent({
          requestId,
          creativeId: creative.id,
          notionTaskId: fields.notionTaskId,
          action: "validate_asset_name",
          status: "failed",
          error: message,
          metadata: { fileName: file.fileName, uploadFileName }
        });
        continue;
      }

      const creative = await upsertCreative({
        ...baseInput,
        status: DB_STATUS.UPLOADING,
        assetType
      });

      try {
        const uploaded = await uploadCreativeAsset(uploadFile, requestId);
        const uploadedCreative = await upsertCreative({
          ...baseInput,
          status: DB_STATUS.READY_TO_LAUNCH,
          assetId: uploaded.assetId,
          assetType: uploaded.assetType,
          previewUrl: uploaded.previewUrl,
          uploadedAt: new Date()
        });
        const updatedCreative = await generateInitialCopyForCreative(uploadedCreative, baseInput, requestId);

        uploadedCreatives.push(updatedCreative);
        await recordEvent({
          requestId,
          creativeId: updatedCreative.id,
          notionTaskId: fields.notionTaskId,
          action: "upload_completed",
          status: "success",
          metadata: { assetId: uploaded.assetId, assetType: uploaded.assetType, fileName: file.fileName, uploadFileName }
        });
      } catch (error) {
        const message = getErrorMessage(error);
        failedUploads.push({ fileName: file.fileName, message });
        await upsertCreative({
          ...baseInput,
          status: DB_STATUS.UPLOAD_FAILED,
          assetType
        });
        await recordEvent({
          requestId,
          creativeId: creative.id,
          notionTaskId: fields.notionTaskId,
          action: "upload_completed",
          status: "failed",
          error: message,
          metadata: { fileName: file.fileName, uploadFileName }
        });
      }
    }

    if (!uploadedCreatives.length) {
      const message = failedUploads.length
        ? `All creative uploads failed: ${failedUploads.map((failure) => `${failure.fileName}: ${failure.message}`).join("; ")}`
        : "No creative files were uploaded";
      await updateUploadFailed(fields.notionTaskId, message);
      await recordEvent({
        requestId,
        creativeId: placeholderCreative.id,
        notionTaskId: fields.notionTaskId,
        action: "upload_completed",
        status: "failed",
        error: message,
        metadata: { files: files.map((file) => file.fileName) }
      });
      return { action: "upload_failed", failures: failedUploads };
    }

    const firstUploaded = uploadedCreatives[0];
    await updateUploadSuccess(fields.notionTaskId, {
      assetId: firstUploaded.asset_id!,
      assetType: firstUploaded.asset_type!,
      previewUrl: firstUploaded.preview_url ?? undefined
    });

    if (failedUploads.length) {
      await recordEvent({
        requestId,
        notionTaskId: fields.notionTaskId,
        action: "upload_partial",
        status: "failed",
        metadata: { failures: failedUploads }
      });
    }

    return {
      action: files.length > 1 ? "uploaded_folder" : "uploaded",
      uploaded: uploadedCreatives.length,
      failed: failedUploads.length,
      creatives: uploadedCreatives
    };
  } catch (error) {
    const message = getErrorMessage(error);
    await upsertCreative({
      notionTaskId: fields.notionTaskId,
      notionTaskUrl: fields.notionTaskUrl,
      sourceFileId: fields.notionTaskId,
      sourceFileName: fields.name,
      status: DB_STATUS.UPLOAD_FAILED,
      ctaLink: fields.ctaLink,
      projectType: fields.projectType,
      googleDriveUrl: fields.googleDriveLink ?? fields.finalProject
    });
    await updateUploadFailed(fields.notionTaskId, message);
    await recordEvent({
      requestId,
      creativeId: placeholderCreative.id,
      notionTaskId: fields.notionTaskId,
      action: "upload_completed",
      status: "failed",
      error: message
    });
    throw error;
  }
}

export type LaunchPlacementInput = {
  campaignId?: string;
  campaignName?: string;
  adSetId?: string;
  adSetName?: string;
  projectType?: string;
  adText?: string;
  headline?: string;
  headlineVariants?: string[];
  adTextVariants?: string[];
  ctaType?: string;
  ctaTypeVariants?: string[];
  ctaLink?: string;
  audience?: string;
  location?: string;
};

function cleanText(value?: string | null): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function cleanLaunchInput(input?: LaunchPlacementInput) {
  return {
    campaignId: cleanText(input?.campaignId),
    campaignName: cleanText(input?.campaignName),
    adSetId: cleanText(input?.adSetId),
    adSetName: cleanText(input?.adSetName),
    projectType: cleanText(input?.projectType),
    adText: cleanText(input?.adText),
    headline: cleanText(input?.headline),
    headlineVariants: input?.headlineVariants,
    adTextVariants: input?.adTextVariants,
    ctaType: cleanText(input?.ctaType),
    ctaTypeVariants: input?.ctaTypeVariants,
    ctaLink: cleanText(input?.ctaLink),
    audience: cleanText(input?.audience),
    location: cleanText(input?.location)
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isMockCreativeAsset(assetId: string, assetType: string): boolean {
  return assetId.startsWith(`mock_${assetType}_`);
}

const launchableStatuses = new Set<string>([DB_STATUS.READY_TO_LAUNCH, DB_STATUS.LAUNCH_FAILED]);

async function downloadLaunchSourceFile(creative: Creative, requestId?: string) {
  const sourceFileId = cleanText(creative.source_file_id);
  if (sourceFileId && sourceFileId !== creative.notion_task_id) {
    return downloadDriveFile(sourceFileId, requestId);
  }

  const sourceUrl = cleanText(creative.google_drive_url);
  if (!sourceUrl) {
    throw new Error(
      `Creative ${creative.id} has a mock Meta asset id and no Google Drive source to re-upload from. Re-upload the creative with real Meta uploads enabled before launching.`
    );
  }

  const files = await downloadDriveCreatives(sourceUrl, requestId);
  const sourceFileName = cleanText(creative.source_file_name);
  const matchingFile = sourceFileName ? files.find((file) => file.fileName === sourceFileName) : undefined;
  if (matchingFile) {
    return matchingFile;
  }
  if (files.length === 1) {
    return files[0];
  }

  throw new Error(
    `Creative ${creative.id} has a mock Meta asset id and its Google Drive folder has multiple creative files. Re-run upload from Notion so the exact file can be matched before launching.`
  );
}

async function refreshMockLaunchAsset(creative: Creative, requestId?: string): Promise<Creative> {
  if (
    env.MOCK_FACEBOOK ||
    !creative.asset_id ||
    !creative.asset_type ||
    !isMockCreativeAsset(creative.asset_id, creative.asset_type)
  ) {
    return creative;
  }

  logger.warn(
    { requestId, creativeId: creative.id, notionTaskId: creative.notion_task_id, assetId: creative.asset_id },
    "Creative has mock Meta asset id; re-uploading asset before launch"
  );

  const file = await downloadLaunchSourceFile(creative, requestId);
  const uploaded = await uploadCreativeAsset(file, requestId);
  const updated = await updateCreativeStatus(creative.id, DB_STATUS.READY_TO_LAUNCH, {
    assetId: uploaded.assetId,
    assetType: uploaded.assetType,
    previewUrl: uploaded.previewUrl,
    uploadedAt: new Date()
  });
  await updateUploadSuccess(creative.notion_task_id, {
    assetId: uploaded.assetId,
    assetType: uploaded.assetType,
    previewUrl: uploaded.previewUrl
  });
  await recordEvent({
    requestId,
    creativeId: creative.id,
    notionTaskId: creative.notion_task_id,
    action: "launch_asset_refreshed",
    status: "success",
    metadata: { previousAssetId: creative.asset_id, assetId: uploaded.assetId, assetType: uploaded.assetType }
  });
  return updated;
}

export async function launchCreative(id: number, placementInput?: LaunchPlacementInput, requestId?: string) {
  let creative = await getCreativeById(id);
  if (!creative) {
    throw new Error(`Creative ${id} not found`);
  }
  if (!launchableStatuses.has(creative.status)) {
    throw new Error(`Creative ${id} is not ready to launch. Current status: ${creative.status}`);
  }
  if (!creative.asset_id || !creative.asset_type) {
    throw new Error(`Creative ${id} is missing launch data`);
  }

  const launchInput = cleanLaunchInput(placementInput);
  const campaignId = launchInput.campaignId ?? cleanText(creative.campaign_id);
  const adSetId = launchInput.adSetId ?? cleanText(creative.adset_id);
  if (!campaignId || !adSetId) {
    throw new Error(`Creative ${id} is missing Meta campaign/ad set selection`);
  }

  const projectType = launchInput.projectType ?? cleanText(creative.project_type) ?? "creative";
  const adText = launchInput.adText ?? cleanText(creative.ad_text);
  const headline = launchInput.headline ?? cleanText(creative.headline);
  const headlineVariants = launchInput.headlineVariants ?? creative.headline_variants ?? [];
  const adTextVariants = launchInput.adTextVariants ?? creative.ad_text_variants ?? [];
  const ctaType = launchInput.ctaType ?? cleanText(creative.cta_type);
  const ctaTypeVariants = launchInput.ctaTypeVariants ?? creative.cta_type_variants ?? [];
  const ctaLink = launchInput.ctaLink ?? cleanText(creative.cta_link);
  const audience = launchInput.audience ?? cleanText(creative.audience);
  const location = launchInput.location ?? cleanText(creative.location);
  if (!adText || !ctaLink) {
    throw new Error(`Creative ${id} is missing required launch fields`);
  }
  if (!isHttpUrl(ctaLink)) {
    throw new Error(`Creative ${id} ad link must be a valid http(s) URL`);
  }

  creative = await refreshMockLaunchAsset(creative, requestId);

  const adSet = await getFacebookAdSet(adSetId, requestId);
  if (adSet.campaign_id !== campaignId) {
    throw new Error(`AdSet ${adSetId} belongs to campaign ${adSet.campaign_id}, not ${campaignId}`);
  }

  const campaignName = launchInput.campaignName ?? cleanText(creative.campaign_name);
  const adSetName = launchInput.adSetName ?? adSet.name ?? cleanText(creative.adset_name);

  await updateCreativeStatus(id, DB_STATUS.LAUNCHING, {
    campaignId,
    campaignName,
    adSetId,
    adSetName,
    projectType,
    adText,
    headline,
    headlineVariants,
    adTextVariants,
    ctaType,
    ctaTypeVariants,
    ctaLink,
    audience,
    location
  });
  await updateLaunchStarted(creative.notion_task_id);
  await recordEvent({
    requestId,
    creativeId: id,
    notionTaskId: creative.notion_task_id,
    action: "launch_started",
    status: "success",
    metadata: { campaignId, adSetId }
  });

  const assetId = creative.asset_id;
  const assetType = creative.asset_type;
  if (!assetId || !assetType) {
    throw new Error(`Creative ${id} is missing launch data`);
  }

  try {
    const facebookAdId = await createAd({
      name: adName({
        notionTaskId: creative.notion_task_id,
        projectType,
        sourceFileName: creative.source_file_name ?? undefined
      }),
      adSetId,
      assetId,
      assetType,
      adText,
      headline,
      headlineVariants: normalizeAdTextList(headline, headlineVariants, 5),
      adTextVariants: normalizeAdTextList(adText, adTextVariants),
      ctaType,
      ctaTypeVariants: normalizeCtaTypeList(ctaType, ctaTypeVariants),
      ctaLink,
      requestId
    });

    const launchedAt = new Date();
    const updated = await updateCreativeStatus(id, DB_STATUS.LAUNCHED, {
      facebookAdId,
      launchedAt
    });
    await updateLaunchSuccess(creative.notion_task_id, facebookAdId);
    await recordEvent({
      requestId,
      creativeId: id,
      notionTaskId: creative.notion_task_id,
      action: "launch_completed",
      status: "success",
      metadata: { facebookAdId, campaignId, adSetId }
    });

    return updated;
  } catch (error) {
    const message = getErrorMessage(error);
    await updateCreativeStatus(id, DB_STATUS.LAUNCH_FAILED);
    await updateLaunchFailed(creative.notion_task_id, message);
    await recordEvent({
      requestId,
      creativeId: id,
      notionTaskId: creative.notion_task_id,
      action: "launch_completed",
      status: "failed",
      error: message
    });
    throw error;
  }
}

export async function syncFacebookCampaigns(requestId?: string) {
  const campaigns = await listFacebookCampaigns(requestId);
  for (const campaign of campaigns) {
    await upsertCampaignPage({
      name: campaign.name,
      facebookCampaignId: campaign.id,
      status: campaign.status,
      objective: campaign.objective
    });
  }
  await recordEvent({
    requestId,
    action: "sync_campaigns",
    status: "success",
    metadata: { count: campaigns.length }
  });
  return campaigns;
}
