import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only proxy so `npm run dev` can hit the backend on :3000 without CORS
// headaches. Production serves the built files directly from the backend
// (see server/src/index.js), so this block doesn't apply there.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
