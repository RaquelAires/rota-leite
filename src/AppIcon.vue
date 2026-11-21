<script setup>
const shapes = {
  panel: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  routes: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h9a4 4 0 0 1 0 8H7a3 3 0 0 0 0 6h9"/>',
  producers: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 5a3 3 0 0 1 0 6m2 3a4 4 0 0 1 3 4v2"/>',
  docs: '<path d="M6 3h9l4 4v14H6zm8 0v5h5M9 12h7m-7 4h7"/>',
  sync: '<path d="M20 10a8 8 0 0 0-14-4L3 9m0-5v5h5m-4 5a8 8 0 0 0 14 4l3-3m0 5v-5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  milk: '<path d="M12 3c2.5 4 7 8.6 7 12a7 7 0 0 1-14 0c0-3.4 4.5-8 7-12Zm-4 12a4 4 0 0 0 4 4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert: '<path d="M10.2 4.7 2.6 18a1.5 1.5 0 0 0 1.3 2.2h16.2a1.5 1.5 0 0 0 1.3-2.2L13.8 4.7a2.1 2.1 0 0 0-3.6 0ZM12 9v4m0 3h.01"/>',
  pin: '<path d="M19 10c0 5-7 10-7 10s-7-5-7-10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
};


defineProps({ name: String });
</script>

<template>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="shapes[name]" />
</template>
