import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'

// after the build: dist/sw.js, the service worker (sw.template.js) with the list of the app's files and a version that
// changes with any of them (the start page's showcase pictures and videos stay out: the app does not use them)
function offline() {
  let out
  return {
    name: 'slidecko-offline',
    apply: 'build',
    configResolved: c => { out = c.build.outDir },
    closeBundle() {
      const files = readdirSync(out, { recursive: true, withFileTypes: true }).filter(d => d.isFile())
        .map(d => relative(out, join(d.parentPath ?? d.path, d.name)).split(sep).join('/'))
        .filter(f => !f.startsWith('showcase/') && f !== 'sw.js' && !f.endsWith('.map')).sort()
      const hash = createHash('sha256')
      for (const f of files) hash.update(f).update(f.startsWith('assets/') ? '' : readFileSync(join(out, f))) // hashed names say it all
      const sw = readFileSync('sw.template.js', 'utf8').replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12))).replace('__FILES__', JSON.stringify(files))
      writeFileSync(join(out, 'sw.js'), sw)
    },
  }
}

// relative base: dist/ can be hosted as static files under any path
export default defineConfig({
  base: './',
  plugins: [vue(), offline()],
})
