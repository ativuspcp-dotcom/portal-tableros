import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'https://tableros.ngrok.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  }
});
