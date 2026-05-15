"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORY_BLOB_NAME = exports.IMAGES_CONTAINER = exports.CONTENT_CONTAINER = exports.GUESTS_TABLE_NAME = exports.GUEST_PARTITION_KEY = void 0;
exports.requireConnectionString = requireConnectionString;
exports.getTableClient = getTableClient;
exports.getBlobServiceClient = getBlobServiceClient;
exports.parseAccountFromConnectionString = parseAccountFromConnectionString;
exports.ensureContainersExist = ensureContainersExist;
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
function parseAccountFromConnectionString(connectionString) {
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
