"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitRsvpHandler = submitRsvpHandler;
const functions_1 = require("@azure/functions");
const cors_1 = require("../lib/cors");
const storage_1 = require("../lib/storage");
async function submitRsvpHandler(request, _context) {
    if (request.method === 'OPTIONS') {
        return (0, cors_1.corsOptions)();
    }
    const cs = (0, storage_1.requireConnectionString)();
    if (!cs) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { ok: false, error: 'Storage is not configured.' } });
    }
    const table = (0, storage_1.getTableClient)();
    if (!table) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { ok: false, error: 'Table client unavailable.' } });
    }
    let body;
    try {
        body = (await request.json());
    }
    catch {
        return (0, cors_1.withCors)({ status: 400, jsonBody: { ok: false, error: 'Invalid JSON body.' } });
    }
    const guestId = (body.guestId ?? '').trim();
    const attendance = (body.attendance ?? '').trim().toLowerCase();
    if (!guestId) {
        return (0, cors_1.withCors)({ status: 400, jsonBody: { ok: false, error: 'guestId is required.' } });
    }
    if (attendance !== 'yes' && attendance !== 'no') {
        return (0, cors_1.withCors)({
            status: 400,
            jsonBody: { ok: false, error: 'attendance must be "yes" or "no".' }
        });
    }
    let entity;
    try {
        entity = await table.getEntity(storage_1.GUEST_PARTITION_KEY, guestId);
    }
    catch (e) {
        const statusCode = e?.statusCode;
        if (statusCode === 404) {
            return (0, cors_1.withCors)({ status: 404, jsonBody: { ok: false, error: 'Guest not found.' } });
        }
        return (0, cors_1.withCors)({ status: 500, jsonBody: { ok: false, error: 'Could not load guest.' } });
    }
    const invited = Number(entity.invitedCount ?? 1);
    const invitedCount = Number.isFinite(invited) && invited >= 1 ? invited : 1;
    let finalCount = 0;
    if (attendance === 'yes') {
        if (invitedCount > 1) {
            const raw = body.attendingCount;
            const n = typeof raw === 'number' ? raw : Number(raw);
            if (!Number.isFinite(n) || n < 1 || n > invitedCount) {
                return (0, cors_1.withCors)({
                    status: 400,
                    jsonBody: {
                        ok: false,
                        error: `attendingCount must be between 1 and ${invitedCount}.`
                    }
                });
            }
            finalCount = Math.floor(n);
        }
        else {
            finalCount = 1;
        }
    }
    try {
        await table.updateEntity({
            partitionKey: storage_1.GUEST_PARTITION_KEY,
            rowKey: guestId,
            isComing: attendance,
            finalCount: String(finalCount),
            confirmed: '1'
        }, 'Merge');
    }
    catch {
        return (0, cors_1.withCors)({ status: 500, jsonBody: { ok: false, error: 'Could not save RSVP.' } });
    }
    return (0, cors_1.withCors)({ status: 200, jsonBody: { ok: true } });
}
functions_1.app.http('submitRsvp', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'rsvp',
    handler: submitRsvpHandler
});
