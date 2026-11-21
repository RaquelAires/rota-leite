import { demoRecords } from './seed.js';

class InputError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const insertSql = 'INSERT OR IGNORE INTO records (kind, id, payload) VALUES (?, ?, ?)';
const selectSql = 'SELECT kind, id, payload FROM records ORDER BY seq';

function insert(db, kind, item) {
  return db.prepare(insertSql).bind(kind, item.id, JSON.stringify(item));
}

export function response(data, status = 200, headers) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

async function load(db) {
  const { results } = await db.prepare(selectSql).all();
  const data = { producers: [], routes: [], events: [], municipal: null };
  const collections = { producer: 'producers', route: 'routes', event: 'events' };
  for (const row of results) {
    const item = JSON.parse(row.payload);
    if (row.kind === 'municipal') data.municipal = item;
    else data[collections[row.kind]].push(item);
  }
  return data;
}

async function existing(db, kind, id) {
  const row = await db.prepare('SELECT payload FROM records WHERE kind = ? AND id = ?').bind(kind, id).first();
  return row ? JSON.parse(row.payload) : null;
}

function field(value, max, label, required = false) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (required && !clean) throw new InputError('Informe ' + label + '.');
  if (clean.length > max) throw new InputError('O campo ' + label + ' é muito longo.');
  return clean;
}

function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,60}$/.test(value)) {
    throw new InputError('Identificador inválido.');
  }
  return value;
}

function publicProfile({ id, email, name, role }) {
  return { id, email, name, role };
}

async function actorFor(request, db, ownerEmail) {
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!userId || !email) throw new InputError('Entre com a conta autorizada.', 401);
  const find = () => db.prepare('SELECT * FROM team WHERE user_id = ?').bind(userId).first();
  const known = await find();
  if (known) return publicProfile(known);

  // Bind the first manager only to the configured owner's verified email.
  if (email === ownerEmail?.trim().toLowerCase()) {
    await db.prepare(`
      INSERT OR IGNORE INTO team (id, user_id, email, name, role)
      SELECT 'manager', ?, ?, 'Gestor', 'manager' WHERE NOT EXISTS (SELECT 1 FROM team WHERE role = 'manager')
    `).bind(userId, email).run();
  }
  await db.prepare("UPDATE team SET user_id = ? WHERE email = ? AND role = 'driver' AND user_id IS NULL")
    .bind(userId, email).run();
  const member = await find();
  if (!member) throw new InputError('Esta conta ainda não tem um perfil no Rota Leite.', 403, 'no_profile');
  return publicProfile(member);
}

async function drivers(db) {
  const { results } = await db.prepare("SELECT id, email, name FROM team WHERE role = 'driver' ORDER BY name, id").all();
  return results;
}

