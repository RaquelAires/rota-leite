<script setup>
import AppIcon from './AppIcon.vue';
import { liters } from './operation.js';

defineProps({ entries: { type: Array, required: true } });
</script>

<template>
  <p v-if="!entries.length" class="empty">Nenhuma rota planejada para esta data.</p>
  <div v-for="{ route, stats, state } in entries" :key="route.id" class="route-item">
    <span class="route-mark"><AppIcon name="routes" /></span>
    <div class="route-info">
      <strong><a :href="'#rotas/' + route.id">{{ route.name }}</a></strong>
      <small>{{ route.stops.length }} paradas · {{ liters(stats.expected) }} previstos{{ route.demo ? ' · Demonstração' : '' }}</small>
    </div>
    <span class="badge" :class="state[0]">{{ state[1] }}</span>
  </div>
</template>
