import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: 'public',
  server: {
    port: 5173,
    proxy: {
      '/api': {target: 'http://127.0.0.1:8787',changeOrigin: true},
      '/ws': {target: 'ws://127.0.0.1:8787',ws: true,changeOrigin: true}
    }
  },
  build: {outDir: 'dist', emptyOutDir: true},
});
