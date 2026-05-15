import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withCors, corsOptions } from '../lib/cors';
import { GUEST_PARTITION_KEY, getTableClient, requireConnectionString } from '../lib/storage';

interface RsvpBody {
  guestId?: string;
  attendance?: string;
  attendingCount?: number;
}

export async function submitRsvpHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') {
    return corsOptions();
  }

  const cs = requireConnectionString();
  if (!cs) {
    return withCors({ status: 503, jsonBody: { ok: false, error: 'Storage is not configured.' } });
  }

  const table = getTableClient();
  if (!table) {
    return withCors({ status: 503, jsonBody: { ok: false, error: 'Table client unavailable.' } });
  }

  let body: RsvpBody;
  try {
    body = (await request.json()) as RsvpBody;
  } catch {
    return withCors({ status: 400, jsonBody: { ok: false, error: 'Invalid JSON body.' } });
  }

  const guestId = (body.guestId ?? '').trim();
  const attendance = (body.attendance ?? '').trim().toLowerCase();

  if (!guestId) {
    return withCors({ status: 400, jsonBody: { ok: false, error: 'guestId is required.' } });
  }
  if (attendance !== 'yes' && attendance !== 'no') {
    return withCors({
      status: 400,
      jsonBody: { ok: false, error: 'attendance must be "yes" or "no".' }
    });
  }

  let entity;
  try {
    entity = await table.getEntity<Record<string, string>>(GUEST_PARTITION_KEY, guestId);
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      return withCors({ status: 404, jsonBody: { ok: false, error: 'Guest not found.' } });
    }
    return withCors({ status: 500, jsonBody: { ok: false, error: 'Could not load guest.' } });
  }

  const invited = Number(entity.invitedCount ?? 1);
  const invitedCount = Number.isFinite(invited) && invited >= 1 ? invited : 1;

  let finalCount = 0;
  if (attendance === 'yes') {
    if (invitedCount > 1) {
      const raw = body.attendingCount;
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > invitedCount) {
        return withCors({
          status: 400,
          jsonBody: {
            ok: false,
            error: `attendingCount must be between 1 and ${invitedCount}.`
          }
        });
      }
      finalCount = Math.floor(n);
    } else {
      finalCount = 1;
    }
  }

  try {
    await table.updateEntity(
      {
        partitionKey: GUEST_PARTITION_KEY,
        rowKey: guestId,
        isComing: attendance,
        finalCount: String(finalCount),
        confirmed: '1'
      },
      'Merge'
    );
  } catch {
    return withCors({ status: 500, jsonBody: { ok: false, error: 'Could not save RSVP.' } });
  }

  return withCors({ status: 200, jsonBody: { ok: true } });
}

app.http('submitRsvp', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'rsvp',
  handler: submitRsvpHandler
});
