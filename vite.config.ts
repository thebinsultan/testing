import { defineConfig } from 'vite';

export default defineConfig({
  // Static SPA — Vercel serves `dist` directly (see vercel.json).
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    // Allow the sandbox preview host (and any other proxy) to reach the dev server.
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
});
