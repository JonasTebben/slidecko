<script>
import { reactive } from 'vue'
// closed sections, shared by all and kept while the selection changes (per session, not stored)
const closed = reactive(new Set(['effects', 'tips']))
</script>

<script setup>
import Icon from './Icon.vue'
defineProps({ id: String, icon: String, title: String })
</script>

<template>
  <section>
    <button type="button" class="sec-head" :aria-expanded="!closed.has(id)" @click="closed.has(id) ? closed.delete(id) : closed.add(id)">
      <Icon :name="icon" :size="16" /><span><slot name="title">{{ title }}</slot></span><Icon name="chevron" :size="14" class="sec-chev" />
    </button>
    <div v-show="!closed.has(id)" class="sec-body"><slot /></div>
  </section>
</template>
