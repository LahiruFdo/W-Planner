"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORY_BLOB_NAME = exports.IMAGES_CONTAINER = exports.CONTENT_CONTAINER = exports.GUESTS_TABLE_NAME = exports.GUEST_PARTITION_KEY = void 0;
exports.requireConnectionString = requireConnectionString;
exports.getTableClient = getTableClient;
exports.getBlobServiceClient = getBlobServiceClient;
exports.parseAccountFromConnectionString = parseAccountFromConnectionString;
exports.ensureContainersExist = ensureContainersExist;
exports.ensureBlobCorsConfigured = ensureBlobCorsConfigured;
exports.generateUploadSasUrl = generateUploadSasUrl;
const data_tables_1 = require("@azure/data-tables");
const storage_blob_1 = require("@azure/storage-blob");
exports.GUEST_PARTITION_KEY = 'guest';
exports.GUESTS_TABLE_NAME = 'weddingGuests';
exports.CONTENT_CONTAINER = 'content';
exports.IMAGES_CONTAINER = 'storyimages';
exports.STORY_BLOB_NAME = 'story.json';
function requireConnectionString() {
    const cs = process.env.STORAGE_CONNECTION_STRING?.trim();
    return cs || null;
}
function getTableClient() {
    const cs = requireConnectionString();
    if (!cs) {
        return null;
    }
    return data_tables_1.TableClient.fromConnectionString(cs, exports.GUESTS_TABLE_NAME);
}
function getBlobServiceClient() {
    const cs = requireConnectionString();
    if (!cs) {
        return null;
    }
    return storage_blob_1.BlobServiceClient.fromConnectionString(cs);
}
// Well-known shared key for the Azurite local emulator. Used only when the
// connection string is the shorthand `UseDevelopmentStorage=true`, which has
// no embedded AccountName/AccountKey but is still expected to work for SAS.
const AZURITE_ACCOUNT_NAME = 'devstoreaccount1';
const AZURITE_ACCOUNT_KEY = 'Eby8vdM02xNOcqFlqUwJPLlmEYmKZqWGiBO9Pn1k6+L5EpiSjbwo/5kk1sObrUgABEcjpDQXdmKZSpEDjVbS5GQ==';
function parseAccountFromConnectionString(connectionString) {
    if (/UseDevelopmentStorage\s*=\s*true/i.test(connectionString)) {
        return { accountName: AZURITE_ACCOUNT_NAME, accountKey: AZURITE_ACCOUNT_KEY };
    }
    const nameMatch = /AccountName=([^;]+)/i.exec(connectionString);
    const keyMatch = /AccountKey=([^;]+)/i.exec(connectionString);
    if (!nameMatch?.[1] || !keyMatch?.[1]) {
        return null;
    }
    return { accountName: nameMatch[1], accountKey: keyMatch[1] };
}
async function ensureContainersExist(client) {
    await client.getContainerClient(exports.CONTENT_CONTAINER).createIfNotExists();
    await client.getContainerClient(exports.IMAGES_CONTAINER).createIfNotExists({ access: 'blob' });
}
// Browser uploads via SAS hit the storage account directly, which means the
// storage account itself must allow the app's origin for PUT requests. Without
// these CORS rules, the preflight fails and the upload looks like a generic
// network error to the user.
let corsConfigured = false;
async function ensureBlobCorsConfigured(client) {
    if (corsConfigured) {
        return;
    }
    try {
        const allowedOrigins = process.env.STORAGE_CORS_ORIGINS?.trim() || '*';
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
    }
    catch (e) {
        // Don't block the upload flow if CORS can't be set (e.g. the storage
        // identity lacks permissions). Surface to the function logs instead.
        console.error('Failed to set Blob CORS rules:', e);
    }
}
function generateUploadSasUrl(connectionString, blobName, contentType) {
    const parsed = parseAccountFromConnectionString(connectionString);
    if (!parsed) {
        return null;
    }
    const { accountName, accountKey } = parsed;
    const credential = new storage_blob_1.StorageSharedKeyCredential(accountName, accountKey);
    const containerClient = storage_blob_1.BlobServiceClient.fromConnectionString(connectionString).getContainerClient(exports.IMAGES_CONTAINER);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + 15 * 60 * 1000);
    const sas = (0, storage_blob_1.generateBlobSASQueryParameters)({
        containerName: exports.IMAGES_CONTAINER,
        blobName,
        permissions: storage_blob_1.BlobSASPermissions.parse('cw'),
        startsOn,
        expiresOn,
        protocol: storage_blob_1.SASProtocol.Https,
        contentType
    }, credential).toString();
    const uploadUrl = `${blockBlobClient.url}?${sas}`;
    const publicUrl = blockBlobClient.url;
    return { uploadUrl, publicUrl };
}
