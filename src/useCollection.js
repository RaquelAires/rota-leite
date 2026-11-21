import { computed, onMounted, onUnmounted, ref } from 'vue';

const profileKey = 'rota-leite-last-profile';
const empty = { producers: [], routes: [], events: [], municipal: null, drivers: [] };
const key = (profile, kind) => 'rota-leite-' + kind + '-v2:' + profile.id;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

async function request(path, data, profile) {
  const options = { cache: 'no-store', signal: AbortSignal.timeout(9000), headers: {} };
  if (profile) options.headers['X-Rota-Profile'] = profile.id;
  if (data) {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }
  const result = await fetch(path, options);
  const json = await result.json().catch(() => null);
  if (!result.ok || !json) {
    const error = new Error(json?.error || 'O servidor está indisponível no momento.');
    error.status = result.status;
    error.code = json?.code;
    error.retryAfter = Number(result.headers.get('Retry-After')) || 60;
    throw error;
  }
  return json;
}

export function useCollection() {
  const profile = ref(null);
  const snapshot = ref(null);
  const queue = ref([]);
  const reachable = ref(navigator.onLine);
  const syncing = ref(false);
  const closing = ref(false);
  let retryAt = 0;
  const hasLoaded = ref(false);
  const denied = ref('');
  const notice = ref('');
  const noticeError = ref(false);
  const outgoing = computed(() => queue.value.filter(event => !event.blocked));
  const data = computed(() => {
    const saved = snapshot.value || empty;
    const events = new Map(saved.events.map(event => [event.id, event]));
    const openRoutes = new Set(saved.routes.filter(route => !route.closedAt).map(route => route.id));
    for (const event of outgoing.value) {
      if (openRoutes.has(event.routeId)) events.set(event.id, event);
    }
    return { ...saved, events: Array.from(events.values()) };
  });
  const connection = computed(() => {
    if (syncing.value) return 'Sincronizando…';
    const count = outgoing.value.length;
    if (count) return (reachable.value ? 'A sincronizar' : 'Sem conexão') + ' · ' + count;
    return reachable.value ? 'Conectado' : 'Sem conexão';
  });

  function say(message, error = false) {
    notice.value = message;
    noticeError.value = error;
  }

  function switchProfile(next) {
    if (profile.value?.id !== next?.id) {
      snapshot.value = next ? read(key(next, 'state'), null) : null;
      queue.value = next ? read(key(next, 'outbox'), []) : [];
    }
    profile.value = next;
  }

  function setQueue(next) {
    localStorage.setItem(key(profile.value, 'outbox'), JSON.stringify(next));
    queue.value = next;
  }

  function cacheSnapshot() {
    try { localStorage.setItem(key(profile.value, 'state'), JSON.stringify(snapshot.value)); }
    catch { /* The remote snapshot still works for the current session. */ }
  }

  function migrateManagerQueue() {
    const legacyKey = 'rota-leite-outbox-v1';
    const legacy = read(legacyKey, []);
    if (!legacy.length) return;
    const queued = new Map([...queue.value, ...legacy].map(event => [event.id, event]));
    setQueue(Array.from(queued.values()));
    localStorage.removeItem(legacyKey);
  }

  async function sync(manual = false) {
    if (syncing.value || closing.value) return;
    if (Date.now() < retryAt) {
      if (manual) say('Aguarde alguns instantes para sincronizar novamente.', true);
      return;
    }
    if (!navigator.onLine) {
      if (!profile.value && !denied.value) switchProfile(read(profileKey, null));
      reachable.value = false;
      hasLoaded.value = true;
      if (manual) say('Sem conexão. Os registros guardados serão enviados quando a internet voltar.', true);
      return;
    }
    syncing.value = true;
    try {
      const next = await request('/api/session');
      switchProfile(next);
      denied.value = '';
      try { localStorage.setItem(profileKey, JSON.stringify(next)); } catch { /* Offline access remains unavailable. */ }
      if (next.role === 'manager') migrateManagerQueue();
      const outboxKey = key(next, 'outbox');
      const submitted = new Set();
      const blocked = new Map();
      let throttled = false;
      for (const event of read(outboxKey, queue.value).filter(item => !item.blocked).slice(0, 25)) {
        try {
          await request('/api/events', event, next);
          submitted.add(event.id);
        } catch (error) {
          if (error.status === 429) {
            retryAt = Date.now() + error.retryAfter * 1000;
            throttled = true;
            break;
          }
          if (!['route_closed', 'stop_changed', 'route_unassigned'].includes(error.code)) throw error;
          blocked.set(event.id, error.message);
        }
      }
      snapshot.value = await request('/api/state', null, next);
      reachable.value = true;
      cacheSnapshot();
      if (submitted.size || blocked.size) {
        const pending = read(outboxKey, queue.value).filter(event => !submitted.has(event.id));
        setQueue(pending.map(event => blocked.has(event.id) ? { ...event, blocked: blocked.get(event.id) } : event));
      }
      if (blocked.size) say('Há registros locais que precisam de revisão. Confira em Registros para revisar.', true);
      else if (throttled) say('A sincronização continuará em instantes.');
      else if (submitted.size && outgoing.value.length) say('Sincronização em andamento. Há registros na fila.');
      else if (manual || submitted.size) say(submitted.size ? 'Registros sincronizados.' : 'Dados atualizados.');
    } catch (error) {
      if (error.status === 429) retryAt = Date.now() + error.retryAfter * 1000;
      if ([200, 401, 403].includes(error.status)) {
        switchProfile(null);
        denied.value = error.status === 200 ? 'Entre com a conta autorizada para acessar.' : error.message;
        try { localStorage.removeItem(profileKey); } catch { /* No storage access. */ }
      } else if (!profile.value && !denied.value && (!error.status || error.status >= 500)) {
        switchProfile(read(profileKey, null));
      }
      reachable.value = Boolean(error.status && error.status < 500);
      if (manual || (!snapshot.value && error.status) || (reachable.value && queue.value.length)) say(error.message, true);
    } finally {
      hasLoaded.value = true;
      syncing.value = false;
    }
  }

  function updateSnapshot(path, saved) {
    const current = snapshot.value || empty;
    const section = path === '/api/drivers' ? 'drivers' : path === '/api/producers' ? 'producers' : 'routes';
    const entries = current[section] || [];
    snapshot.value = {
      ...current,
      [section]: entries.some(record => record.id === saved.id)
        ? entries.map(record => record.id === saved.id ? saved : record)
        : [...entries, saved]
    };
    cacheSnapshot();
  }

  async function saveOnline(path, item, message) {
    const saved = await request(path, item, profile.value);
    updateSnapshot(path, saved);
    say(message);
    void sync();
    return saved;
  }

  function routeRevision(routeId) {
    return (snapshot.value?.events || []).filter(event => event.routeId === routeId).length;
  }

  async function closeRoute(routeId, eventCount) {
    if (!navigator.onLine || syncing.value || closing.value) {
      throw new Error('Aguarde a conexão e a sincronização para encerrar a rota.');
    }
    if (read(key(profile.value, 'outbox'), queue.value).some(event => event.routeId === routeId && !event.blocked)) {
      throw new Error('Sincronize os registros desta rota antes de encerrar.');
    }
    closing.value = true;
    try {
      const saved = await request('/api/routes/close', { routeId, eventCount }, profile.value);
      updateSnapshot('/api/routes/close', saved);
      say('Rota encerrada. O relatório CSV está disponível.');
    } finally {
      closing.value = false;
      void sync();
    }
  }

  function collect(event) {
    const actor = profile.value;
    const routes = read(key(actor, 'state'), snapshot.value)?.routes;
    const route = routes?.find(route => route.id === event.routeId);
    if (!route) throw new Error('Esta rota não está disponível para sua conta.');
    if (route.closedAt) throw new Error('Esta rota já foi encerrada.');
    try {
      const saved = read(key(actor, 'outbox'), queue.value);
      setQueue([...saved, { ...event, author: actor.name, draft: true }]);
    } catch {
      throw new Error('Não foi possível guardar no aparelho. Verifique o espaço local e tente novamente.');
    }
    say('Registro salvo no aparelho.');
    void sync();
  }

  const online = () => void sync();
  const offline = () => { reachable.value = false; };
  const visible = () => { if (!document.hidden) void sync(); };
  function storage(event) {
    if (event.key === profileKey && navigator.onLine) {
      const last = read(profileKey, null);
      if (last?.id !== profile.value?.id) {
        switchProfile(null);
        void sync();
      }
    }
    if (!profile.value) return;
    if (event.key === key(profile.value, 'outbox')) queue.value = read(event.key, []);
    if (event.key === key(profile.value, 'state')) snapshot.value = read(event.key, snapshot.value);
  }
  let interval;
  onMounted(() => {
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    interval = setInterval(() => { if (!document.hidden && outgoing.value.length) void sync(); }, 15000);
    void sync();
  });
  onUnmounted(() => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    window.removeEventListener('storage', storage);
    document.removeEventListener('visibilitychange', visible);
    clearInterval(interval);
  });

  return {
    profile, data, denied, hasSnapshot: computed(() => Boolean(snapshot.value)), queue, reachable,
    syncing, hasLoaded, notice, noticeError, connection, sync, saveOnline, collect, routeRevision, closeRoute
  };
}
