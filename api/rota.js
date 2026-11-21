import { api, response } from '../server/api.js';
import { withSecurityHeaders } from '../server/http.js';
import { authRoute, sessionFor } from '../server/vercel/auth.js';
import { createDatabase } from '../server/vercel/db.js';

let database;

function configuration(env) {
  const origin = new URL(env.ROTA_PUBLIC_ORIGIN);
  if (origin.protocol !== 'https:' || origin.href !== origin.origin + '/') throw new Error('Origem inválida.');
  if (!env.ROTA_GOOGLE_CLIENT_ID || !env.ROTA_GOOGLE_CLIENT_SECRET || !env.ROTA_OWNER_EMAIL ||
      Buffer.byteLength(env.ROTA_SESSION_SECRET || '') < 32 || !env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN ||
      !['libsql:', 'https:'].includes(new URL(env.TURSO_DATABASE_URL).protocol)) throw new Error('Ambiente incompleto.');
  return {
    origin: origin.origin,
    callback: origin.origin + '/api/auth/callback',
    googleId: env.ROTA_GOOGLE_CLIENT_ID,
    googleSecret: env.ROTA_GOOGLE_CLIENT_SECRET,
    secret: new TextEncoder().encode(env.ROTA_SESSION_SECRET),
    ownerEmail: env.ROTA_OWNER_EMAIL
  };
}

async function handle(request) {
  let config;
  try { config = configuration(process.env); }
  catch { return response({ error: 'A hospedagem ainda precisa ser configurada.' }, 503); }

  const url = new URL(request.url);
  const route = url.pathname === '/api/rota' ? url.searchParams.get('_route') : null;
  const path = route ? '/api/' + route : url.pathname;
  if (url.origin !== config.origin) {
    // Redirect safe navigations to the canonical domain. Never forward a write.
    if (request.method === 'GET' && path === '/api/auth/login') {
      return Response.redirect(config.origin + path);
    }
    return response({ error: 'Abra o endereço configurado para o Rota Leite.' }, 400);
  }
  if (path.startsWith('/api/auth/')) return authRoute(path, request, config);
  const session = await sessionFor(request, config);
  if (!session) return response({ error: 'Entre com a conta autorizada.' }, 401);

  const headers = new Headers(request.headers);
  headers.set('oai-authenticated-user-id', session.id);
  headers.set('oai-authenticated-user-email', session.email);
  const body = ['GET', 'HEAD'].includes(request.method) ? null : request.body;
  database ??= createDatabase({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  return api(new Request(config.origin + path, { method: request.method, headers, body, duplex: body ? 'half' : undefined }),
    database, { ownerEmail: config.ownerEmail });
}

export default { async fetch(request) { return withSecurityHeaders(await handle(request), true); } };
