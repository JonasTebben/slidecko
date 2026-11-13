<script setup>
import { t, lang, LOCALES } from './i18n.js'
import { scheme, SCHEMES, isDark } from './scheme.js'
import Icon from './Icon.vue'
import { SUPPORT_URL, HOME_URL, LEGAL_URL, PRIVACY_URL } from './support.js'
</script>

<template>
  <footer class="app-foot">
    <a :href="HOME_URL" target="_blank" rel="noopener">Slidecko</a> {{ t('is a free tool by') }}
    <a href="https://jonas-tebben.de" target="_blank" rel="noopener">Jonas Tebben</a><template v-if="SUPPORT_URL"> · <a :href="SUPPORT_URL" target="_blank" rel="noopener">☕ {{ t('Like it? Buy me a coffee') }}</a></template>
    <template v-if="LEGAL_URL"> · <a :href="LEGAL_URL" target="_blank" rel="noopener">{{ t('Legal notice') }}</a></template>
    <template v-if="PRIVACY_URL"> · <a :href="PRIVACY_URL" target="_blank" rel="noopener">{{ t('Privacy') }}</a></template>
    · <select v-model="lang" class="lang" :aria-label="t('Language')">
      <option v-for="(l, code) in LOCALES" :key="code" :value="code">{{ l.name }}</option>
    </select>
    · <label class="scheme-pick" :title="t('Appearance')"><Icon :name="isDark ? 'moon' : 'sun'" :size="14" /><select v-model="scheme" class="scheme" :aria-label="t('Appearance')">
      <option v-for="[id, name] in SCHEMES" :key="id" :value="id">{{ t(name) }}</option>
    </select></label>
  </footer>
</template>
