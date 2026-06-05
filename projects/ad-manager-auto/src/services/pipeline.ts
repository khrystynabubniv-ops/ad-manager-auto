import { AD_STATUS, DB_STATUS, DESIGN_STATUS } from "../config/statuses.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { AssetType, Creative, CreativeAssetPlacement, NotionCreativeFields } from "../types.js";
import { getErrorMessage } from "../utils/errors.js";
import { detectAssetType } from "../utils/mime.js";
import { creativeAdNameParts, creativeGroupingForFileName, normalizeAssetFileName, validateAssetFileName } from "../utils/assetNaming.js";
import { normalizeAdTextList, normalizeCtaTypeList } from "../shared/creativeCopy.js";
import { generateCreativeCopy } from "./copyGenerator.js";
import { downloadDriveCreatives, downloadDriveFile, extractDriveSourceId } from "./googleDrive.js";
import { createAd, getFacebookAdSet, getFacebookCampaign, listFacebookCampaigns, uploadCreativeAsset } from "./facebook.js";
import {
  cancelStaleCreativesForTask,
  getCreativeById,
  getCreativeGroupById,
  listCreatives,
  listCreativesForAdNameFamilies,
  listCreativesForTask,
  recordEvent,
  updateCreativeAutoGroupingName,
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

function adName(fields: { projectType?: string; sourceFileName?: string; assetType?: AssetType }): string {
  const sourceFileName = fields.sourceFileName?.trim();
  if (sourceFileName && fields.assetType) {
    const parts = creativeAdNameParts(sourceFileName, fields.assetType);
    const projectTypeAdName = generatedAdNameForFamily(fields.projectType, parts.familyKey);
    return (parts.explicitAdName ?? projectTypeAdName ?? `${parts.familyKey}_${parts.format}1`).slice(0, 80);
  }

  const projectTypeAdName = generatedAdNameMatch(fields.projectType);
  if (projectTypeAdName && fields.projectType) {
    return fields.projectType.slice(0, 80);
  }

  const projectType = fields.projectType?.trim() || "creative";
  return normalizeAssetFileName(projectType).replace(/\.[^.]+$/, "").slice(0, 80);
}

type AdNameAllocationState = {
  assignedBySourceGroupKey: Map<string, string>;
  maxAdNumberByFamilyKey: Map<string, number>;
};

function generatedAdNameMatch(value?: string | null): { familyKey: string; number: number } | undefined {
  const match = value?.match(/^(.*)_(?:static|video)(\d+)$/);
  if (!match) return undefined;
  return { familyKey: match[1], number: Number(match[2]) };
}

function generatedAdNameForFamily(value: string | null | undefined, familyKey: string): string | undefined {
  const match = generatedAdNameMatch(value);
  return match && match.familyKey === familyKey ? value ?? undefined : undefined;
}

function allocationState(existingCreatives: Creative[]): AdNameAllocationState {
  const state: AdNameAllocationState = {
    assignedBySourceGroupKey: new Map(),
    maxAdNumberByFamilyKey: new Map()
  };
  const sourceGroupAssignments = new Map<string, Set<string>>();
  const sourceGroupsByAdName = new Map<string, Set<string>>();

  for (const creative of existingCreatives) {
    for (const value of [creative.project_type, creative.creative_group_key]) {
      const match = generatedAdNameMatch(value);
      if (!match) continue;
      const currentMax = state.maxAdNumberByFamilyKey.get(match.familyKey) ?? 0;
      state.maxAdNumberByFamilyKey.set(match.familyKey, Math.max(currentMax, match.number));
    }

    if (creative.grouping_status !== "auto" || !creative.source_file_name || !creative.asset_type) {
      continue;
    }

    const parts = creativeAdNameParts(creative.source_file_name, creative.asset_type);
    const existingAdName =
      generatedAdNameForFamily(creative.creative_group_key, parts.familyKey) ??
      generatedAdNameForFamily(creative.project_type, parts.familyKey);
    if (!existingAdName) continue;

    const sourceGroupKey = `${parts.familyKey}\n${parts.sourceGroupKey}`;
    sourceGroupAssignments.set(sourceGroupKey, new Set([...(sourceGroupAssignments.get(sourceGroupKey) ?? []), existingAdName]));
    sourceGroupsByAdName.set(existingAdName, new Set([...(sourceGroupsByAdName.get(existingAdName) ?? []), sourceGroupKey]));
  }

  for (const [sourceGroupKey, adNames] of sourceGroupAssignments.entries()) {
    if (adNames.size !== 1) continue;
    const [adNameValue] = adNames;
    if ((sourceGroupsByAdName.get(adNameValue)?.size ?? 0) !== 1) continue;
    const [, sourceGroup] = sourceGroupKey.split("\n");
    state.assignedBySourceGroupKey.set(sourceGroup, adNameValue);
  }

  return state;
}

function allocateUploadAdName(state: AdNameAllocationState, fields: { fileName: string; assetType: ReturnType<typeof detectAssetType>; sourceFileId: string }): string {
  const parts = creativeAdNameParts(fields.fileName, fields.assetType);
  if (parts.explicitAdName) {
    if (parts.explicitAdNumber) {
      const currentMax = state.maxAdNumberByFamilyKey.get(parts.familyKey) ?? 0;
      state.maxAdNumberByFamilyKey.set(parts.familyKey, Math.max(currentMax, parts.explicitAdNumber));
    }
    state.assignedBySourceGroupKey.set(parts.sourceGroupKey, parts.explicitAdName);
    return parts.explicitAdName;
  }

  const assigned = state.assignedBySourceGroupKey.get(parts.sourceGroupKey);
  if (assigned) {
    return assigned;
  }

  const nextNumber = (state.maxAdNumberByFamilyKey.get(parts.familyKey) ?? 0) + 1;
  state.maxAdNumberByFamilyKey.set(parts.familyKey, nextNumber);
  const adNameValue = `${parts.familyKey}_${parts.format}${nextNumber}`;
  state.assignedBySourceGroupKey.set(parts.sourceGroupKey, adNameValue);
  return adNameValue;
}

export async function repairAutoCreativeAdNames(statuses: string[], requestId?: string): Promise<number> {
  const creatives = await listCreatives(statuses);
  const candidates = creatives
    .filter((creative) => creative.grouping_status === "auto" && creative.source_file_name && creative.asset_type)
    .map((creative) => {
      const fileName = normalizeAssetFileName(creative.source_file_name!);
      if (validateAssetFileName(fileName, creative.asset_type!)) {
        return undefined;
      }
      return {
        creative,
        fileName,
        assetType: creative.asset_type!,
        parts: creativeAdNameParts(fileName, creative.asset_type!)
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  if (!candidates.length) {
    return 0;
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.creative.id));
  const familyKeys = [...new Set(candidates.map((candidate) => candidate.parts.familyKey))];
  const existingCreatives = (await listCreativesForAdNameFamilies(familyKeys)).filter((creative) => !candidateIds.has(creative.id));
  const state = allocationState(existingCreatives);
  let repaired = 0;

  const sortedCandidates = [...candidates].sort((left, right) => {
    const familySort = left.parts.familyKey.localeCompare(right.parts.familyKey);
    if (familySort !== 0) return familySort;
    const createdSort = Date.parse(left.creative.created_at) - Date.parse(right.creative.created_at);
    if (createdSort !== 0) return createdSort;
    return left.creative.id - right.creative.id;
  });

  for (const candidate of sortedCandidates) {
    const adNameValue = allocateUploadAdName(state, {
      fileName: candidate.fileName,
      assetType: candidate.assetType,
      sourceFileId: candidate.creative.source_file_id
    });
    const hasGeneratedProjectType = Boolean(generatedAdNameMatch(candidate.creative.project_type));
    const needsProjectTypeRepair = !candidate.creative.project_type || hasGeneratedProjectType;

    if (
      candidate.creative.creative_group_key === adNameValue &&
      (!needsProjectTypeRepair || candidate.creative.project_type === adNameValue)
    ) {
      continue;
    }

    await updateCreativeAutoGroupingName(candidate.creative.id, adNameValue);
    repaired += 1;
  }

  if (repaired > 0) {
    logger.info({ requestId, repaired }, "Repaired auto creative ad names");
  }

  return repaired;
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
    const uploadFamilyKeys = files.map((file) => {
      const assetType = detectAssetType(file.fileName, file.mimeType);
      const uploadFileName = normalizeAssetFileName(file.fileName);
      return creativeAdNameParts(uploadFileName, assetType).familyKey;
    });
    const adNameState = allocationState([
      ...(await listCreativesForAdNameFamilies(uploadFamilyKeys)),
      ...(await listCreativesForTask(fields.notionTaskId))
    ]);

    for (const file of files) {
      const assetType = detectAssetType(file.fileName, file.mimeType);
      const uploadFileName = normalizeAssetFileName(file.fileName);
      const uploadFile = uploadFileName === file.fileName ? file : { ...file, fileName: uploadFileName };
      const grouping = creativeGroupingForFileName(uploadFile.fileName);
      const uploadAdName = allocateUploadAdName(adNameState, {
        fileName: uploadFile.fileName,
        assetType,
        sourceFileId: file.fileId
      });
      const baseInput = {
        notionTaskId: fields.notionTaskId,
        notionTaskUrl: fields.notionTaskUrl,
        sourceFileId: file.fileId,
        sourceFileName: file.fileName,
        creativeGroupKey: uploadAdName,
        creativeGroupName: uploadAdName.replace(/_/g, " "),
        assetPlacement: grouping.placement,
        groupingStatus: "auto" as const,
        ctaLink: fields.ctaLink,
        projectType: uploadAdName,
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

export async function retryCreativeAssetUpload(id: number, requestId?: string): Promise<Creative> {
  const existing = await getCreativeById(id);
  if (!existing) {
    throw new Error(`Creative ${id} not found`);
  }
  if (existing.status !== DB_STATUS.UPLOAD_FAILED) {
    throw new Error(`Creative ${id} is not waiting for upload retry. Current status: ${existing.status}`);
  }
  if (!existing.source_file_id || existing.source_file_id.startsWith("slot:") || existing.source_file_id.startsWith("manual:")) {
    throw new Error(`Creative ${id} does not have a retryable Google Drive source file`);
  }

  const file = await downloadDriveFile(existing.source_file_id, requestId);
  const assetType = detectAssetType(file.fileName, file.mimeType);
  const uploadFileName = normalizeAssetFileName(file.fileName);
  const uploadFile = uploadFileName === file.fileName ? file : { ...file, fileName: uploadFileName };
  const grouping = creativeGroupingForFileName(uploadFile.fileName);
  const groupingIsManual = existing.grouping_status === "manual";
  const retryFamilyKey = creativeAdNameParts(uploadFile.fileName, assetType).familyKey;
  const adNameState = allocationState([
    ...(await listCreativesForAdNameFamilies([retryFamilyKey])),
    ...(await listCreativesForTask(existing.notion_task_id))
  ]);
  const uploadAdName = allocateUploadAdName(adNameState, {
    fileName: uploadFile.fileName,
    assetType,
    sourceFileId: file.fileId
  });
  const baseInput = {
    notionTaskId: existing.notion_task_id,
    notionTaskUrl: existing.notion_task_url ?? undefined,
    sourceFileId: file.fileId,
    sourceFileName: file.fileName,
    creativeGroupKey: groupingIsManual ? existing.creative_group_key : uploadAdName,
    creativeGroupName: groupingIsManual ? existing.creative_group_name : uploadAdName.replace(/_/g, " "),
    assetPlacement: groupingIsManual ? existing.asset_placement : grouping.placement,
    groupingStatus: existing.grouping_status,
    ctaLink: existing.cta_link ?? undefined,
    projectType: groupingIsManual ? existing.project_type ?? undefined : uploadAdName,
    googleDriveUrl: existing.google_drive_url ?? undefined,
    adText: existing.ad_text ?? undefined,
    headline: existing.headline ?? undefined,
    headlineVariants: existing.headline_variants ?? undefined,
    adTextVariants: existing.ad_text_variants ?? undefined,
    ctaType: existing.cta_type ?? undefined,
    ctaTypeVariants: existing.cta_type_variants ?? undefined,
    campaignId: existing.campaign_id ?? undefined,
    campaignName: existing.campaign_name ?? undefined,
    adSetId: existing.adset_id ?? undefined,
    adSetName: existing.adset_name ?? undefined
  };

  if (uploadFileName !== file.fileName) {
    logger.info(
      { requestId, creativeId: existing.id, notionTaskId: existing.notion_task_id, fileName: file.fileName, uploadFileName },
      "Normalized creative asset filename for retry upload"
    );
  }

  const namingError = validateAssetFileName(uploadFile.fileName, assetType);
  if (namingError) {
    const message =
      uploadFileName === file.fileName
        ? `${namingError}: ${file.fileName}`
        : `${namingError}: ${file.fileName} (normalized to ${uploadFileName})`;
    await recordEvent({
      requestId,
      creativeId: existing.id,
      notionTaskId: existing.notion_task_id,
      action: "retry_upload",
      status: "failed",
      error: message,
      metadata: { fileName: file.fileName, uploadFileName }
    });
    throw new Error(message);
  }

  await upsertCreative({
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

    await updateUploadSuccess(existing.notion_task_id, {
      assetId: uploaded.assetId,
      assetType: uploaded.assetType,
      previewUrl: uploaded.previewUrl
    });
    await recordEvent({
      requestId,
      creativeId: updatedCreative.id,
      notionTaskId: existing.notion_task_id,
      action: "retry_upload",
      status: "success",
      metadata: { assetId: uploaded.assetId, assetType: uploaded.assetType, fileName: file.fileName, uploadFileName }
    });
    return updatedCreative;
  } catch (error) {
    const message = getErrorMessage(error);
    await upsertCreative({
      ...baseInput,
      status: DB_STATUS.UPLOAD_FAILED,
      assetType
    });
    await recordEvent({
      requestId,
      creativeId: existing.id,
      notionTaskId: existing.notion_task_id,
      action: "retry_upload",
      status: "failed",
      error: message,
      metadata: { fileName: file.fileName, uploadFileName }
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

function assertScheduleIsOpen(entity: "Campaign" | "AdSet", id: string, endTime?: string | null): void {
  if (!endTime) return;
  const date = new Date(endTime);
  if (Number.isNaN(date.getTime())) return;
  if (date.getTime() <= Date.now()) {
    throw new Error(`${entity} ${id} schedule ended at ${endTime}. Extend its schedule in Meta or choose another ${entity.toLowerCase()}.`);
  }
}

function placementName(placement: CreativeAssetPlacement): string {
  if (placement === "feed") return "feed";
  if (placement === "stories_reels") return "stories/reels";
  if (placement === "horizontal") return "horizontal";
  return "unknown placement";
}

function assertUniqueLaunchPlacements(groupName: string, creatives: Creative[]): void {
  const placements = new Map<CreativeAssetPlacement, Creative[]>();
  for (const creative of creatives) {
    const existing = placements.get(creative.asset_placement) ?? [];
    existing.push(creative);
    placements.set(creative.asset_placement, existing);
  }

  const duplicates = [...placements.entries()].filter(([, items]) => items.length > 1);
  if (!duplicates.length) return;

  const details = duplicates
    .map(([placement, items]) => {
      const names = items.map((item) => item.source_file_name ?? `Creative ${item.id}`).join(", ");
      return `${placementName(placement)}: ${names}`;
    })
    .join("; ");

  throw new Error(
    `Ad "${groupName}" has multiple assets for the same placement (${details}). Keep one asset per placement, mark extras as do_not_use, or rename variants into separate ads before launch.`
  );
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

  const [campaign, adSet] = await Promise.all([
    getFacebookCampaign(campaignId, requestId),
    getFacebookAdSet(adSetId, requestId)
  ]);
  assertScheduleIsOpen("Campaign", campaignId, campaign.stop_time);
  assertScheduleIsOpen("AdSet", adSetId, adSet.end_time);
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
        projectType,
        sourceFileName: creative.source_file_name ?? undefined,
        assetType
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

export async function launchCreativeGroup(groupId: string, placementInput?: LaunchPlacementInput, requestId?: string) {
  const group = await getCreativeGroupById(groupId, [DB_STATUS.READY_TO_LAUNCH, DB_STATUS.LAUNCH_FAILED]);
  if (!group) {
    throw new Error("Ad not found or not ready to launch");
  }

  let launchableCreatives = group.creatives.filter(
    (creative) => creative.asset_placement !== "do_not_use" && creative.asset_id && creative.asset_type
  );
  if (!launchableCreatives.length) {
    throw new Error(`Ad "${group.group_name}" has no launchable assets`);
  }
  const launchableCreativeIds = new Set(launchableCreatives.map((creative) => creative.id));
  const skippedCreatives = group.creatives.filter((creative) => !launchableCreativeIds.has(creative.id));
  const primary =
    launchableCreatives.find((creative) => creative.id === group.primary_creative.id) ?? launchableCreatives[0];

  const launchInput = cleanLaunchInput(placementInput);
  const campaignId = launchInput.campaignId ?? cleanText(primary.campaign_id);
  const adSetId = launchInput.adSetId ?? cleanText(primary.adset_id);
  if (!campaignId || !adSetId) {
    throw new Error(`Ad "${group.group_name}" is missing Meta campaign/ad set selection`);
  }

  const projectType = launchInput.projectType ?? cleanText(primary.project_type) ?? group.group_name ?? "creative";
  const adText = launchInput.adText ?? cleanText(primary.ad_text);
  const headline = launchInput.headline ?? cleanText(primary.headline);
  const headlineVariants = launchInput.headlineVariants ?? primary.headline_variants ?? [];
  const adTextVariants = launchInput.adTextVariants ?? primary.ad_text_variants ?? [];
  const ctaType = launchInput.ctaType ?? cleanText(primary.cta_type);
  const ctaTypeVariants = launchInput.ctaTypeVariants ?? primary.cta_type_variants ?? [];
  const ctaLink = launchInput.ctaLink ?? cleanText(primary.cta_link);
  const audience = launchInput.audience ?? cleanText(primary.audience);
  const location = launchInput.location ?? cleanText(primary.location);
  if (!adText || !ctaLink) {
    throw new Error(`Ad "${group.group_name}" is missing required launch fields`);
  }
  if (!isHttpUrl(ctaLink)) {
    throw new Error(`Ad "${group.group_name}" link must be a valid http(s) URL`);
  }

  launchableCreatives = await Promise.all(launchableCreatives.map((creative) => refreshMockLaunchAsset(creative, requestId)));
  assertUniqueLaunchPlacements(group.group_name, launchableCreatives);
  const assetTypes = new Set(launchableCreatives.map((creative) => creative.asset_type));
  if (assetTypes.size > 1) {
    throw new Error(`Ad "${group.group_name}" mixes image and video assets. Separate them before launch.`);
  }

  const [campaign, adSet] = await Promise.all([
    getFacebookCampaign(campaignId, requestId),
    getFacebookAdSet(adSetId, requestId)
  ]);
  assertScheduleIsOpen("Campaign", campaignId, campaign.stop_time);
  assertScheduleIsOpen("AdSet", adSetId, adSet.end_time);
  if (adSet.campaign_id !== campaignId) {
    throw new Error(`AdSet ${adSetId} belongs to campaign ${adSet.campaign_id}, not ${campaignId}`);
  }

  const campaignName = launchInput.campaignName ?? cleanText(primary.campaign_name);
  const adSetName = launchInput.adSetName ?? adSet.name ?? cleanText(primary.adset_name);
  for (const creative of launchableCreatives) {
    await updateCreativeStatus(creative.id, DB_STATUS.LAUNCHING, {
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
  }
  await updateLaunchStarted(primary.notion_task_id);
  await recordEvent({
    requestId,
    creativeId: primary.id,
    notionTaskId: primary.notion_task_id,
    action: "launch_group_started",
    status: "success",
    metadata: { groupId, groupKey: group.group_key, campaignId, adSetId, creativeIds: launchableCreatives.map((creative) => creative.id) }
  });

  try {
    const firstAsset = launchableCreatives[0];
    const facebookAdId = await createAd({
      name: adName({
        projectType,
        sourceFileName: group.group_key,
        assetType: firstAsset.asset_type!
      }),
      adSetId,
      assetId: firstAsset.asset_id!,
      assetType: firstAsset.asset_type!,
      assets: launchableCreatives.map((creative) => ({
        assetId: creative.asset_id!,
        assetType: creative.asset_type!,
        placement: creative.asset_placement
      })),
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
    for (const creative of launchableCreatives) {
      await updateCreativeStatus(creative.id, DB_STATUS.LAUNCHED, {
        facebookAdId,
        launchedAt
      });
    }
    for (const creative of skippedCreatives) {
      await updateCreativeStatus(creative.id, DB_STATUS.CANCELED);
    }
    await updateLaunchSuccess(primary.notion_task_id, facebookAdId);
    await recordEvent({
      requestId,
      creativeId: primary.id,
      notionTaskId: primary.notion_task_id,
      action: "launch_group_completed",
      status: "success",
      metadata: { facebookAdId, campaignId, adSetId, groupId, creativeIds: launchableCreatives.map((creative) => creative.id) }
    });

    return getCreativeGroupById(groupId);
  } catch (error) {
    const message = getErrorMessage(error);
    for (const creative of launchableCreatives) {
      await updateCreativeStatus(creative.id, DB_STATUS.LAUNCH_FAILED);
    }
    await updateLaunchFailed(primary.notion_task_id, message);
    await recordEvent({
      requestId,
      creativeId: primary.id,
      notionTaskId: primary.notion_task_id,
      action: "launch_group_completed",
      status: "failed",
      error: message,
      metadata: { groupId, creativeIds: launchableCreatives.map((creative) => creative.id) }
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
