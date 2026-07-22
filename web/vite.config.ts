import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5175,
    // Proxy al backend: el front llama /api/* y Vite lo reenvía a Express.
    proxy: { '/api': 'http://localhost:3100' },
  },
  preview: {
    port: 5176,
    proxy: { '/api': 'http://localhost:3100' },
  },
});
