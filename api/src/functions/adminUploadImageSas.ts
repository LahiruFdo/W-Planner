import { randomUUID } from 'crypto';
import { extname } from 'path';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { requireAdmin } from '../lib/adminAuth';
import { withCors, corsOptions } from '../lib/cors';
import {
  ensureContainersExist,
  generateUploadSasUrl,
  getBlobServiceClient,
  requireConnectionString
} from '../lib/storage';

interface SasBody {
  fileName?: string;
  contentType?: string;
}

export async function adminUploadImageSasHandler(
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
    return withCors({ status: 503, jsonBody: { error: 'Storage is not configured.' } });
  }

  let body: SasBody;
  try {
    body = (await request.json()) as SasBody;
  } catch {
    return withCors({ status: 400, jsonBody: { error: 'Invalid JSON body.' } });
  }

  const fileName = (body.fileName ?? 'image.jpg').trim() || 'image.jpg';
  const contentType = (body.contentType ?? 'image/jpeg').trim() || 'image/jpeg';
  const ext = extname(fileName) || '.jpg';
  const blobName = `${randomUUID()}${ext}`;

  const blobClient = getBlobServiceClient();
  if (!blobClient) {
    return withCors({ status: 503, jsonBody: { error: 'Blob client unavailable.' } });
  }

  await ensureContainersExist(blobClient);

  const sas = generateUploadSasUrl(cs, blobName, contentType);
  if (!sas) {
    return withCors({ status: 500, jsonBody: { error: 'Could not generate SAS.' } });
  }

  return withCors({
    status: 200,
    jsonBody: {
      uploadUrl: sas.uploadUrl,
      publicUrl: sas.publicUrl,
      blobName
    }
  });
}

app.http('adminUploadImageSas', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'admin/images/sas',
  handler: adminUploadImageSasHandler
});
