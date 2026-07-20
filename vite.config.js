import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: [{ find: '@', replacement: './src' }]
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: process.env.MEDICAL_API_PROXY_TARGET || 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
});
