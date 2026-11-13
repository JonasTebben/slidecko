<script setup>
import { t, lang, LOCALES } from './i18n.js'
import { scheme, SCHEMES, isDark } from './scheme.js'
import Icon from './Icon.vue'
import { SUPPORT_URL } from './support.js'
</script>

<template>
  <footer class="app-foot">
    <a href="../" target="_blank" rel="noopener">Slidecko</a> {{ t('ist ein kostenloses Tool von') }}
    <a href="https://tebben.dev" target="_blank" rel="noopener">Jonas Tebben</a><template v-if="SUPPORT_URL"> · <a :href="SUPPORT_URL" target="_blank" rel="noopener">☕ {{ t('Gefällt’s dir? Spendier mir einen Kaffee') }}</a></template>
    · <a href="../legal.html#impressum" target="_blank" rel="noopener">{{ t('Impressum') }}</a>
    · <a href="../legal.html#privacy" target="_blank" rel="noopener">{{ t('Datenschutz') }}</a>
    · <select v-model="lang" class="lang" :aria-label="t('Sprache')">
      <option v-for="(l, code) in LOCALES" :key="code" :value="code">{{ l.name }}</option>
    </select>
    · <label class="scheme-pick" :title="t('Darstellung')"><Icon :name="isDark ? 'moon' : 'sun'" :size="14" /><select v-model="scheme" class="scheme" :aria-label="t('Darstellung')">
      <option v-for="[id, name] in SCHEMES" :key="id" :value="id">{{ t(name) }}</option>
    </select></label>
  </footer>
</template>