async function createDriver(db, data) {
  const email = field(data.email, 254, 'o e-mail', true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Informe um e-mail válido.');
  const id = identifier(data.id);
  const name = field(data.name, 80, 'o nome do motorista', true);
  await db.prepare("INSERT OR IGNORE INTO team (id, email, name, role) VALUES (?, ?, ?, 'driver')")
    .bind(id, email, name).run();
  const member = await db.prepare("SELECT id, email, name FROM team WHERE id = ? AND role = 'driver'").bind(id).first();
  if (!member || member.email !== email) throw new InputError('Este e-mail já está cadastrado.', 409);
  return member;
}

async function driverFor(db, driverId) {
  if (!driverId) return null;
  const driver = await db.prepare("SELECT id, name FROM team WHERE id = ? AND role = 'driver'")
    .bind(identifier(driverId)).first();
  if (!driver) throw new InputError('Selecione um motorista cadastrado.');
  return driver;
}

async function assignDriver(db, data) {
  const id = identifier(data.routeId);
  const route = await existing(db, 'route', id);
  if (!route) throw new InputError('Rota não encontrada.', 404);
  const driver = await driverFor(db, data.driverId);
  const unassignedLabel = route.driverId ? '' : (route.driver || '');
  await db.prepare(`
    UPDATE records SET payload = json_set(payload, '$.driverId', ?, '$.driver', ?)
    WHERE kind = 'route' AND id = ? AND json_extract(payload, '$.closedAt') IS NULL
  `).bind(driver?.id ?? null, driver?.name ?? unassignedLabel, id).run();
  const saved = await existing(db, 'route', id);
  if (saved.closedAt) throw new InputError('Esta rota já foi encerrada.', 409, 'route_closed');
  return saved;
}

async function stateFor(db, actor) {
  if (actor.role === 'manager') return { ...await load(db), drivers: await drivers(db) };
  const routeScope = "SELECT id FROM records WHERE kind = 'route' AND json_extract(payload, '$.driverId') = ?";
  const queries = [
    db.prepare("SELECT payload FROM records WHERE id IN (" + routeScope + ") AND kind = 'route' ORDER BY seq").bind(actor.id),
    db.prepare("SELECT payload FROM records WHERE kind = 'event' AND json_extract(payload, '$.routeId') IN (" + routeScope + ") ORDER BY seq").bind(actor.id),
    db.prepare(`SELECT payload FROM records WHERE kind = 'producer' AND id IN (
      SELECT json_extract(stop.value, '$.producerId')
      FROM records AS route, json_each(route.payload, '$.stops') AS stop
      WHERE route.kind = 'route' AND json_extract(route.payload, '$.driverId') = ?
    ) ORDER BY seq`).bind(actor.id),
    db.prepare("SELECT payload FROM records WHERE kind = 'municipal' AND id = 'colmeia-leite-2025'")
  ];
  const [routes, events, producers, municipal] = (await db.batch(queries)).map(
    ({ results }) => results.map(({ payload }) => JSON.parse(payload))
  );
  return { routes, events, producers: producers.map(({ id, name, locality, expected, demo }) =>
    ({ id, name, locality, expected, demo })), municipal: municipal[0] ?? null, drivers: [] };
}

function volume(value, required = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
      value > 100000 || (required && value === 0)) {
    throw new InputError('Informe um volume de leite válido.');
  }
  return Math.round(value * 100) / 100;
}

async function createProducer(db, data) {
  const item = {
    id: identifier(data.id), name: field(data.name, 80, 'o nome da propriedade', true),
    locality: field(data.locality, 100, 'a localidade', true),
    contact: field(data.contact, 80, 'contato'),
    expected: volume(data.expected), demo: false
  };
  await insert(db, 'producer', item).run();
  return existing(db, 'producer', item.id);
}

async function createRoute(db, data) {
  const date = field(data.date, 10, 'a data', true);
  const parsed = new Date(date + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+parsed) ||
      parsed.toISOString().slice(0, 10) !== date) throw new InputError('Informe uma data válida.');
  if (!Array.isArray(data.stops) || !data.stops.length || data.stops.length > 50) {
    throw new InputError('Escolha de 1 a 50 propriedades para a rota.');
  }
  const ids = data.stops.map(stop => identifier(stop?.producerId));
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.prepare("SELECT payload FROM records WHERE kind = 'producer' AND id IN (" + placeholders + ")")
    .bind(...ids).all();
  const producers = new Map(rows.results.map(row => {
    const producer = JSON.parse(row.payload);
    return [producer.id, producer];
  }));
  const seen = new Set();
  const stops = data.stops.map(stop => {
    const producer = producers.get(stop.producerId);
    if (!producer || seen.has(producer.id)) throw new InputError('Selecione propriedades válidas e sem repetição.');
    seen.add(producer.id);
    return { id: producer.id, producerId: producer.id, expected: volume(stop.expected) };
  });
  const driver = await driverFor(db, data.driverId);
  const item = {
    id: identifier(data.id), name: field(data.name, 80, 'o nome da rota', true),
    driver: driver?.name ?? field(data.driver, 80, 'o responsável'), driverId: driver?.id ?? null, date, stops,
    demo: stops.some(stop => producers.get(stop.producerId).demo)
  };
  await insert(db, 'route', item).run();
  return existing(db, 'route', item.id);
}

