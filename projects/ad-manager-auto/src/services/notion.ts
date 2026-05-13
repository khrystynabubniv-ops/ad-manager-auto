import { Client } from "@notionhq/client";
import { env, notionPropertyNames, requireEnv } from "../config/env.js";
import { AD_STATUS } from "../config/statuses.js";
import { logger } from "../logger.js";
import { AssetType, NotionCreativeFields } from "../types.js";

type NotionPage = Awaited<ReturnType<Client["pages"]["retrieve"]>>;
type Properties = Record<string, any>;

let notion: Client | undefined;

const campaignPropertyAliases = [
  "Campaign",
  "Campaigns",
  "Meta Campaign",
  "Meta campaign",
  "FB Campaign",
  "FB campaign",
  "Facebook campaign"
];

const campaignIdPropertyAliases = [
  "Campaign ID",
  "Campaign Id",
  "Meta Campaign ID",
  "Meta campaign ID",
  "FB Campaign ID",
  "FB campaign ID",
  "Facebook campaign id",
  "Facebook Campaign Id"
];

export function getNotionClient(): Client {
  notion ??= new Client({ auth: requireEnv("NOTION_TOKEN") });
  return notion;
}

function normalizePropertyName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function findProperty(properties: Properties, preferredName: string, aliases: string[] = []): any {
  return findPropertyEntry(properties, preferredName, aliases)?.[1];
}

function findPropertyEntry(
  properties: Properties,
  preferredName: string,
  aliases: string[] = []
): [string, any] | undefined {
  const direct = properties[preferredName];
  if (direct) return [preferredName, direct];

  const wanted = [preferredName, ...aliases].map(normalizePropertyName);
  const match = Object.entries(properties).find(([key]) => wanted.includes(normalizePropertyName(key)));
  return match as [string, any] | undefined;
}

function resolvePropertyName(properties: Properties, preferredName: string, aliases: string[] = []): string {
  return findPropertyEntry(properties, preferredName, aliases)?.[0] ?? preferredName;
}

function richTextToString(property: any): string | undefined {
  const parts = property?.rich_text ?? property?.title;
  if (!Array.isArray(parts)) return undefined;
  const value = parts.map((part) => part.plain_text ?? "").join("").trim();
  return value || undefined;
}

