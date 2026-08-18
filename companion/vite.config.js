import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: '/companion/' matches the subpath server/src/index.js serves this
// app's build from in production, so built asset URLs resolve correctly.
export default defineConfig({
  base: '/companion/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
});
