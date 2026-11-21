<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import AboutView from './AboutView.vue';
import AppIcon from './AppIcon.vue';
import DateFilter from './DateFilter.vue';
import OperationForm from './OperationForm.vue';
import RouteItems from './RouteItems.vue';
import { dateKey, eventResult, liters, number, routeStats, showDate, showDateTime, showTime, statusFor, statusText, stopHistory } from './operation.js';
import { routeCsv } from './routeCsv.js';
import { useCollection } from './useCollection.js';

const {
  profile, data, denied, hasSnapshot, queue, reachable, syncing, hasLoaded, notice, noticeError, connection, sync, saveOnline, collect, routeRevision, closeRoute
} = useCollection();
const googleLogin = document.querySelector('meta[name="rota-login"]')?.content === 'google';
const loginFailed = new URL(location.href).searchParams.get('login') === 'failed';
function forgetOfflineProfile() {
  try { localStorage.removeItem('rota-leite-last-profile'); } catch { /* Browser storage may be unavailable. */ }
}
const isManager = computed(() => profile.value?.role === 'manager');
const pages = computed(() => [
  ['painel', 'Painel', 'panel'], ['rotas', 'Rotas', 'routes'],
  ...(isManager.value ? [['produtores', 'Produtores', 'producers'], ['equipe', 'Equipe', 'producers']] : []),
  ['documentacao', 'Sobre', 'docs']
]);
const hash = ref(location.hash);
const activeDate = ref(dateKey());
const main = ref(null);
const heading = ref(null);
const dialog = ref(null);
const operation = ref(null);
const closeBusy = ref(false);
const closeError = ref('');
let returnFocus;
const [page, detail] = [
  computed(() => {
    const name = hash.value.slice(1).split('/')[0];
    return pages.value.some(([key]) => key === name) ? name : 'painel';
  }),
  computed(() => hash.value.slice(1).split('/')[1])
];

const routes = computed(() => data.value.routes.filter(route => route.date === activeDate.value).map(route => {
  const stats = routeStats(data.value, route);
  return { route, stats, state: statusFor(stats, route.stops.length, route.closedAt) };
}));
const primary = computed(() => routes.value.find(({ route, stats }) => !route.closedAt && stats.collected < route.stops.length)
  || routes.value.find(({ route }) => !route.closedAt) || routes.value[0]);
const summary = computed(() => routes.value.reduce((total, { route, stats }) => ({
  liters: total.liters + stats.liters, expected: total.expected + stats.expected,
  collected: total.collected + stats.collected, incidents: total.incidents + stats.incidents,
  stops: total.stops + route.stops.length
}), { liters: 0, expected: 0, collected: 0, incidents: 0, stops: 0 }));
const statistics = computed(() => {
  const { liters: volume, expected, collected, incidents, stops } = summary.value;
  return [
    ['Leite coletado', liters(volume), 'Volume registrado', 'milk'],
    ['Leite previsto', liters(expected), 'Estimativa das rotas', 'target'],
    ['Paradas coletadas', collected + '/' + stops, 'No dia selecionado', 'check'],
    ['Ocorrências', incidents, 'Paradas que exigem ação', 'alert']
  ];
});
const municipal = computed(() => data.value.municipal);
const growth = computed(() => municipal.value
  ? number.format((municipal.value.liters / municipal.value.previousLiters - 1) * 100)
  : '');
