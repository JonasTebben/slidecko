<script setup>
// the font choices of a <select>: system stacks, bundled fonts, the project's own, each shown in its face
import { computed } from 'vue'
import { FONTS } from '../slide/themes.js'
import { t } from '../core/i18n.js'

const props = defineProps({ stacks: Boolean, upload: Boolean }) // stacks: values are CSS stacks (theme editor), not keys; upload: offer "Add font …"
const GROUPS = [[undefined, 'System fonts'], ['bundled', 'Included fonts'], ['own', 'Project fonts']]
const groups = computed(() => GROUPS.map(([g, label]) => [label, Object.entries(FONTS).filter(([, f]) => f[2] === g)]).filter(([, list]) => list.length))
</script>

<template>
  <optgroup v-for="[label, list] in groups" :key="label" :label="t(label)">
    <option v-for="[k, f] in list" :key="k" :value="props.stacks ? f[1] : k" :style="{ fontFamily: f[1] }">{{ f[2] ? f[0] : t(f[0]) }}</option>
  </optgroup>
  <option v-if="upload" value="+">{{ t('Add font file …') }}</option>
</template>
