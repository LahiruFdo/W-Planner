"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminUploadImageSasHandler = adminUploadImageSasHandler;
const crypto_1 = require("crypto");
const path_1 = require("path");
const functions_1 = require("@azure/functions");
const adminAuth_1 = require("../lib/adminAuth");
const cors_1 = require("../lib/cors");
const storage_1 = require("../lib/storage");
async function adminUploadImageSasHandler(request, _context) {
    if (request.method === 'OPTIONS') {
        return (0, cors_1.corsOptions)();
    }
    const denied = (0, adminAuth_1.requireAdmin)(request);
    if (denied) {
        return denied;
    }
    const cs = (0, storage_1.requireConnectionString)();
    if (!cs) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { error: 'Storage is not configured.' } });
    }
    let body;
    try {
        body = (await request.json());
    }
    catch {
        return (0, cors_1.withCors)({ status: 400, jsonBody: { error: 'Invalid JSON body.' } });
    }
    const fileName = (body.fileName ?? 'image.jpg').trim() || 'image.jpg';
    const contentType = (body.contentType ?? 'image/jpeg').trim() || 'image/jpeg';
    const ext = (0, path_1.extname)(fileName) || '.jpg';
    const blobName = `${(0, crypto_1.randomUUID)()}${ext}`;
    const blobClient = (0, storage_1.getBlobServiceClient)();
    if (!blobClient) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { error: 'Blob client unavailable.' } });
    }
    await (0, storage_1.ensureContainersExist)(blobClient);
    const sas = (0, storage_1.generateUploadSasUrl)(cs, blobName, contentType);
    if (!sas) {
        return (0, cors_1.withCors)({ status: 500, jsonBody: { error: 'Could not generate SAS.' } });
    }
    return (0, cors_1.withCors)({
        status: 200,
        jsonBody: {
            uploadUrl: sas.uploadUrl,
            publicUrl: sas.publicUrl,
            blobName
        }
    });
}
functions_1.app.http('adminUploadImageSas', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'manage/images/sas',
    handler: adminUploadImageSasHandler
});
