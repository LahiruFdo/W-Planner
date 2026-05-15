import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { requireAdmin } from '../lib/adminAuth';
import { withCors, corsOptions } from '../lib/cors';
import {
  CONTENT_CONTAINER,
  STORY_BLOB_NAME,
  ensureContainersExist,
  getBlobServiceClient,
  requireConnectionString
} from '../lib/storage';

interface StorySlide {
  imageUrl: string;
  title: string;
  caption: string;
}

interface StoryPutBody {
  slides?: StorySlide[];
}

function validateSlides(slides: StorySlide[]): boolean {
  if (!Array.isArray(slides) || slides.length > 40) {
    return false;
  }
  for (const s of slides) {
    if (typeof s.imageUrl !== 'string' || typeof s.title !== 'string') {
      return false;
    }
    if (!s.imageUrl.trim() || !s.title.trim()) {
      return false;
    }
    if (s.caption !== undefined && typeof s.caption !== 'string') {
      return false;
    }
    if (s.imageUrl.length > 2000) {
      return false;
    }
  }
  return true;
}

export async function adminPutStoryConfigHandler(
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

  const cs = requireConnectionString();
  if (!cs) {
    return withCors({ status: 503, jsonBody: { ok: false, error: 'Storage is not configured.' } });
  }

  let body: StoryPutBody;
  try {
    body = (await request.json()) as StoryPutBody;
  } catch {
    return withCors({ status: 400, jsonBody: { ok: false, error: 'Invalid JSON body.' } });
  }

  const slides = body.slides ?? [];
  if (!validateSlides(slides)) {
    return withCors({
      status: 400,
      jsonBody: { ok: false, error: 'slides must be an array of { imageUrl, title, caption }.' }
    });
  }

  const blobClient = getBlobServiceClient();
  if (!blobClient) {
    return withCors({ status: 503, jsonBody: { ok: false, error: 'Blob client unavailable.' } });
  }

  await ensureContainersExist(blobClient);

  const blockBlob = blobClient.getContainerClient(CONTENT_CONTAINER).getBlockBlobClient(STORY_BLOB_NAME);
  const normalized = slides.map((s) => ({
    imageUrl: s.imageUrl.trim(),
    title: s.title.trim(),
    caption: typeof s.caption === 'string' ? s.caption.trim() : ''
  }));
  const payload = JSON.stringify({ slides: normalized });

  try {
    await blockBlob.uploadData(Buffer.from(payload, 'utf8'), {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });
  } catch {
    return withCors({ status: 500, jsonBody: { ok: false, error: 'Could not save story.' } });
  }

  return withCors({ status: 200, jsonBody: { ok: true } });
}

app.http('adminPutStoryConfig', {
  methods: ['PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'admin/story',
  handler: adminPutStoryConfigHandler
});
