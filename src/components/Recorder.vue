<script setup>
// recording the talk (Slidev's camera + screen recording): this tab as a screen share, or the camera alone; nothing leaves the device
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import { t } from '../core/i18n.js'
import { deck } from '../core/store.js'
import { download, toast } from '../core/actions.js'
import { pickMime, recordingName, clock, capturing } from '../present/recording.js'

const KEY = 'slides-builder:recording' // last choices: source, devices, camera bubble
const md = navigator.mediaDevices
const canScreen = !!md?.getDisplayMedia // phones have no screen sharing: camera only
const settings = reactive({ source: 'screen', mic: true, micId: '', cam: false, camId: '', size: 180, x: 0, y: 1 })
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY))) } catch {}
if (!canScreen) settings.source = 'camera'
watch(settings, v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} })

const dlg = ref(), error = ref(''), devices = ref([]), armed = ref(false)
const mics = computed(() => devices.value.filter(d => d.kind === 'audioinput'))
const cams = computed(() => devices.value.filter(d => d.kind === 'videoinput'))
const listDevices = async () => { try { devices.value = (await md.enumerateDevices()).filter(d => d.deviceId) } catch {} }
const pick = id => id ? { deviceId: { exact: id } } : true

function problem(e, what) {
  if (!md || !window.MediaRecorder) return t('This browser cannot record here. Recording needs a current browser and a secure (https) address.')
  if (e?.name === 'NotAllowedError') return what === 'screen' ? t('Screen sharing was cancelled or not allowed.') : t('Access to the camera or microphone is blocked. Allow it in the browser’s site settings and try again.')
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return t('No camera or microphone found. Check that it is connected, or choose another one.')
  if (e?.name === 'NotReadableError') return t('The camera or microphone is in use by another app.')
  return t('Recording could not start: {0}', e?.message || e)
}

// the camera bubble: live as soon as the dialog was opened once with the camera on, so the speaker sees it while presenting
const cam = ref(null)
const stopAll = s => s?.getTracks().forEach(x => x.stop())
watch(() => [armed.value, settings.cam, settings.camId], async () => {
  stopAll(cam.value); cam.value = null
  if (!armed.value || !settings.cam) return
  try { cam.value = await md.getUserMedia({ video: pick(settings.camId) }); listDevices() } catch (e) { error.value = problem(e, 'camera'); settings.cam = false }
})
const bubble = computed(() => ({ width: settings.size + 'px', height: settings.size + 'px', left: `calc(16px + ${settings.x} * (100vw - ${settings.size + 32}px))`, top: `calc(16px + ${settings.y} * (100dvh - ${settings.size + 32}px))` }))
let drag = null
function dragDown(e) {
  e.currentTarget.setPointerCapture(e.pointerId)
  const r = e.currentTarget.getBoundingClientRect()
  drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }
}
function dragMove(e) {
  if (!drag) return
  const f = (v, max) => Math.min(1, Math.max(0, (v - 16) / Math.max(1, max - settings.size - 32)))
  settings.x = f(e.clientX - drag.dx, innerWidth)
  settings.y = f(e.clientY - drag.dy, innerHeight)
}
const CORNERS = [['Top left', 0, 0], ['Top right', 1, 0], ['Bottom left', 0, 1], ['Bottom right', 1, 1]]

// --- the recording ---
const state = ref('') // '' | 'recording' | 'paused'
const now = ref(0)
let rec = null, chunks = [], streams = [], began = null, done = 0, since = 0, tick = 0
const time = computed(() => clock(done + (state.value === 'recording' ? now.value - since : 0)))

