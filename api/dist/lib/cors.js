"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withCors = withCors;
exports.corsOptions = corsOptions;
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key'
};
function withCors(response) {
    return {
        ...response,
        headers: {
            ...corsHeaders,
            ...response.headers
        }
    };
}
function corsOptions() {
    return withCors({ status: 204 });
}
