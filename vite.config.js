import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: 'https://davidbisky.io.vn/',
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: "./src"
      }
    ],
  },
  server: {
    port: 3000,
    open: true
  }
}) 