async function start() {
  error.value = ''
  capturing.on = true
  let what = 'screen'
  try {
    if (!md || !window.MediaRecorder) throw null
    const tracks = []
    if (settings.source === 'screen') {
      // this tab, so the slides, the drawing and the camera bubble are in the video (the browser asks which tab to share)
      const screen = await md.getDisplayMedia({ video: { displaySurface: 'browser', frameRate: 30 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' })
      streams.push(screen)
      tracks.push(...screen.getVideoTracks())
      screen.getVideoTracks()[0].onended = stop // "Stop sharing" in the browser ends and saves the recording
    } else {
      what = 'camera'
      const c = cam.value || await md.getUserMedia({ video: pick(settings.camId) }) // the bubble's stream, unless it is still starting
      if (c !== cam.value) streams.push(c)
      tracks.push(...c.getVideoTracks())
    }
    what = 'mic'
    if (settings.mic) { const m = await md.getUserMedia({ audio: pick(settings.micId) }); streams.push(m); tracks.push(...m.getAudioTracks()) }
    const mime = pickMime(m => MediaRecorder.isTypeSupported(m))
    rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : {})
    chunks = []
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = save
    rec.start(1000) // a chunk a second, kept in memory until the file is saved
    began = new Date(); done = 0; since = now.value = Date.now()
    tick = setInterval(() => { now.value = Date.now() }, 500)
    state.value = 'recording'
    dlg.value.close()
    listDevices()
  } catch (e) {
    cleanup()
    error.value = problem(e, what)
  }
}
function pause() {
  if (state.value === 'recording') { rec.pause(); done += Date.now() - since; state.value = 'paused' }
  else { rec.resume(); since = now.value = Date.now(); state.value = 'recording' }
}
function stop() { if (rec && rec.state !== 'inactive') rec.stop() }
function save() {
  const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' })
  const name = recordingName(deck.title, began, blob.type)
  cleanup()
  if (blob.size) { download(blob, name); toast(t('Recording saved: {0}', name)) }
}
function cleanup() {
  capturing.on = false
  clearInterval(tick)
  streams.forEach(stopAll); streams = []
  rec = null; chunks = []; state.value = ''
}

async function open() {
  error.value = ''
  armed.value = true
  dlg.value.showModal()
  await listDevices()
}
// the presentation ended: the recording so far is saved, camera and microphone are let go
onBeforeUnmount(() => { stop(); stopAll(cam.value) })
defineExpose({ open, state })
</script>

<template>
  <button v-if="!state" class="tb icon small" :title="t('Record')" :aria-label="t('Record')" @click.stop="open"><Icon name="record" :size="16" /></button>
  <template v-else>
    <span class="rec-time" role="status" :title="state === 'paused' ? t('Recording paused') : t('Recording')"><i class="rec-dot" :class="{ paused: state === 'paused' }" aria-hidden="true" />{{ time }}</span>
    <button class="tb icon small" :title="state === 'paused' ? t('Resume recording') : t('Pause recording')" :aria-label="state === 'paused' ? t('Resume recording') : t('Pause recording')" @click.stop="pause"><Icon :name="state === 'paused' ? 'record' : 'pause'" :size="16" /></button>
    <button class="tb icon small" :title="t('Stop recording and save')" :aria-label="t('Stop recording and save')" @click.stop="stop"><Icon name="stop" :size="16" /></button>
  </template>
  <!-- in the presenter, not the bar: the bar fades out, and the bubble must be in the shared tab -->
  <Teleport defer to=".presenter">
    <div v-if="cam && settings.cam" class="rec-bubble" :style="bubble" aria-hidden="true" @pointerdown.stop="dragDown" @pointermove="dragMove" @pointerup="drag = null" @pointercancel="drag = null" @click.stop>
      <video :srcObject="cam" autoplay muted playsinline />
    </div>
    <dialog ref="dlg" class="rec-dlg" :aria-label="t('Record the presentation')" @keydown.stop @click.stop>
      <h2>{{ t('Record the presentation') }}</h2>
      <p>{{ t('The video is saved as a file on this device. Nothing is uploaded.') }}</p>
      <fieldset>
        <legend>{{ t('Record') }}</legend>
        <label class="check"><input v-model="settings.source" type="radio" value="screen" :disabled="!canScreen" /> {{ t('The presentation (share this tab)') }}</label>
        <label class="check"><input v-model="settings.source" type="radio" value="camera" /> {{ t('Only the camera') }}</label>
        <small v-if="settings.source === 'camera' && !settings.cam">{{ t('Switch the camera on to record it.') }}</small>
        <small v-if="!canScreen">{{ t('This browser cannot share the screen, so only the camera can be recorded.') }}</small>
      </fieldset>
      <div class="rec-dev">
        <label class="check"><input v-model="settings.mic" type="checkbox" /> {{ t('Microphone') }}</label>
        <select v-model="settings.micId" :disabled="!settings.mic" :aria-label="t('Microphone')"><option value="">{{ t('Default') }}</option><option v-for="(d, i) in mics" :key="d.deviceId" :value="d.deviceId">{{ d.label || t('Microphone {0}', i + 1) }}</option></select>
        <label class="check"><input v-model="settings.cam" type="checkbox" /> {{ t('Camera') }}</label>
        <select v-model="settings.camId" :disabled="!settings.cam" :aria-label="t('Camera')"><option value="">{{ t('Default') }}</option><option v-for="(d, i) in cams" :key="d.deviceId" :value="d.deviceId">{{ d.label || t('Camera {0}', i + 1) }}</option></select>
      </div>
      <fieldset v-if="settings.cam">
        <legend>{{ t('Camera bubble (drag it on the slide)') }}</legend>
        <div class="rec-row" role="group" :aria-label="t('Size')">
          <button v-for="[n, s] in [['Small', 120], ['Medium', 180], ['Large', 260]]" :key="s" type="button" class="tb small" :class="{ on: settings.size === s }" :aria-pressed="settings.size === s" @click="settings.size = s">{{ t(n) }}</button>
        </div>
        <div class="rec-row" role="group" :aria-label="t('Corner')">
          <button v-for="[n, x, y] in CORNERS" :key="n" type="button" class="tb small" :class="{ on: settings.x === x && settings.y === y }" :aria-pressed="settings.x === x && settings.y === y" @click="Object.assign(settings, { x, y })">{{ t(n) }}</button>
        </div>
      </fieldset>
      <p v-if="error" class="rec-error" role="alert">{{ error }}</p>
      <menu>
        <button type="button" @click="dlg.close()">{{ t('Cancel') }}</button>
        <button type="button" class="primary" :disabled="settings.source === 'camera' && !settings.cam" @click="start"><Icon name="record" :size="14" /> {{ t('Start recording') }}</button>
      </menu>
    </dialog>
  </Teleport>
</template>
