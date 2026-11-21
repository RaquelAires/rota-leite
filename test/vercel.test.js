import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { api } from '../server/api.js';
import { authRoute, googleIdentity, sessionFor } from '../server/vercel/auth.js';
import { createDatabase } from '../server/vercel/db.js';
import handler from '../api/rota.js';

test('adapta as migrações, o banco e os perfis da API ao libSQL', async t => {
  const db = createDatabase({ url: 'file::memory:' });
  t.after(() => db.close());
  const migrations = new URL('../drizzle/', import.meta.url);
  const files = (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) await db.migrate(await readFile(new URL(file, migrations), 'utf8'));
  const request = new Request('https://example.test/api/state', { headers: {
    'oai-authenticated-user-id': 'google:owner', 'oai-authenticated-user-email': 'owner@gmail.com'
  } });
  const result = await api(request, db, { ownerEmail: 'owner@gmail.com' });
  assert.equal(result.status, 200);
  const state = await result.json();
  assert.ok(state.routes.length);
  const anonymous = await api(new Request(request.url), db, { ownerEmail: 'owner@gmail.com' });
  assert.equal(anonymous.status, 401);
});

test('o login usa PKCE, nonce, cookie seguro e rejeita callback sem estado', async () => {
  const origin = 'https://example.test';
  const config = { origin, googleId: 'test-client', callback: origin + '/api/auth/callback', secret: new Uint8Array(32) };
  const at = path => new Request(origin + path);
  const start = await authRoute('/api/auth/login', at('/api/auth/login'), config);
  assert.equal(start.status, 303);
  assert.match(start.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Lax/);
  const location = new URL(start.headers.get('location'));
  for (const key of ['state', 'nonce', 'code_challenge']) assert.ok(location.searchParams.get(key));
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const callback = await authRoute('/api/auth/callback', at('/api/auth/callback?code=fake&state=fake'), config);
  assert.equal(callback.headers.get('location'), '/?login=failed');
  assert.equal(await sessionFor(at('/api/state'), config), null);
  assert.equal(googleIdentity({ sub: 'id', email: 'me@custom.test', email_verified: true }), null);
  assert.deepEqual(googleIdentity({ sub: 'id', email: 'ME@gmail.com', email_verified: true }),
    { id: 'google:id', email: 'me@gmail.com' });
});

test('na hospedagem, cabeçalhos enviados pelo cliente não viram uma sessão', async t => {
  const env = {
    ROTA_PUBLIC_ORIGIN: 'https://example.test', ROTA_GOOGLE_CLIENT_ID: 'dummy',
    ROTA_GOOGLE_CLIENT_SECRET: 'dummy', ROTA_OWNER_EMAIL: 'owner@gmail.com', ROTA_SESSION_SECRET: 'a'.repeat(32),
    TURSO_DATABASE_URL: 'libsql://example.test', TURSO_AUTH_TOKEN: 'dummy'
  };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const result = await handler.fetch(new Request('https://example.test/api/state', { headers: {
    'oai-authenticated-user-id': 'google:owner', 'oai-authenticated-user-email': 'owner@gmail.com'
  } }));
  assert.equal(result.status, 401);
  assert.match(result.headers.get('cache-control'), /no-store/);
});
