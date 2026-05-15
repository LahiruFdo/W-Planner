import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withCors, corsOptions } from '../lib/cors';
import {
  CONTENT_CONTAINER,
  STORY_BLOB_NAME,
  ensureContainersExist,
  getBlobServiceClient,
  requireConnectionString
} from '../lib/storage';

interface StoryFileShape {
  slides: { imageUrl: string; title: string; caption: string }[];
}

async function readStoryBody(): Promise<{ status: number; body: string }> {
  const cs = requireConnectionString();
  if (!cs) {
    return {
      status: 503,
      body: JSON.stringify({ slides: [], error: 'Storage is not configured.' })
    };
  }

  const blobClient = getBlobServiceClient();
  if (!blobClient) {
    return {
      status: 503,
      body: JSON.stringify({ slides: [], error: 'Storage client unavailable.' })
    };
  }

  await ensureContainersExist(blobClient);

  const blockBlob = blobClient.getContainerClient(CONTENT_CONTAINER).getBlockBlobClient(STORY_BLOB_NAME);
  try {
    const download = await blockBlob.downloadToBuffer();
    const parsed = JSON.parse(download.toString()) as StoryFileShape;
    const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
    return { status: 200, body: JSON.stringify({ slides }) };
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      return { status: 200, body: JSON.stringify({ slides: [] }) };
    }
    return {
      status: 500,
      body: JSON.stringify({ slides: [], error: 'Could not read story configuration.' })
    };
  }
}

export async function getStoryHandler(
  request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  if (request.method === 'OPTIONS') {
    return corsOptions();
  }

  const { status, body } = await readStoryBody();
  return withCors({
    status,
    body,
    headers: { 'Content-Type': 'application/json' }
  });
}

app.http('getStory', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'story',
  handler: getStoryHandler
});
