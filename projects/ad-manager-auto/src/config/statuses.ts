export const DESIGN_STATUS = {
  APPROVED_FOR_AD: "Approved for Ad"
} as const;

export const AD_STATUS = {
  NOT_STARTED: "Not started",
  APPROVED_FOR_AD: "Approved for Ad",
  NEEDS_DETAILS: "Needs Ad Details",
  READY_TO_UPLOAD: "Ready to Upload",
  UPLOADING: "Uploading",
  READY_TO_LAUNCH: "Ready to Launch",
  LAUNCHING: "Launching",
  LAUNCHED: "Launched",
  UPLOAD_FAILED: "Upload Failed",
  LAUNCH_FAILED: "Launch Failed",
  CANCELED: "Canceled"
} as const;

export type AdStatus = (typeof AD_STATUS)[keyof typeof AD_STATUS];

export const DB_STATUS = {
  NEEDS_DETAILS: "needs_ad_details",
  UPLOADING: "uploading",
  READY_TO_LAUNCH: "ready_to_launch",
  UPLOAD_FAILED: "upload_failed",
  LAUNCHING: "launching",
  LAUNCHED: "launched",
  LAUNCH_FAILED: "launch_failed",
  CANCELED: "canceled"
} as const;

export type DbCreativeStatus = (typeof DB_STATUS)[keyof typeof DB_STATUS];
