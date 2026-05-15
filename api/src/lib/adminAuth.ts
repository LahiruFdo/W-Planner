import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { withCors } from './cors';

export function requireAdmin(request: HttpRequest): HttpResponseInit | null {
  const expected = process.env.ADMIN_API_KEY?.trim();
  if (!expected) {
    return withCors({ status: 503, jsonBody: { error: 'ADMIN_API_KEY is not configured.' } });
  }
  const key = request.headers.get('x-admin-key')?.trim();
  if (key !== expected) {
    return withCors({ status: 401, jsonBody: { error: 'Unauthorized.' } });
  }
  return null;
}
