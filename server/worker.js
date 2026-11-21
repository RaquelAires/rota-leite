import { api } from './api.js';
import { withSecurityHeaders } from './http.js';
import { assets } from './assets.js';

const types = { html: 'text/html', css: 'text/css', js: 'text/javascript', webmanifest: 'application/manifest+json', svg: 'image/svg+xml' };

async function handle(request, env) {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/')) return api(request, env.DB, { ownerEmail: env.ROTA_OWNER_EMAIL });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Método inválido', { status: 405 });
  const filename = path === '/' ? 'index.html' : path.slice(1);
  if (!Object.hasOwn(assets, filename)) return new Response('Página não encontrada', { status: 404 });
  const extension = filename.split('.').at(-1);
  return new Response(request.method === 'HEAD' ? null : assets[filename], {
    headers: { 'Content-Type': types[extension] + '; charset=utf-8', 'Cache-Control': 'no-cache' }
  });
}

export default {
  async fetch(request, env) {
    return withSecurityHeaders(await handle(request, env), new URL(request.url).protocol === 'https:');
  }
};
