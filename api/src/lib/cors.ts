import { HttpResponseInit } from '@azure/functions';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key'
};

export function withCors(response: HttpResponseInit): HttpResponseInit {
  return {
    ...response,
    headers: {
      ...corsHeaders,
      ...(response.headers as Record<string, string> | undefined)
    }
  };
}

export function corsOptions(): HttpResponseInit {
  return withCors({ status: 204 });
}