const currentRoute = computed(() => data.value.routes.find(route => route.id === detail.value));
const currentStats = computed(() => currentRoute.value ? routeStats(data.value, currentRoute.value) : null);
const currentStops = computed(() => (currentRoute.value?.stops || []).map(stop => {
  const history = stopHistory(data.value, currentRoute.value, stop);
  const event = history.at(-1);
  const byId = new Map(history.map(entry => [entry.id, entry]));
  return {
    stop, event,
    corrections: history.slice(1).map((entry, index) => ({
      entry, previous: byId.get(entry.priorEventId) || history[index]
    })).reverse(),
    producer: data.value.producers.find(item => item.id === stop.producerId),
    pending: event && queue.value.some(item => item.id === event.id)
  };
}));
const pendingStops = computed(() => currentRoute.value.stops.length - currentStats.value.collected - currentStats.value.incidents);
const hasPendingSync = computed(() => queue.value.some(event => event.routeId === currentRoute.value?.id && !event.blocked));
const canClose = computed(() => reachable.value && !syncing.value && !hasPendingSync.value);
const unsent = computed(() => queue.value.filter(event => event.blocked).map(event => {
  const route = data.value.routes.find(route => route.id === event.routeId);
  const stop = route?.stops.find(stop => stop.id === event.stopId);
  const producer = data.value.producers.find(item => item.id === stop?.producerId);
  return { ...event, routeName: route?.name || 'Rota indisponível', producerName: producer?.name || 'Parada local' };
}));
const showLoading = computed(() => !hasSnapshot.value && page.value !== 'documentacao');
const copy = computed(() => {
  if (showLoading.value) return ['Operação de coleta', 'Colméia, Tocantins'];
  if (page.value === 'equipe') return ['Equipe', 'Cadastre os motoristas que receberão rotas.'];
  if (page.value === 'produtores') return ['Propriedades', 'Cadastre os pontos de coleta usados nas rotas.'];
  if (page.value === 'documentacao') return ['Sobre o Rota Leite', 'Guia de uso e origem dos dados.'];
  if (page.value === 'painel') return ['Painel de coletas', showDate(activeDate.value) + ' · Colméia, Tocantins'];
  if (!detail.value) return ['Rotas de coleta', 'Planeje as paradas e acompanhe as rotas por data.'];
  const route = currentRoute.value;
  if (!route) return ['Rota indisponível', 'Abra uma das rotas disponíveis para seu perfil.'];
  return [route.name, [showDate(route.date), route.driver || 'Equipe de coleta', route.demo ? 'Demonstração' : ''].filter(Boolean).join(' · ')];
});

async function openForm(kind, fields = {}) {
  returnFocus = document.activeElement;
  operation.value = { kind, ...fields };
  await nextTick();
  dialog.value.showModal();
  dialog.value.querySelector('input, select, textarea')?.focus();
}

function afterClose() {
  operation.value = null;
  closeError.value = '';
  if (returnFocus?.isConnected) returnFocus.focus();
  else heading.value?.focus({ preventScroll: true });
}

function reviewClosure() {
  const route = currentRoute.value;
  void openForm('close', {
    route, stats: currentStats.value, pending: pendingStops.value, revision: routeRevision(route.id)
  });
}

async function confirmClosure() {
  const { route, revision } = operation.value;
  closeBusy.value = true;
  closeError.value = '';
  try {
    await closeRoute(route.id, revision);
    dialog.value.close();
  } catch (error) {
    closeError.value = error.message;
  } finally {
    closeBusy.value = false;
  }
}

