import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    proxy: {
      '/api': `http://localhost:${process.env.VITE_BACKEND_PORT ?? '3000'}`,
    },
  },
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
  },
});
