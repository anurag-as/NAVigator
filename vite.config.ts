import { defineConfig } from 'vite'

export default defineConfig({
  base: '/navigator/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
