import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// relative base: dist/ can be hosted as static files under any path
export default defineConfig({
  base: './',
  plugins: [vue()],
})
