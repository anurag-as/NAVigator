import { defineConfig } from 'vite'

export default defineConfig({
  base: '/NAVigator/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
  },
})
