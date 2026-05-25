import { TableClient } from '@azure/data-tables';
import {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters
} from '@azure/storage-blob';

export const GUEST_PARTITION_KEY = 'guest';
export const GUESTS_TABLE_NAME = 'weddingGuests';
export const CONTENT_CONTAINER = 'content';
export const IMAGES_CONTAINER = 'storyimages';
export const STORY_BLOB_NAME = 'story.json';

export function requireConnectionString(): string | null {
  const cs = process.env.STORAGE_CONNECTION_STRING?.trim();
  return cs || null;
}

export function getTableClient(): TableClient | null {
  const cs = requireConnectionString();
  if (!cs) {
    return null;
  }
  return TableClient.fromConnectionString(cs, GUESTS_TABLE_NAME);
}

export function getBlobServiceClient(): BlobServiceClient | null {
  const cs = requireConnectionString();
  if (!cs) {
    return null;
  }
  return BlobServiceClient.fromConnectionString(cs);
}

export function parseAccountFromConnectionString(connectionString: string): {
  accountName: string;
  accountKey: string;
} | null {
  const nameMatch = /AccountName=([^;]+)/i.exec(connectionString);
  const keyMatch = /AccountKey=([^;]+)/i.exec(connectionString);
  if (!nameMatch?.[1] || !keyMatch?.[1]) {
    return null;
  }
  return { accountName: nameMatch[1], accountKey: keyMatch[1] };
}

export async function ensureContainersExist(client: BlobServiceClient): Promise<void> {
  await client.getContainerClient(CONTENT_CONTAINER).createIfNotExists();
  await client.getContainerClient(IMAGES_CONTAINER).createIfNotExists({ access: 'blob' });
}

// Browser uploads via SAS hit the storage account directly, which means the
// storage account itself must allow the app's origin for PUT requests. Without
// these CORS rules, the preflight fails and the upload looks like a generic
// network error to the user.
let corsConfigured = false;
export async function ensureBlobCorsConfigured(client: BlobServiceClient): Promise<void> {
  if (corsConfigured) {
    return;
  }
  try {
    const allowedOrigins =
      process.env.STORAGE_CORS_ORIGINS?.trim() || '*';
    await client.setProperties({
      cors: [
        {
          allowedOrigins,
          allowedMethods: 'GET,HEAD,PUT,OPTIONS',
          allowedHeaders: '*',
          exposedHeaders: '*',
          maxAgeInSeconds: 3600
        }
      ]
    });
    corsConfigured = true;
  } catch (e) {
    // Don't block the upload flow if CORS can't be set (e.g. the storage
    // identity lacks permissions). Surface to the function logs instead.
    console.error('Failed to set Blob CORS rules:', e);
  }
}

export function generateUploadSasUrl(
  connectionString: string,
  blobName: string,
  contentType: string
): { uploadUrl: string; publicUrl: string } | null {
  const parsed = parseAccountFromConnectionString(connectionString);
  if (!parsed) {
    return null;
  }
  const { accountName, accountKey } = parsed;
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const containerClient = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(
    IMAGES_CONTAINER
  );
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + 15 * 60 * 1000);

  const sas = generateBlobSASQueryParameters(
    {
      containerName: IMAGES_CONTAINER,
      blobName,
      permissions: BlobSASPermissions.parse('cw'),
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
      contentType
    },
    credential
  ).toString();

  const uploadUrl = `${blockBlobClient.url}?${sas}`;
  const publicUrl = blockBlobClient.url;
  return { uploadUrl, publicUrl };
}
