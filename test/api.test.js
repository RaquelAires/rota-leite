import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { api } from '../server/api.js';

function session() {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bind = (...params) => ({
        run: () => statement.run(...params),
        batchResult: () => statement.columns().length ? { results: statement.all(...params) } : statement.run(...params),
        first: () => statement.get(...params),
        all: () => ({ results: statement.all(...params) })
      });
      return { ...bind(), bind };
    },
    batch: statements => statements.map(statement => statement.batchResult())
  };
  const send = (path, data, user = ['local-manager', 'gestor@example.test'], extraHeaders = {}) => {
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (user) {
      headers['oai-authenticated-user-id'] = user[0];
      headers['oai-authenticated-user-email'] = user[1];
    }
    return api(new Request('http://localhost' + path, { headers, ...(data === undefined ? {} : {
      method: 'POST', body: JSON.stringify(data)
    }) }), db, { ownerEmail: 'gestor@example.test' });
  };
  return { send, close: () => sqlite.close() };
}

test('carrega a base uma única vez e distingue o indicador municipal', async t => {
  const { send, close } = session();
  t.after(close);
  const initial = await (await send('/api/state')).json();
  assert.equal(initial.municipal.liters, 18456000);
  assert.ok(initial.producers.every(p => p.demo));
  assert.equal(initial.routes.length, 17);
  assert.equal(initial.events.length, 20);
  assert.ok(initial.routes.some(route => route.date === '2026-11-15' && route.closedAt && route.demo));
  assert.ok(initial.routes.some(route => route.date === '2026-11-30' && !route.closedAt && route.demo));
  assert.deepEqual(await (await send('/api/state')).json(), initial);
});

test('salva propriedade, rota e coleta com reenvio idempotente', async t => {
  const { send, close } = session();
  t.after(close);
  await send('/api/state');
  assert.equal((await send('/api/producers', {
    id: 'p', name: 'Propriedade de teste', locality: 'Vicinal', expected: 80
  })).status, 201);
  const route = await send('/api/routes', {
    id: 'r', name: 'Rota de teste', date: '2026-11-21', stops: [{ producerId: 'p', expected: 80 }]
  });
  assert.equal(route.status, 201);
  const entry = {
    id: 'c', routeId: 'r', stopId: 'p', at: new Date().toISOString(),
    status: 'collected', liters: 78.5
  };
  assert.equal((await send('/api/events', entry)).status, 201);
  const replay = await (await send('/api/events', { ...entry, liters: 99 })).json();
  assert.equal(replay.liters, 78.5);
  const state = await (await send('/api/state')).json();
  assert.equal(state.events.filter(event => event.id === 'c').length, 1);
  assert.equal(state.routes.find(item => item.id === 'r').demo, false);
});

test('rejeita litros inválidos, ocorrência sem motivo e paradas duplicadas', async t => {
  const { send, close } = session();
  t.after(close);
  await send('/api/state');
  const common = { id: 'c', routeId: 'rota-demo', stopId: 'parada-5', at: new Date().toISOString() };
  assert.equal((await send('/api/events', { ...common, status: 'collected', liters: 0 })).status, 400);
  assert.equal((await send('/api/events', { ...common, status: 'incident' })).status, 400);
  assert.equal((await send('/api/events', { ...common, status: 'incident', reason: 'Acesso bloqueado' })).status, 201);
  assert.equal((await send('/api/routes', {
    id: 'r', name: 'Rota de teste', date: '2026-11-21',
    stops: [{ producerId: 'prod-01', expected: 1 }, { producerId: 'prod-01', expected: 1 }]
  })).status, 400);
});

test('encerra uma rota com ocorrências e preserva o estado revisado', async t => {
  const { send, close } = session();
  t.after(close);
  const initial = await (await send('/api/state')).json();
  const routeId = 'rota-demo';
  const eventCount = initial.events.filter(event => event.routeId === routeId).length;
  const previous = { id: 'pending', routeId, stopId: 'parada-5', at: new Date().toISOString(),
    status: 'incident', reason: 'Porteira fechada' };
  assert.equal((await send('/api/events', previous)).status, 201);
  const stale = await send('/api/routes/close', { routeId, eventCount });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'route_changed');

  const result = await send('/api/routes/close', { routeId, eventCount: eventCount + 1 });
  assert.equal(result.status, 201);
  const done = await result.json();
  assert.ok(Number.isFinite(Date.parse(done.closedAt)));
  assert.equal((await (await send('/api/routes/close', { routeId, eventCount })).json()).closedAt, done.closedAt);

  const retry = await send('/api/events', previous);
  assert.equal(retry.status, 201);
  const late = await send('/api/events', { ...previous, id: 'late' });
  assert.equal(late.status, 409);
  assert.equal((await late.json()).code, 'route_closed');

  const state = await (await send('/api/state')).json();
  assert.equal(state.routes.find(route => route.id === routeId).closedAt, done.closedAt);
  assert.equal(state.events.filter(event => event.routeId === routeId).length, eventCount + 1);
  assert.equal((await send('/api/routes/close', { routeId: 'inexistente', eventCount: 0 })).status, 404);
});

