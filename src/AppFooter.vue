<script setup>
import { t, lang, LOCALES } from './i18n.js'
import { SUPPORT_URL } from './support.js'
</script>

<template>
  <footer class="app-foot">
    <a href="https://slidecko.tebben.dev" target="_blank" rel="noopener">Slidecko</a> {{ t('ist ein kostenloses Tool von') }}
    <a href="https://tebben.dev" target="_blank" rel="noopener">Jonas Tebben</a><template v-if="SUPPORT_URL"> · <a :href="SUPPORT_URL" target="_blank" rel="noopener">☕ {{ t('Gefällt’s dir? Spendier mir einen Kaffee') }}</a></template>
    · <a href="https://jonas-tebben.de/legal-notice/" target="_blank" rel="noopener">{{ t('Impressum') }}</a>
    · <a href="../datenschutz.html" target="_blank" rel="noopener">{{ t('Datenschutz') }}</a>
    · <select v-model="lang" class="lang" :aria-label="t('Sprache')">
      <option v-for="(l, code) in LOCALES" :key="code" :value="code">{{ l.name }}</option>
    </select>
  </footer>
</template>
