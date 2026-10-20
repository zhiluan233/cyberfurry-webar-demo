import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'public',
    assetsDir: 'assets/app',
    copyPublicDir: false,
    emptyOutDir: false,
  },
  server: {
    host: true,
    port: 5173,
  },
});