test('uma coleta concorrente nunca entra depois do fechamento', async t => {
  const { send, close } = session();
  t.after(close);
  await send('/api/state');
  const [ended, recorded] = await Promise.all([
    send('/api/routes/close', { routeId: 'rota-demo-2', eventCount: 0 }),
    send('/api/events', { id: 'race', routeId: 'rota-demo-2', stopId: 'jatoba-1', at: new Date().toISOString(),
      status: 'collected', liters: 100 })
  ]);
  const outcomes = [ended.status, recorded.status];
  assert.ok(outcomes.includes(201) && outcomes.includes(409));
});

test('restringe operações e dados a motoristas cadastrados e rotas atribuídas', async t => {
  const { send, close } = session();
  t.after(close);
  const ana = ['ana-sites', 'ANA@example.test'];
  const other = ['other-sites', 'other@example.test'];
  assert.equal((await send('/api/state', undefined, null)).status, 401);
  assert.equal((await (await send('/api/session')).json()).role, 'manager');
  assert.equal((await send('/api/state', undefined, other)).status, 403);
  await send('/api/state');
  for (const [id, name, email] of [['ana', 'Ana', ana[1]], ['other', 'Outro', other[1]]]) {
    assert.equal((await send('/api/drivers', { id, name, email })).status, 201);
  }
  assert.equal((await send('/api/routes/assign', { routeId: 'rota-demo', driverId: 'ana' })).status, 201);
  const view = await (await send('/api/state', undefined, ana)).json();
  assert.deepEqual(view.routes.map(route => route.id), ['rota-demo']);
  assert.ok(view.events.every(event => event.routeId === 'rota-demo'));
  assert.ok(view.producers.every(producer => !Object.hasOwn(producer, 'contact')));
  assert.equal(view.drivers.length, 0);
  assert.equal((await send('/api/routes/close', { routeId: 'rota-demo', eventCount: 4 }, ana)).status, 403);
  assert.equal((await send('/api/routes', {}, ana)).status, 403);

  const event = { id: 'ana-one', routeId: 'rota-demo', stopId: 'parada-5', at: new Date().toISOString(),
    status: 'collected', liters: 80, author: 'identidade falsificada' };
  assert.equal((await send('/api/events', event, other)).status, 403);
  const saved = await send('/api/events', event, ana);
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).author, 'Ana');
  assert.equal((await send('/api/routes/assign', { routeId: 'rota-demo', driverId: 'other' })).status, 201);
  assert.equal((await send('/api/events', { ...event, id: 'ana-two' }, ana)).status, 403);
  assert.deepEqual((await (await send('/api/state', undefined, ana)).json()).routes, []);
});

test('guarda a autoria e o motivo da correção com vínculo ao registro anterior', async t => {
  const { send, close } = session();
  t.after(close);
  await send('/api/state');
  const event = { id: 'original', routeId: 'rota-demo', stopId: 'parada-5', at: new Date().toISOString(),
    status: 'collected', liters: 76 };
  assert.equal((await send('/api/events', event)).status, 201);
  const corrected = { ...event, id: 'corrected', liters: 67, priorEventId: 'original' };
  assert.equal((await send('/api/events', corrected)).status, 400);
  const result = await send('/api/events', { ...corrected, correctionReason: 'Conferência do volume' });
  assert.equal(result.status, 201);
  const entry = await result.json();
  assert.equal(entry.priorEventId, 'original');
  assert.equal(entry.correctionReason, 'Conferência do volume');
  assert.equal(entry.author, 'Gestor');
  assert.equal(entry.liters, 67);
  const stale = await send('/api/events', { ...corrected, id: 'duplicate', correctionReason: 'Outra correção' });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'stop_changed');
  const state = await (await send('/api/state')).json();
  assert.equal(state.events.find(item => item.id === 'original').liters, 76);
});

test('somente o e-mail autorizado inicializa o perfil gestor', async t => {
  const { send, close } = session();
  t.after(close);
  assert.equal((await send('/api/session', undefined, ['visitor', 'visitor@example.test'])).status, 403);
  assert.equal((await (await send('/api/session')).json()).role, 'manager');
});

test('valida a origem e impõe o limite de bytes mesmo sem Content-Length', async t => {
  const { send, close } = session();
  t.after(close);
  assert.equal((await send('/api/producers', {}, undefined, { Origin: 'https://example.test' })).status, 403);
  assert.equal((await send('/api/producers', { note: 'á'.repeat(13000) })).status, 413);
  assert.equal((await send('/api/producers', {}, undefined, { 'Content-Type': 'application/json-extra' })).status, 415);
  assert.equal((await send('/api/routes', { date: '2026-11-21', stops: [null] })).status, 400);
});

test('limita consultas repetidas e informa quando tentar novamente', async t => {
  const { send, close } = session();
  t.after(close);
  t.mock.method(Date, 'now', () => 1795300500000);
  for (let i = 0; i < 60; i++) assert.equal((await send('/api/state')).status, 200);
  const throttled = await send('/api/state');
  assert.equal(throttled.status, 429);
  assert.equal((await throttled.json()).code, 'rate_limited');
  assert.ok(Number(throttled.headers.get('Retry-After')) > 0);
  assert.equal((await send('/api/session')).status, 200);
});
