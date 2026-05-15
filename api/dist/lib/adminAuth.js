"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = requireAdmin;
const cors_1 = require("./cors");
function requireAdmin(request) {
    const expected = process.env.ADMIN_API_KEY?.trim();
    if (!expected) {
        return (0, cors_1.withCors)({ status: 503, jsonBody: { error: 'ADMIN_API_KEY is not configured.' } });
    }
    const key = request.headers.get('x-admin-key')?.trim();
    if (key !== expected) {
        return (0, cors_1.withCors)({ status: 401, jsonBody: { error: 'Unauthorized.' } });
    }
    return null;
}
