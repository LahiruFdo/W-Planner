"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminPutStoryConfigHandler = adminPutStoryConfigHandler;
const functions_1 = require("@azure/functions");
const adminAuth_1 = require("../lib/adminAuth");
const cors_1 = require("../lib/cors");
const storage_1 = require("../lib/storage");
function validateSlides(slides) {
    if (!Array.isArray(slides) || slides.length > 40) {
        return false;
    }
    for (const s of slides) {
        if (typeof s.imageUrl !== 'string' || typeof s.title !== 'string') {
            return false;
        }
        if (!s.imageUrl.trim() || !s.title.trim()) {
            return false;
        }
        if (s.caption !== undefined && typeof s.caption !== 'string') {
            return false;
        }
        if (s.imageUrl.length > 2000) {
            return false;
        }
    }
    return true;
}
async function adminPutStoryConfigHandler(request, _context) {
    if (request.method === 'OPTIONS') {
        return (0, cors_1.corsOptions)();
    }
    const denied = (0, adminAuth_1.requireAdmin)(request);
    if (denied) {
        return denied;
    }
    const cs = (0, storage_1.requireConnectionString)();
    if (!cs) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { ok: false, error: 'Storage is not configured.' } });
    }
    let body;
    try {
        body = (await request.json());
    }
    catch {
        return (0, cors_1.withCors)({ status: 400, jsonBody: { ok: false, error: 'Invalid JSON body.' } });
    }
    const slides = body.slides ?? [];
    if (!validateSlides(slides)) {
        return (0, cors_1.withCors)({
            status: 400,
            jsonBody: { ok: false, error: 'slides must be an array of { imageUrl, title, caption }.' }
        });
    }
    const blobClient = (0, storage_1.getBlobServiceClient)();
    if (!blobClient) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { ok: false, error: 'Blob client unavailable.' } });
    }
    await (0, storage_1.ensureContainersExist)(blobClient);
    const blockBlob = blobClient.getContainerClient(storage_1.CONTENT_CONTAINER).getBlockBlobClient(storage_1.STORY_BLOB_NAME);
    const normalized = slides.map((s) => ({
        imageUrl: s.imageUrl.trim(),
        title: s.title.trim(),
        caption: typeof s.caption === 'string' ? s.caption.trim() : ''
    }));
    const payload = JSON.stringify({ slides: normalized });
    try {
        await blockBlob.uploadData(Buffer.from(payload, 'utf8'), {
            blobHTTPHeaders: { blobContentType: 'application/json' }
        });
    }
    catch {
        return (0, cors_1.withCors)({ status: 500, jsonBody: { ok: false, error: 'Could not save story.' } });
    }
    return (0, cors_1.withCors)({ status: 200, jsonBody: { ok: true } });
}
functions_1.app.http('adminPutStoryConfig', {
    methods: ['PUT', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'manage/story',
    handler: adminPutStoryConfigHandler
});
