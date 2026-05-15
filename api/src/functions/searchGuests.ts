import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { TableEntity } from '@azure/data-tables';
import { withCors, corsOptions } from '../lib/cors';
import { GUEST_PARTITION_KEY, getTableClient, requireConnectionString } from '../lib/storage';

export interface GuestSearchResult {
  id: string;
  title: string;
  guestType: string;
  name: string;
  invitedCount: number;
}

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

function entityToGuest(rowKey: string, e: TableEntity): GuestSearchResult {
  const invited = Number((e as Record<string, unknown>).invitedCount ?? 1);
  return {
    id: rowKey,
    title: String((e as Record<string, unknown>).title ?? ''),
    guestType: String((e as Record<string, unknown>).guestType ?? ''),
    name: String((e as Record<string, unknown>).name ?? ''),
    invitedCount: Number.isFinite(invited) && invited >= 1 ? invited : 1
  };
}

export async function searchGuestsHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') {
    return corsOptions();
  }

  const cs = requireConnectionString();
  if (!cs) {
    return withCors({
      status: 503,
      jsonBody: { guests: [], error: 'Storage is not configured.' }
    });
  }

  const table = getTableClient();
  if (!table) {
    return withCors({
      status: 503,
      jsonBody: { guests: [], error: 'Table client unavailable.' }
    });
  }

  await ensureTable(table);

  const q = (request.query.get('q') ?? '').trim().toLowerCase();
  const limit = Math.min(50, Math.max(1, Number(request.query.get('limit')) || 25));

  const guests: GuestSearchResult[] = [];

  try {
    for await (const entity of table.listEntities<TableEntity>({
      queryOptions: { filter: `PartitionKey eq '${GUEST_PARTITION_KEY}'` }
    })) {
      const rowKey = String(entity.rowKey);
      const g = entityToGuest(rowKey, entity);
      if (!q) {
        guests.push(g);
      } else {
        const hay = `${g.name} ${g.title} ${g.guestType}`.toLowerCase();
        if (hay.includes(q)) {
          guests.push(g);
        }
      }
      if (guests.length >= limit) {
        break;
      }
    }
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      return withCors({ status: 200, jsonBody: { guests: [] } });
    }
    return withCors({
      status: 500,
      jsonBody: { guests: [], error: 'Could not search guests.' }
    });
  }

  return withCors({ status: 200, jsonBody: { guests } });
}

app.http('searchGuests', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'guests/search',
  handler: searchGuestsHandler
});
