import { randomUUID } from 'crypto';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { TableEntity } from '@azure/data-tables';
import { requireAdmin } from '../lib/adminAuth';
import { withCors, corsOptions } from '../lib/cors';
import { GUEST_PARTITION_KEY, getTableClient, requireConnectionString } from '../lib/storage';

async function ensureTable(client: NonNullable<ReturnType<typeof getTableClient>>): Promise<void> {
  try {
    await client.createTable();
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode;
    if (statusCode !== 409) {
      throw e;
    }
  }
}

async function listGuests(): Promise<HttpResponseInit> {
  const cs = requireConnectionString();
  if (!cs) {
    return withCors({ status: 503, jsonBody: { guests: [], error: 'Storage is not configured.' } });
  }

  const table = getTableClient();
  if (!table) {
    return withCors({ status: 503, jsonBody: { guests: [], error: 'Table client unavailable.' } });
  }

  await ensureTable(table);

  const guests: Record<string, unknown>[] = [];
  try {
    for await (const entity of table.listEntities<TableEntity>({
      queryOptions: { filter: `PartitionKey eq '${GUEST_PARTITION_KEY}'` }
    })) {
      const rowKey = String(entity.rowKey);
      const e = entity as Record<string, unknown>;
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
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      return withCors({ status: 200, jsonBody: { guests: [] } });
    }
    return withCors({
      status: 500,
      jsonBody: { guests: [], error: 'Could not list guests.' }
    });
  }

  return withCors({ status: 200, jsonBody: { guests } });
}

interface UpsertBody {
  id?: string;
  title?: string;
  invitationType?: string;
  guestType?: string;
  name?: string;
  searchKeywords?: string;
  invitedCount?: number;
}

const ALLOWED_TITLES = ['Mr.', 'Mrs.', 'Ms.', 'Rev. Fr.', 'Rev. Sr.'];
const ALLOWED_INVITATION_TYPES = ['single', 'couple', 'family'];

async function upsertGuest(request: HttpRequest): Promise<HttpResponseInit> {
  const cs = requireConnectionString();
  if (!cs) {
    return withCors({ status: 503, jsonBody: { ok: false, error: 'Storage is not configured.' } });
  }

  const table = getTableClient();
  if (!table) {
    return withCors({ status: 503, jsonBody: { ok: false, error: 'Table client unavailable.' } });
  }

  await ensureTable(table);

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return withCors({ status: 400, jsonBody: { ok: false, error: 'Invalid JSON body.' } });
  }

  const title = (body.title ?? '').trim();
  const invitationTypeRaw = (body.invitationType ?? body.guestType ?? '').trim().toLowerCase();
  const invitationType = ALLOWED_INVITATION_TYPES.includes(invitationTypeRaw)
    ? invitationTypeRaw
    : 'single';
  const name = (body.name ?? '').trim();
  const searchKeywords = (body.searchKeywords ?? '').trim();
  const invitedRaw = body.invitedCount;
  const invited = typeof invitedRaw === 'number' ? invitedRaw : Number(invitedRaw);

  if (title && !ALLOWED_TITLES.includes(title)) {
    return withCors({
      status: 400,
      jsonBody: {
        ok: false,
        error: `title must be one of: ${ALLOWED_TITLES.join(', ')}`
      }
    });
  }
  if (!name) {
    return withCors({ status: 400, jsonBody: { ok: false, error: 'name is required.' } });
  }
  if (!Number.isFinite(invited) || invited < 1) {
    return withCors({
      status: 400,
      jsonBody: { ok: false, error: 'invitedCount must be a number >= 1.' }
    });
  }

  const rowKey = (body.id ?? '').trim() || randomUUID();
  const isUpdate = Boolean((body.id ?? '').trim());

  let confirmed = '0';
  let isComing = '';
  let finalCount = '';
  if (isUpdate) {
    try {
      const existing = await table.getEntity<Record<string, string>>(GUEST_PARTITION_KEY, rowKey);
      confirmed = String(existing.confirmed ?? '0');
      isComing = String(existing.isComing ?? '');
      finalCount = String(existing.finalCount ?? '');
    } catch {
      /* treat as new row if missing */
    }
  }

  const entity = {
    partitionKey: GUEST_PARTITION_KEY,
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
  } catch {
    return withCors({ status: 500, jsonBody: { ok: false, error: 'Could not save guest.' } });
  }

  return withCors({ status: 200, jsonBody: { ok: true, id: rowKey } });
}

export async function adminGuestsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') {
    return corsOptions();
  }

  const denied = requireAdmin(request);
  if (denied) {
    return denied;
  }

  if (request.method === 'GET') {
    return listGuests();
  }
  if (request.method === 'PUT') {
    return upsertGuest(request);
  }

  return withCors({ status: 405, jsonBody: { error: 'Method not allowed.' } });
}

app.http('adminGuests', {
  methods: ['GET', 'PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'manage/guests',
  handler: adminGuestsHandler
});
