import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { api } from '../server/api.js';
import { withSecurityHeaders } from '../server/http.js';

mkdirSync('.data', { recursive: true });
const sqlite = new DatabaseSync(process.env.ROTA_DB || '.data/rota-leite.sqlite');
for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
}
const db = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    const bind = (...values) => ({
      run: async () => statement.run(...values),
      batchResult: async () => statement.columns().length ? { results: statement.all(...values) } : statement.run(...values),
      first: async () => statement.get(...values),
      all: async () => ({ results: statement.all(...values) })
    });
    return { ...bind(), bind };
  },
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = await Promise.all(statements.map(statement => statement.batchResult()));
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
};

const types = { html: 'text/html', css: 'text/css', js: 'text/javascript', webmanifest: 'application/manifest+json', svg: 'image/svg+xml' };
const files = new Set(['index.html', 'app.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'logo.svg']);
const portArg = process.argv.indexOf('--port');
const hostArg = process.argv.indexOf('--host');
const port = Number((portArg >= 0 && process.argv[portArg + 1]) || process.env.PORT || 3000);
const host = (hostArg >= 0 && process.argv[hostArg + 1]) || '127.0.0.1';
createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, 'http://' + incoming.headers.host);
    let result;
    if (url.pathname.startsWith('/api/')) {
      const body = ['GET', 'HEAD'].includes(incoming.method) ? undefined : incoming;
      const headers = new Headers(incoming.headers);
      headers.set('oai-authenticated-user-id', process.env.ROTA_DEMO_USER_ID || 'local-manager');
      headers.set('oai-authenticated-user-email', process.env.ROTA_DEMO_EMAIL || 'gestor@example.test');
      result = await api(new Request(url, {
        method: incoming.method, headers, body, duplex: body ? 'half' : undefined
      }), db, { ownerEmail: process.env.ROTA_OWNER_EMAIL || 'gestor@example.test' });
    } else {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      result = files.has(file) ? new Response(readFileSync(file === 'app.js' ? '.generated/app.js' : 'public/' + file), {
        headers: { 'Content-Type': types[file.split('.').at(-1)] + '; charset=utf-8', 'Cache-Control': 'no-cache' }
      }) : new Response('Página não encontrada', { status: 404 });
    }
    result = withSecurityHeaders(result);
    outgoing.writeHead(result.status, Object.fromEntries(result.headers));
    outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500);
    outgoing.end('Erro interno.');
  }
}).listen(port, host, () => console.log('Rota Leite em http://localhost:' + port));
