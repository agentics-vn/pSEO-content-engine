/** Browser CORS for edge functions called from the Admin UI (Fly / localhost). */

const ALLOW_HEADERS =
  'authorization, content-type, x-site-slug, apikey, x-client-info';

export function corsHeaders(req?: Request): HeadersInit {
  const origin = req?.headers.get('origin') ?? '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': ALLOW_HEADERS,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

export function corsPreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