function nonEmpty(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function joinValues(values?: Array<string | undefined>): string | undefined {
  const text = values?.filter((value): value is string => Boolean(value)).join(", ").trim();
  return text || undefined;
}

function dateToString(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return nonEmpty(value);
  if (value.start && value.end) return `${value.start} - ${value.end}`;
  return nonEmpty(value.start);
}

function fileToString(file: any): string | undefined {
  return nonEmpty(file?.external?.url) ?? nonEmpty(file?.file?.url) ?? nonEmpty(file?.name);
}

function uniqueIdToString(value: any): string | undefined {
  if (!value) return undefined;
  const number = nonEmpty(value.number);
  if (!number) return undefined;
  return `${value.prefix ?? ""}${number}`;
}

function rollupToString(rollup: any): string | undefined {
  if (!rollup) return undefined;
  if (rollup.type === "array" && Array.isArray(rollup.array)) {
    return joinValues(rollup.array.map(propertyToString));
  }
  if (rollup.type === "number") return nonEmpty(rollup.number);
  if (rollup.type === "date") return dateToString(rollup.date);
  return undefined;
}

function propertyToString(property: any): string | undefined {
  if (!property) return undefined;
  if (typeof property !== "object") return nonEmpty(property);

  if (property.type === "title" || property.title) return richTextToString(property);
  if (property.type === "rich_text" || property.rich_text) return richTextToString(property);
  if (property.type === "url" || "url" in property) return property.url ?? undefined;
  if (property.type === "status" || property.status) return property.status?.name;
  if (property.type === "select" || property.select) return property.select?.name;
  if (property.type === "multi_select" || Array.isArray(property.multi_select)) {
    return joinValues(property.multi_select?.map((option: any) => nonEmpty(option.name)));
  }
  if (property.type === "files" || Array.isArray(property.files)) {
    return joinValues(property.files?.map(fileToString));
  }
  if (property.type === "email" || "email" in property) return nonEmpty(property.email);
  if (property.type === "phone_number" || "phone_number" in property) return nonEmpty(property.phone_number);
  if (property.type === "date" || property.date) return dateToString(property.date);
  if (property.type === "checkbox" || "checkbox" in property) {
    return typeof property.checkbox === "boolean" ? String(property.checkbox) : undefined;
  }
  if (property.type === "people" || Array.isArray(property.people)) {
    return joinValues(
      property.people?.map((person: any) => nonEmpty(person.name) ?? nonEmpty(person.person?.email) ?? nonEmpty(person.id))
    );
  }
  if (property.type === "relation" || Array.isArray(property.relation)) {
    return joinValues(property.relation?.map((relation: any) => nonEmpty(relation.id)));
  }
  if (property.type === "rollup" || property.rollup) return rollupToString(property.rollup);
  if (property.type === "unique_id" || property.unique_id) return uniqueIdToString(property.unique_id);
  if (property.type === "created_time" || property.created_time) return nonEmpty(property.created_time);
  if (property.type === "last_edited_time" || property.last_edited_time) return nonEmpty(property.last_edited_time);
  if (property.type === "created_by" || property.created_by) return nonEmpty(property.created_by?.name) ?? nonEmpty(property.created_by?.id);
  if (property.type === "last_edited_by" || property.last_edited_by) return nonEmpty(property.last_edited_by?.name) ?? nonEmpty(property.last_edited_by?.id);
  if (property.type === "number" || "number" in property) return property.number?.toString();
  if (property.type === "formula" || property.formula) {
    const formula = property.formula;
    if (formula?.type === "string") return formula.string ?? undefined;
    if (formula?.type === "number") return formula.number?.toString();
    if (formula?.type === "boolean") return String(formula.boolean);
    if (formula?.type === "date") return dateToString(formula.date);
  }
  return undefined;
}

function relationPageId(property: any): string | undefined {
  if (!property?.relation?.length) return undefined;
  return property.relation[0].id;
}

function relationName(property: any): string | undefined {
  if (!property?.relation?.length) return undefined;
  return property.relation[0].id;
}

function richText(value?: string) {
  return {
    rich_text: value
      ? [
          {
            type: "text",
            text: { content: value.slice(0, 2000) }
          }
        ]
      : []
  };
}

function select(name?: string) {
  return name ? { select: { name } } : { select: null };
}

function status(name?: string) {
  return name ? { status: { name } } : { status: null };
}

function url(value?: string) {
  return { url: value ?? null };
}

function date(value?: Date) {
  return value ? { date: { start: value.toISOString() } } : { date: null };
}

function notionProperties(properties: Record<string, unknown>) {
  return properties as any;
}

async function resolveAdPropertyNames(pageId: string) {
  const page = (await getNotionClient().pages.retrieve({ page_id: pageId })) as NotionPage & {
    properties: Properties;
  };
  const p = page.properties;

  return {
    adStatus: resolvePropertyName(p, notionPropertyNames.adStatus, ["Ad status"]),
    adText: resolvePropertyName(p, notionPropertyNames.adText, ["Ad text"]),
    ctaLink: resolvePropertyName(p, notionPropertyNames.ctaLink, ["CTA link"]),
    googleDriveLink: resolvePropertyName(p, notionPropertyNames.googleDriveLink),
    facebookAssetId: resolvePropertyName(p, notionPropertyNames.facebookAssetId),
    facebookAssetType: resolvePropertyName(p, notionPropertyNames.facebookAssetType),
    facebookAdId: resolvePropertyName(p, notionPropertyNames.facebookAdId),
    adError: resolvePropertyName(p, notionPropertyNames.adError),
    adUploadedAt: resolvePropertyName(p, notionPropertyNames.adUploadedAt),
    adLaunchedAt: resolvePropertyName(p, notionPropertyNames.adLaunchedAt),
    adLastSyncedAt: resolvePropertyName(p, notionPropertyNames.adLastSyncedAt),
    adPreviewUrl: resolvePropertyName(p, notionPropertyNames.adPreviewUrl)
  };
}

export async function retrieveCreativePage(pageId: string): Promise<NotionCreativeFields> {
  const page = (await getNotionClient().pages.retrieve({ page_id: pageId })) as NotionPage & {
    properties: Properties;
    url?: string;
    id: string;
  };

  return mapNotionPage(page);
}

async function mapNotionPage(page: NotionPage & { properties: Properties; url?: string; id: string }): Promise<NotionCreativeFields> {
  const p = page.properties;
  const campaignProperty = findProperty(p, notionPropertyNames.facebookCampaign, campaignPropertyAliases);
  const campaignPageId = relationPageId(campaignProperty);
  let campaignId = propertyToString(findProperty(p, notionPropertyNames.facebookCampaignId, campaignIdPropertyAliases));
  let campaignName = propertyToString(campaignProperty) ?? relationName(campaignProperty);

  if (!campaignId && campaignPageId) {
    const campaign = await retrieveCampaignPage(campaignPageId);
    campaignId = campaign.facebookCampaignId;
    campaignName = campaign.name;
  }

  return {
    notionTaskId: page.id,
    notionTaskUrl: page.url,
    name: propertyToString(findProperty(p, "Name")) ?? "Untitled",
    designStatus: propertyToString(findProperty(p, notionPropertyNames.designStatus)),
    adStatus: propertyToString(findProperty(p, notionPropertyNames.adStatus, ["Ad status"])),
    adText: propertyToString(findProperty(p, notionPropertyNames.adText, ["Ad text"])),
    ctaLink: propertyToString(findProperty(p, notionPropertyNames.ctaLink, ["CTA link"])),
    googleDriveLink: propertyToString(findProperty(p, notionPropertyNames.googleDriveLink)),
    finalProject: propertyToString(findProperty(p, notionPropertyNames.finalProject)),
    projectType: propertyToString(findProperty(p, notionPropertyNames.projectType)),
    audience: propertyToString(findProperty(p, notionPropertyNames.audience)),
    location: propertyToString(findProperty(p, notionPropertyNames.location)),
    facebookCampaignName: campaignName,
    facebookCampaignId: campaignId,
    facebookCampaignPageId: campaignPageId,
    facebookAssetId: propertyToString(findProperty(p, notionPropertyNames.facebookAssetId)),
    facebookAssetType: propertyToString(findProperty(p, notionPropertyNames.facebookAssetType)) as AssetType | undefined,
    facebookAdId: propertyToString(findProperty(p, notionPropertyNames.facebookAdId))
  };
}

export async function retrieveCampaignPage(pageId: string): Promise<{
  name?: string;
  facebookCampaignId?: string;
  status?: string;
  objective?: string;
}> {
  const page = (await getNotionClient().pages.retrieve({ page_id: pageId })) as NotionPage & {
    properties: Properties;
  };
  const p = page.properties;
  return {
    name: propertyToString(findProperty(p, "Name")),
    facebookCampaignId: propertyToString(findProperty(p, "Facebook Campaign ID", campaignIdPropertyAliases)),
    status: propertyToString(findProperty(p, "Campaign Status")),
    objective: propertyToString(findProperty(p, "Objective"))
  };
}

export async function updateAdPreparation(
  pageId: string,
  googleDriveLink?: string,
  errorMessage?: string
): Promise<void> {
  const names = await resolveAdPropertyNames(pageId);
  await getNotionClient().pages.update({
    page_id: pageId,
    properties: notionProperties({
      [names.adStatus]: status(AD_STATUS.NEEDS_DETAILS),
      ...(googleDriveLink ? { [names.googleDriveLink]: url(googleDriveLink) } : {}),
      [names.adLastSyncedAt]: date(new Date()),
      [names.adError]: richText(errorMessage)
    })
  });
}

export async function updateUploadStarted(pageId: string): Promise<void> {
  const names = await resolveAdPropertyNames(pageId);
  await getNotionClient().pages.update({
    page_id: pageId,
    properties: notionProperties({
      [names.adStatus]: status(AD_STATUS.UPLOADING),
      [names.adError]: richText(undefined),
      [names.adLastSyncedAt]: date(new Date())
    })
  });
}

export async function updateUploadSuccess(
  pageId: string,
  input: { assetId: string; assetType: AssetType; previewUrl?: string }
): Promise<void> {
  const names = await resolveAdPropertyNames(pageId);
  await getNotionClient().pages.update({
    page_id: pageId,
    properties: notionProperties({
      [names.adStatus]: status(AD_STATUS.READY_TO_LAUNCH),
      [names.facebookAssetId]: richText(input.assetId),
      [names.facebookAssetType]: select(input.assetType),
      [names.adUploadedAt]: date(new Date()),
      [names.adLastSyncedAt]: date(new Date()),
      ...(input.previewUrl ? { [names.adPreviewUrl]: url(input.previewUrl) } : {}),
      [names.adError]: richText(undefined)
    })
  });
}

export async function updateUploadFailed(pageId: string, message: string): Promise<void> {
  const names = await resolveAdPropertyNames(pageId);
  await getNotionClient().pages.update({
    page_id: pageId,
    properties: notionProperties({
      [names.adStatus]: status(AD_STATUS.UPLOAD_FAILED),
      [names.adError]: richText(message),
      [names.adLastSyncedAt]: date(new Date())
    })
  });
}

export async function updateLaunchStarted(pageId: string): Promise<void> {
  const names = await resolveAdPropertyNames(pageId);
  await getNotionClient().pages.update({
    page_id: pageId,
    properties: notionProperties({
      [names.adStatus]: status(AD_STATUS.LAUNCHING),
      [names.adError]: richText(undefined),
      [names.adLastSyncedAt]: date(new Date())
    })
  });
}

export async function updateLaunchSuccess(pageId: string, facebookAdId: string): Promise<void> {
  const names = await resolveAdPropertyNames(pageId);
  await getNotionClient().pages.update({
    page_id: pageId,
    properties: notionProperties({
      [names.adStatus]: status(AD_STATUS.LAUNCHED),
      [names.facebookAdId]: richText(facebookAdId),
      [names.adLaunchedAt]: date(new Date()),
      [names.adLastSyncedAt]: date(new Date()),
      [names.adError]: richText(undefined)
    })
  });
}

export async function updateLaunchFailed(pageId: string, message: string): Promise<void> {
  const names = await resolveAdPropertyNames(pageId);
  await getNotionClient().pages.update({
    page_id: pageId,
    properties: notionProperties({
      [names.adStatus]: status(AD_STATUS.LAUNCH_FAILED),
      [names.adError]: richText(message),
      [names.adLastSyncedAt]: date(new Date())
    })
  });
}

export async function queryCampaignsDatabase(): Promise<Array<{ pageId: string; campaignId?: string; name?: string }>> {
  if (!env.NOTION_CAMPAIGNS_DATABASE_ID) {
    return [];
  }

  const response = await getNotionClient().databases.query({
    database_id: env.NOTION_CAMPAIGNS_DATABASE_ID
  });

  return response.results.map((result: any) => ({
    pageId: result.id,
    campaignId: propertyToString(findProperty(result.properties, "Facebook Campaign ID")),
    name: propertyToString(findProperty(result.properties, "Name"))
  }));
}

export async function upsertCampaignPage(input: {
  name: string;
  facebookCampaignId: string;
  status?: string;
  objective?: string;
}): Promise<void> {
  if (!env.NOTION_CAMPAIGNS_DATABASE_ID) {
    logger.warn("NOTION_CAMPAIGNS_DATABASE_ID is missing; skipping Notion campaign sync");
    return;
  }

  const existing = (await queryCampaignsDatabase()).find(
    (campaign) => campaign.campaignId === input.facebookCampaignId
  );

  const properties = {
    Name: {
      title: [{ type: "text", text: { content: input.name } }]
    },
    "Facebook Campaign ID": richText(input.facebookCampaignId),
    "Campaign Status": select(input.status ?? "UNKNOWN"),
    Objective: richText(input.objective),
    "Last Synced At": date(new Date())
  };

  if (existing) {
    await getNotionClient().pages.update({ page_id: existing.pageId, properties: notionProperties(properties) });
    return;
  }

  await getNotionClient().pages.create({
    parent: { database_id: env.NOTION_CAMPAIGNS_DATABASE_ID },
    properties: notionProperties(properties)
  });
}