function downloadReport() {
  const route = currentRoute.value;
  const blob = new Blob([routeCsv(route, currentStats.value, currentStops.value)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const name = route.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  link.href = url;
  link.download = (name || 'rota') + '-' + route.date + '.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function goToRoute(route) {
  activeDate.value = route.date;
  location.hash = 'rotas/' + route.id;
}

function skip() {
  main.value?.focus();
  main.value?.scrollIntoView();
}

async function navigate() {
  hash.value = location.hash;
  await nextTick();
  window.scrollTo(0, 0);
  heading.value?.focus({ preventScroll: true });
}
onMounted(() => window.addEventListener('hashchange', navigate));
onUnmounted(() => window.removeEventListener('hashchange', navigate));
</script>

<template>
  <a class="skip" href="#main" @click.prevent="skip">Pular para o conteúdo</a>
  <aside class="sidebar">
    <a class="brand" href="#painel" aria-label="Rota Leite, voltar ao painel">
      <img src="/logo.svg" width="43" height="43" alt="">
      <span><strong>Rota Leite</strong><small>COLMÉIA, TO</small></span>
    </a>
    <nav aria-label="Menu principal">
      <a v-for="[key, label, icon] in pages" :key="key" class="nav-item" :href="'#' + key" :aria-current="key === page ? 'page' : null">
        <AppIcon :name="icon" /> {{ label }}
      </a>
    </nav>
    <div class="sidebar-bottom">
      <p class="demo-tag"><span></span> Ambiente demonstrativo</p>
      <p>Gestão da coleta de leite<br>Colméia, Tocantins</p>
    </div>
  </aside>

  <div class="layout">
    <header class="topbar">
      <span class="top-label">{{ profile ? (isManager ? 'Perfil gestor' : 'Perfil motorista') : 'Operação de coleta' }}</span>
      <div class="top-right">
        <form v-if="googleLogin && profile" method="post" action="/api/auth/logout" @submit="forgetOfflineProfile">
          <button type="submit" class="btn btn-light">Sair</button>
        </form>
        <span class="connection" role="status" :data-state="reachable ? 'online' : 'offline'">{{ connection }}</span>
        <button type="button" class="icon-button" aria-label="Sincronizar agora" title="Sincronizar agora" @click="sync(true)">
          <AppIcon name="sync" />
        </button>
      </div>
    </header>

    <main id="main" ref="main" tabindex="-1">
      <div id="notice" role="status" aria-live="polite" :class="{ error: noticeError }">{{ notice }}</div>
      <div class="page-head">
        <div><h1 ref="heading" tabindex="-1">{{ copy[0] }}</h1><p>{{ copy[1] }}</p></div>
        <template v-if="!showLoading">
          <DateFilter v-if="page === 'painel'" v-model="activeDate" />
          <button v-else-if="page === 'produtores'" class="btn btn-primary" @click="openForm('producer')"><AppIcon name="plus" /> Nova propriedade</button>
          <button v-else-if="isManager && page === 'rotas' && !detail" class="btn btn-primary" @click="openForm('route')"><AppIcon name="plus" /> Nova rota</button>
          <button v-else-if="page === 'equipe'" class="btn btn-primary" @click="openForm('driver')"><AppIcon name="plus" /> Novo motorista</button>
          <a v-else-if="page === 'rotas' && detail" class="btn btn-light" href="#rotas">{{ currentRoute ? 'Todas as rotas' : 'Ver rotas' }}</a>
        </template>
      </div>

      <details v-if="unsent.length" class="panel local-review">
        <summary>Registros para revisar ({{ unsent.length }})</summary>
        <ul>
          <li v-for="event in unsent" :key="event.id">
            <strong>{{ event.routeName }} · {{ event.producerName }}</strong>
            <p>{{ showDateTime(event.at) }} · {{ eventResult(event) }} · {{ event.blocked }}</p>
            <p v-if="event.correctionReason">Motivo da correção: {{ event.correctionReason }}</p>
            <p v-if="event.notes">Observações: {{ event.notes }}</p>
          </li>
        </ul>
      </details>

      <template v-if="showLoading">
        <p v-if="!hasLoaded" class="loading">Carregando as rotas…</p>
        <template v-else>
          <p class="empty">{{ googleLogin && loginFailed ? 'Não foi possível entrar. Confira a conta autorizada e tente novamente.' : (denied || 'Conecte-se para carregar as rotas pela primeira vez.') }}</p>
          <a v-if="googleLogin && !profile" class="btn btn-primary" href="/api/auth/login">Entrar com Google</a>
          <button v-else class="btn btn-primary" @click="sync(true)">Tentar novamente</button>
        </template>
      </template>

      <template v-else-if="page === 'painel'">
        <section class="hero">
          <div>
            <p class="eyebrow">Operação do dia</p>
            <template v-if="primary">
              <h2>{{ primary.route.name }}</h2>
              <p v-if="primary.route.closedAt">Encerrada · {{ showDateTime(primary.route.closedAt) }}</p>
              <p v-else>{{ primary.route.driver || 'Equipe de coleta' }}{{ primary.route.demo ? ' · Demonstração' : '' }}</p>
              <a class="btn btn-lime" :href="'#rotas/' + primary.route.id">Abrir rota</a>
            </template>
            <template v-else>
              <h2>Nenhuma rota planejada</h2>
              <p>{{ isManager ? 'Escolha outra data ou monte uma rota para iniciar a coleta.' : 'Escolha outra data para consultar suas rotas atribuídas.' }}</p>
              <button v-if="isManager" class="btn btn-lime" @click="openForm('route')"><AppIcon name="plus" /> Nova rota</button>
            </template>
          </div>
          <div v-if="primary" class="hero-progress">
            <span>Progresso da coleta</span>
            <strong>{{ primary.stats.collected }} de {{ primary.route.stops.length }} paradas</strong>
            <progress aria-label="Paradas coletadas" :value="primary.stats.collected" :max="primary.route.stops.length"></progress>
          </div>
        </section>
        <section class="metrics" aria-label="Indicadores da operação">
          <div v-for="[label, value, description, icon] in statistics" :key="label" class="stat">
            <span class="stat-label"><AppIcon :name="icon" />{{ label }}</span>
            <strong>{{ value }}</strong><small>{{ description }}</small>
          </div>
        </section>
        <div class="dashboard-grid">
          <section class="panel">
            <div class="panel-heading"><h2>Rotas do dia</h2><a class="btn btn-text" href="#rotas">Ver rotas</a></div>
            <p class="description">{{ isManager ? 'Acompanhe a situação de cada equipe.' : 'Acompanhe as suas rotas atribuídas.' }}</p>
            <RouteItems :entries="routes" />
          </section>
          <section v-if="municipal" class="panel context">
            <p class="eyebrow">Dados públicos</p><h2>Produção municipal de leite</h2>
            <strong class="figure">{{ liters(municipal.liters) }}</strong>
            <p class="description">{{ municipal.municipality }} · {{ municipal.year }} · +{{ growth }}% sobre o ano anterior</p>
            <a class="source" :href="municipal.url" target="_blank" rel="noopener">{{ municipal.source }}</a>
          </section>
        </div>
      </template>

      <section v-else-if="page === 'rotas' && !detail" class="panel">
        <div class="panel-heading"><h2>Rotas planejadas</h2><DateFilter v-model="activeDate" /></div>
        <RouteItems :entries="routes" />
      </section>

      <template v-else-if="page === 'rotas' && currentRoute && currentStats">
        <section class="panel route-summary">
          <div class="route-review">
            <div>
              <h2>Resumo da rota</h2>
              <p class="description">{{ liters(currentStats.liters) }} coletados · {{ liters(currentStats.expected) }} previstos</p>
              <p class="description">{{ currentStats.collected }} coletadas · {{ currentStats.incidents }} com ocorrência · {{ pendingStops }} sem registro</p>
              <p v-if="currentRoute.closedAt" class="description">Encerrada em {{ showDateTime(currentRoute.closedAt) }}</p>
              <p v-else-if="isManager && !canClose" id="close-availability" class="description">Conecte-se e sincronize os registros para encerrar.</p>
            </div>
            <button v-if="currentRoute.closedAt" type="button" class="btn btn-primary" @click="downloadReport">Baixar CSV</button>
            <div v-else-if="isManager" class="record-actions">
              <button type="button" class="btn btn-light" @click="openForm('assign', { route: currentRoute })">Atribuir motorista</button>
              <button type="button" class="btn btn-primary" :disabled="!canClose"
              :aria-describedby="!canClose ? 'close-availability' : null" @click="reviewClosure">Encerrar rota</button>
            </div>
          </div>
        </section>
        <ol class="record-list" aria-label="Paradas da rota">
          <li v-for="({ stop, producer, event, pending, corrections }, index) in currentStops" :key="stop.id" class="record">
            <div class="record-text">
              <strong>{{ index + 1 }}. {{ producer?.name || 'Propriedade' }}</strong>
              <p>{{ producer?.locality }} · {{ liters(stop.expected) }} previstos</p>
              <p v-if="event">{{ event.status === 'collected' ? liters(event.liters) : event.reason }} · {{ showTime(event.at) }}{{ pending ? ' · A sincronizar' : '' }}</p>
              <p v-if="event?.notes">Observações: {{ event.notes }}</p>
              <details v-if="corrections.length" class="correction-history">
                <summary>Histórico de correções ({{ corrections.length }})</summary>
                <ol>
                  <li v-for="{ entry, previous } in corrections" :key="entry.id">
                    <p><strong>{{ showDateTime(entry.at) }}</strong> · {{ entry.author || 'Autor não registrado' }}{{ entry.draft ? ' · A sincronizar' : '' }}</p>
                    <p>Anterior: {{ eventResult(previous) }} · Novo: {{ eventResult(entry) }}</p>
                    <p>Motivo: {{ entry.correctionReason || 'Não registrado' }}</p>
                  </li>
                </ol>
              </details>
            </div>
            <div class="record-actions">
              <span class="badge" :class="event?.status || 'planned'">{{ !event && currentRoute.closedAt ? 'Sem registro' : statusText[event?.status || 'planned'] }}</span>
              <button v-if="!currentRoute.closedAt" class="btn btn-light" :aria-label="(event ? 'Atualizar' : 'Registrar') + ' coleta em ' + (producer?.name || 'propriedade')"
                @click="openForm('event', { route: currentRoute, stop, producer, prior: event })">
                {{ event ? 'Atualizar' : 'Registrar coleta' }}
              </button>
            </div>
          </li>
        </ol>
      </template>

      <ul v-else-if="page === 'produtores'" class="record-list">
        <li v-for="producer in data.producers" :key="producer.id" class="record">
          <div class="record-text">
            <strong>{{ producer.name }}</strong>
            <p>{{ producer.locality }} · {{ liters(producer.expected) }} previstos por coleta</p>
            <p v-if="producer.contact">Contato: {{ producer.contact }}</p>
          </div>
          <span v-if="producer.demo" class="badge planned">Demonstração</span>
        </li>
      </ul>

      <section v-else-if="page === 'equipe'" class="panel">
        <h2>Motoristas cadastrados</h2>
        <p class="description">Cadastre o mesmo e-mail usado pelo motorista para entrar no site. O acesso ao site privado também precisa ser concedido nas configurações de compartilhamento.</p>
        <p v-if="!data.drivers?.length" class="empty">Nenhum motorista cadastrado.</p>
        <ul v-else class="record-list">
          <li v-for="driver in data.drivers" :key="driver.id" class="record">
            <div class="record-text"><strong>{{ driver.name }}</strong><p>{{ driver.email }}</p></div>
          </li>
        </ul>
      </section>

      <AboutView v-else-if="page === 'documentacao'" :municipal="municipal" />
    </main>
  </div>

  <dialog ref="dialog" aria-labelledby="dialog-title" @close="afterClose" @cancel="closeBusy && $event.preventDefault()">
    <form v-if="operation?.kind === 'close'" @submit.prevent="confirmClosure">
      <div class="dialog-head"><h2 id="dialog-title">Encerrar rota?</h2></div>
      <div>
        <p><strong>{{ operation.route.name }}</strong></p>
        <p class="description">{{ liters(operation.stats.liters) }} coletados de {{ liters(operation.stats.expected) }} previstos.</p>
        <p>{{ operation.stats.collected }} paradas coletadas · {{ operation.stats.incidents }} com ocorrência · {{ operation.pending }} sem registro.</p>
        <p>O fechamento bloqueia alterações nas paradas. As ocorrências e as paradas sem registro aparecerão no CSV.</p>
      </div>
      <p v-if="closeError" class="form-error" role="alert">{{ closeError }}</p>
      <div class="form-actions">
        <button type="button" class="btn btn-light" :disabled="closeBusy" autofocus @click="dialog.close()">Cancelar</button>
        <button class="btn btn-primary" type="submit" :disabled="closeBusy">{{ closeBusy ? 'Encerrando…' : 'Confirmar fechamento' }}</button>
      </div>
    </form>
    <OperationForm v-else-if="operation" :operation="operation" :producers="data.producers" :drivers="data.drivers || []" :date="activeDate"
      :save-online="saveOnline" :collect="collect" @close="dialog.close()" @route="goToRoute" />
  </dialog>
</template>