const latestEventSql = `
  SELECT id FROM records WHERE kind = 'event'
    AND json_extract(payload, '$.routeId') = ? AND json_extract(payload, '$.stopId') = ?
  ORDER BY (json_type(payload, '$.savedAt') IS NOT NULL) DESC,
    CASE WHEN json_type(payload, '$.savedAt') IS NULL AND id NOT LIKE 'registro-demo-%' THEN 1 ELSE 0 END DESC,
    CASE WHEN json_type(payload, '$.savedAt') IS NULL THEN julianday(json_extract(payload, '$.at')) END DESC, seq DESC LIMIT 1
`;

async function createEvent(db, data, actor) {
  const id = identifier(data.id);
  const routeId = identifier(data.routeId);
  const stopId = identifier(data.stopId);
  const route = await existing(db, 'route', routeId);
  const unavailable = () => new InputError('Esta rota não está atribuída à sua conta.', 403, 'route_unassigned');
  const closed = () => new InputError('Esta rota já foi encerrada.', 409, 'route_closed');
  const changed = () => new InputError('A parada já tem outro registro. Confira o histórico e refaça a correção.', 409, 'stop_changed');
  if (actor.role !== 'manager' && route?.driverId !== actor.id) throw unavailable();
  if (!route || !route.stops.some(stop => stop.id === stopId)) {
    throw new InputError('A parada não pertence a esta rota.', 404);
  }
  const saved = await existing(db, 'event', id);
  if (saved?.routeId === routeId && saved.stopId === stopId) return saved;
  if (saved) throw changed();
  if (route.closedAt) throw closed();
  const priorId = data.priorEventId == null ? null : identifier(data.priorEventId);
  const previous = (await db.prepare(latestEventSql).bind(routeId, stopId).first())?.id ?? null;
  const prior = priorId ? await existing(db, 'event', priorId) : null;
  if (previous !== priorId) throw changed();
  if (!['collected', 'incident'].includes(data.status)) throw new InputError('Escolha um resultado.');
  const at = typeof data.at === 'string' ? new Date(data.at) : new Date(NaN);
  if (!Number.isFinite(+at) || +at > Date.now() + 600000) throw new InputError('Confira a data e a hora do registro.');
  const item = {
    id, routeId, stopId, at: at.toISOString(), status: data.status,
    liters: data.status === 'collected' ? volume(data.liters, true) : null,
    reason: data.status === 'incident' ? field(data.reason, 100, 'o motivo da pendência', true) : '',
    notes: field(data.notes, 300, 'observações'), demo: route.demo,
    author: actor.name, authorId: actor.id, priorEventId: priorId,
    correctionReason: prior ? field(data.correctionReason, 250, 'o motivo da correção', true) : '',
    savedAt: new Date().toISOString()
  };
  const manager = actor.role === 'manager' ? 1 : 0;
  await db.prepare(`
    INSERT OR IGNORE INTO records (kind, id, payload)
    SELECT 'event', ?, ? FROM records
    WHERE kind = 'route' AND id = ? AND json_extract(payload, '$.closedAt') IS NULL
      AND (? = 1 OR json_extract(payload, '$.driverId') = ?)
      AND (${latestEventSql}) IS ?
  `).bind(id, JSON.stringify(item), routeId, manager, actor.id, routeId, stopId, priorId).run();
  const recorded = await existing(db, 'event', id);
  if (recorded?.routeId === routeId && recorded.stopId === stopId) return recorded;
  const fresh = await existing(db, 'route', routeId);
  if (!manager && fresh?.driverId !== actor.id) throw unavailable();
  if (fresh?.closedAt) throw closed();
  throw changed();
}

async function closeRoute(db, data) {
  const id = identifier(data.routeId);
  if (!Number.isSafeInteger(data.eventCount) || data.eventCount < 0) {
    throw new InputError('Confira os registros da rota antes de encerrá-la.');
  }
  const route = await existing(db, 'route', id);
  if (!route) throw new InputError('Rota não encontrada.', 404);
  if (route.closedAt) return route;

  // The count is a revision because collection events are append-only.
  await db.prepare(`
    UPDATE records
    SET payload = json_set(payload, '$.closedAt', ?)
    WHERE kind = 'route' AND id = ? AND json_extract(payload, '$.closedAt') IS NULL
      AND ? = (SELECT COUNT(*) FROM records AS events
        WHERE events.kind = 'event' AND json_extract(events.payload, '$.routeId') = ?)
  `).bind(new Date().toISOString(), id, data.eventCount, id).run();
  const saved = await existing(db, 'route', id);
  if (!saved.closedAt) {
    throw new InputError('A rota recebeu novos registros. Confira o resumo e tente novamente.', 409, 'route_changed');
  }
  return saved;
}

