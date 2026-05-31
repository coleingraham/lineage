import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // sql.js (browser dev fallback) loads its wasm from /sql-wasm.wasm; the file
  // is copied into public/ so Vite serves it at the root.
  optimizeDeps: {
    exclude: ['@capacitor-community/sqlite'],
  },
});
