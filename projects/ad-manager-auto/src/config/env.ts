import "dotenv/config";
import { z } from "zod";

const booleanFromString = z
  .string()
  .optional()
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),
  PUBLIC_BASE_URL: z.string().optional(),
  RUN_MIGRATIONS_ON_START: booleanFromString.default("true"),
  AUTH_DISABLED: booleanFromString.default("false"),

  DATABASE_URL: z.string().optional(),

  NOTION_TOKEN: z.string().optional(),
  NOTION_ACTIVITIES_DATABASE_ID: z.string().optional(),
  NOTION_CAMPAIGNS_DATABASE_ID: z.string().optional(),
  NOTION_WEBHOOK_SECRET: z.string().optional(),
  WEBHOOK_SHARED_SECRET: z.string().optional(),

  NOTION_PROP_AD_STATUS: z.string().default("Ad Status"),
  NOTION_PROP_CTA_LINK: z.string().default("Ad link"),
  NOTION_PROP_GOOGLE_DRIVE_LINK: z.string().default("Google Drive Link"),
  NOTION_PROP_FINAL_PROJECT: z.string().default("Final project"),
  NOTION_PROP_DESIGN_STATUS: z.string().default("Design Status"),
  NOTION_PROP_PROJECT_TYPE: z.string().default("Project Type"),
  NOTION_PROP_FB_ASSET_ID: z.string().default("Facebook Asset ID"),
  NOTION_PROP_FB_ASSET_TYPE: z.string().default("Facebook Asset Type"),
  NOTION_PROP_FB_AD_ID: z.string().default("Facebook Ad ID"),
  NOTION_PROP_AD_ERROR: z.string().default("Ad Error"),
  NOTION_PROP_AD_UPLOADED_AT: z.string().default("Ad Uploaded At"),
  NOTION_PROP_AD_LAUNCHED_AT: z.string().default("Ad Launched At"),
  NOTION_PROP_AD_LAST_SYNCED_AT: z.string().default("Ad Last Synced At"),
  NOTION_PROP_AD_PREVIEW_URL: z.string().default("Ad Preview URL"),

  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  FB_GRAPH_VERSION: z.string().default("v25.0"),
  FB_APP_ID: z.string().optional(),
  FB_APP_SECRET: z.string().optional(),
  FB_ACCESS_TOKEN: z.string().optional(),
  FB_AD_ACCOUNT_ID: z.string().optional(),
  FB_PAGE_ID: z.string().optional(),
  FB_INSTAGRAM_USER_ID: z.string().optional(),
  FB_INSTAGRAM_ACTOR_ID: z.string().optional(),
  FB_ENABLE_ADSET_CREATE: booleanFromString.default("false"),
  FB_DEFAULT_DAILY_BUDGET_MINOR: z.coerce.number().optional(),
  FB_DEFAULT_TARGETING_JSON: z.string().default('{"geo_locations":{"countries":["UA"]}}'),
  MOCK_FACEBOOK: booleanFromString.default("false"),

  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),

  OKTA_ISSUER: z.string().optional(),
  OKTA_CLIENT_ID: z.string().optional()
});

export const env = envSchema.parse(process.env);

export const notionPropertyNames = {
  adStatus: env.NOTION_PROP_AD_STATUS,
  ctaLink: env.NOTION_PROP_CTA_LINK,
  googleDriveLink: env.NOTION_PROP_GOOGLE_DRIVE_LINK,
  finalProject: env.NOTION_PROP_FINAL_PROJECT,
  designStatus: env.NOTION_PROP_DESIGN_STATUS,
  projectType: env.NOTION_PROP_PROJECT_TYPE,
  facebookAssetId: env.NOTION_PROP_FB_ASSET_ID,
  facebookAssetType: env.NOTION_PROP_FB_ASSET_TYPE,
  facebookAdId: env.NOTION_PROP_FB_AD_ID,
  adError: env.NOTION_PROP_AD_ERROR,
  adUploadedAt: env.NOTION_PROP_AD_UPLOADED_AT,
  adLaunchedAt: env.NOTION_PROP_AD_LAUNCHED_AT,
  adLastSyncedAt: env.NOTION_PROP_AD_LAST_SYNCED_AT,
  adPreviewUrl: env.NOTION_PROP_AD_PREVIEW_URL
} as const;

export function requireEnv(name: keyof typeof env): string {
  const value = env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
