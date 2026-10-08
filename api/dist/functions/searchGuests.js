"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchGuestsHandler = searchGuestsHandler;
const functions_1 = require("@azure/functions");
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
function entityToGuest(rowKey, e) {
    const rec = e;
    const invited = Number(rec.invitedCount ?? 1);
    const explicitType = String(rec.invitationType ?? '').trim();
    const legacyType = String(rec.guestType ?? '').trim();
    const invitationType = explicitType || legacyType || 'single';
    return {
        id: rowKey,
        title: String(rec.title ?? ''),
        invitationType,
        guestType: invitationType, // kept for backward compat with older clients
        name: String(rec.name ?? ''),
        searchKeywords: String(rec.searchKeywords ?? ''),
        invitedCount: Number.isFinite(invited) && invited >= 1 ? invited : 1
    };
}
async function searchGuestsHandler(request, _context) {
    if (request.method === 'OPTIONS') {
        return (0, cors_1.corsOptions)();
    }
    const cs = (0, storage_1.requireConnectionString)();
    if (!cs) {
        return (0, cors_1.withCors)({
            status: 503,
            jsonBody: { guests: [], error: 'Storage is not configured.' }
        });
    }
    const table = (0, storage_1.getTableClient)();
    if (!table) {
        return (0, cors_1.withCors)({
            status: 503,
            jsonBody: { guests: [], error: 'Table client unavailable.' }
        });
    }
    await ensureTable(table);
    const q = (request.query.get('q') ?? '').trim().toLowerCase();
    const limit = Math.min(50, Math.max(1, Number(request.query.get('limit')) || 25));
    // Split the query into individual words. A row is considered a match only when
    // every search term is found somewhere in its searchable fields (AND semantics).
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];
    const guests = [];
    try {
        for await (const entity of table.listEntities({
            queryOptions: { filter: `PartitionKey eq '${storage_1.GUEST_PARTITION_KEY}'` }
        })) {
            const rowKey = String(entity.rowKey);
            const g = entityToGuest(rowKey, entity);
            if (terms.length === 0) {
                guests.push(g);
            }
            else {
                const hay = `${g.name} ${g.title} ${g.invitationType} ${g.searchKeywords}`.toLowerCase();
                if (terms.every((t) => hay.includes(t))) {
                    guests.push(g);
                }
            }
            if (guests.length >= limit) {
                break;
            }
        }
    }
    catch (e) {
        const statusCode = e?.statusCode;
        if (statusCode === 404) {
            return (0, cors_1.withCors)({ status: 200, jsonBody: { guests: [] } });
        }
        return (0, cors_1.withCors)({
            status: 500,
            jsonBody: { guests: [], error: 'Could not search guests.' }
        });
    }
    return (0, cors_1.withCors)({ status: 200, jsonBody: { guests } });
}
functions_1.app.http('searchGuests', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'guests/search',
    handler: searchGuestsHandler
});
