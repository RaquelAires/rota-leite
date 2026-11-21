<script setup>
import { computed, nextTick, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { id, liters } from './operation.js';

const props = defineProps({
  operation: { type: Object, required: true },
  producers: { type: Array, required: true },
  drivers: { type: Array, required: true },
  date: { type: String, required: true },
  saveOnline: { type: Function, required: true },
  collect: { type: Function, required: true }
});
const emit = defineEmits(['close', 'route']);
const { kind, producer, route, stop, prior } = props.operation;
const title = { producer: 'Nova propriedade', route: 'Nova rota', driver: 'Novo motorista', assign: 'Atribuir motorista', event: producer?.name || 'Registrar coleta' }[kind];
const recordId = id();
const outcome = ref(prior?.status || 'collected');
const selected = ref('');
const driverId = ref(route?.driverId || '');
const stops = ref([]);
const selectField = ref(null);
const error = ref('');
const busy = ref(false);
const reasons = ['Acesso bloqueado', 'Produtor ausente', 'Leite indisponível', 'Problema no veículo', 'Outro motivo'];
const available = computed(() => props.producers.filter(item => !stops.value.some(entry => entry.producerId === item.id)));

function addStop() {
  const newProducer = props.producers.find(item => item.id === selected.value);
  if (newProducer && stops.value.length < 50) {
    stops.value.push({ producerId: newProducer.id, name: newProducer.name, expected: newProducer.expected });
    selected.value = '';
  }
  selectField.value?.focus();
}

async function removeStop(producerId) {
  stops.value = stops.value.filter(stop => stop.producerId !== producerId);
  await nextTick();
  selectField.value?.focus();
}

async function submit(event) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  const fields = new FormData(event.currentTarget);
  const text = key => String(fields.get(key) || '').trim();
  try {
    if (kind === 'producer') {
      await props.saveOnline('/api/producers', {
        id: recordId, name: text('name'), locality: text('locality'),
        contact: text('contact'), expected: Number(fields.get('expected'))
      }, 'Propriedade cadastrada.');
    } else if (kind === 'driver') {
      await props.saveOnline('/api/drivers', { id: recordId, name: text('name'), email: text('email') }, 'Motorista cadastrado.');
    } else if (kind === 'assign') {
      await props.saveOnline('/api/routes/assign', { routeId: route.id, driverId: driverId.value }, 'Responsável da rota atualizado.');
    } else if (kind === 'route') {
      if (!stops.value.length) throw new Error('Adicione pelo menos uma parada.');
      const saved = await props.saveOnline('/api/routes', {
        id: recordId, name: text('name'), date: text('date'), driver: text('driver'), driverId: driverId.value,
        stops: stops.value.map(({ producerId, expected }) => ({ producerId, expected: Number(expected) }))
      }, 'Rota planejada.');
      emit('route', saved);
    } else {
      const status = outcome.value;
      props.collect({
        id: recordId, routeId: route.id, stopId: stop.id, status,
        priorEventId: prior?.id || null, correctionReason: text('correctionReason'),
        liters: status === 'collected' ? Number(fields.get('liters')) : null,
        reason: status === 'incident' ? text('reason') : '',
        notes: text('notes'), at: new Date().toISOString(), demo: route.demo
      });
    }
    emit('close');
  } catch (failure) {
    error.value = failure.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form @submit.prevent="submit">
    <div class="dialog-head">
      <h2 id="dialog-title">{{ title }}</h2>
      <button type="button" class="icon-button" aria-label="Fechar" @click="emit('close')"><AppIcon name="close" /></button>
    </div>
    <template v-if="kind === 'producer'">
      <label class="field">Nome da propriedade<input name="name" required maxlength="80"></label>
      <label class="field">Localidade ou referência<input name="locality" required maxlength="100"></label>
      <label class="field">Contato (opcional)<input name="contact" maxlength="80"></label>
      <label class="field">Volume previsto por coleta (L)
        <input name="expected" type="number" inputmode="decimal" min="0" max="100000" step="0.01" required>
      </label>
    </template>
    <template v-else-if="kind === 'driver'">
      <label class="field">Nome do motorista<input name="name" required maxlength="80"></label>
      <label class="field">E-mail de acesso<input name="email" type="email" required maxlength="254"></label>
    </template>
    <template v-else-if="kind === 'assign'">
      <p>{{ route.name }}</p>
      <p v-if="!drivers.length" class="description">Cadastre um motorista na página Equipe para poder atribuí-lo.</p>
      <label class="field">Motorista
        <select v-model="driverId">
          <option value="">Sem motorista atribuído</option>
          <option v-for="driver in drivers" :key="driver.id" :value="driver.id">{{ driver.name }}</option>
        </select>
      </label>
    </template>
    <template v-else-if="kind === 'route'">
      <label class="field">Nome da rota<input name="name" required maxlength="80"></label>
      <label class="field">Data da coleta<input name="date" type="date" required :value="date"></label>
      <label class="field">Motorista
        <select v-model="driverId">
          <option value="">Sem motorista atribuído</option>
          <option v-for="driver in drivers" :key="driver.id" :value="driver.id">{{ driver.name }}</option>
        </select>
      </label>
      <label v-if="!driverId" class="field">Responsável (opcional)<input name="driver" maxlength="80"></label>
      <fieldset>
        <legend>Paradas na ordem de coleta</legend>
        <label for="producer-select">Propriedade</label>
        <div class="choice">
          <select id="producer-select" ref="selectField" v-model="selected">
            <option value="">Selecione uma propriedade</option>
            <option v-for="item in available" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
          <button type="button" class="btn btn-light" :disabled="!available.length || stops.length >= 50" @click="addStop">Adicionar parada</button>
        </div>
        <ol class="selected-stops">
          <li v-for="entry in stops" :key="entry.producerId">
            <div class="selected-stop">
              <strong>{{ entry.name }}</strong>
              <button class="btn btn-text" type="button" :aria-label="'Remover ' + entry.name" @click="removeStop(entry.producerId)">Remover</button>
            </div>
            <label class="field">Volume previsto (L)
              <input v-model.number="entry.expected" type="number" inputmode="decimal" min="0" max="100000" step="0.01" required>
            </label>
          </li>
        </ol>
      </fieldset>
    </template>
    <template v-else>
      <p class="muted">{{ route.name }} · {{ liters(stop.expected) }} previstos</p>
      <label class="field">Resultado
        <select v-model="outcome" name="status">
          <option value="collected">Leite coletado</option>
          <option value="incident">Coleta com ocorrência</option>
        </select>
      </label>
      <label v-show="outcome === 'collected'" class="field">Volume coletado (L)
        <input name="liters" type="number" inputmode="decimal" min="0.01" max="100000" step="0.01"
          :value="prior?.liters" :disabled="outcome !== 'collected'" :required="outcome === 'collected'">
      </label>
      <label v-show="outcome === 'incident'" class="field">Motivo
        <select name="reason" :value="prior?.reason || ''" :disabled="outcome !== 'incident'" :required="outcome === 'incident'">
          <option value="">Selecione</option>
          <option v-for="reason in reasons" :key="reason">{{ reason }}</option>
        </select>
      </label>
      <label v-if="prior" class="field">Motivo da correção
        <textarea name="correctionReason" rows="2" maxlength="250" required></textarea>
      </label>
      <label class="field">Observações (opcional)<textarea name="notes" rows="2" maxlength="300" :value="prior?.notes"></textarea></label>
    </template>
    <p class="form-error" role="alert" :hidden="!error">{{ error }}</p>
    <div class="form-actions">
      <button type="button" class="btn btn-light" @click="emit('close')">Cancelar</button>
      <button class="btn btn-primary" type="submit" :disabled="busy">Salvar</button>
    </div>
  </form>
</template>
