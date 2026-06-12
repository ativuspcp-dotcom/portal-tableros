import { defineConfig } from 'vite';
import dns from 'dns';

// Fix Node.js IPv6 DNS resolution bug that causes 5-8s delay on the first proxy request
dns.setDefaultResultOrder('ipv4first');

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
