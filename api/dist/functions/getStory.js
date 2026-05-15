"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoryHandler = getStoryHandler;
const functions_1 = require("@azure/functions");
const cors_1 = require("../lib/cors");
const storage_1 = require("../lib/storage");
async function readStoryBody() {
    const cs = (0, storage_1.requireConnectionString)();
    if (!cs) {
        return {
            status: 503,
            body: JSON.stringify({ slides: [], error: 'Storage is not configured.' })
        };
    }
    const blobClient = (0, storage_1.getBlobServiceClient)();
    if (!blobClient) {
        return {
            status: 503,
            body: JSON.stringify({ slides: [], error: 'Storage client unavailable.' })
        };
    }
    await (0, storage_1.ensureContainersExist)(blobClient);
    const blockBlob = blobClient.getContainerClient(storage_1.CONTENT_CONTAINER).getBlockBlobClient(storage_1.STORY_BLOB_NAME);
    try {
        const download = await blockBlob.downloadToBuffer();
        const parsed = JSON.parse(download.toString());
        const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
        return { status: 200, body: JSON.stringify({ slides }) };
    }
    catch (e) {
        const statusCode = e?.statusCode;
        if (statusCode === 404) {
            return { status: 200, body: JSON.stringify({ slides: [] }) };
        }
        return {
            status: 500,
            body: JSON.stringify({ slides: [], error: 'Could not read story configuration.' })
        };
    }
}
async function getStoryHandler(request, _context) {
    if (request.method === 'OPTIONS') {
        return (0, cors_1.corsOptions)();
    }
    const { status, body } = await readStoryBody();
    return (0, cors_1.withCors)({
        status,
        body,
        headers: { 'Content-Type': 'application/json' }
    });
}
functions_1.app.http('getStory', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'story',
    handler: getStoryHandler
});