const writers = {
  '/api/producers': createProducer, '/api/routes': createRoute,
  '/api/events': createEvent, '/api/routes/close': closeRoute,
  '/api/drivers': createDriver, '/api/routes/assign': assignDriver
};

const maxBodyBytes = 24000;
const perMinute = { state: 60, write: 180 };

async function readJson(request) {
  if (Number(request.headers.get('Content-Length')) > maxBodyBytes) {
    throw new InputError('O registro é muito grande.', 413);
  }
  if (!request.body) throw new InputError('Dados inválidos.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        void reader.cancel().catch(() => {});
        throw new InputError('O registro é muito grande.', 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError('Dados inválidos.');
  } finally {
    reader.releaseLock();
  }
}

async function rateLimit(db, actor, bucket) {
  const seconds = Math.floor(Date.now() / 1000);
  const minute = Math.floor(seconds / 60);
  const result = await db.prepare(`
    INSERT INTO api_limits (profile_id, bucket, minute, hits) VALUES (?, ?, ?, 1)
    ON CONFLICT (profile_id, bucket) DO UPDATE SET
      hits = CASE WHEN api_limits.minute = excluded.minute THEN api_limits.hits + 1 ELSE 1 END,
      minute = excluded.minute
    WHERE api_limits.minute < excluded.minute OR
      (api_limits.minute = excluded.minute AND api_limits.hits < ?)
  `).bind(actor.id, bucket, minute, perMinute[bucket]).run();
  if (!(result.meta?.changes ?? result.changes)) {
    return response({ error: 'Muitas solicitações. Tente novamente em instantes.', code: 'rate_limited' },
      429, { 'Retry-After': String(60 - seconds % 60) });
  }
}

export async function api(request, db, { ownerEmail } = {}) {
  const url = new URL(request.url);
  try {
    if (!db) return response({ error: 'O banco de dados está indisponível.' }, 503);
    const readState = request.method === 'GET' && url.pathname === '/api/state';
    const readSession = request.method === 'GET' && url.pathname === '/api/session';
    const write = request.method === 'POST' && Object.hasOwn(writers, url.pathname);
    if (!readState && !readSession && !write) return response({ error: 'Recurso não encontrado.' }, 404);
    if (write) {
      const origin = request.headers.get('Origin');
      if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
        return response({ error: 'Origem da solicitação inválida.' }, 403);
      }
      if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return response({ error: 'Envie os dados no formato JSON.' }, 415);
      }
    }
    const actor = await actorFor(request, db, ownerEmail);
    const requestedProfile = request.headers.get('X-Rota-Profile');
    if (requestedProfile && requestedProfile !== actor.id) {
      throw new InputError('A conta mudou. Atualize a página para continuar.', 403, 'profile_changed');
    }
    if (readSession) return response(actor);
    if (readState) {
      const blocked = await rateLimit(db, actor, 'state');
      if (blocked) return blocked;
      if (!(await existing(db, 'municipal', 'colmeia-leite-2025'))) {
        await db.batch(demoRecords().map(([kind, item]) => insert(db, kind, item)));
      }
      return response(await stateFor(db, actor));
    }
    if (write) {
      if (url.pathname !== '/api/events' && actor.role !== 'manager') {
        throw new InputError('Esta ação é exclusiva do gestor.', 403);
      }
      const blocked = await rateLimit(db, actor, 'write');
      if (blocked) return blocked;
      const data = await readJson(request);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new InputError('Dados inválidos.');
      const item = await writers[url.pathname](db, data, actor);
      return response(item, 201);
    }
    return response({ error: 'Recurso não encontrado.' }, 404);
  } catch (error) {
    if (error instanceof InputError) return response({ error: error.message, code: error.code }, error.status);
    console.error(error);
    return response({ error: 'Não foi possível acessar os dados agora.' }, 500);
  }
}
