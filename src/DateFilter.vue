<script setup>
const date = defineModel({ type: String, required: true });
</script>

<template>
  <div class="date-form">
    <label for="date-filter">Data</label>
    <input id="date-filter" type="date" :value="date" @change="date = $event.target.value || date; $event.target.value = date">
  </div>
</template>
