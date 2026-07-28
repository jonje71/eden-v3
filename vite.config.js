import { defineConfig } from 'vite';

export default defineConfig({
  // Build output directory
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Chunk large dependencies for better caching
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          xlsx: ['xlsx'],
          dexie: ['dexie'],
          qrcode: ['qrcode'],
        },
      },
    },
  },
  // Makes VITE_* env vars available in the browser
  envPrefix: 'VITE_',
});
