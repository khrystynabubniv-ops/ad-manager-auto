import path from "node:path";
import { google } from "googleapis";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { DownloadedDriveFile } from "../types.js";
import { detectAssetType, extensionFromMime } from "../utils/mime.js";

const driveFileIdPatterns = [
  /\/file\/d\/([a-zA-Z0-9_-]+)/,
  /[?&]id=([a-zA-Z0-9_-]+)/,
  /\/open\?id=([a-zA-Z0-9_-]+)/
];

const driveFolderIdPatterns = [
  /\/drive\/folders\/([a-zA-Z0-9_-]+)/,
  /\/folders\/([a-zA-Z0-9_-]+)/
];

export function extractDriveFileId(url: string): string {
  for (const pattern of driveFileIdPatterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  if (/^[a-zA-Z0-9_-]{20,}$/.test(url)) {
    return url;
  }

  throw new Error(`Could not extract Google Drive file id from URL: ${url}`);
}

export function extractDriveFolderId(url: string): string {
  for (const pattern of driveFolderIdPatterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error(`Could not extract Google Drive folder id from URL: ${url}`);
}

export function extractDriveSourceId(url: string): string {
  try {
    return extractDriveFileId(url);
  } catch {
    return extractDriveFolderId(url);
  }
}

function getGoogleAuth() {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"]
    });
  }

  return new google.auth.GoogleAuth({
    keyFile: env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"]
  });
}

function driveClient() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}

async function downloadDriveFileById(
  fileId: string,
  requestId?: string,
  knownMetadata?: { name?: string | null; mimeType?: string | null; size?: string | number | null }
): Promise<DownloadedDriveFile> {
  logger.info({ requestId, fileId }, "Downloading creative from Google Drive");

  const drive = driveClient();
  const metadataResponse = knownMetadata?.name && knownMetadata?.mimeType ? undefined : await drive.files.get({
    fileId,
    fields: "id,name,mimeType,size",
    supportsAllDrives: true
  });

  const metadata = knownMetadata?.name && knownMetadata?.mimeType ? knownMetadata : metadataResponse!.data;
  if (!metadata.name || !metadata.mimeType) {
    throw new Error(`Google Drive file ${fileId} is missing name or MIME type`);
  }

  if (metadata.mimeType.startsWith("application/vnd.google-apps.")) {
    throw new Error(
      `Google Drive file ${metadata.name} is a Google Workspace document, not an image/video export`
    );
  }

  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true
    },
    {
      responseType: "arraybuffer"
    }
  );

  const buffer = Buffer.from(response.data as ArrayBuffer);
  const ext = path.extname(metadata.name) || extensionFromMime(metadata.mimeType);
  const fileName = path.extname(metadata.name) ? metadata.name : `${metadata.name}${ext}`;

  logger.info(
    { requestId, fileId, fileName, mimeType: metadata.mimeType, bytes: buffer.length },
    "Downloaded Google Drive creative"
  );

  return {
    fileId,
    fileName,
    mimeType: metadata.mimeType,
    buffer,
    size: metadata.size ? Number(metadata.size) : buffer.length
  };
}

export async function downloadDriveFile(fileUrl: string, requestId?: string): Promise<DownloadedDriveFile> {
  return downloadDriveFileById(extractDriveFileId(fileUrl), requestId);
}

export async function downloadDriveCreatives(sourceUrl: string, requestId?: string): Promise<DownloadedDriveFile[]> {
  let folderId: string | undefined;
  try {
    folderId = extractDriveFolderId(sourceUrl);
  } catch {
    return [await downloadDriveFile(sourceUrl, requestId)];
  }

  const drive = driveClient();
  logger.info({ requestId, folderId }, "Listing creative files from Google Drive folder");

  const files: Array<{ id?: string | null; name?: string | null; mimeType?: string | null; size?: string | null }> = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size)",
      pageSize: 1000,
      orderBy: "name",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageToken
    });

    files.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  const creativeFiles = files.filter((file) => {
    if (!file.id || !file.name || !file.mimeType) {
      return false;
    }
    if (file.mimeType === "application/vnd.google-apps.folder") {
      return false;
    }
    try {
      detectAssetType(file.name, file.mimeType);
      return true;
    } catch {
      return false;
    }
  });

  if (!creativeFiles.length) {
    throw new Error("Google Drive folder does not contain supported image/video creative files");
  }

  logger.info(
    { requestId, folderId, totalFiles: files.length, creativeFiles: creativeFiles.length },
    "Found creative files in Google Drive folder"
  );

  return Promise.all(
    creativeFiles.map((file) =>
      downloadDriveFileById(file.id!, requestId, {
        name: file.name,
        mimeType: file.mimeType,
        size: file.size
      })
    )
  );
}
