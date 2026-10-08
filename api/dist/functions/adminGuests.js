"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminGuestsHandler = adminGuestsHandler;
const crypto_1 = require("crypto");
const functions_1 = require("@azure/functions");
const adminAuth_1 = require("../lib/adminAuth");
const cors_1 = require("../lib/cors");
const storage_1 = require("../lib/storage");
async function ensureTable(client) {
    try {
        await client.createTable();
    }
    catch (e) {
        const statusCode = e?.statusCode;
        if (statusCode !== 409) {
            throw e;
        }
    }
}
async function listGuests() {
    const cs = (0, storage_1.requireConnectionString)();
    if (!cs) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { guests: [], error: 'Storage is not configured.' } });
    }
    const table = (0, storage_1.getTableClient)();
    if (!table) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { guests: [], error: 'Table client unavailable.' } });
    }
    await ensureTable(table);
    const guests = [];
    try {
        for await (const entity of table.listEntities({
            queryOptions: { filter: `PartitionKey eq '${storage_1.GUEST_PARTITION_KEY}'` }
        })) {
            const rowKey = String(entity.rowKey);
            const e = entity;
            const explicitType = String(e.invitationType ?? '').trim();
            const legacyType = String(e.guestType ?? '').trim();
            const invitationType = explicitType || legacyType || 'single';
            guests.push({
                id: rowKey,
                title: String(e.title ?? ''),
                invitationType,
                guestType: invitationType,
                name: String(e.name ?? ''),
                searchKeywords: String(e.searchKeywords ?? ''),
                invitedCount: Number(e.invitedCount ?? 1),
                confirmed: String(e.confirmed ?? '0'),
                isComing: String(e.isComing ?? ''),
                finalCount: String(e.finalCount ?? '')
            });
        }
    }
    catch (e) {
        const statusCode = e?.statusCode;
        if (statusCode === 404) {
            return (0, cors_1.withCors)({ status: 200, jsonBody: { guests: [] } });
        }
        return (0, cors_1.withCors)({
            status: 500,
            jsonBody: { guests: [], error: 'Could not list guests.' }
        });
    }
    return (0, cors_1.withCors)({ status: 200, jsonBody: { guests } });
}
const ALLOWED_TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Rev. Fr.', 'Rev. Sr.'];
const ALLOWED_INVITATION_TYPES = ['single', 'couple', 'family'];
async function upsertGuest(request) {
    const cs = (0, storage_1.requireConnectionString)();
    if (!cs) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { ok: false, error: 'Storage is not configured.' } });
    }
    const table = (0, storage_1.getTableClient)();
    if (!table) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { ok: false, error: 'Table client unavailable.' } });
    }
    await ensureTable(table);
    let body;
    try {
        body = (await request.json());
    }
    catch {
        return (0, cors_1.withCors)({ status: 400, jsonBody: { ok: false, error: 'Invalid JSON body.' } });
    }
    const titleRaw = (body.title ?? '').trim();
    // Accept any title string but prefer the canonical capitalization when it
    // matches one of the well-known options. Legacy/free-form titles are passed
    // through unchanged rather than rejected.
    const canonicalTitle = ALLOWED_TITLES.find((t) => t.toLowerCase() === titleRaw.toLowerCase());
    const title = canonicalTitle ?? titleRaw;
    const invitationTypeRaw = (body.invitationType ?? body.guestType ?? '').trim().toLowerCase();
    const invitationType = ALLOWED_INVITATION_TYPES.includes(invitationTypeRaw)
        ? invitationTypeRaw
        : 'single';
    const name = (body.name ?? '').trim();
    const searchKeywords = (body.searchKeywords ?? '').trim();
    const invitedRaw = body.invitedCount;
    const invited = typeof invitedRaw === 'number' ? invitedRaw : Number(invitedRaw);
    if (!name) {
        return (0, cors_1.withCors)({ status: 400, jsonBody: { ok: false, error: 'name is required.' } });
    }
    if (!Number.isFinite(invited) || invited < 1) {
        return (0, cors_1.withCors)({
            status: 400,
            jsonBody: { ok: false, error: 'invitedCount must be a number >= 1.' }
        });
    }
    const rowKey = (body.id ?? '').trim() || (0, crypto_1.randomUUID)();
    const isUpdate = Boolean((body.id ?? '').trim());
    let confirmed = '0';
    let isComing = '';
    let finalCount = '';
    if (isUpdate) {
        try {
            const existing = await table.getEntity(storage_1.GUEST_PARTITION_KEY, rowKey);
            confirmed = String(existing.confirmed ?? '0');
            isComing = String(existing.isComing ?? '');
            finalCount = String(existing.finalCount ?? '');
        }
        catch {
            /* treat as new row if missing */
        }
    }
    const entity = {
        partitionKey: storage_1.GUEST_PARTITION_KEY,
        rowKey,
        title,
        invitationType,
        guestType: invitationType, // keep legacy column populated for older readers
        name,
        searchKeywords,
        invitedCount: String(Math.floor(invited)),
        confirmed,
        isComing,
        finalCount
    };
    try {
        await table.upsertEntity(entity, 'Replace');
    }
    catch {
        return (0, cors_1.withCors)({ status: 500, jsonBody: { ok: false, error: 'Could not save guest.' } });
    }
    return (0, cors_1.withCors)({ status: 200, jsonBody: { ok: true, id: rowKey } });
}
async function deleteGuest(request) {
    const cs = (0, storage_1.requireConnectionString)();
    if (!cs) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { ok: false, error: 'Storage is not configured.' } });
    }
    const table = (0, storage_1.getTableClient)();
    if (!table) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { ok: false, error: 'Table client unavailable.' } });
    }
    await ensureTable(table);
    // Accept the id from either the route parameter or a `?id=` query string.
    const id = (request.params?.id ?? request.query.get('id') ?? '').trim();
    if (!id) {
        return (0, cors_1.withCors)({ status: 400, jsonBody: { ok: false, error: 'id is required.' } });
    }
    try {
        await table.deleteEntity(storage_1.GUEST_PARTITION_KEY, id);
    }
    catch (e) {
        const statusCode = e?.statusCode;
        if (statusCode === 404) {
            return (0, cors_1.withCors)({ status: 404, jsonBody: { ok: false, error: 'Guest not found.' } });
        }
        return (0, cors_1.withCors)({ status: 500, jsonBody: { ok: false, error: 'Could not delete guest.' } });
    }
    return (0, cors_1.withCors)({ status: 200, jsonBody: { ok: true, id } });
}
async function adminGuestsHandler(request, _context) {
    if (request.method === 'OPTIONS') {
        return (0, cors_1.corsOptions)();
    }
    const denied = (0, adminAuth_1.requireAdmin)(request);
    if (denied) {
        return denied;
    }
    if (request.method === 'GET') {
        return listGuests();
    }
    if (request.method === 'PUT') {
        return upsertGuest(request);
    }
    if (request.method === 'DELETE') {
        return deleteGuest(request);
    }
    return (0, cors_1.withCors)({ status: 405, jsonBody: { error: 'Method not allowed.' } });
}
functions_1.app.http('adminGuests', {
    methods: ['GET', 'PUT', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'manage/guests',
    handler: adminGuestsHandler
});
functions_1.app.http('adminGuestById', {
    methods: ['DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'manage/guests/{id}',
    handler: adminGuestsHandler
});
