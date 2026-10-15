import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * `base: './'` is the whole reason the app works under ingress.
 *
 * Home Assistant gives each session a prefix like /api/hassio_ingress/<token>/
 * and strips it before proxying, so the server only ever sees "/". Absolute
 * asset URLs would therefore be requested from the Home Assistant root and
 * 404. Relative URLs resolve against the <base href> the server injects from
 * the X-Ingress-Path header instead.
 *
 * The same applies to every fetch in the app: see lib/api.ts.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Textures are large and cache well; keep them as files rather than
    // inlining them into the CSS as base64.
    assetsInlineLimit: 4096,
  },
  server: {
    port: 5173,
    proxy: {
      // On a laptop the client and server are separate processes; in the
      // add-on they are the same one, so this only applies to `npm run dev`.
      '/api': { target: 'http://127.0.0.1:8099', changeOrigin: true },
    },
  },
});
