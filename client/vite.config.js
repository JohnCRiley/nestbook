import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // App is served at /app/ in both dev and production.
  // Dev:  http://localhost:5173/app/
  // Prod: https://nestbook.io/app/
  base: '/app/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
